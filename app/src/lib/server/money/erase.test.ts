import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { addPasskey } from '#lib/server/auth/passkeys.ts';
import { setPasswordHash } from '#lib/server/auth/password.ts';
import { insertRecoveryCodes } from '#lib/server/auth/recovery.ts';
import { createSession } from '#lib/server/auth/session.ts';
import { open, type Db } from '#lib/server/db/open.ts';
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
	pushSubscription,
	recoveryCode,
	reminderSent,
	scheduleItem,
	session
} from '#lib/server/db/schema.ts';
import { getReminderTime, setReminderTime } from '#lib/server/reminders/store.ts';
import { eraseBudget } from './erase.ts';
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
	loanBalance,
	pushSubscription
};
type Name = keyof typeof BUDGET;
const counts = (db: Db) =>
	Object.fromEntries(
		Object.entries(BUDGET).map(([name, table]) => [name, db.select().from(table).all().length])
	) as Record<Name, number>;

/** Every budget row that is this owner's, whole, found through their account, loans and check-ins. */
function rowsOf(db: Db, ownerId: number) {
	const accounts = db.select().from(account).where(eq(account.ownerId, ownerId)).all();
	const items = db
		.select()
		.from(scheduleItem)
		.where(
			inArray(
				scheduleItem.accountId,
				accounts.map((a) => a.id)
			)
		)
		.all();
	const itemIds = items.map((i) => i.id);
	const loans = db.select().from(loan).where(eq(loan.ownerId, ownerId)).all();
	const checkIns = db.select().from(checkIn).where(eq(checkIn.ownerId, ownerId)).all();
	return {
		account: accounts,
		scheduleItem: items,
		occurrenceOverride: db
			.select()
			.from(occurrenceOverride)
			.where(inArray(occurrenceOverride.itemId, itemIds))
			.all(),
		paidMark: db.select().from(paidMark).where(inArray(paidMark.itemId, itemIds)).all(),
		expense: db.select().from(expense).where(eq(expense.ownerId, ownerId)).all(),
		checkIn: checkIns,
		paymentConfirmation: db
			.select()
			.from(paymentConfirmation)
			.where(
				inArray(
					paymentConfirmation.checkInId,
					checkIns.map((c) => c.id)
				)
			)
			.all(),
		loan: loans,
		loanBalance: db
			.select()
			.from(loanBalance)
			.where(
				inArray(
					loanBalance.loanId,
					loans.map((l) => l.id)
				)
			)
			.all(),
		pushSubscription: db
			.select()
			.from(pushSubscription)
			.where(eq(pushSubscription.ownerId, ownerId))
			.all()
	} satisfies Record<Name, unknown[]>;
}
const lengths = (rows: ReturnType<typeof rowsOf>) =>
	Object.fromEntries(Object.entries(rows).map(([name, list]) => [name, list.length]));

/** The demo household, plus a finished check-in, a paid mark, a reminder and a way to sign in. */
function household(db: Db, ownerId: number) {
	db.insert(owner).values({ id: ownerId }).run();
	seedHousehold(db, { ownerId, production: false, now: NOW });
	const item = db
		.select({ id: scheduleItem.id })
		.from(scheduleItem)
		.innerJoin(account, eq(scheduleItem.accountId, account.id))
		.where(eq(account.ownerId, ownerId))
		.get()!;
	const owed = db.select({ id: loan.id }).from(loan).where(eq(loan.ownerId, ownerId)).get()!;
	db.insert(paidMark).values({ itemId: item.id, originalDate: '2026-11-01' }).run();
	addExpense(
		db,
		ownerId,
		{ amount: minor(1250), note: 'Lunch', spentOn: d('2026-10-31') },
		new Date('2026-10-31T13:00:00Z')
	);
	const done = db
		.insert(checkIn)
		.values({
			ownerId,
			startedAt: '2026-10-30T09:00:00Z',
			finishedAt: '2026-10-30T09:02:00Z',
			currentStep: 'done',
			asOf: '2026-10-30'
		})
		.returning()
		.get();
	db.insert(paymentConfirmation)
		.values({
			checkInId: done.id,
			itemId: item.id,
			originalDate: '2026-10-15',
			dueDate: '2026-10-15',
			amountMinor: 5000,
			status: 'paid'
		})
		.run();
	db.insert(loanBalance)
		.values({
			loanId: owed.id,
			checkInId: done.id,
			asOf: '2026-10-30',
			balanceMinor: 90000,
			source: 'check-in'
		})
		.run();
	db.insert(pushSubscription)
		.values({ ownerId, endpoint: `https://push.invalid/${ownerId}`, p256dh: 'k', auth: 'a' })
		.run();
	setReminderTime(db, ownerId, '07:30');
	db.update(owner)
		.set({ remindersExpiredAt: '2026-10-29T00:00:00Z' })
		.where(eq(owner.id, ownerId))
		.run();

	setPasswordHash(db, ownerId, `scrypt$owner-${ownerId}`);
	addPasskey(db, ownerId, {
		id: `cred-${ownerId}`,
		publicKey: new Uint8Array([1, 2, 3]),
		counter: 0,
		transports: ['internal'],
		nickname: 'Phone'
	});
	insertRecoveryCodes(db, ownerId);
	createSession(db, ownerId, 'test');
}

