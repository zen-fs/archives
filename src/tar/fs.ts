import type { Backend, SharedConfig, UsageInfo } from '@zenfs/core';
import { FileSystem, Inode, isDirectory, Readonly, Sync } from '@zenfs/core';
import { S_IFDIR } from '@zenfs/core/constants';
import { basename, dirname } from '@zenfs/core/path';
import { withErrno } from 'kerium';
import { pick } from 'utilium';
import { _caseFold } from '../utils.js';
import * as tar from './tar.js';
import { debug, warn } from 'kerium/log';

/**
 * Options for TarFS file system instances.
 */
export interface TarOptions extends SharedConfig {
	/** The Tar file in a buffer. */
	data: Uint8Array;

	/** The name of the Tar file */
	name?: string;
}

export class TarFS extends Readonly(Sync(FileSystem)) {
	protected data: Uint8Array;
	protected files: Map<string, Uint8Array> = new Map();
	protected directories: Map<string, Set<string>> = new Map([['/', new Set()]]);

	protected inodes: Map<string, Inode> = new Map([['/', new Inode({ mode: 0o755 | S_IFDIR, ino: 0 })]]);
	#nextIno: number = 1;

	public constructor(public readonly options: TarOptions) {
		super(0x2e746172, 'tarfs');

		this.data = options.data;
		this.label = options.name;

		for (let off = 0; off + 512 < this.data.length; off += 512) {
			const header = new tar.PosixHeader(this.data.buffer, this.data.byteOffset + off, 512);

			const magic = tar.decodeString(header.magic);
			const offStr = '0x' + off.toString(16);

			if (magic === tar.oldgnuMagic) debug(`tarfs: ${offStr} has oldgnu magic`);
			else if (magic !== tar.magic) {
				debug(`tarfs: skipping ${offStr}, bad magic`);
				continue;
			}

			const entry = header.toEntry();

			const name = entry.name.at(-1) === '/' ? entry.name.slice(0, -1) : entry.name;

			const folded = _caseFold(this, '/' + name);

			this.inodes.set(
				folded,
				// @todo support dev/rdev on Inode and pass that through here
				new Inode({
					...pick(entry, 'uid', 'gid', 'size'),
					mode: entry.mode | tar.typeMap[entry.type],
					mtimeMs: entry.mtime * 1000,
					ino: ++this.#nextIno,
				})
			);
			if (entry.type == tar.TypeFlag.Dir) this.directories.set(folded, new Set());
			else if (!entry.size) {
				debug(`tarfs: file is empty, ${name}`);
			} else {
				const content = new Uint8Array(this.data.buffer, header.byteOffset + 512, entry.size);
				this.files.set(folded, content);
				const nBlocks = Math.ceil(entry.size / 512);
				off += nBlocks * 512;
				debug(`tarfs: skipping forward ${nBlocks} blocks`);
			}

			const dir = this.directories.get(dirname(folded));
			if (dir) dir.add(basename(folded));
			else warn('tarfs: can not add entry to non-existent directory: ' + name);
		}
	}

	public usage(): UsageInfo {
		return {
			totalSpace: this.data.byteLength,
			freeSpace: 0,
		};
	}

	public statSync(path: string): Inode {
		const folded = _caseFold(this, path);
		const inode = this.inodes.get(folded);
		if (!inode) throw withErrno('ENOENT');
		return inode;
	}

	public readdirSync(path: string): string[] {
		const folded = _caseFold(this, path);
		const inode = this.inodes.get(folded);
		if (!inode) throw withErrno('ENOENT');
		if (!isDirectory(inode)) throw withErrno('ENOTDIR');
		const dir = this.directories.get(folded);
		if (!dir) throw withErrno('ENODATA');
		return Array.from(dir);
	}

	public readSync(path: string, buffer: Uint8Array, offset: number, end: number): void {
		const folded = _caseFold(this, path);
		const inode = this.inodes.get(folded);
		if (!inode) throw withErrno('ENOENT');
		if (isDirectory(inode)) throw withErrno('EISDIR');
		const data = this.files.get(folded);
		if (!data) throw withErrno('ENODATA');
		buffer.set(data.subarray(offset, end));
	}
}

const _Tar = {
	name: 'Tar',
	options: {
		data: { type: Uint8Array, required: true },
		name: { type: 'string', required: false },
	},
	create(options: TarOptions) {
		return new TarFS(options);
	},
} as const satisfies Backend<TarFS, TarOptions>;
type _Tar = typeof _Tar;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Tar extends _Tar {}
export const Tar: Tar = _Tar;
