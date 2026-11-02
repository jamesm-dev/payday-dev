/**
 * Start over: deletes the owner's budget and puts them back at the start of first-run setup. The
 * account, its schedule and balance, every override and paid mark, every logged expense, every check-in and what it
 * confirmed, every loan and its balances, and the reminders all go, in one transaction: either
 * all of it is gone or none of it is.
 *
 * Signing in is left exactly as it was: the password, the devices (passkeys), the recovery codes and
 * every session. The owner stays signed in and sets up again from the welcome step.
 *
 * Ids start again from 1 afterwards (the tables have no AUTOINCREMENT), so the new budget's first
 * loan is loan 1 again. Nothing left in the database points at an old id, but a page still open on
 * another device does: an action sent from it acts on whatever row now has that id.
 */
import { eq, inArray, or } from 'drizzle-orm';
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
	pushSubscription,
	reminderSent,
	scheduleItem
} from '#lib/server/db/schema.ts';

/** The owner's settings as the first registration leaves them (the defaults in schema.ts). */
const FRESH_OWNER = {
	currency: null,
	timeZone: null,
	setupStep: 'welcome',
	reminderTime: '09:00',
	remindersExpiredAt: null
} as const;

/** How many rows went, for the log line that marks the moment (a backup restore needs it). */
export type Erased = { items: number; checkIns: number; loans: number; phones: number };

export function eraseBudget(db: Db, ownerId: number): Erased {
	// Immediate: the write lock is taken before the first read, so no other writer can slip in between
	// the ids read here and the deletes below.
	return db.transaction(
		(tx) => {
			const ids = <T extends { id: number }>(rows: T[]) => rows.map((r) => r.id);
			const accounts = ids(
				tx.select({ id: account.id }).from(account).where(eq(account.ownerId, ownerId)).all()
			);
			const items = ids(
				tx
					.select({ id: scheduleItem.id })
					.from(scheduleItem)
					.where(inArray(scheduleItem.accountId, accounts))
					.all()
			);
			const loans = ids(
				tx.select({ id: loan.id }).from(loan).where(eq(loan.ownerId, ownerId)).all()
			);
			const checkIns = ids(
				tx.select({ id: checkIn.id }).from(checkIn).where(eq(checkIn.ownerId, ownerId)).all()
			);

			// What hangs off the rows below first, so nothing is ever left pointing at a deleted row.
			tx.delete(loanBalance)
				.where(or(inArray(loanBalance.loanId, loans), inArray(loanBalance.checkInId, checkIns)))
				.run();
			tx.delete(paymentConfirmation)
				.where(
					or(
						inArray(paymentConfirmation.checkInId, checkIns),
						inArray(paymentConfirmation.itemId, items)
					)
				)
				.run();
			tx.delete(expense).where(eq(expense.ownerId, ownerId)).run();
			tx.delete(paidMark).where(inArray(paidMark.itemId, items)).run();
			tx.delete(occurrenceOverride).where(inArray(occurrenceOverride.itemId, items)).run();
			const loansGone = tx.delete(loan).where(eq(loan.ownerId, ownerId)).run().changes;
			const checkInsGone = tx.delete(checkIn).where(eq(checkIn.ownerId, ownerId)).run().changes;
			const itemsGone = tx
				.delete(scheduleItem)
				.where(inArray(scheduleItem.id, items))
				.run().changes;
			tx.delete(account).where(eq(account.ownerId, ownerId)).run();

			// Reminders: no phone is sent one until the owner turns them on again. The paydays already
			// reminded about belong to the old schedule, so a new one is reminded about from scratch.
			const phonesGone = tx
				.delete(pushSubscription)
				.where(eq(pushSubscription.ownerId, ownerId))
				.run().changes;
			tx.delete(reminderSent).run();

			tx.update(owner).set(FRESH_OWNER).where(eq(owner.id, ownerId)).run();
			return { items: itemsGone, checkIns: checkInsGone, loans: loansGone, phones: phonesGone };
		},
		{ behavior: 'immediate' }
	);
}
