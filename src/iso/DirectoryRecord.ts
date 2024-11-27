import { Errno, ErrnoError } from '@zenfs/core';
import { deserialize, member, struct, types as t } from 'utilium';
import { Directory } from './Directory.js';
import { SLComponentFlags } from './SLComponentRecord.js';
import { FileFlags, rockRidgeIdentifier } from './constants.js';
import type { SystemUseEntry } from './entries.js';
import { CLEntry, EREntry, NMEntry, NMFlags, RREntry, SLEntry, SPEntry, constructSystemUseEntries } from './entries.js';
import { ShortFormDate } from './utils.js';

@struct()
export class DirectoryRecord {
	protected _view: DataView;
	protected _suEntries?: SystemUseEntry[];
	protected _file?: Uint8Array;
	protected _dir?: Directory;

	/**
	 * @internal
	 */
	_kind?: string;

	public constructor(
		protected data: Uint8Array,
		/**
		 * Offset at which system use entries begin. Set to -1 if not enabled.
		 */
		protected _rockRidgeOffset: number
	) {
		deserialize(this, data);
		this._view = new DataView(data.buffer);
	}

	public get hasRockRidge(): boolean {
		return this._rockRidgeOffset > -1;
	}

	public get rockRidgeOffset(): number {
		return this._rockRidgeOffset;
	}

