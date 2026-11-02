/*
 * What the service worker does with a payday reminder. Kept apart from index.ts, and free of any
 * `$app` import, so a unit test can drive it with plain stand-ins for the browser's objects.
 */

export const REMINDER_TEXT = "It's payday — check in, it takes five minutes";
export const CHECK_IN_PATH = '/checkin';
/** One tag: a second reminder replaces the first instead of stacking beside it. */
export const REMINDER_TAG = 'payday-reminder';

/** The notification for a push. The push carries no body of its own; the words live here. */
export function reminderNotification(scope: string): {
	title: string;
	options: NotificationOptions;
} {
	return {
		title: 'Payday',
		options: {
			body: REMINDER_TEXT,
			tag: REMINDER_TAG,
			icon: new URL('icon-192.png', scope).href,
			data: { url: CHECK_IN_PATH }
		}
	};
}

/** A window the service worker can see: the few members of `WindowClient` it uses. */
export type WindowLike = {
	url: string;
	focus(): Promise<unknown>;
	navigate?(url: string): Promise<unknown>;
};

/**
 * A tap on the reminder: bring an open Payday window forward, on the check-in, or open one.
 * `target` is the notification's own data, so a reminder always leads where it says.
 */
export async function openCheckIn(
	windows: readonly WindowLike[],
	openWindow: (url: string) => Promise<unknown>,
	scope: string,
	target: unknown
): Promise<'focused' | 'opened'> {
	const path = typeof target === 'string' && target.startsWith('/') ? target : CHECK_IN_PATH;
	const url = new URL(path.slice(1), scope).href;
	const open = windows.find((w) => w.url.startsWith(scope));
	if (open) {
		if (open.url !== url) await open.navigate?.(url).catch(() => undefined);
		await open.focus();
		return 'focused';
	}
	await openWindow(url);
	return 'opened';
}
