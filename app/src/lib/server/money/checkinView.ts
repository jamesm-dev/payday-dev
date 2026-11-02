/**
 * Each check-in screen as words ready to print: the step the saved check-in has reached, the numbers
 * it shows, and what to prefill. The server does all of it; the page only prints.
 */
import { addDays, type CalDate } from '#lib/domain/dates.ts';
import { formatMinor } from '#lib/domain/money.ts';
import { paydays } from '#lib/domain/periods.ts';
import { planPaychecks } from '#lib/domain/plan.ts';
import { expand } from '#lib/domain/schedule.ts';
import { dateText, moneyText } from '#lib/format.ts';
import type { Db } from '#lib/server/db/open.ts';
import {
	cardSpentOf,
	checkInContext,
	getLatestFinished,
	getOpenCheckIn,
	listFinished,
	loanLines,
	paymentLines,
	savedAnswers,
	scheduledPay,
	type CheckInRow
} from './checkin.ts';
import { buildHome, type HomeView } from './home.ts';
import { countingExpenses } from './expenses.ts';
import { checkInBalances, listLoans } from './loans.ts';
import { TYPE_LABELS } from './loanForm.ts';
import { presentPaycheck, type PaycheckView } from './planView.ts';
import { paidOccurrences } from './store.ts';

/** The steps of a check-in: one more when there are loans to confirm. */
export const stepCountFor = (hasLoans: boolean) => (hasLoans ? 6 : 5);
const STEP_NUMBER = { pay: 1, balance: 2, spending: 3, payments: 4, loans: 5 } as const;

