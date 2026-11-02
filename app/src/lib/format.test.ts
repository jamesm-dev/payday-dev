import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './domain/dates.ts';
import { CURRENCIES, currencySymbol, dateText, isCurrency, moneyText, ruleText } from './format.ts';

describe('TSK-997E16 money and dates are printed in the owner currency, in words', () => {
	it('puts the currency symbol and the integer digits together', () => {
		expect(moneyText(41250, 'USD')).toBe('$412.50');
		expect(moneyText(123456789, 'USD')).toBe('$1,234,567.89');
		expect(moneyText(-3000, 'USD')).toBe('-$30.00');
		expect(moneyText(5, 'EUR')).toBe('\u20ac0.05');
		expect(moneyText(1200, 'CHF')).toBe('CHF\u00a012.00');
		expect(moneyText(100, null)).toBe('1.00');
		expect(currencySymbol('GBP')).toBe('\u00a3');
	});

	it('offers only two-decimal currencies', () => {
		expect(CURRENCIES.length).toBeGreaterThan(10);
		for (const code of CURRENCIES) {
			const digits = new Intl.NumberFormat('en', {
				style: 'currency',
				currency: code
			}).resolvedOptions().maximumFractionDigits;
			expect(digits, code).toBe(2);
		}
		expect(isCurrency('JPY')).toBe(false);
		expect(isCurrency('USD')).toBe(true);
		expect(isCurrency(5)).toBe(false);
	});

	it('writes dates with the weekday, and adds the year only when it is not this year', () => {
		expect(dateText(d('2026-11-13'))).toBe('Fri, Nov 13 2026');
		expect(dateText(d('2027-01-01'))).toBe('Fri, Jan 1 2027');
		expect(dateText(d('2026-03-05'))).toBe('Thu, Mar 5 2026');
		expect(dateText(d('2027-10-19'))).toBe('Tue, Oct 19 2027');
	});

	it('says each repeat rule in plain words', () => {
		expect(ruleText({ kind: 'every14' })).toBe('Every 2 weeks');
		expect(ruleText({ kind: 'monthly', day: 1 })).toBe('Every month on the 1st');
		expect(ruleText({ kind: 'monthly', day: 22 })).toBe('Every month on the 22nd');
		expect(ruleText({ kind: 'monthly', day: 13 })).toBe('Every month on the 13th');
		expect(ruleText({ kind: 'monthly', day: 31 })).toBe('Every month on the 31st');
		expect(ruleText({ kind: 'quarterly' })).toBe('Every 3 months');
		expect(ruleText({ kind: 'yearly' })).toBe('Every year');
	});
});
