import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import type { Item } from '#lib/domain/schedule.ts';
import {
	checkAmount,
	checkBalance,
	checkDate,
	checkEnd,
	checkExpense,
	checkItemFields,
	checkNewItem,
	checkOverride,
	checkRegion,
	startsOnFor
} from './validate.ts';

const problems = (r: { ok: boolean; problems?: Record<string, string> }) =>
	r.ok ? {} : (r.problems ?? {});

describe('TSK-55D1DC amounts are read from digits, never as floats', () => {
	it('accepts plain, grouped and one-decimal amounts', () => {
		expect(checkAmount('45')).toEqual({ ok: true, value: 4500 });
		expect(checkAmount(' 1,200.50 ')).toEqual({ ok: true, value: 120050 });
		expect(checkAmount('0.1')).toEqual({ ok: true, value: 10 });
		expect(checkAmount('19.99')).toEqual({ ok: true, value: 1999 });
	});

	it.each(['', '   ', 'abc', '12.345', '1.2.3', '$12', '12,5', '.', '-'])(
		'refuses %j in plain words',
		(text) => {
			const result = checkAmount(text);
			expect(result.ok).toBe(false);
			expect(problems(result).amount).toMatch(/amount|numbers/i);
		}
	);

	it('refuses zero and negatives for an item, but a balance may be either', () => {
		expect(problems(checkAmount('0')).amount).toMatch(/above zero/);
		expect(problems(checkAmount('-5')).amount).toMatch(/minus/);
		expect(checkBalance('0')).toEqual({ ok: true, value: 0 });
		expect(checkBalance('-50.25')).toEqual({ ok: true, value: -5025 });
		expect(problems(checkAmount('99999999999999999')).amount).toMatch(/too big/);
		expect(checkAmount(undefined).ok).toBe(false);
	});
});

