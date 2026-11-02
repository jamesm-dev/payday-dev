import {
	calDate,
	compareDates,
	dateParts,
	dayNumber,
	fromDayNumber,
	lastDayOfMonth,
	maxDate,
	minDate,
	type CalDate
} from './dates.ts';
import type { Minor } from './money.ts';

export type ItemKind = 'income' | 'bill' | 'loan-payment';

export type Rule =
	| { kind: 'every14'; anchor: CalDate }
	| { kind: 'monthly'; day: number }
	| { kind: 'quarterly'; anchor: CalDate }
	| { kind: 'yearly'; anchor: CalDate };

export type Item = {
	id: string;
	kind: ItemKind;
	name: string;
	amount: Minor;
	rule: Rule;
	startsOn: CalDate;
	endsOn?: CalDate;
	/** The owner's own group, such as "GCash". A label for the paycheck list; no rule reads it. */
	group?: string;
	/** Marked optional (`*`) on the paycheck list. A label: it is still counted everywhere. */
	optional?: boolean;
};

/** Changes one occurrence, named by the date the rule gave it, without touching the rule. */
export type Override =
	| { itemId: string; originalDate: CalDate; action: 'skip' }
	| { itemId: string; originalDate: CalDate; action: 'change'; date?: CalDate; amount?: Minor };

export type Occurrence = {
	itemId: string;
	kind: ItemKind;
	name: string;
	date: CalDate;
	amount: Minor;
	/** The date the rule produced; equals `date` unless the occurrence was changed. */
	originalDate: CalDate;
};

/** The day of the month, or its last day when the month is shorter. */
function clampedDate(y: number, m: number, day: number): CalDate {
	return calDate(y, m, Math.min(day, lastDayOfMonth(y, m)));
}

/** Months since year 0, so month arithmetic is plain integer arithmetic. */
function monthIndex(y: number, m: number): number {
	return y * 12 + (m - 1);
}

/** Every date a rule produces within `from..to`, ignoring start and end dates. */
function ruleDates(rule: Rule, from: CalDate, to: CalDate): CalDate[] {
	const out: CalDate[] = [];
	if (from > to) return out;

	if (rule.kind === 'every14') {
		const offset = (((dayNumber(from) - dayNumber(rule.anchor)) % 14) + 14) % 14;
		const last = dayNumber(to);
		for (let n = dayNumber(from) + (offset === 0 ? 0 : 14 - offset); n <= last; n += 14) {
			out.push(fromDayNumber(n));
		}
		return out;
	}

	if (rule.kind === 'monthly' && (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31)) {
		throw new RangeError(`Monthly day must be 1 to 31: ${rule.day}`);
	}

	const a = rule.kind === 'monthly' ? null : dateParts(rule.anchor);
	const f = dateParts(from);
	const t = dateParts(to);
	const lastIndex = monthIndex(t.y, t.m);
	for (let idx = monthIndex(f.y, f.m); idx <= lastIndex; idx++) {
		const y = (idx - (idx % 12)) / 12;
		const m = (idx % 12) + 1;
		let day: number;
		if (rule.kind === 'monthly') {
			day = rule.day;
		} else if (a) {
			if (rule.kind === 'yearly' && m !== a.m) continue;
			if (rule.kind === 'quarterly' && (((idx - monthIndex(a.y, a.m)) % 3) + 3) % 3 !== 0) continue;
			day = a.d;
		} else {
			continue;
		}
		const date = clampedDate(y, m, day);
		if (date >= from && date <= to) out.push(date);
	}
	return out;
}

function overrideKey(itemId: string, originalDate: CalDate): string {
	return `${itemId}|${originalDate}`;
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
	return (
		compareDates(a.date, b.date) ||
		(a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0) ||
		compareDates(a.originalDate, b.originalDate)
	);
}

/**
 * Dated occurrences of every item within `from..to`, both ends inclusive, in date order. Only
 * dates within an item's `startsOn..endsOn` are produced. A skip removes an occurrence; a change
 * moves and/or re-amounts it, and the moved date is what is tested against the range.
 */
export function expand(
	items: readonly Item[],
	overrides: readonly Override[],
	from: CalDate,
	to: CalDate
): Occurrence[] {
	const byKey = new Map<string, Override>();
	for (const o of overrides) byKey.set(overrideKey(o.itemId, o.originalDate), o);

	const out: Occurrence[] = [];
	for (const item of items) {
		const lo = maxDate(from, item.startsOn);
		const hi = item.endsOn ? minDate(to, item.endsOn) : to;
		const originals = new Set(ruleDates(item.rule, lo, hi));

		// An occurrence outside the range can be changed into it.
		for (const o of overrides) {
			if (o.itemId !== item.id || o.action !== 'change' || originals.has(o.originalDate)) continue;
			if (o.originalDate < item.startsOn || (item.endsOn && o.originalDate > item.endsOn)) continue;
			if (ruleDates(item.rule, o.originalDate, o.originalDate).length === 1) {
				originals.add(o.originalDate);
			}
		}

		for (const originalDate of originals) {
			const o = byKey.get(overrideKey(item.id, originalDate));
			if (o?.action === 'skip') continue;
			const date = o?.action === 'change' && o.date ? o.date : originalDate;
			if (date < from || date > to) continue;
			out.push({
				itemId: item.id,
				kind: item.kind,
				name: item.name,
				date,
				amount: o?.action === 'change' && o.amount !== undefined ? o.amount : item.amount,
				originalDate
			});
		}
	}
	return out.sort(compareOccurrences);
}
