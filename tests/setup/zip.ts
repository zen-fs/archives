import { configureSingle, CopyOnWrite, InMemory } from '@zenfs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Zip } from '../../dist/zip/fs.js';

const buf = readFileSync(join(import.meta.dirname, '../files/core.zip'));

await configureSingle({
	backend: CopyOnWrite,
	readable: {
		backend: Zip,
		data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
		name: 'core.zip',
	},
	writable: {
		backend: InMemory,
		label: 'tests',
	},
});
