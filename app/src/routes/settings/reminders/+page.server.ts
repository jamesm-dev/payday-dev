import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner } from '#lib/server/money/store.ts';
import { getReminderTime, setReminderTime } from '#lib/server/reminders/store.ts';
import { checkReminderTime } from '#lib/server/reminders/validate.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = await getDb();
	return {
		time: await getReminderTime(db, ownerId),
		zone: (await getOwner(db, ownerId)).timeZone ?? 'UTC'
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
		await setReminderTime(await getDb(), ownerId, time.value);
		return { saved: true as const };
	}
};
