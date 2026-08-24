// Derived from https://www.gnu.org/software/tar/manual/html_node/Standard.html

/* tar Header Block, from POSIX 1003.1-2024
   <https://pubs.opengroup.org/onlinepubs/9799919799/utilities/pax.html#tagtcjh_21>  */

import { array, struct, types as t } from 'memium';

export const magic = 'ustar\0';
export const version = '00';

function _char(ascii: string) {
	return ascii.charCodeAt(0);
}

const asciiZero = '0'.charCodeAt(0);

/**
 * "Each numeric field of width w contains w minus 1 digits, and a null. (In the extended GNU format, the numeric fields can take other forms.)"
 */
export function oct2bin(data: Uint8Array): number {
	let n = 0;

	for (let i = 0; i < data.length && data[i] !== 0; i++) {
		n *= 8;
		n += data[i] - asciiZero;
	}
	return n;
}

export function decodeString(data: Uint8Array): string {
	let str = '';
	for (let i = 0; i < data.length && data[i] !== 0; i++) str += String.fromCharCode(data[i]);
	return str;
}

export interface Entry {
	name: string;
	mode: number;
	uid: number;
	gid: number;
	size: number;
	chksum: number;
	type: TypeFlag;
	linkname: string;
	version: number;
	uname: string;
	gname: string;
	devmajor: number;
	devminor: number;
	prefix: string;
}

/** POSIX header. */
export class PosixHeader extends struct.packed('posix_header', {
	name: t.char(100),
	mode: t.char(8),
	uid: t.char(8),
	gid: t.char(8),
	size: t.char(12),
	mtime: t.char(12),
	chksum: t.char(8),
	typeflag: t.char.$type<TypeFlag>(),
	linkname: t.char(100),
	magic: t.char(6),
	version: t.char(2),
	uname: t.char(32),
	gname: t.char(32),
	devmajor: t.char(8),
	devminor: t.char(8),
	prefix: t.char(155),
}) {
	toEntry() {
		return {
			name: decodeString(this.name),
			mode: oct2bin(this.mode),
			uid: oct2bin(this.uid),
			gid: oct2bin(this.gid),
			size: oct2bin(this.size),
			chksum: oct2bin(this.chksum),
			type: this.typeflag,
			linkname: decodeString(this.linkname),
			version: oct2bin(this.version),
			uname: decodeString(this.uname),
			gname: decodeString(this.gname),
			devmajor: oct2bin(this.devmajor),
			devminor: oct2bin(this.devminor),
			prefix: decodeString(this.prefix),
		};
	}
}

/** Values used in typeflag field. */
export enum TypeFlag {
	Reg = _char('0'),
	AReg = 0,
	Lnk = _char('1'),
	Sym = _char('2'),
	Chr = _char('3'),
	Blk = _char('4'),
	Dir = _char('5'),
	Fifo = _char('6'),
	Cont = _char('7'),
	Xhd = _char('x'),
	Xgl = _char('g'),
}

/** Bits used in the mode field, values in octal. */
export enum Mode {
	/** set UID on execution */
	SUID = 0o4000,
	/** set GID on execution */
	SGID = 0o2000,
	/** reserved */
	SVTX = 0o1000,
	// file permissions
	/** read by owner */
	UREAD = 0o0400,
	/** write by owner */
	UWRITE = 0o0200,
	/** execute/search by owner */
	UEXEC = 0o0100,
	/** read by group */
	GREAD = 0o0040,
	/** write by group */
	GWRITE = 0o0020,
	/** execute/search by group */
	GEXEC = 0o0010,
	/** read by other */
	OREAD = 0o0004,
	/** write by other */
	OWRITE = 0o0002,
	/** execute/search by other */
	OEXEC = 0o0001,
}

/* tar Header Block, GNU extensions.  */

/* *BEWARE* *BEWARE* *BEWARE* that the following information is still
   boiling, and may change.  Even if the OLDGNU format description should be
   accurate, the so-called GNU format is not yet fully decided.  It is
   surely meant to use only extensions allowed by POSIX, but the sketch
   below repeats some ugliness from the OLDGNU format, which should rather
   go away.  Sparse files should be saved in such a way that they do *not*
   require two passes at archive creation time.  Huge files get some POSIX
   fields to overflow, alternate solutions have to be sought for this.  */

/* Descriptor for a single file hole.  */

export const Sparse = struct.packed('sparse', {
	offset: t.char(12),
	numbytes: t.char(12),
});

