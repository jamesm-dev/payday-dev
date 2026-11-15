/*
 * Logged expenses beside a check-in's spending, on the fixture household of checkinLoans.test.ts: the
 * balance is 1,500.00 as of Fri 2026-10-02 (saved that day) and the check-in is on Fri 2026-10-30.
 *   Pay scheduled in (Oct 2, Oct 30]: 3,700.00. Payments in it: phone 45.00, card minimum 60.00.
 *   Expected in the account when every payment went out: 1,500.00 + 3,700.00 - 105.00 = 5,095.00.
 *   The Visa is expected at 1,774.49 (see checkinLoans.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	finishCheckIn,
	getLatestFinished,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { loggedWords, presentCheckIn, presentDone, presentHistory } from './checkinView.ts';
import { addExpense, countingExpenses } from './expenses.ts';
import { computeSafe } from './home.ts';
import { createLoan } from './loans.ts';
import { seedHousehold } from './seed.ts';
import { setBalance } from './store.ts';

const T1 = new Date('2026-10-30T12:00:00Z');
const T1_END = new Date('2026-10-30T12:03:00Z');
const OCT2 = d('2026-10-02');
const EXPECTED = 509500;
const VISA = 177449;

async function household(withCard: boolean) {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T1, loans: false });
	await setBalance(db, 1, minor(150000), OCT2, new Date('2026-10-02T12:00:00Z'));
	if (withCard) {
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
	return db;
}

type Db = Awaited<ReturnType<typeof household>>;

const log = (db: Db, amount: number, day = '2026-10-20', at = `${day}T15:00:00Z`) =>
	addExpense(db, 1, { amount: minor(amount), note: null, spentOn: d(day) }, new Date(at));

/** Up to the spending step with `bank` in the account. */
async function toSpending(db: Db, bank: number) {
	const row = await startCheckIn(db, 1, T1);
	await savePay(db, 1, row.id, { landed: true, amount: minor(370000) });
	await saveBalanceStep(db, 1, row.id, T1, minor(bank));
	return row;
}

/** From the spending step to the finish step; the Visa is confirmed at `visa` when there is one. */
async function toFinish(db: Db, id: number, visa?: number) {
	await acknowledgeSpending(db, 1, id);
	await savePayments(
		db,
		1,
		id,
		T1,
		new Map([
			['3|2026-10-15', 'paid' as const],
			['4|2026-10-28', 'paid' as const]
		])
	);
	if (visa !== undefined) await saveLoans(db, 1, id, T1, new Map([[1, minor(visa)]]));
}

describe('TSK-0F0D82 logged beside spent', () => {
	it('without a card: spent 200.00, logged 150.00 -> 50.00 not logged', async () => {
		const db = await household(false);
		await log(db, 10000);
		await log(db, 5000);
		await toSpending(db, EXPECTED - 20000);
		expect(await presentCheckIn(db, 1, T1)).toMatchObject({
			step: 'spending',
			hasCard: false,
			logged: '$150.00',
			comparison: { logged: '$150.00', spent: '$200.00', notLogged: '$50.00' }
		});
	});

	it('with a card: only what was logged, and no comparison yet', async () => {
		const db = await household(true);
		await log(db, 5000);
		await toSpending(db, EXPECTED - 20000);
		expect(await presentCheckIn(db, 1, T1)).toMatchObject({
			step: 'spending',
			hasCard: true,
			logged: '$50.00',
			comparison: null
		});
	});

	it('at the finish step the card purchases are in the spent figure: 200.00 + 40.00', async () => {
		const db = await household(true);
		await log(db, 24000);
		const row = await toSpending(db, EXPECTED - 20000);
		await toFinish(db, row.id, VISA + 4000);
		expect(await presentCheckIn(db, 1, T1)).toMatchObject({
			step: 'finish',
			comparison: { logged: '$240.00', spent: '$240.00', notLogged: null }
		});
	});

	it('nothing logged: no comparison anywhere', async () => {
		const db = await household(true);
		const row = await toSpending(db, EXPECTED - 20000);
		expect(await presentCheckIn(db, 1, T1)).toMatchObject({ logged: null, comparison: null });
		await toFinish(db, row.id, VISA);
		expect(await presentCheckIn(db, 1, T1)).toMatchObject({ step: 'finish', comparison: null });
		await finishCheckIn(db, 1, row.id, T1_END);
		expect((await getLatestFinished(db, 1))?.loggedMinor).toBeNull();
		expect((await presentDone(db, 1, T1_END))?.logged).toBeNull();
		expect((await presentHistory(db, 1, T1_END))[0].logged).toBeNull();
	});

	it('more logged than spent is said neutrally', () => {
		const words = loggedWords(10000, 15000, 'USD')!;
		expect(words.notLogged).toBeNull();
		expect(words.sentence).toBe(
			'You logged $50.00 more than your bank shows. It can be cash, or a payment the bank has not taken yet.'
		);
		expect(loggedWords(10000, 10000, 'USD')!.sentence).toBe('Everything you spent was logged.');
		expect(loggedWords(-500, 1000, 'USD')!.notLogged).toBeNull();
	});
});

