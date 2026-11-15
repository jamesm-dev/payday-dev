/**
 * The address a person signs in with (ADR-0022). It is only a name for the account: no email is
 * ever sent or checked. The same address in any case is one person, so it is stored lower case and
 * the database refuses a second one (`owner_email_lower`).
 */

/** The longest an email address may be (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254;

export type EmailResult = { ok: true; email: string } | { ok: false; message: string };

/**
 * Trims and lower-cases an address, or says in plain words why it cannot be used. It checks the
 * shape only (something, an @, something): a stricter test would turn away real addresses.
 */
export function normaliseEmail(raw: unknown): EmailResult {
	const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
	if (email === '') return { ok: false, message: 'Enter your email address.' };
	if (email.length > MAX_EMAIL_LENGTH) {
		return { ok: false, message: 'That email address is too long.' };
	}
	const at = email.indexOf('@');
	if (at < 1 || at !== email.lastIndexOf('@') || at === email.length - 1 || /\s/.test(email)) {
		return { ok: false, message: 'Enter an email address with an @ in it, like you@example.com.' };
	}
	return { ok: true, email };
}
