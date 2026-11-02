import { beforeEach, describe, expect, it } from 'vitest';
import { open, type Db } from '#lib/server/db/open.ts';
import { owner, recoveryCode } from '#lib/server/db/schema.ts';
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
beforeEach(() => {
	db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
});

describe('TSK-E31665 recovery codes sign in exactly once', () => {
	it('issues 10 distinct codes with at least 60 bits each, grouped for reading', () => {
		const codes = insertRecoveryCodes(db, 1);
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

	it('stores only hashes: no plain code is in the table', () => {
		const codes = insertRecoveryCodes(db, 1);
		const rows = db.select().from(recoveryCode).all();
		expect(rows).toHaveLength(RECOVERY_CODE_COUNT);
		const stored = JSON.stringify(rows);
		for (const code of codes) {
			expect(stored).not.toContain(code);
			expect(stored).not.toContain(normalizeCode(code));
			expect(rows.map((r) => r.codeHash)).toContain(hashCode(code));
		}
		for (const row of rows) expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('signs in once, then refuses the same code', () => {
		const [code] = insertRecoveryCodes(db, 1);
		const at = new Date('2026-11-01T08:00:00.000Z');
		expect(redeemRecoveryCode(db, code, at)).toBe(1);
		expect(redeemRecoveryCode(db, code, at)).toBeNull();

		const used = db
			.select()
			.from(recoveryCode)
			.all()
			.filter((r) => r.usedAt);
		expect(used).toHaveLength(1);
		expect(used[0].usedAt).toBe(at.toISOString());
		expect(unusedRecoveryCodeCount(db, 1)).toBe(RECOVERY_CODE_COUNT - 1);
	});

	it('accepts the code however it is typed, and refuses a wrong one', () => {
		const [code] = insertRecoveryCodes(db, 1);
		const sloppy = ` ${code.toLowerCase().replaceAll('-', ' ')} `;
		expect(redeemRecoveryCode(db, sloppy)).toBe(1);
		expect(redeemRecoveryCode(db, 'AAAA-AAAA-AAAA-AAAA')).toBeNull();
		expect(redeemRecoveryCode(db, '')).toBeNull();
	});

	it('regenerating invalidates every old code, used or not', () => {
		const old = insertRecoveryCodes(db, 1);
		redeemRecoveryCode(db, old[0]);

		const fresh = regenerateRecoveryCodes(db, 1);
		expect(fresh).toHaveLength(RECOVERY_CODE_COUNT);
		expect(db.select().from(recoveryCode).all()).toHaveLength(RECOVERY_CODE_COUNT);
		for (const code of old) expect(redeemRecoveryCode(db, code)).toBeNull();
		expect(redeemRecoveryCode(db, fresh[0])).toBe(1);
	});

	it('formats a canonical code in groups of four', () => {
		expect(formatCode('ABCDEFGH23456789')).toBe('ABCD-EFGH-2345-6789');
	});
});
