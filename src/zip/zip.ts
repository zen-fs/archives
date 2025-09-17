// SPDX-License-Identifier: LGPL-3.0-or-later
import { log, withErrno } from 'kerium';
import { sizeof } from 'memium';
import { $from, struct, types as t } from 'memium/decorators';
import { CompressionMethod, decompressionMethods } from './compression.js';
import type { ZipDataSource } from './fs.js';
import { msdosDate, safeDecode } from './utils.js';

/**
 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.2.2
 */
export enum AttributeCompat {
	MSDOS = 0,
	AMIGA = 1,
	OPENVMS = 2,
	UNIX = 3,
	VM_CMS = 4,
	ATARI_ST = 5,
	OS2_HPFS = 6,
	MAC = 7,
	Z_SYSTEM = 8,
	CP_M = 9,
	NTFS = 10,
	MVS = 11,
	VSE = 12,
	ACORN_RISC = 13,
	VFAT = 14,
	ALT_MVS = 15,
	BEOS = 16,
	TANDEM = 17,
	OS_400 = 18,
	OSX = 19,
}

/**
 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.3.7
 */
@struct.packed('LocalFileHeader')
export class LocalFileHeader<TBuffer extends ArrayBufferLike = ArrayBuffer> extends $from.typed(Uint8Array)<TBuffer> {
	_source!: ZipDataSource<TBuffer>;

	@t.uint32 public accessor signature!: number;

	public check() {
		if (this.signature !== 0x04034b50) {
			throw withErrno('EINVAL', 'Invalid Zip file: Local file header has invalid signature: ' + this.signature);
		}
	}

	/**
	 * The minimum supported ZIP specification version needed to extract the file.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.3
	 */
	@t.uint16 public accessor versionNeeded!: number;

	/**
	 * General purpose bit flags
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.4
	 */
	@t.uint16 public accessor flags!: number;

	/**
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.5
	 */
	@t.uint16 public accessor compressionMethod!: CompressionMethod;

	/**
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.6
	 */
	@t.uint32 protected accessor datetime!: number;

	/**
	 * The date and time are encoded in standard MS-DOS format.
	 * This getter decodes the date.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.6
	 */
	public get lastModified(): Date {
		return msdosDate(this.datetime);
	}

	/**
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.7
	 */
	@t.uint32 public accessor crc32!: number;

	/**
	 * The size of the file compressed.
	 * If bit 3 of the general purpose bit flag is set, set to zero.
	 * central directory's entry is used
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.8
	 */
	@t.uint32 public accessor compressedSize!: number;

	/**
	 * The size of the file uncompressed
	 * If bit 3 of the general purpose bit flag is set, set to zero.
	 * central directory's entry is used
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.9
	 */
	@t.uint32 public accessor uncompressedSize!: number;

	/**
	 * The length of the file name
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.10
	 */
	@t.uint16 public accessor nameLength!: number;

	/**
	 * The length of the extra field
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.11
	 */
	@t.uint16 public accessor extraLength!: number;

	/**
	 * The name of the file, with optional relative path.
	 * @see CentralDirectory.fileName
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.17
	 */
	name!: string;

	/**
	 * This should be used for storage expansion.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.28
	 */
	extra!: Uint8Array;

	public get size(): number {
		return LocalFileHeader.size + this.nameLength + this.extraLength;
	}

	public get useUTF8(): boolean {
		return !!(this.flags & (1 << 11));
	}

	static async from<TBuffer extends ArrayBufferLike = ArrayBuffer>(source: ZipDataSource<TBuffer>, offset: number): Promise<LocalFileHeader<TBuffer>> {
		const entryData = await source.get(offset, LocalFileHeader.size);
		const cd = new LocalFileHeader<TBuffer>(entryData.buffer, entryData.byteOffset);
		cd._source = source;
		offset += LocalFileHeader.size;
		cd.name = await safeDecode(source, cd.useUTF8, offset, cd.nameLength);
		offset += cd.nameLength;
		cd.extra = await source.get(offset, cd.extraLength);
		offset += cd.extraLength;
		return cd;
	}
}

