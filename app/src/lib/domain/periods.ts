import { addDays, type CalDate } from './dates.ts';
import { expand, type Item, type Override } from './schedule.ts';

/** How far from a date to look for the payday beside it: twice the longest gap, a month (31 days). */
const SEARCH_DAYS = 62;

/**
 * The main pay: the income items marked `main`, whatever their rule (a rhythm switch has two, the
 * old one ending where the new one starts). When none is marked, every `every14` income, as before
 * pay rhythms existed.
 */
export function primaryPay(items: readonly Item[]): Item[] {
	const income = items.filter((i) => i.kind === 'income');
	const main = income.filter((i) => i.main === true);
	return main.length > 0 ? main : income.filter((i) => i.rule.kind === 'every14');
}

/**
 * The most days that can lie between two paydays of the main pay: 14 every 14 days, up to 31 for a
 * monthly pay, and the longer of the two spans for a twice-a-month pair. Sizes the plan's horizon.
 */
export function longestPaydayGap(items: readonly Item[]): number {
	let gap = 14;
	for (const { rule } of primaryPay(items)) {
		if (rule.kind === 'monthly') gap = Math.max(gap, 31);
		if (rule.kind === 'twiceMonthly') {
			const within = rule.day2 - rule.day;
			gap = Math.max(gap, within, 31 - within);
		}
	}
	return gap;
}

/** Paydays within `from..to`, inclusive, in order, each date once. */
export function paydays(
	items: readonly Item[],
	overrides: readonly Override[],
	from: CalDate,
	to: CalDate
): CalDate[] {
	const dates = expand(primaryPay(items), overrides, from, to).map((o) => o.date);
	return dates.filter((d, i) => i === 0 || d !== dates[i - 1]);
}

/** The first payday strictly after `date`, or null if none is scheduled. */
export function nextPayday(
	items: readonly Item[],
	overrides: readonly Override[],
	date: CalDate
): CalDate | null {
	return paydays(items, overrides, addDays(date, 1), addDays(date, SEARCH_DAYS))[0] ?? null;
}

/** The last payday on or before `date`, or null if none is scheduled. */
export function previousPayday(
	items: readonly Item[],
	overrides: readonly Override[],
	date: CalDate
): CalDate | null {
	return paydays(items, overrides, addDays(date, -SEARCH_DAYS), date).at(-1) ?? null;
}

/** A paycheck and the span it covers: period i is `(payday, ends]`. */
export type Period = { payday: CalDate; ends: CalDate };

/**
 * The paycheck that covers a due date. Periods are `(payday_i, payday_i+1]`, so a bill due ON a
 * payday belongs to the paycheck before it (SPECS decision 8). Null when the date is not
 * bracketed by two scheduled paydays.
 */
export function periodFor(
	items: readonly Item[],
	overrides: readonly Override[],
	dueDate: CalDate
): Period | null {
	const dayBefore = addDays(dueDate, -1);
	const payday = previousPayday(items, overrides, dayBefore);
	const ends = nextPayday(items, overrides, dayBefore);
	return payday && ends ? { payday, ends } : null;
}
