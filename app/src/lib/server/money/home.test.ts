import { describe, expect, it } from 'vitest';
import { addDays, parseCalDate as d } from '#lib/domain/dates.ts';
import { fixtureBalance, fixtureItems, fixtureOverrides } from '#lib/domain/fixture.ts';
import { minor } from '#lib/domain/money.ts';
import { previousPayday } from '#lib/domain/periods.ts';
import { safeToSpend } from '#lib/domain/safeToSpend.ts';
import { moneyText } from '#lib/format.ts';
import { open } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	checkInContext,
	finishCheckIn,
	paymentLines,
	saveBalanceStep,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { buildHome, computeSafe, nudgeFor, presentHome } from './home.ts';
import { seedHousehold } from './seed.ts';
import { getBalance, setBalance } from './store.ts';

// Friday 2026-10-30 was a payday (every 14 days from 2026-01-09); the next is Friday 2026-11-13.
const NOW = new Date('2026-10-31T12:00:00Z');
const TODAY = d('2026-10-31');

function seeded() {
	const db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
	seedHousehold(db, { production: false, now: NOW, loans: false });
	return db;
}

const ready = (view: ReturnType<typeof buildHome>) => {
	if (view.state !== 'ready') throw new Error(`Expected a number, got ${view.state}`);
	return view;
};

describe('TSK-997E16 the home view is the engine result in words', () => {
	it('shows the number, the next payday and the reserved list the engine computes', () => {
		const db = seeded();
		const expected = safeToSpend({
			items: fixtureItems,
			overrides: fixtureOverrides,
			balance: fixtureBalance.amount,
			balanceAsOf: TODAY,
			today: TODAY
		});
		const view = ready(buildHome(db, 1, NOW));
		expect(view.amount).toBe(moneyText(expected.amount, 'USD'));
		expect(view.until).toBe('Fri, Nov 13 2026');
		expect(view.reserved.map((r) => r.name)).toEqual(expected.reserved.map((r) => r.name));
		expect(view.reserved.length).toBeGreaterThan(0);
		expect(view.setAsides.map((s) => s.name)).toEqual(expected.setAsides.map((s) => s.name));
		expect(view.setAsides.length).toBeGreaterThan(0);
		expect(view.negative).toBe(false);
		expect(view.shortfall).toBeNull();
	});

	it('says "Based on your balance" with its own date, and is not stale when entered today', () => {
		const view = ready(buildHome(seeded(), 1, NOW));
		expect(view.balanceDate).toBe('Sat, Oct 31 2026');
		expect(view.balance).toBe('$2,300.00');
		expect(view.stale).toBe(false);
	});

	it('uses the owner currency symbol with whole-number maths: no float can leak in', () => {
		const db = seeded();
		setBalance(db, 1, minor(1234567), TODAY);
		expect(ready(buildHome(db, 1, NOW)).balance).toBe('$12,345.67');
		db.$client.prepare("update owner set currency = 'EUR'").run();
		expect(ready(buildHome(db, 1, NOW)).balance).toBe('€12,345.67');
	});

	it('has a state, not a crash, when there is no balance or no payday', () => {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		expect(buildHome(db, 1, NOW).state).toBe('no-balance');
		setBalance(db, 1, minor(100), TODAY);
		expect(buildHome(db, 1, NOW).state).toBe('no-payday');
	});
});

describe('TSK-1899C1 a balance older than the last payday is flagged, with both dates', () => {
	it('warns when the balance is from before the last payday', () => {
		const db = seeded();
		const lastPay = previousPayday(fixtureItems, fixtureOverrides, TODAY)!;
		expect(lastPay).toBe('2026-10-30');
		setBalance(db, 1, minor(100000), addDays(lastPay, -3));
		const view = ready(buildHome(db, 1, NOW));
		expect(view.stale).toBe(true);
		expect(view.lastPayday).toBe('Fri, Oct 30 2026');
		expect(view.balanceDate).toBe('Tue, Oct 27 2026');
	});

	it('does not warn when the balance is from the payday itself', () => {
		const db = seeded();
		setBalance(db, 1, minor(100000), d('2026-10-30'));
		expect(ready(buildHome(db, 1, NOW)).stale).toBe(false);
		expect(getBalance(db, 1)?.asOf).toBe('2026-10-30');
	});
});

