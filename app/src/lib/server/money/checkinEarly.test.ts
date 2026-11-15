/*
 * A payday update and a bill paid early (ADR-0020, owner's answer Q2), on the fixture household
 * (ids: pay 1, rent 2, phone 3, card 4, internet 5, water 6, insurance 7, bnpl 8). The balance is
 * 1,500.00 as of Fri 2026-10-02, read at noon that day; the update is on Fri 2026-10-16 (UTC).
 * Hand calculations:
 *   Pay scheduled in (Oct 2, Oct 16]: 1,850.00. Payment due in it: phone Oct 15, 45.00.
 *   Plain expected balance: 1,500.00 + 1,850.00 - 45.00 = 3,305.00.
 *   Phone paid early (any day after Oct 2): the same 3,305.00, the line already answered.
 *   Rent (Nov 1, 1,200.00) paid early inside the window, though due later: 3,305.00 - 1,200.00 = 2,105.00.
 *   Phone paid early on Oct 1, before the balance's day: the balance holds it, so 1,500.00 + 1,850.00 = 3,350.00.
 *   A mark on Oct 2 itself counts only when made after the balance was read (noon).
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	finishCheckIn,
	getOpenCheckIn,
	goBack,
	listOutstanding,
	saveBalanceStep,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { presentCheckIn } from './checkinView.ts';
import { seedHousehold } from './seed.ts';
import { listItems, setBalance, setPaidMark } from './store.ts';

const T0 = new Date('2026-10-16T12:00:00Z');
const READ = new Date('2026-10-02T12:00:00Z');

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'), READ);
	return db;
}
type Db = Awaited<ReturnType<typeof household>>;

const markPaid = (db: Db, item: number, due: string, at: string) =>
	setPaidMark(db, 1, item, d(due), true, new Date(at));

/** Runs the update to the payments step and returns the expected balance the balance step saved. */
async function toPayments(db: Db) {
	const row = await startCheckIn(db, 1, T0);
	await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
	await saveBalanceStep(db, 1, row.id, T0, minor(300000));
	const expected = (await getOpenCheckIn(db, 1))!.expectedMinor;
	await acknowledgeSpending(db, 1, row.id);
	return { id: row.id, expected };
}

async function paymentsView(db: Db) {
	const view = await presentCheckIn(db, 1, T0);
	if (!view || view.step !== 'payments') throw new Error('not at the payments step');
	return view;
}

describe('TSK-C00C8A a bill paid early is already answered at the payday update', () => {
	it('shows "Paid early" for a bill due in the window, and asks no question about it', async () => {
		const db = await household();
		await markPaid(db, 3, '2026-10-15', '2026-10-10T09:00:00Z');
		await toPayments(db);
		const view = await paymentsView(db);
		expect(view.lines).toEqual([]);
		expect(view.early).toMatchObject([{ key: '3|2026-10-15', name: 'Phone', amount: '$45.00' }]);
		expect(view.early[0].paidOn).toContain('Oct 10');
		// No answer is needed: the step saves with none and keeps the money off once.
		const { id } = (await getOpenCheckIn(db, 1))! as { id: number };
		await savePayments(db, 1, id, T0, new Map());
		expect((await getOpenCheckIn(db, 1))!.expectedMinor).toBe(330500);
	});

	it('"did not go out" outranks the mark: the money is kept for it and it is owed again', async () => {
		const db = await household();
		await markPaid(db, 3, '2026-10-15', '2026-10-10T09:00:00Z');
		const { id } = await toPayments(db);
		await savePayments(db, 1, id, T0, new Map([['3|2026-10-15', 'missed']]));
		expect((await getOpenCheckIn(db, 1))!.expectedMinor).toBe(335000);
		// It is now a line to answer, chosen "missed", and no longer an early line.
		await finishCheckIn(db, 1, id, T0);
		expect((await listOutstanding(db, 1, await listItems(db, 1))).map((o) => o.name)).toEqual([
			'Phone'
		]);
	});

	it('the missed answer shows as an ordinary line when the step is opened again', async () => {
		const db = await household();
		await markPaid(db, 3, '2026-10-15', '2026-10-10T09:00:00Z');
		const { id } = await toPayments(db);
		await savePayments(db, 1, id, T0, new Map([['3|2026-10-15', 'missed']]));
		await goBack(db, 1, id);
		const view = await paymentsView(db);
		expect(view.early).toEqual([]);
		expect(view.lines).toMatchObject([{ key: '3|2026-10-15', chosen: 'missed' }]);
	});
});

describe('TSK-C00C8A the expected balance counts an early payment once', () => {
	it('is the plain figure with no marks', async () => {
		const db = await household();
		expect((await toPayments(db)).expected).toBe(330500);
	});

	it('subtracts an early payment made inside the window, though it is due later', async () => {
		const db = await household();
		await markPaid(db, 2, '2026-11-01', '2026-10-10T09:00:00Z');
		const { id, expected } = await toPayments(db);
		expect(expected).toBe(210500);
		// It is not a line of this update (due Nov 1), so nothing is asked, and it stays off.
		expect((await paymentsView(db)).early).toEqual([]);
		await savePayments(db, 1, id, T0, new Map([['3|2026-10-15', 'paid']]));
		expect((await getOpenCheckIn(db, 1))!.expectedMinor).toBe(210500);
	});

	it('does not subtract a payment the previous balance already held (paid before its day)', async () => {
		const db = await household();
		await markPaid(db, 3, '2026-10-15', '2026-10-01T09:00:00Z');
		await markPaid(db, 2, '2026-11-01', '2026-10-01T09:00:00Z');
		const { expected } = await toPayments(db);
		expect(expected).toBe(335000);
		const view = await paymentsView(db);
		expect(view.lines).toEqual([]);
		expect(view.early).toHaveLength(1);
	});

	it('a mark on the balance day counts only when made after the balance was read', async () => {
		const before = await household();
		await markPaid(before, 3, '2026-10-15', '2026-10-02T08:00:00Z');
		expect((await toPayments(before)).expected).toBe(335000);
		const after = await household();
		await markPaid(after, 3, '2026-10-15', '2026-10-02T15:00:00Z');
		expect((await toPayments(after)).expected).toBe(330500);
	});
});
