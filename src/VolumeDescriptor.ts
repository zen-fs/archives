import { ErrnoError, Errno } from '@zenfs/core/error.js';
import { DirectoryRecord, ISODirectoryRecord, JolietDirectoryRecord } from './DirectoryRecord.js';
import { getASCIIString, getDate, getJolietString } from './utils.js';

export const enum VolumeDescriptorType {
	BootRecord = 0,
	Primary = 1,
	Supplementary = 2,
	Partition = 3,
	SetTerminator = 255,
}

export class VolumeDescriptor {
	protected _view: DataView;
	public constructor(protected _data: Uint8Array) {
		this._view = new DataView(_data.buffer);
	}

	public get type(): VolumeDescriptorType {
		return this._data[0];
	}

	public get standardIdentifier(): string {
		return getASCIIString(this._data, 1, 5);
	}

	public get version(): number {
		return this._data[6];
	}

	public get data(): Uint8Array {
		return this._data.slice(7, 2048);
	}
}

export abstract class PrimaryOrSupplementaryVolumeDescriptor extends VolumeDescriptor {
	private _root?: DirectoryRecord;

	public get systemIdentifier(): string {
		return this._getString(8, 32);
	}

	public get volumeIdentifier(): string {
		return this._getString(40, 32);
	}

	public get volumeSpaceSize(): number {
		return this._view.getUint32(80, true);
	}

	public get volumeSetSize(): number {
		return this._view.getUint16(120, true);
	}

	public get volumeSequenceNumber(): number {
		return this._view.getUint16(124, true);
	}

	public get logicalBlockSize(): number {
		return this._view.getUint16(128, true);
	}

	public get pathTableSize(): number {
		return this._view.getUint32(132, true);
	}

	public get locationOfTypeLPathTable(): number {
		return this._view.getUint32(140, true);
	}

	public get locationOfOptionalTypeLPathTable(): number {
		return this._view.getUint32(144, true);
	}

	public get locationOfTypeMPathTable(): number {
		return this._view.getUint32(148);
	}

	public get locationOfOptionalTypeMPathTable(): number {
		return this._view.getUint32(152);
	}

	public rootDirectoryEntry(isoData: Uint8Array): DirectoryRecord {
		if (!this._root) {
			this._root = this._constructRootDirectoryRecord(this._data.slice(156));
			this._root.rootCheckForRockRidge(isoData);
		}
		return this._root;
	}

	public get volumeSetIdentifier(): string {
		return this._getString(190, 128);
	}

	public get publisherIdentifier(): string {
		return this._getString(318, 128);
	}

	public get dataPreparerIdentifier(): string {
		return this._getString(446, 128);
	}

	public get applicationIdentifier(): string {
		return this._getString(574, 128);
	}

	public get copyrightFileIdentifier(): string {
		return this._getString(702, 38);
	}

	public get abstractFileIdentifier(): string {
		return this._getString(740, 36);
	}

	public get bibliographicFileIdentifier(): string {
		return this._getString(776, 37);
	}

	public get volumeCreationDate(): Date {
		return getDate(this._data, 813);
	}

	public get volumeModificationDate(): Date {
		return getDate(this._data, 830);
	}

	public get volumeExpirationDate(): Date {
		return getDate(this._data, 847);
	}

	public get volumeEffectiveDate(): Date {
		return getDate(this._data, 864);
	}

	public get fileStructureVersion(): number {
		return this._data[881];
	}

	public get applicationUsed(): Uint8Array {
		return this._data.slice(883, 883 + 512);
	}

	public get reserved(): Uint8Array {
		return this._data.slice(1395, 1395 + 653);
	}

	public abstract get name(): string;
	protected abstract _constructRootDirectoryRecord(data: Uint8Array): DirectoryRecord;
	protected abstract _getString(idx: number, len: number): string;
}

export class PrimaryVolumeDescriptor extends PrimaryOrSupplementaryVolumeDescriptor {
	public constructor(data: Uint8Array) {
		super(data);
		if (this.type !== VolumeDescriptorType.Primary) {
			throw new ErrnoError(Errno.EIO, `Invalid primary volume descriptor.`);
		}
	}

	public get name() {
		return 'ISO9660';
	}
	protected _constructRootDirectoryRecord(data: Uint8Array): DirectoryRecord {
		return new ISODirectoryRecord(data, -1);
	}
	protected _getString(idx: number, len: number): string {
		return this._getString(idx, len);
	}
}

export class SupplementaryVolumeDescriptor extends PrimaryOrSupplementaryVolumeDescriptor {
	public constructor(data: Uint8Array) {
		super(data);
		if (this.type !== VolumeDescriptorType.Supplementary) {
			throw new ErrnoError(Errno.EIO, 'Invalid supplementary volume descriptor.');
		}
		const escapeSequence = this.escapeSequence;
		const third = escapeSequence[2];
		// Third character identifies what 'level' of the UCS specification to follow.
		// We ignore it.
		if (escapeSequence[0] !== 37 || escapeSequence[1] !== 47 || (third !== 64 && third !== 67 && third !== 69)) {
			throw new ErrnoError(Errno.EIO, 'Unrecognized escape sequence for SupplementaryVolumeDescriptor: ' + escapeSequence.toString());
		}
	}

	public get name() {
		return 'Joliet';
	}

	public get escapeSequence(): Uint8Array {
		return this._data.slice(88, 120);
	}
	protected _constructRootDirectoryRecord(data: Uint8Array): DirectoryRecord {
		return new JolietDirectoryRecord(data, -1);
	}
	protected _getString(idx: number, len: number): string {
		return getJolietString(this._data, idx, len);
	}
}
