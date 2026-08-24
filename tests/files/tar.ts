import * as tar from '../../src/tar/headers.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, styleText, type InspectColor } from 'node:util';
import * as io from 'ioium/node';

const {
	values: options,
	positionals: [path = join(import.meta.dirname, 'data.tar')],
} = parseArgs({
	options: {
		extra: { short: 'x', type: 'boolean', default: false },
		verbose: { short: 'v', type: 'boolean', default: false },
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
		entry.type === tar.TypeFlag.Sym && ['link', entry.linkname],
		['owner', 'uid=' + entry.uid + (entry.uname.length ? `(${entry.uname})` : ''), 'gid=' + entry.gid + (entry.gname.length ? `(${entry.gname})` : '')],
		['device', styleText('yellow', entry.devmajor.toString()) + ':' + styleText('yellow', entry.devminor.toString())],
		['version', entry.version.toString()],
		['checksum', '0x' + entry.chksum.toString(16)],
		['prefix', entry.prefix],
	].filter<string[]>(row => !!row)) {
		console.log(label.padEnd(8), ':', ...value);
	}
}

for (let off = 0; off + 512 < data.length; off += 512) {
	const header = new tar.PosixHeader(data.buffer, data.byteOffset + off, data.byteLength);

	if (tar.decodeString(header.magic) !== tar.magic) {
		console.log(`skipping 0x${off.toString(16)}, bad magic`);
		continue;
	}

	const entry = header.toEntry();

	if (options.extra) dumpFull(entry);
	else dumpLine(entry);

	if (entry.size) {
		const alignedSize = Math.ceil(entry.size / 512) * 512;
		off += alignedSize;
		const content = new Uint8Array(data.buffer, header.byteOffset + 512, alignedSize);
		io.debug('skipping forward', alignedSize / 512, 'blocks');
	}
}
