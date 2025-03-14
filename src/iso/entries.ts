import { _throw, decodeUTF8, deserialize, sizeof, struct, types as t, type Tuple } from 'utilium';
import { SLComponentRecord } from './SLComponentRecord.js';
import { LongFormDate, ShortFormDate } from './utils.js';

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
export
@struct()
class SystemUseEntry {
	public constructor(protected data: Uint8Array = _throw('Missing data')) {
		deserialize(this, data);
	}

	@t.uint16 public signature!: EntrySignature;

	public get signatureString(): string {
		return decodeUTF8(this.data.slice(0, 2));
	}

	@t.uint8 public length!: number;

	@t.uint8 public suVersion!: number;
}

/**
 * Continuation entry.
 */
@struct()
export class CEEntry extends SystemUseEntry {
	protected _entries: SystemUseEntry[] = [];

	/**
	 * Logical block address of the continuation area.
	 */
	@t.uint64 public extent!: bigint;

	/**
	 * Offset into the logical block.
	 */
	@t.uint64 public offset!: bigint;

	/**
	 * Length of the continuation area.
	 */
	@t.uint64 public size!: bigint;

	public entries(data: Uint8Array): SystemUseEntry[] {
		this._entries ||= constructSystemUseEntries(data, Number(this.extent * 2048n + this.offset), this.size, data);
		return this._entries;
	}
}

/**
 * Padding entry.
 */
@struct()
export class PDEntry extends SystemUseEntry {}

/**
 * Identifies that SUSP is in-use.
 */
@struct()
export class SPEntry extends SystemUseEntry {
	@t.uint8(2) public magic!: Tuple<number, 2>;

	public checkMagic(): boolean {
		return this.magic[0] == 190 && this.magic[1] == 239;
	}

	@t.uint8 public skip!: number;
}

/**
 * Identifies the end of the SUSP entries.
 */
@struct()
export class STEntry extends SystemUseEntry {}

/**
 * Specifies system-specific extensions to SUSP.
 */
@struct()
export class EREntry extends SystemUseEntry {
	@t.uint8 public idLength!: number;

	@t.uint8 public descriptorLength!: number;

	@t.uint8 public sourceLength!: number;

	@t.uint8 public extensionVersion!: number;

	public get extensionIdentifier(): string {
		return decodeUTF8(this.data.slice(8, 8 + this.idLength));
	}

	public get extensionDescriptor(): string {
		return decodeUTF8(this.data.slice(8 + this.idLength, 8 + this.idLength + this.descriptorLength));
	}

	public get extensionSource(): string {
		const start = 8 + this.idLength + this.descriptorLength;
		return decodeUTF8(this.data.slice(start, start + this.sourceLength));
	}
}

@struct()
export class ESEntry extends SystemUseEntry {
	@t.uint8 public extensionSequence!: number;
}

/**
 * RockRidge: Marks that RockRidge is in use
 * @deprecated
 */
@struct()
export class RREntry extends SystemUseEntry {}

/**
 * RockRidge: Records POSIX file attributes.
 */
@struct()
export class PXEntry extends SystemUseEntry {
	@t.uint64 public mode!: bigint;

	@t.uint64 public nlinks!: bigint;

	@t.uint64 public uid!: bigint;

	@t.uint64 public gid!: bigint;

	@t.uint64 public inode!: bigint;
}

/**
 * RockRidge: Records POSIX device number.
 */
@struct()
export class PNEntry extends SystemUseEntry {
	@t.uint64 public dev_high!: bigint;

	@t.uint64 public dev_low!: bigint;
}

/**
 * RockRidge: Records symbolic link
 */
@struct()
export class SLEntry extends SystemUseEntry {
	@t.uint8 public flags!: number;

	public get continueFlag(): number {
		return this.flags & 1;
	}

	public get componentRecords(): SLComponentRecord[] {
		const records = [];
		let i = 5;
		while (i < this.length) {
			const record = new SLComponentRecord(this.data.slice(i));
			records.push(record);
			i += record.length;
		}
		return records;
	}
}

export function constructSystemUseEntry(data: Uint8Array): SystemUseEntry {
	const sue = new SystemUseEntry(data);
	switch (sue.signature) {
		case EntrySignature.CE:
			return new CEEntry(data);
		case EntrySignature.PD:
			return new PDEntry(data);
		case EntrySignature.SP:
			return new SPEntry(data);
		case EntrySignature.ST:
			return new STEntry(data);
		case EntrySignature.ER:
			return new EREntry(data);
		case EntrySignature.ES:
			return new ESEntry(data);
		case EntrySignature.PX:
			return new PXEntry(data);
		case EntrySignature.PN:
			return new PNEntry(data);
		case EntrySignature.SL:
			return new SLEntry(data);
		case EntrySignature.NM:
			return new NMEntry(data);
		case EntrySignature.CL:
			return new CLEntry(data);
		case EntrySignature.PL:
			return new PLEntry(data);
		case EntrySignature.RE:
			return new REEntry(data);
		case EntrySignature.TF:
			return new TFEntry(data);
		case EntrySignature.SF:
			return new SFEntry(data);
		case EntrySignature.RR:
			return new RREntry(data);
		default:
			return sue;
	}
}

export function constructSystemUseEntries(data: Uint8Array, i: number, length: bigint, isoData: Uint8Array): SystemUseEntry[] {
	// If the remaining allocated space following the last recorded System Use Entry in a System
	// Use field or Continuation Area is less than four bytes long, it cannot contain a System
	// Use Entry and shall be ignored
	length -= 4n;
	const entries: SystemUseEntry[] = [];
	while (i < length) {
		const entry = constructSystemUseEntry(data.slice(i));
		const length = entry.length;
		if (!length) {
			// Invalid SU section; prevent infinite loop.
			return entries;
		}
		i += length;
		if (entry instanceof STEntry) {
			// ST indicates the end of entries.
			break;
		}

		entries.push(...(entry instanceof CEEntry ? entry.entries(isoData) : [entry]));
	}
	return entries;
}

export const enum NMFlags {
	CONTINUE = 1,
	CURRENT = 1 << 1,
	PARENT = 1 << 2,
}

/**
 * RockRidge: Records alternate file name
 */
@struct()
export class NMEntry extends SystemUseEntry {
	@t.uint8 public flags!: NMFlags;

	public name(getString: (data: Uint8Array) => string): string {
		return getString(this.data.slice(5, this.length));
	}
}

/**
 * RockRidge: Records child link
 */
@struct()
export class CLEntry extends SystemUseEntry {
	@t.uint32 public childDirectoryLba!: number;
}

/**
 * RockRidge: Records parent link.
 */
@struct()
export class PLEntry extends SystemUseEntry {
	@t.uint32 public parentDirectoryLba!: number;
}

/**
 * RockRidge: Records relocated directory.
 */
@struct()
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
@struct()
export class TFEntry extends SystemUseEntry {
	@t.uint8 public flags!: number;

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
		const date = new _Date();
		deserialize(date, this.data.slice(offset, offset + sizeof(_Date)));
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
	@t.uint64 public virtualSizeHigh!: bigint;

	@t.uint64 public virtualSizeLow!: bigint;

	@t.uint8 public tableDepth!: number;
}
