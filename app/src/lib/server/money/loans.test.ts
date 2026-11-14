import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { safeToSpend } from '#lib/domain/safeToSpend.ts';
import { fixtureBalance, fixtureItems, fixtureOverrides } from '#lib/domain/fixture.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { loanBalance, owner } from '#lib/server/db/schema.ts';
import { computeSafe } from './home.ts';
import { checkLoanFields, parsePercentBp, bpToPercent } from './loanForm.ts';
import {
	LoanError,
	closeLoan,
	createLoan,
	getLoan,
	listLoans,
	loanForItem,
	updateLoan
} from './loans.ts';
import { linkableItems, presentLoans } from './loansView.ts';
import { seedHousehold } from './seed.ts';
import { addItem, listItems, loadPlan, setBalance } from './store.ts';

const NOW = new Date('2026-10-31T12:00:00Z');
const TODAY = d('2026-10-31');

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: NOW, loans: false });
	return db;
}

const blank = {
	lender: null,
	rateBp: null,
	scheduleItemId: null,
	minPctBp: null,
	minFloor: null
} as const;

describe('TSK-A641F9 a loan of each kind is entered with the fields its kind needs', () => {
	const base = { name: 'Thing', balance: '1,200.50', rate: '' };

	it('a credit card needs a payment from the schedule or its minimum rule, and keeps both', () => {
		const result = checkLoanFields('credit-card', {
			...base,
			name: 'Visa',
			lender: 'Harbour Bank',
			rate: '22.99%',
			item: '4',
			minPct: '2',
			minFloor: '25'
		});
		expect(result).toEqual({
			ok: true,
			value: {
				type: 'credit-card',
				name: 'Visa',
				lender: 'Harbour Bank',
				balance: 120050,
				rateBp: 2299,
				scheduleItemId: 4,
				minPctBp: 200,
				minFloor: 2500
			}
		});
		const bare = checkLoanFields('credit-card', base);
		expect(bare.ok).toBe(false);
		if (!bare.ok) expect(bare.problems.minPct).toMatch(/needs either a payment/);
		expect(checkLoanFields('credit-card', { ...base, minFloor: '25' }).ok).toBe(true);
	});

	it('an instalment loan, a plan and a loan from a person do not take the minimum fields', () => {
		for (const type of ['instalment', 'bnpl', 'informal'] as const) {
			const result = checkLoanFields(type, { ...base, rate: '0', minPct: '5', minFloor: '99' });
			expect(result.ok, type).toBe(true);
			if (result.ok) {
				expect([result.value.minPctBp, result.value.minFloor], type).toEqual([null, null]);
			}
		}
	});

	it('an empty rate is unknown (null), never zero; a 0 is a known 0%', () => {
		const empty = checkLoanFields('instalment', { ...base, rate: '' });
		const zero = checkLoanFields('instalment', { ...base, rate: '0' });
		expect(empty.ok && empty.value.rateBp).toBeNull();
		expect(zero.ok && zero.value.rateBp).toBe(0);
	});

	it('reads percentages from their digits', () => {
		expect(parsePercentBp('22.99')).toBe(2299);
		expect(parsePercentBp(' 6.5 % ')).toBe(650);
		expect(parsePercentBp('12')).toBe(1200);
		expect(parsePercentBp('0.05')).toBe(5);
		expect(parsePercentBp('1.234')).toBeNull();
		expect(parsePercentBp('-3')).toBeNull();
		expect(parsePercentBp('abc')).toBeNull();
		expect(bpToPercent(2299)).toBe('22.99');
		expect(bpToPercent(650)).toBe('6.5');
		expect(bpToPercent(1200)).toBe('12');
	});

	it('explains every mistake in plain words and keeps the rest', () => {
		const result = checkLoanFields('instalment', {
			name: '',
			balance: 'lots',
			rate: '5000',
			item: 'x'
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.problems.name).toMatch(/Give it a name/);
			expect(result.problems.balance).toMatch(/Use numbers only/);
			expect(result.problems.rate).toMatch(/yearly rate as a percentage/);
			expect(result.problems.item).toMatch(/Choose one of the listed/);
		}
	});

	it('refuses a negative balance and an unknown kind, and allows zero', () => {
		const negative = checkLoanFields('bnpl', { ...base, balance: '-5' });
		expect(negative.ok).toBe(false);
		expect(checkLoanFields('bnpl', { ...base, balance: '0' }).ok).toBe(true);
		expect(checkLoanFields('mortgage', base).ok).toBe(false);
	});

	it('saves a loan of each kind and reads it back, with its first balance recorded', async () => {
		const db = await household();
		for (const type of ['credit-card', 'instalment', 'bnpl', 'informal'] as const) {
			await createLoan(
				db,
				1,
				{ ...blank, type, name: type, balance: minor(10000), minFloor: minor(2500) },
				TODAY
			);
		}
		const loans = await listLoans(db, 1);
		expect(loans.map((l) => l.type)).toEqual(['credit-card', 'instalment', 'bnpl', 'informal']);
		expect(loans.every((l) => l.rateBp === null)).toBe(true);
		expect((await db.select().from(loanBalance)).map((r) => r.source)).toEqual([
			'entered',
			'entered',
			'entered',
			'entered'
		]);
	});
});

