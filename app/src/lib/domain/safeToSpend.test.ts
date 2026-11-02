/*
 * Hand calculations for the fixture household (see fixture.ts).
 *
 * Paydays are every 14 days from Fri 2026-01-09, 1,850.00 each:
 *   Jan 9, 23 | Feb 6, 20 | Mar 6, 20 | Apr 3, 17 | May 1, 15, 29 | Jun 12, 26 | Jul 10, 24
 *   Aug 7, 21 | Sep 4, 18 | Oct 2, 16, 30 | Nov 13, 27 | Dec 11, 25 | then 2027: Jan 8, 22
 * Water (120.00, quarterly) falls Jan 31, Apr 30, Jul 31, Oct 31, then 2027-01-31.
 * Insurance (540.00, yearly) falls 2026-09-30 and 2027-09-30; nothing is before startsOn 2026-01-01,
 * so the 2026-09-30 cycle starts on 2026-01-01.
 *
 * Insurance cycle 1: paydays in [2026-01-01, 2026-09-30) = Jan 2 + Feb 2 + Mar 2 + Apr 2 + May 3
 *   + Jun 2 + Jul 2 + Aug 2 + Sep 2 = 19. 54000 / 19 = 2842 remainder 2 (19 * 2842 = 53998), so
 *   the first two shares are 2843 and the other 17 are 2842.
 * Insurance cycle 2: paydays in [2026-09-30, 2027-09-30) = Oct 2, 2026 then every 14 days to
 *   Sep 17, 2027 = 26 (Oct 2 + 350 days; the next, 2027-10-01, is after the due date).
 *   54000 / 26 = 2076 remainder 24 (26 * 2076 = 53976), so the first 24 shares are 2077 and the
 *   last two 2076.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates';
import { fixtureBalance, fixtureItems, fixtureOverrides } from './fixture';
import { minor } from './money';
import { safeToSpend } from './safeToSpend';
import type { Item } from './schedule';

function run(balance: number, balanceAsOf: string, today: string) {
	return safeToSpend({
		items: fixtureItems,
		overrides: fixtureOverrides,
		balance: minor(balance),
		balanceAsOf: d(balanceAsOf),
		today: d(today)
	});
}

const brief = (r: ReturnType<typeof run>) => ({
	reserved: r.reserved.map((o) => [o.date, o.itemId, o.amount]),
	income: r.incomeSinceBalance.map((o) => [o.date, o.amount]),
	setAsides: r.setAsides.map((s) => [s.itemId, s.dueDate, s.held])
});

describe('TSK-4EF766 safe to spend on a payday (2026-10-16)', () => {
	/*
	 * Balance 1,500.00 (150000) as of Fri 2026-10-02. Today is payday 2026-10-16; the next is 10-30.
	 *   Income landed in (10-02, 10-16]: Oct 16 pay 185000.
	 *   Reserved, dated in (10-02, 10-30]: phone Oct 15 4500, card Oct 28 6000 = 10500.
	 *     (Rent Oct 1 is before the balance; internet and water fall Oct 31, after the next payday.)
	 *   Water falls Oct 31 > Oct 30, so it is set aside. Cycle [Jul 31, Oct 31): paydays Aug 7,
	 *     Aug 21, Sep 4, Sep 18, Oct 2, Oct 16, Oct 30 = 7. 12000 / 7 = 1714 rem 2, so shares are
	 *     1715, 1715, then five of 1714. Held for paydays <= Oct 16 (six): 1715 + 1715 + 4 * 1714
	 *     = 3430 + 6856 = 10286.
	 *   Insurance next falls 2027-09-30. Cycle 2 shares are 2077 each at first; held for Oct 2 and
	 *     Oct 16 = 4154.
	 *   amount = 150000 + 185000 - 10500 - 10286 - 4154 = 335000 - 24940 = 310060 (3,100.60).
	 *   Stale: balance (Oct 2) is before the last payday (Oct 16, today), so yes.
	 */
	const r = run(150000, '2026-10-02', '2026-10-16');

	it('matches the hand calculation', () => {
		expect(r.amount).toBe(310060);
		expect(r.nextPayday).toBe('2026-10-30');
		expect(brief(r)).toEqual({
			reserved: [
				['2026-10-15', 'phone', 4500],
				['2026-10-28', 'card', 6000]
			],
			income: [['2026-10-16', 185000]],
			setAsides: [
				['water', '2026-10-31', 10286],
				['insurance', '2027-09-30', 4154]
			]
		});
		expect(r.balanceIsStale).toBe(true);
		expect(r.shortfall).toBeNull();
	});
});

