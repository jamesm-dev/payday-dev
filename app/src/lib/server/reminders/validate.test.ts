import { describe, expect, it } from 'vitest';
import {
	checkCurrentBalance,
	checkPayAnswer,
	checkPaymentAnswers,
	occurrenceKey,
	parseOccurrenceKey,
	statusField
} from '#lib/server/money/checkinForm.ts';
import { checkReminderTime } from './validate.ts';

describe('TSK-E03C29 the reminder time is a time of day', () => {
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
