import { configureSingle, InMemory, CopyOnWrite } from '@zenfs/core';
import { readFileSync } from 'node:fs';
import { Tar } from '../dist/tar/fs.js';

await configureSingle({
	backend: CopyOnWrite,
	readable: {
		backend: Tar,
		data: readFileSync(import.meta.dirname + '/files/core.tar'),
		name: 'core.tar',
	},
	writable: {
		backend: InMemory,
		label: 'tests',
	},
});
