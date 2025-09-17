import { fromStream, Zip } from '@zenfs/archives';
import { configureSingle, fs } from '@zenfs/core';
// @ts-expect-error 7016
import { setupLogs } from '@zenfs/core/tests/logs.js';
import assert from 'node:assert';
import { readFileSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { suite, test } from 'node:test';

setupLogs();

suite('Basic ZIP operations', () => {
	test('Configure', async () => {
		const buffer = readFileSync(import.meta.dirname + '/files/data.zip');
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

suite('ZIP Streaming', () => {
	test('Configure', async () => {
		const stream = (await open(import.meta.dirname + '/files/data.zip')).readableWebStream() as ReadableStream;
		const { size } = statSync(import.meta.dirname + '/files/data.zip');
		await configureSingle({ backend: Zip, data: fromStream(stream, size) });
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
