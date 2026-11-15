import { eq } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { MAX_EMAIL_LENGTH, normaliseEmail } from './email.ts';
import { passwordOwnerId } from './passkeys.ts';
import { sha256Hex } from './tokens.ts';

/*
 * Who the sign-in form is asking for. The form takes an email and a password. A blank email means
 * "the one person who has not added an email yet" (the first owner, until they add one).
 *
 * One deliberate exception to "says nothing about who has an account": the sign-in page tells a
 * visitor whether such an owner exists, by showing "leave it empty if you have not added an email"
 * (`emailMayBeBlank`, signin/+page.server.ts). It lasts only until that first owner adds an email,
 * which they do right after this release; showing the hint for good would invite blank-email guesses.
 *
 * Nothing here says whether an email has an account: an email nobody owns, one that is not an
 * address at all, and a blank one when everyone has added theirs all come back as no owner, and the
 * caller checks the password against a dummy hash, the same work as for a real person.
 */

export type SignInIdentity = {
	/** Normalised, or null when the field was blank or was not a usable address. */
	email: string | null;
	blank: boolean;
	/** What the limits count wrong passwords against (see accountKeyOf). */
	key: string;
};

/**
 * What wrong passwords for one account are counted under. A blank email, and an owner who has no
 * email, share one key. Anything else is the hash of the (lower case) address: the same for a real
 * account and an invented one, so counting says nothing about which exist, and the address itself
 * is never stored in the counters.
 */
export const accountKeyOf = (email: string | null): string =>
	email === null || email.trim() === '' ? 'blank' : sha256Hex(email.trim().toLowerCase());

/** Reads the form's email field. Pure: no database, nothing logged. */
export function signInIdentity(raw: unknown): SignInIdentity {
	const text = typeof raw === 'string' ? raw.trim() : '';
	if (text === '') return { email: null, blank: true, key: 'blank' };
	const checked = normaliseEmail(text);
	if (checked.ok) return { email: checked.email, blank: false, key: accountKeyOf(checked.email) };
	// Not an address: it can never match an account, but it is still counted, under its own key.
	return { email: null, blank: false, key: accountKeyOf(text.slice(0, MAX_EMAIL_LENGTH)) };
}

/** The owner to check the password against, or null (check a dummy hash instead). */
export async function findSignInOwner(db: Db, identity: SignInIdentity): Promise<number | null> {
	if (identity.blank) return passwordOwnerId(db);
	if (identity.email === null) return null;
	const [row] = await db
		.select({ id: owner.id })
		.from(owner)
		.where(eq(owner.email, identity.email))
		.limit(1);
	return row?.id ?? null;
}
