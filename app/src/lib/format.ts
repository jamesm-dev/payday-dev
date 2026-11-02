/**
 * Turning money and dates into words for the screen. Pure, so the server can do it before a page is
 * sent and the browser needs none of it. An amount is never a float: the digits come from
 * `formatMinor`, and `Intl` supplies only the currency symbol.
 */
import { dateParts, weekday, type CalDate } from './domain/dates.ts';
import { formatMinor } from './domain/money.ts';

/**
 * The currencies setup offers. All have two decimal places, like `formatMinor` and every `*_minor`
 * column assume (ADR-0007). A zero- or three-decimal currency (JPY, KWD) would be shown wrong, so
 * it is not offered and not accepted.
 */
export const CURRENCIES = [
	'USD',
	'EUR',
	'GBP',
	'CAD',
	'AUD',
	'NZD',
	'CHF',
	'SGD',
	'HKD',
	'MXN',
	'BRL',
	'ZAR',
	'SEK',
	'NOK',
	'DKK',
	'PLN',
	'PHP',
	'INR'
] as const;

export type Currency = (typeof CURRENCIES)[number];

export const isCurrency = (value: unknown): value is Currency =>
	typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);

/** The currency's name in plain words, for the picker. */
export function currencyName(code: string): string {
	try {
		return new Intl.DisplayNames('en', { type: 'currency' }).of(code) ?? code;
	} catch {
		return code;
	}
}

/** "$", "€", "CHF" - the currency's own symbol, from `Intl`. */
export function currencySymbol(code: string | null): string {
	if (!code) return '';
	try {
		const parts = new Intl.NumberFormat('en', {
			style: 'currency',
			currency: code,
			currencyDisplay: 'narrowSymbol'
		}).formatToParts(0);
		return parts.find((p) => p.type === 'currency')?.value ?? code;
	} catch {
		return code;
	}
}

/** `$1,234.50`, `-$30.00`, `CHF 12.00`. */
export function moneyText(minorUnits: number, currency: string | null): string {
	const symbol = currencySymbol(currency);
	const gap = /[\p{L}]$/u.test(symbol) ? '\u00a0' : '';
	const sign = minorUnits < 0 ? '-' : '';
	return `${sign}${symbol}${gap}${formatMinor(Math.abs(minorUnits))}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Every date the app shows, in one format chosen by the owner: "Sun, Oct 19 2027" — the weekday,
 * the month and day, and always the year.
 */
export function dateText(date: CalDate): string {
	const { y, m, d } = dateParts(date);
	return `${WEEKDAYS[weekday(date)]}, ${MONTHS[m - 1]} ${d} ${y}`;
}

function ordinal(n: number): string {
	const rest = n % 100;
	if (rest >= 11 && rest <= 13) return `${n}th`;
	return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** The repeat rule in plain words. */
export function ruleText(rule: {
	kind: 'every14' | 'monthly' | 'quarterly' | 'yearly';
	day?: number;
}): string {
	switch (rule.kind) {
		case 'every14':
			return 'Every 2 weeks';
		case 'monthly':
			return `Every month on the ${ordinal(rule.day ?? 1)}`;
		case 'quarterly':
			return 'Every 3 months';
		case 'yearly':
			return 'Every year';
	}
}
