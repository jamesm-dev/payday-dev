/**
 * Strict checks on what a form sends, before anything reaches the database. Every message is written
 * for someone who has never kept a budget. Pure: no database, no framework.
 */
import {
	addDays,
	calDate,
	compareDates,
	dateParts,
	lastDayOfMonth,
	parseCalDate,
	type CalDate
} from '#lib/domain/dates.ts';
import { parseMinor, type Minor } from '#lib/domain/money.ts';
import { expand, type Item, type ItemKind, type Rule } from '#lib/domain/schedule.ts';
import { CURRENCIES, isCurrency, type Currency } from '#lib/format.ts';

export const KINDS: readonly ItemKind[] = ['income', 'bill', 'loan-payment'];
export const REPEATS = ['every14', 'monthly', 'quarterly', 'yearly'] as const;
export type Repeat = (typeof REPEATS)[number];

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MAX_NAME = 60;

export type Problems = Record<string, string>;
export type Checked<T> = { ok: true; value: T } | { ok: false; problems: Problems };

export const isKind = (v: unknown): v is ItemKind => KINDS.includes(v as ItemKind);
export const isRepeat = (v: unknown): v is Repeat => REPEATS.includes(v as Repeat);

const text = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

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

/** A balance can be zero or overdrawn. */
export const checkBalance = (raw: unknown) => checkAmount(raw, { allowNegative: true });

/** Same day of the month `n` months away, or the last day when that month is shorter. */
function shiftMonths(date: CalDate, n: number): CalDate {
	const { y, m, d } = dateParts(date);
	const index = y * 12 + (m - 1) + n;
	const ny = Math.floor(index / 12);
	const nm = (index % 12) + 1;
	return calDate(ny, nm, Math.min(d, lastDayOfMonth(ny, nm)));
}

/**
 * Where a new item's history begins. A quarterly or yearly bill starts one cycle before its date, so
 * the little-by-little saving counts the paydays already gone; a monthly bill starts a month back, so
 * a balance a few weeks old still counts what was due after it.
 */
export function startsOnFor(rule: Rule, today: CalDate): CalDate {
	switch (rule.kind) {
		case 'every14':
			return rule.anchor;
		case 'monthly':
			return addDays(today, -31);
		case 'quarterly':
			return shiftMonths(rule.anchor, -3);
		case 'yearly':
			return shiftMonths(rule.anchor, -12);
	}
}

export type ItemFields = {
	kind: ItemKind;
	name: string;
	amount: Minor;
	rule: Rule;
};

/**
 * The fields of the add and edit forms: `name`, `amount`, `repeat`, and either `date` (every 2 weeks,
 * every 3 months, every year) or `day` (every month). `kind` comes from the caller, not the form.
 */
export function checkItemFields(
	kind: ItemKind,
	form: Record<string, unknown>
): Checked<ItemFields> {
	const problems: Problems = {};

	const name = text(form.name).replace(/\s+/g, ' ');
	if (!name) problems.name = 'Give it a name, like Rent or Phone.';
	else if (name.length > MAX_NAME) problems.name = `Keep the name under ${MAX_NAME} letters.`;

	const amount = checkAmount(form.amount);
	if (!amount.ok) problems.amount = amount.problems.amount;

	let rule: Rule | undefined;
	const repeat = text(form.repeat);
	if (!isRepeat(repeat)) {
		problems.repeat = 'Choose how often it happens.';
	} else if (repeat === 'monthly') {
		const raw = text(form.day);
		const day = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
		if (!Number.isInteger(day) || day < 1 || day > 31) {
			problems.day = 'Enter a day of the month from 1 to 31.';
		} else {
			rule = { kind: 'monthly', day };
		}
	} else {
		const label =
			repeat === 'every14' ? 'the date of one payment, past or coming' : 'the date of the next one';
		const date = checkDate(form.date, label);
		if (!date.ok) problems.date = date.problems.date;
		else rule = { kind: repeat, anchor: date.value };
	}

	if (!isKind(kind)) problems.kind = 'Choose pay, a bill or a loan payment.';
	if (Object.keys(problems).length > 0 || !amount.ok || !rule) return { ok: false, problems };
	return { ok: true, value: { kind, name, amount: amount.value, rule } };
}

const MAX_GROUP = 30;

export type LabelInput = { group: string | null; optional: boolean };

/** A bill's group and optional mark, from the same form as its other fields. Both may be left out. */
export function checkLabels(form: Record<string, unknown>): Checked<LabelInput> {
	const group = text(form.group).replace(/\s+/g, ' ');
	if (group.length > MAX_GROUP) {
		return { ok: false, problems: { group: `Keep the group under ${MAX_GROUP} letters.` } };
	}
	return { ok: true, value: { group: group || null, optional: form.optional === 'yes' } };
}