function twoHouseholds() {
	const db = open(':memory:');
	household(db, 1);
	household(db, 2);
	db.insert(reminderSent)
		.values({ paydayDate: '2026-10-30', sentAt: '2026-10-30T09:00:00Z' })
		.run();
	return db;
}

describe('TSK-C19E67 starting over deletes the budget and keeps signing in', () => {
	it('deletes every budget row of the owner, and only theirs', () => {
		const db = twoHouseholds();
		const mine = rowsOf(db, 1);
		const theirs = rowsOf(db, 2);
		// Each table holds some of mine, or "they are gone" would prove nothing; and every row in it is
		// one owner's or the other's, so "what is left is exactly theirs" covers the whole table.
		for (const name of Object.keys(BUDGET) as Name[]) {
			expect(mine[name].length, name).toBeGreaterThan(0);
			expect(mine[name].length + theirs[name].length, name).toBe(counts(db)[name]);
		}

		const erased = eraseBudget(db, 1);

		// Theirs is untouched, row for row; nothing of mine is left anywhere.
		expect(rowsOf(db, 2)).toEqual(theirs);
		expect(counts(db)).toEqual(lengths(theirs));
		expect(listItems(db, 1)).toEqual([]);
		expect(listLoans(db, 1)).toEqual([]);
		expect(buildHome(db, 2, NOW).state).toBe('ready');
		expect(erased).toEqual({
			items: mine.scheduleItem.length,
			checkIns: mine.checkIn.length,
			loans: mine.loan.length,
			phones: mine.pushSubscription.length
		});
	});

	it('deletes nothing at all when any part of it fails', () => {
		const db = twoHouseholds();
		const state = () => ({
			mine: rowsOf(db, 1),
			me: db.select().from(owner).where(eq(owner.id, 1)).get(),
			sent: db.select().from(reminderSent).all()
		});
		const before = state();
		// The account is among the last to go, after most of the other deletes have run.
		db.$client.exec(
			"CREATE TRIGGER refuse BEFORE DELETE ON account BEGIN SELECT RAISE(ABORT, 'refused'); END"
		);
		expect(() => eraseBudget(db, 1)).toThrow('refused');
		expect(state()).toEqual(before);
	});

	it('puts the owner back at the start of setup, with reminders off', () => {
		const db = twoHouseholds();
		eraseBudget(db, 1);

		expect(getOwner(db, 1)).toEqual({ currency: null, timeZone: null, setupStep: 'welcome' });
		expect(getReminderTime(db, 1)).toBe('09:00');
		const me = db.select().from(owner).where(eq(owner.id, 1)).get()!;
		expect(me.remindersExpiredAt).toBeNull();
		expect(db.select().from(reminderSent).all()).toEqual([]);
		// The other owner's settings are theirs.
		expect(getOwner(db, 2).setupStep).toBeNull();
		expect(getReminderTime(db, 2)).toBe('07:30');
	});

	it('leaves the password, devices, recovery codes and sessions exactly as they were', () => {
		const db = twoHouseholds();
		const auth = () => ({
			password: db.select().from(owner).where(eq(owner.id, 1)).get()!.passwordHash,
			passkeys: db.select().from(passkey).where(eq(passkey.ownerId, 1)).all(),
			codes: db.select().from(recoveryCode).where(eq(recoveryCode.ownerId, 1)).all(),
			sessions: db.select().from(session).where(eq(session.ownerId, 1)).all()
		});
		const before = auth();
		expect(before.passkeys).toHaveLength(1);
		expect(before.codes.length).toBeGreaterThan(0);
		expect(before.sessions).toHaveLength(1);

		eraseBudget(db, 1);

		expect(auth()).toEqual(before);
	});

	it('leaves a budget that setup can start again from', () => {
		const db = twoHouseholds();
		eraseBudget(db, 1);

		expect(getBalance(db, 1)).toBeNull();
		expect(ensureAccount(db, 1).ownerId).toBe(1);
		seedHousehold(db, { ownerId: 1, production: false, now: NOW });
		expect(buildHome(db, 1, NOW).state).toBe('ready');
	});

	it('does nothing to an owner who has no budget yet', () => {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		eraseBudget(db, 1);
		expect(getOwner(db, 1)).toEqual({ currency: null, timeZone: null, setupStep: 'welcome' });
	});
});
