import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import { minor, sum } from './money.ts';
import { planPaychecks } from './plan.ts';
import { fixtureItems, fixtureOverrides } from './fixture.ts';
import {
	MONTHLY_2026,
	monthlyItems,
	switchItems,
	TWICE_2026,
	twiceItems
} from './fixture.rhythm.ts';

describe('the plan follows the main pay', () => {
	/*
	 * TWICE, from 2026-01-01, six paychecks (seven paydays: Jan 15 ... Apr 15).
	 * Yearly insurance 120000 over 23 paydays (Jan 15 ... Dec 15 are 22 in Jan..Nov + Dec 15 = 23):
	 *   120000 / 23 = 5217 remainder 9 (23 * 5217 = 119991), so the first 9 shares are 5218.
	 *   9 * 5218 + 14 * 5217 = 46962 + 73038 = 120000.
	 * Bills on a payday belong to the paycheck before: phone Jan 15 is not in (Jan 15, Jan 31].
	 *   (Jan15,Jan31]: none                   left 90000 - 0     - 5218 = 84782
	 *   (Jan31,Feb15]: rent Feb 1 + phone Feb 15 = 84500    90000 - 84500 - 5218 = 282
	 *   (Feb15,Feb28]: none                   84782
	 *   (Feb28,Mar15]: rent Mar 1 + phone Mar 15 = 84500    282
	 *   (Mar15,Mar31]: none                   84782
	 *   (Mar31,Apr15]: rent Apr 1 + phone Apr 15 = 84500    282
	 */
	it('TSK-F95975 twice a month: six paychecks across February, with shares and what is left', () => {
		const plan = planPaychecks(twiceItems, [], d('2026-01-01'), 6);
		expect(plan.map((p) => [p.payday, p.ends])).toEqual([
			['2026-01-15', '2026-01-31'],
			['2026-01-31', '2026-02-15'],
			['2026-02-15', '2026-02-28'],
			['2026-02-28', '2026-03-15'],
			['2026-03-15', '2026-03-31'],
			['2026-03-31', '2026-04-15']
		]);
		expect(plan.map((p) => p.coversTotal)).toEqual([0, 84500, 0, 84500, 0, 84500]);
		expect(plan.map((p) => p.setAsideTotal)).toEqual(Array(6).fill(5218));
		expect(plan.map((p) => p.left)).toEqual([84782, 282, 84782, 282, 84782, 282]);
		expect(plan.every((p) => p.pay === 90000 && p.pays.length === 1)).toBe(true);
		expect(plan.every((p) => p.paydaysInMonth === 2 && !p.thirdPaycheckMonth)).toBe(true);
		expect(plan.map((p) => p.nthInMonth)).toEqual([1, 2, 1, 2, 1, 2]);
	});

	it('TSK-F95975 twice a month: a whole year is 24 paychecks, one after the other', () => {
		// 25 paydays are needed for 24 paychecks: Jan 15 2026 ... Dec 31 2026 and Jan 15 2027.
		const plan = planPaychecks(twiceItems, [], d('2026-01-01'), 24);
		expect(plan).toHaveLength(24);
		expect(plan.map((p) => p.payday)).toEqual(TWICE_2026);
		for (let i = 1; i < plan.length; i++) expect(plan[i].payday).toBe(plan[i - 1].ends);
		expect(plan[23].ends).toBe(d('2027-01-15'));
		// Every bill in the year lands in exactly one paycheck: 12 rents and 12 phones before Jan 15 2027
		// (rent Jan 1 2026 is before the first payday and not planned: 11 + Jan 1 2027 = 12 rents).
		const covers = plan.flatMap((p) => p.covers);
		expect(covers.filter((o) => o.itemId === 'rent')).toHaveLength(12);
		expect(covers.filter((o) => o.itemId === 'phone')).toHaveLength(12);
	});

	it('TSK-F95975 twice a month: the shares of the yearly bill add up to the bill', () => {
		const plan = planPaychecks(twiceItems, [], d('2026-01-01'), 24);
		const shares = plan
			.flatMap((p) => p.setAsides)
			.filter((s) => s.dueDate === d('2026-12-20'))
			.map((s) => s.share);
		// The paycheck holding Dec 20 (Dec 15 to Dec 31) covers it in full: no share there. Its
		// 23rd share, 5217, is the one not listed: 22 shares are (9 * 5218) + (13 * 5217).
		expect(shares).toHaveLength(22);
		expect(sum(shares)).toBe(120000 - 5217);
		expect(sum(shares) + 5217).toBe(120000);
		const dec = plan.find((p) => p.payday === d('2026-12-15'))!;
		expect(dec.setAsides).toEqual([]);
		expect(dec.covers.map((o) => [o.itemId, o.amount])).toEqual([['insurance', 120000]]);
		expect(dec.short).toBe(true);
		expect(dec.shortBy).toBe(30000);
	});

	/*
	 * MONTHLY on the 31st, from 2026-01-01, six paychecks (seven paydays: Jan 31 ... Jul 31).
	 * Yearly insurance 120000 over 11 paydays (Jan 31 ... Nov 30):
	 *   120000 / 11 = 10909 remainder 1 (11 * 10909 = 119999): the first share is 10910.
	 * Each paycheck covers one rent (the 1st) and one phone (the 15th): 84500.
	 *   left = 200000 - 84500 - share: 115500 - 10910 = 104590, then 115500 - 10909 = 104591.
	 */
	it('TSK-F95975 monthly: six paychecks, one payday a month, February is 28 days', () => {
		const plan = planPaychecks(monthlyItems, [], d('2026-01-01'), 6);
		expect(plan.map((p) => [p.payday, p.ends])).toEqual([
			['2026-01-31', '2026-02-28'],
			['2026-02-28', '2026-03-31'],
			['2026-03-31', '2026-04-30'],
			['2026-04-30', '2026-05-31'],
			['2026-05-31', '2026-06-30'],
			['2026-06-30', '2026-07-31']
		]);
		expect(plan.map((p) => p.coversTotal)).toEqual(Array(6).fill(84500));
		expect(plan.map((p) => p.setAsideTotal)).toEqual([10910, 10909, 10909, 10909, 10909, 10909]);
		expect(plan.map((p) => p.left)).toEqual([104590, 104591, 104591, 104591, 104591, 104591]);
		expect(plan.every((p) => p.pay === 200000 && p.pays.length === 1)).toBe(true);
		expect(plan.every((p) => p.paydaysInMonth === 1 && p.nthInMonth === 1)).toBe(true);
	});

	it('TSK-F95975 monthly: the horizon holds seven monthly paydays from any start', () => {
		// From Dec 1 2026 the seven paychecks run Dec 31 ... Jul 31 2027: 242 days, more than the
		// old (7 + 1) * 14 + 62 = 174-day horizon.
		const plan = planPaychecks(monthlyItems, [], d('2026-12-01'), 7);
		expect(plan.map((p) => p.payday)).toEqual(
			[
				'2026-12-31',
				'2027-01-31',
				'2027-02-28',
				'2027-03-31',
				'2027-04-30',
				'2027-05-31',
				'2027-06-30'
			].map(d)
		);
		expect(plan.at(-1)!.ends).toBe(d('2027-07-31'));
		expect(planPaychecks(monthlyItems, [], d('2026-01-01'), 11)).toHaveLength(11);
	});

	it('TSK-F95975 monthly: the year is 12 paydays', () => {
		const plan = planPaychecks(monthlyItems, [], d('2026-01-01'), 12);
		expect(plan.map((p) => p.payday)).toEqual(MONTHLY_2026);
		expect(plan[11].ends).toBe(d('2027-01-31'));
		// The paycheck from Nov 30 holds Dec 20 in full; the 10 paychecks before it, plus the
		// Oct 31 payday's, carry the shares: 10910 + 9 * 10909 = 109091 up to Oct 31 and 10909 more
		// (Nov 30's) is the 11th share, not listed.
		const shares = plan
			.flatMap((p) => p.setAsides)
			.filter((s) => s.dueDate === d('2026-12-20'))
			.map((s) => s.share);
		expect(shares).toHaveLength(10);
		expect(sum(shares)).toBe(109091);
		expect(sum(shares) + 10909).toBe(120000);
	});

	it('TSK-F95975 other income does not make paydays or `pays`', () => {
		const withSide = [
			...twiceItems,
			{
				id: 'side',
				kind: 'income' as const,
				name: 'Side job',
				amount: minor(7000),
				rule: { kind: 'every14' as const, anchor: d('2026-01-02') },
				startsOn: d('2026-01-01')
			}
		];
		const plan = planPaychecks(withSide, [], d('2026-01-01'), 6);
		expect(plan.map((p) => p.payday)).toEqual(TWICE_2026.slice(0, 6));
		expect(plan.every((p) => p.pay === 90000 && p.pays.length === 1)).toBe(true);
	});
});

