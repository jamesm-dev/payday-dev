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
 */
export async function lockOwner(tx: Db, ownerId: number): Promise<void> {
	await tx.select({ id: owner.id }).from(owner).where(eq(owner.id, ownerId)).for('update');
}