describe('TSK-4EF766 safe to spend the day before a payday (2026-02-19)', () => {
	/*
	 * Balance 1,200.00 (120000) as of payday 2026-02-06. Today Thu 02-19; the next payday is 02-20.
	 *   Income in (02-06, 02-19]: none (the Feb 20 pay is still tomorrow).
	 *   Reserved in (02-06, 02-20]: phone Feb 15 4500, and the laptop instalment due Feb 20 3750
	 *     (a bill due ON a payday belongs to the previous paycheck, so it is reserved now)
	 *     = 8250. Rent Feb 1 is before the balance; card and internet fall Feb 28.
	 *   Water next falls Apr 30. Cycle [Jan 31, Apr 30): Feb 6, Feb 20, Mar 6, Mar 20, Apr 3,
	 *     Apr 17 = 6 paydays; 12000 / 6 = 2000 each. Held for paydays <= Feb 19: Feb 6 = 2000.
	 *   Insurance falls Sep 30 (cycle 1, 19 shares 2843, 2843, 2842...). Held for paydays <= Feb 19:
	 *     Jan 9, Jan 23, Feb 6 = 2843 + 2843 + 2842 = 8528.
	 *   amount = 120000 + 0 - 8250 - 2000 - 8528 = 120000 - 18778 = 101222 (1,012.22).
	 *   Stale: balance (Feb 6) equals the last payday, so no.
	 */
	const r = run(120000, '2026-02-06', '2026-02-19');

	it('matches the hand calculation', () => {
		expect(r.amount).toBe(101222);
		expect(r.nextPayday).toBe('2026-02-20');
		expect(brief(r)).toEqual({
			reserved: [
				['2026-02-15', 'phone', 4500],
				['2026-02-20', 'bnpl', 3750]
			],
			income: [],
			setAsides: [
				['water', '2026-04-30', 2000],
				['insurance', '2026-09-30', 8528]
			]
		});
		expect(r.balanceIsStale).toBe(false);
		expect(r.shortfall).toBeNull();
	});
});

describe('TSK-4EF766 safe to spend at a month end (2026-07-31)', () => {
	/*
	 * Balance 3,000.00 (300000) as of payday Fri 2026-07-24. Today Fri 07-31, a 31st; next payday
	 * is Aug 7.
	 *   Income in (07-24, 07-31]: none.
	 *   Reserved in (07-24, 08-07]: card Jul 28 6000, internet Jul 31 5500 (day 31 in a 31-day
	 *     month), water Jul 31 12000, rent Aug 1 120000 = 143500. Phone Jul 15 is before the
	 *     balance; phone Aug 15 is after the next payday.
	 *   Water is now paid; its next due date is Oct 31 (> Aug 7), a fresh cycle [Jul 31, Oct 31)
	 *     whose first payday is Aug 7, so nothing is held yet: 0.
	 *   Insurance cycle 1 (19 shares: two of 2843, seventeen of 2842). Paydays <= Jul 31 are
	 *     Jan 2 + Feb 2 + Mar 2 + Apr 2 + May 3 + Jun 2 + Jul 2 = 15 shares:
	 *     2843 + 2843 + 13 * 2842 = 5686 + 36946 = 42632.
	 *   amount = 300000 + 0 - 143500 - 0 - 42632 = 156500 - 42632 = 113868 (1,138.68).
	 */
	const r = run(300000, '2026-07-24', '2026-07-31');

	it('matches the hand calculation', () => {
		expect(r.amount).toBe(113868);
		expect(r.nextPayday).toBe('2026-08-07');
		expect(brief(r)).toEqual({
			reserved: [
				['2026-07-28', 'card', 6000],
				['2026-07-31', 'internet', 5500],
				['2026-07-31', 'water', 12000],
				['2026-08-01', 'rent', 120000]
			],
			income: [],
			setAsides: [
				['insurance', '2026-09-30', 42632],
				['water', '2026-10-31', 0]
			]
		});
		expect(r.balanceIsStale).toBe(false);
		expect(r.shortfall).toBeNull();
	});
});

