/*
 * A bill paid early on the plan counts once (ADR-0020), seen through the server: the home number, the
 * plan's paycheck and the paycheck list. Fixture household (ids: pay 1, rent 2, phone 3, card 4),
 * balance 150000 as of Oct 2, now Fri 2026-10-16 (a payday; the next is Oct 30).
 *
 * Hand calculation. The card minimum falls on Oct 28, 6000, before the payday Oct 30: reserved in the
 * number and held by the Oct 16 paycheck. Paid early it is no longer reserved, but the balance has
 * not seen the payment, so 6000 comes off at once: the same number, never counted twice. Rent falls
 * on Nov 1, after Oct 30: not reserved, so paying it early drops the number by exactly 120000.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { computeSafe } from './home.ts';
import { buildPaycheckList } from './paycheckListView.ts';
import { buildPlan } from './planView.ts';
import { seedHousehold } from './seed.ts';
import { setBalance, setPaidMark } from './store.ts';

const T0 = new Date('2026-10-16T12:00:00Z');
const RENT = 2;
const PHONE = 3;
const CARD = 4;

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'), new Date('2026-10-02T09:00:00Z'));
	return db;
}
type Db = Awaited<ReturnType<typeof household>>;

const computed = async (db: Db, now = T0) => {
	const c = await computeSafe(db, 1, now);
	if (c.state !== 'ready') throw new Error(c.state);
	return c.result;
};

const firstPaycheck = async (db: Db) => {
	const plan = await buildPlan(db, 1, T0);
	if (plan.state !== 'ready') throw new Error('no plan');
	return plan.paychecks[0];
};

describe('TSK-4C1D5A a bill paid early comes off the number once, and goes back when unmarked', () => {
	it('stops reserving a bill due before the payday and takes its amount off instead', async () => {
		const db = await household();
		const before = await computed(db);
		expect(before.reserved.map((o) => o.itemId)).toContain(String(CARD));

		await setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);
		const after = await computed(db);
		expect(after.reserved.map((o) => o.itemId)).not.toContain(String(CARD));
		expect(after.paidEarly).toHaveLength(1);
		expect(after.paidEarlyOff).toBe(6000);
		expect(after.amount).toBe(before.amount);

		await setPaidMark(db, 1, CARD, d('2026-10-28'), false, T0);
		expect(await computed(db)).toEqual(before);
	});

	it('drops the number by the amount for a bill due after the next payday, and restores it', async () => {
		const db = await household();
		await setBalance(db, 1, minor(150000), d('2026-10-16'), new Date('2026-10-16T08:00:00Z'));
		const none = (await computed(db)).amount;
		await setPaidMark(db, 1, RENT, d('2026-11-01'), true, T0);
		expect((await computed(db)).amount).toBe(none - 120000);
		await setPaidMark(db, 1, RENT, d('2026-11-01'), false, T0);
		expect((await computed(db)).amount).toBe(none);
	});

	it('does not take it off again when the balance was saved after the mark', async () => {
		const db = await household();
		await setBalance(db, 1, minor(150000), d('2026-10-16'), new Date('2026-10-16T08:00:00Z'));
		const none = (await computed(db)).amount;
		await setPaidMark(db, 1, RENT, d('2026-11-01'), true, new Date('2026-10-16T07:00:00Z'));
		// Marked before the balance was read the same day: the balance already holds it.
		expect((await computed(db)).amount).toBe(none);
	});

	it('leaves a mark made after its due date as a label', async () => {
		const db = await household();
		const now = new Date('2026-10-29T12:00:00Z');
		const none = await computed(db, now);
		await setPaidMark(db, 1, CARD, d('2026-10-28'), true, now);
		expect(await computed(db, now)).toEqual(none);
	});
});

describe('TSK-A8FEB5 the paycheck stops holding a bill paid early, and the list still adds up', () => {
	it('keeps the line, flagged, out of the total, and restores it when unmarked', async () => {
		const db = await household();
		const held = await firstPaycheck(db);
		await setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);
		const early = await firstPaycheck(db);
		const line = early.covers.find((c) => c.itemId === String(CARD))!;
		expect(line).toMatchObject({ paidEarly: true, paid: true, paidOn: 'Fri, Oct 16 2026' });
		// The paycheck held 6000 for it: now it holds nothing and has 6000 more left over.
		expect(early.coversTotal).toBe('$0.00');
		expect(held.coversTotal).toBe('$60.00');
		await setPaidMark(db, 1, CARD, d('2026-10-28'), false, T0);
		expect(await firstPaycheck(db)).toEqual(held);
	});

	it('shows an early bill with / in its own paycheck, and the totals add up', async () => {
		const db = await household();
		const lines = async () => (await buildPaycheckList(db, 1, T0, d('2026-10-16')))!.lines;
		const before = await lines();
		await setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);
		const after = await lines();
		expect(before).toContain('60\tCredit card minimum');
		expect(after).toContain('/60\tCredit card minimum');
		// Water 17.14 + insurance 20.77 are set aside, and the card's 60: 97.91 in all, paid or not.
		expect(before).toContain('97.91\tTotal (ALL)');
		expect(after).toContain('97.91\tTotal (ALL)');
		// Paid early, the card leaves this paycheck's total: 80.77 becomes 37.91.
		expect(before).toContain('97.91\tTotal (this paycheck)');
		expect(after).toContain('37.91\tTotal (this paycheck)');
	});

	it('keeps the paycheck holding a bill marked after its day', async () => {
		const db = await household();
		const held = await firstPaycheck(db);
		await setPaidMark(db, 1, PHONE, d('2026-10-15'), true, T0);
		expect((await firstPaycheck(db)).coversTotal).toBe(held.coversTotal);
	});
});
