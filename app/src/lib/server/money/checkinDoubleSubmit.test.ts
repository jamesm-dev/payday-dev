/*
 * A double tap, or the same form sent from two devices, reaches the server twice at once. On
 * Postgres the two requests run side by side, so each check-in step takes the owner lock, reads the
 * check-in under it, and moves it on only from the step it was read at. The second submit then finds
 * the step already done: it is refused the way any out-of-turn post is (a redirect on the page) and
 * writes nothing. These tests send both at once and look at what is left.
 *
 * PGlite runs one statement at a time, so these prove the outcome, not the waiting; the lock itself
 * is covered by db/lockOrder.test.ts.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { checkIn, loanBalance, owner, paymentConfirmation } from '#lib/server/db/schema.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import {
	acknowledgeSpending,
	CheckInError,
	discardCheckIn,
	finishCheckIn,
	getOpenCheckIn,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { addExpense } from './expenses.ts';
import { createLoan, listLoans, listTotals } from './loans.ts';
import { seedHousehold } from './seed.ts';
import { setBalance } from './store.ts';

const T1 = new Date('2026-10-30T12:00:00Z');
const OCT2 = d('2026-10-02');
const PAYMENTS = new Map<string, 'paid' | 'missed'>([
	['3|2026-10-15', 'paid'],
	['4|2026-10-28', 'paid']
]);

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T1, loans: false });
	await setBalance(db, 1, minor(150000), OCT2);
	for (const name of ['Dad', 'Friend']) {
		await createLoan(
			db,
			1,
			{
				type: 'informal',
				name,
				lender: null,
				balance: minor(50000),
				rateBp: 0,
				scheduleItemId: null,
				minPctBp: null,
				minFloor: null
			},
			OCT2
		);
	}
	return db;
}
type Db = Awaited<ReturnType<typeof household>>;

/** Sends the same thing twice at once; exactly one lands and the other is the "already done" refusal. */
async function twice(send: () => Promise<unknown>) {
	const results = await Promise.allSettled([send(), send()]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
	expect(refused.reason).toBeInstanceOf(CheckInError);
}

async function upTo(db: Db, step: 'balance' | 'spending' | 'payments' | 'loans' | 'finish') {
	const row = await startCheckIn(db, 1, T1);
	const order = ['balance', 'spending', 'payments', 'loans', 'finish'];
	const at = order.indexOf(step);
	await savePay(db, 1, row.id, { landed: true, amount: minor(370000) });
	if (at >= 1) await saveBalanceStep(db, 1, row.id, T1, minor(489500));
	if (at >= 2) await acknowledgeSpending(db, 1, row.id);
	if (at >= 3) await savePayments(db, 1, row.id, T1, PAYMENTS);
	if (at >= 4) {
		const loans = await listLoans(db, 1);
		await saveLoans(db, 1, row.id, T1, new Map(loans.map((l) => [Number(l.id), minor(50000)])));
	}
	return row.id;
}

describe('TSK-47ADF0 a check-in step sent twice at once is harmless the second time', () => {
	it('starting twice opens one check-in, and both taps get it', async () => {
		const db = await household();
		const [a, b] = await Promise.all([startCheckIn(db, 1, T1), startCheckIn(db, 1, T1)]);
		expect(a.id).toBe(b.id);
		expect(await db.select().from(checkIn)).toHaveLength(1);
	});

	it('the database itself refuses a second unfinished check-in', async () => {
		const db = await household();
		await startCheckIn(db, 1, T1);
		await expect(
			db.insert(checkIn).values({ ownerId: 1, startedAt: T1.toISOString(), asOf: '2026-10-30' })
		).rejects.toBeTruthy();
	});

	it('the pay step twice moves on once', async () => {
		const db = await household();
		const row = await startCheckIn(db, 1, T1);
		await twice(() => savePay(db, 1, row.id, { landed: true, amount: minor(370000) }));
		expect(await getOpenCheckIn(db, 1)).toMatchObject({ currentStep: 'balance' });
	});

	it('the balance step twice moves on once', async () => {
		const db = await household();
		const id = await upTo(db, 'balance');
		await twice(() => saveBalanceStep(db, 1, id, T1, minor(489500)));
		expect(await getOpenCheckIn(db, 1)).toMatchObject({ currentStep: 'spending' });
	});

	it('the payments step twice keeps one answer for each payment', async () => {
		const db = await household();
		const id = await upTo(db, 'payments');
		await twice(() => savePayments(db, 1, id, T1, PAYMENTS));
		expect(await db.select().from(paymentConfirmation)).toHaveLength(PAYMENTS.size);
	});

	it('the loans step twice keeps one balance for each loan, and the debt is counted once', async () => {
		const db = await household();
		const id = await upTo(db, 'loans');
		const loans = await listLoans(db, 1);
		const answers = new Map(loans.map((l) => [Number(l.id), minor(50000)]));
		await twice(() => saveLoans(db, 1, id, T1, answers));
		const kept = (await db.select().from(loanBalance)).filter((b) => b.checkInId === id);
		expect(kept).toHaveLength(loans.length);
		await finishCheckIn(db, 1, id, T1);
		expect(await listTotals(db, 1)).toMatchObject([{ total: 100000 }]);
	});

	it('the database itself refuses a second balance for one loan at one check-in', async () => {
		const db = await household();
		const id = await upTo(db, 'finish');
		const [first] = await db.select().from(loanBalance).where(eqCheckIn(id));
		const { id: _id, ...copy } = first;
		void _id;
		await expect(db.insert(loanBalance).values(copy)).rejects.toBeTruthy();
	});

	it('finishing twice saves once: what was logged and the balance stay as the first left them', async () => {
		const db = await household();
		const id = await upTo(db, 'finish');
		await addExpense(
			db,
			1,
			{ amount: minor(1500), note: 'Lunch', spentOn: d('2026-10-30') },
			new Date('2026-10-30T13:00:00Z')
		);
		await twice(() => finishCheckIn(db, 1, id, new Date('2026-10-30T12:05:00Z')));
		const [row] = await db.select().from(checkIn);
		expect(row.loggedMinor).toBe(1500);
		expect(row.finishedAt).toBe('2026-10-30T12:05:00.000Z');
	});

	it('discarding twice is harmless: the second finds nothing to throw away', async () => {
		const db = await household();
		const id = await upTo(db, 'spending');
		await Promise.all([discardCheckIn(db, 1, id), discardCheckIn(db, 1, id)]);
		expect(await db.select().from(checkIn)).toEqual([]);
	});
});

const eqCheckIn = (id: number) => eq(loanBalance.checkInId, id);
