/*
 * The check-in data layer on the fixture household, seeded (ids: pay 1, rent 2, phone 3, card 4,
 * internet 5, water 6, insurance 7, bnpl 8). The hand calculations are those of
 * domain/checkin.test.ts: the balance is 1,500.00 as of payday Fri 2026-10-02, and the check-in is
 * on payday Fri 2026-10-16 (time zone UTC).
 *   Pay scheduled in (Oct 2, Oct 16]: 185000. Payments in it: phone Oct 15, 4500.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { open } from '#lib/server/db/open.ts';
import { checkIn, owner, paymentConfirmation } from '#lib/server/db/schema.ts';
import {
	CheckInError,
	acknowledgeSpending,
	discardCheckIn,
	finishCheckIn,
	getLatestFinished,
	getOpenCheckIn,
	goBack,
	listFinished,
	listOutstanding,
	paymentLines,
	checkInContext,
	saveBalanceStep,
	savePay,
	savePayments,
	scheduledPay,
	startCheckIn
} from './checkin.ts';
import { computeSafe } from './home.ts';
import { presentCheckIn, presentDone, presentHistory } from './checkinView.ts';
import { seedHousehold } from './seed.ts';
import { getBalance, listItems, setBalance } from './store.ts';

const T0 = new Date('2026-10-16T12:00:00Z');
const T0_END = new Date('2026-10-16T12:04:12Z');
const T1 = new Date('2026-10-30T12:00:00Z');

function household() {
	const db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
	seedHousehold(db, { production: false, now: T0, loans: false });
	setBalance(db, 1, minor(150000), d('2026-10-02'));
	return db;
}

/** The whole of the first check-in: pay landed, balance 3,000.00, the phone bill missed. */
function firstCheckIn(db: ReturnType<typeof household>, phone: 'paid' | 'missed' = 'missed') {
	const row = startCheckIn(db, 1, T0);
	savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
	saveBalanceStep(db, 1, row.id, T0, minor(300000));
	acknowledgeSpending(db, 1, row.id);
	savePayments(db, 1, row.id, T0, new Map([['3|2026-10-15', phone]]));
	return finishCheckIn(db, 1, row.id, T0_END);
}

describe('TSK-47ADF0 a check-in asks about the pay, then the balance, and survives a drop', () => {
	it('starts at the pay step, prefilled with the pay scheduled since the last balance', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		expect(row.currentStep).toBe('pay');
		expect(row.asOf).toBe('2026-10-16');
		const ctx = checkInContext(db, 1, T0)!;
		expect(scheduledPay(ctx).total).toBe(185000);
		const view = presentCheckIn(db, 1, T0);
		expect(view).toMatchObject({
			step: 'pay',
			stepNumber: 1,
			scheduled: '$1,850.00',
			amount: '1,850.00',
			landed: 'yes'
		});
	});

	it('starting twice returns the check-in under way, not a second one', () => {
		const db = household();
		const a = startCheckIn(db, 1, T0);
		const b = startCheckIn(db, 1, T0);
		expect(b.id).toBe(a.id);
		expect(db.select().from(checkIn).all()).toHaveLength(1);
	});

	it('saves each step as it goes, so a new session resumes at the step it reached', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		// A dropped connection: nothing in memory, only the database.
		expect(getOpenCheckIn(db, 1)).toMatchObject({
			currentStep: 'balance',
			payLanded: true,
			payAmountMinor: 185000
		});
		expect(presentCheckIn(db, 1, T0)).toMatchObject({ step: 'balance', stepNumber: 2 });
	});

	it('pay that did not land is saved as none', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: false, amount: null });
		expect(getOpenCheckIn(db, 1)).toMatchObject({ payLanded: false, payAmountMinor: null });
	});

	it('refuses a step posted out of turn, and a check-in that is not open', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		expect(() => saveBalanceStep(db, 1, row.id, T0, minor(1))).toThrow(CheckInError);
		expect(() => finishCheckIn(db, 1, row.id, T0)).toThrow(CheckInError);
		expect(() => savePay(db, 1, 999, { landed: false, amount: null })).toThrow(CheckInError);
	});

	it('can go back a step to change an answer, and throw a check-in away', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: false, amount: null });
		goBack(db, 1, row.id);
		expect(getOpenCheckIn(db, 1)?.currentStep).toBe('pay');
		discardCheckIn(db, 1, row.id);
		expect(getOpenCheckIn(db, 1)).toBeNull();
	});
});

