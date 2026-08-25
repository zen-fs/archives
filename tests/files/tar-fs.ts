import { readFileSync } from 'node:fs';
import { Tar } from '../../src/tar/fs.ts';
import { configureSingle, fs } from '@zenfs/core';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { configure as configureLog, fancy } from 'kerium/log';
import { gunzipSync } from 'node:zlib';

const {
	values: options,
	positionals: [name = 'data.tar'],
} = parseArgs({
	options: {
		extra: { short: 'x', type: 'boolean', default: false },
		verbose: { short: 'v', type: 'boolean', default: false },
		gzip: { short: 'z', type: 'boolean', default: false },
	},
	strict: true,
	allowPositionals: true,
});

configureLog({ level: options.verbose ? 'debug' : 'info', format: fancy({ style: 'ansi', colorize: 'message' }) });

const fileData = readFileSync(join(import.meta.dirname, name));

const data = options.gzip ? gunzipSync(fileData) : fileData;

await configureSingle({ backend: Tar, data, name });

console.log(fs.readdirSync('/'));
debugger;
