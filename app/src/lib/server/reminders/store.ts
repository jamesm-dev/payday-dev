/**
 * Reminder settings and subscriptions. A subscription is one phone's address for pushes; the
 * endpoint is unique, so subscribing again from the same phone replaces its keys, not adds a row.
 */
import { desc, eq } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner, pushSubscription, reminderSent } from '#lib/server/db/schema.ts';
import type { SubscriptionInput } from './validate.ts';

export type Subscription = typeof pushSubscription.$inferSelect;

export function getReminderTime(db: Db, ownerId: number): string {
	const row = db
		.select({ time: owner.reminderTime })
		.from(owner)
		.where(eq(owner.id, ownerId))
		.get();
	return row?.time ?? '09:00';
}

export function setReminderTime(db: Db, ownerId: number, time: string): void {
	db.update(owner).set({ reminderTime: time }).where(eq(owner.id, ownerId)).run();
}

/** Saves the phone's subscription, and clears the note that an earlier one stopped working. */
export function saveSubscription(
	db: Db,
	ownerId: number,
	input: SubscriptionInput,
	now: Date
): void {
	db.transaction((tx) => {
		tx.insert(pushSubscription)
			.values({
				ownerId,
				endpoint: input.endpoint,
				p256dh: input.p256dh,
				auth: input.auth,
				createdAt: now.toISOString()
			})
			.onConflictDoUpdate({
				target: pushSubscription.endpoint,
				set: {
					ownerId,
					p256dh: input.p256dh,
					auth: input.auth,
					failedAt: null,
					failureReason: null
				}
			})
			.run();
		tx.update(owner).set({ remindersExpiredAt: null }).where(eq(owner.id, ownerId)).run();
	});
}

export function listSubscriptions(db: Db, ownerId: number): Subscription[] {
	return db
		.select()
		.from(pushSubscription)
		.where(eq(pushSubscription.ownerId, ownerId))
		.orderBy(pushSubscription.id)
		.all();
}

/** The owner turned reminders off on purpose: every subscription goes, and nothing is "expired". */
export function removeAllSubscriptions(db: Db, ownerId: number): void {
	db.transaction((tx) => {
		tx.delete(pushSubscription).where(eq(pushSubscription.ownerId, ownerId)).run();
		tx.update(owner).set({ remindersExpiredAt: null }).where(eq(owner.id, ownerId)).run();
	});
}

export type ReminderStatus =
	| { state: 'unavailable'; reason: string }
	/** Subscribed. `troubled` when the last send to a phone failed for a reason that may pass. */
	| { state: 'on'; phones: number; troubled: boolean; lastSent: string | null }
	| { state: 'off'; lastSent: string | null }
	/** A push service said the subscription is gone and it was removed. */
	| { state: 'expired'; lastSent: string | null };

export function lastReminderSent(db: Db): string | null {
	return (
		db.select().from(reminderSent).orderBy(desc(reminderSent.sentAt)).limit(1).get()?.sentAt ?? null
	);
}

export function reminderStatus(
	db: Db,
	ownerId: number,
	vapid: { configured: true } | { configured: false; reason: string }
): ReminderStatus {
	if (!vapid.configured) return { state: 'unavailable', reason: vapid.reason };
	const lastSent = lastReminderSent(db);
	const subs = listSubscriptions(db, ownerId);
	if (subs.length > 0) {
		return {
			state: 'on',
			phones: subs.length,
			troubled: subs.some((s) => s.failedAt !== null),
			lastSent
		};
	}
	const row = db
		.select({ expired: owner.remindersExpiredAt })
		.from(owner)
		.where(eq(owner.id, ownerId))
		.get();
	return row?.expired ? { state: 'expired', lastSent } : { state: 'off', lastSent };
}
