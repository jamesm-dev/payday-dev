/*
 * The service worker's reminder handlers, driven with plain stand-ins for the browser's objects.
 * This proves the logic. It does not prove a real push arrives on a phone.
 */
import { describe, expect, it, vi } from 'vitest';
import {
	CHECK_IN_PATH,
	REMINDER_TAG,
	REMINDER_TEXT,
	openCheckIn,
	reminderNotification,
	type WindowLike
} from '../../service-worker/push.ts';
import { keyBytes } from './subscribe.ts';

const SCOPE = 'https://payday.example/';

describe('TSK-DC74DF a push shows a payday notification that leads to the check-in', () => {
	it('says it is payday, in the words the owner was promised', () => {
		const { title, options } = reminderNotification(SCOPE);
		expect(title).toBe('Payday');
		expect(options.body).toBe("It's payday — check in, it takes five minutes");
		expect(REMINDER_TEXT).toBe(options.body);
	});

	it('carries /checkin as its data and one tag, so reminders do not stack', () => {
		const { options } = reminderNotification(SCOPE);
		expect(options.data).toEqual({ url: '/checkin' });
		expect(CHECK_IN_PATH).toBe('/checkin');
		expect(options.tag).toBe(REMINDER_TAG);
		expect(options.icon).toBe('https://payday.example/icon-192.png');
	});
});

describe('TSK-DC74DF tapping the notification focuses an open window or opens the check-in', () => {
	const win = (
		url: string,
		navigates = true
	): WindowLike & { focus: ReturnType<typeof vi.fn> } => ({
		url,
		focus: vi.fn(async () => undefined),
		...(navigates ? { navigate: vi.fn(async () => undefined) } : {})
	});

	it('opens /checkin when no window is open', async () => {
		const openWindow = vi.fn(async () => undefined);
		const result = await openCheckIn([], openWindow, SCOPE, '/checkin');
		expect(result).toBe('opened');
		expect(openWindow).toHaveBeenCalledWith('https://payday.example/checkin');
	});

	it('focuses an open Payday window and takes it to the check-in', async () => {
		const open = win('https://payday.example/');
		const openWindow = vi.fn(async () => undefined);
		const result = await openCheckIn([open], openWindow, SCOPE, '/checkin');
		expect(result).toBe('focused');
		expect(open.navigate).toHaveBeenCalledWith('https://payday.example/checkin');
		expect(open.focus).toHaveBeenCalledOnce();
		expect(openWindow).not.toHaveBeenCalled();
	});

	it('does not reload a window that is already on the check-in', async () => {
		const open = win('https://payday.example/checkin');
		await openCheckIn([open], vi.fn(), SCOPE, '/checkin');
		expect(open.navigate).not.toHaveBeenCalled();
		expect(open.focus).toHaveBeenCalledOnce();
	});

	it('still focuses a window that cannot navigate', async () => {
		const open = win('https://payday.example/plan', false);
		await expect(openCheckIn([open], vi.fn(), SCOPE, '/checkin')).resolves.toBe('focused');
		expect(open.focus).toHaveBeenCalledOnce();
	});

	it('ignores windows of other sites', async () => {
		const other = win('https://elsewhere.example/');
		const openWindow = vi.fn(async () => undefined);
		expect(await openCheckIn([other], openWindow, SCOPE, '/checkin')).toBe('opened');
		expect(other.focus).not.toHaveBeenCalled();
	});

	it('falls back to the check-in for data it does not understand, and never leaves the site', async () => {
		for (const target of [undefined, null, 42, '', 'https://evil.example/', 'checkin']) {
			const opened: string[] = [];
			await openCheckIn([], async (u) => void opened.push(u), SCOPE, target);
			const url = opened[0];
			expect(url.startsWith(SCOPE), String(target)).toBe(true);
		}
	});
});

describe('TSK-21F5E9 the public key is turned into the bytes the browser wants', () => {
	it('decodes base64url without padding', () => {
		// "hello?>" is aGVsbG8_Pg in base64url (the "_" stands for "/"), with no "==" padding.
		expect([...keyBytes('aGVsbG8_Pg')]).toEqual([...new TextEncoder().encode('hello?>')]);
	});

	it('decodes a 65-byte VAPID public key', () => {
		const key =
			'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
		const bytes = keyBytes(key);
		expect(bytes).toHaveLength(65);
		expect(bytes[0]).toBe(4);
	});
});
