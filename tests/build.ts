#!/usr/bin/env node
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as io from 'ioium/node';
import { execFileSync } from 'node:child_process';
import { zipFiles } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

declare module 'node:zlib' {
	function zipFiles(files: Iterable<[string, string]>, options?: object): Readable;
}

const _isoCommon = (target: string, source: string, vol = '-V') => ['-quiet', vol, 'CDROM', '-o', target, source];

const formats = {
		zip(this: void, target, source) {
			return pipeline(zipFiles(fs.readdirSync(source, { recursive: true, encoding: 'utf8' }).map(file => [join(source, file), file])), fs.createWriteStream(target));
		},
		iso: {
			genisoimage: _isoCommon,
			mkisofs: _isoCommon,
			xorrisofs: (out, src) => [..._isoCommon(out, src), '--norock'],
			hdiutil: (out, src) => ['makehybrid', '-quiet', '-iso', ..._isoCommon(out, src, '-default-volume-name')],
		},
		tar: {
			tar(out) {
				const isGNU = execFileSync('tar', ['--version'], { encoding: 'utf8' }).includes('GNU tar');

				return [
					'--create',
					'--format=ustar',
					'--file',
					out,
					'.',
					'--numeric-owner',
					...(isGNU ? ['--owner=0', '--group=0'] : ['--uid', '0', '--gid', '0', '--uname', '', '--gname', '']),
				];
			},
		},
	} satisfies Record<string, Record<string, (targetPath: string, sourcedir: string) => string[]> | ((targetPath: string, sourcedir: string) => void | Promise<void>)>,
	formatsNames = Object.keys(formats);

const { values: options } = parseArgs({
	options: {
		format: { short: 'f', type: 'string', multiple: true, default: formatsNames },
		incremental: { short: 'i', type: 'boolean', default: false },
		'keep-going': { short: 'k', type: 'boolean', default: false },
		'dry-run': { type: 'boolean', default: false },
		output: { short: 'o', type: 'string', default: join(import.meta.dirname, 'files') },
		data: { type: 'string', default: join(import.meta.dirname, 'data') },
		core: { type: 'string', default: join(import.meta.dirname, '../node_modules/@zenfs/core/tests/data') },
		verbose: { short: 'v', type: 'boolean', default: false },
		help: { short: 'h', type: 'boolean', default: false },
	},
	strict: true,
});

if (options.verbose) io._setDebugOutput(true);

if (options.help) {
	console.log(`Usage: ${import.meta.filename} [options]
Options:
    -f, --format <name>  Which format(s) to build for. Can be passed multiple times. Accepted: ${formatsNames.join(', ')}
    -i, --incremental    Only build missing files
    -k, --keep-going     If a file can't be built, keep going
        --dry-run        Don't actually write the files
    -o, --output <dir>   Path to place built archives
        --data <path>    Path to @zenfs/archives test data directory
        --core <path>    Path to @zenfs/core test data directory
    -v, --verbose        Show verbose output
    -h, --help           Show this message
`);
	process.exit();
}

const fileNames = ['data', 'core'] as const;

options.output = resolve(options.output);

for (const name of fileNames) {
	if (!fs.statSync(options[name], { throwIfNoEntry: false })?.isDirectory()) {
		io.exit(`--${name}: invalid or inaccessible directory, ${options[name]}`);
	}
	options[name] = resolve(options[name]);
}

for (const formatName of options.format) {
	const format = formats[formatName as keyof typeof formats];

	if (!format) io.exit(`Invalid format: ${formatName}`);

	const formatFilesNeeded: ('data' | 'core')[] = [];

	for (const name of fileNames) {
		const file = `${name}.${formatName}`;
		if (options.incremental && fs.existsSync(join(options.output, file))) {
			io.debug('--incremental: skipping ' + file);
		} else formatFilesNeeded.push(name);
	}

	if (!formatFilesNeeded.length) continue;

	if (typeof format === 'function') {
		for (const name of formatFilesNeeded) {
			const file = `${name}.${formatName}`;

			try {
				const target = join(options.output, file);

				if (!options['dry-run']) await io.track('Creating ' + file, () => format(target, options[name]));
			} catch (e) {
				if (options['keep-going']) continue;
				throw e;
			}
		}
		continue;
	}

	for (const [command, getArgs] of Object.entries(format)) {
		if (!io.trackCommand({ text: 'Checking for ' + command, ignoreCode: true }, 'command', '-v', command)) continue;

		for (const name of formatFilesNeeded) {
			const file = `${name}.${formatName}`;

			try {
				const target = join(options.output, file);
				const args = getArgs(target, options[name]);
				io.debug('command:', command, ...args);
				using _ = io.withCWD(options[name]);
				if (!options['dry-run']) {
					fs.rmSync(target, { force: true });
					io.trackCommand('Creating ' + file, command, ...args);
				}
			} catch (e) {
				if (options['keep-going']) continue;
				throw e;
			}
		}

		break;
	}
}
