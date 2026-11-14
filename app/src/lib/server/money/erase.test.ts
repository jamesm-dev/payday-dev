import { eq, inArray, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { addPasskey } from '#lib/server/auth/passkeys.ts';
import { setPasswordHash } from '#lib/server/auth/password.ts';
import { insertRecoveryCodes } from '#lib/server/auth/recovery.ts';
import { createSession, deleteAllSessions } from '#lib/server/auth/session.ts';
import { sha256Hex } from '#lib/server/auth/tokens.ts';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import {
	account,
	checkIn,
	expense,
	loan,
	loanBalance,
	occurrenceOverride,
	owner,
	paidMark,
	passkey,
	paymentConfirmation,
	recoveryCode,
	scheduleItem,
	session
} from '#lib/server/db/schema.ts';
import { getReminderTime, setReminderTime } from '#lib/server/reminders/store.ts';
import { eraseBudget, SessionEndedError } from './erase.ts';
import { addExpense } from './expenses.ts';
import { buildHome } from './home.ts';
import { listLoans } from './loans.ts';
import { seedHousehold } from './seed.ts';
import { ensureAccount, getBalance, getOwner, listItems } from './store.ts';

const NOW = new Date('2026-10-31T12:00:00Z');

/** Every table that holds budget data: each must lose exactly the erased owner's rows. */
const BUDGET = {
	account,
	scheduleItem,
	occurrenceOverride,
	paidMark,
	expense,
	checkIn,
	paymentConfirmation,
	loan,
	loanBalance
};
type Name = keyof typeof BUDGET;
const counts = async (db: Db) =>
	Object.fromEntries(
		await Promise.all(
			Object.entries(BUDGET).map(
				async ([name, table]) => [name, (await db.select().from(table)).length] as const
			)
		)
	) as Record<Name, number>;

/** Every budget row that is this owner's, whole, found through their account, loans and check-ins. */
async function rowsOf(db: Db, ownerId: number) {
	const accounts = await db.select().from(account).where(eq(account.ownerId, ownerId));
	const items = await db
		.select()
		.from(scheduleItem)
		.where(
			inArray(
				scheduleItem.accountId,
				accounts.map((a) => a.id)
			)
		);
	const itemIds = items.map((i) => i.id);
	const loans = await db.select().from(loan).where(eq(loan.ownerId, ownerId));
	const checkIns = await db.select().from(checkIn).where(eq(checkIn.ownerId, ownerId));
	return {
		account: accounts,
		scheduleItem: items,
		occurrenceOverride: await db
			.select()
			.from(occurrenceOverride)
			.where(inArray(occurrenceOverride.itemId, itemIds)),
		paidMark: await db.select().from(paidMark).where(inArray(paidMark.itemId, itemIds)),
		expense: await db.select().from(expense).where(eq(expense.ownerId, ownerId)),
		checkIn: checkIns,
		paymentConfirmation: await db
			.select()
			.from(paymentConfirmation)
			.where(
				inArray(
					paymentConfirmation.checkInId,
					checkIns.map((c) => c.id)
				)
			),
		loan: loans,
		loanBalance: await db
			.select()
			.from(loanBalance)
			.where(
				inArray(
					loanBalance.loanId,
					loans.map((l) => l.id)
				)
			)
	} satisfies Record<Name, unknown[]>;
}
const lengths = (rows: Awaited<ReturnType<typeof rowsOf>>) =>
	Object.fromEntries(Object.entries(rows).map(([name, list]) => [name, list.length]));

/** The demo household, plus a finished check-in, a paid mark, a reminder time and a way to sign in. */
async function household(db: Db, ownerId: number) {
	await db.insert(owner).values({ id: ownerId });
	await seedHousehold(db, { ownerId, production: false, now: NOW });
	const item = (
		await db
			.select({ id: scheduleItem.id })
			.from(scheduleItem)
			.innerJoin(account, eq(scheduleItem.accountId, account.id))
			.where(eq(account.ownerId, ownerId))
	)[0]!;
	const owed = (await db.select({ id: loan.id }).from(loan).where(eq(loan.ownerId, ownerId)))[0]!;
	await db.insert(paidMark).values({ itemId: item.id, originalDate: '2026-11-01' });
	await addExpense(
		db,
		ownerId,
		{ amount: minor(1250), note: 'Lunch', spentOn: d('2026-10-31') },
		new Date('2026-10-31T13:00:00Z')
	);
	const done = (
		await db
			.insert(checkIn)
			.values({
				ownerId,
				startedAt: '2026-10-30T09:00:00Z',
				finishedAt: '2026-10-30T09:02:00Z',
				currentStep: 'done',
				asOf: '2026-10-30'
			})
			.returning()
	)[0];
	await db.insert(paymentConfirmation).values({
		checkInId: done.id,
		itemId: item.id,
		originalDate: '2026-10-15',
		dueDate: '2026-10-15',
		amountMinor: 5000,
		status: 'paid'
	});
	await db.insert(loanBalance).values({
		loanId: owed.id,
		checkInId: done.id,
		asOf: '2026-10-30',
		balanceMinor: 90000,
		source: 'check-in'
	});
	await setReminderTime(db, ownerId, '07:30');

	await setPasswordHash(db, ownerId, `scrypt$owner-${ownerId}`);
	await addPasskey(db, ownerId, {
		id: `cred-${ownerId}`,
		publicKey: new Uint8Array([1, 2, 3]),
		counter: 0,
		transports: ['internal'],
		nickname: 'Phone'
	});
	await insertRecoveryCodes(db, ownerId);
	await createSession(db, ownerId, 'test');
}

async function twoHouseholds() {
	const db = await freshDb();
	await household(db, 1);
	await household(db, 2);
	return db;
}

describe('TSK-C19E67 starting over deletes the budget and keeps signing in', () => {
	it('deletes every budget row of the owner, and only theirs', async () => {
		const db = await twoHouseholds();
		const mine = await rowsOf(db, 1);
		const theirs = await rowsOf(db, 2);
		// Each table holds some of mine, or "they are gone" would prove nothing; and every row in it is
		// one owner's or the other's, so "what is left is exactly theirs" covers the whole table.
		for (const name of Object.keys(BUDGET) as Name[]) {
			expect(mine[name].length, name).toBeGreaterThan(0);
			expect(mine[name].length + theirs[name].length, name).toBe((await counts(db))[name]);
		}

		const erased = await eraseBudget(db, 1);

		// Theirs is untouched, row for row; nothing of mine is left anywhere.
		expect(await rowsOf(db, 2)).toEqual(theirs);
		expect(await counts(db)).toEqual(lengths(theirs));
		expect(await listItems(db, 1)).toEqual([]);
		expect(await listLoans(db, 1)).toEqual([]);
		expect((await buildHome(db, 2, NOW)).state).toBe('ready');
		expect(erased).toEqual({
			items: mine.scheduleItem.length,
			checkIns: mine.checkIn.length,
			loans: mine.loan.length
		});
	});

	it('deletes nothing at all when any part of it fails', async () => {
		const db = await twoHouseholds();
		const state = async () => ({
			mine: await rowsOf(db, 1),
			me: (await db.select().from(owner).where(eq(owner.id, 1)))[0]
		});
		const before = await state();
		// The account is among the last to go, after most of the other deletes have run.
		await db.execute(sql`create function payday.refuse() returns trigger language plpgsql
			as $$ begin raise exception 'refused'; end $$`);
		await db.execute(
			sql`create trigger refuse before delete on payday.account for each row execute function payday.refuse()`
		);
		try {
			await expect(eraseBudget(db, 1)).rejects.toMatchObject({
				cause: { message: expect.stringContaining('refused') }
			});
			expect(await state()).toEqual(before);
		} finally {
			await db.execute(sql`drop trigger refuse on payday.account`);
			await db.execute(sql`drop function payday.refuse()`);
		}
	});

	it('puts the owner back at the start of setup, with the reminder time back at nine', async () => {
		const db = await twoHouseholds();
		await eraseBudget(db, 1);

		expect(await getOwner(db, 1)).toEqual({ currency: null, timeZone: null, setupStep: 'welcome' });
		expect(await getReminderTime(db, 1)).toBe('09:00');
		// The other owner's settings are theirs.
		expect((await getOwner(db, 2)).setupStep).toBeNull();
		expect(await getReminderTime(db, 2)).toBe('07:30');
	});

	it('leaves the password, devices, recovery codes and sessions exactly as they were', async () => {
		const db = await twoHouseholds();
		const auth = async () => ({
			password: (await db.select().from(owner).where(eq(owner.id, 1)))[0]!.passwordHash,
			passkeys: await db.select().from(passkey).where(eq(passkey.ownerId, 1)),
			codes: await db.select().from(recoveryCode).where(eq(recoveryCode.ownerId, 1)),
			sessions: await db.select().from(session).where(eq(session.ownerId, 1))
		});
		const before = await auth();
		expect(before.passkeys).toHaveLength(1);
		expect(before.codes.length).toBeGreaterThan(0);
		expect(before.sessions).toHaveLength(1);

		await eraseBudget(db, 1);

		expect(await auth()).toEqual(before);
	});

	it('leaves a budget that setup can start again from', async () => {
		const db = await twoHouseholds();
		await eraseBudget(db, 1);

		expect(await getBalance(db, 1)).toBeNull();
		expect((await ensureAccount(db, 1)).ownerId).toBe(1);
		await seedHousehold(db, { ownerId: 1, production: false, now: NOW });
		expect((await buildHome(db, 1, NOW)).state).toBe('ready');
	});

	it('does nothing to an owner who has no budget yet', async () => {
		const db = await freshDb();
		await db.insert(owner).values({ id: 1 });
		await eraseBudget(db, 1);
		expect(await getOwner(db, 1)).toEqual({ currency: null, timeZone: null, setupStep: 'welcome' });
	});
});

describe('TSK-C19E67 start over checks the session inside the deleting transaction', () => {
	it('refuses, changing nothing, when the session ended before the delete ran', async () => {
		const db = await twoHouseholds();
		const { token } = await createSession(db, 1, 'vitest');
		await deleteAllSessions(db, 1);
		const before = await rowsOf(db, 1);
		await expect(eraseBudget(db, 1, sha256Hex(token))).rejects.toBeInstanceOf(SessionEndedError);
		expect(await rowsOf(db, 1)).toEqual(before);
	});

	it('still erases when the session is there', async () => {
		const db = await twoHouseholds();
		const { token } = await createSession(db, 1, 'vitest');
		await eraseBudget(db, 1, sha256Hex(token));
		expect(await listItems(db, 1)).toEqual([]);
	});
});
