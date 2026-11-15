import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Db } from './open.ts';
import { owner } from './schema.ts';

/**
 * Takes a row lock on the owner, held until the surrounding transaction ends. Call it first in any
 * transaction that reads and then writes the owner's data.
 *
 * SQLite's `immediate` transactions let one writer in at a time, so nothing could slip in between a
 * read and the write that depended on it. Postgres's default (READ COMMITTED) lets two such
 * transactions run side by side, each reading the other's old state. Every writer that needs the
 * old guarantee asks for this lock first, so those writers queue behind one another exactly as
 * they did on SQLite. Plain reads never wait for it.
 *
 * It also refuses when the owner row is gone: the account was deleted (deleteAccount.ts), and a
 * request that was already running for that person must write nothing afterwards. No table has a
 * foreign key to `owner`, so this is what stops a stray row. Deleting an account holds the same
 * lock, so a writer that waited for it finds the row gone here, after the delete commits, and stops.
 */
export async function lockOwner(tx: Db, ownerId: number): Promise<void> {
	const rows = await tx
		.select({ id: owner.id })
		.from(owner)
		.where(eq(owner.id, ownerId))
		.for('update');
	if (rows.length === 0) error(401, OWNER_GONE);
}

/** What a request for a deleted account is told. */
export const OWNER_GONE = 'This account no longer exists. Sign in again.';
