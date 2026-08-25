import { configureSingle, fs, mounts } from '@zenfs/core';
import { configure as configureLog, fancy } from 'kerium/log';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { Tar, type TarFS } from '../../dist/tar/fs.js';

const {
	values: options,
	positionals: [name = 'data.tar'],
} = parseArgs({
	options: {
		extra: { short: 'x', type: 'boolean', default: false },
		verbose: { short: 'v', type: 'boolean', default: false },
		gzip: { short: 'z', type: 'boolean', default: false },
		log: { short: 'L', type: 'boolean', default: false },
		tree: { short: 'T', type: 'boolean', default: false },
		count: { short: 'C', type: 'boolean', default: false },
	},
	strict: true,
	allowPositionals: true,
});

if (options.log) configureLog({ level: options.verbose ? 'debug' : 'info', format: fancy({ style: 'ansi', colorize: 'message' }) });

const fileData = readFileSync(resolve(import.meta.dirname, name));

const data = options.gzip ? gunzipSync(fileData) : fileData;

const t0 = performance.now();
await configureSingle({ backend: Tar, data, name });
console.log('Configured in', Math.round(performance.now() - t0), 'ms');

const tarfs = mounts.get('/') as TarFS;
const nEntries = tarfs['inodes'].size;

function tree(path: string, depth: number = 0) {
	const dir = fs.readdirSync(path, { withFileTypes: true });
	for (const [i, ent] of dir.entries()) {
		const line = i == dir.length - 1 ? '└' : '├',
			intent = '│ '.repeat(depth);
		console.log(intent + line, ent.name);
		if (ent.isDirectory()) tree(join(path, ent.name), depth + 1);
	}
}

if (options.tree) {
	console.log('/');
	tree('/');
}

if (options.count) console.log('tarfs:', nEntries, 'entries');

debugger;