describe('TSK-DBB197 a negative result says what is short, with the items it cannot cover', () => {
	it('shows the amount short, never only a negative number', () => {
		const db = seeded();
		setBalance(db, 1, minor(-5000), TODAY);
		const computed = computeSafe(db, 1, NOW);
		const view = ready(presentHome(computed));
		expect(view.negative).toBe(true);
		expect(view.amount.startsWith('-$')).toBe(true);
		expect(view.shortfall).not.toBeNull();
		if (computed.state === 'ready') {
			expect(view.shortfall?.short).toBe(moneyText(-computed.result.amount, 'USD'));
			expect(view.shortfall?.uncovered).toHaveLength(
				computed.result.shortfall?.uncovered.length ?? -1
			);
		}
	});
});

describe('TSK-47ADF0 the "It\'s payday: check in" prompt, on fixed dates', () => {
	// Paydays are every 14 days from Fri 2026-01-09: Fri 2026-10-30 is one, Sat 2026-10-31 is not.
	const PAYDAY = new Date('2026-10-30T12:00:00Z');
	const NOT_PAYDAY = new Date('2026-10-31T12:00:00Z');

	function at(now: Date) {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		seedHousehold(db, { production: false, now, loans: false });
		return db;
	}

	const nudge = (db: ReturnType<typeof at>, now: Date) => ready(buildHome(db, 1, now)).checkIn;

	it('asks for a check-in on a payday', () => {
		const db = at(PAYDAY);
		// The balance is from before the payday, as it is when the owner has not checked in yet.
		setBalance(db, 1, minor(150000), d('2026-10-29'));
		expect(nudge(db, PAYDAY)).toEqual({
			payday: true,
			open: false,
			doneToday: false,
			nudge: 'payday'
		});
	});

	it('says nothing on a day that is not a payday', () => {
		const db = at(NOT_PAYDAY);
		expect(nudge(db, NOT_PAYDAY)).toEqual({
			payday: false,
			open: false,
			doneToday: false,
			nudge: null
		});
	});

	it('offers to pick up a half-done check-in, on a payday or not', () => {
		for (const now of [PAYDAY, NOT_PAYDAY]) {
			const db = at(now);
			setBalance(db, 1, minor(150000), d('2026-10-29'));
			startCheckIn(db, 1, now);
			expect(nudge(db, now)).toMatchObject({ open: true, nudge: 'resume' });
		}
	});

	it('stops asking once a check-in was finished today', () => {
		const db = at(PAYDAY);
		setBalance(db, 1, minor(150000), d('2026-10-29'));
		const row = startCheckIn(db, 1, PAYDAY);
		savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		saveBalanceStep(db, 1, row.id, PAYDAY, minor(300000));
		acknowledgeSpending(db, 1, row.id);
		const lines = paymentLines(checkInContext(db, 1, PAYDAY)!);
		savePayments(db, 1, row.id, PAYDAY, new Map(lines.map((l) => [l.key, 'paid'])));
		finishCheckIn(db, 1, row.id, PAYDAY);
		expect(nudge(db, PAYDAY)).toMatchObject({ payday: true, doneToday: true, nudge: null });
	});

	it('the rule itself: half done wins, then payday unless done today', () => {
		const none = { payday: false, open: false, doneToday: false };
		expect(nudgeFor(none)).toBeNull();
		expect(nudgeFor({ ...none, payday: true })).toBe('payday');
		expect(nudgeFor({ ...none, payday: true, doneToday: true })).toBeNull();
		expect(nudgeFor({ ...none, open: true })).toBe('resume');
		expect(nudgeFor({ ...none, open: true, payday: true })).toBe('resume');
	});
});
