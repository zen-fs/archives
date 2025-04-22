import { withErrno } from 'kerium';
import { field, packed, struct, types as t } from 'memium';
import { _throw } from 'utilium';
import { DirectoryRecord } from './DirectoryRecord.js';
import { EREntry, RREntry, SPEntry } from './entries.js';
import { LongFormDate } from './misc.js';
import { BufferView } from 'utilium/buffer.js';

const rockRidgeIdentifier = 'IEEE_P1282';

export const enum VolumeDescriptorType {
	BootRecord = 0,
	Primary = 1,
	Supplementary = 2,
	Partition = 3,
	SetTerminator = 255,
}

@struct(packed)
export class VolumeDescriptor<T extends ArrayBufferLike = ArrayBufferLike> extends BufferView<T> {
	@t.uint8 public accessor type!: VolumeDescriptorType;

	@t.char(5) public accessor standardIdentifier: string = '';

	@t.uint8 public accessor version!: number;

	@t.char protected accessor __padding__7!: number;
}

/**
 * Primary or supplementary volume descriptor.
 * Supplementary VDs are basically PVDs with some extra sauce, so we use the same struct for both.
 */
@struct(packed)
export class PrimaryVolumeDescriptor extends VolumeDescriptor {
	public constructor(
		/**
		 * The name of the volume descriptor type, either 'ISO9660' or 'Joliet'.
		 */
		public readonly name: string = _throw(withErrno('EINVAL', 'VolumeDescriptor.name is required')),
		...args: ConstructorParameters<typeof VolumeDescriptor>
	) {
		super(...args);

		this._root = new DirectoryRecord(this.buffer, this.byteOffset + 156);
		this._root._kind = this.name;

		const dir = this._root.directory.dotEntry;

		if (dir.suEntries.length && dir.suEntries[0] instanceof SPEntry && dir.suEntries[0].checkMagic()) {
			// SUSP is in use.
			for (const entry of dir.suEntries.slice(1)) {
				if (entry instanceof RREntry || (entry instanceof EREntry && entry.extensionIdentifier === rockRidgeIdentifier)) {
					// Rock Ridge is in use!
					this._root.rockRidgeOffset = dir.suEntries[0].skip;
					break;
				}
			}
		}

		// Wipe out directory. Start over with RR knowledge.
		if (this._root.rockRidgeOffset > -1) (dir as any)._dir = undefined;
	}

	protected _decoder?: TextDecoder;

	protected _decode(data: Uint8Array): string {
		this._decoder ||= new TextDecoder(this.name == 'Joilet' ? 'utf-16be' : 'utf-8');

		return this._decoder.decode(data).toLowerCase();
	}

	/**
	 * The name of the system that can act upon sectors 0x00-0x0F for the volume.
	 */
	@t.char(32) protected accessor _systemIdentifier = new Uint8Array(32);

	/**
	 * The name of the system that can act upon sectors 0x00-0x0F for the volume.
	 */
	public get systemIdentifier(): string {
		return this._decode(this._systemIdentifier);
	}

	/**
	 * Identification of this volume.
	 */
	@t.char(32) protected accessor _volumeIdentifier = new Uint8Array(32);

	/**
	 * Identification of this volume.
	 */
	public get volumeIdentifier(): string {
		return this._decode(this._volumeIdentifier);
	}

	@t.char(8) protected accessor __padding__72 = new Uint8Array(8);

	/**
	 * Number of Logical Blocks in which the volume is recorded.
	 */
	@t.uint32 public accessor volumeSpaceSize!: number;
	@t.uint32 protected accessor _volumeSpaceSizeBE!: number;

	/**
	 * This is only used by Joliet
	 */
	@t.char(32) public accessor escapeSequence = new Uint8Array(32);

	/**
	 * The size of the set in this logical volume (number of disks).
	 */
	@t.uint16 public accessor volumeSetSize!: number;
	@t.uint16 protected accessor _volumeSetSizeBE!: number;

	/**
	 * The number of this disk in the Volume Set.
	 */
	@t.uint16 public accessor volumeSequenceNumber!: number;
	@t.uint16 protected accessor _volumeSequenceNumberBE!: number;

	/**
	 * The size in bytes of a logical block.
	 * NB: This means that a logical block on a CD could be something other than 2 KiB!
	 */
	@t.uint16 public accessor logicalBlockSize!: number;
	@t.uint16 protected accessor _logicalBlockSizeBE!: number;