describe('TSK-4EF766 safe to spend in a three-paycheck month (2026-05-29)', () => {
	/*
	 * May 2026 has paydays May 1, 15 and 29. Balance 1,000.00 (100000) as of May 1. Today is the
	 * third payday, 05-29; the next is Jun 12.
	 *   Income in (05-01, 05-29]: May 15 + May 29 = 185000 + 185000 = 370000.
	 *   Reserved in (05-01, 06-12]: phone May 15 4500; card, changed by the fixture override from
	 *     May 28 / 60.00 to May 26 / 72.50 = 7250; internet May 31 5500; rent Jun 1 120000
	 *     = 4500 + 7250 + 5500 + 120000 = 137250. (Rent May 1 is before the balance.)
	 *   Water next falls Jul 31. Cycle [Apr 30, Jul 31): May 1, 15, 29, Jun 12, 26, Jul 10, 24 = 7;
	 *     12000 / 7 = 1714 rem 2: 1715, 1715, 1714... Held for May 1, 15, 29 = 1715 + 1715 + 1714
	 *     = 5144.
	 *   Insurance cycle 1: paydays <= May 29 are 2 + 2 + 2 + 2 + 3 = 11 shares:
	 *     2843 + 2843 + 9 * 2842 = 5686 + 25578 = 31264.
	 *   amount = 100000 + 370000 - 137250 - 5144 - 31264
	 *          = 470000 - 137250 = 332750; - 5144 = 327606; - 31264 = 296342 (2,963.42).
	 *   Stale: the balance (May 1) is before the last payday (May 29).
	 */
	const r = run(100000, '2026-05-01', '2026-05-29');

	it('matches the hand calculation', () => {
		expect(r.amount).toBe(296342);
		expect(r.nextPayday).toBe('2026-06-12');
		expect(brief(r)).toEqual({
			reserved: [
				['2026-05-15', 'phone', 4500],
				['2026-05-26', 'card', 7250],
				['2026-05-31', 'internet', 5500],
				['2026-06-01', 'rent', 120000]
			],
			income: [
				['2026-05-15', 185000],
				['2026-05-29', 185000]
			],
			setAsides: [
				['water', '2026-07-31', 5144],
				['insurance', '2026-09-30', 31264]
			]
		});
		expect(r.balanceIsStale).toBe(true);
	});
});

describe('TSK-4EF766 safe to spend while a yearly set-aside is held (2026-12-17)', () => {
	/*
	 * Balance 500.00 (50000) as of payday Fri 2026-12-11. Today Thu 12-17; next payday Dec 25.
	 *   Income in (12-11, 12-17]: none.
	 *   Reserved in (12-11, 12-25]: phone Dec 15 4500. (Rent Dec 1 is before the balance; card
	 *     Dec 28, internet Dec 31 and rent Jan 1 are after the next payday.)
	 *   Insurance next falls 2027-09-30; its cycle began 2026-09-30 with 26 shares of 2077 (first
	 *     24) and 2076. Paydays Oct 2, Oct 16, Oct 30, Nov 13, Nov 27, Dec 11 are <= Dec 17:
	 *     6 * 2077 = 12462 held.
	 *   Water paid Oct 31 and next falls 2027-01-31. Cycle [Oct 31, Jan 31): Nov 13, Nov 27, Dec 11,
	 *     Dec 25, Jan 8, Jan 22 = 6 paydays; 12000 / 6 = 2000. Held for Nov 13, Nov 27, Dec 11
	 *     = 6000.
	 *   amount = 50000 + 0 - 4500 - 6000 - 12462 = 45500 - 6000 = 39500; - 12462 = 27038 (270.38).
	 *   Stale: the balance (Dec 11) equals the last payday, so no.
	 */
	const r = run(50000, '2026-12-11', '2026-12-17');

	it('matches the hand calculation', () => {
		expect(r.amount).toBe(27038);
		expect(r.nextPayday).toBe('2026-12-25');
		expect(brief(r)).toEqual({
			reserved: [['2026-12-15', 'phone', 4500]],
			income: [],
			setAsides: [
				['water', '2027-01-31', 6000],
				['insurance', '2027-09-30', 12462]
			]
		});
		expect(r.balanceIsStale).toBe(false);
	});

	it('shows the full bill amount beside what is held', () => {
		expect(r.setAsides.map((s) => [s.name, s.amount])).toEqual([
			['Water', 12000],
			['Car insurance', 54000]
		]);
	});
});

