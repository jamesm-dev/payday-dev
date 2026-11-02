/*
 * The payday reminder job with a fake clock and a fake sender. The fixture household is paid every
 * 14 days on Fridays; 2026-10-16 is a payday, 2026-10-17 is not. Time zone UTC unless a test sets one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { minor } from '#lib/domain/money.ts';
import { open } from '#lib/server/db/open.ts';
import { owner, pushSubscription, reminderSent } from '#lib/server/db/schema.ts';
import { eraseBudget } from '#lib/server/money/erase.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';
import { saveRegion, setBalance } from '#lib/server/money/store.ts';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { localTime, runAllReminders, runReminders, startReminderJob, type Sender } from './job.ts';
import { listSubscriptions, reminderStatus, saveSubscription, setReminderTime } from './store.ts';

const at = (iso: string) => new Date(iso);

function household() {
	const db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
	seedHousehold(db, { production: false, now: at('2026-10-16T00:00:00Z'), loans: false });
	setBalance(db, 1, minor(150000), d('2026-10-02'));
	return db;
}

const phone = (n: number) => ({
	endpoint: `https://push.example.invalid/phone-${n}`,
	p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
	auth: 'tBHItJI5svbpez7KI4CCXg'
});

/** A sender that records who it was asked to reach and fails for chosen phones. */
function fakeSender(failures: Record<string, { statusCode?: number }> = {}) {
	const calls: string[] = [];
	const send: Sender = async (sub) => {
		calls.push(sub.endpoint);
		const failure = failures[sub.endpoint];
		if (failure) throw Object.assign(new Error('push failed'), failure);
	};
	return { send, calls };
}

const deps = (db: ReturnType<typeof household>, now: string, send: Sender) => ({
	db,
	now: () => at(now),
	send
});

