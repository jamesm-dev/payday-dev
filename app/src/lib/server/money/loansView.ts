/**
 * The loans ledger as words ready to print: the balances, each rate (unknown when it is), the next
 * payment, the interest this month and the debt-free date. The server does all of it and the page
 * only prints. Every figure comes from the pure engine in `#lib/domain/loans.ts`.
 */
import { addDays, type CalDate } from '#lib/domain/dates.ts';
import {
	cardMinimum,
	debtFreeDate,
	interestThisMonth,
	paymentPlanFor,
	projectLoan,
	unknownRateLoans,
	type DebtFree,
	type LoanType,
	type NamedProjection,
	type Projection
} from '#lib/domain/loans.ts';
import { expand } from '#lib/domain/schedule.ts';
import { dateText, moneyText, ruleText } from '#lib/format.ts';
import type { Db } from '#lib/server/db/open.ts';
import { TYPE_LABELS } from './loanForm.ts';
import { listLoans, listTotals, totalOwed } from './loans.ts';
import { loadPlan, type Plan } from './store.ts';

/** "22.99%". */
export const percentText = (bp: number): string =>
	`${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')}%`;

export type LoanLine = {
	id: string;
	name: string;
	type: LoanType;
	kind: string;
	lender: string | null;
	balance: string;
	balanceDate: string;
	/** "22.99% a year", or "Unknown". */
	rate: string;
	rateKnown: boolean;
	next: string;
	payoff: string;
	/** True when the projection has no date to give (never, no payments, or they run out). */
	stuck: boolean;
};

export type DebtFreeView = {
	kind: DebtFree['kind'];
	/** "Debt free by Friday, Sep 1, 2029", "Never at this pace", "Nothing owed". */
	headline: string;
	/** Plain sentences under the headline. */
	notes: string[];
	/** The rates the date assumes, one per loan. */
	assumes: string[];
};

export type TotalLine = {
	id: number;
	date: string;
	total: string;
	/** "Down $120.00", "Up $40.00", "No change", or null for the first. */
	change: string | null;
	direction: 'down' | 'up' | 'same' | null;
};

export type LoansPage = {
	today: string;
	empty: boolean;
	total: string;
	interest: string;
	/** Loans with an unknown rate, which the interest figure counts as nothing. */
	unknownRates: string[];
	debtFree: DebtFreeView;
	loans: LoanLine[];
	/** Loan payments on the schedule that are not yet a loan. */
	convertible: { id: string; name: string; amount: string; rule: string }[];
	history: TotalLine[];
};

const joinNames = (names: readonly string[]): string =>
	names.length <= 1
		? (names[0] ?? '')
		: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function payoffText(p: Projection, today: CalDate, currency: string | null): string {
	const money = (n: number) => moneyText(n, currency);
	switch (p.kind) {
		case 'payoff':
			return p.payments === 0
				? 'Nothing left to pay'
				: `Paid off by ${dateText(p.date)}, ${p.interest === 0 ? 'with no interest' : `with ${money(p.interest)} of interest`}`;
		case 'never':
			return p.reason === 'interest'
				? 'Never at this pace: the payment does not cover the interest'
				: 'More than 50 years at this pace';
		case 'no-payments':
			return 'No payments set up, so no date';
		case 'runs-out':
			return `Payments end ${dateText(p.lastPayment ?? today)} with ${money(p.remaining)} still owed`;
		case 'unknown-rate':
			return p.assumingNoInterest.kind === 'payoff'
				? `Paid off by ${dateText(p.assumingNoInterest.date)} if there is no interest, since the rate is unknown`
				: `Rate unknown. ${payoffText(p.assumingNoInterest, today, currency)}`;
	}
}

function debtFreeView(
	result: DebtFree,
	today: CalDate,
	rows: readonly { name: string; rateBp: number | null }[]
): DebtFreeView {
	const assumes = rows.map((r) =>
		r.rateBp === null
			? `${r.name}: rate unknown, counted as no interest`
			: `${r.name}: ${percentText(r.rateBp)} a year`
	);
	switch (result.kind) {
		case 'none':
			return { kind: 'none', headline: 'Nothing owed', notes: [], assumes: [] };
		case 'date': {
			const notes = [
				'That is when the last loan is paid off, if you keep making the payments you make now.'
			];
			if (result.unknownRates.length > 0) {
				notes.push(
					`The date assumes the rates Payday knows. ${joinNames(result.unknownRates)} ${result.unknownRates.length === 1 ? 'has' : 'have'} no rate yet, so ${result.unknownRates.length === 1 ? 'it is' : 'they are'} counted as no interest, and the real date may be later.`
				);
			}
			return {
				kind: 'date',
				headline: `Debt free by ${dateText(result.date)}`,
				notes,
				assumes
			};
		}
		case 'blocked': {
			const by = (reason: string) =>
				result.blocked.filter((b) => b.reason === reason).map((b) => b.name);
			const never = by('never');
			const runsOut = by('runs-out');
			const none = by('no-payments');
			const notes: string[] = [];
			if (never.length > 0) {
				notes.push(
					`${joinNames(never)}: the payment does not cover the interest, so ${never.length === 1 ? 'it' : 'they'} will never be paid off at this pace.`
				);
			}
			if (runsOut.length > 0) {
				notes.push(
					`${joinNames(runsOut)}: the payments stop before ${runsOut.length === 1 ? 'it is' : 'they are'} paid off.`
				);
			}
			if (none.length > 0) {
				notes.push(`${joinNames(none)}: no payments are set up yet, so there is nothing to count.`);
			}
			if (result.unknownRates.length > 0) {
				notes.push(`${joinNames(result.unknownRates)}: rate unknown, counted as no interest.`);
			}
			return {
				kind: 'blocked',
				headline: never.length > 0 ? 'Never at this pace' : 'No date yet',
				notes,
				assumes
			};
		}
	}
}

