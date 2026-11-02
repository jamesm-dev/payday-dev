import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { safeToSpend } from '#lib/domain/safeToSpend.ts';
import { open } from '#lib/server/db/open.ts';
import { account, checkIn, owner } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	checkInContext,
	finishCheckIn,
	paymentLines,
	saveBalanceStep,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import {
	addExpense,
	countingExpenses,
	counts,
	getExpense,
	listExpenseDays,
	removeExpense,
	updateExpense
} from './expenses.ts';
import { buildHome, computeSafe } from './home.ts';
import { seedHousehold } from './seed.ts';
import { setBalance } from './store.ts';
import type { ExpenseInput } from './validate.ts';

const at = (iso: string) => new Date(iso);
// The seed saves its balance (dated 2026-10-31) at this moment.
const BALANCE_SAVED = at('2026-10-31T12:00:00Z');
const TODAY = d('2026-10-31');

const input = (amount: number, spentOn: string, note: string | null = null): ExpenseInput => ({
	amount: minor(amount),
	note,
	spentOn: d(spentOn)
});

function household() {
	const db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
	db.insert(owner).values({ id: 2 }).run();
	seedHousehold(db, { ownerId: 1, production: false, now: BALANCE_SAVED, loans: false });
	return db;
}

describe('TSK-5F4BF5 expenses are stored', () => {
	it('adds, reads, edits and removes an expense, keeping when it was logged', () => {
		const db = household();
		const added = addExpense(db, 1, input(1250, '2026-10-31', 'Lunch'), at('2026-10-31T13:00:00Z'));
		expect(getExpense(db, 1, added.id)).toEqual({
			id: added.id,
			amount: 1250,
			note: 'Lunch',
			spentOn: '2026-10-31',
			loggedAt: '2026-10-31T13:00:00.000Z',
			updatedAt: '2026-10-31T13:00:00.000Z'
		});

		expect(
			updateExpense(db, 1, added.id, input(900, '2026-10-30', null), at('2026-11-02T08:00:00Z'))
		).toBe(true);
		expect(getExpense(db, 1, added.id)).toMatchObject({
			amount: 900,
			note: null,
			spentOn: '2026-10-30',
			loggedAt: '2026-10-31T13:00:00.000Z',
			updatedAt: '2026-11-02T08:00:00.000Z'
		});

		expect(removeExpense(db, 1, added.id)).toBe(true);
		expect(getExpense(db, 1, added.id)).toBeNull();
		expect(removeExpense(db, 1, added.id)).toBe(false);
	});

	it('is owner scoped: another owner can neither see, edit nor remove it', () => {
		const db = household();
		const mine = addExpense(db, 1, input(500, '2026-10-31'), at('2026-10-31T13:00:00Z'));
		expect(getExpense(db, 2, mine.id)).toBeNull();
		expect(updateExpense(db, 2, mine.id, input(1, '2026-10-31'), BALANCE_SAVED)).toBe(false);
		expect(removeExpense(db, 2, mine.id)).toBe(false);
		expect(listExpenseDays(db, 2)).toEqual([]);
		expect(getExpense(db, 1, mine.id)).toMatchObject({ amount: 500 });
		expect(getExpense(db, 1, 9999)).toBeNull();
	});

	it('lists every expense newest first, grouped by day with each day total', () => {
		const db = household();
		addExpense(db, 1, input(100, '2026-10-29', 'a'), at('2026-10-29T10:00:00Z'));
		addExpense(db, 1, input(250, '2026-10-31', 'b'), at('2026-10-31T10:00:00Z'));
		addExpense(db, 1, input(300, '2026-10-31', 'c'), at('2026-10-31T11:00:00Z'));
		addExpense(db, 1, input(40, '2026-10-30', 'd'), at('2026-10-30T10:00:00Z'));
		const days = listExpenseDays(db, 1);
		expect(days.map((x) => [x.date, x.total, x.expenses.map((e) => e.note)])).toEqual([
			['2026-10-31', 550, ['c', 'b']],
			['2026-10-30', 40, ['d']],
			['2026-10-29', 100, ['a']]
		]);
	});
});

