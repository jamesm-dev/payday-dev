/**
 * Whose the phone's offline copy and queue are (ADR-0029). Not the account's id, which counts up
 * and would say roughly how many people use Payday: a hash of the person's random backup id
 * (ADR-0027), the same on every device and never shown. It only has to tell two people apart on
 * one phone; the site never trusts it for anything.
 */
import { eq } from 'drizzle-orm';
import { sha256Hex } from '#lib/server/auth/tokens.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';

export const tagOf = (backupId: string): string =>
	sha256Hex(`payday-offline-copy:${backupId}`).slice(0, 32);

export async function offlineOwnerTag(db: Db, ownerId: number): Promise<string | null> {
	const [row] = await db
		.select({ backupId: owner.backupId })
		.from(owner)
		.where(eq(owner.id, ownerId));
	return row ? tagOf(row.backupId) : null;
}
