import { addDays, todayIn, type CalDate } from '../../src/lib/domain/dates.ts';
import { minor, parseMinor, type Minor } from '../../src/lib/domain/money.ts';
import { safeToSpend, type SafeToSpend } from '../../src/lib/domain/safeToSpend.ts';
import type { Item, Override } from '../../src/lib/domain/schedule.ts';
import { checkNewItem } from '../../src/lib/server/money/validate.ts';

/*
 * The fictional household of src/lib/domain/fixture.ts, typed into the setup screens the way a
 * person would. The expected numbers in the browser tests come from the domain engine, given these
 * same inputs and today's date: nothing is hard-coded, so the tests stay true on any day.
 */

/** The journey project's time zone: the app's "today" and the test's "today" are the same day. */
export const JOURNEY_TIME_ZONE = 'America/New_York';
export const CURRENCY = 'USD';

export const todayNow = (): CalDate => todayIn(JOURNEY_TIME_ZONE, new Date());

export type BillInput = {
	name: string;
	amount: string;
	repeat: 'every14' | 'monthly' | 'quarterly' | 'yearly';
	day?: string;
	date?: string;
};

export const PAY = { amount: '1,850.00', date: '2026-01-09' };
export const BALANCE = '2,300.00';

export const BILLS: BillInput[] = [
	{ name: 'Rent', amount: '1,200.00', repeat: 'monthly', day: '1' },
	{ name: 'Phone', amount: '45.00', repeat: 'monthly', day: '15' },
	{ name: 'Credit card minimum', amount: '60.00', repeat: 'monthly', day: '28' },
	{ name: 'Internet', amount: '55.00', repeat: 'monthly', day: '31' },
	{ name: 'Water', amount: '120.00', repeat: 'quarterly', date: '2026-01-31' },
	{ name: 'Car insurance', amount: '540.00', repeat: 'yearly', date: '2026-09-30' }
];

export const LOANS: BillInput[] = [
	{ name: 'Laptop instalment', amount: '37.50', repeat: 'every14', date: '2026-02-06' }
];

/** The fixture's laptop plan ends here; the journey ends it through the schedule screen. */
export const LOAN_LAST_PAYMENT = '2026-03-20';

/** Item ids are handed out in the order the journey creates them. */
export const ITEM_ID = { pay: '1', rent: '2', gym: '9' } as const;

/** The household as the app stores it after setup (and, optionally, the schedule edits). */
export function householdItems(
	today: CalDate,
	opts: { loanEnded?: boolean; gym?: { amount: string; endsOn: CalDate } } = {}
): Item[] {
	const forms: [Parameters<typeof checkNewItem>[0], Record<string, unknown>][] = [
		['income', { name: 'Pay', amount: PAY.amount, repeat: 'every14', date: PAY.date }],
		...BILLS.map(
			(b) => ['bill', b] as [Parameters<typeof checkNewItem>[0], Record<string, unknown>]
		),
		...LOANS.map(
			(b) => ['loan-payment', b] as [Parameters<typeof checkNewItem>[0], Record<string, unknown>]
		)
	];
	if (opts.gym) {
		forms.push(['bill', { name: 'Gym', amount: opts.gym.amount, repeat: 'monthly', day: '20' }]);
	}
	return forms.map(([kind, form], i) => {
		const checked = checkNewItem(kind, form, today);
		if (!checked.ok)
			throw new Error(`Test household is invalid: ${JSON.stringify(checked.problems)}`);
		const item: Item = { ...checked.value, id: String(i + 1) };
		if (kind === 'loan-payment' && opts.loanEnded) item.endsOn = LOAN_LAST_PAYMENT as CalDate;
		if (opts.gym && item.name === 'Gym') item.endsOn = opts.gym.endsOn;
		return item;
	});
}

export function expectedNumber(
	today: CalDate,
	opts: {
		items?: Item[];
		overrides?: Override[];
		balance?: string;
		balanceAsOf?: CalDate;
		/** Logged expenses that still count, as typed ("17.50"), summed and taken off the number. */
		expenses?: string[];
	} = {}
): SafeToSpend {
	return safeToSpend({
		items: opts.items ?? householdItems(today),
		overrides: opts.overrides ?? [],
		balance: parseMinor(opts.balance ?? BALANCE) as Minor,
		balanceAsOf: opts.balanceAsOf ?? today,
		today,
		expenses: minor((opts.expenses ?? []).reduce((sum, e) => sum + parseMinor(e), 0))
	});
}

export const yesterday = (today: CalDate) => addDays(today, -1);
