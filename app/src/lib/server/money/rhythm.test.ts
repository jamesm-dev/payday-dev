import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCalDate as d, type CalDate } from '#lib/domain/dates.ts';
import { minor, sum } from '#lib/domain/money.ts';
import { paydays } from '#lib/domain/periods.ts';
import { planPaychecks } from '#lib/domain/plan.ts';
import type { Item, Rule } from '#lib/domain/schedule.ts';
import { dateText } from '#lib/format.ts';
import { openDatabase, type Db, type Opened } from '#lib/server/db/open.ts';
import { checkIn, owner } from '#lib/server/db/schema.ts';
import { emptyAllTables, freshDb } from '#lib/server/db/testing.ts';
import { changeRhythm, saveSetupPay, sameRhythm, setPayEnd, type PayRule } from './rhythm.ts';
import { addItem, getItem, listItems, listOverrides, setOverride } from './store.ts';

const TODAY = d('2026-11-02');

async function fresh() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	return db;
}

async function addPay(db: Db, rule: Rule, startsOn = '2026-01-01', main = true) {
	return addItem(
		db,
		1,
		{ kind: 'income', name: 'Pay', amount: minor(100000), rule, startsOn: d(startsOn) },
		{ main }
	);
}

/** The paydays from Nov 1 2026 to Jan 31 2027, as the engine reads the saved items. */
async function paydaysAfter(db: Db, to = '2027-01-31'): Promise<CalDate[]> {
	const items = await listItems(db, 1);
	return paydays(items, await listOverrides(db, 1, items), d('2026-11-01'), d(to));
}

const EVERY14: Rule = { kind: 'every14', anchor: d('2026-01-09') };
const TWICE: PayRule = { kind: 'twiceMonthly', day: 15, day2: 31 };

describe('TSK-C8DA31 the next payday stays on the old rhythm, the new one starts after it', () => {
	/*
	 * Every 14 days from Fri 2026-01-09: day 9 + 14 * 21 = day 303 = Oct 30, then Nov 13, Nov 27.
	 * Today Mon Nov 2, so the next payday is Nov 13. The old pay ends on it; the twice-a-month pay
	 * (15th and last day) starts Nov 14: Nov 15, Nov 30, Dec 15, Dec 31, Jan 15, Jan 31.
	 */
	it('every 14 days to twice a month', async () => {
		const db = await fresh();
		await addPay(db, EVERY14);
		const result = await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		expect(result).toEqual({
			ok: true,
			lastOldPayday: '2026-11-13',
			firstNewPayday: '2026-11-15',
			replacedWaiting: false
		});
		const [old, next] = await listItems(db, 1);
		expect(old.endsOn).toBe('2026-11-13');
		expect(old.main).toBe(true);
		expect(next).toMatchObject({
			kind: 'income',
			name: 'Pay',
			amount: 100000,
			main: true,
			startsOn: '2026-11-14',
			rule: TWICE
		});
		expect(next.endsOn).toBeUndefined();
		expect(await paydaysAfter(db)).toEqual([
			'2026-11-13',
			'2026-11-15',
			'2026-11-30',
			'2026-12-15',
			'2026-12-31',
			'2027-01-15',
			'2027-01-31'
		]);
	});

	/* Twice a month: today Nov 2, the next payday is Nov 15. Monthly on the 25th from Nov 16. */
	it('twice a month to monthly', async () => {
		const db = await fresh();
		await addPay(db, TWICE);
		const result = await changeRhythm(db, 1, { kind: 'monthly', day: 25 }, 'UTC', TODAY);
		expect(result).toMatchObject({
			ok: true,
			lastOldPayday: '2026-11-15',
			firstNewPayday: '2026-11-25'
		});
		expect(await paydaysAfter(db)).toEqual([
			'2026-11-15',
			'2026-11-25',
			'2026-12-25',
			'2027-01-25'
		]);
	});

	/*
	 * Monthly on the 31st: the next payday is Nov 30. Every 14 days in the phase of Fri Nov 20 starts
	 * Dec 1: Dec 4, Dec 18, Jan 1, Jan 15, Jan 29.
	 */
	it('monthly to every 14 days', async () => {
		const db = await fresh();
		await addPay(db, { kind: 'monthly', day: 31 });
		const result = await changeRhythm(
			db,
			1,
			{ kind: 'every14', anchor: d('2026-11-20') },
			'UTC',
			TODAY
		);
		expect(result).toMatchObject({
			ok: true,
			lastOldPayday: '2026-11-30',
			firstNewPayday: '2026-12-04'
		});
		const [old, next] = await listItems(db, 1);
		expect([old.endsOn, next.startsOn]).toEqual(['2026-11-30', '2026-12-01']);
		expect(await paydaysAfter(db)).toEqual([
			'2026-11-30',
			'2026-12-04',
			'2026-12-18',
			'2027-01-01',
			'2027-01-15',
			'2027-01-29'
		]);
	});

	it('other days on the same kind of rhythm are a change (15th and last, to the 1st and 15th)', async () => {
		const db = await fresh();
		await addPay(db, TWICE);
		const result = await changeRhythm(
			db,
			1,
			{ kind: 'twiceMonthly', day: 1, day2: 15 },
			'UTC',
			TODAY
		);
		expect(result).toMatchObject({
			ok: true,
			lastOldPayday: '2026-11-15',
			firstNewPayday: '2026-12-01'
		});
		expect(await paydaysAfter(db, '2026-12-31')).toEqual([
			'2026-11-15',
			'2026-12-01',
			'2026-12-15'
		]);
	});

	it('on a payday itself, that payday is behind: the next one stays old', async () => {
		const db = await fresh();
		await addPay(db, TWICE);
		const result = await changeRhythm(db, 1, { kind: 'monthly', day: 25 }, 'UTC', d('2026-11-15'));
		expect(result).toMatchObject({
			ok: true,
			lastOldPayday: '2026-11-30',
			firstNewPayday: '2026-12-25'
		});
	});

	it('an income only marked as the pay by the old default becomes the main pay', async () => {
		const db = await fresh();
		await addPay(db, EVERY14, '2026-01-01', false);
		expect((await listItems(db, 1))[0].main).toBeUndefined();
		await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		const [old, next] = await listItems(db, 1);
		expect([old.main, next.main]).toEqual([true, true]);
		expect((await paydaysAfter(db, '2026-12-01')).slice(0, 3)).toEqual([
			'2026-11-13',
			'2026-11-15',
			'2026-11-30'
		]);
	});
});

