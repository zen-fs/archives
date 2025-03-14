import { Errno, ErrnoError, FileSystem, Inode, type InodeLike, type UsageInfo } from '@zenfs/core';
import type { Backend } from '@zenfs/core/backends/backend.js';
import { Readonly, Sync } from '@zenfs/core/mixins/index.js';
import { resolve } from '@zenfs/core/path.js';
import { S_IFDIR, S_IFREG } from '@zenfs/core/vfs/constants.js';
import type { DirectoryRecord } from './DirectoryRecord.js';
import type { VolumeDescriptor } from './VolumeDescriptor.js';
import { PrimaryVolumeDescriptor, SupplementaryVolumeDescriptor, VolumeDescriptorType } from './VolumeDescriptor.js';
import { PXEntry, TFEntry, TFFlag } from './entries.js';

/**
 * Options for IsoFS file system instances.
 */
export interface IsoOptions {
	/**
	 * The ISO file in a buffer.
	 */
	data: Uint8Array;
	/**
	 * The name of the ISO (optional; used for debug messages / identification via metadata.name).
	 */
	name?: string;
}

/**
 * Mounts an ISO file as a read-only file system.
 *
 * Supports:
 * * Vanilla ISO9660 ISOs
 * * Microsoft Joliet and Rock Ridge extensions to the ISO9660 standard
 */
export class IsoFS extends Readonly(Sync(FileSystem)) {
	protected data: Uint8Array;
	private _pvd?: VolumeDescriptor;
	private _root: DirectoryRecord;
	private _name: string;

	/**
	 * **Deprecated. Please use IsoFS.Create() method instead.**
	 *
	 * Constructs a read-only file system from the given ISO.
	 * @param data The ISO file in a buffer.
	 * @param name The name of the ISO (optional; used for debug messages / identification via getName()).
	 */
	public constructor({ data, name = '' }: IsoOptions) {
		super(0x2069736f, 'iso9660');
		this._name = name;
		this.data = data;
		// Skip first 16 sectors.
		let vdTerminatorFound = false;
		let i = 16 * 2048;
		const candidateVDs = new Array<VolumeDescriptor>();
		while (!vdTerminatorFound && i < data.length) {
			const slice = this.data.slice(i);
			switch (slice[0] as VolumeDescriptorType) {
				case VolumeDescriptorType.Primary:
					candidateVDs.push(new PrimaryVolumeDescriptor(slice));
					break;
				case VolumeDescriptorType.Supplementary:
					candidateVDs.push(new SupplementaryVolumeDescriptor(slice));
					break;
				case VolumeDescriptorType.SetTerminator:
					vdTerminatorFound = true;
					break;
			}
			i += 2048;
		}
		if (!candidateVDs.length) {
			throw new ErrnoError(Errno.EIO, 'Unable to find a suitable volume descriptor.');
		}
		for (const v of candidateVDs) {
			// Take an SVD over a PVD.
			if (this._pvd?.type != VolumeDescriptorType.Supplementary) {
				this._pvd = v;
			}
		}

		if (!this._pvd) {
			throw new ErrnoError(Errno.EINVAL, 'No primary volume descriptor');
		}

		this._root = this._pvd.rootDirectoryEntry(this.data);
		this.label = ['iso', this._name, this._pvd?.name, this._root && this._root.hasRockRidge && 'RockRidge'].filter(e => e).join(':');
	}

	public usage(): UsageInfo {
		return {
			totalSpace: this.data.byteLength,
			freeSpace: 0,
		};
	}

	public statSync(path: string): Inode {
		const record = this._getDirectoryRecord(path);
		if (!record) throw ErrnoError.With('ENOENT', path, 'stat');

		return this._getInode(path, record)!;
	}

	public readdirSync(path: string): string[] {
		// Check if it exists.
		const record = this._getDirectoryRecord(path);
		if (!record) throw ErrnoError.With('ENOENT', path, 'readdir');

		if (record.isDirectory(this.data)) {
			return Array.from(record.getDirectory(this.data).keys());
		}

		throw ErrnoError.With('ENOTDIR', path, 'readdir');
	}

	public readSync(path: string, buffer: Uint8Array, offset: number, end: number): void {
		const record = this._getDirectoryRecord(path);
		if (!record) throw ErrnoError.With('ENOENT', path, 'openFile');

		if (record.isDirectory(this.data)) {
			throw ErrnoError.With('EISDIR', path, 'openFile');
		}
		const data = record.getFile(this.data);
		buffer.set(data.subarray(offset, end));
	}

	private _getDirectoryRecord(path: string): DirectoryRecord | undefined {
		// Special case.
		if (path === '/') {
			return this._root;
		}
		const parts = path.split('/').slice(1);
		let dir: DirectoryRecord | undefined = this._root;
		for (const part of parts) {
			if (!dir.isDirectory(this.data)) {
				return;
			}
			dir = dir.getDirectory(this.data).get(part);
			if (!dir) {
				return;
			}
		}
		return dir;
	}

	private _getInode(path: string, record: DirectoryRecord): Inode | undefined {
		if (record.isSymlink(this.data)) {
			const newP = resolve(path, record.getSymlinkPath(this.data));
			const dirRec = this._getDirectoryRecord(newP);
			if (!dirRec) {
				return;
			}
			return this._getInode(newP, dirRec);
		}

		let mode = 0o555;
		const time = record.recordingDate.getTime();
		let atimeMs = time,
			mtimeMs = time,
			ctimeMs = time;
		if (record.hasRockRidge) {
			const entries = record.getSUEntries(this.data);
			for (const entry of entries) {
				if (entry instanceof PXEntry) {
					mode = Number(entry.mode);
					continue;
				}

				if (!(entry instanceof TFEntry)) {
					continue;
				}
				const flags = entry.flags;
				if (flags & TFFlag.ACCESS) {
					atimeMs = entry.access!.getTime();
				}
				if (flags & TFFlag.MODIFY) {
					mtimeMs = entry.modify!.getTime();
				}
				if (flags & TFFlag.CREATION) {
					ctimeMs = entry.creation!.getTime();
				}
			}
		}
		// Mask out writeable flags. This is a RO file system.
		mode &= 0o555;
		return new Inode({
			mode: mode | (record.isDirectory(this.data) ? S_IFDIR : S_IFREG),
			size: record.dataLength,
			atimeMs,
			mtimeMs,
			ctimeMs,
		});
	}
}

const _Iso = {
	name: 'Iso',

	isAvailable(): boolean {
		return true;
	},

	options: {
		data: { type: Uint8Array, required: true },
	},

	create(options: IsoOptions) {
		return new IsoFS(options);
	},
} as const satisfies Backend<IsoFS, IsoOptions>;
type _Iso = typeof _Iso;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Iso extends _Iso {}
export const Iso: Iso = _Iso;
