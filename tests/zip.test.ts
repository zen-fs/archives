import { fromStream, Zip } from '@zenfs/archives';
import { configureSingle, fs } from '@zenfs/core';
// @ts-expect-error 7016
import { setupLogs } from '@zenfs/core/tests/logs.js';
import { zipSync } from 'fflate';
import assert from 'node:assert/strict';
import { fstatSync, readFileSync, readSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { suite, test } from 'node:test';
import { encodeUTF8 } from 'utilium';

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

	test('read /nested/omg.txt', () => {
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

await suite('ZIP case fold', {}, () => {
	test('Configure', async () => {
		const buffer = readFileSync(import.meta.dirname + '/files/data.zip');
		const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		await configureSingle({ backend: Zip, data, caseFold: 'upper' });
	});

	test('read /ONES.TXT', () => {
		assert.equal(fs.readFileSync('/ONE.TXT', 'utf8'), '1');
	});

	test('read /NESTED/OMG.TXT', () => {
		assert.equal(fs.readFileSync('/NESTED/OMG.TXT', 'utf8'), 'This is a nested file!');
	});

	test('readdir /NESTED', () => {
		assert.equal(fs.readdirSync('/NESTED').length, 1);
	});

	test('read /nested/omg.txt (all lower)', () => {
		assert.equal(fs.readFileSync('/nested/omg.txt', 'utf8'), 'This is a nested file!');
	});

	test('readdir /Nested (mixed case)', () => {
		assert.equal(fs.readdirSync('/Nested').length, 1);
	});
});

await suite('ZIP lazy sync reads #20', () => {
	test('Configure', async () => {
		const buffer = readFileSync(import.meta.dirname + '/files/data.zip');
		const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		await configureSingle({ backend: Zip, data, lazy: true });
	});

	test('first read of an entry does not throw EAGAIN', () => {
		assert.equal(fs.readFileSync('/nested/omg.txt', 'utf8'), 'This is a nested file!');
	});

	_runTests();
});

await using handle = await open(import.meta.dirname + '/files/data.zip');

await suite('ZIP Streaming', () => {
	test('Configure', async () => {
		const stream = handle.readableWebStream() as ReadableStream;
		const { size } = await handle.stat();
		await configureSingle({ backend: Zip, data: fromStream(stream, size) });
	});

	_runTests();
});

await suite('Custom data source', () => {
	test('Configure', async () => {
		const { size } = fstatSync(handle.fd);

		await configureSingle({
			backend: Zip,
			data: {
				size,
				get(offset, length) {
					const data = new Uint8Array(length);
					const read = readSync(handle.fd, data, { position: offset, length });
					assert.equal(read, length);
					return data;
				},
			},
		});
	});

	_runTests();
});

await suite('ZIP stored empty directories', () => {
	test('Configure', async () => {
		const empty = new Uint8Array(0);
		const data = zipSync({
			'keep.txt': encodeUTF8('hi'),
			'empty/': empty,
			'nested/': empty,
			'nested/deep/': empty,
			'nested/omg.txt': encodeUTF8('This is a nested file!'),
		});
		await configureSingle({ backend: Zip, data });
	});

	test('readdir /', () => {
		assert.deepEqual(fs.readdirSync('/').sort(), ['empty', 'keep.txt', 'nested']);
	});

	test('stat /empty', () => {
		assert.ok(fs.statSync('/empty').isDirectory());
	});

	test('readdirSync /empty', () => {
		assert.deepEqual(fs.readdirSync('/empty'), []);
	});

	test('readdir /empty', async () => {
		assert.deepEqual(await fs.promises.readdir('/empty'), []);
	});

	test('readdir /nested', () => {
		assert.deepEqual(fs.readdirSync('/nested').sort(), ['deep', 'omg.txt']);
	});

	test('readdirSync /nested/deep', () => {
		assert.deepEqual(fs.readdirSync('/nested/deep'), []);
	});

	test('read /empty throws EISDIR', () => {
		assert.throws(() => fs.readFileSync('/empty'), { code: 'EISDIR' });
	});
});
