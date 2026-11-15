/*
 * A loan payment paid early (ADR-0020, TSK-BFBB02), on the fixture household (ids: pay 1, rent 2,
 * phone 3, card 4, ...). Hand calculations:
 *
 *   The Visa: 1,800.00 at 22.99%, balance as of Fri 2026-10-02, the 60.00 card minimum due Oct 28;
 *   the update is on Fri Oct 30. Plain: 1,800.00 + 34.49 - 60.00 = 1,774.49 (one period, Oct 28).
 *   The Oct 28 payment paid early on Oct 20: 1,800.00 - 60.00 = 1,740.00 on Oct 20; interest on
 *   Oct 28 is 174000 x 2299 / 120000 = 3333.55, rounded 3334; expected 1,740.00 + 33.34 = 1,773.34.
 *   Paid early on Oct 1 (before the balance's day): the balance holds it, no payment is taken off:
 *   1,800.00 + 34.49 = 1,834.49. Marked "did not go out": 1,834.49 too.
 *
 *   A 300.00 plan at 0%, 100.00 on the 20th of each month: paid off Dec 20. The Dec 20 payment paid
 *   early on Oct 25: 100.00 leaves that day, so Oct 20 and Nov 20 clear it: debt free Nov 20.
 *   At the update on Oct 30 it expects 300.00 - 100.00 (Oct 20) - 100.00 (Oct 25) = 100.00, not 200.00.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	checkInContext,
	finishCheckIn,
	loanLines,
	paymentLines,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { presentCheckIn } from './checkinView.ts';
import { createLoan, loanExpectations } from './loans.ts';
import { presentLoans } from './loansView.ts';
import { seedHousehold } from './seed.ts';
import { addItem, loadPlan, setBalance, setPaidMark } from './store.ts';

const T1 = new Date('2026-10-30T12:00:00Z');
const OCT2 = d('2026-10-02');
const READ = new Date('2026-10-02T12:00:00Z');

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T1, loans: false });
	await setBalance(db, 1, minor(150000), OCT2, READ);
	return db;
}
type Db = Awaited<ReturnType<typeof household>>;

const markPaid = (db: Db, item: number, due: string, at: string) =>
	setPaidMark(db, 1, item, d(due), true, new Date(at));

async function addVisa(db: Db) {
	await createLoan(
		db,
		1,
		{
			type: 'credit-card',
			name: 'Visa',
			lender: null,
			balance: minor(180000),
			rateBp: 2299,
			scheduleItemId: 4,
			minPctBp: 200,
			minFloor: minor(2500)
		},
		OCT2
	);
}

async function expectedVisa(db: Db, answers = new Map<string, 'paid' | 'missed'>()) {
	const plan = await loadPlan(db, 1, T1);
	return (await loanExpectations(db, 1, plan, answers, []))[0].expected;
}

describe('TSK-BFBB02 a loan payment paid early lowers the expected balance', () => {
	it('is the plain figure with no marks', async () => {
		const db = await household();
		await addVisa(db);
		expect(await expectedVisa(db)).toBe(177449);
	});

	it('takes the payment off from the day it was paid, so the period interest falls', async () => {
		const db = await household();
		await addVisa(db);
		await markPaid(db, 4, '2026-10-28', '2026-10-20T09:00:00Z');
		expect(await expectedVisa(db)).toBe(177334);
	});

	it('does not take off a payment the balance already held (paid before its day)', async () => {
		const db = await household();
		await addVisa(db);
		await markPaid(db, 4, '2026-10-28', '2026-10-01T09:00:00Z');
		expect(await expectedVisa(db)).toBe(183449);
	});

	it('"did not go out" outranks the mark', async () => {
		const db = await household();
		await addVisa(db);
		await markPaid(db, 4, '2026-10-28', '2026-10-20T09:00:00Z');
		expect(await expectedVisa(db, new Map([['4|2026-10-28', 'missed']]))).toBe(183449);
	});
});

async function plan300(db: Db) {
	const item = await addItem(db, 1, {
		kind: 'loan-payment',
		name: 'Phone plan',
		amount: minor(10000),
		rule: { kind: 'monthly', day: 20 },
		startsOn: d('2026-10-01')
	});
	await createLoan(
		db,
		1,
		{
			type: 'instalment',
			name: 'Phone plan',
			lender: null,
			balance: minor(30000),
			rateBp: 0,
			scheduleItemId: Number(item.id),
			minPctBp: null,
			minFloor: null
		},
		OCT2
	);
	return Number(item.id);
}

describe('TSK-BFBB02 an early loan payment moves the debt-free date and the next update', () => {
	it('moves the debt-free date earlier on the loans screen', async () => {
		const db = await household();
		const id = await plan300(db);
		expect((await presentLoans(db, 1, T1)).debtFree.headline).toContain('Dec 20 2026');
		await markPaid(db, id, '2026-12-20', '2026-10-25T09:00:00Z');
		const page = await presentLoans(db, 1, T1);
		expect(page.debtFree.headline).toContain('Nov 20 2026');
		expect(page.loans[0].payoff).toContain('Nov 20 2026');
		// The December payment is already made: it is not the next one.
		expect(page.loans[0].next).toContain('Nov 20');
	});

	it('the next payday update expects the lower balance and shows it on the loans step', async () => {
		const db = await household();
		const id = await plan300(db);
		const T0 = T1;
		await markPaid(db, id, '2026-12-20', '2026-10-25T09:00:00Z');
		const row = await startCheckIn(db, 1, T0);
		await savePay(db, 1, row.id, { landed: true, amount: minor(370000) });
		await saveBalanceStep(db, 1, row.id, T0, minor(500000));
		await acknowledgeSpending(db, 1, row.id);
		await savePayments(db, 1, row.id, T0, new Map(await paidAnswers(db, T0)));
		const ctx = (await checkInContext(db, 1, T0))!;
		expect((await loanLines(db, 1, ctx, row.id))[0].expected).toBe(10000);
		const view = await presentCheckIn(db, 1, T0);
		expect(view).toMatchObject({ step: 'loans', lines: [{ expected: '$100.00' }] });
		await saveLoans(db, 1, row.id, T0, new Map([[1, minor(10000)]]));
		await finishCheckIn(db, 1, row.id, T0);
	});
});

/** Every payment due since the balance, answered paid. */
async function paidAnswers(db: Db, now: Date): Promise<[string, 'paid'][]> {
	const ctx = (await checkInContext(db, 1, now))!;
	return paymentLines(ctx).map((l) => [l.key, 'paid']);
}
