import { Errno, ErrnoError } from '@zenfs/core';
import { _throw, deserialize, struct, types as t } from 'utilium';

export const enum SLComponentFlags {
	CONTINUE = 1,
	CURRENT = 1 << 1,
	PARENT = 1 << 2,
	ROOT = 1 << 3,
}

@struct()
export class SLComponentRecord {
	public constructor(
		protected buffer: ArrayBufferLike = _throw(new ErrnoError(Errno.EINVAL, 'SLComponentRecord.buffer is required')),
		protected byteOffset: number = 0
	) {
		deserialize(this, new Uint8Array(buffer, byteOffset));
	}

	@t.uint8 public flags!: SLComponentFlags;

	@t.uint8 public componentLength!: number;

	public get length(): number {
		return 2 + this.componentLength;
	}

	public content(getString: (data: Uint8Array) => string): string {
		return getString(new Uint8Array(this.buffer, this.byteOffset + 2, this.componentLength));
	}
}