describe('TSK-85A7C6 a logged card purchase is counted once', () => {
	it('logged 50.00 on the card, account spent 0, card grew 50.00 -> spent 50.00, logged 50.00', async () => {
		const db = await household(true);
		await log(db, 5000);
		const row = await toSpending(db, EXPECTED);
		await toFinish(db, row.id, VISA + 5000);
		expect(await presentCheckIn(db, 1, T1)).toMatchObject({
			step: 'finish',
			cardPurchases: '$50.00',
			comparison: {
				logged: '$50.00',
				spent: '$50.00',
				notLogged: null,
				sentence: 'Everything you spent was logged.'
			}
		});
	});
});

describe('TSK-3B4755 the check-in hands over to the next number', () => {
	it('after finishing, nothing counts and the number is the check-in own', async () => {
		const db = await household(false);
		await log(db, 10000);
		await log(db, 5000, '2026-10-30', '2026-10-30T09:00:00Z');
		const row = await toSpending(db, EXPECTED - 20000);
		expect((await countingExpenses(db, 1)).total).toBe(15000);
		await toFinish(db, row.id);

		// The same check-in with nothing logged: the number it ends on is the one to match.
		const bare = await household(false);
		const bareRow = await toSpending(bare, EXPECTED - 20000);
		await toFinish(bare, bareRow.id);
		await finishCheckIn(bare, 1, bareRow.id, T1_END);
		const bareNumber = await computeSafe(bare, 1, T1_END);

		await finishCheckIn(db, 1, row.id, T1_END);
		expect(await countingExpenses(db, 1)).toEqual({ expenses: [], total: 0 });
		const after = await computeSafe(db, 1, T1_END);
		if (after.state !== 'ready' || bareNumber.state !== 'ready')
			throw new Error('Expected a number');
		expect(after.result.amount).toBe(bareNumber.result.amount);

		// Only what is logged after the check-in lowers it.
		await log(db, 700, '2026-10-30', '2026-10-30T13:00:00Z');
		const later = await computeSafe(db, 1, T1_END);
		if (later.state !== 'ready') throw new Error('Expected a number');
		expect((await countingExpenses(db, 1)).total).toBe(700);
		expect(later.result.amount).toBe(after.result.amount - 700);
	});
});

describe('TSK-BCF25E the logged total is saved and shown in history', () => {
	it('stores 150.00 of 200.00 spent and prints it on the done page and in history', async () => {
		const db = await household(false);
		await log(db, 10000);
		await log(db, 5000);
		const row = await toSpending(db, EXPECTED - 20000);
		await toFinish(db, row.id);
		await finishCheckIn(db, 1, row.id, T1_END);
		expect((await getLatestFinished(db, 1))?.loggedMinor).toBe(15000);
		expect((await presentDone(db, 1, T1_END))?.logged).toBe('Logged $150.00 of $200.00 spent');
		expect((await presentHistory(db, 1, T1_END))[0].logged).toBe('Logged $150.00 of $200.00 spent');
	});
});
