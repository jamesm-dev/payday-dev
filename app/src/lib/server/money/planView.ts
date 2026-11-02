/**
 * The plan for the next paychecks, as words ready to print. The server does all of it, like the home
 * number, so the browser gets text and nothing to compute.
 */
import type { CalDate } from '#lib/domain/dates.ts';
import { planPaychecks, type Paycheck } from '#lib/domain/plan.ts';
import type { Item } from '#lib/domain/schedule.ts';
import { dateText, moneyText } from '#lib/format.ts';
import type { Db } from '#lib/server/db/open.ts';
import { occurrenceKey } from './checkinForm.ts';
import { loadPlan, paidOccurrences } from './store.ts';

/** How many paychecks the plan shows, and so which ones can be exported. */
export const PLAN_LENGTH = 6;

/** What the plan knows beyond the schedule: each item's labels, and which payments are paid. */
export type Marks = { items: readonly Item[]; paid: ReadonlySet<string> };

export type PaycheckView = {
	/** The ISO payday, for a stable test id. */
	iso: string;
	/** "Friday, Nov 13" */
	payday: string;
	/** "Friday, Nov 27": the payday after, where this paycheck's span ends. */
	ends: string;
	pay: string;
	covers: {
		name: string;
		date: string;
		amount: string;
		/** The occurrence, for the paid form: its item and the date its rule gave it. */
		itemId: string;
		originalDate: string;
		paid: boolean;
		optional: boolean;
		group: string | null;
	}[];
	coversTotal: string;
	setAsides: { name: string; share: string; due: string }[];
	setAsideTotal: string;
	/** What is left, or what is missing as a negative amount. */
	left: string;
	short: boolean;
	shortBy: string;
	/** "A month with three paychecks", or null. */
	monthNote: string | null;
	/** True when this is the extra, third paycheck of its month. */
	isExtra: boolean;
	isToday: boolean;
};

export function presentPaycheck(
	p: Paycheck,
	today: CalDate,
	currency: string | null,
	marks: Marks = { items: [], paid: new Set() }
): PaycheckView {
	const money = (n: number) => moneyText(n, currency);
	const itemOf = (id: string) => marks.items.find((i) => i.id === id);
	return {
		iso: p.payday,
		payday: dateText(p.payday),
		ends: dateText(p.ends),
		pay: money(p.pay),
		covers: p.covers.map((o) => ({
			name: o.name,
			date: dateText(o.date),
			amount: money(o.amount),
			itemId: o.itemId,
			originalDate: o.originalDate,
			paid: marks.paid.has(occurrenceKey(o.itemId, o.originalDate)),
			optional: itemOf(o.itemId)?.optional === true,
			group: itemOf(o.itemId)?.group ?? null
		})),
		coversTotal: money(p.coversTotal),
		setAsides: p.setAsides.map((s) => ({
			name: s.name,
			share: money(s.share),
			due: `${money(s.amount)} due ${dateText(s.dueDate)}`
		})),
		setAsideTotal: money(p.setAsideTotal),
		left: money(p.left),
		short: p.short,
		shortBy: money(p.shortBy),
		monthNote: p.thirdPaycheckMonth
			? p.nthInMonth === 3
				? 'The extra paycheck: your third this month'
				: 'A month with three paychecks'
			: null,
		isExtra: p.thirdPaycheckMonth && p.nthInMonth === 3,
		isToday: p.payday === today
	};
}

export type PlanPage =
	{ state: 'ready'; today: string; paychecks: PaycheckView[] } | { state: 'empty'; today: string };

/** The next `count` paychecks from today, in words. Empty when no pay is scheduled. */
export function buildPlan(db: Db, ownerId: number, now: Date, count = PLAN_LENGTH): PlanPage {
	const plan = loadPlan(db, ownerId, now);
	const paychecks = planPaychecks(plan.items, plan.overrides, plan.today, count);
	if (paychecks.length === 0) return { state: 'empty', today: plan.today };
	const marks = { items: plan.items, paid: paidOccurrences(db, ownerId, plan.items) };
	return {
		state: 'ready',
		today: plan.today,
		paychecks: paychecks.map((p) => presentPaycheck(p, plan.today, plan.settings.currency, marks))
	};
}