describe('TSK-DC74DF a reminder is sent on each payday at the chosen time', () => {
	it('sends to every phone at the reminder time, then records the day', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		saveSubscription(db, 1, phone(2), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender();

		const result = await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1);

		expect(result).toEqual({ skipped: null, sent: 2, removed: 0, failed: 0 });
		expect(calls).toEqual([phone(1).endpoint, phone(2).endpoint]);
		expect(db.select().from(reminderSent).all()).toEqual([
			{ paydayDate: '2026-10-16', sentAt: '2026-10-16T09:00:00.000Z' }
		]);
		expect(listSubscriptions(db, 1).every((s) => s.lastSuccessAt !== null)).toBe(true);
	});

	it('sends once per payday: later checks the same day, and a restart, send nothing', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender();

		await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1);
		for (const time of ['09:01', '12:00', '23:59']) {
			const again = await runReminders(deps(db, `2026-10-16T${time}:00Z`, send), 1);
			expect(again.skipped).toBe('already-sent');
		}
		expect(calls).toHaveLength(1);
	});

	it('sends again on the next payday', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender();
		await runReminders(deps(db, '2026-10-16T09:30:00Z', send), 1);
		await runReminders(deps(db, '2026-10-30T09:30:00Z', send), 1);
		expect(calls).toHaveLength(2);
		expect(
			db
				.select()
				.from(reminderSent)
				.all()
				.map((r) => r.paydayDate)
		).toEqual(['2026-10-16', '2026-10-30']);
	});

	it('skips a day that is not a payday', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender();
		for (const day of ['2026-10-15', '2026-10-17', '2026-10-23', '2026-10-29']) {
			const result = await runReminders(deps(db, `${day}T12:00:00Z`, send), 1);
			expect(result.skipped, day).toBe('not-payday');
		}
		expect(calls).toEqual([]);
		expect(db.select().from(reminderSent).all()).toEqual([]);
	});

	it('skips a time before the reminder time, then sends once it passes', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender();
		expect((await runReminders(deps(db, '2026-10-16T08:59:00Z', send), 1)).skipped).toBe(
			'too-early'
		);
		expect(calls).toEqual([]);
		expect((await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1)).sent).toBe(1);
	});

	it('uses the time the owner chose', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		setReminderTime(db, 1, '17:45');
		const { send, calls } = fakeSender();
		expect((await runReminders(deps(db, '2026-10-16T17:44:00Z', send), 1)).skipped).toBe(
			'too-early'
		);
		expect((await runReminders(deps(db, '2026-10-16T17:45:00Z', send), 1)).sent).toBe(1);
		expect(calls).toHaveLength(1);
	});

	it('reads the day and the time in the owner time zone, not the server one', async () => {
		const db = household();
		saveRegion(db, 1, 'USD', 'America/New_York');
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender();
		// 12:00Z on Oct 16 is 08:00 in New York (EDT, UTC-4): payday, but before 09:00.
		expect((await runReminders(deps(db, '2026-10-16T12:00:00Z', send), 1)).skipped).toBe(
			'too-early'
		);
		// 13:00Z is 09:00 there.
		expect((await runReminders(deps(db, '2026-10-16T13:00:00Z', send), 1)).sent).toBe(1);
		expect(calls).toHaveLength(1);
		// 02:00Z on Oct 17 is still Friday evening in New York, and already recorded.
		expect((await runReminders(deps(db, '2026-10-17T02:00:00Z', send), 1)).skipped).toBe(
			'already-sent'
		);
		// 02:00Z on Oct 30 is Oct 29 22:00 in New York: not a payday there yet.
		expect((await runReminders(deps(db, '2026-10-30T02:00:00Z', send), 1)).skipped).toBe(
			'not-payday'
		);
	});

	it('sends nothing, and records nothing, when no phone has reminders on', async () => {
		const db = household();
		const { send, calls } = fakeSender();
		const result = await runReminders(deps(db, '2026-10-16T10:00:00Z', send), 1);
		expect(result.skipped).toBe('no-phones');
		expect(calls).toEqual([]);
		expect(db.select().from(reminderSent).all()).toEqual([]);
		// A phone that turns reminders on later the same day is reminded at the next check.
		saveSubscription(db, 1, phone(1), at('2026-10-16T10:05:00Z'));
		expect((await runReminders(deps(db, '2026-10-16T10:06:00Z', send), 1)).sent).toBe(1);
	});

	it('does nothing until first-run setup is finished', async () => {
		const db = household();
		db.update(owner).set({ setupStep: 'bills' }).where(eq(owner.id, 1)).run();
		const { send, calls } = fakeSender();
		expect((await runReminders(deps(db, '2026-10-16T10:00:00Z', send), 1)).skipped).toBe('setup');
		expect(calls).toEqual([]);
	});

	it('localTime reads a 24-hour clock in the zone, midnight as 00:00', () => {
		expect(localTime('UTC', at('2026-10-16T00:05:00Z'))).toBe('00:05');
		expect(localTime('America/New_York', at('2026-10-16T13:00:00Z'))).toBe('09:00');
		expect(localTime('Asia/Tokyo', at('2026-10-16T15:00:00Z'))).toBe('00:00');
	});
});