/**
 * Archive extra data record
 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.3.11
 */
@struct.packed('ExtraDataRecord')
export class ExtraDataRecord<TBuffer extends ArrayBufferLike = ArrayBuffer> extends $from.typed(Uint8Array)<TBuffer> {
	/** @internal @hidden */
	_source!: ZipDataSource<TBuffer>;

	@t.uint32 public accessor signature!: number;

	public check() {
		if (this.signature != 0x08064b50) {
			throw withErrno('EINVAL', 'Invalid archive extra data record signature: ' + this.signature);
		}
	}

	@t.uint32 public accessor length!: number;

	/**
	 * This should be used for storage expansion.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.28
	 */
	public extraField!: Uint8Array;

	static async from<TBuffer extends ArrayBufferLike = ArrayBuffer>(source: ZipDataSource<TBuffer>, offset: number): Promise<ExtraDataRecord<TBuffer>> {
		const entryData = await source.get(offset, ExtraDataRecord.size);
		const record = new ExtraDataRecord<TBuffer>(entryData.buffer, entryData.byteOffset);
		record._source = source;
		offset += ExtraDataRecord.size;
		record.extraField = await source.get(offset, record.length);
		return record;
	}
}

/**
 * Referred to as a "central directory" record in the spec.
 * This is a file metadata entry inside the "central directory".
 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.3.12
 */
@struct.packed('FileEntry')
export class FileEntry<TBuffer extends ArrayBufferLike = ArrayBuffer> extends $from.typed(Uint8Array)<TBuffer> {
	/** @internal @hidden */
	_source!: ZipDataSource<TBuffer>;

	@t.uint32 public accessor signature!: number;

	public check() {
		if (this.signature != 0x02014b50) {
			throw withErrno('EINVAL', 'Invalid Zip file: Central directory record has invalid signature: ' + this.signature);
		}
	}

	/**
	 * The lower byte of "version made by", indicates the ZIP specification version supported by the software used to encode the file.
	 * major — floor `zipVersion` / 10
	 * minor — `zipVersion` mod 10
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.2
	 */
	@t.uint8 public accessor zipVersion!: number;

	/**
	 * The upper byte of "version made by", indicates the compatibility of the file attribute information.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.2
	 */
	@t.uint8 public accessor attributeCompat!: AttributeCompat;

	/**
	 * The minimum supported ZIP specification version needed to extract the file.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.3
	 */
	@t.uint16 public accessor versionNeeded!: number;

	/**
	 * General purpose bit flags
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.4
	 */
	@t.uint16 public accessor flag!: number;

	public get useUTF8(): boolean {
		return !!(this.flag & (1 << 11));
	}

	public get isEncrypted(): boolean {
		return !!(this.flag & 1);
	}

	/**
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.5
	 */
	@t.uint16 public accessor compressionMethod!: CompressionMethod;

	/**
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.6
	 */
	@t.uint32 protected accessor datetime!: number;

	/**
	 * The date and time are encoded in standard MS-DOS format.
	 * This getter decodes the date.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.6
	 */
	public get lastModified(): Date {
		return msdosDate(this.datetime);
	}

	/**
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.7
	 */
	@t.uint32 public accessor crc32!: number;

	/**
	 * The size of the file compressed
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.8
	 */
	@t.uint32 public accessor compressedSize!: number;

	/**
	 * The size of the file uncompressed
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.9
	 */
	@t.uint32 public accessor uncompressedSize!: number;

	/**
	 * The length of the file name
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.10
	 */
	@t.uint16 public accessor nameLength!: number;

	/**
	 * The length of the extra field
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.11
	 */
	@t.uint16 public accessor extraLength!: number;

	/**
	 * The length of the comment
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.12
	 */
	@t.uint16 public accessor commentLength!: number;

	/**
	 * The number of the disk on which this file begins.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.13
	 */
	@t.uint16 public accessor startDisk!: number;

	/**
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.14
	 */
	@t.uint16 public accessor internalAttributes!: number;