describe('TSK-063DBD an expense counts until a newer balance covers it', () => {
	const saved = { asOf: d('2026-10-31'), savedAt: '2026-10-31T12:00:00.000Z' };
	const e = (spentOn: string, loggedAt: string) => ({ spentOn: d(spentOn), loggedAt });

	it('counts a later day logged after the balance, and the same day logged after it', () => {
		expect(counts(e('2026-11-01', '2026-11-01T08:00:00.000Z'), saved)).toBe(true);
		expect(counts(e('2026-10-31', '2026-10-31T12:00:00.001Z'), saved)).toBe(true);
	});

	it('does not count a day before the balance, even when logged after it', () => {
		expect(counts(e('2026-10-30', '2026-11-01T08:00:00.000Z'), saved)).toBe(false);
	});

	it('does not count a same-day one logged before or at the moment the balance was read', () => {
		expect(counts(e('2026-10-31', '2026-10-31T11:59:59.999Z'), saved)).toBe(false);
		expect(counts(e('2026-10-31', '2026-10-31T12:00:00.000Z'), saved)).toBe(false);
	});

	it('counts a later day however early it was logged: the balance cannot contain it', () => {
		expect(counts(e('2026-11-01', '2026-10-31T09:00:00.000Z'), saved)).toBe(true);
		// A balance true on Nov 1 but typed in on Nov 5: Nov 2 to 4 still count, Nov 1 logged
		// before it was read does not.
		const late = { asOf: d('2026-11-01'), savedAt: '2026-11-05T09:00:00.000Z' };
		for (const day of ['2026-11-02', '2026-11-03', '2026-11-04']) {
			expect(counts(e(day, '2026-11-04T20:00:00.000Z'), late)).toBe(true);
		}
		expect(counts(e('2026-11-01', '2026-11-04T20:00:00.000Z'), late)).toBe(false);
		expect(counts(e('2026-11-01', '2026-11-05T09:00:00.001Z'), late)).toBe(true);
	});

	it('counts by day alone when the balance has no saved-at', () => {
		const old = { asOf: d('2026-10-31'), savedAt: null };
		expect(counts(e('2026-10-31', '2020-01-01T00:00:00.000Z'), old)).toBe(true);
		expect(counts(e('2026-10-30', '2026-11-01T00:00:00.000Z'), old)).toBe(false);
	});

	it('selects the counting set and total from the database, newest first', () => {
		const db = household();
		addExpense(db, 1, input(1000, '2026-10-30', 'before'), at('2026-10-31T13:00:00Z'));
		addExpense(db, 1, input(2000, '2026-10-31', 'early'), at('2026-10-31T11:00:00Z'));
		addExpense(db, 1, input(300, '2026-10-31', 'same day'), at('2026-10-31T13:00:00Z'));
		addExpense(db, 1, input(40, '2026-11-01', 'next day'), at('2026-11-01T09:00:00Z'));
		const c = countingExpenses(db, 1);
		expect(c.expenses.map((x) => x.note)).toEqual(['next day', 'same day']);
		expect(c.total).toBe(340);
		expect(countingExpenses(db, 2)).toEqual({ expenses: [], total: 0 });
	});

	it('counts nothing without a balance', () => {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		addExpense(db, 1, input(500, '2026-10-31'), at('2026-10-31T13:00:00Z'));
		expect(countingExpenses(db, 1)).toEqual({ expenses: [], total: 0 });
	});

	it('an edit leaves logged-at alone, so only the new day can change whether it counts', () => {
		const db = household();
		const x = addExpense(db, 1, input(500, '2026-10-31'), at('2026-10-31T13:00:00Z'));
		updateExpense(db, 1, x.id, input(700, '2026-11-01'), at('2026-11-05T00:00:00Z'));
		expect(countingExpenses(db, 1).total).toBe(700);
		expect(getExpense(db, 1, x.id)?.loggedAt).toBe('2026-10-31T13:00:00.000Z');
		// Moved to before the balance's day, it no longer counts.
		updateExpense(db, 1, x.id, input(700, '2026-10-30'), at('2026-11-05T00:00:00Z'));
		expect(countingExpenses(db, 1).total).toBe(0);
	});

	it('a balance saved before the migration (no saved-at) counts every day on or after it', () => {
		const db = household();
		db.update(account).set({ balanceSavedAt: null }).where(eq(account.ownerId, 1)).run();
		addExpense(db, 1, input(500, '2026-10-31'), at('2026-10-01T00:00:00Z'));
		expect(countingExpenses(db, 1).total).toBe(500);
	});

	it('a fresh balance takes over from everything before it', () => {
		const db = household();
		addExpense(db, 1, input(500, '2026-10-31'), at('2026-10-31T13:00:00Z'));
		expect(countingExpenses(db, 1).total).toBe(500);
		setBalance(db, 1, minor(100000), d('2026-11-01'), at('2026-11-01T09:00:00Z'));
		expect(countingExpenses(db, 1)).toEqual({ expenses: [], total: 0 });
		// Same day as the balance: logged before it was read does not count, after it does.
		addExpense(db, 1, input(30, '2026-11-01'), at('2026-11-01T08:00:00Z'));
		expect(countingExpenses(db, 1).total).toBe(0);
		addExpense(db, 1, input(70, '2026-11-01'), at('2026-11-01T10:00:00Z'));
		expect(countingExpenses(db, 1).total).toBe(70);
	});

	it('a balance true on an earlier day still lets later days count (true Nov 1, saved Nov 5)', () => {
		const db = household();
		setBalance(db, 1, minor(100000), d('2026-11-01'), at('2026-11-05T09:00:00Z'));
		addExpense(db, 1, input(100, '2026-11-01'), at('2026-11-04T09:00:00Z'));
		for (const [n, day] of [
			[2, '02'],
			[3, '03'],
			[4, '04']
		] as const) {
			addExpense(db, 1, input(n * 1000, `2026-11-${day}`), at('2026-11-04T10:00:00Z'));
		}
		expect(countingExpenses(db, 1).total).toBe(9000);
	});

	it('setBalance records the moment it was saved', () => {
		const db = household();
		expect(db.select().from(account).where(eq(account.ownerId, 1)).get()?.balanceSavedAt).toBe(
			'2026-10-31T12:00:00.000Z'
		);
	});

	it('finishing a check-in saves the balance with its own time, so earlier expenses stop counting', () => {
		const db = household();
		addExpense(db, 1, input(500, '2026-10-31'), at('2026-10-31T13:00:00Z'));
		// Same day as the check-in, logged before its balance was read.
		addExpense(db, 1, input(30, '2026-11-13'), at('2026-11-13T08:00:00Z'));
		const NOW = at('2026-11-13T09:00:00Z');
		const row = startCheckIn(db, 1, NOW);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, NOW, minor(300000));
		acknowledgeSpending(db, 1, row.id);
		savePayments(
			db,
			1,
			row.id,
			NOW,
			new Map(paymentLines(checkInContext(db, 1, NOW)!).map((l) => [l.key, 'paid' as const]))
		);
		finishCheckIn(db, 1, row.id, at('2026-11-13T09:05:00Z'));
		const acct = db.select().from(account).where(eq(account.ownerId, 1)).get()!;
		// Stamped with the balance step, not with finishing.
		expect(acct.balanceSavedAt).toBe('2026-11-13T09:00:00.000Z');
		expect(countingExpenses(db, 1).total).toBe(0);
	});

	it('an expense logged between the balance step and finishing still counts afterwards', () => {
		const db = household();
		const READ = at('2026-11-13T09:00:00Z');
		const row = startCheckIn(db, 1, READ);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, READ, minor(300000));
		expect(db.select().from(checkIn).where(eq(checkIn.id, row.id)).get()?.balanceReadAt).toBe(
			'2026-11-13T09:00:00.000Z'
		);
		addExpense(db, 1, input(450, '2026-11-13', 'in between'), at('2026-11-13T09:02:00Z'));
		acknowledgeSpending(db, 1, row.id);
		const FINISH = at('2026-11-13T09:05:00Z');
		savePayments(
			db,
			1,
			row.id,
			FINISH,
			new Map(paymentLines(checkInContext(db, 1, FINISH)!).map((l) => [l.key, 'paid' as const]))
		);
		finishCheckIn(db, 1, row.id, FINISH);
		const c = countingExpenses(db, 1);
		expect(c.expenses.map((x) => x.note)).toEqual(['in between']);
		expect(c.total).toBe(450);
	});

	it('falls back to the finishing time when the balance step left no read-at', () => {
		const db = household();
		const NOW = at('2026-11-13T09:00:00Z');
		const row = startCheckIn(db, 1, NOW);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, NOW, minor(300000));
		acknowledgeSpending(db, 1, row.id);
		savePayments(
			db,
			1,
			row.id,
			NOW,
			new Map(paymentLines(checkInContext(db, 1, NOW)!).map((l) => [l.key, 'paid' as const]))
		);
		db.update(checkIn).set({ balanceReadAt: null }).where(eq(checkIn.id, row.id)).run();
		finishCheckIn(db, 1, row.id, at('2026-11-13T09:05:00Z'));
		expect(db.select().from(account).where(eq(account.ownerId, 1)).get()?.balanceSavedAt).toBe(
			'2026-11-13T09:05:00.000Z'
		);
	});
});