describe('TSK-C8DA31 refusals', () => {
	it('the same rhythm again is refused in plain words and nothing is saved', async () => {
		const db = await fresh();
		await addPay(db, EVERY14);
		// 28 days on is the same day of the 14-day cycle: the same paydays.
		const same = await changeRhythm(
			db,
			1,
			{ kind: 'every14', anchor: d('2026-12-11') },
			'UTC',
			TODAY
		);
		expect(same).toEqual({
			ok: false,
			problem: 'This is already how often you are paid. Nothing was changed.'
		});
		expect(await listItems(db, 1)).toHaveLength(1);
		expect((await listItems(db, 1))[0].endsOn).toBeUndefined();

		const db2 = await fresh();
		await addPay(db2, TWICE);
		expect((await changeRhythm(db2, 1, { ...TWICE }, 'UTC', TODAY)).ok).toBe(false);
		expect(await listItems(db2, 1)).toHaveLength(1);
	});

	it('with no pay there is nothing to change', async () => {
		const db = await fresh();
		const result = await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		expect(result.ok).toBe(false);
		expect(await listItems(db, 1)).toHaveLength(0);
	});

	it('a moved payday that would break the promise stops the whole change', async () => {
		const db = await fresh();
		const pay = await addPay(db, EVERY14);
		// Nov 13 is moved to Nov 12 (earlier than its date): ending the pay on Nov 12 would drop it.
		await setOverride(db, 1, Number(pay.id), {
			originalDate: d('2026-11-13'),
			action: 'change',
			date: d('2026-11-12')
		});
		const result = await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		expect(result.ok).toBe(false);
		const items = await listItems(db, 1);
		expect(items).toHaveLength(1);
		expect(items[0].endsOn).toBeUndefined();
	});

	it('a change waiting for its payday is replaced by a second one, never doubled', async () => {
		const db = await fresh();
		await addPay(db, EVERY14);
		await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		expect(await changeRhythm(db, 1, TWICE, 'UTC', TODAY)).toMatchObject({ ok: false });
		const second = await changeRhythm(db, 1, { kind: 'monthly', day: 25 }, 'UTC', TODAY);
		expect(second).toMatchObject({
			ok: true,
			lastOldPayday: '2026-11-13',
			firstNewPayday: '2026-11-25',
			replacedWaiting: true
		});
		const items = await listItems(db, 1);
		expect(items).toHaveLength(2);
		expect(items[1].rule).toEqual({ kind: 'monthly', day: 25 });
		expect(items[1].startsOn).toBe('2026-11-14');
	});
});

describe('TSK-C8DA31 a payday update under way is left alone', () => {
	it('the check-in row is not touched by a change', async () => {
		const db = await fresh();
		await addPay(db, EVERY14);
		await db.insert(checkIn).values({
			ownerId: 1,
			startedAt: '2026-11-02T09:00:00.000Z',
			asOf: '2026-11-02',
			currentStep: 'balance'
		});
		const before = await db.select().from(checkIn);
		await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		expect(await db.select().from(checkIn)).toEqual(before);
	});
});

