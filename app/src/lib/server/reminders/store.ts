/**
 * The reminder time: when the alarm on each payday in the calendar file goes off (ADR-0016). Nothing
 * is sent from the server; the owner's calendar app does the reminding.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';

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
