import { addDays } from '#lib/domain/dates.ts';
import { paydays } from '#lib/domain/periods.ts';
import { getDb } from '#lib/server/db/index.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import { loadPlan } from '#lib/server/money/store.ts';
import { buildCalendar } from '#lib/server/reminders/ics.ts';
import { getReminderTime } from '#lib/server/reminders/store.ts';
import type { RequestHandler } from './$types';

/** A calendar file with every payday for the next 12 months: the fallback when push cannot work. */
export const GET: RequestHandler = ({ locals, url }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	const plan = loadPlan(db, ownerId, new Date());
	const days = paydays(plan.items, plan.overrides, plan.today, addDays(plan.today, 365));
	const body = buildCalendar({
		paydays: days,
		time: getReminderTime(db, ownerId),
		now: new Date(),
		checkInUrl: new URL('/checkin', url.origin).href
	});
	return new Response(body, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': 'attachment; filename="payday.ics"',
			// Dates and times of a person's income: never kept by a browser or a proxy.
			'cache-control': 'private, no-store'
		}
	});
};
