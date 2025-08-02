import { log, withErrno } from 'kerium';
import { offsetof, sizeof } from 'memium';
import { $from, field, struct, types as t } from 'memium/decorators';
import { memoize } from 'utilium';
import { BufferView } from 'utilium/buffer.js';
import { Directory } from './Directory.js';
import { SLComponentFlags } from './SLComponentRecord.js';
import type { SystemUseEntry } from './entries.js';
import { CLEntry, NMEntry, NMFlags, SLEntry, constructSystemUseEntries } from './entries.js';
import { FileFlags, ShortFormDate } from './misc.js';

@struct.packed('DirectoryRecord')
export class DirectoryRecord<T extends ArrayBufferLike = ArrayBufferLike> extends $from(BufferView)<T> {
	/**
	 * @internal
	 */
	_kind?: string;

	public rockRidgeOffset: number = -1;

	public get hasRockRidge(): boolean {
		return this.rockRidgeOffset > -1;
	}

	@t.uint8 public accessor length!: number;

	@t.uint8 public accessor extendedAttributeRecordLength!: number;

	@t.uint32 protected accessor _lba!: number;
	@t.uint32 protected accessor _lbaBE!: number;

	public get lba(): number {
		return this._lba * 2048;
	}

	public set lba(value: number) {
		if (!Number.isInteger(value / 2048)) {
			throw withErrno('EINVAL', 'Invalid LBA value');
		}
		this._lba = value / 2048;
	}

	@t.uint32 public accessor dataLength!: number;
	@t.uint32 protected accessor dataLengthBE!: number;

	@field(ShortFormDate) protected accessor date!: ShortFormDate;

	public get recordingDate(): Date {
		return this.date.date;
	}

	@t.uint8 public accessor fileFlags!: number;

	@t.uint8 public accessor fileUnitSize!: number;

	@t.uint8 public accessor interleaveGapSize!: number;

	@t.uint16 public accessor volumeSequenceNumber!: number;
	@t.uint16 protected accessor volumeSequenceNumberBE!: number;

	@t.uint8 protected accessor identifierLength!: number;

	@t.char(0, { countedBy: 'identifierLength' }) protected accessor _identifier!: Uint8Array;

	public get identifier(): string {
		return this._decode(new Uint8Array(this.buffer, this.byteOffset + offsetof(this, '_identifier'), this.identifierLength));
	}

	@memoize
	public get fileName(): string {
		if (this._rockRidgeFilename) return this._rockRidgeFilename;

		if (this.isDirectory()) return this.identifier;

		// Files:
		// - MUST have 0x2E (.) separating the name from the extension
		// - MUST have 0x3B (;) separating the file name and extension from the version
		// Gets expanded to two-byte char in Unicode directory records.
		const versionSeparator = this.identifier.indexOf(';');

		// Some Joliet filenames lack the version separator, despite the standard specifying that it should be there.
		if (versionSeparator === -1) return this.identifier;

		// Empty extension. Do not include '.' in the filename.
		if (this.identifier.at(-1) === '.') return this.identifier.slice(0, versionSeparator - 1);

		// Include up to version separator.
		return this.identifier.slice(0, versionSeparator);
	}

	public isDirectory(): boolean {
		let rv = !!(this.fileFlags & FileFlags.Directory);
		// If it lacks the Directory flag, it may still be a directory if we've exceeded the directory
		// depth limit. Rock Ridge marks these as files and adds a special attribute.
		if (!rv && this.hasRockRidge) rv = this.suEntries.filter(e => e instanceof CLEntry).length > 0;
		return rv;
	}

	@memoize
	public get isSymlink(): boolean {
		return this.hasRockRidge && this.suEntries.filter(e => e instanceof SLEntry).length > 0;
	}

	/**
	 * @todo Use a `switch` when checking flags?
	 */
	@memoize
	public get symlinkPath(): string {
		let path = '';
		for (const entry of this.suEntries) {
			if (!(entry instanceof SLEntry)) continue;

			const components = entry.componentRecords;
			for (const component of components) {
				const flags = component.flags;
				if (flags & SLComponentFlags.CURRENT) {
					path += './';
				} else if (flags & SLComponentFlags.PARENT) {
					path += '../';
				} else if (flags & SLComponentFlags.ROOT) {
					path += '/';
				} else {
					path += component.content(this._decode);
					if (!(flags & SLComponentFlags.CONTINUE)) {
						path += '/';
					}
				}
			}
			// We are done with this link.

			if (!entry.continueFlag) break;
		}

		return path.endsWith('/') ? path.slice(0, -1) : path;
	}

	@memoize
	public get file(): Uint8Array {
		if (!this.buffer) throw log.err(withErrno('ENODATA'));
		if (this.isDirectory()) throw log.err(withErrno('EISDIR'));
		return new Uint8Array(this.buffer, this.lba, this.dataLength);
	}

	@memoize
	public get directory(): Directory {
		if (!this.buffer) throw log.err(withErrno('ENODATA'));
		if (!this.isDirectory()) throw log.err(withErrno('ENOTDIR'));
		return new Directory(this);
	}

	@memoize
	public get suEntries(): SystemUseEntry[] {
		if (!this.buffer) throw log.err(withErrno('ENODATA'));
		let i = sizeof(this as any);
		if (i % 2 === 1) i++; // Skip padding fields.
		i += this.rockRidgeOffset;
		return constructSystemUseEntries(this.buffer, i, BigInt(this.length));
	}

	@memoize
	protected get string(): string {
		if (!this.buffer) throw log.err(withErrno('ENODATA'));
		return this._decode(new Uint8Array(this.buffer, this.byteOffset));
	}

	private _decoder?: TextDecoder;

	protected get _decode() {
		this._decoder ||= new TextDecoder(this._kind == 'Joliet' ? 'utf-16be' : 'utf-8');
		return (data: Uint8Array) => this._decoder!.decode(data).toLowerCase();
	}

	@memoize
	protected get _rockRidgeFilename(): string | null {
		if (!this.hasRockRidge) return null;
		const nmEntries = this.suEntries.filter(e => e instanceof NMEntry);
		if (!nmEntries.length || nmEntries[0].flags & (NMFlags.CURRENT | NMFlags.PARENT)) return null;

		let str = '';
		for (const e of nmEntries) {
			str += e.name(this._decode);
			if (!(e.flags & NMFlags.CONTINUE)) break;
		}
		return str;
	}
}