describe('TSK-D5AAAA a loan counts each payment once: converting a bill leaves the number unchanged', () => {
	it("the engine never reads a loan, so the number is the schedule's alone", async () => {
		const engine = safeToSpend({
			items: fixtureItems,
			overrides: fixtureOverrides,
			balance: fixtureBalance.amount,
			balanceAsOf: TODAY,
			today: TODAY
		});
		const db = await household();
		await setBalance(db, 1, fixtureBalance.amount, TODAY);
		const computed = await computeSafe(db, 1, NOW);
		// The ids differ (the fixture's are names, the database's are numbers); the rest is the same.
		expect(computed.state).toBe('ready');
		if (computed.state === 'ready') {
			expect(computed.result.amount).toBe(engine.amount);
			expect(computed.result.reserved.map((o) => [o.name, o.date, o.amount])).toEqual(
				engine.reserved.map((o) => [o.name, o.date, o.amount])
			);
		}
	});

	for (const [label, now, balanceAsOf] of [
		['on the first day of the fixture', NOW, TODAY],
		[
			'two weeks earlier, with a card payment in the window',
			new Date('2026-10-16T12:00:00Z'),
			d('2026-10-02')
		]
	] as const) {
		it(`turning the credit card bill and the laptop plan into loans changes nothing ${label}`, async () => {
			const db = await household();
			await setBalance(db, 1, fixtureBalance.amount, balanceAsOf);
			const before = await computeSafe(db, 1, now);
			expect(before.state).toBe('ready');

			const items = await listItems(db, 1);
			const idOf = (name: string) => Number(items.find((i) => i.name === name)!.id);
			await createLoan(
				db,
				1,
				{
					...blank,
					type: 'credit-card',
					name: 'Visa',
					balance: minor(180000),
					rateBp: 2299,
					scheduleItemId: idOf('Credit card minimum'),
					minFloor: minor(2500)
				},
				balanceAsOf
			);
			await createLoan(
				db,
				1,
				{
					...blank,
					type: 'bnpl',
					name: 'Laptop',
					balance: minor(0),
					rateBp: 0,
					scheduleItemId: idOf('Laptop instalment')
				},
				balanceAsOf
			);
			const after = await computeSafe(db, 1, now);

			expect(after).toEqual(before);
			if (after.state === 'ready') {
				// And the card payment is in the reserved list exactly once, loan or no loan.
				const card = after.result.reserved.filter((o) => o.name === 'Credit card minimum');
				expect(card.length).toBe(
					before.state === 'ready'
						? before.result.reserved.filter((o) => o.name === 'Credit card minimum').length
						: -1
				);
				if (balanceAsOf !== TODAY) expect(card).toHaveLength(1);
			}
			// The items themselves were not touched.
			expect(await listItems(db, 1)).toEqual(items);
		});
	}

	it('the same payment cannot belong to two loans, so it cannot come off two balances', async () => {
		const db = await household();
		const card = Number((await listItems(db, 1)).find((i) => i.name === 'Credit card minimum')!.id);
		await createLoan(
			db,
			1,
			{ ...blank, type: 'credit-card', name: 'Visa', balance: minor(1), scheduleItemId: card },
			TODAY
		);
		await expect(
			createLoan(
				db,
				1,
				{ ...blank, type: 'instalment', name: 'Other', balance: minor(1), scheduleItemId: card },
				TODAY
			)
		).rejects.toThrow(/already belongs to Visa/);
		expect((await loanForItem(db, 1, card))?.name).toBe('Visa');
	});

	it('pay cannot be a loan payment, and a payment that is not there cannot be linked', async () => {
		const db = await household();
		const pay = Number((await listItems(db, 1)).find((i) => i.kind === 'income')!.id);
		await expect(
			createLoan(
				db,
				1,
				{ ...blank, type: 'instalment', name: 'X', balance: minor(1), scheduleItemId: pay },
				TODAY
			)
		).rejects.toThrow(LoanError);
		await expect(
			createLoan(
				db,
				1,
				{ ...blank, type: 'instalment', name: 'X', balance: minor(1), scheduleItemId: 999 },
				TODAY
			)
		).rejects.toThrow(LoanError);
		expect(await listLoans(db, 1)).toEqual([]);
	});
});