describe('TSK-C8DA31 a set-aside still completes by its due date across a switch', () => {
	/*
	 * Yearly 100000 due Dec 20, cycle Jan 1 to Dec 19. Paydays in it: every 14 days Jan 9 ... Nov 13
	 * (9 + 14 * 22 = day 317 = Nov 13: 23 of them), then Nov 15, Nov 30, Dec 15 = 26.
	 *   100000 / 26 = 3846 remainder 4 (26 * 3846 = 99996): the first 4 shares are 3847.
	 * Dec 15's paycheck holds the bill in full, so 25 shares are listed:
	 *   4 * 3847 + 21 * 3846 = 15388 + 80766 = 96154, and 96154 + the 26th (3846) = 100000.
	 */
	it('the shares add up to the bill', async () => {
		const db = await fresh();
		await addPay(db, EVERY14);
		const insurance: Omit<Item, 'id'> = {
			kind: 'bill',
			name: 'Insurance',
			amount: minor(100000),
			rule: { kind: 'yearly', anchor: d('2026-12-20') },
			startsOn: d('2026-01-01')
		};
		await addItem(db, 1, insurance);
		await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		const items = await listItems(db, 1);
		const plan = planPaychecks(items, [], d('2026-01-09'), 26);
		expect(plan.at(-1)!.payday).toBe('2026-12-15');
		const shares = plan.flatMap((p) => p.setAsides.map((s) => s.share));
		expect(shares).toHaveLength(25);
		expect(sum(shares)).toBe(4 * 3847 + 21 * 3846);
		expect(sum(shares) + 3846).toBe(100000);
		for (let i = 1; i < plan.length; i++) expect(plan[i].payday).toBe(plan[i - 1].ends);
	});
});

describe('TSK-C8DA31 sameRhythm', () => {
	it('compares what the paydays are, not how the rule was typed', () => {
		expect(sameRhythm(EVERY14, { kind: 'every14', anchor: d('2026-01-23') })).toBe(true);
		expect(sameRhythm(EVERY14, { kind: 'every14', anchor: d('2026-01-16') })).toBe(false);
		expect(sameRhythm({ kind: 'monthly', day: 1 }, { kind: 'monthly', day: 2 })).toBe(false);
		expect(sameRhythm({ kind: 'monthly', day: 1 }, TWICE)).toBe(false);
	});
});

describe('TSK-C8DA31 the change runs under the owner lock', () => {
	/* As db/lockOrder.test.ts: the lock statement comes before the first write. */
	let opened: Opened;
	const queries: string[] = [];
	beforeAll(async () => {
		opened = await openDatabase('memory://', {
			logger: { logQuery: (query) => void queries.push(query) }
		});
	}, 120_000);
	afterAll(() => opened.close());

	it('takes "for update" on the owner before any insert or update', async () => {
		const db = opened.db;
		await emptyAllTables(db);
		await db.insert(owner).values({ id: 1 });
		await addPay(db, EVERY14);
		queries.length = 0;
		const result = await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		expect(result.ok).toBe(true);
		const seen = [...queries];
		const lock = seen.findIndex((q) => /from "payday"\."owner".*for update/i.test(q));
		const write = seen.findIndex((q) => /^(insert|update|delete)\b/i.test(q));
		expect(lock, seen.join('\n')).toBeGreaterThanOrEqual(0);
		expect(write).toBeGreaterThan(lock);
		// The old pay ends before the new one is inserted.
		const ends = seen.findIndex((q) => /^update "payday"\."schedule_item"/i.test(q));
		const insert = seen.findIndex((q) => /^insert into "payday"\."schedule_item"/i.test(q));
		expect(ends).toBeGreaterThan(lock);
		expect(insert).toBeGreaterThan(ends);
	});
});

describe('TSK-C8DA31 a pay that starts ahead is the current pay unless a change is waiting', () => {
	/*
	 * Setup on Nov 15 with the next payday Nov 20: every 14 days, anchor and start Nov 20. No other
	 * main pay ends Nov 19, so it is the current pay. The next payday Nov 20 stays old; twice a month
	 * (15th and last day) starts Nov 21: Nov 30, Dec 15, Dec 31.
	 */
	it('changing the rhythm works with a payday still ahead', async () => {
		const db = await fresh();
		await addPay(db, { kind: 'every14', anchor: d('2026-11-20') }, '2026-11-20');
		const result = await changeRhythm(db, 1, TWICE, 'UTC', d('2026-11-15'));
		expect(result).toEqual({
			ok: true,
			lastOldPayday: '2026-11-20',
			firstNewPayday: '2026-11-30',
			replacedWaiting: false
		});
		const [old, next] = await listItems(db, 1);
		expect([old.endsOn, next.startsOn]).toEqual(['2026-11-20', '2026-11-21']);
		expect(await paydaysAfter(db, '2026-12-31')).toEqual([
			'2026-11-20',
			'2026-11-30',
			'2026-12-15',
			'2026-12-31'
		]);
	});
});

