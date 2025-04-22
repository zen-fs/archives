import { FileSystem, Inode, type UsageInfo } from '@zenfs/core';
import { log, withErrno } from 'kerium';
import type { Backend } from '@zenfs/core/backends/backend.js';
import { Readonly, Sync } from '@zenfs/core/mixins/index.js';
import { resolve } from '@zenfs/core/path.js';
import { S_IFDIR, S_IFREG } from '@zenfs/core/vfs/constants.js';
import { decodeASCII } from 'utilium';
import type { DirectoryRecord } from './DirectoryRecord.js';
import { PrimaryVolumeDescriptor, VolumeDescriptorType } from './VolumeDescriptor.js';
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
	protected pvd: PrimaryVolumeDescriptor;

	/**
	 * Constructs a read-only file system from the given ISO.
	 * @param data The ISO file in a buffer.
	 * @param name The name of the ISO (optional; used for debug messages / identification).
	 */
	public constructor(protected data: Uint8Array) {
		super(0x2069736f, 'iso9660');

		let candidate: PrimaryVolumeDescriptor | undefined;

		for (let i = 16 * 2048, terminatorFound = false; i < data.length && !terminatorFound; i += 2048) {
			switch (data[i] as VolumeDescriptorType) {
				case VolumeDescriptorType.Primary:
					if (candidate?.type == VolumeDescriptorType.Supplementary) log.notice('iso9660: Skipping primary volume descriptor at 0x' + i.toString(16));
					else {
						log.debug('iso9660: Found primary volume descriptor at 0x' + i.toString(16));
						candidate = new PrimaryVolumeDescriptor('ISO9660', data.buffer, i);
					}
					break;
				case VolumeDescriptorType.Supplementary: {
					const vd = new PrimaryVolumeDescriptor('Joliet', data.buffer, i);

					if (vd.type !== VolumeDescriptorType.Supplementary) {
						throw log.alert(withErrno('EIO', 'iso9660: Supplementary volume descriptor signature mismatch (something is very wrong!)'));
					}

					// Third character identifies what 'level' of the UCS specification to follow. We ignore it.
					if (vd.escapeSequence[0] !== 37 || vd.escapeSequence[1] !== 47 || ![64, 67, 69].includes(vd.escapeSequence[2])) {
						throw withErrno('EIO', 'Unrecognized escape sequence for supplementary volume descriptor: ' + decodeASCII(vd.escapeSequence));
					}

					log.debug('iso9660: Found supplementary volume descriptor at 0x' + i.toString(16));
					candidate = vd;
					break;
				}
				case VolumeDescriptorType.SetTerminator:
					log.debug('iso9660: Found set terminator at 0x' + i.toString(16));
					terminatorFound = true;
					break;
			}
		}

		if (!candidate) throw withErrno('EIO', 'iso9660: unable to find a suitable volume descriptor');

		log.info('iso9660: Using volume descriptor at 0x' + candidate.byteOffset.toString(16));
		this.pvd = candidate;
	}

	public usage(): UsageInfo {
		return {
			totalSpace: this.data.byteLength,
			freeSpace: 0,
		};
	}

	public statSync(path: string): Inode {
		const record = this._getDirectoryRecord(path);
		if (!record) throw withErrno('ENOENT');

		return this._get(path, record)!;
	}

	public readdirSync(path: string): string[] {
		// Check if it exists.
		const record = this._getDirectoryRecord(path);
		if (!record) throw withErrno('ENOENT');

		if (record.isDirectory()) {
			return Array.from(record.directory.keys());
		}

		throw withErrno('ENOTDIR');
	}

	public readSync(path: string, buffer: Uint8Array, offset: number, end: number): void {
		const record = this._getDirectoryRecord(path);
		if (!record) throw withErrno('ENOENT');

		if (record.isDirectory()) {
			throw withErrno('EISDIR');
		}
		buffer.set(record.file.subarray(offset, end));
	}

	private _getDirectoryRecord(path: string): DirectoryRecord | undefined {
		// Special case
		if (path === '/') return this.pvd.root;

		let dir: DirectoryRecord | undefined = this.pvd.root;

		for (const part of path.split('/').slice(1)) {
			if (!dir.isDirectory()) return;
			dir = dir.directory.get(part);
			if (!dir) return;
		}

		return dir;
	}

	private _get(path: string, record: DirectoryRecord): Inode | undefined {
		if (record.isSymlink) {
			const target = resolve(path, record.symlinkPath);
			const targetRecord = this._getDirectoryRecord(target);
			if (!targetRecord) return;
			return this._get(target, targetRecord);
		}

		let mode = 0o555;
		const time = record.recordingDate.getTime();
		let atimeMs = time,
			mtimeMs = time,
			ctimeMs = time;
		if (record.hasRockRidge) {
			for (const entry of record.suEntries) {
				if (entry instanceof PXEntry) {
					mode = Number(entry.mode);
					continue;
				}

				if (!(entry instanceof TFEntry)) continue;

				const flags = entry.flags;
				if (flags & TFFlag.ACCESS) atimeMs = entry.access!.getTime();
				if (flags & TFFlag.MODIFY) mtimeMs = entry.modify!.getTime();
				if (flags & TFFlag.CREATION) ctimeMs = entry.creation!.getTime();
			}
		}
		// Mask out writeable flags. This is a RO file system.
		mode &= 0o555;
		return new Inode({
			mode: mode | (record.isDirectory() ? S_IFDIR : S_IFREG),
			size: record.dataLength,
			atimeMs,
			mtimeMs,
			ctimeMs,
		});
	}
}

const _Iso = {
	name: 'Iso',

	options: {
		data: { type: Uint8Array, required: true },
		name: { type: 'string', required: false },
	},

	create(options: IsoOptions) {
		const fs = new IsoFS(options.data);
		fs.label = options.name;
		return fs;
	},
} as const satisfies Backend<IsoFS, IsoOptions>;
type _Iso = typeof _Iso;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Iso extends _Iso {}
export const Iso: Iso = _Iso;
