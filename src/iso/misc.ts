import { deserialize, memoize, struct, types as t } from 'utilium';

@struct()
export class LongFormDate {
	@t.char(4) protected _year: string = '';
	public get year(): number {
		return parseInt(this._year);
	}
	public set year(value: number) {
		this._year = value.toFixed();
	}

	@t.char(2) protected _month: string = '';
	public get month(): number {
		return parseInt(this._month);
	}
	public set month(value: number) {
		this._month = value.toFixed();
	}

	@t.char(2) protected _day: string = '';
	public get day(): number {
		return parseInt(this._day);
	}
	public set day(value: number) {
		this._day = value.toFixed();
	}

	@t.char(2) protected _hour: string = '';
	public get hour(): number {
		return parseInt(this._hour);
	}
	public set hour(value: number) {
		this._hour = value.toFixed();
	}

	@t.char(2) protected _minute: string = '';
	public get minute(): number {
		return parseInt(this._minute);
	}
	public set minute(value: number) {
		this._minute = value.toFixed();
	}

	@t.char(2) protected _second: string = '';
	public get second(): number {
		return parseInt(this._second);
	}
	public set second(value: number) {
		this._second = value.toFixed();
	}

	@t.char(2) protected _centisecond: string = '';
	public get centisecond(): number {
		return parseInt(this._centisecond);
	}
	public set centisecond(value: number) {
		this._centisecond = value.toFixed();
	}

	@t.uint8 public offsetFromGMT!: number;

	public get date(): Date {
		return new Date(this.year, this.month, this.day, this.hour, this.minute, this.second, this.centisecond * 10);
	}
}

@struct()
export class ShortFormDate {
	/**
	 * Years since 1990
	 * @todo This may not be the correct size
	 * @see https://wiki.osdev.org/ISO_9660
	 */
	@t.uint8 public year!: number;
	@t.uint8 public month!: number;
	@t.uint8 public day!: number;
	@t.uint8 public hour!: number;
	@t.uint8 public minute!: number;
	@t.uint8 public second!: number;

	/**
	 * Note: Timezone is ignored
	 */
	@t.uint8 public offsetFromGMT!: number;

	@memoize
	public get date(): Date {
		return new Date(1900 + this.year, this.month - 1, this.day, this.hour, this.minute, this.second);
	}
}

export function getShortFormDate(data: Uint8Array): Date {
	const date = new ShortFormDate();
	deserialize(date, data);
	return date.date;
}

export const enum FileFlags {
	Hidden = 1,
	Directory = 1 << 1,
	AssociatedFile = 1 << 2,
	EARContainsInfo = 1 << 3,
	EARContainsPerms = 1 << 4,
	FinalDirectoryRecordForFile = 1 << 5,
}
