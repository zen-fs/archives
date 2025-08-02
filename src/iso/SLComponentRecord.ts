import { struct, types as t } from 'memium/decorators';
import { BufferView } from 'utilium/buffer.js';

export const enum SLComponentFlags {
	CONTINUE = 1,
	CURRENT = 1 << 1,
	PARENT = 1 << 2,
	ROOT = 1 << 3,
}

@struct.packed('SLComponentRecord')
export class SLComponentRecord extends BufferView {
	@t.uint8 public accessor flags!: SLComponentFlags;

	@t.uint8 public accessor componentLength!: number;

	public get length(): number {
		return 2 + this.componentLength;
	}

	public content(getString: (data: Uint8Array) => string): string {
		return getString(new Uint8Array(this.buffer, this.byteOffset + 2, this.componentLength));
	}
}
