import { describe, expect, it } from 'vitest';
import {
	checkCurrentBalance,
	checkPayAnswer,
	checkPaymentAnswers,
	occurrenceKey,
	parseOccurrenceKey,
	statusField
} from '#lib/server/money/checkinForm.ts';
import { checkReminderTime, checkSubscription } from './validate.ts';
import { vapidConfig } from './vapid.ts';

const keys = {
	p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
	auth: 'tBHItJI5svbpez7KI4CCXg'
};

describe('TSK-21F5E9 a phone subscription is checked before it is saved', () => {
	const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', expirationTime: null, keys };

	it('accepts what PushSubscription.toJSON() produces', () => {
		expect(checkSubscription(good)).toEqual({
			ok: true,
			value: { endpoint: good.endpoint, p256dh: keys.p256dh, auth: keys.auth }
		});
	});

	for (const [name, body] of [
		['null', null],
		['a string', 'x'],
		['no endpoint', { keys }],
		['an http endpoint', { endpoint: 'http://fcm.googleapis.com/fcm/send/a', keys }],
		['a javascript: endpoint', { endpoint: 'javascript:alert(1)', keys }],
		['a non-address endpoint', { endpoint: 'not a url', keys }],
		[
			'an endpoint far too long',
			{ endpoint: `https://fcm.googleapis.com/${'a'.repeat(3000)}`, keys }
		],
		['no keys', { endpoint: good.endpoint }],
		['a bad p256dh', { endpoint: good.endpoint, keys: { ...keys, p256dh: 'not base64!' } }],
		['a missing auth', { endpoint: good.endpoint, keys: { p256dh: keys.p256dh } }]
	] as const) {
		it(`refuses ${name}`, () => {
			const result = checkSubscription(body);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.problems.subscription).toBeTruthy();
		});
	}
});

describe('TSK-21F5E9 the push endpoint must be a real push service', () => {
	const at = (endpoint: string) => checkSubscription({ endpoint, keys });

	it.each([
		'https://fcm.googleapis.com/fcm/send/abc',
		'https://fcm.googleapis.com/wp/abc',
		'https://web.push.apple.com/QAbc',
		'https://updates.push.services.mozilla.com/wpush/v2/abc',
		'https://db5p.notify.windows.com/?token=abc',
		'https://wns2-par02p.notify.windows.com/w/?token=abc',
		'https://FCM.GOOGLEAPIS.COM/fcm/send/abc'
	])('accepts %s', (endpoint) => {
		expect(at(endpoint).ok).toBe(true);
	});

	it.each([
		'https://push.example.invalid/abc',
		'https://localhost/abc',
		'https://127.0.0.1/abc',
		'https://169.254.169.254/latest/meta-data',
		'https://evil.example/fcm.googleapis.com',
		'https://fcm.googleapis.com.evil.example/x',
		'https://evilfcm.googleapis.com/x',
		'https://notify.windows.com/x',
		'https://.notify.windows.com/x',
		'https://windows.com/x',
		'https://evilnotify.windows.com.example/x',
		'https://fcm.googleapis.com@evil.example/x',
		'https://user:pw@fcm.googleapis.com/x',
		'https://fcm.googleapis.com:8443/x'
	])('refuses %s', (endpoint) => {
		const result = at(endpoint);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problems.subscription).toBeTruthy();
	});

	it('says why, in plain words', () => {
		const result = at('https://push.example.invalid/abc');
		expect(result).toEqual({
			ok: false,
			problems: { subscription: 'The endpoint is not from a phone or browser push service.' }
		});
	});
});

describe('TSK-21F5E9 the reminder time is a time of day', () => {
	it('accepts HH:MM on a 24-hour clock', () => {
		for (const t of ['00:00', '09:00', '17:45', '23:59']) {
			expect(checkReminderTime(t)).toEqual({ ok: true, value: t });
		}
	});

	it('refuses everything else in plain words', () => {
		for (const t of ['', '9:00', '24:00', '12:60', '09:00:00', 'noon', '9am', undefined, 900]) {
			const result = checkReminderTime(t);
			expect(result.ok, String(t)).toBe(false);
			if (!result.ok) expect(result.problems.time).toBe('Choose a time of day, like 09:00.');
		}
	});
});