describe('TSK-55D1DC dates and the repeat rule are checked strictly', () => {
	it('accepts a real date and refuses impossible, odd and out-of-range ones', () => {
		expect(checkDate('2026-02-28', 'a date')).toEqual({ ok: true, value: '2026-02-28' });
		for (const bad of [
			'2026-02-30',
			'2026-13-01',
			'26-01-01',
			'tomorrow',
			'',
			'1999-12-31',
			'2101-01-01'
		]) {
			expect(checkDate(bad, 'a date').ok, bad).toBe(false);
		}
	});

	it('builds a rule for each repeat choice', () => {
		const base = { name: ' Rent ', amount: '1,200' };
		const rule = (extra: Record<string, string>) => {
			const r = checkItemFields('bill', { ...base, ...extra });
			return r.ok ? r.value.rule : problems(r);
		};
		expect(rule({ repeat: 'every14', date: '2026-01-09' })).toEqual({
			kind: 'every14',
			anchor: '2026-01-09'
		});
		expect(rule({ repeat: 'monthly', day: '31' })).toEqual({ kind: 'monthly', day: 31 });
		expect(rule({ repeat: 'quarterly', date: '2026-01-31' })).toEqual({
			kind: 'quarterly',
			anchor: '2026-01-31'
		});
		expect(rule({ repeat: 'yearly', date: '2026-09-30' })).toEqual({
			kind: 'yearly',
			anchor: '2026-09-30'
		});
		const ok = checkItemFields('bill', { ...base, repeat: 'monthly', day: '1' });
		expect(ok.ok && ok.value.name).toBe('Rent');
	});

	it('limits the day of the month to 1 to 31', () => {
		for (const day of ['0', '32', '-1', '1.5', 'x', '', '100']) {
			const r = checkItemFields('bill', { name: 'A', amount: '1', repeat: 'monthly', day });
			expect(problems(r).day, day).toMatch(/1 to 31/);
		}
		for (const day of ['1', '15', '29', '30', '31']) {
			expect(checkItemFields('bill', { name: 'A', amount: '1', repeat: 'monthly', day }).ok).toBe(
				true
			);
		}
	});

	it('says what is wrong with each field at once', () => {
		const r = checkItemFields('bill', { name: '', amount: 'x', repeat: 'sometimes' });
		expect(Object.keys(problems(r)).sort()).toEqual(['amount', 'name', 'repeat']);
		expect(
			problems(checkItemFields('bill', { name: 'A', amount: '1', repeat: 'yearly' })).date
		).toMatch(/Choose/);
		expect(
			problems(checkItemFields('bill', { name: 'x'.repeat(61), amount: '1', repeat: 'x' })).name
		).toMatch(/under 60/);
		expect(
			checkItemFields('gift' as never, { name: 'A', amount: '1', repeat: 'monthly', day: '1' }).ok
		).toBe(false);
	});

	it('an end date may not come before the start', () => {
		expect(checkEnd(d('2026-01-01'), '2026-01-01')).toEqual({ ok: true, value: '2026-01-01' });
		expect(checkEnd(d('2026-01-01'), '2026-06-01').ok).toBe(true);
		expect(problems(checkEnd(d('2026-01-01'), '2025-12-31')).endsOn).toMatch(/before/);
		expect(problems(checkEnd(d('2026-01-01'), 'soon')).endsOn).toMatch(/not a date/);
	});

	it('starts the history where the saving needs it', () => {
		const today = d('2026-10-31');
		expect(startsOnFor({ kind: 'every14', anchor: d('2026-01-09') }, today)).toBe('2026-01-09');
		expect(startsOnFor({ kind: 'monthly', day: 1 }, today)).toBe('2026-09-30');
		expect(startsOnFor({ kind: 'quarterly', anchor: d('2026-05-31') }, today)).toBe('2026-02-28');
		expect(startsOnFor({ kind: 'yearly', anchor: d('2028-02-29') }, today)).toBe('2027-02-28');
		const r = checkNewItem(
			'bill',
			{ name: 'A', amount: '2', repeat: 'yearly', date: '2027-03-01' },
			today
		);
		expect(r.ok && r.value.startsOn).toBe('2026-03-01');
	});
});

describe('TSK-92B79F skip and change are checked against the schedule', () => {
	const item: Item = {
		id: '1',
		kind: 'bill',
		name: 'Phone',
		amount: minor(4500),
		rule: { kind: 'monthly', day: 15 },
		startsOn: d('2026-01-01'),
		endsOn: d('2026-12-31')
	};

	it('skips only a payment the rule really produces', () => {
		expect(checkOverride(item, 'skip', { originalDate: '2026-03-15' })).toEqual({
			ok: true,
			value: { action: 'skip', originalDate: '2026-03-15' }
		});
		expect(
			problems(checkOverride(item, 'skip', { originalDate: '2026-03-16' })).originalDate
		).toMatch(/not on the schedule/);
		expect(checkOverride(item, 'skip', { originalDate: '2027-03-15' }).ok).toBe(false);
		expect(checkOverride(item, 'skip', {}).ok).toBe(false);
	});

	it('changes a date, an amount or both, and refuses a change that changes nothing', () => {
		expect(
			checkOverride(item, 'change', { originalDate: '2026-03-15', date: '2026-03-12', amount: '' })
		).toEqual({
			ok: true,
			value: { action: 'change', originalDate: '2026-03-15', date: '2026-03-12', amount: undefined }
		});
		const both = checkOverride(item, 'change', {
			originalDate: '2026-03-15',
			amount: '50',
			date: ''
		});
		expect(both.ok && both.value).toMatchObject({ amount: 5000 });
		expect(
			problems(
				checkOverride(item, 'change', {
					originalDate: '2026-03-15',
					date: '2026-03-15',
					amount: '45'
				})
			).change
		).toMatch(/different/);
		expect(
			problems(checkOverride(item, 'change', { originalDate: '2026-03-15', amount: 'x' })).amount
		).toMatch(/numbers/);
		expect(
			problems(checkOverride(item, 'change', { originalDate: '2026-03-15', date: 'x' })).date
		).toMatch(/not a date/);
	});
});

