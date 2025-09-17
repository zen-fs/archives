import { fromStream, Zip } from '@zenfs/archives';
import { configureSingle, fs } from '@zenfs/core';
// @ts-expect-error 7016
import { setupLogs } from '@zenfs/core/tests/logs.js';
import assert from 'node:assert/strict';
import { fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { suite, test } from 'node:test';

setupLogs();

function _runTests() {
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
}

suite('Basic ZIP operations', () => {
	test('Configure', async () => {
		const buffer = readFileSync(import.meta.dirname + '/files/data.zip');
		const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		await configureSingle({ backend: Zip, data });
	});

	_runTests();
});

suite('ZIP Streaming', async () => {
	await using handle = await open(import.meta.dirname + '/files/data.zip');

	test('Configure', async () => {
		const stream = handle.readableWebStream() as ReadableStream;
		const { size } = await handle.stat();
		await configureSingle({ backend: Zip, data: fromStream(stream, size) });
	});

	_runTests();
});

suite('Custom data source', () => {
	test('Configure', async () => {
		const fd = openSync(import.meta.dirname + '/files/data.zip', 'r');
		const { size } = fstatSync(fd);

		await configureSingle({
			backend: Zip,
			data: {
				size,
				get(offset, length) {
					const data = new Uint8Array(length);
					const read = readSync(fd, data, { position: offset, length });
					assert.equal(read, length);
					return data;
				},
			},
		});
	});

	_runTests();
});
