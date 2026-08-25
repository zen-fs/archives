import * as io from 'ioium/node';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, styleText, type InspectColor } from 'node:util';
import { decodeUTF8 } from 'utilium';
import * as tar from '../../src/tar/tar.ts';

const {
	values: options,
	positionals: [path = join(import.meta.dirname, 'data.tar')],
} = parseArgs({
	options: {
		extra: { short: 'x', type: 'boolean', default: false },
		verbose: { short: 'v', type: 'boolean', default: false },
		content: { short: 'c', type: 'boolean', default: false },
	},
	strict: true,
	allowPositionals: true,
});

if (options.verbose) io._setDebugOutput(true);

const data = readFileSync(path);

const nameColors = {
	[tar.TypeFlag.Reg]: 'reset',
	[tar.TypeFlag.AReg]: 'reset',
	[tar.TypeFlag.Lnk]: 'cyan',
	[tar.TypeFlag.Sym]: 'cyanBright',
	[tar.TypeFlag.Chr]: 'yellow',
	[tar.TypeFlag.Blk]: 'yellowBright',
	[tar.TypeFlag.Dir]: 'blue',
	[tar.TypeFlag.Fifo]: 'magenta',
	[tar.TypeFlag.Cont]: 'reset',
	[tar.TypeFlag.Xhd]: 'green',
	[tar.TypeFlag.Xgl]: 'greenBright',
} satisfies Record<tar.TypeFlag, InspectColor>;

function dumpLine(entry: tar.Entry): void {
	const line = [styleText(nameColors[entry.type], entry.name), entry.mode.toString(8)];
	if (entry.type == tar.TypeFlag.Sym) line.push('->', entry.linkname);
	console.log(...line);
}

function dumpFull(entry: tar.Entry): void {
	const nBlocks = Math.ceil(entry.size / 512);

	for (const [label, ...value] of [
		['name', styleText(nameColors[entry.type], entry.name)],
		['mode', entry.mode.toString(8)],
		['type', entry.type.toString(), `(${tar.TypeFlag[entry.type]})`],
		entry.type !== tar.TypeFlag.Dir && ['size', styleText('blue', entry.size.toString()), `(${nBlocks} blocks)`],
		['mtime', styleText('green', entry.mtime.toString())],
		entry.type === tar.TypeFlag.Sym && ['link', entry.linkname],
		['owner', 'uid=' + entry.uid + (entry.uname.length ? `(${entry.uname})` : ''), 'gid=' + entry.gid + (entry.gname.length ? `(${entry.gname})` : '')],
		['device', styleText('yellow', entry.devmajor.toString()) + ':' + styleText('yellow', entry.devminor.toString())],
		typeof entry.version == 'number' && ['version', entry.version.toString()],
		['checksum', '0x' + entry.chksum.toString(16)],
		entry.prefix && ['prefix', entry.prefix],
	].filter<string[]>(row => !!row)) {
		console.log(label.padEnd(8), ':', ...value);
	}
}

for (let off = 0; off + 512 < data.length; off += 512) {
	const header = new tar.PosixHeader(data.buffer, data.byteOffset + off, 512);

	const offStr = '0x' + off.toString(16);

	if (tar.decodeString(header.magic) === tar.oldgnuMagic) io.debug(offStr, 'has oldgnu magic');
	else if (tar.decodeString(header.magic) !== tar.magic) {
		io.debug(`skipping ${offStr}, bad magic`);
		continue;
	}

	const entry = header.toEntry();

	if (options.extra) {
		console.log(`at ${offStr}:`);
		dumpFull(entry);
	} else dumpLine(entry);

	if (entry.size) {
		const alignedSize = Math.ceil(entry.size / 512) * 512;
		off += alignedSize;
		const content = new Uint8Array(data.buffer, header.byteOffset + 512, entry.size);
		if (options.content) {
			console.log('Content:');
			console.log(styleText('yellow', decodeUTF8(content)));
		}
		io.debug('skipping forward', alignedSize / 512, 'blocks');
	}
}
