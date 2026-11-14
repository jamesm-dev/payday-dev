/*
 * PGlite runs one statement at a time, so a test here cannot show two writers actually waiting for
 * each other. What it CAN show is that every writer which depends on the owner lock asks for it:
 * the statement `select … from payday.owner … for update` must come before the writer's first
 * insert, update or delete (and, for the check-in steps, before it reads the check-in at all).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { changePassword } from '#lib/server/auth/account.ts';
import { cookieJar, testEvent } from '#lib/server/auth/testEvent.ts';
import { startPasswordSession } from '#lib/server/auth/cookie.ts';
import {
	addPasskeyForSession,
	removePasskeyUnlessLast,
	type NewPasskey
} from '#lib/server/auth/passkeys.ts';
import { hashPassword } from '#lib/server/auth/password.ts';
import { regenerateRecoveryCodes } from '#lib/server/auth/recovery.ts';
import { createSession } from '#lib/server/auth/session.ts';
import { sha256Hex } from '#lib/server/auth/tokens.ts';
import {
	acknowledgeSpending,
	discardCheckIn,
	finishCheckIn,
	goBack,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	startCheckIn
} from '#lib/server/money/checkin.ts';
import { eraseBudget } from '#lib/server/money/erase.ts';
import { backupText, exportBackup, restoreBackup } from '#lib/server/money/fullBackup.ts';
import { closeLoan, createLoan, listLoans, updateLoan } from '#lib/server/money/loans.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';
import { ensureAccount, setBalance } from '#lib/server/money/store.ts';
import { owner } from './schema.ts';
import { openDatabase, type Db, type Opened } from './open.ts';
import { emptyAllTables } from './testing.ts';

const T1 = new Date('2026-10-30T12:00:00Z');
const OCT2 = d('2026-10-02');
const FAST = { N: 2 ** 10, r: 8, p: 1 };

const queries: string[] = [];
let opened: Opened;
let db: Db;
let sessionId: string;

beforeAll(async () => {
	opened = await openDatabase('memory://', {
		logger: { logQuery: (query) => void queries.push(query) }
	});
	db = opened.db;
}, 120_000);
afterAll(() => opened.close());

const LOCK = /from "payday"\."owner".*for update/i;
const WRITE = /^(insert|update|delete)\b/i;

/** The statements `run` issues, in order. */
async function statements(run: () => Promise<unknown>): Promise<string[]> {
	queries.length = 0;
	await run();
	return [...queries];
}

/** The owner lock is taken, and before the first write (and before any read matching `before`). */
function expectLockedFirst(seen: string[], before?: RegExp) {
	const lock = seen.findIndex((q) => LOCK.test(q));
	expect(lock, `no "for update" on payday.owner in:\n${seen.join('\n')}`).toBeGreaterThanOrEqual(0);
	const write = seen.findIndex((q) => WRITE.test(q));
	if (write !== -1) expect(lock, 'locked after a write').toBeLessThan(write);
	if (before) {
		const read = seen.findIndex((q) => before.test(q));
		if (read !== -1) expect(lock, 'locked after reading the check-in').toBeLessThan(read);
	}
}

const key = (id: string): NewPasskey => ({
	id,
	publicKey: new Uint8Array([1, 2, 3]),
	counter: 0,
	nickname: 'Phone'
});

beforeEach(async () => {
	await emptyAllTables(db);
	await db.insert(owner).values({ id: 1, passwordHash: 'x' });
	await seedHousehold(db, { production: false, now: T1, loans: false });
	await setBalance(db, 1, minor(150000), OCT2);
	const loan = (name: string, item: number | null) => ({
		type: 'informal' as const,
		name,
		lender: null,
		balance: minor(50000),
		rateBp: 0,
		scheduleItemId: item,
		minPctBp: null,
		minFloor: null
	});
	await createLoan(db, 1, loan('Dad', null), OCT2);
	const { token } = await createSession(db, 1, 'vitest');
	sessionId = sha256Hex(token);
	queries.length = 0;
});

