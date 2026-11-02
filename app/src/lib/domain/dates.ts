/**
 * Calendar dates with no time and no time zone. All arithmetic is on integer UTC day numbers
 * (days since 1970-01-01), so a machine's local zone or daylight saving can never shift a date.
 */

declare const calDateBrand: unique symbol;

/** An ISO `YYYY-MM-DD` calendar date. Only the constructors below make one. */
export type CalDate = string & { readonly [calDateBrand]: 'CalDate' };

export type DateParts = { y: number; m: number; d: number };

const MS_PER_DAY = 86_400_000;

export function lastDayOfMonth(y: number, m: number): number {
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Builds a date from a year (1000-9999), month (1-12) and day, throwing if it does not exist. */
export function calDate(y: number, m: number, d: number): CalDate {
	if (!Number.isInteger(y) || y < 1000 || y > 9999) throw new RangeError(`Bad year: ${y}`);
	if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError(`Bad month: ${m}`);
	if (!Number.isInteger(d) || d < 1 || d > lastDayOfMonth(y, m)) {
		throw new RangeError(`Bad day: ${y}-${m}-${d}`);
	}
	const mm = String(m).padStart(2, '0');
	const dd = String(d).padStart(2, '0');
	return `${y}-${mm}-${dd}` as CalDate;
}

export function parseCalDate(text: string): CalDate {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!match) throw new SyntaxError(`Not a YYYY-MM-DD date: "${text}"`);
	return calDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function dateParts(date: CalDate): DateParts {
	return {
		y: Number(date.slice(0, 4)),
		m: Number(date.slice(5, 7)),
		d: Number(date.slice(8, 10))
	};
}

/** Days since 1970-01-01 as an integer. */
export function dayNumber(date: CalDate): number {
	const { y, m, d } = dateParts(date);
	return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNumber(n: number): CalDate {
	const t = new Date(n * MS_PER_DAY);
	return calDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function addDays(date: CalDate, n: number): CalDate {
	return fromDayNumber(dayNumber(date) + n);
}

/** Whole days from `a` to `b`; positive when `b` is later. */
export function daysBetween(a: CalDate, b: CalDate): number {
	return dayNumber(b) - dayNumber(a);
}

/** Negative when `a` is earlier, zero when equal, positive when later. */
export function compareDates(a: CalDate, b: CalDate): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: CalDate, b: CalDate): boolean {
	return a < b;
}

export function isAfter(a: CalDate, b: CalDate): boolean {
	return a > b;
}

export function maxDate(a: CalDate, b: CalDate): CalDate {
	return a >= b ? a : b;
}

export function minDate(a: CalDate, b: CalDate): CalDate {
	return a <= b ? a : b;
}

/** Day of the week, 0 = Sunday ... 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekday(date: CalDate): number {
	return (((dayNumber(date) + 4) % 7) + 7) % 7;
}

/** The calendar date it is, right now, in an IANA time zone. */
export function todayIn(timeZone: string, now: Date): CalDate {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return calDate(pick('year'), pick('month'), pick('day'));
}
