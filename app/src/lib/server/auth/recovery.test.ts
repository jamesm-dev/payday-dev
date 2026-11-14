import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, recoveryCode } from '#lib/server/db/schema.ts';
import { newRecoveryCodes } from './oneTimeSlot.ts';
import { createSession } from './session.ts';
import { loggedDatabase } from './statementLog.ts';
import { sha256Hex } from './tokens.ts';
import {
	formatCode,
	generateCode,
	hashCode,
	insertRecoveryCodes,
	normalizeCode,
	RECOVERY_CODE_COUNT,
	redeemRecoveryCode,
	regenerateRecoveryCodes,
	unusedRecoveryCodeCount
} from './recovery.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
	await db.insert(owner).values({ id: 1 });
});

describe('TSK-E31665 recovery codes sign in exactly once', () => {
	it('issues 10 distinct codes with at least 60 bits each, grouped for reading', async () => {
		const codes = await insertRecoveryCodes(db, 1);
		expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
		expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
		for (const code of codes) {
			expect(code).toMatch(/^([0-9A-Z]{4}-){3}[0-9A-Z]{4}$/);
			// 16 characters of 5 bits each.
			expect(normalizeCode(code)).toHaveLength(16);
			expect(normalizeCode(code).length * 5).toBeGreaterThanOrEqual(60);
		}
	});

	it('uses only unambiguous characters', () => {
		for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
	});

	it('stores only hashes: no plain code is in the table', async () => {
		const codes = await insertRecoveryCodes(db, 1);
		const rows = await db.select().from(recoveryCode);
		expect(rows).toHaveLength(RECOVERY_CODE_COUNT);
		const stored = JSON.stringify(rows);
		for (const code of codes) {
			expect(stored).not.toContain(code);
			expect(stored).not.toContain(normalizeCode(code));
			expect(rows.map((r) => r.codeHash)).toContain(hashCode(code));
		}
		for (const row of rows) expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('signs in once, then refuses the same code', async () => {
		const [code] = await insertRecoveryCodes(db, 1);
		const at = new Date('2026-11-01T08:00:00.000Z');
		expect(await redeemRecoveryCode(db, code, at)).toBe(1);
		expect(await redeemRecoveryCode(db, code, at)).toBeNull();

		const used = (await db.select().from(recoveryCode)).filter((r) => r.usedAt);
		expect(used).toHaveLength(1);
		expect(used[0].usedAt).toBe(at.toISOString());
		expect(await unusedRecoveryCodeCount(db, 1)).toBe(RECOVERY_CODE_COUNT - 1);
	});

	it('accepts the code however it is typed, and refuses a wrong one', async () => {
		const [code] = await insertRecoveryCodes(db, 1);
		const sloppy = ` ${code.toLowerCase().replaceAll('-', ' ')} `;
		expect(await redeemRecoveryCode(db, sloppy)).toBe(1);
		expect(await redeemRecoveryCode(db, 'AAAA-AAAA-AAAA-AAAA')).toBeNull();
		expect(await redeemRecoveryCode(db, '')).toBeNull();
	});

	it('regenerating invalidates every old code, used or not', async () => {
		const old = await insertRecoveryCodes(db, 1);
		await redeemRecoveryCode(db, old[0]);

		const fresh = await regenerateRecoveryCodes(db, 1);
		expect(fresh).toHaveLength(RECOVERY_CODE_COUNT);
		expect(await db.select().from(recoveryCode)).toHaveLength(RECOVERY_CODE_COUNT);
		for (const code of old) expect(await redeemRecoveryCode(db, code)).toBeNull();
		expect(await redeemRecoveryCode(db, fresh[0])).toBe(1);
	});

	it('formats a canonical code in groups of four', () => {
		expect(formatCode('ABCDEFGH23456789')).toBe('ABCD-EFGH-2345-6789');
	});
});

describe('TSK-0D8D10 regenerating leaves the committed codes in the one-time slot', () => {
	const hashes = async (database: Db) =>
		new Set((await database.select().from(recoveryCode)).map((r) => r.codeHash));

	it('two regenerations at once leave the slot holding the codes that are in the table', async () => {
		const { token } = await createSession(db, 1, 'vitest');
		await Promise.all([
			regenerateRecoveryCodes(db, 1, new Date(), token),
			regenerateRecoveryCodes(db, 1, new Date(), token)
		]);
		const shown = await newRecoveryCodes.take(db, token);
		expect(shown).toHaveLength(RECOVERY_CODE_COUNT);
		const stored = await hashes(db);
		expect(stored.size).toBe(RECOVERY_CODE_COUNT);
		for (const code of shown!) expect(stored.has(sha256Hex(normalizeCode(code)))).toBe(true);
	});

	it('leaves nothing in the slot when no token is given', async () => {
		await regenerateRecoveryCodes(db, 1);
		expect(await newRecoveryCodes.size(db)).toBe(0);
	});
});

describe('TSK-0D8D10 the slot is written under the owner lock', () => {
	const logged = loggedDatabase();

	it('takes the owner lock first, then writes the slot, in one transaction', async () => {
		await logged.db.insert(owner).values({ id: 1 });
		const { token } = await createSession(logged.db, 1, 'vitest');
		const seen = await logged.statements(() =>
			regenerateRecoveryCodes(logged.db, 1, new Date(), token)
		);
		const lock = seen.findIndex((q) => /from "payday"\."owner".*for update/is.test(q));
		const slot = seen.findIndex((q) => /one_time_slot/.test(q));
		expect(lock).toBeGreaterThanOrEqual(0);
		expect(slot).toBeGreaterThan(lock);
	});
});
