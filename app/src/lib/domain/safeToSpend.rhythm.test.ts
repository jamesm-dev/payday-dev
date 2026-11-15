import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import { minor } from './money.ts';
import { safeToSpend } from './safeToSpend.ts';
import { monthlyItems, switchItems, twiceItems } from './fixture.rhythm.ts';

/*
 * Shares of the 120000 yearly insurance (due Dec 20 2026, cycle Jan 1 to Dec 19):
 *   TWICE, 23 paydays: 9 shares of 5218 then 14 of 5217 (23 * 5217 = 119991, remainder 9).
 *   MONTHLY, 11 paydays: 1 share of 10910 then 10 of 10909 (11 * 10909 = 119999, remainder 1).
 *   SWITCH (100000), 24 paydays: 16 shares of 4167 then 8 of 4166 (24 * 4166 = 99984, remainder 16).
 */
describe('the number follows the main pay', () => {
	it('TSK-F95975 twice a month: a payday ahead with rent and phone reserved', () => {
		// Today Feb 1, balance read Jan 31. The next payday is Feb 15. Reserved after Jan 31 up to
		// Feb 15: rent Feb 1 80000 and phone Feb 15 4500 (a bill ON the payday is still that
		// paycheck's) = 84500. Held: paydays on or before Feb 1 are Jan 15 and Jan 31 = 2 * 5218 = 10436.
		// 150000 - 10436 - 84500 = 55064.
		const result = safeToSpend({
			items: twiceItems,
			overrides: [],
			balance: minor(150000),
			balanceAsOf: d('2026-01-31'),
			today: d('2026-02-01')
		});
		expect(result.nextPayday).toBe(d('2026-02-15'));
		expect(result.reserved.map((o) => o.amount)).toEqual([80000, 4500]);
		expect(result.setAsides.map((s) => s.held)).toEqual([10436]);
		expect(result.amount).toBe(55064);
	});

	it('TSK-F95975 twice a month: nothing reserved, only the set-aside comes off', () => {
		// Today Mar 20, balance read Mar 15. Next payday Mar 31. Nothing is due in (Mar 15, Mar 31].
		// Paydays held so far: Jan 15, Jan 31, Feb 15, Feb 28, Mar 15 = 5 * 5218 = 26090.
		// 150000 - 26090 = 123910.
		const result = safeToSpend({
			items: twiceItems,
			overrides: [],
			balance: minor(150000),
			balanceAsOf: d('2026-03-15'),
			today: d('2026-03-20')
		});
		expect(result.nextPayday).toBe(d('2026-03-31'));
		expect(result.reserved).toEqual([]);
		expect(result.balanceIsStale).toBe(false);
		expect(result.amount).toBe(123910);
	});

	it('TSK-F95975 monthly: the 28-day February gap, matching the plan', () => {
		// Today Feb 10, balance read Jan 31. Next payday Feb 28. Reserved: rent Feb 1 + phone Feb 15
		// = 84500. Held: Jan 31 = 10910. 200000 - 10910 - 84500 = 104590, the plan's `left`.
		const result = safeToSpend({
			items: monthlyItems,
			overrides: [],
			balance: minor(200000),
			balanceAsOf: d('2026-01-31'),
			today: d('2026-02-10')
		});
		expect(result.nextPayday).toBe(d('2026-02-28'));
		expect(result.amount).toBe(104590);
	});

	it('TSK-F95975 monthly: on a payday itself, the next one is a month away and the pay counts', () => {
		// Today Feb 28 (a payday), balance 100000 read Feb 20 before the pay. Next payday Mar 31.
		// Income since the balance: the pay on Feb 28 = 200000. Reserved (Feb 20, Mar 31]:
		// rent Mar 1 80000 + phone Mar 15 4500 = 84500. Held: Jan 31 and Feb 28 = 10910 + 10909 = 21819.
		// 100000 + 200000 - 21819 - 84500 = 193681. The balance was read before the payday: stale.
		const result = safeToSpend({
			items: monthlyItems,
			overrides: [],
			balance: minor(100000),
			balanceAsOf: d('2026-02-20'),
			today: d('2026-02-28')
		});
		expect(result.nextPayday).toBe(d('2026-03-31'));
		expect(result.incomeSinceBalance.map((o) => o.amount)).toEqual([200000]);
		expect(result.balanceIsStale).toBe(true);
		expect(result.amount).toBe(193681);
	});

	it('TSK-F95975 monthly: the set-aside held reaches the bill but for the last share', () => {
		// Today Oct 31, balance 500000 read that day. Next payday Nov 30, before Dec 20, so the bill is
		// held, not reserved. Held: Jan 31 to Oct 31 = 10 paydays: 10910 + 9 * 10909 = 109091.
		// Reserved (Oct 31, Nov 30]: rent Nov 1 + phone Nov 15 = 84500. 500000 - 109091 - 84500 = 306409.
		const result = safeToSpend({
			items: monthlyItems,
			overrides: [],
			balance: minor(500000),
			balanceAsOf: d('2026-10-31'),
			today: d('2026-10-31')
		});
		expect(result.setAsides.map((s) => s.held)).toEqual([109091]);
		expect(result.amount).toBe(306409);
	});

	it('TSK-F95975 twice a month: the held amount is the bill less the last share on Nov 30', () => {
		// Today Nov 30, next payday Dec 15 is before Dec 20: held = paydays Jan 15 ... Nov 30 = 22 =
		// 9 * 5218 + 13 * 5217 = 46962 + 67821 = 114783 = 120000 - 5217 (the Dec 15 share).
		const result = safeToSpend({
			items: twiceItems,
			overrides: [],
			balance: minor(500000),
			balanceAsOf: d('2026-11-30'),
			today: d('2026-11-30')
		});
		expect(result.setAsides.map((s) => s.held)).toEqual([114783]);
		expect(result.setAsides[0].held + 5217).toBe(120000);
	});

	it('TSK-0C2E2E across the rhythm switch the number carries on from the old payday', () => {
		// Today Mar 6 (the last old payday), balance 100000 read that day. Next payday Mar 15 (new
		// rhythm). Reserved (Mar 6, Mar 15]: gym Mar 10 = 3000. Held: 5 paydays (Jan 9, 23, Feb 6,
		// 20, Mar 6) = 5 * 4167 = 20835. 100000 - 20835 - 3000 = 76165.
		const result = safeToSpend({
			items: switchItems,
			overrides: [],
			balance: minor(100000),
			balanceAsOf: d('2026-03-06'),
			today: d('2026-03-06')
		});
		expect(result.nextPayday).toBe(d('2026-03-15'));
		expect(result.reserved.map((o) => o.amount)).toEqual([3000]);
		expect(result.setAsides.map((s) => s.held)).toEqual([20835]);
		expect(result.amount).toBe(76165);
	});

	it('TSK-0C2E2E the switch bill is held in full but for its last share by Nov 30', () => {
		// Paydays Jan 9 ... Nov 30 = 23: 16 * 4167 + 7 * 4166 = 66672 + 29162 = 95834 = 100000 - 4166.
		const result = safeToSpend({
			items: switchItems,
			overrides: [],
			balance: minor(500000),
			balanceAsOf: d('2026-11-30'),
			today: d('2026-11-30')
		});
		expect(result.setAsides.map((s) => s.held)).toEqual([95834]);
		expect(result.setAsides[0].held + 4166).toBe(100000);
	});
});