describe('TSK-8A4CF1 the expected balance and the spending since the last check-in', () => {
	it('expected = 150000 + 185000 - 4500 = 330500; spent = 330500 - 300000 = 30500', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, T0, minor(300000));
		expect(getOpenCheckIn(db, 1)).toMatchObject({
			currentStep: 'spending',
			balanceMinor: 300000,
			expectedMinor: 330500,
			spentMinor: 30500
		});
		const view = presentCheckIn(db, 1, T0);
		expect(view).toMatchObject({
			step: 'spending',
			expected: '$3,305.00',
			actual: '$3,000.00',
			spending: { headline: 'You spent $305.00', negative: false }
		});
	});

	it('spending can be negative: a balance of 3,400.00 is 94.00 more than expected', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, T0, minor(340000));
		expect(getOpenCheckIn(db, 1)?.spentMinor).toBe(-9500);
		expect(presentCheckIn(db, 1, T0)).toMatchObject({
			spending: { headline: '$95.00 more is there than expected', negative: true }
		});
	});

	it('a pay that did not land is not expected: 150000 - 4500 = 145500', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: false, amount: null });
		saveBalanceStep(db, 1, row.id, T0, minor(145500));
		expect(getOpenCheckIn(db, 1)).toMatchObject({ expectedMinor: 145500, spentMinor: 0 });
		expect(presentCheckIn(db, 1, T0)).toMatchObject({
			spending: { headline: 'You spent nothing' }
		});
	});
});

describe('TSK-6553DA a missed payment stays reserved and reappears until confirmed', () => {
	it('lists the payments due since the balance, and settles the numbers on the answers', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, T0, minor(300000));
		acknowledgeSpending(db, 1, row.id);
		expect(paymentLines(checkInContext(db, 1, T0)!).map((l) => [l.key, l.carried])).toEqual([
			['3|2026-10-15', false]
		]);
		savePayments(db, 1, row.id, T0, new Map([['3|2026-10-15', 'missed']]));
		// Missed: still in the account, so expected = 150000 + 185000 = 335000 and spent = 35000.
		expect(getOpenCheckIn(db, 1)).toMatchObject({
			currentStep: 'finish',
			expectedMinor: 335000,
			spentMinor: 35000
		});
	});

	it('refuses an answer missing for any listed payment', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, T0, minor(300000));
		acknowledgeSpending(db, 1, row.id);
		expect(() => savePayments(db, 1, row.id, T0, new Map())).toThrow('needs an answer');
	});

	it('after finishing, the missed payment is outstanding and the number holds it back: 275060', () => {
		const db = household();
		firstCheckIn(db);
		const outstanding = listOutstanding(db, 1, listItems(db, 1));
		expect(outstanding.map((o) => [o.itemId, o.originalDate, o.amount])).toEqual([
			['3', '2026-10-15', 4500]
		]);
		// 300000 - 10286 - 4154 held - 6000 card - 4500 owed, as in domain/checkin.test.ts.
		const computed = computeSafe(db, 1, T0);
		expect(computed.state === 'ready' && computed.result.amount).toBe(275060);
	});

	it('a paid payment is not outstanding, and the number is 279560', () => {
		const db = household();
		firstCheckIn(db, 'paid');
		expect(listOutstanding(db, 1, listItems(db, 1))).toEqual([]);
		const computed = computeSafe(db, 1, T0);
		expect(computed.state === 'ready' && computed.result.amount).toBe(279560);
	});

	it('reappears at the next check-in whatever its date, and leaves once confirmed paid', () => {
		const db = household();
		firstCheckIn(db);
		// Oct 30: the window (Oct 16, Oct 30] holds the card minimum (Oct 28); the phone bill (Oct 15)
		// is not in it, yet it is listed first, marked as missed before.
		const second = startCheckIn(db, 1, T1);
		savePay(db, 1, second.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, second.id, T1, minor(470000));
		acknowledgeSpending(db, 1, second.id);
		const lines = paymentLines(checkInContext(db, 1, T1)!);
		expect(lines.map((l) => [l.occurrence.name, l.carried])).toEqual([
			['Phone', true],
			['Credit card minimum', false]
		]);
		// Expected for now: 300000 + 185000 - 6000 (card; the owed phone bill is not assumed paid).
		expect(getOpenCheckIn(db, 1)?.expectedMinor).toBe(479000);

		// Confirm the phone bill (now paid) and the card. Expected = 300000 + 185000 - 4500 - 6000.
		savePayments(
			db,
			1,
			second.id,
			T1,
			new Map([
				['3|2026-10-15', 'paid'],
				['4|2026-10-28', 'paid']
			])
		);
		expect(getOpenCheckIn(db, 1)).toMatchObject({ expectedMinor: 474500, spentMinor: 4500 });
		// Until the check-in is finished, the earlier answer still stands.
		expect(listOutstanding(db, 1, listItems(db, 1))).toHaveLength(1);
		finishCheckIn(db, 1, second.id, T1);
		expect(listOutstanding(db, 1, listItems(db, 1))).toEqual([]);
	});

	it('a payment marked missed twice stays outstanding once, not twice', () => {
		const db = household();
		firstCheckIn(db);
		const second = startCheckIn(db, 1, T1);
		savePay(db, 1, second.id, { landed: false, amount: null });
		saveBalanceStep(db, 1, second.id, T1, minor(300000));
		acknowledgeSpending(db, 1, second.id);
		savePayments(
			db,
			1,
			second.id,
			T1,
			new Map([
				['3|2026-10-15', 'missed'],
				['4|2026-10-28', 'paid']
			])
		);
		finishCheckIn(db, 1, second.id, T1);
		const outstanding = listOutstanding(db, 1, listItems(db, 1));
		expect(outstanding.map((o) => o.itemId)).toEqual(['3']);
		expect(db.select().from(paymentConfirmation).all()).toHaveLength(3);
	});
});

