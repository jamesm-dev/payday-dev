/**
 * The home screen's number, from the data layer through `safeToSpend` to words ready to print. The
 * server does all of it, so the browser gets text and nothing to fetch (and little to run).
 */
import type { CalDate } from '#lib/domain/dates.ts';
import { paydays, previousPayday } from '#lib/domain/periods.ts';
import type { Occurrence } from '#lib/domain/schedule.ts';
import { safeToSpend, type SafeToSpend, type ShortfallCause } from '#lib/domain/safeToSpend.ts';
import { dateText, moneyText } from '#lib/format.ts';
import type { Db } from '#lib/server/db/open.ts';
import { getLatestFinished, getOpenCheckIn, listOutstanding } from './checkin.ts';
import { loadPlan, type Plan } from './store.ts';

/** The data layer plus the engine: what the performance test times. */
export type Computed =
	| { state: 'ready'; plan: Plan; result: SafeToSpend; outstanding: Occurrence[] }
	| { state: 'no-balance'; plan: Plan }
	| { state: 'no-payday'; plan: Plan };

export function computeSafe(db: Db, ownerId: number, now: Date): Computed {
	const plan = loadPlan(db, ownerId, now);
	if (!plan.balance) return { state: 'no-balance', plan };
	try {
		const outstanding = listOutstanding(db, ownerId, plan.items);
		const result = safeToSpend({
			items: plan.items,
			overrides: plan.overrides,
			balance: plan.balance.amount,
			balanceAsOf: plan.balance.asOf,
			today: plan.today,
			outstanding,
			expenses: plan.expensesTotal
		});
		return { state: 'ready', plan, result, outstanding };
	} catch {
		// safeToSpend throws only when no payday is scheduled after today.
		return { state: 'no-payday', plan };
	}
}

export type Line = {
	name: string;
	date: string;
	amount: string;
	/** A payment marked missed at a check-in and not yet confirmed paid. */
	missed?: boolean;
	/** The schedule item it comes from, so the line can open it (to skip or move one payment). */
	itemId?: string;
};

/** One logged expense as the home screen lists it. */
export type ExpenseLine = {
	id: number;
	/** What it was for, or "Expense" when the note was left empty. */
	name: string;
	/** "Fri, Nov 6 2026" */
	date: string;
	amount: string;
};

/** What the home screen offers about the check-in. */
export type CheckInPrompt = {
	/** Today is a payday. */
	payday: boolean;
	/** A check-in was started and not finished. */
	open: boolean;
	/** A check-in was finished today. */
	doneToday: boolean;
	/** The one nudge to show, if any; see `nudgeFor`. */
	nudge: 'resume' | 'payday' | null;
};

/**
 * Which nudge the home screen shows. A check-in that is half done comes first, whatever the day;
 * otherwise payday asks for one, unless one was already finished today.
 */
export function nudgeFor(state: Omit<CheckInPrompt, 'nudge'>): CheckInPrompt['nudge'] {
	if (state.open) return 'resume';
	if (state.payday && !state.doneToday) return 'payday';
	return null;
}

export type HomeView =
	| { state: 'no-balance' | 'no-payday'; today: string }
	| {
			state: 'ready';
			amount: string;
			negative: boolean;
			/** "Friday, Nov 6" */
			until: string;
			balance: string;
			balanceDate: string;
			/** The ISO date, to prefill the update-balance form. */
			today: string;
			stale: boolean;
			lastPayday: string | null;
			reserved: Line[];
			reservedTotal: string;
			setAsides: { name: string; held: string; amount: string; due: string }[];
			incomeSince: Line[];
			shortfall: { short: string; uncovered: Line[]; cause: ShortfallCause } | null;
			/** Logged spending that still counts toward the number (ADR-0012), newest first. */
			expenses: ExpenseLine[];
			/** Their total, as money text. */
			expensesTotal: string;
			checkIn: CheckInPrompt;
	  };

export function presentHome(
	computed: Computed,
	checkIn: CheckInPrompt = { payday: false, open: false, doneToday: false, nudge: null }
): HomeView {
	if (computed.state !== 'ready') return { state: computed.state, today: computed.plan.today };
	const { plan, result } = computed;
	const { today } = plan;
	const balance = plan.balance!;
	const currency = plan.settings.currency;
	const money = (n: number) => moneyText(n, currency);
	const missedKeys = new Set(computed.outstanding.map((o) => `${o.itemId}|${o.originalDate}`));
	const line = (o: {
		name: string;
		date: CalDate;
		amount: number;
		itemId?: string;
		originalDate?: CalDate;
	}): Line => ({
		name: o.name,
		date: dateText(o.date),
		amount: money(o.amount),
		...(missedKeys.has(`${o.itemId}|${o.originalDate}`) ? { missed: true } : {}),
		...(o.itemId ? { itemId: o.itemId } : {})
	});
	const last = previousPayday(plan.items, plan.overrides, today);
	let reservedTotal = 0;
	for (const o of result.reserved) reservedTotal += o.amount;

	return {
		state: 'ready',
		amount: money(result.amount),
		negative: result.amount < 0,
		until: dateText(result.nextPayday),
		balance: money(balance.amount),
		balanceDate: dateText(balance.asOf),
		today,
		stale: result.balanceIsStale,
		lastPayday: last ? dateText(last) : null,
		reserved: result.reserved.map(line),
		reservedTotal: money(reservedTotal),
		setAsides: result.setAsides.map((s) => ({
			name: s.name,
			held: money(s.held),
			amount: money(s.amount),
			due: dateText(s.dueDate)
		})),
		incomeSince: result.incomeSinceBalance.map(line),
		shortfall: result.shortfall
			? {
					short: money(result.shortfall.short),
					uncovered: result.shortfall.uncovered.map(line),
					cause: result.shortfall.cause
				}
			: null,
		checkIn,
		expenses: plan.expenses.map((e) => ({
			id: e.id,
			name: e.note ?? 'Expense',
			date: dateText(e.spentOn),
			amount: money(e.amount)
		})),
		expensesTotal: money(plan.expensesTotal)
	};
}

/** Whether to nudge toward a check-in: it is payday, one is half done, or one was done today. */
export function checkInPrompt(db: Db, ownerId: number, plan: Plan): CheckInPrompt {
	const latest = getLatestFinished(db, ownerId);
	const state = {
		payday: paydays(plan.items, plan.overrides, plan.today, plan.today).length > 0,
		open: getOpenCheckIn(db, ownerId) !== null,
		doneToday: latest !== null && latest.asOf === plan.today
	};
	return { ...state, nudge: nudgeFor(state) };
}

export function buildHome(db: Db, ownerId: number, now: Date): HomeView {
	const computed = computeSafe(db, ownerId, now);
	return presentHome(computed, checkInPrompt(db, ownerId, computed.plan));
}
