/* This test suite tests the functionality of exclusively the backend */
import { configureSingle, fs } from '@zenfs/core';
import { readFileSync } from 'fs';
import assert from 'node:assert';
import { suite, test } from 'node:test';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { Iso } from '../dist/iso/fs.js';
// @ts-expect-error 7016
import { setupLogs } from '@zenfs/core/tests/logs.js';

setupLogs();

await suite('Basic ISO9660 operations', () => {
	test('Configure', async () => {
		const data = readFileSync(dirname(fileURLToPath(import.meta.url)) + '/files/data.iso');
		//const data = buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		await configureSingle({ backend: Iso, data });
	});

	test('readdir /', () => {
		assert.equal(fs.readdirSync('/').length, 3);
	});

	test('read /one.txt', () => {
		assert.equal(fs.readFileSync('/one.txt', 'utf8'), '1');
	});

	test('read /two.txt', () => {
		assert.equal(fs.readFileSync('/two.txt', 'utf8'), 'two');
	});

	test('readdir /nested', () => {
		assert.equal(fs.readdirSync('/nested').length, 1);
	});

	test('readdir /nested/omg.txt', () => {
		assert.equal(fs.readFileSync('/nested/omg.txt', 'utf8'), 'This is a nested file!');
	});
});
