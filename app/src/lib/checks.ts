/**
 * The checks an expense needs, shared by the server and the offline page (ADR-0029). Pure: no
 * database, no framework, nothing from `lib/server`, so the browser can run exactly the rules the
 * server will run again. The server never trusts the browser's answer; this only lets the offline
 * page say what is wrong before an expense is kept on the phone.
 */
import { dateParts, parseCalDate, compareDates, type CalDate } from '#lib/domain/dates.ts';
import { parseMinor, type Minor } from '#lib/domain/money.ts';

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export type Problems = Record<string, string>;
export type Checked<T> = { ok: true; value: T } | { ok: false; problems: Problems };

/** A form field as trimmed text; anything that is not a string reads as empty. */
export const text = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

/** A calendar date typed or picked as YYYY-MM-DD, in a sane range. */
export function checkDate(raw: unknown, what: string): Checked<CalDate> {
	const s = text(raw);
	if (!s) return { ok: false, problems: { date: `Choose ${what}.` } };
	try {
		const date = parseCalDate(s);
		const { y } = dateParts(date);
		if (y < MIN_YEAR || y > MAX_YEAR) throw new RangeError('year');
		return { ok: true, value: date };
	} catch {
		return {
			ok: false,
			problems: { date: `That is not a date. Choose ${what} from the calendar.` }
		};
	}
}

/**
 * An amount of money, in the currency's major units: "1,200", "45.50". Positive unless `allowNegative`
 * (a balance can be overdrawn). Read from the digits of the text, never through a float.
 */
export function checkAmount(raw: unknown, opts: { allowNegative?: boolean } = {}): Checked<Minor> {
	const s = text(raw);
	if (!s) return { ok: false, problems: { amount: 'Enter an amount, like 45 or 1,200.50.' } };
	let amount: Minor;
	try {
		amount = parseMinor(s);
	} catch (error) {
		return {
			ok: false,
			problems: {
				amount:
					error instanceof RangeError
						? 'That amount is too big.'
						: 'Use numbers only, like 45 or 1,200.50, with at most two digits after the dot.'
			}
		};
	}
	if (amount < 0 && !opts.allowNegative) {
		return { ok: false, problems: { amount: 'Enter the amount without a minus sign.' } };
	}
	if (amount === 0 && !opts.allowNegative) {
		return { ok: false, problems: { amount: 'Enter an amount above zero.' } };
	}
	return { ok: true, value: amount };
}

export const MAX_NOTE = 60;
/** 10,000,000.00: far beyond one outing's spending, well inside what integers hold exactly. */
export const MAX_EXPENSE_MINOR = 1_000_000_000;

export type ExpenseInput = { amount: Minor; note: string | null; spentOn: CalDate };

/**
 * The fields of the log-an-expense form: `amount`, `date` (the day it was spent) and an optional
 * `note` saying what it was for. The day cannot be after the owner's `today`.
 */
export function checkExpense(form: Record<string, unknown>, today: CalDate): Checked<ExpenseInput> {
	const problems: Problems = {};

	const amount = checkAmount(form.amount);
	if (!amount.ok) problems.amount = amount.problems.amount;
	else if (amount.value > MAX_EXPENSE_MINOR) problems.amount = 'That amount is too big.';

	const note = text(form.note).replace(/\s+/g, ' ');
	if (note.length > MAX_NOTE) problems.note = `Keep this under ${MAX_NOTE} letters.`;

	const date = checkDate(form.date, 'the day you spent it');
	if (!date.ok) problems.date = date.problems.date;
	else if (compareDates(date.value, today) > 0) {
		problems.date = 'That day has not happened yet. Choose today or an earlier day.';
	}

	if (Object.keys(problems).length > 0 || !amount.ok || !date.ok) return { ok: false, problems };
	return { ok: true, value: { amount: amount.value, note: note || null, spentOn: date.value } };
}

/**
 * The id a phone gives an expense it keeps while offline: `crypto.randomUUID()`, a version 4 UUID in
 * lower case. Anything else is refused before it reaches the database.
 */
export const isClientId = (raw: unknown): raw is string =>
	typeof raw === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw);
