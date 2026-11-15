import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { normaliseEmail } from './email.ts';

/** The address this person signs in with, or null while they have not added one. */
export async function getOwnerEmail(db: Db, ownerId: number): Promise<string | null> {
	const [row] = await db.select({ email: owner.email }).from(owner).where(eq(owner.id, ownerId));
	return row?.email ?? null;
}

export const EMAIL_TAKEN =
	'That email address is already used by another account. Use a different one.';

export type SetEmailResult = { ok: true; email: string } | { ok: false; message: string };

const isUniqueViolation = (error: unknown): boolean => {
	let e: unknown = error;
	for (let depth = 0; e && depth < 4; depth++) {
		if ((e as { code?: string }).code === '23505') return true;
		e = (e as { cause?: unknown }).cause;
	}
	return false;
};

/**
 * Adds or changes the address, after the caller has made sure it is the person (their password or a
 * fresh confirmation). Stored lower case and trimmed; one address belongs to one account, in any
 * case. No email is ever sent or checked (ADR-0022).
 */
export async function setOwnerEmail(
	db: Db,
	ownerId: number,
	raw: unknown
): Promise<SetEmailResult> {
	const checked = normaliseEmail(raw);
	if (!checked.ok) return checked;
	const [taken] = await db
		.select({ id: owner.id })
		.from(owner)
		.where(and(eq(owner.email, checked.email), ne(owner.id, ownerId)))
		.limit(1);
	if (taken) return { ok: false, message: EMAIL_TAKEN };
	try {
		const updated = await db
			.update(owner)
			.set({ email: checked.email })
			.where(eq(owner.id, ownerId))
			.returning({ id: owner.id });
		if (updated.length === 0) return { ok: false, message: 'This account no longer exists.' };
	} catch (error) {
		// Two people adding the same address at once: the database's unique index decides.
		if (isUniqueViolation(error)) return { ok: false, message: EMAIL_TAKEN };
		throw error;
	}
	return { ok: true, email: checked.email };
}
