import type { Cookies } from '@sveltejs/kit';

const NAME = 'flash';

/**
 * The only messages a flash can show. The cookie carries an id, never text, so nothing the browser
 * sends back can put words on the page.
 */
export const FLASH_MESSAGES = {
	'balance-updated': 'Balance updated.',
	'item-added': 'Added.',
	'changes-saved': 'Changes saved.',
	'item-ended': 'It stops after its last date.',
	'item-resumed': 'It is back on your schedule.',
	'payment-skipped': 'Payment skipped.',
	'payment-changed': 'Payment changed.',
	'payment-undone': "Back to the schedule's date and amount.",
	'marked-paid': 'Marked paid.',
	'marked-unpaid': 'Marked not paid.',
	'loan-added': 'Loan added.',
	'loan-paid-off': 'Marked paid off.',
	'expense-added': 'Expense added.',
	'expense-changed': 'Expense changed.',
	'expense-removed': 'Expense removed.',
	'data-erased': 'Your budget was deleted. Set up Payday again from the start.'
} as const;

export type FlashId = keyof typeof FLASH_MESSAGES;

/** Remembers a message id for the very next page load (post, redirect, get). */
export function setFlash(cookies: Cookies, id: FlashId): void {
	cookies.set(NAME, id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 30
	});
}

/** Reads the message and removes it, so it shows once. Null when there is none or the id is unknown. */
export function takeFlash(cookies: Cookies): string | null {
	const id = cookies.get(NAME);
	if (id === undefined) return null;
	cookies.delete(NAME, { path: '/' });
	return Object.hasOwn(FLASH_MESSAGES, id) ? FLASH_MESSAGES[id as FlashId] : null;
}
