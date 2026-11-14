/*
 * Groups, optional marks and paid marks on the fixture household, seeded (ids: pay 1, rent 2,
 * phone 3, card 4, internet 5, water 6, insurance 7, bnpl 8), and the paycheck list built from them.
 *
 * Hand calculation for the payday Fri 2026-10-16, from domain/plan.test.ts: it covers the card
 * minimum Oct 28, 6000, and sets aside 1714 for water and 2077 for insurance. Pay 185000.
 */
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	finishCheckIn,
	saveBalanceStep,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { presentCheckIn } from './checkinView.ts';
import { computeSafe } from './home.ts';
import { buildPaycheckList } from './paycheckListView.ts';
import { buildPlan } from './planView.ts';
import { seedHousehold } from './seed.ts';
import {
	getItem,
	listGroups,
	listItems,
	paidOccurrences,
	setBalance,
	setItemLabels,
	setPaidMark,
	updateItem
} from './store.ts';
import { checkLabels, checkPaidMark } from './validate.ts';

const T0 = new Date('2026-10-16T12:00:00Z');
const T0_END = new Date('2026-10-16T12:04:12Z');
const BEFORE = new Date('2026-10-14T09:00:00Z');
const AFTER = new Date('2026-10-17T09:00:00Z');

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'));
	return db;
}

const CARD = 4;
const PHONE = 3;

describe('TSK-AFD0D0 a bill can be given a group and marked optional', () => {
	it('leaves an item saved before groups existed ungrouped and required', async () => {
		const db = await household();
		await db.execute(
			sql`INSERT INTO payday.schedule_item (account_id, kind, name, amount_minor, rule_kind, rule_day, starts_on)
				VALUES (1, 'bill', 'Old bill', 100, 'monthly', 3, '2026-01-01')`
		);
		const old = (await listItems(db, 1)).find((i) => i.name === 'Old bill')!;
		expect(old.group).toBeUndefined();
		expect(old.optional).toBeUndefined();
		expect((await listItems(db, 1)).every((i) => i.group === undefined && !i.optional)).toBe(true);
	});

	it('saves a group and an optional mark, and editing the bill keeps them', async () => {
		const db = await household();
		expect(await setItemLabels(db, 1, CARD, { group: 'Cards', optional: true })).toBe(true);
		expect(await getItem(db, 1, CARD)).toMatchObject({ group: 'Cards', optional: true });

		const card = (await getItem(db, 1, CARD))!;
		await updateItem(db, 1, CARD, { ...card, amount: minor(7000) });
		expect(await getItem(db, 1, CARD)).toMatchObject({
			amount: 7000,
			group: 'Cards',
			optional: true
		});

		await setItemLabels(db, 1, CARD, { group: null, optional: false });
		const cleared = (await getItem(db, 1, CARD))!;
		expect(cleared.group).toBeUndefined();
		expect(cleared.optional).toBeUndefined();
	});

	it("refuses to label another owner's bill", async () => {
		const db = await household();
		await db.insert(owner).values({ id: 2 });
		expect(await setItemLabels(db, 2, CARD, { group: 'Mine', optional: true })).toBe(false);
		expect((await getItem(db, 1, CARD))?.group).toBeUndefined();
	});

	it('reads the form: a tidy group or none, and optional only when ticked', () => {
		expect(checkLabels({ group: '  GCash   Loans ', optional: 'yes' })).toEqual({
			ok: true,
			value: { group: 'GCash Loans', optional: true }
		});
		expect(checkLabels({ group: '   ' })).toEqual({
			ok: true,
			value: { group: null, optional: false }
		});
		expect(checkLabels({ group: 'x', optional: 'on' })).toMatchObject({
			value: { optional: false }
		});
		expect(checkLabels({ group: 'x'.repeat(31) })).toMatchObject({
			ok: false,
			problems: { group: 'Keep the group under 30 letters.' }
		});
	});

	it('suggests each group in use once, spelled as on the bill added first', async () => {
		const db = await household();
		await setItemLabels(db, 1, PHONE, { group: 'GCash', optional: false });
		await setItemLabels(db, 1, CARD, { group: 'gcash', optional: false });
		await setItemLabels(db, 1, 2, { group: 'House', optional: false });
		expect(listGroups(await listItems(db, 1))).toEqual(['GCash', 'House']);
	});
});

describe('TSK-645A0D a bill on the plan can be marked paid and unmarked', () => {
	const cardLine = async (db: Awaited<ReturnType<typeof household>>) => {
		const plan = await buildPlan(db, 1, T0);
		if (plan.state !== 'ready') throw new Error('no plan');
		return plan.paychecks[0].covers.find((c) => c.itemId === String(CARD))!;
	};

	it('shows the mark on the plan, and takes it off again', async () => {
		const db = await household();
		expect(await cardLine(db)).toMatchObject({ originalDate: '2026-10-28', paid: false });
		expect(await setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0)).toBe(true);
		expect((await cardLine(db)).paid).toBe(true);
		// Marking twice is still one mark.
		await setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);
		await setPaidMark(db, 1, CARD, d('2026-10-28'), false, T0);
		expect((await cardLine(db)).paid).toBe(false);
	});

	it('shows the group and optional mark beside each bill', async () => {
		const db = await household();
		await setItemLabels(db, 1, CARD, { group: 'Cards', optional: true });
		expect(await cardLine(db)).toMatchObject({ group: 'Cards', optional: true });
	});

	it("refuses pay, and another owner's bill", async () => {
		const db = await household();
		await db.insert(owner).values({ id: 2 });
		expect(await setPaidMark(db, 1, 1, d('2026-10-16'), true, T0)).toBe(false);
		expect(await setPaidMark(db, 2, CARD, d('2026-10-28'), true, T0)).toBe(false);
		expect((await paidOccurrences(db, 1, await listItems(db, 1))).size).toBe(0);
	});

	it('accepts only a date the bill really falls on, and a plain yes or no', async () => {
		const db = await household();
		const card = (await getItem(db, 1, CARD))!;
		const pay = (await getItem(db, 1, 1))!;
		expect(checkPaidMark(card, { originalDate: '2026-10-28', paid: 'yes' })).toEqual({
			ok: true,
			value: { originalDate: '2026-10-28', paid: true }
		});
		expect(checkPaidMark(card, { originalDate: '2026-10-27', paid: 'yes' }).ok).toBe(false);
		expect(checkPaidMark(card, { originalDate: '2026-10-28', paid: 'maybe' }).ok).toBe(false);
		expect(checkPaidMark(card, { originalDate: 'soon', paid: 'yes' }).ok).toBe(false);
		expect(checkPaidMark(pay, { originalDate: '2026-10-16', paid: 'yes' }).ok).toBe(false);
	});
});