/** "45 seconds", "4 minutes 12 seconds". */
export function durationText(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`;
	const m = Math.floor(s / 60);
	const rest = s % 60;
	const minutes = `${m} ${m === 1 ? 'minute' : 'minutes'}`;
	return rest === 0 ? minutes : `${minutes} ${rest} ${rest === 1 ? 'second' : 'seconds'}`;
}

export type SpendingWords = {
	/** "You spent $123.45", "You spent nothing", "$20.00 more arrived than expected". */
	headline: string;
	spent: string;
	negative: boolean;
};

export function spendingWords(spentMinor: number, currency: string | null): SpendingWords {
	const money = (n: number) => moneyText(n, currency);
	if (spentMinor > 0) {
		return {
			headline: `You spent ${money(spentMinor)}`,
			spent: money(spentMinor),
			negative: false
		};
	}
	if (spentMinor === 0) {
		return { headline: 'You spent nothing', spent: money(0), negative: false };
	}
	return {
		headline: `${money(-spentMinor)} more is there than expected`,
		spent: money(spentMinor),
		negative: true
	};
}

/** Logged against spent, in words. */
export type LoggedWords = {
	logged: string;
	spent: string;
	/** Spent less logged, when more went out than was logged; else null. */
	notLogged: string | null;
	/** One plain sentence, never a telling-off. */
	sentence: string;
};

/**
 * The expenses logged since the last balance, set beside what was spent. Null when nothing was
 * logged, so a check-in with no log reads exactly as it always did. A card purchase that was logged
 * is matched by the card's growth, which is already inside `spentMinor`: it is never added twice.
 */
export function loggedWords(
	spentMinor: number,
	loggedMinor: number | null,
	currency: string | null
): LoggedWords | null {
	if (loggedMinor === null) return null;
	const money = (n: number) => moneyText(n, currency);
	const diff = spentMinor - loggedMinor;
	const base = { logged: money(loggedMinor), spent: money(spentMinor) };
	if (diff > 0) {
		return {
			...base,
			notLogged: money(diff),
			sentence: `${money(diff)} of what you spent was not logged. That is only information: it is normal for some to slip by.`
		};
	}
	if (diff === 0) {
		return { ...base, notLogged: null, sentence: 'Everything you spent was logged.' };
	}
	return {
		...base,
		notLogged: null,
		sentence: `You logged ${money(-diff)} more than the bank shows. That can be cash, or something that has not gone through yet.`
	};
}

/** "Logged $80.00 of $100.00 spent", for the lists of past check-ins. */
export function loggedLine(
	spentMinor: number,
	loggedMinor: number | null,
	currency: string | null
): string | null {
	if (loggedMinor === null) return null;
	const money = (n: number) => moneyText(n, currency);
	if (spentMinor <= 0) return `Logged ${money(loggedMinor)}`;
	return loggedMinor > spentMinor
		? `Logged ${money(loggedMinor)}, more than the ${money(spentMinor)} spent`
		: `Logged ${money(loggedMinor)} of ${money(spentMinor)} spent`;
}

type Common = { stepNumber: number; stepCount: number; today: string };

export type CheckInView =
	| {
			step: 'start';
			today: string;
			since: string;
			last: { date: string; balance: string } | null;
			payday: boolean;
	  }
	| (Common & {
			step: 'pay';
			since: string;
			scheduled: string | null;
			scheduledLines: { name: string; date: string; amount: string }[];
			/** What the amount box starts with when the owner has typed nothing. */
			amount: string;
			landed: 'yes' | 'no' | '';
	  })
	| (Common & { step: 'balance'; balance: string })
	| (Common & {
			step: 'spending';
			baseBalance: string;
			baseDate: string;
			pay: string;
			paid: string;
			expected: string;
			actual: string;
			spending: SpendingWords;
			/** A credit card is in the ledger, so its purchases are counted at the loans step. */
			hasCard: boolean;
			/** Logged since the last balance; null when nothing was logged. */
			logged: string | null;
			/** With no card in the ledger: logged against spent. */
			comparison: LoggedWords | null;
	  })
	| (Common & {
			step: 'payments';
			since: string;
			lines: {
				key: string;
				name: string;
				date: string;
				amount: string;
				carried: boolean;
				chosen: 'paid' | 'missed' | '';
			}[];
	  })
	| (Common & {
			step: 'loans';
			since: string;
			lines: {
				id: number;
				name: string;
				kind: string;
				isCard: boolean;
				/** What the app expects, in words. */
				expected: string;
				/** What the box starts with: the saved answer, or the expected balance. */
				value: string;
			}[];
	  })
	| (Common & {
			step: 'finish';
			pay: string;
			actual: string;
			expected: string;
			spending: SpendingWords;
			/** Spent on a card since the last check-in, or null when there was none. */
			cardPurchases: string | null;
			/** Logged against everything spent, card purchases included; null when nothing was logged. */
			comparison: LoggedWords | null;
			paidCount: number;
			missed: { name: string; amount: string }[];
	  });

const plain = (n: number | null) => (n === null ? '' : formatMinor(n));

/** The screen for the check-in under way, or the start screen when there is none. */
export function presentCheckIn(db: Db, ownerId: number, now: Date): CheckInView | null {
	const ctx = checkInContext(db, ownerId, now);
	if (!ctx) return null;
	const { plan } = ctx;
	const currency = plan.settings.currency;
	const money = (n: number) => moneyText(n, currency);
	const today = plan.today;
	const since = dateText(ctx.base.asOf);
	const open = getOpenCheckIn(db, ownerId);

	if (!open) {
		const last = getLatestFinished(db, ownerId);
		return {
			step: 'start',
			today,
			since,
			last: last
				? { date: dateText(last.asOf as CalDate), balance: money(last.balanceMinor ?? 0) }
				: null,
			payday: paydays(plan.items, plan.overrides, today, today).length > 0
		};
	}

	const openLoans = listLoans(db, ownerId);
	const stepCount = stepCountFor(openLoans.length > 0);
	const common: Common = {
		stepNumber: STEP_NUMBER[open.currentStep as keyof typeof STEP_NUMBER] ?? stepCount,
		stepCount,
		today
	};

	switch (open.currentStep) {
		case 'pay': {
			const pay = scheduledPay(ctx);
			const saved = open.payLanded;
			return {
				...common,
				step: 'pay',
				since,
				scheduled: pay.lines.length > 0 ? money(pay.total) : null,
				scheduledLines: pay.lines.map((o) => ({
					name: o.name,
					date: dateText(o.date),
					amount: money(o.amount)
				})),
				amount:
					saved && open.payAmountMinor !== null
						? plain(open.payAmountMinor)
						: plain(pay.total || null),
				landed: saved === null ? (pay.lines.length > 0 ? 'yes' : 'no') : saved ? 'yes' : 'no'
			};
		}
		case 'balance':
			return { ...common, step: 'balance', balance: plain(open.balanceMinor) };
		case 'spending': {
			const payAmount = open.payLanded ? (open.payAmountMinor ?? 0) : 0;
			const expected = open.expectedMinor ?? 0;
			const hasCard = openLoans.some((l) => l.type === 'credit-card');
			const counting = countingExpenses(db, ownerId);
			const loggedMinor = counting.expenses.length > 0 ? counting.total : null;
			return {
				...common,
				step: 'spending',
				baseBalance: money(ctx.base.amount),
				baseDate: since,
				pay: money(payAmount),
				paid: money(ctx.base.amount + payAmount - expected),
				expected: money(expected),
				actual: money(open.balanceMinor ?? 0),
				spending: spendingWords(open.spentMinor ?? 0, currency),
				hasCard,
				logged: loggedMinor === null ? null : money(loggedMinor),
				comparison: hasCard ? null : loggedWords(open.spentMinor ?? 0, loggedMinor, currency)
			};
		}
		case 'loans': {
			const saved = checkInBalances(db, open.id);
			return {
				...common,
				step: 'loans',
				since,
				lines: loanLines(db, ownerId, ctx, open.id).map(({ loan, expected }) => ({
					id: Number(loan.id),
					name: loan.name,
					kind: TYPE_LABELS[loan.type],
					isCard: loan.type === 'credit-card',
					expected: money(expected),
					value: plain(saved.get(Number(loan.id)) ?? expected)
				}))
			};
		}
		case 'payments': {
			const answers = savedAnswers(db, open.id);
			// A bill marked paid on the plan starts ticked; an answer already given here stands.
			const paid = paidOccurrences(db, ownerId, plan.items);
			return {
				...common,
				step: 'payments',
				since,
				lines: paymentLines(ctx).map((l) => ({
					key: l.key,
					name: l.occurrence.name,
					date: dateText(l.occurrence.date),
					amount: money(l.occurrence.amount),
					carried: l.carried,
					chosen: answers.get(l.key) ?? (paid.has(l.key) ? ('paid' as const) : '')
				}))
			};
		}
		default: {
			const answers = savedAnswers(db, open.id);
			const lines = paymentLines(ctx);
			const counting = countingExpenses(db, ownerId);
			return {
				...common,
				step: 'finish',
				pay: money(open.payLanded ? (open.payAmountMinor ?? 0) : 0),
				actual: money(open.balanceMinor ?? 0),
				expected: money(open.expectedMinor ?? 0),
				spending: spendingWords(open.spentMinor ?? 0, currency),
				cardPurchases: cardSpentOf(open) > 0 ? money(cardSpentOf(open)) : null,
				comparison: loggedWords(
					open.spentMinor ?? 0,
					counting.expenses.length > 0 ? counting.total : null,
					currency
				),
				paidCount: lines.filter((l) => answers.get(l.key) === 'paid').length,
				missed: lines
					.filter((l) => answers.get(l.key) === 'missed')
					.map((l) => ({ name: l.occurrence.name, amount: money(l.occurrence.amount) }))
			};
		}
	}
}

export type PlanLine = { date: string; name: string; amount: string; incoming: boolean };

export type DonePage = {
	today: string;
	date: string;
	balance: string;
	spending: SpendingWords;
	duration: string;
	/** "Logged $X of $Y spent", when something was logged. */
	logged: string | null;
	/** The next 14 days: pay and payments in date order. */
	next14: PlanLine[];
	next14Out: string;
	/** Payments marked missed and still owed, which the number already holds back. */
	owed: { name: string; date: string; amount: string }[];
	home: HomeView;
	first: PaycheckView | null;
};

/** What the finished check-in ends on: the next 14 days, the new number, and the first paycheck. */
export function presentDone(db: Db, ownerId: number, now: Date): DonePage | null {
	const last = getLatestFinished(db, ownerId);
	const ctx = checkInContext(db, ownerId, now);
	if (!last || !ctx) return null;
	const { plan } = ctx;
	const currency = plan.settings.currency;
	const money = (n: number) => moneyText(n, currency);
	const today = plan.today;

	const upcoming = expand(plan.items, plan.overrides, addDays(today, 1), addDays(today, 14));
	let out = 0;
	for (const o of upcoming) if (o.kind !== 'income') out += o.amount;
	const first = planPaychecks(plan.items, plan.overrides, today, 1)[0];

	return {
		today,
		date: dateText(last.asOf as CalDate),
		balance: money(last.balanceMinor ?? 0),
		spending: spendingWords(last.spentMinor ?? 0, currency),
		duration: durationText(last.durationSeconds ?? 0),
		logged: loggedLine(last.spentMinor ?? 0, last.loggedMinor, currency),
		next14: upcoming.map((o) => ({
			date: dateText(o.date),
			name: o.name,
			amount: money(o.amount),
			incoming: o.kind === 'income'
		})),
		next14Out: money(out),
		owed: ctx.outstanding.map((o) => ({
			name: o.name,
			date: dateText(o.date),
			amount: money(o.amount)
		})),
		home: buildHome(db, ownerId, now),
		first: first ? presentPaycheck(first, today, currency) : null
	};
}

export type HistoryRow = {
	id: number;
	date: string;
	pay: string;
	balance: string;
	expected: string;
	spending: SpendingWords;
	duration: string;
	logged: string | null;
};

function historyRow(row: CheckInRow, today: CalDate, currency: string | null): HistoryRow {
	const money = (n: number) => moneyText(n, currency);
	return {
		id: row.id,
		logged: loggedLine(row.spentMinor ?? 0, row.loggedMinor, currency),
		date: dateText(row.asOf as CalDate),
		pay: row.payLanded ? money(row.payAmountMinor ?? 0) : 'Did not land',
		balance: money(row.balanceMinor ?? 0),
		expected: money(row.expectedMinor ?? 0),
		spending: spendingWords(row.spentMinor ?? 0, currency),
		duration: durationText(row.durationSeconds ?? 0)
	};
}

export function presentHistory(db: Db, ownerId: number, now: Date): HistoryRow[] {
	const ctx = checkInContext(db, ownerId, now);
	// With no balance there can be no check-ins; the settings still say the currency.
	if (!ctx) return [];
	return listFinished(db, ownerId).map((r) =>
		historyRow(r, ctx.plan.today, ctx.plan.settings.currency)
	);
}