describe('TSK-C8DA31 changing on the last old payday itself', () => {
	/* A change made Nov 2 is waiting (old pay ends Nov 13). On Nov 13 another rhythm still works. */
	it('a change waiting for today, Nov 13, can be replaced', async () => {
		const db = await fresh();
		await addPay(db, EVERY14);
		await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		const result = await changeRhythm(db, 1, { kind: 'monthly', day: 25 }, 'UTC', d('2026-11-13'));
		expect(result).toEqual({
			ok: true,
			lastOldPayday: '2026-11-13',
			firstNewPayday: '2026-11-25',
			replacedWaiting: true
		});
	});
});

describe('TSK-C8DA31 End and Resume know the main pay changes', () => {
	/* Old pay ended Nov 13, new one (twice a month) starts Nov 14. */
	async function switched() {
		const db = await fresh();
		await addPay(db, EVERY14);
		await changeRhythm(db, 1, TWICE, 'UTC', TODAY);
		const [old, next] = await listItems(db, 1);
		return { db, old: Number(old.id), next: Number(next.id) };
	}

	it('the old pay cannot be resumed while the new one runs', async () => {
		const { db, old } = await switched();
		expect(await setPayEnd(db, 1, old, null)).toEqual({
			ok: false,
			problem: `Your pay changes from ${dateText(d('2026-11-14'))}. Change how often you are paid in Settings.`
		});
		expect((await getItem(db, 1, old))!.endsOn).toBe('2026-11-13');
	});

	it('the old pay cannot end on or after the day the new one starts', async () => {
		const { db, old } = await switched();
		expect((await setPayEnd(db, 1, old, d('2026-11-14'))).ok).toBe(false);
		expect((await setPayEnd(db, 1, old, d('2026-12-01'))).ok).toBe(false);
		expect((await getItem(db, 1, old))!.endsOn).toBe('2026-11-13');
		expect((await setPayEnd(db, 1, old, d('2026-11-12'))).ok).toBe(true);
		expect((await getItem(db, 1, old))!.endsOn).toBe('2026-11-12');
	});

	it('the new pay can end and come back; the old one stays ended even then', async () => {
		const { db, old, next } = await switched();
		expect((await setPayEnd(db, 1, next, d('2026-12-31'))).ok).toBe(true);
		expect((await setPayEnd(db, 1, old, null)).ok).toBe(false);
		expect((await setPayEnd(db, 1, next, null)).ok).toBe(true);
	});

	it('a bill ends and resumes freely', async () => {
		const { db } = await switched();
		const bill = await addItem(db, 1, {
			kind: 'bill',
			name: 'Rent',
			amount: minor(5000),
			rule: { kind: 'monthly', day: 1 },
			startsOn: d('2026-01-01')
		});
		expect((await setPayEnd(db, 1, Number(bill.id), d('2026-12-01'))).ok).toBe(true);
		expect((await setPayEnd(db, 1, Number(bill.id), null)).ok).toBe(true);
	});
});

describe('TSK-79352E setup edits a pay saved before the main mark existed', () => {
	const pay = (rule: Rule): Omit<Item, 'id'> => ({
		kind: 'income',
		name: 'Pay',
		amount: minor(100000),
		rule,
		startsOn: d('2026-11-01')
	});

	it('becomes the main pay, so twice a month gives paydays', async () => {
		const db = await fresh();
		await addPay(db, EVERY14, '2026-01-01', false);
		await saveSetupPay(db, 1, pay(TWICE));
		const items = await listItems(db, 1);
		expect(items).toHaveLength(1);
		expect(items[0].main).toBe(true);
		expect((await paydaysAfter(db, '2026-12-31')).slice(0, 3)).toEqual([
			'2026-11-15',
			'2026-11-30',
			'2026-12-15'
		]);
	});

	it('a first save adds the main pay; saving again edits it', async () => {
		const db = await fresh();
		await saveSetupPay(db, 1, pay(TWICE));
		await saveSetupPay(db, 1, pay({ kind: 'monthly', day: 25 }));
		const items = await listItems(db, 1);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ main: true, rule: { kind: 'monthly', day: 25 } });
	});
});