	/**
	 * The mapping of the external attributes is host-system dependent.
	 * For MS-DOS, the low order byte is the MS-DOS directory attribute byte.
	 * If input came from standard input, this field is set to zero.
	 * @see attributeCompat
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.15
	 */
	@t.uint32 public accessor externalAttributes!: number;

	/**
	 * This is the offset from the start of the first disk on which
	 * this file appears to where the local header should be found.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.16
	 */
	@t.uint32 public accessor headerRelativeOffset!: number;

	/**
	 * The name of the file, with optional relative path.
	 * The filename is preloaded here, since looking it up is expensive.
	 *
	 * 4.4.17.1 claims:
	 * - All slashes are forward ('/') slashes.
	 * - Filename doesn't begin with a slash.
	 * - No drive letters
	 * - If filename is missing, the input came from standard input.
	 *
	 * Unfortunately, this isn't true in practice.
	 * Some Windows zip utilities use a backslash here, but the correct Unix-style path in file headers.
	 * To avoid seeking all over the file to recover the known-good filenames from file headers, we simply convert '\' to '/' here.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.17
	 */
	name!: string;

	/**
	 * This should be used for storage expansion.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.28
	 */
	extra!: Uint8Array;

	/**
	 * The comment for this file
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.18
	 */
	comment!: string;

	/**
	 * The total size of the this entry
	 */
	public get size(): number {
		return sizeof(FileEntry) + this.nameLength + this.extraLength + this.commentLength;
	}

	/**
	 * Whether this entry is a directory
	 */
	public get isDirectory(): boolean {
		/* 
			NOTE: This assumes that the zip file implementation uses the lower byte
			of external attributes for DOS attributes for backwards-compatibility.
			This is not mandated, but appears to be commonplace.
			According to the spec, the layout of external attributes is platform-dependent.
			If that fails, we also check if the name of the file ends in '/'.
		*/
		return !!(this.externalAttributes & 16) || this.name.at(-1) == '/';
	}

	/**
	 * Whether this entry is a file
	 */
	public get isFile(): boolean {
		return !this.isDirectory;
	}

	async loadContents(): Promise<void> {
		// Get the local header before we can figure out where the actual compressed data starts.
		const rawLocalHeader = await this._source.get(this.headerRelativeOffset, sizeof(LocalFileHeader));
		const { compressionMethod, size, name } = new LocalFileHeader(rawLocalHeader.buffer, rawLocalHeader.byteOffset);

		const data = await this._source.get(this.headerRelativeOffset + size, this.compressedSize);
		// Check the compression
		const decompress = decompressionMethods[compressionMethod];
		if (typeof decompress != 'function') {
			const mname: string = compressionMethod in CompressionMethod ? CompressionMethod[compressionMethod] : compressionMethod.toString();
			throw withErrno('EINVAL', `Invalid compression method on file "${name}": ${mname}`);
		}
		this.contents = decompress(data, this.compressedSize, this.uncompressedSize, this.flag);
	}

	/**
	 * Gets the file data, and decompresses it if needed.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.3.8
	 */
	contents!: Uint8Array;

	/**
	 * @deprecated Use `contents`
	 */
	public get data(): Uint8Array {
		return this.contents;
	}

	static async from<TBuffer extends ArrayBufferLike = ArrayBuffer>(source: ZipDataSource<TBuffer>, offset: number): Promise<FileEntry<TBuffer>> {
		const entryData = await source.get(offset, FileEntry.size);
		const cd = new FileEntry<TBuffer>(entryData.buffer, entryData.byteOffset);
		cd._source = source;
		offset += FileEntry.size;
		cd.name = await safeDecode(source, cd.useUTF8, offset, cd.nameLength);
		offset += cd.nameLength;
		cd.extra = await source.get(offset, cd.extraLength);
		offset += cd.extraLength;
		cd.comment = await safeDecode(source, cd.useUTF8, offset, cd.commentLength);
		return cd;
	}
}

/**
 * Digital signature
 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.3.13
 */
