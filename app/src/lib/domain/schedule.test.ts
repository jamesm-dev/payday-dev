import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates';
import { fixtureItems, fixtureOverrides } from './fixture';
import { minor } from './money';
import { expand, type Item, type Override, type Rule } from './schedule';

function item(id: string, rule: Rule, extra: Partial<Item> = {}): Item {
	return {
		id,
		kind: 'bill',
		name: id,
		amount: minor(1000),
		rule,
		startsOn: d('2020-01-01'),
		...extra
	};
}

function dates(items: Item[], from: string, to: string, overrides: Override[] = []): string[] {
	return expand(items, overrides, d(from), d(to)).map((o) => o.date);
}

describe('TSK-94B259 every14 rule', () => {
	const pay = item('pay', { kind: 'every14', anchor: d('2026-01-09') });

	it('steps 14 days from the anchor', () => {
		expect(dates([pay], '2026-01-01', '2026-03-01')).toEqual([
			'2026-01-09',
			'2026-01-23',
			'2026-02-06',
			'2026-02-20'
		]);
	});

	it('finds occurrences from a range that starts between them', () => {
		expect(dates([pay], '2026-05-02', '2026-06-12')).toEqual([
			'2026-05-15',
			'2026-05-29',
			'2026-06-12'
		]);
	});

	it('runs backwards from the anchor too, within startsOn', () => {
		expect(dates([pay], '2025-12-01', '2026-01-09')).toEqual([
			'2025-12-12',
			'2025-12-26',
			'2026-01-09'
		]);
	});

	it('crosses a leap day without drifting', () => {
		// 2026-01-09 + 14 * 54 = 756 days = 2028-02-04; 2028 has a Feb 29.
		expect(dates([pay], '2028-02-04', '2028-03-17')).toEqual([
			'2028-02-04',
			'2028-02-18',
			'2028-03-03',
			'2028-03-17'
		]);
	});
});

