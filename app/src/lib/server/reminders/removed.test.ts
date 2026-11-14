/*
 * ADR-0016: the reminder is the calendar file. Nothing on the server sends a push, so no table,
 * key, dependency or route for one may come back by accident.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as schema from '#lib/server/db/schema.ts';

const appFile = (path: string) => new URL(`../../../../${path}`, import.meta.url);
const read = (path: string) => readFileSync(appFile(path), 'utf8');

describe('TSK-6F8EC9 push reminders are gone, the calendar file stays', () => {
	it('has no push tables or expiry column in the schema or any migration', () => {
		expect(Object.keys(schema)).not.toEqual(
			expect.arrayContaining([expect.stringMatching(/push|reminderSent/i)])
		);
		expect(schema.owner.reminderTime.name).toBe('reminder_time');
		expect('remindersExpiredAt' in schema.owner).toBe(false);
		for (const file of readdirSync(appFile('drizzle')).filter((f) => f.endsWith('.sql'))) {
			expect(read(`drizzle/${file}`), file).not.toMatch(
				/push_subscription|reminder_sent|reminders_expired_at/
			);
		}
	});

	it('has no VAPID or Web Push dependency, key or job', () => {
		const pkg = JSON.parse(read('package.json')) as Record<string, Record<string, string>>;
		const all = { ...pkg.dependencies, ...pkg.devDependencies };
		expect(Object.keys(all).filter((name) => /web-push/.test(name))).toEqual([]);
		expect(read('src/env.ts')).not.toMatch(/VAPID|LITESTREAM/);
		for (const file of [
			'src/lib/server/reminders/job.ts',
			'src/lib/server/reminders/webpush.ts',
			'src/lib/server/reminders/vapid.ts',
			'src/routes/settings/reminders/subscribe/+server.ts',
			'src/service-worker/push.ts'
		]) {
			expect(existsSync(appFile(file)), file).toBe(false);
		}
		expect(read('src/service-worker/index.ts')).not.toMatch(/'push'|notificationclick/);
	});

	it('keeps the reminder time and the calendar file', () => {
		expect(existsSync(appFile('src/routes/calendar.ics/+server.ts'))).toBe(true);
		expect(existsSync(appFile('src/lib/server/reminders/ics.ts'))).toBe(true);
	});
});