	/**
	 * !!ONLY VALID ON ROOT NODE!!
	 * Checks if Rock Ridge is enabled, and sets the offset.
	 */
	public rootCheckForRockRidge(isoData: Uint8Array): void {
		const dir = this.getDirectory(isoData);
		this._rockRidgeOffset = dir.getDotEntry(isoData)._getRockRidgeOffset(isoData);
		if (this._rockRidgeOffset > -1) {
			// Wipe out directory. Start over with RR knowledge.
			this._dir = undefined;
		}
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

	/**
	 * Variable length, which is not supported by Utilium at the moment
	 */
	@t.char(0) protected _identifier: string = '';

	public get identifier(): string {
		const stringData = this.data.slice(33, 33 + this.identifierLength);
		return this._decode(stringData);
	}

	public fileName(isoData: Uint8Array): string {
		if (this.hasRockRidge) {
			const fn = this._rockRidgeFilename(isoData);
			if (fn != null) {
				return fn;
			}
		}
		const ident = this.identifier;
		if (this.isDirectory(isoData)) {
			return ident;
		}
		// Files:
		// - MUST have 0x2E (.) separating the name from the extension
		// - MUST have 0x3B (;) separating the file name and extension from the version
		// Gets expanded to two-byte char in Unicode directory records.
		const versionSeparator = ident.indexOf(';');
		if (versionSeparator === -1) {
			// Some Joliet filenames lack the version separator, despite the standard specifying that it should be there.
			return ident;
		}
		if (ident[versionSeparator - 1] === '.') {
			// Empty extension. Do not include '.' in the filename.
			return ident.slice(0, versionSeparator - 1);
		}
		// Include up to version separator.
		return ident.slice(0, versionSeparator);
	}

	public isDirectory(isoData: Uint8Array): boolean {
		let rv = !!(this.fileFlags & FileFlags.Directory);
		// If it lacks the Directory flag, it may still be a directory if we've exceeded the directory
		// depth limit. Rock Ridge marks these as files and adds a special attribute.
		if (!rv && this.hasRockRidge) {
			rv = this.getSUEntries(isoData).filter(e => e instanceof CLEntry).length > 0;
		}
		return rv;
	}

	public isSymlink(isoData: Uint8Array): boolean {
		return this.hasRockRidge && this.getSUEntries(isoData).filter(e => e instanceof SLEntry).length > 0;
	}

	public getSymlinkPath(isoData: Uint8Array): string {
		let p = '';
		const entries = this.getSUEntries(isoData);
		for (const entry of entries) {
			if (entry instanceof SLEntry) {
				const components = entry.componentRecords;
				for (const component of components) {
					const flags = component.flags;
					if (flags & SLComponentFlags.CURRENT) {
						p += './';
					} else if (flags & SLComponentFlags.PARENT) {
						p += '@zenfs/core/';
					} else if (flags & SLComponentFlags.ROOT) {
						p += '/';
					} else {
						p += component.content(this._decode);
						if (!(flags & SLComponentFlags.CONTINUE)) {
							p += '/';
						}
					}
				}
				if (!entry.continueFlag) {
					// We are done with this link.
					break;
				}
			}
		}
		if (p.length > 1 && p[p.length - 1] === '/') {
			// Trim trailing '/'.
			return p.slice(0, p.length - 1);
		} else {
			return p;
		}
	}

	public getFile(isoData: Uint8Array): Uint8Array {
		if (this.isDirectory(isoData)) {
			throw new Error('Tried to get a File from a directory.');
		}
		this._file ||= isoData.slice(this.lba, this.lba + this.dataLength);
		return this._file;
	}

	public getDirectory(isoData: Uint8Array): Directory {
		if (!this.isDirectory(isoData)) {
			throw new Error('Tried to get a Directory from a file.');
		}
		this._dir ||= this._constructDirectory(isoData);
		return this._dir;
	}

	public getSUEntries(isoData: Uint8Array): SystemUseEntry[] {
		if (!this._suEntries) {
			this._constructSUEntries(isoData);
		}
		return this._suEntries!;
	}

	protected getString(): string {
		return this._decode(this.data);
	}

	private _decoder?: TextDecoder;

	protected get _decode() {
		this._decoder ||= new TextDecoder(this._kind == 'Joliet' ? 'utf-16be' : 'utf-8');
		return (data: Uint8Array) => this._decoder!.decode(data).toLowerCase();
	}

	protected _constructDirectory(isoData: Uint8Array): Directory {
		return new Directory(this, isoData);
	}

	protected _rockRidgeFilename(isoData: Uint8Array): string | null {
		const nmEntries = this.getSUEntries(isoData).filter(e => e instanceof NMEntry) as NMEntry[];
		if (nmEntries.length === 0 || nmEntries[0].flags & (NMFlags.CURRENT | NMFlags.PARENT)) {
			return null;
		}
		let str = '';
		for (const e of nmEntries) {
			str += e.name(this._decode);
			if (!(e.flags & NMFlags.CONTINUE)) {
				break;
			}
		}
		return str;
	}

	private _constructSUEntries(isoData: Uint8Array): void {
		let i = 33 + this.data[32];
		if (i % 2 === 1) {
			// Skip padding field.
			i++;
		}
		i += this._rockRidgeOffset;
		this._suEntries = constructSystemUseEntries(this.data, i, BigInt(this.length), isoData);
	}

	/**
	 * !!ONLY VALID ON FIRST ENTRY OF ROOT DIRECTORY!!
	 * Returns -1 if rock ridge is not enabled. Otherwise, returns the offset
	 * at which system use fields begin.
	 */
	private _getRockRidgeOffset(isoData: Uint8Array): number {
		// In the worst case, we get some garbage SU entries.
		// Fudge offset to 0 before proceeding.
		this._rockRidgeOffset = 0;
		const suEntries = this.getSUEntries(isoData);
		if (suEntries.length > 0) {
			const spEntry = suEntries[0];
			if (spEntry instanceof SPEntry && spEntry.checkMagic()) {
				// SUSP is in use.
				for (let i = 1; i < suEntries.length; i++) {
					const entry = suEntries[i];
					if (entry instanceof RREntry || (entry instanceof EREntry && entry.extensionIdentifier === rockRidgeIdentifier)) {
						// Rock Ridge is in use!
						return spEntry.skip;
					}
				}
			}
		}
		// Failed.
		this._rockRidgeOffset = -1;
		return -1;
	}
}