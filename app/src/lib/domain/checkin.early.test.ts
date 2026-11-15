/*
 * TSK-C00C8A, TSK-7642D5: a payday update with early payments. Household in fixture.early.ts.
 * The update covers (Nov 13, Nov 27]: last balance 150000 true Nov 13, today Nov 27 (a payday).
 *   Pay landed 100000. Payments due in the window: gym Nov 20 3000 and phone Nov 25 5000.
 *   No marks: expected = 150000 + 100000 - 3000 - 5000 = 242000.
 */
import { describe, expect, it } from 'vitest';
import { expectedBalance, paymentsSince } from './checkin.ts';
import { parseCalDate as d } from './dates.ts';
import { minor } from './money.ts';
import { earlyItems, mark } from './fixture.early.ts';

const SINCE = d('2026-11-13');
const TODAY = d('2026-11-27');
const base = { amount: minor(150000), asOf: SINCE };

function expected(over: Partial<Parameters<typeof paymentsSince>[0]> = {}) {
	const r = paymentsSince({
		items: earlyItems,
		overrides: [],
		since: SINCE,
		today: TODAY,
		...over
	});
	// The way the server will: everything asked is assumed paid, plus the early payments that left.
	const balance = expectedBalance({
		base,
		payLanded: minor(100000),
		paid: [...r.asked, ...r.subtracted]
	});
	return { ...r, balance };
}

describe('TSK-C00C8A a payday update with no marks', () => {
	it('asks about every payment and expects 242000', () => {
		const r = expected();
		expect(r.asked.map((o) => o.itemId)).toEqual(['gym', 'phone']);
		expect(r.paidEarly).toEqual([]);
		expect(r.balance).toBe(242000);
	});
});

describe('TSK-C00C8A a bill paid early inside the window', () => {
	it('due in the window: shown already answered, not asked, subtracted once', () => {
		// Gym paid Nov 17: asked is the phone only; gym 3000 comes off once: 242000.
		const r = expected({ marks: [mark('gym', '2026-11-20', '2026-11-17')] });
		expect(r.asked.map((o) => o.itemId)).toEqual(['phone']);
		expect(r.paidEarly).toEqual([
			{
				occurrence: expect.objectContaining({ itemId: 'gym', amount: 3000 }),
				paidOn: d('2026-11-17'),
				inWindow: true,
				subtract: true
			}
		]);
		expect(r.balance).toBe(242000);
	});

	it('due after today: the money has left, so it is subtracted even so', () => {
		// Rent (Dec 1) paid Nov 18: 242000 - 40000 = 202000. Not a line of this update.
		const r = expected({ marks: [mark('rent', '2026-12-01', '2026-11-18')] });
		expect(r.asked.map((o) => o.itemId)).toEqual(['gym', 'phone']);
		expect(r.paidEarly).toHaveLength(1);
		expect(r.paidEarly[0]).toMatchObject({
			inWindow: false,
			subtract: true,
			paidOn: d('2026-11-18')
		});
		expect(r.balance).toBe(202000);
	});
});

describe('TSK-C00C8A a bill paid early on or before the last balance', () => {
	it('due in the window: shown answered, not asked, not subtracted again', () => {
		// Gym paid Nov 12, the balance of Nov 13 holds it: expected = 150000 + 100000 - 5000 = 245000.
		const r = expected({ marks: [mark('gym', '2026-11-20', '2026-11-12')] });
		expect(r.asked.map((o) => o.itemId)).toEqual(['phone']);
		expect(r.paidEarly).toHaveLength(1);
		expect(r.paidEarly[0]).toMatchObject({ inWindow: true, subtract: false });
		expect(r.subtracted).toEqual([]);
		expect(r.balance).toBe(245000);
	});

	it('due after today: nothing to show and nothing subtracted', () => {
		const r = expected({ marks: [mark('rent', '2026-12-01', '2026-11-12')] });
		expect(r.paidEarly).toEqual([]);
		expect(r.balance).toBe(242000);
	});

	it('made on the balance day follows ADR-0012: only after it was read', () => {
		// Balance of Nov 13 read at 08:00. Gym marked 09:00 on Nov 13 is subtracted (242000);
		// marked at 07:00 it is held by the balance (245000).
		const after = expected({
			sinceReadAt: '2026-11-13T08:00:00Z',
			marks: [mark('gym', '2026-11-20', '2026-11-13', '09:00:00Z')]
		});
		expect(after.paidEarly[0]).toMatchObject({ subtract: true });
		expect(after.balance).toBe(242000);
		const before = expected({
			sinceReadAt: '2026-11-13T08:00:00Z',
			marks: [mark('gym', '2026-11-20', '2026-11-13', '07:00:00Z')]
		});
		expect(before.paidEarly[0]).toMatchObject({ subtract: false });
		expect(before.balance).toBe(245000);
	});
});

describe('TSK-7642D5 "did not go out", a late mark and a plain label', () => {
	it('a payment answered "did not go out" is asked again, whatever its mark', () => {
		const r = expected({
			marks: [mark('gym', '2026-11-20', '2026-11-17')],
			missed: new Set(['gym|2026-11-20'])
		});
		expect(r.asked.map((o) => o.itemId)).toEqual(['gym', 'phone']);
		expect(r.paidEarly).toEqual([]);
		expect(r.balance).toBe(242000);
	});

	it('a mark made on or after the due date is not early: still asked', () => {
		const r = expected({ marks: [mark('gym', '2026-11-20', '2026-11-20')] });
		expect(r.asked.map((o) => o.itemId)).toEqual(['gym', 'phone']);
		expect(r.paidEarly).toEqual([]);
	});
});