@struct.packed('DigitalSignature')
export class DigitalSignature<TBuffer extends ArrayBufferLike = ArrayBuffer> extends $from.typed(Uint8Array)<TBuffer> {
	/** @internal @hidden */
	_source!: ZipDataSource<TBuffer>;

	@t.uint32 public accessor signature!: number;

	public check() {
		if (this.signature != 0x05054b50) {
			throw withErrno('EINVAL', 'Invalid digital signature signature: ' + this.signature);
		}
	}

	@t.uint16 public accessor size!: number;

	public signatureData!: Uint8Array;

	static async from<TBuffer extends ArrayBufferLike = ArrayBuffer>(source: ZipDataSource<TBuffer>, offset: number): Promise<DigitalSignature<TBuffer>> {
		const data = await source.get(offset, DigitalSignature.size);
		const ds = new DigitalSignature<TBuffer>(data.buffer, data.byteOffset);
		ds._source = source;
		offset += DigitalSignature.size;
		ds.signatureData = await source.get(offset, ds.size);
		return ds;
	}
}

/**
 * Overall ZIP file header.
 * Also called "end of central directory record"
 * Internally, ZIP files have only a single directory: the "central directory".
 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.3.16
 */
@struct.packed('Header')
export class Header<TBuffer extends ArrayBufferLike = ArrayBuffer> extends $from.typed(Uint8Array)<TBuffer> {
	/** @internal @hidden */
	_source!: ZipDataSource<TBuffer>;

	@t.uint32 public accessor signature!: number;

	public check() {
		if (this.signature != 0x06054b50) {
			throw withErrno('EINVAL', 'Invalid Zip file: End of central directory record has invalid signature: 0x' + this.signature.toString(16));
		}
	}

	/**
	 * The number of this disk
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.19
	 */
	@t.uint16 public accessor disk!: number;

	/**
	 * The number of the disk with the start of the entries
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.20
	 */
	@t.uint16 public accessor entriesDisk!: number;

	/**
	 * Total number of entries on this disk
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.21
	 */
	@t.uint16 public accessor diskEntryCount!: number;

	/**
	 * Total number of entries
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.22
	 */
	@t.uint16 public accessor totalEntryCount!: number;

	/**
	 * Size of the "central directory"
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.23
	 */
	@t.uint32 public accessor size!: number;

	/**
	 * Offset of start of "central directory" with respect to the starting disk number
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.24
	 */
	@t.uint32 public accessor offset!: number;

	/**
	 * Comment length
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.25
	 */
	@t.uint16 public accessor commentLength!: number;

	/**
	 * Assuming the content is UTF-8 encoded. The specification doesn't specify.
	 * @see http://pkware.com/documents/casestudies/APPNOTE.TXT#:~:text=4.4.26
	 */
	comment!: string;
}

/**
 * Locates the end of central directory record at the end of the file.
 * Throws an exception if it cannot be found.
 *
 * @remarks
 * Unfortunately, the comment is variable size and up to 64K in size.
 * We assume that the magic signature does not appear in the comment,
 * and in the bytes between the comment and the signature.
 * Other ZIP implementations make this same assumption,
 * since the alternative is to read thread every entry in the file.
 *
 * Offsets in this function are negative (i.e. from the end of the file).
 *
 * There is no byte alignment on the comment
 */
export async function computeEOCD<T extends ArrayBufferLike = ArrayBuffer>(source: ZipDataSource<T>): Promise<Header<T>> {
	for (let offset = source.size - 22; offset > source.size - 0xffff; offset--) {
		const data = await source.get(offset, 22);
		const sig = (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0;
		// The magic number is the EOCD Signature
		if (sig === 0x6054b50) {
			log.debug('zipfs: found End of Central Directory signature at 0x' + offset.toString(16));
			const header = new Header<T>(data.buffer, data.byteOffset);
			header._source = source;
			header.comment = await safeDecode(source, true, offset + Header.size, header.commentLength);
			return header;
		}
	}
	throw log.err(withErrno('EINVAL', 'zipfs: could not locate End of Central Directory signature'));
}