	/**
	 * The size in bytes of the path table.
	 */
	@t.uint32 public accessor pathTableSize!: number;
	@t.uint32 protected accessor _pathTableSizeBE!: number;

	/**
	 * LBA location of the path table.
	 * The path table pointed to contains only little-endian values.
	 */
	@t.uint32 public accessor locationOfTypeLPathTable!: number;

	/**
	 * LBA location of the optional path table.
	 * The path table pointed to contains only little-endian values.
	 * Zero means that no optional path table exists.
	 */
	@t.uint32 public accessor locationOfOptionalTypeLPathTable!: number;

	@t.uint32 protected accessor _locationOfTypeMPathTable!: number;

	public get locationOfTypeMPathTable(): number {
		return new DataView(this.buffer).getUint32(148);
	}

	@t.uint32 protected accessor _locationOfOptionalTypeMPathTable!: number;

	public locationOfOptionalTypeMPathTable(): number {
		return new DataView(this.buffer).getUint32(152);
	}

	/**
	 * Directory entry for the root directory.
	 * Note that this is not an LBA address,
	 * it is the actual Directory Record,
	 * which contains a single byte Directory Identifier (0x00),
	 * hence the fixed 34 byte size.
	 */
	@field(DirectoryRecord) protected accessor _root: DirectoryRecord;

	public get root(): DirectoryRecord {
		if (this._root && this._root.buffer) return this._root;

		return this._root;
	}

	@t.char(128) protected accessor _volumeSetIdentifier = new Uint8Array(128);

	public get volumeSetIdentifier(): string {
		return this._decode(this._volumeIdentifier);
	}

	@t.char(128) protected accessor _publisherIdentifier = new Uint8Array(128);

	public get publisherIdentifier(): string {
		return this._decode(this._publisherIdentifier);
	}

	@t.char(128) protected accessor _dataPreparerIdentifier = new Uint8Array(128);

	public get dataPreparerIdentifier(): string {
		return this._decode(this._dataPreparerIdentifier);
	}

	@t.char(128) protected accessor _applicationIdentifier = new Uint8Array(128);

	public get applicationIdentifier(): string {
		return this._decode(this._applicationIdentifier);
	}

	@t.char(38) protected accessor _copyrightFileIdentifier = new Uint8Array(38);

	public get copyrightFileIdentifier(): string {
		return this._decode(this._copyrightFileIdentifier);
	}

	@t.char(36) protected accessor _abstractFileIdentifier = new Uint8Array(36);

	public get abstractFileIdentifier(): string {
		return this._decode(this._abstractFileIdentifier);
	}

	@t.char(37) protected accessor _bibliographicFileIdentifier = new Uint8Array(37);

	public get bibliographicFileIdentifier(): string {
		return this._decode(this._bibliographicFileIdentifier);
	}

	@field(LongFormDate) public accessor volumeCreationDate = new LongFormDate();

	@field(LongFormDate) public accessor volumeModificationDate = new LongFormDate();

	@field(LongFormDate) public accessor volumeExpirationDate = new LongFormDate();

	@field(LongFormDate) public accessor volumeEffectiveDate = new LongFormDate();

	@t.uint8 public accessor fileStructureVersion!: number;

	@t.char(512) public accessor applicationUsed = new Uint8Array(512);

	@t.char(653) public accessor reserved = new Uint8Array(653);

	public toString(): string {
		return `${this.name} CD-ROM
				System id: ${this.systemIdentifier}
				Volume id: ${this.volumeIdentifier}
				Volume set id: ${this.volumeSetIdentifier}
				Publisher id: ${this.publisherIdentifier}
				Data preparer id: ${this.dataPreparerIdentifier}
				Application id: ${this.applicationIdentifier}
				Copyright file id: ${this.copyrightFileIdentifier}
				Abstract file id: ${this.abstractFileIdentifier}
				Bibliographic file id: ${this.bibliographicFileIdentifier}
				Volume set size: ${this.volumeSetSize}
				Volume sequence number: ${this.volumeSequenceNumber}
				Logical block size: ${this.logicalBlockSize}
				Volume size: ${this.volumeSpaceSize}`.replaceAll('\t', '');
	}
}
