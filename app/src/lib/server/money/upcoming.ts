/**
 * The next few payments of one item, for the schedule screen. Unlike `expand`, a skipped payment
 * stays in the list (marked), so it can be brought back with Undo.
 */
import { addDays, type CalDate } from '#lib/domain/dates.ts';
import type { Minor } from '#lib/domain/money.ts';
import { expand, type Item, type Override } from '#lib/domain/schedule.ts';

export type Upcoming = {
	/** The date the rule gave it; names the payment when it is skipped or changed. */
	originalDate: CalDate;
	date: CalDate;
	amount: Minor;
	status: 'normal' | 'skipped' | 'changed';
};

/** Wide enough for a yearly item to show two payments; widened step by step for the rest. */
const WINDOWS = [100, 400, 800];

export function upcoming(
	item: Item,
	overrides: readonly Override[],
	today: CalDate,
	count = 6
): Upcoming[] {
	let originals: CalDate[] = [];
	for (const days of WINDOWS) {
		originals = expand([item], [], today, addDays(today, days)).map((o) => o.date);
		if (originals.length >= count) break;
	}
	return originals.slice(0, count).map((originalDate) => {
		const o = overrides.find((x) => x.itemId === item.id && x.originalDate === originalDate);
		if (o?.action === 'skip') {
			return { originalDate, date: originalDate, amount: item.amount, status: 'skipped' as const };
		}
		if (o?.action === 'change') {
			return {
				originalDate,
				date: o.date ?? originalDate,
				amount: o.amount ?? item.amount,
				status: 'changed' as const
			};
		}
		return { originalDate, date: originalDate, amount: item.amount, status: 'normal' as const };
	});
}
