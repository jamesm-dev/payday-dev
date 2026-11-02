/**
 * The payday reminder job. Every tick asks one question: is it payday in the owner's time zone, is
 * the local time at or past their reminder time, and has today's reminder not been recorded? If so
 * it sends to every phone, then records the day so a restart or the next tick never sends it again.
 *
 * The clock and the sender are injected, so tests drive it with a fake of each. It only ever runs
 * inside the always-on server process (ADR-0005: the machine must never auto-stop).
 */
import { eq } from 'drizzle-orm';
import { paydays } from '#lib/domain/periods.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner, pushSubscription, reminderSent } from '#lib/server/db/schema.ts';
import type { Logger } from '#lib/server/log.ts';
import { getOwner, loadPlan } from '#lib/server/money/store.ts';
import { listSubscriptions } from './store.ts';

/** Sends one reminder to one phone. Rejects with an error carrying `statusCode` when refused. */
export type Sender = (subscription: {
	endpoint: string;
	p256dh: string;
	auth: string;
}) => Promise<void>;

export type JobDeps = {
	db: Db;
	now: () => Date;
	send: Sender;
	log?: Logger;
};

export type TickResult = {
	/** Why nothing was sent, or null when a reminder went out. */
	skipped: 'not-payday' | 'too-early' | 'already-sent' | 'no-phones' | 'setup' | null;
	sent: number;
	removed: number;
	failed: number;
};

const nothing = (skipped: TickResult['skipped']): TickResult => ({
	skipped,
	sent: 0,
	removed: 0,
	failed: 0
});

/** `HH:MM` on a 24-hour clock, in an IANA time zone. */
export function localTime(timeZone: string, now: Date): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);
	const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
	return `${pick('hour')}:${pick('minute')}`;
}

const statusOf = (error: unknown): number | null => {
	const code = (error as { statusCode?: unknown } | null)?.statusCode;
	return typeof code === 'number' ? code : null;
};

/** One check. Safe to call as often as you like: a recorded day is never sent twice. */
export async function runReminders(deps: JobDeps, ownerId: number): Promise<TickResult> {
	const { db, send } = deps;
	const now = deps.now();
	const plan = loadPlan(db, ownerId, now);
	if (plan.settings.setupStep !== null) return nothing('setup');

	const today = plan.today;
	if (paydays(plan.items, plan.overrides, today, today).length === 0) return nothing('not-payday');

	const row = db
		.select({ time: owner.reminderTime })
		.from(owner)
		.where(eq(owner.id, ownerId))
		.get();
	const remindAt = row?.time ?? '09:00';
	if (localTime(plan.settings.timeZone ?? 'UTC', now) < remindAt) return nothing('too-early');

	if (db.select().from(reminderSent).where(eq(reminderSent.paydayDate, today)).get()) {
		return nothing('already-sent');
	}
	const phones = listSubscriptions(db, ownerId);
	if (phones.length === 0) return nothing('no-phones');

	// Each send is awaited, and the owner can start over (money/erase.ts) meanwhile. After that this
	// payday belongs to a budget that no longer exists, so nothing more is written about it.
	const erased = () => getOwner(db, ownerId).setupStep !== null;
	const result: TickResult = { skipped: null, sent: 0, removed: 0, failed: 0 };
	for (const phone of phones) {
		try {
			await send({ endpoint: phone.endpoint, p256dh: phone.p256dh, auth: phone.auth });
			result.sent += 1;
			db.update(pushSubscription)
				.set({ lastSuccessAt: now.toISOString(), failedAt: null, failureReason: null })
				.where(eq(pushSubscription.id, phone.id))
				.run();
		} catch (error) {
			const status = statusOf(error);
			if (status === 404 || status === 410) {
				// The push service says this phone is gone for good. Forget it, and remember why reminders
				// are off, so the settings page can say so.
				db.delete(pushSubscription).where(eq(pushSubscription.id, phone.id)).run();
				if (!erased()) {
					db.update(owner)
						.set({ remindersExpiredAt: now.toISOString() })
						.where(eq(owner.id, ownerId))
						.run();
				}
				result.removed += 1;
				deps.log?.({ level: 'warn', msg: 'reminder subscription expired and removed', status });
			} else {
				const reason = status
					? `The push service answered ${status}.`
					: 'The push service did not answer.';
				db.update(pushSubscription)
					.set({ failedAt: now.toISOString(), failureReason: reason })
					.where(eq(pushSubscription.id, phone.id))
					.run();
				result.failed += 1;
				deps.log?.({ level: 'warn', msg: 'reminder could not be sent', status });
			}
		}
	}

	if (erased()) {
		deps.log?.({
			level: 'info',
			msg: 'payday reminder not recorded: the budget was deleted meanwhile'
		});
		return result;
	}
	db.insert(reminderSent)
		.values({ paydayDate: today, sentAt: now.toISOString() })
		.onConflictDoNothing()
		.run();
	deps.log?.({
		level: 'info',
		msg: 'payday reminder sent',
		payday: today,
		sent: result.sent,
		removed: result.removed,
		failed: result.failed
	});
	return result;
}

/** Checks every owner (there is one). */
export async function runAllReminders(deps: JobDeps): Promise<TickResult[]> {
	const owners = deps.db.select({ id: owner.id }).from(owner).all();
	const results: TickResult[] = [];
	for (const { id } of owners) results.push(await runReminders(deps, id));
	return results;
}

/**
 * Starts the job: one check a minute on a timer that does not keep the process alive. A tick that
 * is still sending when the next is due is skipped, and a tick that throws is logged, not fatal.
 * Returns a function that stops it.
 */
export function startReminderJob(deps: JobDeps, intervalMs = 60_000): () => void {
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			await runAllReminders(deps);
		} catch (error) {
			deps.log?.({
				level: 'error',
				msg: 'reminder check failed',
				error: error instanceof Error ? error.message : String(error)
			});
		} finally {
			running = false;
		}
	};
	const timer = setInterval(() => void tick(), intervalMs);
	timer.unref();
	void tick();
	return () => clearInterval(timer);
}