describe('a rhythm switch in the plan', () => {
	/*
	 * Every 14 days to Mar 6, then the 15th and the last day. Yearly 100000 due Dec 20 over the
	 * paydays Jan 1 to Dec 19: Jan 9, 23, Feb 6, 20, Mar 6 = 5; Mar 15, Mar 31 = 2; Apr to Nov
	 * 8 * 2 = 16; Dec 15 = 1; total 24.
	 *   100000 / 24 = 4166 remainder 16 (24 * 4166 = 99984): the first 16 shares are 4167.
	 *   16 * 4167 + 8 * 4166 = 66672 + 33328 = 100000.
	 * The gym (3000, the 10th) falls in (Jan 9, 23], (Feb 6, 20] and, across the switch, (Mar 6, 15].
	 */
	it('TSK-0C2E2E paychecks run on without a gap or a double payday across the switch', () => {
		const plan = planPaychecks(switchItems, [], d('2026-01-09'), 8);
		expect(plan.map((p) => [p.payday, p.ends])).toEqual([
			['2026-01-09', '2026-01-23'],
			['2026-01-23', '2026-02-06'],
			['2026-02-06', '2026-02-20'],
			['2026-02-20', '2026-03-06'],
			['2026-03-06', '2026-03-15'],
			['2026-03-15', '2026-03-31'],
			['2026-03-31', '2026-04-15'],
			['2026-04-15', '2026-04-30']
		]);
		expect(plan.map((p) => p.pay)).toEqual([
			100000, 100000, 100000, 100000, 100000, 90000, 90000, 90000
		]);
		expect(plan.map((p) => p.pays.map((o) => o.itemId))).toEqual([
			['pay-old'],
			['pay-old'],
			['pay-old'],
			['pay-old'],
			['pay-old'],
			['pay-new'],
			['pay-new'],
			['pay-new']
		]);
		expect(plan.slice(0, 5).map((p) => p.coversTotal)).toEqual([3000, 0, 3000, 0, 3000]);
		expect(plan.slice(0, 5).map((p) => p.setAsideTotal)).toEqual(Array(5).fill(4167));
	});

	it('TSK-0C2E2E the set-asides complete on time: shares add up to the bill by its due date', () => {
		const plan = planPaychecks(switchItems, [], d('2026-01-09'), 24);
		expect(plan).toHaveLength(24);
		const shares = plan.flatMap((p) => p.setAsides.map((s) => s.share));
		// 23 shares are listed (Dec 15's paycheck holds the bill in full); the 24th is 4166.
		expect(shares).toHaveLength(23);
		expect(sum(shares)).toBe(16 * 4167 + 7 * 4166);
		expect(sum(shares) + 4166).toBe(100000);
		expect(plan.at(-1)!.payday).toBe(d('2026-12-15'));
	});
});

describe('every 14 days keeps its plan', () => {
	it('TSK-F95975 the household of fixture.ts plans to the same 14-day paychecks', () => {
		const plan = planPaychecks(fixtureItems, fixtureOverrides, d('2026-01-09'), 26);
		expect(plan).toHaveLength(26);
		expect(plan[0].payday).toBe(d('2026-01-09'));
		expect(plan[25].payday).toBe(d('2026-12-25'));
		for (const p of plan) expect(p.pays).toHaveLength(1);
		for (let i = 1; i < plan.length; i++) expect(plan[i].payday).toBe(plan[i - 1].ends);
	});
});