const MAX_NOTE = 60;
/** 10,000,000.00: far beyond one outing's spending, well inside what integers hold exactly. */
const MAX_EXPENSE_MINOR = 1_000_000_000;

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

/** Returns the item's last date, or an error when it would end before it began. */
export function checkEnd(startsOn: CalDate, raw: unknown): Checked<CalDate> {
	const date = checkDate(raw, 'the last date it applies');
	if (!date.ok) return { ok: false, problems: { endsOn: date.problems.date } };
	if (compareDates(date.value, startsOn) < 0) {
		return {
			ok: false,
			problems: { endsOn: 'That is before this started. Choose a later date.' }
		};
	}
	return { ok: true, value: date.value };
}

/** A whole new item: the fields, plus where its history starts. */
export function checkNewItem(
	kind: ItemKind,
	form: Record<string, unknown>,
	today: CalDate
): Checked<Omit<Item, 'id'>> {
	const fields = checkItemFields(kind, form);
	if (!fields.ok) return fields;
	return {
		ok: true,
		value: { ...fields.value, startsOn: startsOnFor(fields.value.rule, today) }
	};
}

/**
 * Marking one payment paid from the plan, or taking the mark off. Like an override, `originalDate`
 * must be a date the item's rule really produces, so a forged or stale form marks nothing.
 */
export function checkPaidMark(
	item: Item,
	form: Record<string, unknown>
): Checked<{ originalDate: CalDate; paid: boolean }> {
	if (item.kind === 'income') {
		return { ok: false, problems: { paid: 'Pay is not marked paid; only bills are.' } };
	}
	const original = checkDate(form.originalDate, 'which payment');
	if (!original.ok) return { ok: false, problems: { paid: original.problems.date } };
	if (expand([item], [], original.value, original.value).length !== 1) {
		return { ok: false, problems: { paid: 'That payment is not on the schedule.' } };
	}
	const paid = text(form.paid);
	if (paid !== 'yes' && paid !== 'no') {
		return { ok: false, problems: { paid: 'Choose paid or not paid.' } };
	}
	return { ok: true, value: { originalDate: original.value, paid: paid === 'yes' } };
}

/**
 * Skip or change one occurrence. `originalDate` must be a date the item's rule really produces, so a
 * forged or stale form changes nothing. A change needs a new date, a new amount, or both.
 */
export type OverrideInput =
	| { action: 'skip'; originalDate: CalDate }
	| { action: 'change'; originalDate: CalDate; date?: CalDate; amount?: Minor };

export function checkOverride(
	item: Item,
	action: 'skip' | 'change',
	form: Record<string, unknown>
): Checked<OverrideInput> {
	const original = checkDate(form.originalDate, 'which payment');
	if (!original.ok) return { ok: false, problems: { originalDate: original.problems.date } };
	const originalDate = original.value;
	if (expand([item], [], originalDate, originalDate).length !== 1) {
		return { ok: false, problems: { originalDate: 'That payment is not on the schedule.' } };
	}
	if (action === 'skip') return { ok: true, value: { action, originalDate } };

	const problems: Problems = {};
	let date: CalDate | undefined;
	let amount: Minor | undefined;
	if (text(form.date)) {
		const d = checkDate(form.date, 'the new date');
		if (!d.ok) problems.date = d.problems.date;
		else if (d.value !== originalDate) date = d.value;
	}
	if (text(form.amount)) {
		const a = checkAmount(form.amount);
		if (!a.ok) problems.amount = a.problems.amount;
		else if (a.value !== item.amount) amount = a.value;
	}
	if (Object.keys(problems).length === 0 && date === undefined && amount === undefined) {
		problems.change = 'Choose a different date or amount to change this payment.';
	}
	if (Object.keys(problems).length > 0) return { ok: false, problems };
	return { ok: true, value: { action, originalDate, date, amount } };
}

let zones: Set<string> | undefined;
function zoneSet(): Set<string> {
	zones ??= new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]);
	return zones;
}
export const timeZones = (): string[] => [...zoneSet()].sort();
export const isTimeZone = (v: string): boolean => zoneSet().has(v);

/** Currency and time zone, from setup. Only two-decimal currencies; only real IANA zones. */
export function checkRegion(
	form: Record<string, unknown>
): Checked<{ currency: Currency; timeZone: string }> {
	const problems: Problems = {};
	const currency = text(form.currency);
	if (!isCurrency(currency)) {
		problems.currency = `Choose one of the ${CURRENCIES.length} listed currencies.`;
	}
	const timeZone = text(form.timeZone);
	if (!isTimeZone(timeZone)) problems.timeZone = 'Choose your time zone from the list.';
	if (Object.keys(problems).length > 0 || !isCurrency(currency)) return { ok: false, problems };
	return { ok: true, value: { currency, timeZone } };
}
