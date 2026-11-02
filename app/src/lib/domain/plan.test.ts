/*
 * Hand calculations for planPaychecks on the fixture household (see fixture.ts and the header of
 * safeToSpend.test.ts for the paydays and the water and insurance cycles).
 *
 * Paydays: Oct 2, 16, 30 | Nov 13, 27 | Dec 11, 25 2026. Pay 185000.
 * Water (12000, quarterly, falls Jul 31, Oct 31, Jan 31 2027):
 *   cycle to Oct 31: paydays Aug 7, Aug 21, Sep 4, Sep 18, Oct 2, Oct 16, Oct 30 = 7, so 1715,
 *   1715 and five of 1714. Cycle to Jan 31: Nov 13, Nov 27, Dec 11, Dec 25, Jan 8, Jan 22 = 6 of 2000.
 * Insurance (54000, yearly, falls 2026-09-30 and 2027-09-30): 26 paydays from Oct 2, the first 24
 *   of 2077, so Oct 2, 16, 30 and Nov 13 each set aside 2077.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import { fixtureItems, fixtureOverrides } from './fixture.ts';
import { minor } from './money.ts';
import { periodFor } from './periods.ts';
import { planPaychecks } from './plan.ts';
import type { Item } from './schedule.ts';

const plan = (from: string, count: number, items: Item[] = fixtureItems) =>
	planPaychecks(items, fixtureOverrides, d(from), count);

describe('TSK-145499 the next paychecks each list what they must cover and what is left', () => {
	const [first, second, third] = plan('2026-10-16', 3);

	it('Oct 16 covers the card minimum alone: 185000 - 6000 - 1714 - 2077 = 175209', () => {
		// Covers (Oct 16, Oct 30]: card Oct 28 6000. Phone Oct 15 is before it; Oct 31 is after.
		expect(first.payday).toBe('2026-10-16');
		expect(first.ends).toBe('2026-10-30');
		expect(first.pay).toBe(185000);
		expect(first.covers.map((o) => [o.date, o.itemId, o.amount])).toEqual([
			['2026-10-28', 'card', 6000]
		]);
		expect(first.coversTotal).toBe(6000);
		// Water is due Oct 31, after this paycheck's span, so its sixth share (index 5) falls here.
		expect(first.setAsides.map((s) => [s.itemId, s.share, s.dueDate])).toEqual([
			['water', 1714, '2026-10-31'],
			['insurance', 2077, '2027-09-30']
		]);
		expect(first.setAsideTotal).toBe(3791);
		expect(first.left).toBe(175209);
		expect(first.short).toBe(false);
		expect(first.shortBy).toBe(0);
	});

	it('Oct 30 covers rent, internet and water in full: 185000 - 137500 - 2077 = 45423', () => {
		// Covers (Oct 30, Nov 13]: internet 5500 and water 12000 on Oct 31, rent 120000 on Nov 1.
		expect(second.covers.map((o) => [o.date, o.itemId, o.amount])).toEqual([
			['2026-10-31', 'internet', 5500],
			['2026-10-31', 'water', 12000],
			['2026-11-01', 'rent', 120000]
		]);
		expect(second.coversTotal).toBe(137500);
		// Water is in covers, so it is not also a share. Insurance's third share is 2077.
		expect(second.setAsides.map((s) => [s.itemId, s.share])).toEqual([['insurance', 2077]]);
		expect(second.left).toBe(45423);
	});

	it('Nov 13 covers the phone bill: 185000 - 4500 - (2000 + 2077) = 176423', () => {
		expect(third.covers.map((o) => [o.date, o.itemId, o.amount])).toEqual([
			['2026-11-15', 'phone', 4500]
		]);
		expect(third.setAsides.map((s) => [s.itemId, s.share])).toEqual([
			['water', 2000],
			['insurance', 2077]
		]);
		expect(third.left).toBe(176423);
	});

	it('a bill due on a payday belongs to the paycheck before it, like periodFor', () => {
		// Feb 20 covers (Feb 20, Mar 6]: card and internet Feb 28 (6000, 5500), rent Mar 1 (120000)
		// and the laptop instalment ON payday Mar 6 (3750) = 135250.
		// Shares: water idx 1 of 6 = 2000 (Jan 31 cycle: Feb 6, Feb 20, Mar 6, Mar 20, Apr 3, Apr 17);
		// insurance idx 3 of 19 = 2842 (Jan 9, Jan 23 hold 2843). 185000 - 135250 - 4842 = 44908.
		const [feb20] = plan('2026-02-20', 1);
		expect(feb20.covers.map((o) => [o.date, o.itemId, o.amount])).toEqual([
			['2026-02-28', 'card', 6000],
			['2026-02-28', 'internet', 5500],
			['2026-03-01', 'rent', 120000],
			['2026-03-06', 'bnpl', 3750]
		]);
		expect(feb20.setAsides.map((s) => [s.itemId, s.share])).toEqual([
			['water', 2000],
			['insurance', 2842]
		]);
		expect(feb20.left).toBe(44908);
		for (const o of feb20.covers) {
			expect(periodFor(fixtureItems, fixtureOverrides, o.date)).toEqual({
				payday: feb20.payday,
				ends: feb20.ends
			});
		}
	});

	it('starts on a payday that is today, and after today when today is not one', () => {
		expect(plan('2026-10-16', 1)[0].payday).toBe('2026-10-16');
		expect(plan('2026-10-17', 1)[0].payday).toBe('2026-10-30');
	});

	it('returns six paychecks when asked for six, in payday order', () => {
		const six = plan('2026-10-16', 6);
		expect(six.map((p) => p.payday)).toEqual([
			'2026-10-16',
			'2026-10-30',
			'2026-11-13',
			'2026-11-27',
			'2026-12-11',
			'2026-12-25'
		]);
		expect(six.map((p) => p.ends)).toEqual([...six.slice(1).map((p) => p.payday), '2027-01-08']);
	});

	it('returns nothing for a count that is not a positive whole number', () => {
		expect(plan('2026-10-16', 0)).toEqual([]);
		expect(plan('2026-10-16', 1.5)).toEqual([]);
	});
});

describe('TSK-CA2DF6 a paycheck that cannot cover its bills is flagged with the shortfall', () => {
	const bill = (amount: number): Item => ({
		id: 'big',
		kind: 'bill',
		name: 'Dental work',
		amount: minor(amount),
		rule: { kind: 'monthly', day: 20 },
		startsOn: d('2026-01-01')
	});

	it('Nov 13 with a 1,800.00 bill on Nov 20: 185000 - (4500 + 180000) - 4077 = -3577', () => {
		const [nov13] = plan('2026-11-13', 1, [...fixtureItems, bill(180000)]);
		expect(nov13.coversTotal).toBe(184500);
		expect(nov13.setAsideTotal).toBe(4077);
		expect(nov13.left).toBe(-3577);
		expect(nov13.short).toBe(true);
		expect(nov13.shortBy).toBe(3577);
	});

	it('is not flagged when it covers everything exactly: 185000 - 4500 - 176423 - 4077 = 0', () => {
		const [nov13] = plan('2026-11-13', 1, [...fixtureItems, bill(176423)]);
		expect(nov13.left).toBe(0);
		expect(nov13.short).toBe(false);
	});
});

describe('TSK-3F0502 months with a third paycheck are labelled', () => {
	const six = plan('2026-10-16', 6);

	it('October 2026 has paydays on the 2nd, 16th and 30th, so its paychecks are flagged', () => {
		expect(six[0]).toMatchObject({ paydaysInMonth: 3, nthInMonth: 2, thirdPaycheckMonth: true });
		expect(six[1]).toMatchObject({ paydaysInMonth: 3, nthInMonth: 3, thirdPaycheckMonth: true });
	});

	it('November and December have two paydays each and are not flagged', () => {
		for (const p of six.slice(2)) {
			expect(p.paydaysInMonth).toBe(2);
			expect(p.thirdPaycheckMonth).toBe(false);
		}
		expect(six[2].nthInMonth).toBe(1);
		expect(six[3].nthInMonth).toBe(2);
	});

	it('May 2026 is the other three-paycheck month of the year (1, 15, 29)', () => {
		const may = plan('2026-05-01', 3);
		expect(may.map((p) => [p.payday, p.nthInMonth, p.thirdPaycheckMonth])).toEqual([
			['2026-05-01', 1, true],
			['2026-05-15', 2, true],
			['2026-05-29', 3, true]
		]);
	});
});