/** Everything the loans page prints. */
export function presentLoans(
	db: Db,
	ownerId: number,
	now: Date,
	plan = loadPlan(db, ownerId, now)
): LoansPage {
	const { today, items, overrides, settings } = plan;
	const currency = settings.currency;
	const money = (n: number) => moneyText(n, currency);
	const loans = listLoans(db, ownerId);

	const projections: NamedProjection[] = [];
	const lines: LoanLine[] = loans.map((l) => {
		const paymentPlan = paymentPlanFor(l, items, overrides, l.balanceAsOf);
		const projection = projectLoan(l, paymentPlan, l.balanceAsOf);
		projections.push({ loanId: l.id, name: l.name, projection });

		let next: string;
		const item = items.find((i) => i.id === l.scheduleItemId);
		if (l.balance === 0) {
			next = 'Nothing is owed on it';
		} else if (item) {
			const mine = overrides.filter((o) => o.itemId === item.id);
			const first = expand([item], mine, today, addDays(today, 800))[0];
			next = first
				? `Next payment ${money(first.amount)} on ${dateText(first.date)}`
				: 'No more payments coming';
		} else if (l.type === 'credit-card' && (l.minPctBp !== null || l.minFloor !== null)) {
			next = `Minimum payment about ${money(cardMinimum(l.balance, l.minPctBp, l.minFloor))}, no date set`;
		} else {
			next = 'No payment set up yet';
		}

		return {
			id: l.id,
			name: l.name,
			type: l.type,
			kind: TYPE_LABELS[l.type],
			lender: l.lender,
			balance: money(l.balance),
			balanceDate: dateText(l.balanceAsOf),
			rate: l.rateBp === null ? 'Unknown' : `${percentText(l.rateBp)} a year`,
			rateKnown: l.rateBp !== null,
			next,
			payoff: payoffText(projection, today, currency),
			stuck:
				projection.kind === 'never' ||
				projection.kind === 'no-payments' ||
				projection.kind === 'runs-out'
		};
	});

	const linked = new Set(loans.map((l) => l.scheduleItemId));
	const convertible = items
		.filter(
			(i) =>
				i.kind === 'loan-payment' &&
				!linked.has(i.id) &&
				(i.endsOn === undefined || i.endsOn >= today)
		)
		.map((i) => ({
			id: i.id,
			name: i.name,
			amount: money(i.amount),
			rule: ruleText(i.rule.kind === 'monthly' ? i.rule : { kind: i.rule.kind })
		}));

	const totals = listTotals(db, ownerId);
	const history: TotalLine[] = totals.map((t, i) => {
		const before = totals[i + 1];
		const diff = before ? t.total - before.total : 0;
		return {
			id: t.checkInId,
			date: dateText(t.asOf),
			total: money(t.total),
			change: !before
				? null
				: diff < 0
					? `Down ${money(-diff)}`
					: diff > 0
						? `Up ${money(diff)}`
						: 'No change',
			direction: !before ? null : diff < 0 ? 'down' : diff > 0 ? 'up' : 'same'
		};
	});

	return {
		today,
		empty: loans.length === 0,
		total: money(totalOwed(loans)),
		interest: money(interestThisMonth(loans)),
		unknownRates: unknownRateLoans(loans).map((l) => l.name),
		debtFree: debtFreeView(
			debtFreeDate(projections),
			today,
			loans.map((l) => ({ name: l.name, rateBp: l.rateBp }))
		),
		loans: lines,
		convertible,
		history
	};
}

/**
 * The schedule payments a loan may link to: not pay, and not already another loan's. An ended payment
 * can still be linked (a plan that has finished), and says so.
 */
export function linkableItems(
	plan: Plan,
	taken: ReadonlySet<string>,
	keep: string | null
): { id: string; label: string }[] {
	const money = (n: number) => moneyText(n, plan.settings.currency);
	return plan.items
		.filter((i) => i.kind !== 'income' && (i.id === keep || !taken.has(i.id)))
		.map((i) => {
			const rule = ruleText(i.rule.kind === 'monthly' ? i.rule : { kind: i.rule.kind });
			const ended = i.endsOn !== undefined && i.endsOn < plan.today ? ', ended' : '';
			return { id: i.id, label: `${i.name}: ${money(i.amount)}, ${rule.toLowerCase()}${ended}` };
		});
}