describe('TSK-94B259 monthly rule and month-end clamps', () => {
	it('falls on the last day when the month is shorter (Jan 31, Feb 28, Mar 31)', () => {
		const m = item('m', { kind: 'monthly', day: 31 });
		expect(dates([m], '2026-01-01', '2026-06-30')).toEqual([
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
			'2026-04-30',
			'2026-05-31',
			'2026-06-30'
		]);
	});

	it('uses Feb 29 in a leap year and Feb 28 otherwise', () => {
		const m = item('m', { kind: 'monthly', day: 30 });
		expect(dates([m], '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
		expect(dates([m], '2027-02-01', '2027-02-28')).toEqual(['2027-02-28']);
		const m29 = item('m29', { kind: 'monthly', day: 29 });
		expect(dates([m29], '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-29']);
		expect(dates([m29], '2027-02-01', '2027-03-31')).toEqual(['2027-02-28', '2027-03-29']);
	});

	it('treats a century year as a non-leap year', () => {
		const m = item('m', { kind: 'monthly', day: 29 });
		expect(dates([m], '2100-02-01', '2100-02-28')).toEqual(['2100-02-28']);
	});

	it('does not clamp when the day exists', () => {
		const m = item('m', { kind: 'monthly', day: 15 });
		expect(dates([m], '2026-12-01', '2027-02-28')).toEqual([
			'2026-12-15',
			'2027-01-15',
			'2027-02-15'
		]);
	});

	it('rejects a day outside 1 to 31', () => {
		expect(() =>
			dates([item('m', { kind: 'monthly', day: 0 })], '2026-01-01', '2026-02-01')
		).toThrow(RangeError);
		expect(() =>
			dates([item('m', { kind: 'monthly', day: 32 })], '2026-01-01', '2026-02-01')
		).toThrow(RangeError);
	});
});

describe('TSK-94B259 quarterly and yearly rules', () => {
	it('repeats every 3 months on the anchor day, clamped (Jan 31, Apr 30, Jul 31, Oct 31)', () => {
		const q = item('q', { kind: 'quarterly', anchor: d('2026-01-31') });
		expect(dates([q], '2026-01-01', '2027-02-28')).toEqual([
			'2026-01-31',
			'2026-04-30',
			'2026-07-31',
			'2026-10-31',
			'2027-01-31'
		]);
	});

	it('clamps a November 30 anchor to February 28', () => {
		const q = item('q', { kind: 'quarterly', anchor: d('2026-11-30') });
		expect(dates([q], '2026-11-01', '2027-11-30')).toEqual([
			'2026-11-30',
			'2027-02-28',
			'2027-05-30',
			'2027-08-30',
			'2027-11-30'
		]);
	});

	it('clamps a December 31 anchor to Mar 31, Jun 30, Sep 30', () => {
		const q = item('q', { kind: 'quarterly', anchor: d('2026-12-31') });
		expect(dates([q], '2026-12-01', '2027-12-31')).toEqual([
			'2026-12-31',
			'2027-03-31',
			'2027-06-30',
			'2027-09-30',
			'2027-12-31'
		]);
	});

	it('keeps the quarterly cycle across a year boundary and in a leap February', () => {
		const q = item('q', { kind: 'quarterly', anchor: d('2027-11-29') });
		expect(dates([q], '2028-01-01', '2028-12-31')).toEqual([
			'2028-02-29',
			'2028-05-29',
			'2028-08-29',
			'2028-11-29'
		]);
	});

	it('repeats yearly on the anchor month and day', () => {
		const y = item('y', { kind: 'yearly', anchor: d('2026-09-30') });
		expect(dates([y], '2026-01-01', '2028-12-31')).toEqual([
			'2026-09-30',
			'2027-09-30',
			'2028-09-30'
		]);
	});

	it('moves a Feb 29 yearly anchor to Feb 28 in non-leap years', () => {
		const y = item('y', { kind: 'yearly', anchor: d('2028-02-29') });
		expect(dates([y], '2028-01-01', '2032-12-31')).toEqual([
			'2028-02-29',
			'2029-02-28',
			'2030-02-28',
			'2031-02-28',
			'2032-02-29'
		]);
	});

	it('keeps a yearly anchor on the 31st in a 31-day month', () => {
		const y = item('y', { kind: 'yearly', anchor: d('2026-08-31') });
		expect(dates([y], '2026-01-01', '2027-12-31')).toEqual(['2026-08-31', '2027-08-31']);
	});
});

describe('TSK-94B259 startsOn, endsOn and range edges', () => {
	const monthly15 = (extra: Partial<Item>) => item('m', { kind: 'monthly', day: 15 }, extra);

	it('only produces dates within startsOn..endsOn, both inclusive', () => {
		const bnpl = fixtureItems.find((i) => i.id === 'bnpl')!;
		expect(dates([bnpl], '2026-01-01', '2026-12-31')).toEqual([
			'2026-02-06',
			'2026-02-20',
			'2026-03-06',
			'2026-03-20'
		]);
	});

	it('includes an occurrence on startsOn and excludes one the day before', () => {
		expect(dates([monthly15({ startsOn: d('2026-03-15') })], '2026-01-01', '2026-04-30')).toEqual([
			'2026-03-15',
			'2026-04-15'
		]);
		expect(dates([monthly15({ startsOn: d('2026-03-16') })], '2026-01-01', '2026-04-30')).toEqual([
			'2026-04-15'
		]);
	});

	it('includes an occurrence on endsOn and excludes one the day after', () => {
		const from = '2026-01-01';
		expect(dates([monthly15({ endsOn: d('2026-03-15') })], from, '2026-12-31')).toEqual([
			'2026-01-15',
			'2026-02-15',
			'2026-03-15'
		]);
		expect(dates([monthly15({ endsOn: d('2026-03-14') })], from, '2026-12-31')).toEqual([
			'2026-01-15',
			'2026-02-15'
		]);
	});

	it('includes occurrences on both ends of the requested range', () => {
		const m = monthly15({});
		expect(dates([m], '2026-02-15', '2026-04-15')).toEqual([
			'2026-02-15',
			'2026-03-15',
			'2026-04-15'
		]);
		expect(dates([m], '2026-02-16', '2026-04-14')).toEqual(['2026-03-15']);
	});

	it('handles a one-day range, an empty range and a reversed range', () => {
		const m = monthly15({});
		expect(dates([m], '2026-02-15', '2026-02-15')).toEqual(['2026-02-15']);
		expect(dates([m], '2026-02-16', '2026-02-16')).toEqual([]);
		expect(dates([m], '2026-03-01', '2026-02-01')).toEqual([]);
	});

	it('returns occurrences in date order across items, ties broken by item id', () => {
		const got = expand(fixtureItems, [], d('2026-01-01'), d('2026-01-31')).map(
			(o) => `${o.date} ${o.itemId}`
		);
		expect(got).toEqual([
			'2026-01-01 rent',
			'2026-01-09 pay',
			'2026-01-15 phone',
			'2026-01-23 pay',
			'2026-01-28 card',
			'2026-01-31 internet',
			'2026-01-31 water'
		]);
	});

	it('carries the item fields onto each occurrence', () => {
		const [first] = expand(fixtureItems, [], d('2026-01-01'), d('2026-01-01'));
		expect(first).toEqual({
			itemId: 'rent',
			kind: 'bill',
			name: 'Rent',
			date: '2026-01-01',
			amount: 120000,
			originalDate: '2026-01-01'
		});
	});
});

describe('TSK-92B79F skip and change at the engine level', () => {
	const phone = fixtureItems.find((i) => i.id === 'phone')!;
	const card = fixtureItems.find((i) => i.id === 'card')!;

	it('a skip removes that one occurrence and leaves its neighbours', () => {
		expect(dates([phone], '2026-02-01', '2026-04-30', fixtureOverrides)).toEqual([
			'2026-02-15',
			'2026-04-15'
		]);
	});

	it('a skip leaves the rule alone: the same item without it still expands fully', () => {
		expect(dates([phone], '2026-02-01', '2026-04-30')).toEqual([
			'2026-02-15',
			'2026-03-15',
			'2026-04-15'
		]);
	});

	it('a change moves the date and re-amounts it, keeping the original date', () => {
		const [moved] = expand([card], fixtureOverrides, d('2026-05-01'), d('2026-05-31'));
		expect(moved).toMatchObject({
			itemId: 'card',
			date: '2026-05-26',
			originalDate: '2026-05-28',
			amount: 7250
		});
		expect(
			expand([card], fixtureOverrides, d('2026-04-01'), d('2026-06-30')).map((o) => o.amount)
		).toEqual([6000, 7250, 6000]);
	});

	it('a change of amount alone keeps the date', () => {
		const o: Override = {
			itemId: 'card',
			originalDate: d('2026-05-28'),
			action: 'change',
			amount: minor(1)
		};
		expect(expand([card], [o], d('2026-05-01'), d('2026-05-31'))).toMatchObject([
			{ date: '2026-05-28', amount: 1 }
		]);
	});

	it('a change of date alone keeps the amount', () => {
		const o: Override = {
			itemId: 'card',
			originalDate: d('2026-05-28'),
			action: 'change',
			date: d('2026-05-29')
		};
		expect(expand([card], [o], d('2026-05-01'), d('2026-05-31'))).toMatchObject([
			{ date: '2026-05-29', amount: 6000, originalDate: '2026-05-28' }
		]);
	});

	it('tests the moved date against the range, not the original', () => {
		// The change moves 05-28 to 05-26.
		expect(dates([card], '2026-05-27', '2026-05-31', fixtureOverrides)).toEqual([]);
		expect(dates([card], '2026-05-26', '2026-05-26', fixtureOverrides)).toEqual(['2026-05-26']);
	});

	it('can move an occurrence into the range from outside it', () => {
		const rent = fixtureItems.find((i) => i.id === 'rent')!;
		const o: Override = {
			itemId: 'rent',
			originalDate: d('2026-06-01'),
			action: 'change',
			date: d('2026-05-30')
		};
		expect(expand([rent], [o], d('2026-05-25'), d('2026-05-31'))).toMatchObject([
			{ date: '2026-05-30', originalDate: '2026-06-01', amount: 120000 }
		]);
		expect(dates([rent], '2026-06-01', '2026-06-30', [o])).toEqual([]);
	});

	it('ignores overrides for other items and for dates the rule never produced', () => {
		const overrides: Override[] = [
			{ itemId: 'rent', originalDate: d('2026-03-15'), action: 'skip' },
			{ itemId: 'phone', originalDate: d('2026-03-16'), action: 'skip' },
			{ itemId: 'phone', originalDate: d('2026-03-16'), action: 'change', date: d('2026-03-20') }
		];
		expect(dates([phone], '2026-03-01', '2026-03-31', overrides)).toEqual(['2026-03-15']);
	});

	it('does not resurrect an occurrence outside startsOn..endsOn by changing it', () => {
		const bnpl = fixtureItems.find((i) => i.id === 'bnpl')!;
		const o: Override = {
			itemId: 'bnpl',
			originalDate: d('2026-04-03'),
			action: 'change',
			date: d('2026-03-25')
		};
		expect(dates([bnpl], '2026-03-21', '2026-04-30', [o])).toEqual([]);
	});

	it('skips a quarterly occurrence and a yearly occurrence too', () => {
		const water = fixtureItems.find((i) => i.id === 'water')!;
		const o: Override = { itemId: 'water', originalDate: d('2026-04-30'), action: 'skip' };
		expect(dates([water], '2026-01-01', '2026-12-31', [o])).toEqual([
			'2026-01-31',
			'2026-07-31',
			'2026-10-31'
		]);
	});
});
