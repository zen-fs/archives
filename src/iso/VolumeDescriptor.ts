import { Errno, ErrnoError } from '@zenfs/core';
import { _throw, decodeASCII, deserialize, member, struct, types as t } from 'utilium';
import { DirectoryRecord } from './DirectoryRecord.js';
import { LongFormDate } from './utils.js';

export const enum VolumeDescriptorType {
	BootRecord = 0,
	Primary = 1,
	Supplementary = 2,
	Partition = 3,
	SetTerminator = 255,
}

@struct()
export class VolumeDescriptor {
	public constructor(protected _data: Uint8Array = _throw('Missing data')) {
		deserialize(this, _data);
	}

	@t.uint8 public type!: VolumeDescriptorType;

	@t.char(5) public standardIdentifier: string = '';

	@t.uint8 public version!: number;

	@t.char(1) protected __padding__7!: number;

	protected _decoder?: TextDecoder;

	protected _decode(data: Uint8Array): string {
		this._decoder ||= new TextDecoder(this.name == 'Joilet' ? 'utf-16be' : 'utf-8');

		return this._decoder.decode(data).toLowerCase();
	}

	/**
	 * The name of the system that can act upon sectors 0x00-0x0F for the volume.
	 */
	@t.char(32) protected _systemIdentifier = new Uint8Array(32);

	/**
	 * The name of the system that can act upon sectors 0x00-0x0F for the volume.
	 */
	public get systemIdentifier(): string {
		return this._decode(this._systemIdentifier);
	}

	/**
	 * Identification of this volume.
	 */
	@t.char(32) protected _volumeIdentifier = new Uint8Array(32);

	/**
	 * Identification of this volume.
	 */
	public get volumeIdentifier(): string {
		return this._decode(this._volumeIdentifier);
	}

	@t.char(8) protected __padding__72!: number;

	/**
	 * Number of Logical Blocks in which the volume is recorded.
	 */
	@t.uint32 public volumeSpaceSize!: number;
	@t.uint32 protected _volumeSpaceSizeBE!: number;

	/**
	 * This is only used by Joliet
	 */
	@t.char(32) protected escapeSequence = new Uint8Array(32);

	/**
	 * The size of the set in this logical volume (number of disks).
	 */
	@t.uint16 public volumeSetSize!: number;
	@t.uint16 protected _volumeSetSizeBE!: number;

	/**
	 * The number of this disk in the Volume Set.
	 */
	@t.uint16 public volumeSequenceNumber!: number;
	@t.uint16 protected _volumeSequenceNumberBE!: number;

	/**
	 * The size in bytes of a logical block.
	 * NB: This means that a logical block on a CD could be something other than 2 KiB!
	 */
	@t.uint16 public logicalBlockSize!: number;
	@t.uint16 protected _logicalBlockSizeBE!: number;

	/**
	 * The size in bytes of the path table.
	 */
	@t.uint32 public pathTableSize!: number;
	@t.uint32 protected _pathTableSizeBE!: number;

	/**
	 * LBA location of the path table.
	 * The path table pointed to contains only little-endian values.
	 */
	@t.uint32 public locationOfTypeLPathTable!: number;

	/**
	 * LBA location of the optional path table.
	 * The path table pointed to contains only little-endian values.
	 * Zero means that no optional path table exists.
	 */
	@t.uint32 public locationOfOptionalTypeLPathTable!: number;

	@t.uint32 protected _locationOfTypeMPathTable!: number;

	public get locationOfTypeMPathTable(): number {
		return new DataView(this._data.buffer).getUint32(148);
	}

	@t.uint32 protected _locationOfOptionalTypeMPathTable!: number;

	public locationOfOptionalTypeMPathTable(): number {
		return new DataView(this._data.buffer).getUint32(152);
	}

	/**
	 * Directory entry for the root directory.
	 * Note that this is not an LBA address,
	 * it is the actual Directory Record,
	 * which contains a single byte Directory Identifier (0x00),
	 * hence the fixed 34 byte size.
	 */
	@member(DirectoryRecord) protected _root!: DirectoryRecord;

	public rootDirectoryEntry(isoData: Uint8Array): DirectoryRecord {
		if (!this._root) {
			this._root = new DirectoryRecord(this._data.slice(156), -1);
			this._root.rootCheckForRockRidge(isoData);
		}
		this._root._kind = this.name;
		return this._root;
	}

	@t.char(128) protected _volumeSetIdentifier = new Uint8Array(128);

	public get volumeSetIdentifier(): string {
		return this._decode(this._volumeIdentifier);
	}

	@t.char(128) protected _publisherIdentifier = new Uint8Array(128);

	public get publisherIdentifier(): string {
		return this._decode(this._publisherIdentifier);
	}

	@t.char(128) protected _dataPreparerIdentifier = new Uint8Array(128);

	public get dataPreparerIdentifier(): string {
		return this._decode(this._dataPreparerIdentifier);
	}

	@t.char(128) protected _applicationIdentifier = new Uint8Array(128);

	public get applicationIdentifier(): string {
		return this._decode(this._applicationIdentifier);
	}

	@t.char(38) protected _copyrightFileIdentifier = new Uint8Array(38);

	public get copyrightFileIdentifier(): string {
		return this._decode(this._copyrightFileIdentifier);
	}

	@t.char(36) protected _abstractFileIdentifier = new Uint8Array(36);

	public get abstractFileIdentifier(): string {
		return this._decode(this._abstractFileIdentifier);
	}

	@t.char(37) protected _bibliographicFileIdentifier = new Uint8Array(37);

	public get bibliographicFileIdentifier(): string {
		return this._decode(this._bibliographicFileIdentifier);
	}

	@member(LongFormDate) public volumeCreationDate = new LongFormDate();

	@member(LongFormDate) public volumeModificationDate = new LongFormDate();

	@member(LongFormDate) public volumeExpirationDate = new LongFormDate();

	@member(LongFormDate) public volumeEffectiveDate = new LongFormDate();

	@t.uint8 public fileStructureVersion!: number;

	@t.char(512) public applicationUsed = new Uint8Array(512);

	@t.char(653) public reserved = new Uint8Array(653);

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

	// Needs to be implemented by subclasses.
	declare public readonly name: string;
}

@struct()
export class PrimaryVolumeDescriptor extends VolumeDescriptor {
	public readonly name = 'ISO9660';

	public constructor(data: Uint8Array = _throw('Missing data')) {
		super(data);
		if (this.type !== VolumeDescriptorType.Primary) {
			throw new ErrnoError(Errno.EIO, 'Invalid primary volume descriptor.');
		}
	}
}

@struct()
export class SupplementaryVolumeDescriptor extends VolumeDescriptor {
	public readonly name = 'Joliet';

	public constructor(data: Uint8Array = _throw('Missing data')) {
		super(data);
		if (this.type !== VolumeDescriptorType.Supplementary) {
			throw new ErrnoError(Errno.EIO, 'Invalid supplementary volume descriptor.');
		}
		// Third character identifies what 'level' of the UCS specification to follow. We ignore it.
		if (this.escapeSequence[0] !== 37 || this.escapeSequence[1] !== 47 || ![64, 67, 69].includes(this.escapeSequence[2])) {
			throw new ErrnoError(Errno.EIO, 'Unrecognized escape sequence for SupplementaryVolumeDescriptor: ' + decodeASCII(this.escapeSequence));
		}
	}
}
