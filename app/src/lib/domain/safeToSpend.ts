import { addDays, maxDate, type CalDate } from './dates.ts';
import { add, neg, splitEvenly, sub, sum, minor, type Minor } from './money.ts';
import { nextPayday, paydays, previousPayday } from './periods.ts';
import { expand, type Item, type Occurrence, type Override } from './schedule.ts';

/** How far ahead and back to look for a yearly bill's next and previous due date. */
const CYCLE_SEARCH_DAYS = 400;

export type SetAside = {
	itemId: string;
	name: string;
	/** What has been put aside so far, from the paydays up to and including today. */
	held: Minor;
	dueDate: CalDate;
	/** The full amount of the bill. */
	amount: Minor;
};

/**
 * Why there is a shortfall. `due`: reserved payments are not covered (see `uncovered`). Otherwise
 * nothing reserved is uncovered and the money is gone before them: `logged` is logged spending that
 * still counts, `held` is yearly and quarterly set-asides, `both` is the two together, and
 * `balance` is a balance already below zero with neither.
 */
export type ShortfallCause = 'due' | 'logged' | 'held' | 'both' | 'balance';

export type Shortfall = {
	/** How much is missing, as a positive amount. */
	short: Minor;
	/**
	 * What the balance and income could cover once set-asides and logged spending are taken out,
	 * before any reserved payment. Negative when those alone use it up.
	 */
	available: Minor;
	/** The reserved items, in date order, from the first one that cannot be covered onward. */
	uncovered: Occurrence[];
	cause: ShortfallCause;
};

export type SafeToSpend = {
	amount: Minor;
	nextPayday: CalDate;
	reserved: Occurrence[];
	setAsides: SetAside[];
	incomeSinceBalance: Occurrence[];
	balanceIsStale: boolean;
	shortfall: Shortfall | null;
};

export type SafeToSpendInput = {
	items: readonly Item[];
	overrides: readonly Override[];
	balance: Minor;
	balanceAsOf: CalDate;
	today: CalDate;
	/**
	 * Payments marked missed at a check-in and not yet confirmed paid. Each stays reserved, whatever
	 * its date, and is counted once even if the schedule window also holds it.
	 */
	outstanding?: readonly Occurrence[];
	/**
	 * The total of logged expenses that still count (ADR-0012), default 0. That money has already left
	 * the account, so it lowers what is available before any reserved bill is covered.
	 */
	expenses?: Minor;
};

/**
 * What is safe to spend until the next payday. Deliberately conservative: it subtracts every bill
 * and loan payment dated after the balance up to the next payday, adds only income that has
 * already landed, and holds back each yearly and quarterly bill's equal share per payday.
 * Throws if no payday is scheduled after `today`.
 */
export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
	const { items, overrides, balance, balanceAsOf, today, outstanding = [] } = input;
	const spent = input.expenses ?? minor(0);

	const next = nextPayday(items, overrides, today);
	if (!next) throw new Error(`No payday is scheduled after ${today}`);

	const afterBalance = addDays(balanceAsOf, 1);
	const scheduled = expand(items, overrides, afterBalance, next).filter((o) => o.kind !== 'income');
	const seen = new Set(scheduled.map((o) => `${o.itemId}|${o.originalDate}`));
	const carried: Occurrence[] = [];
	for (const o of outstanding) {
		const key = `${o.itemId}|${o.originalDate}`;
		if (seen.has(key)) continue;
		seen.add(key);
		carried.push(o);
	}
	const reserved = [...carried, ...scheduled].sort(
		(a, b) =>
			(a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
			(a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0) ||
			(a.originalDate < b.originalDate ? -1 : a.originalDate > b.originalDate ? 1 : 0)
	);
	const incomeSinceBalance = expand(items, overrides, afterBalance, today).filter(
		(o) => o.kind === 'income'
	);

	const setAsides: SetAside[] = [];
	for (const item of items) {
		if (item.kind !== 'bill') continue;
		if (item.rule.kind !== 'quarterly' && item.rule.kind !== 'yearly') continue;

		const due = expand([item], overrides, addDays(today, 1), addDays(today, CYCLE_SEARCH_DAYS))[0];
		// Due on or before the next payday: it is in `reserved` instead.
		if (!due || due.date <= next) continue;

		const previous = expand(
			[item],
			overrides,
			addDays(due.date, -CYCLE_SEARCH_DAYS),
			addDays(due.date, -1)
		).at(-1);
		const cycleStart = previous ? maxDate(previous.date, item.startsOn) : item.startsOn;

		const cyclePaydays = paydays(items, overrides, cycleStart, addDays(due.date, -1));
		const shares = cyclePaydays.length > 0 ? splitEvenly(due.amount, cyclePaydays.length) : [];
		const held = sum(shares.filter((_, i) => cyclePaydays[i] <= today));

		setAsides.push({
			itemId: item.id,
			name: item.name,
			held,
			dueDate: due.date,
			amount: due.amount
		});
	}
	setAsides.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

	const previousPay = previousPayday(items, overrides, today);
	const balanceIsStale = previousPay !== null && balanceAsOf < previousPay;

	const available = sub(
		sub(
			add(balance, sum(incomeSinceBalance.map((o) => o.amount))),
			sum(setAsides.map((s) => s.held))
		),
		spent
	);
	const amount = sub(available, sum(reserved.map((o) => o.amount)));

	let shortfall: Shortfall | null = null;
	if (amount < 0) {
		let running = minor(0);
		const uncovered: Occurrence[] = [];
		for (const occurrence of reserved) {
			running = add(running, occurrence.amount);
			if (running > available) uncovered.push(occurrence);
		}
		const held = sum(setAsides.map((s) => s.held));
		let cause: ShortfallCause;
		if (uncovered.length > 0) cause = 'due';
		else if (spent > 0 && available + spent >= 0) cause = 'logged';
		else if (spent > 0) cause = held > 0 ? 'both' : 'logged';
		else cause = held > 0 ? 'held' : 'balance';
		shortfall = { short: neg(amount), available, uncovered, cause };
	}

	return {
		amount,
		nextPayday: next,
		reserved,
		setAsides,
		incomeSinceBalance,
		balanceIsStale,
		shortfall
	};
}