describe('TSK-E54285 an expired or rejected subscription is removed, and reminders show as off', () => {
	for (const statusCode of [404, 410]) {
		it(`a ${statusCode} deletes the subscription and the status says the phone stopped accepting`, async () => {
			const db = household();
			saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
			saveSubscription(db, 1, phone(2), at('2026-10-01T00:00:00Z'));
			const { send } = fakeSender({ [phone(1).endpoint]: { statusCode } });

			const result = await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1);

			expect(result).toMatchObject({ sent: 1, removed: 1, failed: 0 });
			expect(listSubscriptions(db, 1).map((s) => s.endpoint)).toEqual([phone(2).endpoint]);
			// One phone still works, so reminders are on.
			expect(reminderStatus(db, 1, { configured: true }).state).toBe('on');
		});

		it(`with the only phone gone (${statusCode}), the status is "expired", and it clears on subscribing again`, async () => {
			const db = household();
			saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
			const { send } = fakeSender({ [phone(1).endpoint]: { statusCode } });
			await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1);

			expect(listSubscriptions(db, 1)).toEqual([]);
			expect(reminderStatus(db, 1, { configured: true })).toMatchObject({ state: 'expired' });

			saveSubscription(db, 1, phone(3), at('2026-10-17T00:00:00Z'));
			expect(reminderStatus(db, 1, { configured: true }).state).toBe('on');
		});
	}

	it('another failure keeps the subscription and records when and why it failed', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send } = fakeSender({ [phone(1).endpoint]: { statusCode: 500 } });

		const result = await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1);

		expect(result).toMatchObject({ sent: 0, removed: 0, failed: 1 });
		const [row] = listSubscriptions(db, 1);
		expect(row.failedAt).toBe('2026-10-16T09:00:00.000Z');
		expect(row.failureReason).toBe('The push service answered 500.');
		expect(reminderStatus(db, 1, { configured: true })).toMatchObject({
			state: 'on',
			troubled: true
		});
	});

	it('a failure with no status at all (the network) is kept too, and does not stop the others', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		saveSubscription(db, 1, phone(2), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender({ [phone(1).endpoint]: {} });
		const result = await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1);
		expect(result).toMatchObject({ sent: 1, failed: 1 });
		expect(calls).toHaveLength(2);
		expect(listSubscriptions(db, 1)).toHaveLength(2);
	});

	it('a later success clears the failure', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		await runReminders(
			deps(
				db,
				'2026-10-16T09:00:00Z',
				fakeSender({ [phone(1).endpoint]: { statusCode: 500 } }).send
			),
			1
		);
		await runReminders(deps(db, '2026-10-30T09:00:00Z', fakeSender().send), 1);
		const [row] = listSubscriptions(db, 1);
		expect(row.failedAt).toBeNull();
		expect(row.lastSuccessAt).toBe('2026-10-30T09:00:00.000Z');
	});

	it('turning reminders off on purpose is "off", never "expired"', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { removeAllSubscriptions } = await import('./store.ts');
		removeAllSubscriptions(db, 1);
		expect(reminderStatus(db, 1, { configured: true }).state).toBe('off');
		expect(db.select().from(pushSubscription).all()).toEqual([]);
	});

	it('with no VAPID keys the status is unavailable and says why', () => {
		const db = household();
		expect(
			reminderStatus(db, 1, { configured: false, reason: 'Reminders are not set up.' })
		).toEqual({ state: 'unavailable', reason: 'Reminders are not set up.' });
	});
});

describe('TSK-DC74DF the job runs on a timer that does not keep the process alive', () => {
	afterEach(() => vi.useRealTimers());

	it('checks at once and then every minute, and stops when told to', async () => {
		vi.useFakeTimers({ now: at('2026-10-16T09:00:00Z') });
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send, calls } = fakeSender();
		const stop = startReminderJob({ db, now: () => new Date(), send }, 60_000);
		await vi.advanceTimersByTimeAsync(0);
		expect(calls).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(3 * 60_000);
		// Recorded on the first check, so the next three send nothing.
		expect(calls).toHaveLength(1);
		stop();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('does not throw out of the timer when a check fails, and logs it', async () => {
		vi.useFakeTimers({ now: at('2026-10-16T09:00:00Z') });
		const db = household();
		const lines: string[] = [];
		const stop = startReminderJob(
			{
				db,
				now: () => {
					throw new Error('clock broke');
				},
				send: fakeSender().send,
				log: (line) => lines.push(line.msg)
			},
			60_000
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(lines).toContain('reminder check failed');
		stop();
	});

	it('runAllReminders checks every owner', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		const { send } = fakeSender();
		const results = await runAllReminders(deps(db, '2026-10-16T09:00:00Z', send));
		expect(results.map((r) => r.sent)).toEqual([1]);
	});
});

describe('starting over while a reminder is on its way', () => {
	it('records nothing about a payday of the deleted budget', async () => {
		const db = household();
		saveSubscription(db, 1, phone(1), at('2026-10-01T00:00:00Z'));
		// The owner starts over while the push service is still answering; then it says the phone is gone.
		const send: Sender = async () => {
			eraseBudget(db, 1);
			throw Object.assign(new Error('push failed'), { statusCode: 410 });
		};

		await runReminders(deps(db, '2026-10-16T09:00:00Z', send), 1);

		// No "your phone stopped accepting reminders" for the fresh start, and no payday marked as
		// already reminded about for the schedule set up next.
		expect(db.select().from(owner).get()!.remindersExpiredAt).toBeNull();
		expect(db.select().from(reminderSent).all()).toEqual([]);
	});
});
