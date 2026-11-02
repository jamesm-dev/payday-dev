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
import { open } from '#lib/server/db/open.ts';
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

function household() {
	const db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
	seedHousehold(db, { production: false, now: T0, loans: false });
	setBalance(db, 1, minor(150000), d('2026-10-02'));
	return db;
}

const CARD = 4;
const PHONE = 3;

describe('TSK-AFD0D0 a bill can be given a group and marked optional', () => {
	it('leaves an item saved before groups existed ungrouped and required', () => {
		const db = household();
		db.run(
			sql`INSERT INTO schedule_item (account_id, kind, name, amount_minor, rule_kind, rule_day, starts_on)
				VALUES (1, 'bill', 'Old bill', 100, 'monthly', 3, '2026-01-01')`
		);
		const old = listItems(db, 1).find((i) => i.name === 'Old bill')!;
		expect(old.group).toBeUndefined();
		expect(old.optional).toBeUndefined();
		expect(listItems(db, 1).every((i) => i.group === undefined && !i.optional)).toBe(true);
	});

	it('saves a group and an optional mark, and editing the bill keeps them', () => {
		const db = household();
		expect(setItemLabels(db, 1, CARD, { group: 'Cards', optional: true })).toBe(true);
		expect(getItem(db, 1, CARD)).toMatchObject({ group: 'Cards', optional: true });

		const card = getItem(db, 1, CARD)!;
		updateItem(db, 1, CARD, { ...card, amount: minor(7000) });
		expect(getItem(db, 1, CARD)).toMatchObject({ amount: 7000, group: 'Cards', optional: true });

		setItemLabels(db, 1, CARD, { group: null, optional: false });
		const cleared = getItem(db, 1, CARD)!;
		expect(cleared.group).toBeUndefined();
		expect(cleared.optional).toBeUndefined();
	});

	it("refuses to label another owner's bill", () => {
		const db = household();
		db.insert(owner).values({ id: 2 }).run();
		expect(setItemLabels(db, 2, CARD, { group: 'Mine', optional: true })).toBe(false);
		expect(getItem(db, 1, CARD)?.group).toBeUndefined();
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

	it('suggests each group in use once, spelled as on the bill added first', () => {
		const db = household();
		setItemLabels(db, 1, PHONE, { group: 'GCash', optional: false });
		setItemLabels(db, 1, CARD, { group: 'gcash', optional: false });
		setItemLabels(db, 1, 2, { group: 'House', optional: false });
		expect(listGroups(listItems(db, 1))).toEqual(['GCash', 'House']);
	});
});

describe('TSK-645A0D a bill on the plan can be marked paid and unmarked', () => {
	const cardLine = (db: ReturnType<typeof household>) => {
		const plan = buildPlan(db, 1, T0);
		if (plan.state !== 'ready') throw new Error('no plan');
		return plan.paychecks[0].covers.find((c) => c.itemId === String(CARD))!;
	};

	it('shows the mark on the plan, and takes it off again', () => {
		const db = household();
		expect(cardLine(db)).toMatchObject({ originalDate: '2026-10-28', paid: false });
		expect(setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0)).toBe(true);
		expect(cardLine(db).paid).toBe(true);
		// Marking twice is still one mark.
		setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);
		setPaidMark(db, 1, CARD, d('2026-10-28'), false, T0);
		expect(cardLine(db).paid).toBe(false);
	});

	it('shows the group and optional mark beside each bill', () => {
		const db = household();
		setItemLabels(db, 1, CARD, { group: 'Cards', optional: true });
		expect(cardLine(db)).toMatchObject({ group: 'Cards', optional: true });
	});

	it("refuses pay, and another owner's bill", () => {
		const db = household();
		db.insert(owner).values({ id: 2 }).run();
		expect(setPaidMark(db, 1, 1, d('2026-10-16'), true, T0)).toBe(false);
		expect(setPaidMark(db, 2, CARD, d('2026-10-28'), true, T0)).toBe(false);
		expect(paidOccurrences(db, 1, listItems(db, 1)).size).toBe(0);
	});

	it('accepts only a date the bill really falls on, and a plain yes or no', () => {
		const db = household();
		const card = getItem(db, 1, CARD)!;
		const pay = getItem(db, 1, 1)!;
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
	function atPayments(db: ReturnType<typeof household>) {
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, T0, minor(300000));
		acknowledgeSpending(db, 1, row.id);
		return row;
	}
	const phoneChoice = (db: ReturnType<typeof household>) => {
		const view = presentCheckIn(db, 1, T0);
		if (view?.step !== 'payments') throw new Error(`at ${view?.step}`);
		return view.lines.find((l) => l.key === `${PHONE}|2026-10-15`)!.chosen;
	};

	it('ticks a bill marked paid on the plan, and leaves the others to answer', () => {
		const db = household();
		setPaidMark(db, 1, PHONE, d('2026-10-15'), true, BEFORE);
		atPayments(db);
		expect(phoneChoice(db)).toBe('paid');
	});

	it('asks as before when nothing was marked', () => {
		const db = household();
		atPayments(db);
		expect(phoneChoice(db)).toBe('');
	});

	it("lets the check-in's answer outrank an earlier mark, and a later mark outrank it", () => {
		const db = household();
		const key = `${PHONE}|2026-10-15`;
		setPaidMark(db, 1, PHONE, d('2026-10-15'), true, BEFORE);
		const row = atPayments(db);
		savePayments(db, 1, row.id, T0, new Map([[key, 'missed']]));
		finishCheckIn(db, 1, row.id, T0_END);
		expect(paidOccurrences(db, 1, listItems(db, 1)).has(key)).toBe(false);

		setPaidMark(db, 1, PHONE, d('2026-10-15'), true, AFTER);
		expect(paidOccurrences(db, 1, listItems(db, 1)).has(key)).toBe(true);
	});

	it('counts a bill confirmed paid at a check-in as paid with no mark at all', () => {
		const db = household();
		const key = `${PHONE}|2026-10-15`;
		const row = atPayments(db);
		savePayments(db, 1, row.id, T0, new Map([[key, 'paid']]));
		finishCheckIn(db, 1, row.id, T0_END);
		expect(paidOccurrences(db, 1, listItems(db, 1)).has(key)).toBe(true);
	});
});

describe('TSK-4A3A52 marks never move the safe-to-spend number', () => {
	it('gives the same number before and after every bill is marked optional and paid', () => {
		const db = household();
		const before = computeSafe(db, 1, T0);
		if (before.state !== 'ready') throw new Error(before.state);

		for (const item of listItems(db, 1)) {
			if (item.kind === 'income') continue;
			setItemLabels(db, 1, Number(item.id), { group: 'All', optional: true });
		}
		setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);
		setPaidMark(db, 1, PHONE, d('2026-10-15'), true, T0);

		const after = computeSafe(db, 1, T0);
		if (after.state !== 'ready') throw new Error(after.state);
		expect(after.result).toEqual(before.result);
		expect(after.outstanding).toEqual(before.outstanding);
	});
});

describe('TSK-EB7093 a paycheck of the plan, as the list', () => {
	it('lays out the Oct 16 paycheck with its groups, marks and set-asides', () => {
		const db = household();
		setItemLabels(db, 1, CARD, { group: 'Cards', optional: false });
		setItemLabels(db, 1, 6, { group: null, optional: true });
		setPaidMark(db, 1, CARD, d('2026-10-28'), true, T0);

		expect(buildPaycheckList(db, 1, T0, d('2026-10-16'))?.lines).toEqual([
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

	it('has no list for a payday that is not one of the next six', () => {
		const db = household();
		expect(buildPaycheckList(db, 1, T0, d('2026-10-17'))).toBeNull();
		expect(buildPaycheckList(db, 1, T0, d('2026-10-02'))).toBeNull();
		expect(buildPaycheckList(db, 1, T0, d('2027-06-04'))).toBeNull();
	});
});