describe('TSK-7DCF09 finishing saves the balance as of today and ends on the plan', () => {
	it('sets the account balance to the check-in balance, dated today', () => {
		const db = household();
		firstCheckIn(db);
		expect(getBalance(db, 1)).toEqual({ amount: 300000, asOf: '2026-10-16' });
	});

	it('ends on the next 14 days, the new number and the first paycheck', () => {
		const db = household();
		firstCheckIn(db);
		const done = presentDone(db, 1, T0)!;
		// Oct 17 to Oct 30: card Oct 28 (6000) and the Oct 30 pay.
		expect(done.next14.map((l) => [l.name, l.incoming])).toEqual([
			['Credit card minimum', false],
			['Pay', true]
		]);
		expect(done.next14Out).toBe('$60.00');
		expect(done.owed).toEqual([{ name: 'Phone', date: 'Thu, Oct 15 2026', amount: '$45.00' }]);
		expect(done.home).toMatchObject({ state: 'ready', amount: '$2,750.60' });
		// Today is a payday, so the first paycheck is today's: it covers (Oct 16, Oct 30].
		expect(done.first).toMatchObject({ iso: '2026-10-16', isToday: true, left: '$1,752.09' });
	});

	it('cannot be finished before every step is done', () => {
		const db = household();
		const row = startCheckIn(db, 1, T0);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		expect(() => finishCheckIn(db, 1, row.id, T0)).toThrow(CheckInError);
		expect(getBalance(db, 1)).toEqual({ amount: 150000, asOf: '2026-10-02' });
	});
});

describe('TSK-52A3DB each check-in is saved with its date, numbers and duration', () => {
	it('records the duration in seconds from start to finish: 4 minutes 12 seconds = 252', () => {
		const db = household();
		const row = firstCheckIn(db);
		expect(row).toMatchObject({
			durationSeconds: 252,
			finishedAt: '2026-10-16T12:04:12.000Z',
			asOf: '2026-10-16',
			currentStep: 'done',
			balanceMinor: 300000,
			expectedMinor: 335000,
			spentMinor: 35000,
			payLanded: true,
			payAmountMinor: 185000
		});
	});

	it('lists past check-ins newest first, in words', () => {
		const db = household();
		firstCheckIn(db);
		const second = startCheckIn(db, 1, T1);
		savePay(db, 1, second.id, { landed: false, amount: null });
		saveBalanceStep(db, 1, second.id, T1, minor(300000));
		acknowledgeSpending(db, 1, second.id);
		savePayments(
			db,
			1,
			second.id,
			T1,
			new Map([
				['3|2026-10-15', 'paid'],
				['4|2026-10-28', 'paid']
			])
		);
		finishCheckIn(db, 1, second.id, new Date('2026-10-30T12:00:45Z'));

		expect(listFinished(db, 1).map((r) => r.id)).toEqual([second.id, second.id - 1]);
		expect(getLatestFinished(db, 1)?.id).toBe(second.id);
		const rows = presentHistory(db, 1, T1);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			date: 'Fri, Oct 30 2026',
			pay: 'Did not land',
			duration: '45 seconds'
		});
		expect(rows[1]).toMatchObject({
			date: 'Fri, Oct 16 2026',
			pay: '$1,850.00',
			balance: '$3,000.00',
			duration: '4 minutes 12 seconds'
		});
	});

	it('an unfinished check-in is not in the history', () => {
		const db = household();
		startCheckIn(db, 1, T0);
		expect(presentHistory(db, 1, T0)).toEqual([]);
	});
});
