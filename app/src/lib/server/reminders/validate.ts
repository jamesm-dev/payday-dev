/**
 * What the reminder time form may send. Pure; messages are plain words.
 */
import type { Checked } from '#lib/server/money/validate.ts';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function checkReminderTime(raw: unknown): Checked<string> {
	const value = typeof raw === 'string' ? raw.trim() : '';
	if (!TIME.test(value)) {
		return { ok: false, problems: { time: 'Choose a time of day, like 09:00.' } };
	}
	return { ok: true, value };
}
