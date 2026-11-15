/**
 * TSK-20E9EF migration 0003 marks each account's main pay, and may be run twice. `freshDb()` has
 * already run every migration, so the test inserts rows with no main pay, as the live database has
 * them, and runs the checked-in SQL of 0003 on top.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, type Db } from './open.ts';
import { account, owner, scheduleItem } from './schema.ts';
import { freshDb, ownerRow } from './testing.ts';

const BACKFILL = readFileSync(join(MIGRATIONS_FOLDER, '0003_mark_main_pay.sql'), 'utf8');

async function addAccount(db: Db, ownerId: number): Promise<number> {
	await db.insert(owner).values(ownerRow(ownerId));
	const [row] = await db.insert(account).values({ ownerId, name: 'Main account' }).returning();
	return row.id;
}

async function addRow(
	db: Db,
	accountId: number,
	name: string,
	kind: 'income' | 'bill',
	ruleKind: 'every14' | 'monthly',
	extra: { isMainPay?: boolean; endsOn?: string } = {}
) {
	await db.insert(scheduleItem).values({
		accountId,
		kind,
		name,
		amountMinor: 10000,
		ruleKind,
		ruleAnchor: ruleKind === 'every14' ? '2026-01-09' : null,
		ruleDay: ruleKind === 'monthly' ? 1 : null,
		startsOn: '2026-01-01',
		...extra
	});
}

const marked = async (db: Db) =>
	(await db.select().from(scheduleItem).orderBy(asc(scheduleItem.id)))
		.filter((r) => r.isMainPay)
		.map((r) => r.name);

describe('TSK-20E9EF the main-pay backfill', () => {
	it('adds the columns with safe defaults: no main pay, no second day', async () => {
		const db = await freshDb();
		const a = await addAccount(db, 1);
		await addRow(db, a, 'Pay', 'income', 'every14');
		const [row] = await db.select().from(scheduleItem);
		expect(row.isMainPay).toBe(false);
		expect(row.ruleDay2).toBeNull();
	});

	it('marks the lowest-id every-14-days income of each account, and only that one', async () => {
		const db = await freshDb();
		const a1 = await addAccount(db, 1);
		await addRow(db, a1, 'Rent', 'bill', 'every14');
		await addRow(db, a1, 'Salary monthly', 'income', 'monthly');
		await addRow(db, a1, 'Pay', 'income', 'every14');
		await addRow(db, a1, 'Side pay', 'income', 'every14');
		const a2 = await addAccount(db, 2);
		await addRow(db, a2, 'Other pay', 'income', 'every14');
		await addRow(db, a2, 'Other pay 2', 'income', 'every14');
		const a3 = await addAccount(db, 3);
		await addRow(db, a3, 'Monthly only', 'income', 'monthly');
		await addRow(db, a3, 'Fortnightly bill', 'bill', 'every14');

		await db.execute(sql.raw(BACKFILL));

		// One per account that has an every-14-days income; none for the account that has not.
		expect(await marked(db)).toEqual(['Pay', 'Other pay']);
	});

	it('changes nothing the second time', async () => {
		const db = await freshDb();
		const a1 = await addAccount(db, 1);
		await addRow(db, a1, 'Pay', 'income', 'every14');
		await addRow(db, a1, 'Side pay', 'income', 'every14');
		const a2 = await addAccount(db, 2);
		await addRow(db, a2, 'Other pay', 'income', 'every14');

		await db.execute(sql.raw(BACKFILL));
		const once = await db.select().from(scheduleItem).orderBy(asc(scheduleItem.id));
		await db.execute(sql.raw(BACKFILL));
		await db.execute(sql.raw(BACKFILL));
		const thrice = await db.select().from(scheduleItem).orderBy(asc(scheduleItem.id));
		expect(thrice).toEqual(once);
		expect(await marked(db)).toEqual(['Pay', 'Other pay']);
	});

	it('prefers the pay that is still running over a lower-id one that has ended', async () => {
		const db = await freshDb();
		const a = await addAccount(db, 1);
		await addRow(db, a, 'Old pay', 'income', 'every14', { endsOn: '2026-06-30' });
		for (let i = 0; i < 5; i++) await addRow(db, a, `Bill ${i}`, 'bill', 'monthly');
		await addRow(db, a, 'Current pay', 'income', 'every14');
		await addRow(db, a, 'Later pay', 'income', 'every14');
		await db.execute(sql.raw(BACKFILL));
		expect(await marked(db)).toEqual(['Current pay']);
		// And when every one has ended, the lowest id is still chosen.
		const b = await addAccount(db, 2);
		await addRow(db, b, 'Ended 1', 'income', 'every14', { endsOn: '2026-06-30' });
		await addRow(db, b, 'Ended 2', 'income', 'every14', { endsOn: '2026-08-30' });
		await db.execute(sql.raw(BACKFILL));
		expect(await marked(db)).toEqual(['Current pay', 'Ended 1']);
	});

	it('TSK-20E9EF allows one running main pay per account, and a switch ends the old one first', async () => {
		const db = await freshDb();
		const a = await addAccount(db, 1);
		const b = await addAccount(db, 2);
		await addRow(db, a, 'Pay', 'income', 'every14', { isMainPay: true });
		// A second running main pay is refused by the database.
		await expect(
			addRow(db, a, 'Second', 'income', 'every14', { isMainPay: true })
		).rejects.toThrow();
		// Another account has its own.
		await addRow(db, b, 'Their pay', 'income', 'every14', { isMainPay: true });
		// The switch order: end the old one, then add the new one.
		await db.update(scheduleItem).set({ endsOn: '2026-11-20' }).where(eq(scheduleItem.name, 'Pay'));
		await addRow(db, a, 'New pay', 'income', 'monthly', { isMainPay: true });
		expect(await marked(db)).toEqual(['Pay', 'Their pay', 'New pay']);
		// Pay that is not main is never limited.
		await addRow(db, a, 'Side 1', 'income', 'every14');
		await addRow(db, a, 'Side 2', 'income', 'every14');
	});

	it('leaves an account alone that already has a main pay, even a later one', async () => {
		const db = await freshDb();
		const a = await addAccount(db, 1);
		await addRow(db, a, 'Pay', 'income', 'every14');
		await addRow(db, a, 'Chosen pay', 'income', 'every14', { isMainPay: true });
		await db.execute(sql.raw(BACKFILL));
		expect(await marked(db)).toEqual(['Chosen pay']);
	});
});
