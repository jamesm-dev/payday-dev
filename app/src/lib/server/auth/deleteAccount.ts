/**
 * Delete my account: everything of one person, in ONE transaction under their owner lock. Either all
 * of it is gone or none of it is. There is no undo; the only way back is a backup the person
 * downloaded first.
 *
 * What goes, in this order:
 *  - the budget, through the same code Start over uses (`eraseBudgetIn`);
 *  - the sealed values and challenges that belong to their sessions;
 *  - their sessions (every device is signed out);
 *  - their passkeys and recovery codes;
 *  - the wrong-password counter kept for their email (`account-brake`, keyed by the hash of the
 *    address, never the address);
 *  - the email-change counter kept for their account number (`email-change-account`);
 *  - the owner row itself: the email, the password hash and the backup id.
 *
 * Counters kept per network address (`sign-in-failures`, `sign-up-address` and the like) are not
 * about a person: they hold an address, last minutes to an hour, and nothing in them says whose.
 *
 * Nothing can write for the person afterwards. No table has a foreign key to `owner`, so a request
 * that was already running could still insert a row for the deleted id. Every writer takes
 * `lockOwner` first, and `lockOwner` refuses once the owner row is gone (db/lock.ts); this
 * transaction holds that same row lock until it commits, so such a writer waits, then stops.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import {
	attemptCounter,
	authChallenge,
	expenseReceipt,
	oneTimeSlot,
	owner,
	passkey,
	recoveryCode,
	session
} from '#lib/server/db/schema.ts';
import { eraseBudgetIn, type Erased } from '#lib/server/money/erase.ts';
import { ACCOUNT_BRAKE_SCOPE } from './failureBrake.ts';
import { EMAIL_CHANGE_ACCOUNT_SCOPE } from './ownerEmail.ts';
import { accountKeyOf } from './signInLookup.ts';

export type AccountDeleted = Erased & { sessions: number; passkeys: number };

/**
 * `sessionId` is the session asking: checked inside the transaction (after the lock), so a "sign out
 * everywhere" that lands while this waits ends it and nothing is deleted. Throws `SessionEndedError`.
 * Throws a 401 when the account is already gone.
 */
export async function deleteAccount(
	db: Db,
	ownerId: number,
	sessionId?: string
): Promise<AccountDeleted> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const [who] = await tx.select({ email: owner.email }).from(owner).where(eq(owner.id, ownerId));

		// The budget first; it also checks the asking session still exists.
		const erased = await eraseBudgetIn(tx, ownerId, sessionId);

		const sessions = (
			await tx.select({ id: session.id }).from(session).where(eq(session.ownerId, ownerId))
		).map((row) => row.id);
		await tx.delete(authChallenge).where(inArray(authChallenge.bound, sessions));
		await tx.delete(oneTimeSlot).where(inArray(oneTimeSlot.sessionId, sessions));
		await tx.delete(session).where(eq(session.ownerId, ownerId));
		const passkeys = await tx
			.delete(passkey)
			.where(eq(passkey.ownerId, ownerId))
			.returning({ id: passkey.id });
		await tx.delete(recoveryCode).where(eq(recoveryCode.ownerId, ownerId));
		// The ids of expenses sent from a phone (ADR-0029): no money, but still this person's.
		await tx.delete(expenseReceipt).where(eq(expenseReceipt.ownerId, ownerId));
		await tx
			.delete(attemptCounter)
			.where(
				and(
					eq(attemptCounter.scope, ACCOUNT_BRAKE_SCOPE),
					eq(attemptCounter.key, accountKeyOf(who?.email ?? null))
				)
			);
		await tx
			.delete(attemptCounter)
			.where(
				and(
					eq(attemptCounter.scope, EMAIL_CHANGE_ACCOUNT_SCOPE),
					eq(attemptCounter.key, String(ownerId))
				)
			);
		await tx.delete(owner).where(eq(owner.id, ownerId));
		return { ...erased, sessions: sessions.length, passkeys: passkeys.length };
	});
}