describe('TSK-063DBD the number and the home view follow the counting expenses', () => {
	const NOW = at('2026-11-01T12:00:00Z');

	it('lowers the number by exactly the counting total and lists them', () => {
		const db = household();
		const before = computeSafe(db, 1, NOW);
		if (before.state !== 'ready') throw new Error('Expected a number');
		addExpense(db, 1, input(1250, '2026-11-01', 'Groceries'), at('2026-11-01T10:00:00Z'));
		addExpense(db, 1, input(500, '2026-10-31', null), at('2026-11-01T11:00:00Z'));
		addExpense(db, 1, input(9999, '2026-10-30', 'Too early'), at('2026-11-01T11:30:00Z'));
		const after = computeSafe(db, 1, NOW);
		if (after.state !== 'ready') throw new Error('Expected a number');
		expect(after.result.amount).toBe(before.result.amount - 1750);

		const expected = safeToSpend({
			items: after.plan.items,
			overrides: after.plan.overrides,
			balance: after.plan.balance!.amount,
			balanceAsOf: TODAY,
			today: after.plan.today,
			expenses: minor(1750)
		});
		expect(after.result.amount).toBe(expected.amount);

		const view = buildHome(db, 1, NOW);
		if (view.state !== 'ready') throw new Error('Expected a number');
		expect(view.expenses).toEqual([
			{ id: 1, name: 'Groceries', date: 'Sun, Nov 1 2026', amount: '$12.50' },
			{ id: 2, name: 'Expense', date: 'Sat, Oct 31 2026', amount: '$5.00' }
		]);
		expect(view.expensesTotal).toBe('$17.50');
	});

	it('shows no expenses when none are logged', () => {
		const db = household();
		const view = buildHome(db, 1, NOW);
		if (view.state !== 'ready') throw new Error('Expected a number');
		expect(view.expenses).toEqual([]);
		expect(view.expensesTotal).toBe('$0.00');
	});

	it('goes into shortfall, with the bills uncovered, when logged spending uses the money up', () => {
		const db = household();
		addExpense(db, 1, input(10_000_000, '2026-11-01', 'Everything'), at('2026-11-01T10:00:00Z'));
		const view = buildHome(db, 1, NOW);
		if (view.state !== 'ready') throw new Error('Expected a number');
		expect(view.negative).toBe(true);
		expect(view.shortfall?.uncovered.length).toBeGreaterThan(0);
	});
});
