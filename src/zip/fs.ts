import { Errno, ErrnoError, FileSystem, isWriteable, LazyFile, Stats, type File, type UsageInfo } from '@zenfs/core';
import type { Backend } from '@zenfs/core/backends/backend.js';
import { Readonly } from '@zenfs/core/mixins/readonly.js';
import { Sync } from '@zenfs/core/mixins/sync.js';
import { S_IFDIR } from '@zenfs/core/vfs/constants.js';
import { parse } from '@zenfs/core/vfs/path.js';
import { _throw } from 'utilium';
import type { Header } from './zip.js';
import { computeEOCD, FileEntry } from './zip.js';

/**
 * Configuration options for a ZipFS file system.
 */
export interface ZipOptions {
	/**
	 * The zip file as a binary buffer.
	 */
	data: ArrayBufferLike | ArrayBufferView;

	/**
	 * The name of the zip file (optional).
	 */
	name?: string;

	/**
	 * Whether to wait to initialize entries
	 */
	lazy?: boolean;
}

/**
 * A file system backend by a zip file.
 * Implemented according to the standard:
 * http://pkware.com/documents/casestudies/APPNOTE.TXT
 *
 * While there are a few zip libraries for JavaScript (e.g. JSZip and zip.js),
 * they are not a good match for ZenFS. In particular, these libraries
 * perform a lot of unneeded data copying, and eagerly decompress every file
 * in the zip file upon loading to check the CRC32. They also eagerly decode
 * strings. Furthermore, these libraries duplicate functionality already present
 * in ZenFS (e.g. UTF-8 decoding and binary data manipulation).
 *
 * When the filesystem is instantiated,
 * we determine the directory structure of the zip file as quickly as possible.
 * We lazily decompress and check the CRC32 of files.
 *
 * Current limitations:
 * * No encryption.
 * * No ZIP64 support.
 * * Read-only.
 *   Write support would require that we:
 *   - Keep track of changed/new files.
 *   - Compress changed files, and generate appropriate metadata for each.
 *   - Update file offsets for other files in the zip file.
 *   - Stream it out to a location.
 *   This isn't that bad, so we might do this at a later date.
 */
export class ZipFS extends Readonly(Sync(FileSystem)) {
	protected files: Map<string, FileEntry> = new Map();
	protected directories: Map<string, Set<string>> = new Map();

	protected _time = Date.now();

	public readonly eocd: Header;

	/**
	 * @deprecated
	 */
	public get endOfCentralDirectory(): Header {
		return this.eocd;
	}

	public constructor(
		public label: string,
		protected data: Uint8Array
	) {
		super(0x207a6970, 'zipfs');

		this.eocd = computeEOCD(data);
		if (this.eocd.disk != this.eocd.entriesDisk) {
			throw new ErrnoError(Errno.EINVAL, 'ZipFS does not support spanned zip files.');
		}

		let ptr = this.eocd.offset;

		if (ptr === 0xffffffff) {
			throw new ErrnoError(Errno.EINVAL, 'ZipFS does not support Zip64.');
		}
		const cdEnd = ptr + this.eocd.size;

		while (ptr < cdEnd) {
			const cd = new FileEntry(this.data.subarray(ptr));
			/* 	Paths must be absolute,
			yet zip file paths are always relative to the zip root.
			So we prepend '/' and call it a day. */
			if (cd.name.startsWith('/')) {
				throw new ErrnoError(Errno.EPERM, 'Unexpectedly encountered an absolute path in a zip file.');
			}
			// Strip the trailing '/' if it exists
			const name = cd.name.endsWith('/') ? cd.name.slice(0, -1) : cd.name;
			this.files.set('/' + name, cd);
			ptr += cd.size;
		}

		// Parse directory entries
		for (const entry of this.files.keys()) {
			const { dir, base } = parse(entry);

			if (!this.directories.has(dir)) {
				this.directories.set(dir, new Set());
			}

			this.directories.get(dir)!.add(base);
		}

		// Add subdirectories to their parent's entries
		for (const entry of this.directories.keys()) {
			const { dir, base } = parse(entry);

			if (base == '') continue;

			if (!this.directories.has(dir)) {
				this.directories.set(dir, new Set());
			}

			this.directories.get(dir)!.add(base);
		}
	}

	public usage(): UsageInfo {
		return {
			totalSpace: this.data.byteLength,
			freeSpace: 0,
		};
	}

	public get numberOfCentralDirectoryEntries(): number {
		return this.files.size;
	}

	public statSync(path: string): Stats {
		// The EOCD/Header does not track directories, so it does not exist in `entries`
		if (this.directories.has(path)) {
			return new Stats({
				mode: 0o555 | S_IFDIR,
				size: 4096,
				mtimeMs: this._time,
				ctimeMs: this._time,
				atimeMs: Date.now(),
				birthtimeMs: this._time,
			});
		}

		const entry = this.files.get(path);

		if (!entry) throw ErrnoError.With('ENOENT', path, 'stat');

		return entry.stats;
	}

	public openFileSync(path: string, flag: string): File {
		if (isWriteable(flag)) throw new ErrnoError(Errno.EPERM, path);
		return new LazyFile(this, path, flag, this.statSync(path));
	}

	public readdirSync(path: string): string[] {
		const stats = this.statSync(path);

		if (!stats.isDirectory()) throw ErrnoError.With('ENOTDIR', path, 'readdir');

		const entries = this.directories.get(path);

		if (!entries) throw ErrnoError.With('ENODATA', path, 'readdir');

		return Array.from(entries);
	}

	public readSync(path: string, buffer: Uint8Array, offset: number, end: number): void {
		if (this.directories.has(path)) throw ErrnoError.With('EISDIR', path, 'read');

		const { contents: data } = this.files.get(path) ?? _throw(ErrnoError.With('ENOENT', path, 'read'));

		buffer.set(data.subarray(offset, end));
	}
}

const _Zip = {
	name: 'Zip',

	options: {
		data: {
			type: 'object',
			required: true,
			validator(buff: unknown) {
				if (!(buff instanceof ArrayBuffer) && !ArrayBuffer.isView(buff)) {
					throw new ErrnoError(Errno.EINVAL, 'Options is not a valid buffer');
				}
			},
		},
		name: { type: 'string', required: false },
	},

	isAvailable(): boolean {
		return true;
	},

	create({ name, data }: ZipOptions): ZipFS {
		return new ZipFS(name ?? '', ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data));
	},
} satisfies Backend<ZipFS, ZipOptions>;
type _Zip = typeof _Zip;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Zip extends _Zip {}
export const Zip: Zip = _Zip;
