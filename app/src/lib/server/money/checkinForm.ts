/**
 * What the check-in forms may send, checked before anything reaches the database. Messages are
 * written for someone who has never kept a budget. Pure: no database, no framework.
 */
import { parseCalDate } from '#lib/domain/dates.ts';
import type { Minor } from '#lib/domain/money.ts';
import { checkAmount, checkBalance, type Checked, type Problems } from './validate.ts';

export type PayAnswer = { landed: true; amount: Minor } | { landed: false; amount: null };

/** "Did your pay land?" Yes needs the amount that arrived; no needs nothing more. */
export function checkPayAnswer(form: Record<string, unknown>): Checked<PayAnswer> {
	const landed = typeof form.landed === 'string' ? form.landed : '';
	if (landed === 'no') return { ok: true, value: { landed: false, amount: null } };
	if (landed !== 'yes') return { ok: false, problems: { landed: 'Choose yes or no.' } };
	const amount = checkAmount(form.amount);
	if (!amount.ok) {
		return {
			ok: false,
			problems: { amount: amount.problems.amount.replace('Enter an amount', 'Enter the pay') }
		};
	}
	return { ok: true, value: { landed: true, amount: amount.value } };
}

/** The balance the bank app shows right now. It may be zero or overdrawn. */
export function checkCurrentBalance(form: Record<string, unknown>): Checked<Minor> {
	const balance = checkBalance(form.balance);
	if (!balance.ok) return { ok: false, problems: { balance: balance.problems.amount } };
	return balance;
}

export type PaymentStatus = 'paid' | 'missed';

/** The form field that carries one payment's answer. */
export const statusField = (key: string) => `status:${key}`;

/** `itemId|originalDate`, the key of one occurrence. */
export function occurrenceKey(itemId: string, originalDate: string): string {
	return `${itemId}|${originalDate}`;
}

export function parseOccurrenceKey(key: string): { itemId: string; originalDate: string } | null {
	const [itemId, originalDate, extra] = key.split('|');
	if (!itemId || !originalDate || extra !== undefined) return null;
	try {
		parseCalDate(originalDate);
	} catch {
		return null;
	}
	return { itemId, originalDate };
}

/**
 * Every payment listed must be answered, paid or missed. Answers for payments that were not listed
 * are ignored, so a forged form cannot add one.
 */
export function checkPaymentAnswers(
	form: Record<string, unknown>,
	keys: readonly string[]
): Checked<Map<string, PaymentStatus>> {
	const answers = new Map<string, PaymentStatus>();
	const problems: Problems = {};
	for (const key of keys) {
		const value = form[statusField(key)];
		if (value === 'paid' || value === 'missed') answers.set(key, value);
		else problems[statusField(key)] = 'Choose whether this one went out.';
	}
	if (Object.keys(problems).length > 0) return { ok: false, problems };
	return { ok: true, value: answers };
}
