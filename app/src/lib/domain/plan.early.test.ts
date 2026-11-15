/*
 * TSK-15DF8B, TSK-7642D5: an early payment in the plan. Household in fixture.early.ts; the plan
 * from Nov 13, three paychecks: Nov 13..27, Nov 27..Dec 11, Dec 11..Dec 25. Pay is 100000.
 *   Paycheck 1 covers gym 3000 + phone 5000 = 8000 and sets aside 7500 toward the insurance
 *     (8 cycle paydays, Sep 4 .. Dec 11): left 100000 - 8000 - 7500 = 84500.
 *   Paycheck 2 covers rent 40000 and sets aside 7500: left 52500.
 *   Paycheck 3 covers gym 3000, phone Dec 25 5000 and the insurance 60000 (due Dec 20, inside it): 68000: no share, left 32000.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import { planPaychecks } from './plan.ts';
import type { PaidMark } from './schedule.ts';
import { earlyItems, mark } from './fixture.early.ts';

const plan = (marks: PaidMark[] = []) => planPaychecks(earlyItems, [], d('2026-11-13'), 3, marks);

describe('TSK-15DF8B the plan with no marks', () => {
	it('is the hand-calculated base', () => {
		const p = plan();
		expect(p.map((c) => c.coversTotal)).toEqual([8000, 40000, 68000]);
		expect(p.map((c) => c.setAsideTotal)).toEqual([7500, 7500, 0]);
		expect(p.map((c) => c.left)).toEqual([84500, 52500, 32000]);
		expect(p.map((c) => c.paidEarlyTotal)).toEqual([0, 0, 0]);
		expect(p.flatMap((c) => c.covers).some((l) => 'paidEarly' in l)).toBe(false);
	});
});

describe('TSK-15DF8B an early payment is not held back by its paycheck', () => {
	it('rent paid early: the line stays, flagged, and leaves coversTotal and left', () => {
		// Paycheck 2: coversTotal 0, left 100000 - 0 - 7500 = 92500; the line is still in covers.
		const p = plan([mark('rent', '2026-12-01', '2026-11-16')]);
		expect(p[1].covers).toHaveLength(1);
		expect(p[1].covers[0]).toMatchObject({
			itemId: 'rent',
			amount: 40000,
			paidEarly: true,
			paidOn: d('2026-11-16')
		});
		expect(p[1].coversTotal).toBe(0);
		expect(p[1].paidEarlyTotal).toBe(40000);
		expect(p[1].left).toBe(92500);
		expect(p[1].short).toBe(false);
		expect(p.map((c) => c.left)).toEqual([84500, 92500, 32000]);
	});

	it('gym paid early in paycheck 1: only the phone is held back', () => {
		// 100000 - 5000 - 7500 = 87500.
		const p = plan([mark('gym', '2026-11-20', '2026-11-16')]);
		expect(p[0].coversTotal).toBe(5000);
		expect(p[0].covers.map((l) => l.paidEarly === true)).toEqual([true, false]);
		expect(p[0].left).toBe(87500);
	});
});

describe('TSK-15DF8B a yearly bill paid early stops its set-aside shares', () => {
	it('no paycheck saves for it; its line in paycheck 3 is flagged', () => {
		// P1: 100000 - 8000 = 92000. P2: 100000 - 40000 = 60000.
		// P3: gym + phone 8000 held, insurance 60000 flagged: left 100000 - 8000 = 92000.
		const p = plan([mark('insurance', '2026-12-20', '2026-11-16')]);
		expect(p.map((c) => c.setAsideTotal)).toEqual([0, 0, 0]);
		expect(p.map((c) => c.left)).toEqual([92000, 60000, 92000]);
		expect(p[2].coversTotal).toBe(8000);
		expect(p[2].paidEarlyTotal).toBe(60000);
	});
});

describe('TSK-7642D5 a mark that is not early, or taken off, changes nothing', () => {
	it('a mark on or after the due date leaves the plan as it was', () => {
		const base = plan();
		expect(plan([mark('gym', '2026-11-20', '2026-11-20')])).toEqual(base);
		expect(plan([mark('rent', '2026-12-01', '2026-12-03')])).toEqual(base);
	});

	it('taking the mark off puts the reservation back', () => {
		expect(plan([])).toEqual(plan());
		expect(plan([mark('rent', '2026-12-01', '2026-11-16')])[1].left).toBe(92500);
		expect(plan([])[1].left).toBe(52500);
	});
});
