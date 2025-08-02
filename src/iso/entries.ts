import { sizeof } from 'memium';
import { struct, types as t } from 'memium/decorators';
import { decodeUTF8, type Tuple } from 'utilium';
import { BufferView } from 'utilium/buffer.js';
import { SLComponentRecord } from './SLComponentRecord.js';
import { LongFormDate, ShortFormDate } from './misc.js';

export const enum EntrySignature {
	CE = 0x4345,
	PD = 0x5044,
	SP = 0x5350,
	ST = 0x5354,
	ER = 0x4552,
	ES = 0x4553,
	PX = 0x5058,
	PN = 0x504e,
	SL = 0x534c,
	NM = 0x4e4d,
	CL = 0x434c,
	PL = 0x504c,
	RE = 0x5245,
	TF = 0x5446,
	SF = 0x5346,
	RR = 0x5252,
}

/**
 * Note, GNU ISO is used for reference.
 * @see https://git.savannah.gnu.org/cgit/libcdio.git/tree/include/cdio/rock.h
 */

/**
 * Base system use entry
 */
@struct.packed('SystemUseEntry')
export class SystemUseEntry extends BufferView {
	@t.uint16 public accessor signature!: EntrySignature;

	public get signatureString(): string {
		return decodeUTF8(new Uint8Array(this.buffer, this.byteOffset, 2));
	}

	@t.uint8 public accessor length!: number;

	@t.uint8 public accessor suVersion!: number;
}

/**
 * Continuation entry.
 */
@struct.packed('CEEntry')
export class CEEntry extends SystemUseEntry {
	protected _entries: SystemUseEntry[] = [];

	/**
	 * Logical block address of the continuation area.
	 */
	@t.uint64 public accessor extent!: bigint;

	/**
	 * Offset into the logical block.
	 */
	@t.uint64 public accessor offset!: bigint;

	/**
	 * Length of the continuation area.
	 */
	@t.uint64 public accessor size!: bigint;

	public entries(): SystemUseEntry[] {
		this._entries ||= constructSystemUseEntries(this.buffer, Number(this.extent * 2048n + this.offset), this.size);
		return this._entries;
	}
}

/**
 * Padding entry.
 */
@struct.packed('PDEntry')
export class PDEntry extends SystemUseEntry {}

/**
 * Identifies that SUSP is in-use.
 */
@struct.packed('SPEntry')
export class SPEntry extends SystemUseEntry {
	@t.uint8(2) public accessor magic!: Tuple<number, 2>;

	public checkMagic(): boolean {
		return this.magic[0] == 190 && this.magic[1] == 239;
	}

	@t.uint8 public accessor skip!: number;
}

/**
 * Identifies the end of the SUSP entries.
 */
@struct.packed('STEntry')
export class STEntry extends SystemUseEntry {}

/**
 * Specifies system-specific extensions to SUSP.
 */
@struct.packed('EREntry')
export class EREntry extends SystemUseEntry {
	@t.uint8 public accessor idLength!: number;

	@t.uint8 public accessor descriptorLength!: number;

	@t.uint8 public accessor sourceLength!: number;

	@t.uint8 public accessor extensionVersion!: number;

	public get extensionIdentifier(): string {
		return decodeUTF8(new Uint8Array(this.buffer, this.byteOffset + 8, this.idLength));
	}

	public get extensionDescriptor(): string {
		return decodeUTF8(new Uint8Array(this.buffer, this.byteOffset + 8 + this.idLength, this.descriptorLength));
	}

	public get extensionSource(): string {
		return decodeUTF8(new Uint8Array(this.buffer, 8 + this.idLength + this.descriptorLength, this.sourceLength));
	}
}

@struct.packed('ESEntry')
export class ESEntry extends SystemUseEntry {
	@t.uint8 public accessor extensionSequence!: number;
}

/**
 * RockRidge: Marks that RockRidge is in use
 * Note: Deprecated in the spec
 */
@struct.packed('RREntry')
export class RREntry extends SystemUseEntry {}

/**
 * RockRidge: Records POSIX file attributes.
 */
@struct.packed('PXEntry')
export class PXEntry extends SystemUseEntry {
	@t.uint64 public accessor mode!: bigint;

	@t.uint64 public accessor nlinks!: bigint;

	@t.uint64 public accessor uid!: bigint;

	@t.uint64 public accessor gid!: bigint;

	@t.uint64 public accessor inode!: bigint;
}

/**
 * RockRidge: Records POSIX device number.
 */
@struct.packed('PNEntry')
export class PNEntry extends SystemUseEntry {
	@t.uint64 public accessor dev_high!: bigint;

	@t.uint64 public accessor dev_low!: bigint;
}

/**
 * RockRidge: Records symbolic link
 */
@struct.packed('SLEntry')
export class SLEntry extends SystemUseEntry {
	@t.uint8 public accessor flags!: number;

	public get continueFlag(): number {
		return this.flags & 1;
	}

