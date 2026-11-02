import { addDays, dateParts, lastDayOfMonth, calDate, type CalDate } from './dates.ts';
import { minor, splitEvenly, sub, sum, type Minor } from './money.ts';
import { paydays } from './periods.ts';
import { expand, type Item, type Occurrence, type Override } from './schedule.ts';

/** How far to look for a yearly bill's due date either side of a payday. */
const CYCLE_SEARCH_DAYS = 400;
/** Enough days after `from` to hold the paydays of any plan: a pay cycle is 14 days. */
const DAYS_PER_PAYCHECK = 14;
const SLACK_DAYS = 62;

/** What one payday puts aside toward one quarterly or yearly bill. */
export type SetAsideShare = {
	itemId: string;
	name: string;
	/** This payday's share of the bill. */
	share: Minor;
	dueDate: CalDate;
	/** The full amount of the bill. */
	amount: Minor;
};

export type Paycheck = {
	payday: CalDate;
	/** The next payday; the paycheck covers `(payday, ends]`, like `periodFor`. */
	ends: CalDate;
	/** The pay that lands on the payday. */
	pay: Minor;
	/** Each regular pay landing on the payday, whose amounts add up to `pay`. */
	pays: Occurrence[];
	/** The bills and loan payments dated in `(payday, ends]`, in date order. */
	covers: Occurrence[];
	coversTotal: Minor;
	/** The shares of yearly and quarterly bills falling on this payday. */
	setAsides: SetAsideShare[];
	setAsideTotal: Minor;
	/** `pay` less what it covers and sets aside. Negative when it cannot cover them. */
	left: Minor;
	short: boolean;
	/** How much is missing, as a positive amount; zero when the paycheck covers everything. */
	shortBy: Minor;
	/** How many paydays the month of this payday has. */
	paydaysInMonth: number;
	/** Which payday of its month this one is: 1, 2 or 3. */
	nthInMonth: number;
	/** True when the month has three paydays, the extra paycheck being the third. */
	thirdPaycheckMonth: boolean;
};

function paydaysInMonthOf(
	items: readonly Item[],
	overrides: readonly Override[],
	payday: CalDate
): { count: number; nth: number } {
	const { y, m } = dateParts(payday);
	const list = paydays(items, overrides, calDate(y, m, 1), calDate(y, m, lastDayOfMonth(y, m)));
	return { count: list.length, nth: list.indexOf(payday) + 1 };
}

/**
 * The share of every quarterly and yearly bill that this payday sets aside. Same split as
 * `safeToSpend`: a bill's amount is divided evenly over the paydays of its cycle (the remainder
 * going to the earliest) and each payday holds its share. A bill that falls inside the paycheck's
 * own span is not a share: it is in `covers` in full, as `safeToSpend` reserves it in full.
 */
function sharesOn(
	items: readonly Item[],
	overrides: readonly Override[],
	payday: CalDate,
	ends: CalDate
): SetAsideShare[] {
	const out: SetAsideShare[] = [];
	for (const item of items) {
		if (item.kind !== 'bill') continue;
		if (item.rule.kind !== 'quarterly' && item.rule.kind !== 'yearly') continue;

		const due = expand(
			[item],
			overrides,
			addDays(payday, 1),
			addDays(payday, CYCLE_SEARCH_DAYS)
		)[0];
		if (!due || due.date <= ends) continue;

		const previous = expand(
			[item],
			overrides,
			addDays(due.date, -CYCLE_SEARCH_DAYS),
			addDays(due.date, -1)
		).at(-1);
		const cycleStart = previous && previous.date > item.startsOn ? previous.date : item.startsOn;
		const cyclePaydays = paydays(items, overrides, cycleStart, addDays(due.date, -1));
		const at = cyclePaydays.indexOf(payday);
		if (at < 0) continue;

		out.push({
			itemId: item.id,
			name: item.name,
			share: splitEvenly(due.amount, cyclePaydays.length)[at],
			dueDate: due.date,
			amount: due.amount
		});
	}
	return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/**
 * The next `count` paychecks, from the first payday on or after `from`. Each is laid out with what
 * it must cover (the same `(payday_i, payday_i+1]` rule as `periodFor`), what it sets aside, and
 * what is left. A paycheck with no payday after it has no span to cover, so it is not listed.
 * Other income than the regular pay is not counted: conservative, like the safe-to-spend number.
 */
export function planPaychecks(
	items: readonly Item[],
	overrides: readonly Override[],
	from: CalDate,
	count: number
): Paycheck[] {
	if (!Number.isInteger(count) || count < 1) return [];
	const horizon = addDays(from, (count + 1) * DAYS_PER_PAYCHECK + SLACK_DAYS);
	const list = paydays(items, overrides, from, horizon).slice(0, count + 1);

	const pays = expand(
		items.filter((i) => i.kind === 'income' && i.rule.kind === 'every14'),
		overrides,
		from,
		horizon
	);

	const out: Paycheck[] = [];
	for (let i = 0; i + 1 < list.length && out.length < count; i++) {
		const payday = list[i];
		const ends = list[i + 1];
		const covers = expand(items, overrides, addDays(payday, 1), ends).filter(
			(o) => o.kind !== 'income'
		);
		const setAsides = sharesOn(items, overrides, payday, ends);
		const landing = pays.filter((o) => o.date === payday);
		const pay = sum(landing.map((o) => o.amount));
		const coversTotal = sum(covers.map((o) => o.amount));
		const setAsideTotal = sum(setAsides.map((s) => s.share));
		const left = sub(sub(pay, coversTotal), setAsideTotal);
		const month = paydaysInMonthOf(items, overrides, payday);
		out.push({
			payday,
			ends,
			pay,
			pays: landing,
			covers,
			coversTotal,
			setAsides,
			setAsideTotal,
			left,
			short: left < 0,
			shortBy: left < 0 ? minor(-left) : minor(0),
			paydaysInMonth: month.count,
			nthInMonth: month.nth,
			thirdPaycheckMonth: month.count >= 3
		});
	}
	return out;
}