describe('TSK-F2D30C a bill from setup becomes a loan without being entered again', () => {
	it('offers the unlinked loan payments to connect, and the schedule items to pick from', async () => {
		const db = await household();
		const page = await presentLoans(db, 1, NOW);
		expect(page.convertible.map((c) => c.name)).toEqual([]); // the laptop plan has ended
		const open = linkableItems(await loadPlan(db, 1, NOW), new Set(), null).map((i) => i.label);
		expect(open).toContain('Credit card minimum: $60.00, every month on the 28th');
		expect(open.some((l) => l.startsWith('Pay'))).toBe(false);
	});

	it('lists a running loan payment that is not yet a loan, and stops listing it once it is', async () => {
		const db = await household();
		const car = await addItem(db, 1, {
			kind: 'loan-payment',
			name: 'Car loan',
			amount: minor(28500),
			rule: { kind: 'monthly', day: 20 },
			startsOn: TODAY
		});
		expect((await presentLoans(db, 1, NOW)).convertible).toEqual([
			{ id: car.id, name: 'Car loan', amount: '$285.00', rule: 'Every month on the 20th' }
		]);
		await createLoan(
			db,
			1,
			{
				...blank,
				type: 'instalment',
				name: 'Car',
				balance: minor(500000),
				scheduleItemId: Number(car.id)
			},
			TODAY
		);
		expect((await presentLoans(db, 1, NOW)).convertible).toEqual([]);
		// A payment already taken is not offered again, except to its own loan.
		const taken = new Set([car.id]);
		expect(linkableItems(await loadPlan(db, 1, NOW), taken, null).map((i) => i.id)).not.toContain(
			car.id
		);
		expect(linkableItems(await loadPlan(db, 1, NOW), taken, car.id).map((i) => i.id)).toContain(
			car.id
		);
	});
});

describe('TSK-A641F9 a loan is changed, and closed when paid off', () => {
	it('records a new balance only when it changed, dated today, and refuses a change of kind', async () => {
		const db = await household();
		const loan = await createLoan(
			db,
			1,
			{ ...blank, type: 'instalment', name: 'Car', balance: minor(100000) },
			d('2026-10-01')
		);
		const same = {
			...blank,
			type: 'instalment' as const,
			name: 'Car loan',
			balance: minor(100000)
		};
		await updateLoan(db, 1, Number(loan.id), same, TODAY);
		expect(await getLoan(db, 1, Number(loan.id))).toMatchObject({
			name: 'Car loan',
			balanceAsOf: '2026-10-01'
		});
		expect(await db.select().from(loanBalance)).toHaveLength(1);

		await updateLoan(db, 1, Number(loan.id), { ...same, balance: minor(90000) }, TODAY);
		expect(await getLoan(db, 1, Number(loan.id))).toMatchObject({
			balance: 90000,
			balanceAsOf: '2026-10-31'
		});
		expect(await db.select().from(loanBalance)).toHaveLength(2);

		await expect(
			updateLoan(db, 1, Number(loan.id), { ...same, type: 'bnpl' }, TODAY)
		).rejects.toThrow(/kind/);
	});

	it('closing keeps the loan and its history, and takes it off the list', async () => {
		const db = await household();
		const loan = await createLoan(
			db,
			1,
			{ ...blank, type: 'bnpl', name: 'Sofa', balance: minor(5000) },
			TODAY
		);
		expect(await closeLoan(db, 1, Number(loan.id), TODAY, NOW)).toBe(true);
		expect(await listLoans(db, 1)).toEqual([]);
		expect(await getLoan(db, 1, Number(loan.id))).toMatchObject({
			balance: 0,
			closedAt: NOW.toISOString()
		});
		expect(await closeLoan(db, 1, Number(loan.id), TODAY, NOW)).toBe(false);
		expect(await db.select().from(loanBalance)).toHaveLength(2);
	});

	it("another owner's loan is not found", async () => {
		const db = await household();
		const loan = await createLoan(
			db,
			1,
			{ ...blank, type: 'bnpl', name: 'Sofa', balance: minor(5000) },
			TODAY
		);
		expect(await getLoan(db, 2, Number(loan.id))).toBeNull();
	});
});

