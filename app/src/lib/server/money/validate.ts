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
	type CalDate
} from '#lib/domain/dates.ts';
import type { Minor } from '#lib/domain/money.ts';
import { expand, type Item, type ItemKind, type Rule } from '#lib/domain/schedule.ts';
import { CURRENCIES, isCurrency, type Currency } from '#lib/format.ts';
import { checkAmount, checkDate, text, type Checked, type Problems } from '#lib/checks.ts';

// The expense checks and the basic field checks live in a shared module (ADR-0029); every existing
// import from here keeps working.
export {
	checkAmount,
	checkDate,
	checkExpense,
	MAX_EXPENSE_MINOR,
	MAX_NOTE,
	MAX_YEAR,
	MIN_YEAR,
	type Checked,
	type ExpenseInput,
	type Problems
} from '#lib/checks.ts';

export const KINDS: readonly ItemKind[] = ['income', 'bill', 'loan-payment'];
export const REPEATS = ['every14', 'monthly', 'twiceMonthly', 'quarterly', 'yearly'] as const;
export type Repeat = (typeof REPEATS)[number];

export const MAX_NAME = 60;

export const isKind = (v: unknown): v is ItemKind => KINDS.includes(v as ItemKind);
export const isRepeat = (v: unknown): v is Repeat => REPEATS.includes(v as Repeat);

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
		case 'twiceMonthly':
			return addDays(today, -31);
		case 'quarterly':
			return shiftMonths(rule.anchor, -3);
		case 'yearly':
			return shiftMonths(rule.anchor, -12);
	}
}

/** A day of the month typed as 1 to 31, or null. */
function dayOfMonth(raw: unknown): number | null {
	const s = text(raw);
	const day = /^\d{1,2}$/.test(s) ? Number(s) : NaN;
	return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

/**
 * The two days of a twice-a-month rule, `day` then `day2`, with the first before the second. Two
 * days that are both the 28th or later are refused: in February they would be the same date.
 */
export function checkTwiceMonthlyDays(
	rawDay: unknown,
	rawDay2: unknown
): Checked<{ day: number; day2: number }> {
	const problems: Problems = {};
	const day = dayOfMonth(rawDay);
	const day2 = dayOfMonth(rawDay2);
	if (day === null) problems.day = 'Enter the first day of the month, from 1 to 31.';
	if (day2 === null) problems.day2 = 'Enter the second day of the month, from 1 to 31.';
	if (day !== null && day2 !== null) {
		if (day >= day2) {
			problems.day2 = 'Enter a second day that comes after the first day.';
		} else if (day >= 28) {
			problems.day =
				'Choose a first day before the 28th. Two days at the end of the month would be the same day in February.';
		}
	}
	if (Object.keys(problems).length > 0 || day === null || day2 === null) {
		return { ok: false, problems };
	}
	return { ok: true, value: { day, day2 } };
}

/**
 * How often the main pay comes: every 2 weeks (`date`, one payday), once a month (`day`) or twice
 * a month (`day` and `day2`), chosen with `repeat`. Nothing else is a pay rhythm.
 */
export function checkPayRhythm(
	form: Record<string, unknown>
): Checked<Extract<Rule, { kind: 'every14' | 'monthly' | 'twiceMonthly' }>> {
	const repeat = text(form.repeat);
	if (repeat === 'monthly') {
		const day = dayOfMonth(form.day);
		if (day === null) {
			return {
				ok: false,
				problems: { day: 'Enter the day of the month you are paid, from 1 to 31.' }
			};
		}
		return { ok: true, value: { kind: 'monthly', day } };
	}
	if (repeat === 'twiceMonthly') {
		const days = checkTwiceMonthlyDays(form.day, form.day2);
		return days.ok ? { ok: true, value: { kind: 'twiceMonthly', ...days.value } } : days;
	}
	if (repeat === 'every14') {
		const date = checkDate(form.date, 'a day you were paid, or will be paid');
		return date.ok
			? { ok: true, value: { kind: 'every14', anchor: date.value } }
			: { ok: false, problems: { date: date.problems.date } };
	}
	return { ok: false, problems: { repeat: 'Choose how often you are paid.' } };
}

export type ItemFields = {
	kind: ItemKind;
	name: string;
	amount: Minor;
	rule: Rule;
};

/**
 * The fields of the add and edit forms: `name`, `amount`, `repeat`, and either `date` (every 2 weeks,
 * every 3 months, every year), `day` (every month) or `day` and `day2` (twice a month). `kind`
 * comes from the caller, not the form.
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
		const day = dayOfMonth(form.day);
		if (day === null) problems.day = 'Enter a day of the month from 1 to 31.';
		else rule = { kind: 'monthly', day };
	} else if (repeat === 'twiceMonthly') {
		const days = checkTwiceMonthlyDays(form.day, form.day2);
		if (days.ok) rule = { kind: 'twiceMonthly', ...days.value };
		else Object.assign(problems, days.problems);
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

export const MAX_GROUP = 30;

export type LabelInput = { group: string | null; optional: boolean };

/** A bill's group and optional mark, from the same form as its other fields. Both may be left out. */
export function checkLabels(form: Record<string, unknown>): Checked<LabelInput> {
	const group = text(form.group).replace(/\s+/g, ' ');
	if (group.length > MAX_GROUP) {
		return { ok: false, problems: { group: `Keep the group under ${MAX_GROUP} letters.` } };
	}
	return { ok: true, value: { group: group || null, optional: form.optional === 'yes' } };
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
