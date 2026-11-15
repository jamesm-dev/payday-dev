import { addDays, maxDate, type CalDate } from './dates.ts';
import { add, neg, splitEvenly, sub, sum, minor, type Minor } from './money.ts';
import { nextPayday, paydays, previousPayday } from './periods.ts';
import { expand, type Item, type Occurrence, type Override, type PaidMark } from './schedule.ts';

/** How far ahead and back to look for a yearly bill's next and previous due date. */
const CYCLE_SEARCH_DAYS = 400;

// ---- Early payments (ADR-0020) ----

/** One payment marked paid before its due date: the occurrence, the day and moment of the mark. */
export type EarlyPayment = { occurrence: Occurrence; paidOn: CalDate; markedAt: string };

/** `itemId|originalDate`: how an occurrence is named across marks, answers and the engine. */
export function earlyKey(itemId: string, originalDate: CalDate): string {
	return `${itemId}|${originalDate}`;
}

/**
 * The marks that are early payments: the occurrence still exists (not skipped, inside its item's
 * dates) and the mark was made on a day BEFORE its due date, the date after any change. A mark on or
 * after the due date is not early: it stays a label (SPECS decision 13). One per occurrence; if
 * there are several marks the latest wins. `missed` names occurrences a check-in answered "did not
 * go out": that answer outranks the mark, so they are not early. In date order.
 */
export function earlyPayments(
	items: readonly Item[],
	overrides: readonly Override[],
	marks: readonly PaidMark[],
	missed?: ReadonlySet<string>
): EarlyPayment[] {
	const latest = new Map<string, PaidMark>();
	for (const mark of marks) {
		const key = earlyKey(mark.itemId, mark.originalDate);
		const held = latest.get(key);
		if (!held || mark.markedAt >= held.markedAt) latest.set(key, mark);
	}
	const out: EarlyPayment[] = [];
	for (const [key, mark] of latest) {
		if (missed?.has(key)) continue;
		const item = items.find((i) => i.id === mark.itemId);
		if (!item) continue;
		const change = overrides.find(
			(o) => o.itemId === mark.itemId && o.originalDate === mark.originalDate
		);
		const due = change?.action === 'change' && change.date ? change.date : mark.originalDate;
		const occurrence = expand([item], overrides, due, due).find(
			(o) => o.originalDate === mark.originalDate
		);
		if (!occurrence || occurrence.kind === 'income') continue;
		if (mark.paidOn >= occurrence.date) continue;
		out.push({ occurrence, paidOn: mark.paidOn, markedAt: mark.markedAt });
	}
	return out.sort(
		(a, b) =>
			(a.occurrence.date < b.occurrence.date
				? -1
				: a.occurrence.date > b.occurrence.date
					? 1
					: 0) ||
			(a.occurrence.itemId < b.occurrence.itemId
				? -1
				: a.occurrence.itemId > b.occurrence.itemId
					? 1
					: 0) ||
			(a.occurrence.originalDate < b.occurrence.originalDate ? -1 : 1)
	);
}

/**
 * Whether a mark comes off the number, by the rule ADR-0012 gives a logged expense: its day is after
 * the balance's day, or on that day and it was made after the balance was read. Otherwise the
 * balance already holds the payment. `readAt` null or missing means the balance was read before the
 * mark, so a same-day mark counts: the number errs low.
 */
export function markCounts(
	mark: { paidOn: CalDate; markedAt: string },
	balanceAsOf: CalDate,
	readAt?: string | null
): boolean {
	if (mark.paidOn > balanceAsOf) return true;
	return mark.paidOn === balanceAsOf && (readAt == null || mark.markedAt > readAt);
}

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
 * `balance` is a balance already below zero with neither. `early` is the same as `logged` or `both`
 * when what still counts is payments paid early and no logged spending.
 */
export type ShortfallCause = 'due' | 'logged' | 'held' | 'both' | 'balance' | 'early';

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
	/** Bills paid early that are no longer reserved or set aside, in date order (empty without marks). */
	paidEarly: EarlyPayment[];
	/** What of `paidEarly` came off the number because the balance does not hold it yet. */
	paidEarlyOff: Minor;
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
	/**
	 * The paid marks standing now (a mark taken off, or a later check-in answer, is simply not here).
	 * One made before its occurrence's due date is an early payment (ADR-0020): never reserved, never
	 * set aside for, and off the number at once unless the balance already holds it (`markCounts`).
	 * A payment in `outstanding` (answered "did not go out") outranks its mark and is reserved again.
	 */
	paidMarks?: readonly PaidMark[];
	/** When the balance was read (ISO); null or missing is before every mark. See `markCounts`. */
	balanceReadAt?: string | null;
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
	const missed = new Set(outstanding.map((o) => earlyKey(o.itemId, o.originalDate)));
	const early = earlyPayments(items, overrides, input.paidMarks ?? [], missed);
	const earlyKeys = new Set(
		early.map((e) => earlyKey(e.occurrence.itemId, e.occurrence.originalDate))
	);
	const earlyOff = sum(
		early
			.filter((e) => markCounts(e, balanceAsOf, input.balanceReadAt))
			.map((e) => e.occurrence.amount)
	);

	const next = nextPayday(items, overrides, today);
	if (!next) throw new Error(`No payday is scheduled after ${today}`);

	const afterBalance = addDays(balanceAsOf, 1);
	const scheduled = expand(items, overrides, afterBalance, next).filter(
		(o) => o.kind !== 'income' && !earlyKeys.has(earlyKey(o.itemId, o.originalDate))
	);
	const seen = new Set(scheduled.map((o) => earlyKey(o.itemId, o.originalDate)));
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
		// Paid early: no payday keeps saving for it (its money is in `earlyOff` or the balance).
		if (earlyKeys.has(earlyKey(due.itemId, due.originalDate))) continue;

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

	const held = sum(setAsides.map((s) => s.held));
	const available = sub(
		sub(sub(add(balance, sum(incomeSinceBalance.map((o) => o.amount))), held), spent),
		earlyOff
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
		// Payments paid early that still count are spending already gone, like logged expenses.
		const gone = spent + earlyOff;
		let cause: ShortfallCause;
		if (uncovered.length > 0) cause = 'due';
		else if (gone > 0 && available + gone >= 0) cause = spent > 0 ? 'logged' : 'early';
		else if (gone > 0)
			cause = held > 0 ? (spent > 0 ? 'both' : 'early') : spent > 0 ? 'logged' : 'early';
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
		shortfall,
		paidEarly: early,
		paidEarlyOff: earlyOff
	};
}
