/**
 * The copy, with what the phone logged since (ADR-0029). The number shown is the copy's, less each
 * queued expense that counts: dated on or after the balance's day, the rule the site uses
 * (ADR-0012), since a queued expense is always logged after the balance was read. A refused one
 * still counts: the money was spent, and the number errs low until the person fixes or removes it.
 * Pure, so the home screen and the offline page show the same thing.
 */
import { compareDates, todayIn, type CalDate } from '#lib/domain/dates.ts';
import { dateText, moneyText } from '#lib/format.ts';
import type { CopyFacts } from '#lib/server/money/home.ts';
import type { Queued, ReadyView } from './store.ts';

/** A queued expense as the home screen lists it, above the saved ones. */
export type PendingLine = {
	id: string;
	name: string;
	date: string;
	amount: string;
	/** The site's reason for refusing it; absent while it waits to be sent. */
	problem?: string;
	/** The site has saved it, and the copy shown does not hold it yet. */
	sent?: true;
};

export function withQueued(
	view: ReadyView,
	facts: CopyFacts,
	queue: readonly Queued[]
): { view: ReadyView; pending: PendingLine[] } {
	const counting = queue.filter((q) => compareDates(q.date, facts.balanceAsOf) >= 0);
	const off = counting.reduce((total, q) => total + q.amount, 0);
	const pending = [...queue]
		.sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : a.loggedAt > b.loggedAt ? -1 : 0))
		.map((q) => ({
			id: q.id,
			name: q.note || 'Expense',
			date: dateText(q.date),
			amount: moneyText(q.amount, facts.currency),
			...(q.state === 'refused' && q.problem ? { problem: q.problem } : {}),
			...(q.state === 'sent' ? { sent: true as const } : {})
		}));
	if (off === 0) return { view, pending };
	const amount = facts.amountMinor - off;
	return {
		view: {
			...view,
			amount: moneyText(amount, facts.currency),
			negative: amount < 0,
			expensesTotal: moneyText(facts.expensesTotalMinor + off, facts.currency)
		},
		pending
	};
}

/** The day it is for the owner, in their time zone (the site's `ownerToday`). */
export const ownerTodayIn = (facts: Pick<CopyFacts, 'timeZone'>, now: Date): CalDate => {
	try {
		return todayIn(facts.timeZone, now);
	} catch {
		return todayIn('UTC', now);
	}
};

/** True once the copy's next payday has come: its number belongs to a paycheck that has ended. */
export const paydayPassed = (facts: CopyFacts, now: Date): boolean =>
	compareDates(ownerTodayIn(facts, now), facts.nextPayday) >= 0;

/** "Mon, Nov 16 2026 at 10:42 AM": when the site worked the copy out, in the owner's time zone. */
export function fromText(facts: Pick<CopyFacts, 'at' | 'timeZone'>): string {
	const at = new Date(facts.at);
	if (Number.isNaN(at.getTime())) return 'an earlier visit';
	const day = dateText(ownerTodayIn(facts, at));
	let time: string;
	try {
		time = new Intl.DateTimeFormat('en-US', {
			timeZone: facts.timeZone,
			hour: 'numeric',
			minute: '2-digit'
		}).format(at);
	} catch {
		time = new Intl.DateTimeFormat('en-US', {
			timeZone: 'UTC',
			hour: 'numeric',
			minute: '2-digit'
		}).format(at);
	}
	return `${day} at ${time}`;
}
