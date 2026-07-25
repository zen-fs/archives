// SPDX-License-Identifier: LGPL-3.0-or-later
import type { FileSystem } from '@zenfs/core';
import type { SharedConfig } from '@zenfs/core/backends/backend.js';

/**
 * Folds the case of a path according to the file system's `caseFold` option.
 * @internal
 */
export function _caseFold(fs: FileSystem & { options: SharedConfig }, path: string): string {
	if (!fs.options.caseFold) return path;
	return fs.options.caseFold == 'upper' ? path.toUpperCase() : path.toLowerCase();
}
