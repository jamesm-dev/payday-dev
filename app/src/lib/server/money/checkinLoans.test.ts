/*
 * The loans step of the check-in, on the fixture household (ids: pay 1, rent 2, phone 3, card 4,
 * internet 5, water 6, insurance 7, bnpl 8). The balance is 1,500.00 as of Fri 2026-10-02 and the
 * check-in is on Fri 2026-10-30 (time zone UTC). Hand calculations:
 *
 *   Pay scheduled in (Oct 2, Oct 30]: Oct 16 and Oct 30, 2 x 1,850.00 = 3,700.00.
 *   Payments in it: phone Oct 15 45.00, card minimum Oct 28 60.00 = 105.00.
 *   Expected in the account: 1,500.00 + 3,700.00 - 105.00 = 5,095.00.
 *
 *   The Visa: 1,800.00 at 22.99%, balance as of Oct 2, paid by the 60.00 card minimum on the 28th.
 *   One period closed (Oct 28): interest 180000 x 2299 / 120000 = 3448.5, half up 3449 (34.49).
 *   Expected: 1,800.00 + 34.49 - 60.00 = 1,774.49. Had the 60.00 not gone out: 1,834.49.
 *   Dad: 500.00 at 0%, no payments: expected 500.00.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { open } from '#lib/server/db/open.ts';
import { checkIn, loan, loanBalance, owner } from '#lib/server/db/schema.ts';
import {
	CheckInError,
	acknowledgeSpending,
	discardCheckIn,
	finishCheckIn,
	goBack,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { presentCheckIn, presentDone } from './checkinView.ts';
import { checkLoanAnswers, loanField } from './loanForm.ts';
import { createLoan, getLoan, listLoans, listTotals } from './loans.ts';
import { presentLoans } from './loansView.ts';
import { seedHousehold } from './seed.ts';
import { setBalance } from './store.ts';

const T1 = new Date('2026-10-30T12:00:00Z');
const T1_END = new Date('2026-10-30T12:03:00Z');
const T2 = new Date('2026-11-13T12:00:00Z');
const OCT2 = d('2026-10-02');

function household(withLoans = true) {
	const db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
	seedHousehold(db, { production: false, now: T1, loans: false });
	setBalance(db, 1, minor(150000), OCT2);
	if (withLoans) {
		createLoan(
			db,
			1,
			{
				type: 'credit-card',
				name: 'Visa',
				lender: null,
				balance: minor(180000),
				rateBp: 2299,
				scheduleItemId: 4,
				minPctBp: 200,
				minFloor: minor(2500)
			},
			OCT2
		);
		createLoan(
			db,
			1,
			{
				type: 'informal',
				name: 'Dad',
				lender: 'Dad',
				balance: minor(50000),
				rateBp: 0,
				scheduleItemId: null,
				minPctBp: null,
				minFloor: null
			},
			OCT2
		);
	}
	return db;
}

type Db = ReturnType<typeof household>;

/** Everything up to the loans step: both pays landed, 200.00 spent from the account, all paid. */
function toLoansStep(db: Db, card: 'paid' | 'missed' = 'paid') {
	const row = startCheckIn(db, 1, T1);
	savePay(db, 1, row.id, { landed: true, amount: minor(370000) });
	saveBalanceStep(db, 1, row.id, T1, minor(509500 - 20000));
	acknowledgeSpending(db, 1, row.id);
	savePayments(
		db,
		1,
		row.id,
		T1,
		new Map([
			['3|2026-10-15', 'paid'],
			['4|2026-10-28', card]
		])
	);
	return row;
}

const ids = (db: Db) => listLoans(db, 1).map((l) => Number(l.id));
const answers = (db: Db, visa: number, dad = 50000) =>
	new Map([
		[ids(db)[0], minor(visa)],
		[ids(db)[1], minor(dad)]
	]);

