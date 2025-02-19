import { configureSingle, fs } from '@zenfs/core';
import { readFileSync } from 'fs';
import assert from 'node:assert';
import { suite, test } from 'node:test';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { Zip } from '../dist/zip/fs.js';

suite('Basic ZIP operations', () => {
	test('Configure', async () => {
		const buffer = readFileSync(dirname(fileURLToPath(import.meta.url)) + '/files/data.zip');
		const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		await configureSingle({ backend: Zip, data });
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
