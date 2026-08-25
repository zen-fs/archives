#!/usr/bin/env node
import * as fs from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import * as io from 'ioium/node';
import { execFileSync } from 'node:child_process';

const _isoCommon = (target: string, source: string, vol = '-V') => ['-quiet', vol, 'CDROM', '-o', target, source];

const formats = {
		zip: {
			// @todo use built-in `createZipArchiveSync()`, see https://github.com/nodejs/node/pull/64339
			zip: (out, src) => ['-o', '--quiet', '-X', out, src],
		},
		iso: {
			genisoimage: _isoCommon,
			mkisofs: _isoCommon,
			xorrisofs: (out, src) => [..._isoCommon(out, src), '--norock'],
			hdiutil: (out, src) => ['makehybrid', '-quiet', '-iso', ..._isoCommon(out, src, '-default-volume-name')],
		},
		tar: {
			tar(out, src) {
				const isGNU = execFileSync('tar', ['--version'], { encoding: 'utf8' }).includes('GNU tar');

				return [
					'--create',
					'--format=ustar',
					'--file',
					out,
					'--directory',
					src,
					'.',
					'--numeric-owner',
					...(isGNU ? ['--owner=0', '--group=0'] : ['--uid', '0', '--gid', '0', '--uname', '', '--gname', '']),
				];
			},
		},
	} satisfies Record<string, Record<string, (targetPath: string, sourcedir: string) => string[]>>,
	formatsNames = Object.keys(formats);

const { values: options } = parseArgs({
	options: {
		data: { type: 'string', default: join(import.meta.dirname, 'data') },
		core: { type: 'string', default: join(import.meta.dirname, '../node_modules/@zenfs/core/tests/data') },
		'keep-going': { short: 'k', type: 'boolean', default: false },
		incremental: { short: 'i', type: 'boolean', default: false },
		output: { short: 'o', type: 'string', default: join(import.meta.dirname, 'files') },
		format: { short: 'f', type: 'string', multiple: true, default: formatsNames },
		'dry-run': { type: 'boolean', default: false },
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
    -k, --keep-going     If a file can't be built, keep going
    -i, --incremental    Only build missing files
    -o, --output <dir>   Path to place built archives
        --data <path>    Path to @zenfs/archives test data directory
        --core <path>    Path to @zenfs/core test data directory
        --dry-run        Don't actually write the files
    -v, --verbose        Show verbose output
    -h, --help           Show this message
	`);
	process.exit();
}

const fileNames = ['data', 'core'] as const;

for (const name of fileNames) {
	if (!fs.statSync(options[name], { throwIfNoEntry: false })?.isDirectory()) {
		io.exit(`--${name}: invalid or inaccessible directory, ${options[name]}`);
	}
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

	for (const [command, getArgs] of Object.entries(format)) {
		if (!io.trackCommand({ text: 'Checking for ' + command, ignoreCode: true }, 'command', '-v', command)) continue;

		for (const name of formatFilesNeeded) {
			const file = `${name}.${formatName}`;

			try {
				const args = getArgs(join(options.output, file), options[name]);
				io.debug('command:', command, ...args);
				if (!options['dry-run']) io.trackCommand('Creating ' + file, command, ...args);
			} catch (e) {
				if (options['keep-going']) continue;
				throw e;
			}
		}

		break;
	}
}