describe('TSK-1E7743 the check-in pre-fills each loan with its expected balance', () => {
	it('asks for the loans after the payments, as a sixth step, with the expected balances', () => {
		const db = household();
		const row = toLoansStep(db);
		const view = presentCheckIn(db, 1, T1);
		expect(view).toMatchObject({ step: 'loans', stepNumber: 5, stepCount: 6 });
		if (view?.step !== 'loans') throw new Error('expected the loans step');
		expect(view.lines.map((l) => [l.name, l.expected, l.value, l.isCard])).toEqual([
			['Visa', '$1,774.49', '1,774.49', true],
			['Dad', '$500.00', '500.00', false]
		]);
		expect(row.id).toBeGreaterThan(0);
	});

	it('does not take off a card payment that did not go out: 1,800.00 + 34.49', () => {
		const db = household();
		toLoansStep(db, 'missed');
		const view = presentCheckIn(db, 1, T1);
		expect(view?.step === 'loans' && view.lines[0].value).toBe('1,834.49');
	});

	it('is a step of five for the household that owes nothing, and the loans step is skipped', () => {
		const db = household(false);
		const row = toLoansStep(db);
		expect(presentCheckIn(db, 1, T1)).toMatchObject({
			step: 'finish',
			stepNumber: 5,
			stepCount: 5
		});
		expect(() => finishCheckIn(db, 1, row.id, T1_END)).not.toThrow();
	});

	it('keeps what was saved when the owner comes back to the step', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 190000));
		goBack(db, 1, row.id);
		const view = presentCheckIn(db, 1, T1);
		expect(view?.step === 'loans' && view.lines.map((l) => l.value)).toEqual([
			'1,900.00',
			'500.00'
		]);
	});

	it('needs a balance for every loan', () => {
		const db = household();
		const row = toLoansStep(db);
		expect(() => saveLoans(db, 1, row.id, T1, new Map([[ids(db)[0], minor(1)]]))).toThrow(
			CheckInError
		);
	});

	it('the form check wants a number for every listed loan, zero allowed, and ignores forged ones', () => {
		const ok = checkLoanAnswers(
			{ [loanField(1)]: '1,774.49', [loanField(2)]: '0', [loanField(99)]: 'x' },
			[1, 2]
		);
		expect(ok).toEqual({
			ok: true,
			value: new Map([
				[1, 177449],
				[2, 0]
			])
		});
		const bad = checkLoanAnswers({ [loanField(1)]: '', [loanField(2)]: '-5' }, [1, 2]);
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(Object.keys(bad.problems)).toEqual([loanField(1), loanField(2)]);
	});
});

describe('TSK-5A6861 a card balance above what was expected counts as spending', () => {
	it('adds 400.00 of card purchases to the 200.00 spent from the account', () => {
		const db = household();
		const row = toLoansStep(db);
		// Before the loans step the spending is the account's alone.
		expect(db.select().from(checkIn).get()?.spentMinor).toBe(20000);

		saveLoans(db, 1, row.id, T1, answers(db, 177449 + 40000));
		const stored = db.select().from(checkIn).get();
		expect(stored?.spentMinor).toBe(60000);

		const view = presentCheckIn(db, 1, T1);
		expect(view).toMatchObject({
			step: 'finish',
			stepNumber: 6,
			cardPurchases: '$400.00',
			spending: { headline: 'You spent $600.00' }
		});
	});

	it('counts nothing for a card that fell below what was expected: that was a payment', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 177449 - 10000));
		expect(db.select().from(checkIn).get()?.spentMinor).toBe(20000);
		const view = presentCheckIn(db, 1, T1);
		expect(view).toMatchObject({ step: 'finish', cardPurchases: null });
	});

	it('does not count a rise on a loan that is not a card', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 177449, 90000));
		expect(db.select().from(checkIn).get()?.spentMinor).toBe(20000);
	});

	it('shows the history and done page with the card purchases in what was spent', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 177449 + 40000));
		finishCheckIn(db, 1, row.id, T1_END);
		expect(presentDone(db, 1, T1_END)?.spending.headline).toBe('You spent $600.00');
	});

	it('the spending screen drops its card caveat once a card is in the ledger, and keeps it without one', () => {
		const withCard = household();
		const a = startCheckIn(withCard, 1, T1);
		savePay(withCard, 1, a.id, { landed: true, amount: minor(370000) });
		saveBalanceStep(withCard, 1, a.id, T1, minor(480000));
		expect(presentCheckIn(withCard, 1, T1)).toMatchObject({ step: 'spending', hasCard: true });

		const noCard = household(false);
		const b = startCheckIn(noCard, 1, T1);
		savePay(noCard, 1, b.id, { landed: true, amount: minor(370000) });
		saveBalanceStep(noCard, 1, b.id, T1, minor(480000));
		expect(presentCheckIn(noCard, 1, T1)).toMatchObject({ step: 'spending', hasCard: false });
	});

	it('an instalment loan alone does not count as a card', () => {
		const db = household(false);
		createLoan(
			db,
			1,
			{
				type: 'instalment',
				name: 'Car',
				lender: null,
				balance: minor(100000),
				rateBp: 600,
				scheduleItemId: null,
				minPctBp: null,
				minFloor: null
			},
			OCT2
		);
		const row = startCheckIn(db, 1, T1);
		savePay(db, 1, row.id, { landed: true, amount: minor(370000) });
		saveBalanceStep(db, 1, row.id, T1, minor(480000));
		expect(presentCheckIn(db, 1, T1)).toMatchObject({ step: 'spending', hasCard: false });
	});
});