describe('TSK-10C918 every writer that needs the owner lock takes it first', () => {
	it('start over and restore (eraseBudgetIn)', async () => {
		const text = backupText(await exportBackup(db, 1, T1));
		expectLockedFirst(await statements(() => restoreBackup(db, 1, text, sessionId)));
		expectLockedFirst(await statements(() => eraseBudget(db, 1, sessionId)));
	});

	it('changing the password, and a password sign-in', async () => {
		expectLockedFirst(
			await statements(() =>
				changePassword(db, {
					sessionId,
					current: '',
					password: 'a brand new passphrase',
					again: 'a brand new passphrase',
					stepUpOk: true
				})
			)
		);
		const hash = await hashPassword('another fine passphrase', FAST);
		await db.update(owner).set({ passwordHash: hash });
		const { cookies } = cookieJar();
		expectLockedFirst(
			await statements(() => startPasswordSession(db, testEvent({ cookies }), 1, hash))
		);
	});

	it('adding and removing a passkey, and new recovery codes', async () => {
		expectLockedFirst(
			await statements(() => addPasskeyForSession(db, 1, sessionId, key('cred-1')))
		);
		expectLockedFirst(await statements(() => removePasskeyUnlessLast(db, 1, 'cred-1')));
		expectLockedFirst(await statements(() => regenerateRecoveryCodes(db, 1)));
	});

	it('creating, changing and closing a loan', async () => {
		const [dad] = await listLoans(db, 1);
		const fields = {
			type: dad.type,
			name: 'Dad',
			lender: null,
			balance: minor(40000),
			rateBp: 0,
			scheduleItemId: null,
			minPctBp: null,
			minFloor: null
		};
		expectLockedFirst(
			await statements(() => createLoan(db, 1, { ...fields, name: 'Another' }, OCT2))
		);
		expectLockedFirst(await statements(() => updateLoan(db, 1, Number(dad.id), fields, OCT2)));
		expectLockedFirst(await statements(() => closeLoan(db, 1, Number(dad.id), OCT2, T1)));
	});

	it('creating the account on first use', async () => {
		await emptyAllTables(db);
		await db.insert(owner).values({ id: 1 });
		expectLockedFirst(await statements(() => ensureAccount(db, 1)));
	});

	it('every step of a check-in', async () => {
		const reads = /from "payday"\."check_in"/i;
		let id = 0;
		expectLockedFirst(
			await statements(async () => (id = (await startCheckIn(db, 1, T1)).id)),
			reads
		);
		expectLockedFirst(
			await statements(() => savePay(db, 1, id, { landed: true, amount: minor(370000) })),
			reads
		);
		expectLockedFirst(await statements(() => saveBalanceStep(db, 1, id, T1, minor(489500))), reads);
		expectLockedFirst(await statements(() => goBack(db, 1, id)), reads);
		expectLockedFirst(await statements(() => saveBalanceStep(db, 1, id, T1, minor(489500))), reads);
		expectLockedFirst(await statements(() => acknowledgeSpending(db, 1, id)), reads);
		expectLockedFirst(
			await statements(() =>
				savePayments(
					db,
					1,
					id,
					T1,
					new Map([
						['3|2026-10-15', 'paid'],
						['4|2026-10-28', 'paid']
					])
				)
			),
			reads
		);
		const [dad] = await listLoans(db, 1);
		expectLockedFirst(
			await statements(() => saveLoans(db, 1, id, T1, new Map([[Number(dad.id), minor(50000)]]))),
			reads
		);
		expectLockedFirst(await statements(() => finishCheckIn(db, 1, id, T1)), reads);

		const second = await startCheckIn(db, 1, T1);
		expectLockedFirst(await statements(() => discardCheckIn(db, 1, second.id)), reads);
	});
});
