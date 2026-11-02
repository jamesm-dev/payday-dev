/**
 * What the reminder forms and the phone's subscription may send. Pure; messages are plain words.
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

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };

const BASE64URL = /^[A-Za-z0-9_-]{8,256}$/;

/**
 * The hosts the browsers' real push services answer on: Chrome, Edge and Android (FCM), Safari and
 * iPhone (Apple), Firefox (Mozilla autopush) and Windows (WNS, one host per data centre, hence the
 * wildcard). The server posts to the endpoint a client hands it, so anything else would let a
 * signed-in session make it call an address of the caller's choosing.
 */
const PUSH_HOSTS = [
	'fcm.googleapis.com',
	'web.push.apple.com',
	'updates.push.services.mozilla.com'
];
const PUSH_HOST_SUFFIX = '.notify.windows.com';

export function isPushServiceHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return (
		PUSH_HOSTS.includes(host) ||
		(host.endsWith(PUSH_HOST_SUFFIX) && host.length > PUSH_HOST_SUFFIX.length)
	);
}

/**
 * A browser's `PushSubscription.toJSON()`: an https endpoint and two base64url keys. The keys are
 * not decoded here; the push library does that when it sends.
 */
export function checkSubscription(body: unknown): Checked<SubscriptionInput> {
	const bad = (message: string): Checked<SubscriptionInput> => ({
		ok: false,
		problems: { subscription: message }
	});
	if (typeof body !== 'object' || body === null) return bad('That is not a subscription.');
	const { endpoint, keys } = body as { endpoint?: unknown; keys?: unknown };
	if (typeof endpoint !== 'string' || endpoint.length > 2048)
		return bad('The endpoint is missing.');
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return bad('The endpoint is not an address.');
	}
	if (url.protocol !== 'https:') return bad('The endpoint must be an https address.');
	if (url.username || url.password || url.port || !isPushServiceHost(url.hostname)) {
		return bad('The endpoint is not from a phone or browser push service.');
	}
	if (typeof keys !== 'object' || keys === null) return bad('The keys are missing.');
	const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
	if (typeof p256dh !== 'string' || !BASE64URL.test(p256dh)) return bad('The p256dh key is wrong.');
	if (typeof auth !== 'string' || !BASE64URL.test(auth)) return bad('The auth key is wrong.');
	return { ok: true, value: { endpoint, p256dh, auth } };
}