describe('TSK-1E7743 the loans take the confirmed balances when the check-in is saved, not before', () => {
	it('updates each loan and dates it, and records the balance against the check-in', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 177449, 45000));
		// Not yet: the check-in could still be stopped.
		expect(getLoan(db, 1, ids(db)[0])?.balance).toBe(180000);
		finishCheckIn(db, 1, row.id, T1_END);

		const [visa, dad] = listLoans(db, 1);
		expect([visa.balance, visa.balanceAsOf]).toEqual([177449, '2026-10-30']);
		expect([dad.balance, dad.balanceAsOf]).toEqual([45000, '2026-10-30']);
		const rows = db.select().from(loanBalance).all();
		expect(
			rows.filter((r) => r.checkInId === row.id).map((r) => [r.source, r.balanceMinor])
		).toEqual([
			['check-in', 177449],
			['check-in', 45000]
		]);
		expect(rows.filter((r) => r.source === 'entered')).toHaveLength(2);
	});

	it('stopping the check-in leaves the loans as they were and drops its balances', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 999999));
		discardCheckIn(db, 1, row.id);
		expect(listLoans(db, 1).map((l) => l.balance)).toEqual([180000, 50000]);
		expect(
			db
				.select()
				.from(loanBalance)
				.all()
				.filter((r) => r.checkInId !== null)
		).toEqual([]);
	});

	it('goes back from the end to the loans, or to the payments when there are none', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 177449));
		goBack(db, 1, row.id);
		expect(presentCheckIn(db, 1, T1)?.step).toBe('loans');
		goBack(db, 1, row.id);
		expect(presentCheckIn(db, 1, T1)?.step).toBe('payments');

		const none = household(false);
		const r2 = toLoansStep(none);
		goBack(none, 1, r2.id);
		expect(presentCheckIn(none, 1, T1)?.step).toBe('payments');
	});

	it('a paid-off loan can be confirmed at zero', () => {
		const db = household();
		const row = toLoansStep(db);
		saveLoans(db, 1, row.id, T1, answers(db, 177449, 0));
		finishCheckIn(db, 1, row.id, T1_END);
		expect(listLoans(db, 1)[1].balance).toBe(0);
	});
});

describe('TSK-2AAB96 the total owed at each check-in, newest first, with the change', () => {
	function twoCheckIns() {
		const db = household();
		const first = toLoansStep(db);
		saveLoans(db, 1, first.id, T1, answers(db, 177449 + 40000, 50000));
		finishCheckIn(db, 1, first.id, T1_END);

		// Two weeks on, the next payday: the internet, water and rent went out, nothing is due on the card.
		const second = startCheckIn(db, 1, T2);
		savePay(db, 1, second.id, { landed: false, amount: null });
		saveBalanceStep(db, 1, second.id, T2, minor(480000));
		acknowledgeSpending(db, 1, second.id);
		savePayments(
			db,
			1,
			second.id,
			T2,
			new Map([
				['5|2026-10-31', 'paid'],
				['6|2026-10-31', 'paid'],
				['2|2026-11-01', 'paid']
			])
		);
		return { db, second };
	}

	it('lists the totals with the change since the one before', () => {
		const { db, second } = twoCheckIns();
		saveLoans(db, 1, second.id, T2, answers(db, 200000, 40000));
		finishCheckIn(db, 1, second.id, new Date('2026-11-13T12:05:00Z'));

		const totals = listTotals(db, 1);
		expect(totals.map((t) => [t.asOf, t.total])).toEqual([
			['2026-11-13', 240000],
			['2026-10-30', 267449]
		]);
		const page = presentLoans(db, 1, new Date('2026-11-13T13:00:00Z'));
		expect(page.history.map((h) => [h.total, h.change, h.direction])).toEqual([
			['$2,400.00', 'Down $274.49', 'down'],
			['$2,674.49', null, null]
		]);
	});

	it('leaves out a check-in that was never finished', () => {
		const { db, second } = twoCheckIns();
		saveLoans(db, 1, second.id, T2, answers(db, 200000, 40000));
		expect(listTotals(db, 1)).toHaveLength(1);
	});

	it('shows nothing for a household that has never confirmed a loan', () => {
		expect(listTotals(household(), 1)).toEqual([]);
	});

	it('the first expected balance of the second check-in starts from the first confirmed one', () => {
		const { db } = twoCheckIns();
		const view = presentCheckIn(db, 1, T2);
		if (view?.step !== 'loans') throw new Error(`Expected the loans step, got ${view?.step}`);
		// Visa: 2,174.49 confirmed Oct 30; the Nov 28 card payment is not due yet, no period closed.
		expect(view.lines[0].value).toBe('2,174.49');
		expect(view.lines[1].value).toBe('500.00');
	});
});

describe('TSK-4E012E a closed loan is no longer asked about', () => {
	it('is not in the list of open loans', () => {
		const db = household();
		db.update(loan).set({ closedAt: '2026-10-30T00:00:00.000Z' }).run();
		expect(listLoans(db, 1)).toEqual([]);
	});
});