/* Sparse files are not supported in POSIX ustar format.  For sparse files
   with a POSIX header, a GNU extra header is provided which holds overall
   sparse information and a few sparse descriptors.  When an old GNU header
   replaces both the POSIX header and the GNU extra header, it holds some
   sparse descriptors too.  Whether POSIX or not, if more sparse descriptors
   are still needed, they are put into as many successive sparse headers as
   necessary.  The following constants tell how many sparse descriptors fit
   in each kind of header able to hold them.  */

export const sparsesIn = {
	extraHeader: 16,
	oldgnuHeader: 4,
	sparseHeader: 21,
	starHeader: 4,
	startExtHeader: 21,
};

/* Extension header for sparse files, used immediately after the GNU extra
   header, and used only if all sparse information cannot fit into that
   extra header.  There might even be many such extension headers, one after
   the other, until all sparse information has been recorded.  */

export const SparseHeader = struct.packed('sparse_header', {
	sp: array(Sparse, sparsesIn.sparseHeader),
	isextended: t.char,
});

/* The old GNU format header conflicts with POSIX format in such a way that
   POSIX archives may fool old GNU tar’s, and POSIX tar’s might well be
   fooled by old GNU tar archives.  An old GNU format header uses the space
   used by the prefix field in a POSIX header, and cumulates information
   normally found in a GNU extra header.  With an old GNU tar header, we
   never see any POSIX header nor GNU extra header.  Supplementary sparse
   headers are allowed, however.  */

export const OldgnuHeader = struct.packed('oldgnu_header', {
	unused_pad1: t.char(345),
	atime: t.char(12),
	ctime: t.char(12),
	/** Multivolume archive: the offset of the start of this volume */
	offset: t.char(12),
	longnames: t.char(4),
	unused_pad2: t.char,
	sp: array(Sparse, sparsesIn.oldgnuHeader),
	isextended: t.char,
	realsize: t.char(12),
});

/* OLDGNU_MAGIC uses both magic and version fields, which are contiguous.
   Found in an archive, it indicates an old GNU header format, which will be
   hopefully become obsolescent.  With OLDGNU_MAGIC, uname and gname are
   valid, though the header is not truly POSIX conforming.  */
export const oldgnuMagic = 'ustar \0';

/* The standards committee allows only capital A through capital Z for
   user-defined expansion.  Letters in use in other implementations include:

   ’A’ Solaris Access Control List
   ’E’ Solaris Extended Attribute File
   ’I’ Inode only, as in ’star’
   ’N’ Obsolete GNU tar, for file names too long for main header.  */

export enum GnuType {
	/** This is a dir entry that contains the names of files that were in the dir at the time the dump was made.  */
	DUMPDIR = _char('D'),
	/** Identifies the *next* file on the tape as having a long linkname.  */
	LONGLINK = _char('K'),
	/** Identifies the *next* file on the tape as having a long name.  */
	LONGNAME = _char('L'),
	/** This is the continuation of a file that began on another volume.  */
	MULTIVOL = _char('M'),
	/** This is for sparse files.  */
	SPARSE = _char('S'),
	/** This file is a tape/volume header.  Ignore it on extraction.  */
	VOLHDR = _char('V'),
	/** Solaris extended header.  */
	XHDTYPE = _char('X'),
}

/* Jörg Schilling star header.  */

export const StarHeader = struct.packed('star_header', {
	name: t.char(100),
	mode: t.char(8),
	uid: t.char(8),
	gid: t.char(8),
	size: t.char(12),
	mtime: t.char(12),
	chksum: t.char(8),
	typeflag: t.char.$type<TypeFlag>(),
	linkname: t.char(100),
	magic: t.char(6),
	version: t.char(2),
	uname: t.char(32),
	gname: t.char(32),
	devmajor: t.char(8),
	devminor: t.char(8),
	prefix: t.char(131),
	atime: t.char(12),
	ctime: t.char(12),
});

export const StarInHeader = struct.packed('star_in_header', {
	/** Everything that is before t_prefix */
	fill: t.char(345),
	/** t_name prefix */
	prefix: t.char(1),
	fill2: t.char,
	fill3: t.char(8),
	isextended: t.char,
	sp: array(Sparse, sparsesIn.starHeader),
	/** Actual size of the file */
	realsize: t.char(12),
	/** Offset of multivolume contents */
	offset: t.char(12),
	atime: t.char(12),
	ctime: t.char(12),
	mfill: t.char(8),
	/** "tar" */
	xmagic: t.char(4),
});

export const StarExtHeader = struct.packed('star_ext_header', {
	sp: array(Sparse, sparsesIn.starHeader),
	isextended: t.char,
});
