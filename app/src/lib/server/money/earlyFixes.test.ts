/*
 * Review fixes for early payments, seen through the server, on the fixture household (ids: pay 1,
 * rent 2, phone 3, card 4). Balance 1,500.00 as of Fri 2026-10-02 read at noon; the update is on
 * Fri 2026-10-16 (UTC) at noon.
 *  - A skip is refused while the occurrence has a standing early mark (rent, due Nov 1).
 *  - Rent paid on Oct 16 at 13:00, after the update's balance was read at noon, is not taken off this
 *    update's expected balance: 1,500.00 + 1,850.00 - 45.00 (phone) = 3,305.00. Paid at 11:00 it is:
 *    3,305.00 - 1,200.00 = 2,105.00.
 *  - A payment paid early is never also recorded as a payment confirmation.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, paymentConfirmation } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	getOpenCheckIn,
	saveBalanceStep,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { computeSafe } from './home.ts';
import { seedHousehold } from './seed.ts';
import { SKIP_REFUSED_EARLY, setBalance, setOverride, setPaidMark } from './store.ts';

const T0 = new Date('2026-10-16T12:00:00Z');
const RENT = 2;
const PHONE = 3;

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'), new Date('2026-10-02T12:00:00Z'));
	return db;
}

describe('TSK-7642D5 a skip is refused while the occurrence is marked paid early', () => {
	it('refuses with plain words, and the number keeps counting the payment as paid', async () => {
		const db = await household();
		await setPaidMark(db, 1, RENT, d('2026-11-01'), true, new Date('2026-10-16T09:00:00Z'));
		const result = await setOverride(db, 1, RENT, {
			action: 'skip',
			originalDate: d('2026-11-01')
		});
		expect(result).toEqual({ ok: false, message: SKIP_REFUSED_EARLY });
		expect(SKIP_REFUSED_EARLY).toBe(
			'This one is marked paid early. Take off Paid early on the plan first.'
		);
		const c = await computeSafe(db, 1, T0);
		if (c.state !== 'ready') throw new Error(c.state);
		expect(c.result.paidEarly.map((e) => e.occurrence.itemId)).toEqual(['2']);
	});

	it('allows it once the mark is taken off, and allows a change meanwhile', async () => {
		const db = await household();
		await setPaidMark(db, 1, RENT, d('2026-11-01'), true, new Date('2026-10-16T09:00:00Z'));
		const moved = await setOverride(db, 1, RENT, {
			action: 'change',
			originalDate: d('2026-11-01'),
			date: d('2026-11-03')
		});
		expect(moved).toEqual({ ok: true });
		await setPaidMark(db, 1, RENT, d('2026-11-01'), false, new Date('2026-10-16T10:00:00Z'));
		expect(
			await setOverride(db, 1, RENT, { action: 'skip', originalDate: d('2026-11-01') })
		).toEqual({ ok: true });
	});

	it('a mark made on or after the due date is a label and does not block a skip', async () => {
		const db = await household();
		// Phone was due Oct 15: marked on the 16th, after its day.
		await setPaidMark(db, 1, PHONE, d('2026-10-15'), true, new Date('2026-10-16T09:00:00Z'));
		expect(
			await setOverride(db, 1, PHONE, { action: 'skip', originalDate: d('2026-10-15') })
		).toEqual({ ok: true });
	});
});

describe('TSK-C00C8A an early payment made after the update read its balance', () => {
	async function expectedWith(markedAt: string) {
		const db = await household();
		await setPaidMark(db, 1, RENT, d('2026-11-01'), true, new Date(markedAt));
		const row = await startCheckIn(db, 1, T0);
		await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, row.id, T0, minor(300000));
		return { db, id: row.id, expected: (await getOpenCheckIn(db, 1))!.expectedMinor };
	}

	it('paid at 13:00, after the noon read: left for the next update, 3,305.00', async () => {
		expect((await expectedWith('2026-10-16T13:00:00Z')).expected).toBe(330500);
	});

	it('paid at 11:00, before the noon read: taken off, 2,105.00', async () => {
		expect((await expectedWith('2026-10-16T11:00:00Z')).expected).toBe(210500);
	});

	it('a bill paid early inside the window is never recorded as a payment confirmation', async () => {
		const db = await household();
		// Phone (due Oct 15, in the window) paid Oct 10; the update asks nothing about it.
		await setPaidMark(db, 1, PHONE, d('2026-10-15'), true, new Date('2026-10-10T09:00:00Z'));
		const row = await startCheckIn(db, 1, T0);
		await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, row.id, T0, minor(300000));
		await acknowledgeSpending(db, 1, row.id);
		await savePayments(db, 1, row.id, T0, new Map());
		const rows = await db
			.select()
			.from(paymentConfirmation)
			.where(eq(paymentConfirmation.checkInId, row.id));
		expect(rows).toEqual([]);
		// The money still comes off once: 1,500.00 + 1,850.00 - 45.00 = 3,305.00.
		expect((await getOpenCheckIn(db, 1))!.expectedMinor).toBe(330500);
	});
});