describe('TSK-4E012E, TSK-05B6CF and TSK-5CEFEA the ledger page shows the totals, the interest and the date', () => {
	// Hand calculation: Car loan 1,000.00 at 12%, 100.00 on the 1st: interest this month 10.00,
	// paid off Sep 1 2027 (11 payments, 58.98 interest). Card 1,000.00 at 24% paying 20.00 a month:
	// a month's interest is exactly 20.00, so it never ends. Total owed 2,000.00.
	async function ledger() {
		const db = await household();
		const car = await addItem(db, 1, {
			kind: 'loan-payment',
			name: 'Car loan payment',
			amount: minor(10000),
			rule: { kind: 'monthly', day: 1 },
			startsOn: d('2026-01-01')
		});
		await createLoan(
			db,
			1,
			{
				...blank,
				type: 'instalment',
				name: 'Car loan',
				lender: 'Harbour',
				balance: minor(100000),
				rateBp: 1200,
				scheduleItemId: Number(car.id)
			},
			TODAY
		);
		return { db, car };
	}

	it('one loan: its balance, rate, next payment and when it ends', async () => {
		const { db } = await ledger();
		const page = await presentLoans(db, 1, NOW);
		expect(page.total).toBe('$1,000.00');
		expect(page.interest).toBe('$10.00');
		expect(page.loans[0]).toMatchObject({
			name: 'Car loan',
			kind: 'Loan with fixed payments',
			lender: 'Harbour',
			balance: '$1,000.00',
			rate: '12.00% a year',
			rateKnown: true,
			next: 'Next payment $100.00 on Sun, Nov 1 2026',
			payoff: 'Paid off by Wed, Sep 1 2027, with $58.98 of interest',
			stuck: false
		});
		expect(page.debtFree).toMatchObject({
			kind: 'date',
			headline: 'Debt free by Wed, Sep 1 2027'
		});
		expect(page.debtFree.assumes).toEqual(['Car loan: 12.00% a year']);
	});

	it('a payment that does not cover the interest says never, by name, instead of a date', async () => {
		const { db } = await ledger();
		const slow = await addItem(db, 1, {
			kind: 'loan-payment',
			name: 'Visa payment',
			amount: minor(2000),
			rule: { kind: 'monthly', day: 5 },
			startsOn: d('2026-01-01')
		});
		await createLoan(
			db,
			1,
			{
				...blank,
				type: 'credit-card',
				name: 'Visa',
				balance: minor(100000),
				rateBp: 2400,
				scheduleItemId: Number(slow.id),
				minFloor: minor(2500)
			},
			TODAY
		);
		const page = await presentLoans(db, 1, NOW);
		expect(page.total).toBe('$2,000.00');
		expect(page.interest).toBe('$30.00');
		expect(page.debtFree.kind).toBe('blocked');
		expect(page.debtFree.headline).toBe('Never at this pace');
		expect(page.debtFree.notes[0]).toBe(
			'Visa: the payment does not cover the interest, so it will never be paid off at this pace.'
		);
		const visa = page.loans.find((l) => l.name === 'Visa')!;
		expect(visa.payoff).toBe('Never at this pace: the payment does not cover the interest');
		expect(visa.stuck).toBe(true);
		// The other loan still has its own date.
		expect(page.loans.find((l) => l.name === 'Car loan')!.payoff).toMatch(/^Paid off by/);
	});

	it('an unknown rate shows as unknown, counts nothing, and the date says what it assumes', async () => {
		const { db } = await ledger();
		await createLoan(
			db,
			1,
			{ ...blank, type: 'informal', name: 'Friend', balance: minor(30000) },
			TODAY
		);
		const page = await presentLoans(db, 1, NOW);
		const friend = page.loans.find((l) => l.name === 'Friend')!;
		expect(friend).toMatchObject({
			rate: 'Unknown',
			rateKnown: false,
			next: 'No payment set up yet'
		});
		expect(page.unknownRates).toEqual(['Friend']);
		expect(page.interest).toBe('$10.00');
		// The friend has no payments, so there is no date at all, and the page says so.
		expect(page.debtFree.kind).toBe('blocked');
		expect(page.debtFree.headline).toBe('No date yet');
		expect(page.debtFree.notes).toContain(
			'Friend: no payments are set up yet, so there is nothing to count.'
		);
		expect(page.debtFree.notes).toContain('Friend: rate unknown, counted as no interest.');
	});

	it('with every loan at a payment, an unknown rate keeps the date and names the assumption', async () => {
		const { db } = await ledger();
		const dad = await addItem(db, 1, {
			kind: 'loan-payment',
			name: 'Dad',
			amount: minor(5000),
			rule: { kind: 'monthly', day: 25 },
			startsOn: d('2026-01-01')
		});
		await createLoan(
			db,
			1,
			{
				...blank,
				type: 'informal',
				name: 'Dad',
				balance: minor(30000),
				scheduleItemId: Number(dad.id)
			},
			TODAY
		);
		const page = await presentLoans(db, 1, NOW);
		expect(page.debtFree.kind).toBe('date');
		expect(page.debtFree.notes.join(' ')).toMatch(
			/Dad has no rate yet, so it is counted as no interest/
		);
		expect(page.debtFree.assumes).toContain('Dad: rate unknown, counted as no interest');
	});

	it('an empty ledger says so, and shows nothing owed', async () => {
		const page = await presentLoans(await household(), 1, NOW);
		expect(page).toMatchObject({ empty: true, total: '$0.00', interest: '$0.00', loans: [] });
		expect(page.debtFree.headline).toBe('Nothing owed');
	});

	it('a card with only a minimum rule shows the minimum and no date', async () => {
		const db = await household();
		await createLoan(
			db,
			1,
			{
				...blank,
				type: 'credit-card',
				name: 'Store card',
				balance: minor(50000),
				rateBp: 1800,
				minPctBp: 300,
				minFloor: minor(2500)
			},
			TODAY
		);
		const [card] = (await presentLoans(db, 1, NOW)).loans;
		expect(card.next).toBe('Minimum payment about $25.00, no date set');
	});
});

describe('TSK-A641F9 a loan closed while a change waits is not changed afterwards', () => {
	it('closing and changing at once leaves it closed, at zero, with no balance recorded after', async () => {
		const db = await household();
		const fields = {
			...blank,
			type: 'informal' as const,
			name: 'Dad',
			balance: minor(50000),
			rateBp: 0
		};
		const made = await createLoan(db, 1, fields, TODAY);
		const [closed, changed] = await Promise.all([
			closeLoan(db, 1, Number(made.id), TODAY, NOW),
			updateLoan(db, 1, Number(made.id), { ...fields, balance: minor(70000) }, TODAY)
		]);
		expect(closed).toBe(true);
		// The close took the lock first, so the change found the loan closed and was refused.
		expect(changed).toBe(false);
		const row = await getLoan(db, 1, Number(made.id));
		expect(row).toMatchObject({ balance: 0 });
		expect(row?.closedAt).not.toBeNull();
		const entered = await db.select().from(loanBalance);
		expect(entered.at(-1)?.balanceMinor).toBe(0);
		await expect(updateLoan(db, 1, Number(made.id), fields, TODAY)).resolves.toBe(false);
	});
});