	public get componentRecords(): SLComponentRecord[] {
		const records = [];
		let i = 5;
		while (i < this.length) {
			const record = new SLComponentRecord(this.buffer, this.byteOffset + i);
			records.push(record);
			i += record.length;
		}
		return records;
	}
}

export const enum NMFlags {
	CONTINUE = 1,
	CURRENT = 1 << 1,
	PARENT = 1 << 2,
}

/**
 * RockRidge: Records alternate file name
 */
@struct.packed('NMEntry')
export class NMEntry extends SystemUseEntry {
	@t.uint8 public accessor flags!: NMFlags;

	public name(getString: (data: Uint8Array) => string): string {
		return getString(new Uint8Array(this.buffer, this.byteOffset + 5, this.length));
	}
}

/**
 * RockRidge: Records child link
 */
@struct.packed('CLEntry')
export class CLEntry extends SystemUseEntry {
	@t.uint32 public accessor childDirectoryLba!: number;
}

/**
 * RockRidge: Records parent link.
 */
@struct.packed('PLEntry')
export class PLEntry extends SystemUseEntry {
	@t.uint32 public accessor parentDirectoryLba!: number;
}

/**
 * RockRidge: Records relocated directory.
 */
@struct.packed('REEntry')
export class REEntry extends SystemUseEntry {}

export const enum TFFlag {
	CREATION = 1,
	MODIFY = 1 << 1,
	ACCESS = 1 << 2,
	ATTRIBUTES = 1 << 3,
	BACKUP = 1 << 4,
	EXPIRATION = 1 << 5,
	EFFECTIVE = 1 << 6,
	LONG_FORM = 1 << 7,
}

/**
 * RockRidge: Records file timestamps
 */
@struct.packed('TFEntry')
export class TFEntry extends SystemUseEntry {
	@t.uint8 public accessor flags!: number;

	private _getDate(kind: TFFlag): Date | undefined {
		if (!(this.flags & kind)) {
			return;
		}

		// Count the number of flags set up to but not including `kind`
		let index = 0;
		for (let i = 0; i < kind - 1; i++) {
			index += this.flags & (1 << i) ? 1 : 0;
		}

		const _Date = this.flags & TFFlag.LONG_FORM ? LongFormDate : ShortFormDate;
		const offset = 5 + index * sizeof(_Date);
		const date = new _Date(this.buffer, this.byteOffset + offset, sizeof(_Date));
		return date.date;
	}

	public get creation(): Date | undefined {
		return this._getDate(TFFlag.CREATION);
	}

	public get modify(): Date | undefined {
		return this._getDate(TFFlag.MODIFY);
	}

	public get access(): Date | undefined {
		return this._getDate(TFFlag.ACCESS);
	}

	public get backup(): Date | undefined {
		return this._getDate(TFFlag.BACKUP);
	}

	public get expiration(): Date | undefined {
		return this._getDate(TFFlag.EXPIRATION);
	}

	public get effective(): Date | undefined {
		return this._getDate(TFFlag.EFFECTIVE);
	}
}

/**
 * RockRidge: File data in sparse format.
 */
export class SFEntry extends SystemUseEntry {
	@t.uint64 public accessor virtualSizeHigh!: bigint;

	@t.uint64 public accessor virtualSizeLow!: bigint;

	@t.uint8 public accessor tableDepth!: number;
}

const signatureMap = {
	[EntrySignature.CE]: CEEntry,
	[EntrySignature.PD]: PDEntry,
	[EntrySignature.SP]: SPEntry,
	[EntrySignature.ST]: STEntry,
	[EntrySignature.ER]: EREntry,
	[EntrySignature.ES]: ESEntry,
	[EntrySignature.PX]: PXEntry,
	[EntrySignature.PN]: PNEntry,
	[EntrySignature.SL]: SLEntry,
	[EntrySignature.NM]: NMEntry,
	[EntrySignature.CL]: CLEntry,
	[EntrySignature.PL]: PLEntry,
	[EntrySignature.RE]: REEntry,
	[EntrySignature.TF]: TFEntry,
	[EntrySignature.SF]: SFEntry,
	[EntrySignature.RR]: RREntry,
};

/**
 * @param buffer The iso file
 * @param byteOffset The offset of the directory record
 */
export function constructSystemUseEntries(buffer: ArrayBufferLike, byteOffset: number, length: bigint): SystemUseEntry[] {
	// If the remaining allocated space following the last recorded System Use Entry in a System
	// Use field or Continuation Area is less than four bytes long, it cannot contain a System
	// Use Entry and shall be ignored
	length -= 4n;
	const entries: SystemUseEntry[] = [];

	while (byteOffset < length) {
		const sue = new SystemUseEntry(buffer, byteOffset);

		const entry = sue.signature in signatureMap ? new signatureMap[sue.signature](buffer, byteOffset) : sue;

		const length = entry.length;

		// Invalid SU section; prevent infinite loop.
		if (!length) return entries;

		byteOffset += length;

		// ST indicates the end of entries.
		if (entry instanceof STEntry) break;

		entries.push(...(entry instanceof CEEntry ? entry.entries() : [entry]));
	}

	return entries;
}
