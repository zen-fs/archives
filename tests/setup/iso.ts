import { configureSingle, InMemory, CopyOnWrite } from '@zenfs/core';
import { readFileSync } from 'node:fs';
import { Iso } from '../../dist/iso/fs.js';
import { join } from 'node:path';

await configureSingle({
	backend: CopyOnWrite,
	readable: {
		backend: Iso,
		data: readFileSync(join(import.meta.dirname, '../files/core.iso')),
		name: 'core.iso',
	},
	writable: {
		backend: InMemory,
		label: 'tests',
	},
});
