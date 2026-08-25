import { configureSingle, CopyOnWrite, InMemory } from '@zenfs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Tar } from '../../dist/tar/fs.js';

await configureSingle({
	backend: CopyOnWrite,
	readable: {
		backend: Tar,
		data: readFileSync(join(import.meta.dirname, '../files/core.tar')),
		name: 'core.tar',
	},
	writable: {
		backend: InMemory,
		label: 'tests',
	},
});