describe('TSK-4EF766 stale balance', () => {
	it('is stale when the balance predates the last payday, and not when it is on it', () => {
		// Today Oct 9: the last payday is Oct 2.
		expect(run(100000, '2026-10-01', '2026-10-09').balanceIsStale).toBe(true);
		expect(run(100000, '2026-10-02', '2026-10-09').balanceIsStale).toBe(false);
		expect(run(100000, '2026-10-09', '2026-10-09').balanceIsStale).toBe(false);
	});

	it('still counts the income that landed since a stale balance', () => {
		// Balance as of Oct 1; Oct 2 pay has landed by Oct 9.
		const r = run(100000, '2026-10-01', '2026-10-09');
		expect(r.incomeSinceBalance.map((o) => o.date)).toEqual(['2026-10-02']);
	});
});

describe('TSK-4EF766 shortfall', () => {
	/*
	 * Same day as the month-end case (2026-07-31) with only 900.00 (90000) as of 07-24.
	 *   Reserved: card 6000, internet 5500, water 12000, rent 120000 = 143500. Held: 0 + 42632.
	 *   amount = 90000 - 143500 - 42632 = -96132, so 961.32 is short.
	 *   Available for the reserved items = 90000 - 42632 = 47368. In date order the running total
	 *   is 6000, 11500, 23500 (all within 47368), then rent takes it to 143500: rent is the item
	 *   that cannot be covered.
	 */
	const r = run(90000, '2026-07-24', '2026-07-31');

	it('says how much is short and what cannot be covered', () => {
		expect(r.amount).toBe(-96132);
		expect(r.shortfall).not.toBeNull();
		expect(r.shortfall?.short).toBe(96132);
		expect(r.shortfall?.available).toBe(47368);
		expect(r.shortfall?.uncovered.map((o) => [o.itemId, o.date, o.amount])).toEqual([
			['rent', '2026-08-01', 120000]
		]);
	});

	it('is null at exactly zero', () => {
		// 113868 is the month-end amount for a balance of 300000, so 300000 - 113868 = 186132 gives 0.
		const zero = run(186132, '2026-07-24', '2026-07-31');
		expect(zero.amount).toBe(0);
		expect(zero.shortfall).toBeNull();
	});

	it('marks everything uncovered when set-asides alone exceed the money', () => {
		// Balance 100.00 on Jul 31 with nothing reserved: only the held 42632 for insurance counts.
		const items: Item[] = fixtureItems.filter((i) => i.id === 'pay' || i.id === 'insurance');
		const s = safeToSpend({
			items,
			overrides: [],
			balance: minor(10000),
			balanceAsOf: d('2026-07-24'),
			today: d('2026-07-31')
		});
		expect(s.amount).toBe(10000 - 42632);
		expect(s.shortfall).toMatchObject({
			short: 32632,
			available: -32632,
			uncovered: [],
			cause: 'held'
		});
	});
});

