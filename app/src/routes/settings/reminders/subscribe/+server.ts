import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { saveSubscription } from '#lib/server/reminders/store.ts';
import { checkSubscription } from '#lib/server/reminders/validate.ts';
import { vapidFromEnv } from '#lib/server/reminders/webpush.ts';
import type { RequestHandler } from './$types';

/**
 * The phone hands over its push subscription after the owner turns reminders on. Only JSON is
 * accepted: a cross-site form cannot send it without a preflight this server never approves.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.ownerId === null) return json({ message: 'Sign in to continue.' }, { status: 401 });
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		return json({ message: 'Send the subscription as JSON.' }, { status: 415 });
	}
	const vapid = vapidFromEnv();
	if (!vapid.configured) return json({ message: vapid.reason }, { status: 409 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'That is not a subscription.' }, { status: 400 });
	}
	const subscription = checkSubscription(body);
	if (!subscription.ok) {
		return json({ message: subscription.problems.subscription }, { status: 400 });
	}
	saveSubscription(getDb(), locals.ownerId, subscription.value, new Date());
	return json({ ok: true });
};
