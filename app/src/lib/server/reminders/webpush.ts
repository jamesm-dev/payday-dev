/**
 * The one place the `web-push` library is used. It signs the request with the VAPID key and posts
 * to the phone's push service. No payload is sent: the service worker already knows what to show,
 * and a push with no body needs no encryption to get wrong.
 */
import webpush from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '$app/env/private';
import { getDb } from '#lib/server/db/index.ts';
import { log } from '#lib/server/log.ts';
import { startReminderJob, type Sender } from './job.ts';
import { vapidConfig, type VapidConfig } from './vapid.ts';

/** Read from the environment each time; the build has none of the three. */
export const vapidFromEnv = () =>
	vapidConfig({
		publicKey: VAPID_PUBLIC_KEY,
		privateKey: VAPID_PRIVATE_KEY,
		subject: VAPID_SUBJECT
	});

export function webPushSender(config: VapidConfig): Sender {
	return async (subscription) => {
		await webpush.sendNotification(
			{
				endpoint: subscription.endpoint,
				keys: { p256dh: subscription.p256dh, auth: subscription.auth }
			},
			undefined,
			{
				vapidDetails: {
					subject: config.subject,
					publicKey: config.publicKey,
					privateKey: config.privateKey
				},
				TTL: 6 * 60 * 60,
				urgency: 'high',
				timeout: 15_000
			}
		);
	};
}

/** Called from `init`, never during the build. Does nothing, and says so, when reminders are off. */
export function startReminders(): void {
	const vapid = vapidFromEnv();
	if (!vapid.configured) {
		log({ level: 'info', msg: 'payday reminders are off', reason: vapid.reason });
		return;
	}
	startReminderJob({ db: getDb(), now: () => new Date(), send: webPushSender(vapid.config), log });
	log({ level: 'info', msg: 'payday reminder job started' });
}
