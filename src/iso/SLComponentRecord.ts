import { _throw, struct, types as t } from 'utilium';

export const enum SLComponentFlags {
	CONTINUE = 1,
	CURRENT = 1 << 1,
	PARENT = 1 << 2,
	ROOT = 1 << 3,
}

@struct()
export class SLComponentRecord {
	public constructor(protected data: Uint8Array = _throw('Missing data')) {}

	@t.uint8 public flags!: SLComponentFlags;

	@t.uint8 public componentLength!: number;

	public get length(): number {
		return 2 + this.componentLength;
	}

	public content(getString: (data: Uint8Array) => string): string {
		return getString(this.data.slice(2, 2 + this.componentLength));
	}
}