describe('TSK-B9D04D set-asides', () => {
	const pay: Item = {
		id: 'pay',
		kind: 'income',
		name: 'Pay',
		amount: minor(185000),
		rule: { kind: 'every14', anchor: d('2026-01-09') },
		startsOn: d('2026-01-09')
	};
	// Starts on the first payday, so its first cycle is [2026-01-09, 2026-02-20): Jan 9, Jan 23,
	// Feb 6 = 3 paydays; 10000 / 3 = 3333 rem 1: 3334, 3333, 3333.
	const fee: Item = {
		id: 'fee',
		kind: 'bill',
		name: 'Annual fee',
		amount: minor(10000),
		rule: { kind: 'yearly', anchor: d('2026-02-20') },
		startsOn: d('2026-01-09')
	};

	function on(today: string, balanceAsOf = today) {
		return safeToSpend({
			items: [pay, fee],
			overrides: [],
			balance: minor(100000),
			balanceAsOf: d(balanceAsOf),
			today: d(today)
		});
	}

	it('gives the first paydays the remainder: 3334, 3333, 3333', () => {
		expect(on('2026-01-09').setAsides[0].held).toBe(3334);
		expect(on('2026-01-23').setAsides[0].held).toBe(3334 + 3333);
	});

	it('holds an equal share from each payday so far', () => {
		// Today Jan 23: held Jan 9 + Jan 23 = 6667. No bills reserved, no income after the balance.
		const r = on('2026-01-23');
		expect(r.setAsides).toEqual([
			{ itemId: 'fee', name: 'Annual fee', held: 6667, dueDate: '2026-02-20', amount: 10000 }
		]);
		expect(r.amount).toBe(100000 - 6667);
	});

	it('stops setting aside once the bill falls due before the next payday, and reserves it', () => {
		// Today Feb 6: the next payday is Feb 20 and the fee falls due that day.
		const r = on('2026-02-06');
		expect(r.setAsides).toEqual([]);
		expect(r.reserved.map((o) => [o.itemId, o.date, o.amount])).toEqual([
			['fee', '2026-02-20', 10000]
		]);
		expect(r.amount).toBe(100000 - 10000);
	});

	it('sums the shares to exactly the bill, with one payday to go', () => {
		// Cycle 2 of insurance has 26 paydays; on 2027-09-03 (the 25th) the next payday is
		// 2027-09-17 and the bill falls due 09-30, later. Held = 24 * 2077 + 2076 = 51924, which is
		// 54000 - the last share of 2076.
		const r = safeToSpend({
			items: fixtureItems,
			overrides: [],
			balance: minor(500000),
			balanceAsOf: d('2027-09-03'),
			today: d('2027-09-03')
		});
		const insurance = r.setAsides.find((s) => s.itemId === 'insurance');
		expect(insurance?.dueDate).toBe('2027-09-30');
		expect(insurance?.held).toBe(51924);
		expect(54000 - (insurance?.held ?? 0)).toBe(2076);
	});

	it('holds nothing, and reserves the bill when it falls due, if the cycle has no paydays', () => {
		// Pay ends on its 2026-02-06 payday; the bill starts 02-10 and falls due 06-30, so its cycle
		// [02-10, 06-30) holds no payday.
		const endingPay: Item = { ...pay, endsOn: d('2026-02-06') };
		const late: Item = {
			...fee,
			rule: { kind: 'yearly', anchor: d('2026-06-30') },
			startsOn: d('2026-02-10')
		};
		const base = {
			items: [endingPay, late],
			overrides: [],
			balance: minor(50000)
		};
		const before = safeToSpend({ ...base, balanceAsOf: d('2026-01-23'), today: d('2026-01-23') });
		expect(before.nextPayday).toBe('2026-02-06');
		expect(before.setAsides).toEqual([
			{ itemId: 'fee', name: 'Annual fee', held: 0, dueDate: '2026-06-30', amount: 10000 }
		]);
		expect(before.amount).toBe(50000);
	});

	it('ignores monthly bills and income', () => {
		const r = safeToSpend({
			items: fixtureItems.filter((i) => ['pay', 'rent', 'phone'].includes(i.id)),
			overrides: [],
			balance: minor(100000),
			balanceAsOf: d('2026-05-01'),
			today: d('2026-05-02')
		});
		expect(r.setAsides).toEqual([]);
	});

	it('follows a skipped occurrence to the next due date', () => {
		const r = safeToSpend({
			items: fixtureItems,
			overrides: [{ itemId: 'water', originalDate: d('2026-10-31'), action: 'skip' }],
			balance: minor(100000),
			balanceAsOf: d('2026-10-02'),
			today: d('2026-10-16')
		});
		expect(r.setAsides.find((s) => s.itemId === 'water')?.dueDate).toBe('2027-01-31');
	});
});

