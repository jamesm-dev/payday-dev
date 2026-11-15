/*
 * TSK-342C1F "Paid early" from the home screen's list of what is kept aside. Fixture household (ids:
 * pay 1, rent 2, phone 3, card 4), balance 150000 as of Oct 2, now Fri 2026-10-16 (a payday; the
 * next is Oct 30). The card minimum (Oct 28, 6000) is due before it; rent (Nov 1) is after it;
 * the phone bill (Oct 15) is already past.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { acknowledgeSpending, saveBalanceStep, savePay, startCheckIn } from './checkin.ts';
import { presentCheckIn } from './checkinView.ts';
import { buildHome, computeSafe } from './home.ts';
import { markPaidEarlyFromHome, NOT_BEFORE_PAYDAY } from './homeMark.ts';
import { seedHousehold } from './seed.ts';
import { setBalance } from './store.ts';

const T0 = new Date('2026-10-16T12:00:00Z');

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'), new Date('2026-10-02T09:00:00Z'));
	return db;
}

const mark = (itemId: number, originalDate: string, paid: 'yes' | 'no') => ({
	itemId: String(itemId),
	originalDate,
	paid
});

const home = async (db: Awaited<ReturnType<typeof household>>) => {
	const h = await buildHome(db, 1, T0);
	if (h.state !== 'ready') throw new Error(h.state);
	return h;
};

describe('TSK-342C1F a bill due before the next payday is paid early from the home screen', () => {
	it('offers it on the kept-aside list, leaves the number, and shows it paid early', async () => {
		const db = await household();
		const before = await home(db);
		const card = before.reserved.find((r) => r.itemId === '4')!;
		expect(card).toMatchObject({ canMarkEarly: true, originalDate: '2026-10-28' });

		expect(await markPaidEarlyFromHome(db, 1, mark(4, '2026-10-28', 'yes'), T0)).toEqual({
			ok: true,
			paid: true
		});
		const after = await home(db);
		expect(after.amount).toBe(before.amount);
		expect(after.reserved.map((r) => r.itemId)).not.toContain('4');
		expect(after.paidEarlyLines).toEqual([
			expect.objectContaining({ itemId: '4', amount: '$60.00', paidOn: 'Fri, Oct 16 2026' })
		]);
	});

	it('takes the mark off and restores the list', async () => {
		const db = await household();
		const before = await home(db);
		await markPaidEarlyFromHome(db, 1, mark(4, '2026-10-28', 'yes'), T0);
		expect(await markPaidEarlyFromHome(db, 1, mark(4, '2026-10-28', 'no'), T0)).toEqual({
			ok: true,
			paid: false
		});
		expect(await home(db)).toEqual(before);
	});

	it('refuses a payment due after the next payday, or already past, and marks nothing', async () => {
		const db = await household();
		const before = await computeSafe(db, 1, T0);
		for (const [id, date] of [
			[2, '2026-11-01'],
			[3, '2026-10-15']
		] as const) {
			expect(await markPaidEarlyFromHome(db, 1, mark(id, date, 'yes'), T0)).toEqual({
				ok: false,
				status: 400,
				problem: NOT_BEFORE_PAYDAY
			});
		}
		expect(await computeSafe(db, 1, T0)).toEqual(before);
	});

	it('refuses pay, a date the rule does not make, and a bad answer', async () => {
		const db = await household();
		for (const form of [
			mark(1, '2026-10-30', 'yes'),
			mark(4, '2026-10-29', 'yes'),
			mark(4, '2026-10-28', 'yes' as 'no')
		]) {
			const bad = form.originalDate === '2026-10-28' ? { ...form, paid: 'maybe' } : form;
			const r = await markPaidEarlyFromHome(db, 1, bad, T0);
			expect(r).toMatchObject({ ok: false, status: 400 });
		}
	});

	it("refuses another owner's bill as not found", async () => {
		const db = await household();
		await db.insert(owner).values({ id: 2 });
		expect(await markPaidEarlyFromHome(db, 2, mark(4, '2026-10-28', 'yes'), T0)).toEqual({
			ok: false,
			status: 404
		});
		expect((await home(db)).paidEarlyLines).toHaveLength(0);
		expect(await markPaidEarlyFromHome(db, 1, mark(999, '2026-10-28', 'yes'), T0)).toEqual({
			ok: false,
			status: 404
		});
	});

	it('is answered at the payday update: "Paid early on <date>", not asked again', async () => {
		const db = await household();
		await markPaidEarlyFromHome(db, 1, mark(4, '2026-10-28', 'yes'), T0);
		const payday = new Date('2026-10-30T12:00:00Z');
		const row = await startCheckIn(db, 1, payday);
		await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, row.id, payday, minor(300000));
		await acknowledgeSpending(db, 1, row.id);
		const view = await presentCheckIn(db, 1, payday);
		if (view?.step !== 'payments') throw new Error(`at ${view?.step}`);
		expect(view.early).toEqual([
			expect.objectContaining({ key: '4|2026-10-28', paidOn: 'Fri, Oct 16 2026' })
		]);
		expect(view.lines.map((l) => l.key)).not.toContain('4|2026-10-28');
	});

	it('stops listing a bill paid early once its day has passed', async () => {
		const db = await household();
		await markPaidEarlyFromHome(db, 1, mark(4, '2026-10-28', 'yes'), T0);
		expect((await home(db)).paidEarlyLines).toHaveLength(1);
		// Dec 1: the card (Oct 28) is long past, so it is not listed any more.
		const later = new Date('2026-12-01T12:00:00Z');
		await setBalance(db, 1, minor(150000), d('2026-12-01'), later);
		const h = await buildHome(db, 1, later);
		if (h.state !== 'ready') throw new Error(h.state);
		expect(h.paidEarlyLines).toEqual([]);
	});
});