describe('TSK-3D4BAD the next check-in starts with what was marked paid', () => {
	/** A check-in at the payments step: pay landed, balance entered, spending seen. */
	async function atPayments(db: Awaited<ReturnType<typeof household>>) {
		const row = await startCheckIn(db, 1, T0);
		await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, row.id, T0, minor(300000));
		await acknowledgeSpending(db, 1, row.id);
		return row;
	}
	const phoneChoice = async (db: Awaited<ReturnType<typeof household>>) => {
		const view = await presentCheckIn(db, 1, T0);
		if (view?.step !== 'payments') throw new Error(`at ${view?.step}`);
		return view.lines.find((l) => l.key === `${PHONE}|2026-10-15`)!.chosen;
	};

	it('ticks a bill marked paid on the plan, and leaves the others to answer', async () => {
		const db = await household();
		await setPaidMark(db, 1, PHONE, d('2026-10-15'), true, BEFORE);
		await atPayments(db);
		expect(await phoneChoice(db)).toBe('paid');
	});

	it('asks as before when nothing was marked', async () => {
		const db = await household();
		await atPayments(db);
		expect(await phoneChoice(db)).toBe('');
	});

	it("lets the check-in's answer outrank an earlier mark, and a later mark outrank it", async () => {
		const db = await household();
		const key = `${PHONE}|2026-10-15`;
		await setPaidMark(db, 1, PHONE, d('2026-10-15'), true, BEFORE);
		const row = await atPayments(db);
		await savePayments(db, 1, row.id, T0, new Map([[key, 'missed']]));
		await finishCheckIn(db, 1, row.id, T0_END);
		expect((await paidOccurrences(db, 1, await listItems(db, 1))).has(key)).toBe(false);

		await setPaidMark(db, 1, PHONE, d('2026-10-15'), true, AFTER);
		expect((await paidOccurrences(db, 1, await listItems(db, 1))).has(key)).toBe(true);
	});

	it('counts a bill confirmed paid at a check-in as paid with no mark at all', async () => {
		const db = await household();
		const key = `${PHONE}|2026-10-15`;
		const row = await atPayments(db);
		await savePayments(db, 1, row.id, T0, new Map([[key, 'paid']]));
		await finishCheckIn(db, 1, row.id, T0_END);
		expect((await paidOccurrences(db, 1, await listItems(db, 1))).has(key)).toBe(true);
	});
});

describe('TSK-4A3A52 marks never move the safe-to-spend number', () => {
	it('gives the same number before and after every bill is marked optional and paid', async () => {
		const db = await household();
		const before = await computeSafe(db, 1, T0);
		if (before.state !== 'ready') throw new Error(before.state);

		for (const item of await listItems(db, 1)) {
			if (item.kind === 'income') continue;
			await setItemLabels(db, 1, Number(item.id), { group: 'All', optional: true });
		}
		await setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);
		await setPaidMark(db, 1, PHONE, d('2026-10-15'), true, T0);

		const after = await computeSafe(db, 1, T0);
		if (after.state !== 'ready') throw new Error(after.state);
		expect(after.result).toEqual(before.result);
		expect(after.outstanding).toEqual(before.outstanding);
	});
});

describe('TSK-EB7093 a paycheck of the plan, as the list', () => {
	it('lays out the Oct 16 paycheck with its groups, marks and set-asides', async () => {
		const db = await household();
		await setItemLabels(db, 1, CARD, { group: 'Cards', optional: false });
		await setItemLabels(db, 1, 6, { group: null, optional: true });
		await setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);

		expect((await buildPaycheckList(db, 1, T0, d('2026-10-16')))?.lines).toEqual([
			'1850\tPay',
			'---------------------',
			'20.77\tCar insurance (set aside)',
			'*17.14\tWater (set aside)',
			'',
			'/60\tCredit card minimum',
			'---------------------',
			// 6000 + 2077, without the water's 1714.
			'80.77\tTotal (without the *OPTIONAL)',
			// Only the unmarked insurance share.
			'20.77\tTotal (current salary week)',
			'',
			'97.91\tTotal (ALL)'
		]);
	});

	it('has no list for a payday that is not one of the next six', async () => {
		const db = await household();
		expect(await buildPaycheckList(db, 1, T0, d('2026-10-17'))).toBeNull();
		expect(await buildPaycheckList(db, 1, T0, d('2026-10-02'))).toBeNull();
		expect(await buildPaycheckList(db, 1, T0, d('2027-06-04'))).toBeNull();
	});
});
