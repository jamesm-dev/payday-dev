import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { recoveryCode } from '#lib/server/db/schema.ts';
import { safeEqual, sha256Hex } from './tokens.ts';

export const RECOVERY_CODE_COUNT = 10;
/** 10 bytes from crypto.randomBytes = 80 bits, as 16 characters of 5 bits each. */
const BYTES = 10;
/** Crockford's base32: no I, L, O or U, so a code read off paper has no ambiguous letter. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encode(bytes: Buffer): string {
	let bits = 0;
	let acc = 0;
	let out = '';
	for (const byte of bytes) {
		acc = (acc << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(acc >>> (bits - 5)) & 31];
			bits -= 5;
		}
		acc &= (1 << bits) - 1;
	}
	return out;
}

/** The canonical form a code is hashed in: upper case, no separators, Crockford look-alikes folded. */
export function normalizeCode(input: string): string {
	return input
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
}

/** `ABCD-EFGH-JKMN-PQRS`: grouped in fours so it can be read aloud or copied by hand. */
export function formatCode(canonical: string): string {
	return canonical.match(/.{1,4}/g)?.join('-') ?? canonical;
}

export const hashCode = (input: string): string => sha256Hex(normalizeCode(input));

export function generateCode(): string {
	return encode(randomBytes(BYTES));
}

/** Inserts a fresh set for the owner and returns the codes in their shown form. Plain text exists only here. */
export async function insertRecoveryCodes(
	db: Db,
	ownerId: number,
	now = new Date()
): Promise<string[]> {
	const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateCode);
	await db.insert(recoveryCode).values(
		codes.map((code) => ({
			ownerId,
			codeHash: sha256Hex(code),
			createdAt: now.toISOString()
		}))
	);
	return codes.map(formatCode);
}

/** Replaces every code, used or not, so the old set stops working at once. */
export function regenerateRecoveryCodes(
	db: Db,
	ownerId: number,
	now = new Date()
): Promise<string[]> {
	// Inside the transaction every call goes through `tx`, never `db`: another connection would not
	// see the delete. The owner lock keeps two regenerations from interleaving their inserts.
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		await tx.delete(recoveryCode).where(eq(recoveryCode.ownerId, ownerId));
		return insertRecoveryCodes(tx, ownerId, now);
	});
}

export async function unusedRecoveryCodeCount(db: Db, ownerId: number): Promise<number> {
	const unused = await db
		.select({ id: recoveryCode.id })
		.from(recoveryCode)
		.where(and(eq(recoveryCode.ownerId, ownerId), isNull(recoveryCode.usedAt)));
	return unused.length;
}

/**
 * Spends a code. Returns the owner id, or null for an unknown or already used code. The update
 * itself is conditional on `used_at` being null, so two racing attempts cannot both succeed.
 */
export async function redeemRecoveryCode(
	db: Db,
	input: string,
	now = new Date()
): Promise<number | null> {
	const hash = hashCode(input);
	const [row] = await db
		.update(recoveryCode)
		.set({ usedAt: now.toISOString() })
		.where(and(eq(recoveryCode.codeHash, hash), isNull(recoveryCode.usedAt)))
		.returning();
	return row && safeEqual(row.codeHash, hash) ? row.ownerId : null;
}