describe('TSK-21F5E9 reminders are on only with all three VAPID values', () => {
	const all = {
		publicKey: 'pub',
		privateKey: 'priv',
		subject: 'mailto:owner@example.com'
	};

	it('is configured when all three are set', () => {
		expect(vapidConfig(all)).toEqual({ configured: true, config: all });
		expect(vapidConfig({ ...all, subject: 'https://payday.example' }).configured).toBe(true);
	});

	it('names what is missing, in plain words', () => {
		const none = vapidConfig({ publicKey: undefined, privateKey: undefined, subject: undefined });
		expect(none).toEqual({
			configured: false,
			reason:
				'Reminders are not set up on this server yet. It is missing VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.'
		});
		const some = vapidConfig({ ...all, privateKey: undefined });
		expect(some.configured).toBe(false);
		if (!some.configured) expect(some.reason).toContain('missing VAPID_PRIVATE_KEY.');
	});

	it('treats an empty string like an unset one', () => {
		expect(vapidConfig({ ...all, publicKey: '' }).configured).toBe(false);
	});

	it('refuses a subject that is not a mailto: or https: address', () => {
		for (const subject of ['owner@example.com', 'http://payday.example', 'mailto:', 'ftp://x']) {
			expect(vapidConfig({ ...all, subject }).configured, subject).toBe(false);
		}
	});
});

describe('TSK-47ADF0 the check-in forms are checked in plain words', () => {
	it('pay: yes needs a positive amount; no needs nothing', () => {
		expect(checkPayAnswer({ landed: 'yes', amount: '1,850.00' })).toEqual({
			ok: true,
			value: { landed: true, amount: 185000 }
		});
		expect(checkPayAnswer({ landed: 'no', amount: 'ignored' })).toEqual({
			ok: true,
			value: { landed: false, amount: null }
		});
	});

	it('pay: refuses no answer, a missing amount, and junk', () => {
		expect(checkPayAnswer({})).toMatchObject({
			ok: false,
			problems: { landed: 'Choose yes or no.' }
		});
		const blank = checkPayAnswer({ landed: 'yes', amount: '' });
		expect(blank).toMatchObject({ ok: false });
		if (!blank.ok) expect(blank.problems.amount).toContain('Enter the pay');
		expect(checkPayAnswer({ landed: 'yes', amount: '12.345' }).ok).toBe(false);
		expect(checkPayAnswer({ landed: 'yes', amount: '-5' }).ok).toBe(false);
		expect(checkPayAnswer({ landed: 'maybe', amount: '5' }).ok).toBe(false);
	});

	it('balance: may be zero or overdrawn, never junk', () => {
		expect(checkCurrentBalance({ balance: '0' })).toEqual({ ok: true, value: 0 });
		expect(checkCurrentBalance({ balance: '-50.25' })).toEqual({ ok: true, value: -5025 });
		expect(checkCurrentBalance({ balance: '2,300' })).toEqual({ ok: true, value: 230000 });
		const bad = checkCurrentBalance({ balance: 'lots' });
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.problems.balance).toContain('Use numbers only');
		expect(checkCurrentBalance({}).ok).toBe(false);
	});
});

describe('TSK-6553DA every listed payment needs an answer, and only listed ones count', () => {
	const keysList = ['3|2026-10-15', '4|2026-10-28'];

	it('accepts paid and missed for each', () => {
		const result = checkPaymentAnswers(
			{ [statusField(keysList[0])]: 'paid', [statusField(keysList[1])]: 'missed' },
			keysList
		);
		expect(result.ok && [...result.value]).toEqual([
			['3|2026-10-15', 'paid'],
			['4|2026-10-28', 'missed']
		]);
	});

	it('names the payment that has no answer, or a nonsense one', () => {
		const result = checkPaymentAnswers(
			{ [statusField(keysList[0])]: 'paid', [statusField(keysList[1])]: 'perhaps' },
			keysList
		);
		expect(result).toEqual({
			ok: false,
			problems: { [statusField(keysList[1])]: 'Choose whether this one went out.' }
		});
	});

	it('ignores an answer for a payment that was not listed', () => {
		const result = checkPaymentAnswers(
			{ [statusField(keysList[0])]: 'paid', 'status:9|2026-01-01': 'paid' },
			[keysList[0]]
		);
		expect(result.ok && result.value.size).toBe(1);
	});

	it('accepts an empty list: nothing was due', () => {
		expect(checkPaymentAnswers({}, [])).toMatchObject({ ok: true });
	});

	it('round-trips an occurrence key and refuses a malformed one', () => {
		expect(parseOccurrenceKey(occurrenceKey('3', '2026-10-15'))).toEqual({
			itemId: '3',
			originalDate: '2026-10-15'
		});
		for (const bad of ['', '3', '3|', '3|nope', '3|2026-10-15|x', '|2026-10-15']) {
			expect(parseOccurrenceKey(bad), bad).toBeNull();
		}
	});
});
