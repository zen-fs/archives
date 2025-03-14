import { Errno, ErrnoError, log } from '@zenfs/core';
import { deserialize, member, memoize, sizeof, struct, types as t } from 'utilium';
import { Directory } from './Directory.js';
import { SLComponentFlags } from './SLComponentRecord.js';
import type { SystemUseEntry } from './entries.js';
import { CLEntry, NMEntry, NMFlags, SLEntry, constructSystemUseEntries } from './entries.js';
import { ShortFormDate, FileFlags } from './misc.js';

@struct()
export class DirectoryRecord {
	protected _view?: DataView;

	/**
	 * @internal
	 */
	_kind?: string;

	public constructor(
		public readonly buffer?: ArrayBufferLike,
		public readonly byteOffset?: number,
		/**
		 * Offset at which system use entries begin. Set to -1 if not enabled.
		 * @internal
		 */
		public rockRidgeOffset: number = -1
	) {
		if (buffer && byteOffset) {
			deserialize(this, new Uint8Array(buffer, byteOffset));
			this._view = new DataView(buffer);
		}
	}

	public get hasRockRidge(): boolean {
		return this.rockRidgeOffset > -1;
	}

	@t.uint8 public length!: number;

	@t.uint8 public extendedAttributeRecordLength!: number;

	@t.uint32 protected _lba!: number;
	@t.uint32 protected _lbaBE!: number;

	public get lba(): number {
		return this._lba * 2048;
	}

	public set lba(value: number) {
		if (!Number.isInteger(value / 2048)) {
			throw new ErrnoError(Errno.EINVAL, 'Invalid LBA value');
		}
		this._lba = value / 2048;
	}

	@t.uint32 public dataLength!: number;
	@t.uint32 protected dataLengthBE!: number;

	@member(ShortFormDate) protected date: ShortFormDate = new ShortFormDate();

	public get recordingDate(): Date {
		return this.date.date;
	}

	@t.uint8 public fileFlags!: number;

	@t.uint8 public fileUnitSize!: number;

	@t.uint8 public interleaveGapSize!: number;

	@t.uint16 public volumeSequenceNumber!: number;
	@t.uint16 protected volumeSequenceNumberBE!: number;

	@t.uint8 protected identifierLength!: number;

	@t.char('identifierLength') protected _identifier = new Uint8Array(256); // Reasonable upper limit?

	public get identifier(): string {
		return this._decode(this._identifier.slice(0, this.identifierLength));
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
		if (!this.buffer) throw log.err(ErrnoError.With('ENODATA', undefined, 'read'));
		if (this.isDirectory()) throw log.err(ErrnoError.With('EISDIR', undefined, 'read'));
		return new Uint8Array(this.buffer, this.lba, this.dataLength);
	}

	@memoize
	public get directory(): Directory {
		if (!this.buffer) throw log.err(ErrnoError.With('ENODATA', undefined, 'read'));
		if (!this.isDirectory()) throw log.err(ErrnoError.With('ENOTDIR', undefined, 'read'));
		return new Directory(this);
	}

	@memoize
	public get suEntries(): SystemUseEntry[] {
		if (!this.buffer) throw log.err(ErrnoError.With('ENODATA', undefined, 'read'));
		let i = sizeof(this as any);
		if (i % 2 === 1) i++; // Skip padding fields.
		i += this.rockRidgeOffset;
		return constructSystemUseEntries(this.buffer, i, BigInt(this.length));
	}

	@memoize
	protected get string(): string {
		if (!this.buffer) throw log.err(ErrnoError.With('ENODATA', undefined, 'read'));
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
