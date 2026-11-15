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
	'marked-paid': 'Marked paid early.',
	'marked-unpaid': 'Paid early mark taken off.',
	'loan-added': 'Loan added.',
	'loan-paid-off': 'Marked paid off.',
	'expense-added': 'Expense added.',
	'expense-changed': 'Expense changed.',
	'expense-removed': 'Expense removed.',
	'data-erased': 'Your budget was deleted. Set up Payday again from the start.',
	'account-deleted':
		'Your account was deleted. Your budget, email, password and passkeys are gone from Payday.',
	'backup-restored': 'Your backup is restored. Your budget is back as it was when it was saved.',
	// Continue with Google (ADR-0028). Plain words; never the account number, the email or a code.
	'google-failed': 'Google sign-in did not work. Please try again, or sign in with your password.',
	'google-expired':
		'That Google sign-in took too long or was already used. Please start again from the button.',
	'google-cancelled': 'Google sign-in was cancelled.',
	'google-email-exists':
		'An account with this email already exists. Sign in with your password, then connect Google in Settings › Security.',
	'google-full': 'Sign-up is full for now. If you already have an account, you can sign in.',
	'google-closed': 'Sign-up is not open yet.',
	'google-limit': 'Too many new accounts were made just now. Please try again later.',
	'google-busy': 'Payday is busy right now. Please try again in a moment.',
	'google-too-many': 'Too many tries. Wait a minute, then try again.',
	'google-connected': 'Google is connected. You can now sign in with it.',
	'google-taken': 'That Google account is already connected to another Payday account.',
	'google-other':
		'This account already has a different Google account connected. Disconnect it first.',
	'google-confirmed': 'Confirmed with Google.',
	'google-wrong-account':
		'That was not the Google account connected to Payday. Please choose the connected one.',
	'google-confirm-first': 'Confirm it is you first, then try again.'
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