describe('TSK-4BCCC7 currency and time zone from setup', () => {
	it('accepts two-decimal currencies and real IANA zones', () => {
		expect(checkRegion({ currency: 'USD', timeZone: 'America/New_York' })).toEqual({
			ok: true,
			value: { currency: 'USD', timeZone: 'America/New_York' }
		});
		expect(checkRegion({ currency: 'EUR', timeZone: 'UTC' }).ok).toBe(true);
	});

	it('refuses currencies that do not use two decimals, and made-up zones', () => {
		expect(problems(checkRegion({ currency: 'JPY', timeZone: 'UTC' })).currency).toMatch(/listed/);
		expect(problems(checkRegion({ currency: 'KWD', timeZone: 'UTC' })).currency).toBeDefined();
		expect(problems(checkRegion({ currency: 'USD', timeZone: 'Mars/Olympus' })).timeZone).toMatch(
			/time zone/
		);
		expect(checkRegion({}).ok).toBe(false);
	});
});

describe('TSK-A9146A an expense form is checked in plain words', () => {
	const today = d('2026-11-02');
	const ok = { amount: '12.50', date: '2026-11-02', note: '  lunch  ' };

	it('accepts an amount, a day and a trimmed note', () => {
		expect(checkExpense(ok, today)).toEqual({
			ok: true,
			value: { amount: 1250, note: 'lunch', spentOn: d('2026-11-02') }
		});
		expect(checkExpense({ amount: '1,200', date: '2026-10-01' }, today)).toEqual({
			ok: true,
			value: { amount: 120000, note: null, spentOn: d('2026-10-01') }
		});
	});

	it('requires an amount above zero with at most two decimals', () => {
		expect(problems(checkExpense({ ...ok, amount: '' }, today)).amount).toMatch(/Enter an amount/);
		expect(problems(checkExpense({ ...ok, amount: '0' }, today)).amount).toMatch(/above zero/);
		expect(problems(checkExpense({ ...ok, amount: '-5' }, today)).amount).toMatch(/minus/);
		expect(problems(checkExpense({ ...ok, amount: '1.234' }, today)).amount).toMatch(/two digits/);
		expect(problems(checkExpense({ ...ok, amount: 'lots' }, today)).amount).toMatch(/numbers only/);
		expect(problems(checkExpense({ ...ok, amount: '10,000,000.01' }, today)).amount).toMatch(
			/too big/
		);
		expect(checkExpense({ ...ok, amount: '10,000,000' }, today).ok).toBe(true);
	});

	it('keeps the note to 60 characters, and a note is optional', () => {
		expect(checkExpense({ ...ok, note: 'x'.repeat(60) }, today).ok).toBe(true);
		expect(problems(checkExpense({ ...ok, note: 'x'.repeat(61) }, today)).note).toMatch(/60/);
		expect(checkExpense({ amount: '1', date: '2026-11-02', note: '   ' }, today)).toMatchObject({
			ok: true,
			value: { note: null }
		});
	});

	it('wants a real day that has already happened', () => {
		expect(problems(checkExpense({ ...ok, date: '' }, today)).date).toMatch(/Choose/);
		expect(problems(checkExpense({ ...ok, date: '2026-02-30' }, today)).date).toMatch(/not a date/);
		expect(problems(checkExpense({ ...ok, date: '2026-11-03' }, today)).date).toMatch(
			/has not happened yet/
		);
		expect(checkExpense({ ...ok, date: '2026-11-02' }, today).ok).toBe(true);
	});

	it('reports every problem at once', () => {
		expect(Object.keys(problems(checkExpense({}, today))).sort()).toEqual(['amount', 'date']);
	});
});
