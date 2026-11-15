import { isRedirect, type ActionFailure } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isClientId } from '#lib/checks.ts';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { cookieJar, testEvent } from '#lib/server/auth/testEvent.ts';
import type { Db } from '#lib/server/db/open.ts';
import { expense, expenseReceipt, owner } from '#lib/server/db/schema.ts';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import { addExpenseOnce, removeExpense } from '#lib/server/money/expenses.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';

let db: Db;
vi.mock('#lib/server/db/index.ts', () => ({ getDb: async () => db }));

const { actions } = await import('./+page.server.ts');

const NOW = new Date('2026-10-31T13:00:00Z');
const ID = '3f2b8c1e-9d4a-4b7e-8c21-5a6f0e9d1b23';
const OTHER_ID = '7c1d2e3f-4a5b-4c6d-9e7f-8a9b0c1d2e3f';
const input = (amount: number, note: string | null = null) => ({
	amount: minor(amount),
	note,
	spentOn: d('2026-10-31')
});

beforeEach(async () => {
	vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
	db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await db.insert(owner).values(ownerRow(2));
	await seedHousehold(db, { ownerId: 1, production: false, now: NOW, loans: false });
	await seedHousehold(db, { ownerId: 2, production: false, now: NOW, loans: false });
	return () => vi.useRealTimers();
});

const expensesOf = (ownerId: number) =>
	db.select().from(expense).where(eq(expense.ownerId, ownerId));

describe('TSK-6ff9b3 an expense with a phone-made id is saved exactly once', () => {
	it('saves it the first time, and nothing the second', async () => {
		const before = (await expensesOf(1)).length;
		expect(await addExpenseOnce(db, 1, input(1250, 'Lunch'), ID, NOW)).toEqual({ saved: true });
		expect(await addExpenseOnce(db, 1, input(1250, 'Lunch'), ID, NOW)).toEqual({ saved: false });
		expect(await expensesOf(1)).toHaveLength(before + 1);
	});

	it('does not bring a removed expense back when an old send arrives late', async () => {
		await addExpenseOnce(db, 1, input(900), ID, NOW);
		const [row] = (await expensesOf(1)).filter((e) => e.amountMinor === 900);
		expect(await removeExpense(db, 1, row!.id)).toBe(true);
		expect(await addExpenseOnce(db, 1, input(900), ID, NOW)).toEqual({ saved: false });
		expect((await expensesOf(1)).filter((e) => e.amountMinor === 900)).toHaveLength(0);
	});

	it('keeps each person their own ids: the same id from another person is theirs to save', async () => {
		expect(await addExpenseOnce(db, 1, input(500), ID, NOW)).toEqual({ saved: true });
		expect(await addExpenseOnce(db, 2, input(500), ID, NOW)).toEqual({ saved: true });
		const receipts = await db.select().from(expenseReceipt);
		expect(receipts.map((r) => [r.ownerId, r.clientId]).sort()).toEqual([
			[1, ID],
			[2, ID]
		]);
		expect(receipts.every((r) => r.receivedAt === NOW.toISOString())).toBe(true);
	});

	it('logs it at the moment the site received it, so an expense on the balance day counts', async () => {
		const later = new Date('2026-10-31T18:00:00Z');
		await addExpenseOnce(db, 1, input(700), OTHER_ID, later);
		const [row] = (await expensesOf(1)).filter((e) => e.amountMinor === 700);
		expect(row!.loggedAt).toBe(later.toISOString());
	});
});

/** The home screen's `?/expense` action, as the browser's form or the phone's queue sends it. */
async function post(fields: Record<string, string>) {
	const { jar, cookies } = cookieJar();
	const event = testEvent({ fields, cookies, ownerId: 1, path: '/' });
	try {
		const result = await actions.expense(event as never);
		return {
			result: result as ActionFailure<{ expense: { problems: Record<string, string> } }>,
			jar
		};
	} catch (thrown) {
		if (isRedirect(thrown)) return { redirect: thrown.location, jar };
		throw thrown;
	}
}

const FORM = { amount: '12.50', note: 'Lunch', date: '2026-10-31' };

describe('TSK-6ff9b3 the home screen action takes a phone-made id', () => {
	it('saves the same expense once however many times it is sent, and answers each the same', async () => {
		const before = (await expensesOf(1)).length;
		const first = await post({ ...FORM, clientId: ID, queued: 'yes' });
		const second = await post({ ...FORM, clientId: ID, queued: 'yes' });
		expect(first.redirect).toBe('/');
		expect(second.redirect).toBe('/');
		expect(await expensesOf(1)).toHaveLength(before + 1);
	});

	it('says the queued ones are saved, and a typed one is added', async () => {
		const queued = await post({ ...FORM, clientId: ID, queued: 'yes' });
		expect(queued.jar.get('flash')).toBe('offline-sent');
		const typed = await post({ ...FORM, clientId: OTHER_ID });
		expect(typed.jar.get('flash')).toBe('expense-added');
		const plain = await post(FORM);
		expect(plain.jar.get('flash')).toBe('expense-added');
	});

	it('refuses an id that is not one a phone makes, saving nothing', async () => {
		const before = (await expensesOf(1)).length;
		for (const clientId of ['', 'abc', ID.toUpperCase(), `${ID}x`, "1' or '1'='1"]) {
			const { result } = await post({ ...FORM, clientId });
			expect(result!.status).toBe(400);
		}
		expect(await expensesOf(1)).toHaveLength(before);
		expect(await db.select().from(expenseReceipt)).toHaveLength(0);
	});

	it('checks a queued expense exactly as a typed one, and keeps no receipt for a refused one', async () => {
		const { result } = await post({ amount: '0', note: '', date: '2026-10-31', clientId: ID });
		expect(result!.status).toBe(400);
		expect(result!.data.expense.problems.amount).toBeTruthy();
		const tomorrow = await post({ ...FORM, date: '2026-11-01', clientId: ID });
		expect(tomorrow.result!.status).toBe(400);
		expect(await db.select().from(expenseReceipt)).toHaveLength(0);
		// Once corrected, the same id still saves.
		expect((await post({ ...FORM, clientId: ID })).redirect).toBe('/');
	});
});

describe('TSK-03858e the id a phone makes', () => {
	it('is a lower-case version 4 UUID, as crypto.randomUUID makes', () => {
		for (let i = 0; i < 50; i++) expect(isClientId(crypto.randomUUID())).toBe(true);
		expect(isClientId(ID)).toBe(true);
		expect(isClientId(ID.toUpperCase())).toBe(false);
		expect(isClientId('3f2b8c1e-9d4a-1b7e-8c21-5a6f0e9d1b23')).toBe(false); // version 1
		expect(isClientId(42)).toBe(false);
		expect(isClientId(undefined)).toBe(false);
	});
});
