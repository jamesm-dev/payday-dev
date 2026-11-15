import { describe, expect, it } from 'vitest';
import { EXAMPLE, exampleNumber } from './example.ts';

describe('TSK-619b8d the product page example is the pay less what is due before payday', () => {
	it('starts on a number that is left over, and about how much a day', () => {
		const result = exampleNumber({
			pay: EXAMPLE.pay.start,
			bills: EXAMPLE.bills.start,
			loans: EXAMPLE.loans.start,
			days: EXAMPLE.days.start
		});
		// 18,000 - 7,500 - 2,500 = 8,000 pesos, over 15 days: 533.33, so about 533 a day.
		expect(result.safe).toBe(800_000);
		expect(result.perDay).toBe(53_300);
		expect(result.short).toBe(0);
	});

	it('rounds the daily amount down to a whole peso, never up', () => {
		expect(exampleNumber({ pay: 1_000_000, bills: 0, loans: 0, days: 3 }).perDay).toBe(333_300);
	});

	it('says what is short when the bills and loans need more than the pay', () => {
		const result = exampleNumber({ pay: 500_000, bills: 450_000, loans: 100_000, days: 10 });
		expect(result.safe).toBe(-50_000);
		expect(result.short).toBe(50_000);
		expect(result.perDay).toBe(0);
		// The bar is drawn against what is needed: bills and loans fill it, nothing is left.
		expect(result.shares.bills + result.shares.loans).toBeCloseTo(1);
		expect(result.shares.safe).toBe(0);
	});

	it('splits the bar into bills, loans and what is left, adding up to the pay', () => {
		const { shares } = exampleNumber({ pay: 2_000_000, bills: 500_000, loans: 500_000, days: 15 });
		expect(shares).toEqual({ bills: 0.25, loans: 0.25, safe: 0.5 });
	});

	it('refuses money that is not whole minor units, and a payday that is not in the future', () => {
		expect(() => exampleNumber({ pay: 10.5, bills: 0, loans: 0, days: 1 })).toThrow(RangeError);
		expect(() => exampleNumber({ pay: 100, bills: -1, loans: 0, days: 1 })).toThrow(RangeError);
		expect(() => exampleNumber({ pay: 100, bills: 0, loans: 0, days: 0 })).toThrow(RangeError);
	});

	it('every slider start sits on its own step, inside its range', () => {
		for (const slider of [EXAMPLE.pay, EXAMPLE.bills, EXAMPLE.loans, EXAMPLE.days]) {
			expect(slider.start).toBeGreaterThanOrEqual(slider.min);
			expect(slider.start).toBeLessThanOrEqual(slider.max);
			expect((slider.start - slider.min) % slider.step).toBe(0);
		}
	});
});
