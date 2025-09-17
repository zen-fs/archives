// SPDX-License-Identifier: LGPL-3.0-or-later
import { decodeUTF8 } from 'utilium';
import type { ZipDataSource } from './fs.js';

/**
 * Converts the input `time` and `date` in MS-DOS format into a `Date`.
 *
 * MS-DOS format:
 * second			5 bits (2 second-precision)
 * minute			6 bits
 * hour				5 bits
 * day (1-31)		5 bits
 * month (1-23)		4 bits (MSDOS indexes with 1)
 * year (from 1980)	7 bits
 * @hidden
 */
export function msdosDate(datetime: number): Date {
	return new Date(
		((datetime >> 25) & 127) + 1980, // year
		((datetime >> 21) & 15) - 1, // month
		(datetime >> 16) & 31, // day
		(datetime >> 11) & 31, // hour
		(datetime >> 5) & 63, // minute
		(datetime & 31) * 2 // second
	);
}

/**
 * 8-bit ASCII with the extended character set. Unlike regular ASCII, we do not mask the high bits.
 * @see http://en.wikipedia.org/wiki/Extended_ASCII
 */
export const extendedASCIIChars = [
	'\u00C7',
	'\u00FC',
	'\u00E9',
	'\u00E2',
	'\u00E4',
	'\u00E0',
	'\u00E5',
	'\u00E7',
	'\u00EA',
	'\u00EB',
	'\u00E8',
	'\u00EF',
	'\u00EE',
	'\u00EC',
	'\u00C4',
	'\u00C5',
	'\u00C9',
	'\u00E6',
	'\u00C6',
	'\u00F4',
	'\u00F6',
	'\u00F2',
	'\u00FB',
	'\u00F9',
	'\u00FF',
	'\u00D6',
	'\u00DC',
	'\u00F8',
	'\u00A3',
	'\u00D8',
	'\u00D7',
	'\u0192',
	'\u00E1',
	'\u00ED',
	'\u00F3',
	'\u00FA',
	'\u00F1',
	'\u00D1',
	'\u00AA',
	'\u00BA',
	'\u00BF',
	'\u00AE',
	'\u00AC',
	'\u00BD',
	'\u00BC',
	'\u00A1',
	'\u00AB',
	'\u00BB',
	'_',
	'_',
	'_',
	'\u00A6',
	'\u00A6',
	'\u00C1',
	'\u00C2',
	'\u00C0',
	'\u00A9',
	'\u00A6',
	'\u00A6',
	'+',
	'+',
	'\u00A2',
	'\u00A5',
	'+',
	'+',
	'-',
	'-',
	'+',
	'-',
	'+',
	'\u00E3',
	'\u00C3',
	'+',
	'+',
	'-',
	'-',
	'\u00A6',
	'-',
	'+',
	'\u00A4',
	'\u00F0',
	'\u00D0',
	'\u00CA',
	'\u00CB',
	'\u00C8',
	'i',
	'\u00CD',
	'\u00CE',
	'\u00CF',
	'+',
	'+',
	'_',
	'_',
	'\u00A6',
	'\u00CC',
	'_',
	'\u00D3',
	'\u00DF',
	'\u00D4',
	'\u00D2',
	'\u00F5',
	'\u00D5',
	'\u00B5',
	'\u00FE',
	'\u00DE',
	'\u00DA',
	'\u00DB',
	'\u00D9',
	'\u00FD',
	'\u00DD',
	'\u00AF',
	'\u00B4',
	'\u00AD',
	'\u00B1',
	'_',
	'\u00BE',
	'\u00B6',
	'\u00A7',
	'\u00F7',
	'\u00B8',
	'\u00B0',
	'\u00A8',
	'\u00B7',
	'\u00B9',
	'\u00B3',
	'\u00B2',
	'_',
	' ',
];

/**
 * Safely decodes the string from a buffer.
 * @hidden
 */
export async function safeDecode(source: ZipDataSource<any>, utf8: boolean, start: number, length: number): Promise<string> {
	if (length === 0) {
		return '';
	}

	const uintArray = await source.get(start, length);
	if (utf8) {
		return decodeUTF8(uintArray);
	} else {
		return [...uintArray].map(char => (char > 127 ? extendedASCIIChars[char - 128] : String.fromCharCode(char))).join('');
	}
}