describe('TSK-4EF766 the starting balance', () => {
	it('is a whole number of cents', () => {
		expect(fixtureBalance.amount).toBe(230000);
		expect(Number.isInteger(fixtureBalance.amount)).toBe(true);
	});

	it('throws if no payday is scheduled', () => {
		expect(() =>
			safeToSpend({
				items: [],
				overrides: [],
				balance: minor(0),
				balanceAsOf: d('2026-01-01'),
				today: d('2026-01-02')
			})
		).toThrow('No payday');
	});
});

describe('TSK-063DBD logged expenses lower the number', () => {
	/*
	 * Month-end case again (balance 90000 as of 2026-07-24, today 2026-07-31): amount -96132,
	 * available 47368, reserved card 6000, internet 5500, water 12000, rent 120000.
	 */
	const withExpenses = (expenses: number | undefined, balance = 90000) =>
		safeToSpend({
			items: fixtureItems,
			overrides: fixtureOverrides,
			balance: minor(balance),
			balanceAsOf: d('2026-07-24'),
			today: d('2026-07-31'),
			...(expenses === undefined ? {} : { expenses: minor(expenses) })
		});

	it('is unchanged when there are none, or the total is zero', () => {
		expect(withExpenses(undefined).amount).toBe(-96132);
		expect(withExpenses(0).amount).toBe(-96132);
	});

	it('drops by exactly the total', () => {
		const clear = withExpenses(0, 400000);
		expect(clear.amount).toBe(400000 - 143500 - 42632);
		expect(withExpenses(12345, 400000).amount).toBe(clear.amount - 12345);
	});

	it('shrinks what is available, so the shortfall and its uncovered list follow', () => {
		// 47368 - 30000 = 17368: card (6000) and internet (11500 running) fit, water (23500) does not.
		const r = withExpenses(30000);
		expect(r.amount).toBe(-96132 - 30000);
		expect(r.shortfall?.short).toBe(126132);
		expect(r.shortfall?.available).toBe(17368);
		expect(r.shortfall?.uncovered.map((o) => o.itemId)).toEqual(['water', 'rent']);
	});

	it('can turn a zero number into a shortfall', () => {
		// 186132 gives exactly 0; one more cent logged is a 1-cent shortfall.
		const r = withExpenses(1, 186132);
		expect(r.amount).toBe(-1);
		expect(r.shortfall?.short).toBe(1);
	});
});

describe('TSK-4EF766 why there is a shortfall', () => {
	// Only the pay, so nothing is reserved and nothing is held back for a yearly bill.
	const payOnly: Item[] = fixtureItems.filter((i) => i.id === 'pay');
	const run = (balance: number, expenses: number, items: Item[] = payOnly) =>
		safeToSpend({
			items,
			overrides: [],
			balance: minor(balance),
			balanceAsOf: d('2026-07-24'),
			today: d('2026-07-31'),
			expenses: minor(expenses)
		});

	it('expenses with nothing reserved: logged spending is the cause', () => {
		// 100.00 in the account, 150.00 logged: 50.00 short, with no bill and no set-aside at all.
		const s = run(10000, 15000);
		expect(s.reserved).toEqual([]);
		expect(s.setAsides).toEqual([]);
		expect(s.shortfall).toMatchObject({
			short: 5000,
			available: -5000,
			uncovered: [],
			cause: 'logged'
		});
	});

	it('names held set-asides when they alone use the balance up', () => {
		const items = fixtureItems.filter((i) => i.id === 'pay' || i.id === 'insurance');
		expect(run(10000, 0, items).shortfall?.cause).toBe('held');
	});

	it('names both when set-asides leave the balance short even before the logged spending', () => {
		const items = fixtureItems.filter((i) => i.id === 'pay' || i.id === 'insurance');
		expect(run(10000, 500, items).shortfall?.cause).toBe('both');
		// The balance would just cover the held money; it is the logged spending that tips it over.
		expect(run(42632, 1, items).shortfall).toMatchObject({ cause: 'logged', uncovered: [] });
	});

	it('names reserved payments that are not covered, and a balance below zero', () => {
		expect(run(10000, 0, fixtureItems).shortfall?.cause).toBe('due');
		expect(run(-5000, 0).shortfall?.cause).toBe('balance');
	});
});
