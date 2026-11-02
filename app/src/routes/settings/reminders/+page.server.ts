import { fail } from '@sveltejs/kit';
import { todayIn } from '#lib/domain/dates.ts';
import { dateText } from '#lib/format.ts';
import { getDb } from '#lib/server/db/index.ts';
import { localTime } from '#lib/server/reminders/job.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner } from '#lib/server/money/store.ts';
import {
	getReminderTime,
	reminderStatus,
	removeAllSubscriptions,
	setReminderTime
} from '#lib/server/reminders/store.ts';
import { checkReminderTime } from '#lib/server/reminders/validate.ts';
import { vapidFromEnv } from '#lib/server/reminders/webpush.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	const vapid = vapidFromEnv();
	const status = reminderStatus(db, ownerId, vapid);
	const zone = getOwner(db, ownerId).timeZone ?? 'UTC';

	// When the last reminder went out, in the owner's own clock.
	let lastSent: string | null = null;
	if ('lastSent' in status && status.lastSent) {
		const at = new Date(status.lastSent);
		lastSent = `${dateText(todayIn(zone, at))} at ${localTime(zone, at)}`;
	}

	return {
		time: getReminderTime(db, ownerId),
		zone,
		status,
		lastSent,
		// The public half is meant to be seen: the browser needs it to subscribe.
		publicKey: vapid.configured ? vapid.config.publicKey : null
	};
};

export const actions: Actions = {
	time: async ({ request, locals }) => {
		const ownerId = requireOwner(locals);
		const form = await readForm(request);
		const time = checkReminderTime(form.time);
		if (!time.ok) {
			return fail(400, { time: { value: String(form.time ?? ''), problems: time.problems } });
		}
		setReminderTime(getDb(), ownerId, time.value);
		return { saved: true as const };
	},

	off: ({ locals }) => {
		const ownerId = requireOwner(locals);
		removeAllSubscriptions(getDb(), ownerId);
		return { turnedOff: true as const };
	}
};
