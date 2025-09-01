// SPDX-License-Identifier: LGPL-3.0-or-later
import { inflateSync } from 'fflate';

/**
 * 4.4.5
 */
export enum CompressionMethod {
	STORED = 0,
	SHRUNK = 1,
	REDUCED_1 = 2,
	REDUCED_2 = 3,
	REDUCED_3 = 4,
	REDUCED_4 = 5,
	IMPLODE = 6,
	DEFLATE = 8,
	DEFLATE64 = 9,
	TERSE_OLD = 10,
	BZIP2 = 12,
	LZMA = 14,
	TERSE_NEW = 18,
	LZ77 = 19,
	WAVPACK = 97,
	PPMD = 98,
}

export type decompress = (data: Uint8Array, compressedSize: number, uncompressedSize: number, flags: number) => Uint8Array;

/**
 * Maps CompressionMethod to function that decompresses.
 */
export const decompressionMethods: { [method in CompressionMethod]?: decompress } = {
	[CompressionMethod.DEFLATE](data): Uint8Array {
		return inflateSync(data);
	},

	[CompressionMethod.STORED](data, compressedSize, uncompressedSize): Uint8Array {
		return data.subarray(0, compressedSize);
	},
};
