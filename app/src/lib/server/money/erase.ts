/**
 * Start over: deletes the owner's budget and puts them back at the start of first-run setup. The
 * account, its schedule and balance, every override and paid mark, every logged expense, every check-in and what it
 * confirmed, every loan and its balances all go, in one transaction: either
 * all of it is gone or none of it is.
 *
 * Signing in is left exactly as it was: the password, the devices (passkeys), the recovery codes and
 * every session. The owner stays signed in and sets up again from the welcome step.
 *
 * Ids do NOT start again from 1: Postgres keeps counting (a sequence never rewinds), so the new
 * budget's first loan has a new id, and a page still open on another device finds nothing under the
 * old one instead of acting on whatever row took its place.
 */
import { eq, inArray, or } from 'drizzle-orm';
import { sessionExists } from '#lib/server/auth/session.ts';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import {
	account,
	checkIn,
	expense,
	loan,
	loanBalance,
	occurrenceOverride,
	owner,
	paidMark,
	paymentConfirmation,
	scheduleItem
} from '#lib/server/db/schema.ts';

/** The owner's settings as the first registration leaves them (the defaults in schema.ts). */
const FRESH_OWNER = {
	currency: null,
	timeZone: null,
	setupStep: 'welcome',
	reminderTime: '09:00'
} as const;

/** How many rows went, for the log line that marks the moment (a backup restore needs it). */
export type Erased = { items: number; checkIns: number; loans: number };

/** The handle a transaction callback receives: what a caller's own transaction hands to `eraseBudgetIn`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The session that asked for the erase (or restore) ended before it ran: nothing was changed. */
export class SessionEndedError extends Error {
	constructor() {
		super('This device was signed out, so nothing was changed.');
	}
}

/**
 * `sessionId` is the session making the request (the hash the cookie maps to). It is checked INSIDE
 * the transaction, after the owner lock, so a "sign out everywhere" or a password change that lands
 * while the request waits ends it: the erase then refuses and changes nothing.
 */
export async function eraseBudget(db: Db, ownerId: number, sessionId?: string): Promise<Erased> {
	return db.transaction((tx) => eraseBudgetIn(tx, ownerId, sessionId));
}

/**
 * The same erase, inside a transaction the caller opened (a restore erases and then imports in one,
 * so a refused import leaves the old budget).
 */
export async function eraseBudgetIn(tx: Tx, ownerId: number, sessionId?: string): Promise<Erased> {
	// SQLite took its write lock before the first read (`immediate`), so no other writer could slip in
	// between the ids read here and the deletes below. Postgres does not: the owner row lock does the
	// same job, held until this transaction ends, for the erase and for a restore around it.
	await lockOwner(tx, ownerId);
	if (sessionId !== undefined && !(await sessionExists(tx, sessionId))) {
		throw new SessionEndedError();
	}
	const ids = <T extends { id: number }>(rows: T[]) => rows.map((r) => r.id);
	const accounts = ids(
		await tx.select({ id: account.id }).from(account).where(eq(account.ownerId, ownerId))
	);
	const items = ids(
		await tx
			.select({ id: scheduleItem.id })
			.from(scheduleItem)
			.where(inArray(scheduleItem.accountId, accounts))
	);
	const loans = ids(await tx.select({ id: loan.id }).from(loan).where(eq(loan.ownerId, ownerId)));
	const checkIns = ids(
		await tx.select({ id: checkIn.id }).from(checkIn).where(eq(checkIn.ownerId, ownerId))
	);

	// What hangs off the rows below first, so nothing is ever left pointing at a deleted row.
	await tx
		.delete(loanBalance)
		.where(or(inArray(loanBalance.loanId, loans), inArray(loanBalance.checkInId, checkIns)));
	await tx
		.delete(paymentConfirmation)
		.where(
			or(
				inArray(paymentConfirmation.checkInId, checkIns),
				inArray(paymentConfirmation.itemId, items)
			)
		);
	await tx.delete(expense).where(eq(expense.ownerId, ownerId));
	await tx.delete(paidMark).where(inArray(paidMark.itemId, items));
	await tx.delete(occurrenceOverride).where(inArray(occurrenceOverride.itemId, items));
	const loansGone = await tx
		.delete(loan)
		.where(eq(loan.ownerId, ownerId))
		.returning({ id: loan.id });
	const checkInsGone = await tx
		.delete(checkIn)
		.where(eq(checkIn.ownerId, ownerId))
		.returning({ id: checkIn.id });
	const itemsGone = await tx
		.delete(scheduleItem)
		.where(inArray(scheduleItem.id, items))
		.returning({ id: scheduleItem.id });
	await tx.delete(account).where(eq(account.ownerId, ownerId));

	await tx.update(owner).set(FRESH_OWNER).where(eq(owner.id, ownerId));
	return {
		items: itemsGone.length,
		checkIns: checkInsGone.length,
		loans: loansGone.length
	};
}
