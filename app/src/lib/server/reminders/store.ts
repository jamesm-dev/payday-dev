/**
 * Reminder settings and subscriptions. A subscription is one phone's address for pushes; the
 * endpoint is unique, so subscribing again from the same phone replaces its keys, not adds a row.
 */
import { desc, eq } from 'drizzle-orm';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner, pushSubscription, reminderSent } from '#lib/server/db/schema.ts';
import type { SubscriptionInput } from './validate.ts';

export type Subscription = typeof pushSubscription.$inferSelect;

export async function getReminderTime(db: Db, ownerId: number): Promise<string> {
	const [row] = await db
		.select({ time: owner.reminderTime })
		.from(owner)
		.where(eq(owner.id, ownerId));
	return row?.time ?? '09:00';
}

export async function setReminderTime(db: Db, ownerId: number, time: string): Promise<void> {
	await db.update(owner).set({ reminderTime: time }).where(eq(owner.id, ownerId));
}

/** Saves the phone's subscription, and clears the note that an earlier one stopped working. */
export async function saveSubscription(
	db: Db,
	ownerId: number,
	input: SubscriptionInput,
	now: Date
): Promise<void> {
	await db.transaction(async (tx) => {
		// The owner row first, as Start over does, so the two never wait on each other's rows.
		await lockOwner(tx, ownerId);
		await tx
			.insert(pushSubscription)
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
			});
		await tx.update(owner).set({ remindersExpiredAt: null }).where(eq(owner.id, ownerId));
	});
}

export function listSubscriptions(db: Db, ownerId: number): Promise<Subscription[]> {
	return db
		.select()
		.from(pushSubscription)
		.where(eq(pushSubscription.ownerId, ownerId))
		.orderBy(pushSubscription.id);
}

/** The owner turned reminders off on purpose: every subscription goes, and nothing is "expired". */
export async function removeAllSubscriptions(db: Db, ownerId: number): Promise<void> {
	await db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		await tx.delete(pushSubscription).where(eq(pushSubscription.ownerId, ownerId));
		await tx.update(owner).set({ remindersExpiredAt: null }).where(eq(owner.id, ownerId));
	});
}

export type ReminderStatus =
	| { state: 'unavailable'; reason: string }
	/** Subscribed. `troubled` when the last send to a phone failed for a reason that may pass. */
	| { state: 'on'; phones: number; troubled: boolean; lastSent: string | null }
	| { state: 'off'; lastSent: string | null }
	/** A push service said the subscription is gone and it was removed. */
	| { state: 'expired'; lastSent: string | null };

export async function lastReminderSent(db: Db): Promise<string | null> {
	const [row] = await db.select().from(reminderSent).orderBy(desc(reminderSent.sentAt)).limit(1);
	return row?.sentAt ?? null;
}

export async function reminderStatus(
	db: Db,
	ownerId: number,
	vapid: { configured: true } | { configured: false; reason: string }
): Promise<ReminderStatus> {
	if (!vapid.configured) return { state: 'unavailable', reason: vapid.reason };
	const lastSent = await lastReminderSent(db);
	const subs = await listSubscriptions(db, ownerId);
	if (subs.length > 0) {
		return {
			state: 'on',
			phones: subs.length,
			troubled: subs.some((s) => s.failedAt !== null),
			lastSent
		};
	}
	const [row] = await db
		.select({ expired: owner.remindersExpiredAt })
		.from(owner)
		.where(eq(owner.id, ownerId));
	return row?.expired ? { state: 'expired', lastSent } : { state: 'off', lastSent };
}
