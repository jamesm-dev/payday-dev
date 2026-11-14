import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { session } from '#lib/server/db/schema.ts';
import { createSession, deleteAllSessions, deleteSession } from './session.ts';
import { createStepUpStore, RECOVERY_ADD_MS, STEP_UP_MS, type StepUpAction } from './stepUp.ts';
import { loggedDatabase } from './statementLog.ts';
import { sha256Hex } from './tokens.ts';

let db: Db;
/** Opens a session and returns its id, the way the store is keyed. */
const open = async (database: Db = db) =>
	sha256Hex((await createSession(database, 1, 'vitest')).token);

beforeEach(async () => {
	db = await freshDb();
});

const ACTIONS: StepUpAction[] = [
	'add-passkey',
	'remove-passkey',
	'regenerate-codes',
	'change-password',
	'erase-data',
	'export-data'
];

describe('TSK-D7D015 step-up gates adding or removing a passkey and new recovery codes', () => {
	it('refuses every action to a session that never proved who it is', async () => {
		const store = createStepUpStore();
		const s1 = await open();
		for (const action of ACTIONS) expect(await store.allows(db, s1, action, 0)).toBe(false);
	});

	it('allows every action for 5 minutes after a password or passkey proof, and not a moment longer', async () => {
		const store = createStepUpStore();
		const s1 = await open();
		await store.markAssertion(db, s1, 1000);
		for (const action of ACTIONS) {
			expect(await store.allows(db, s1, action, 1000 + STEP_UP_MS - 1)).toBe(true);
			expect(await store.allows(db, s1, action, 1000 + STEP_UP_MS)).toBe(false);
		}
	});

	it('is per session: one session confirming does nothing for another', async () => {
		const store = createStepUpStore();
		const s1 = await open();
		const s2 = await open();
		await store.markAssertion(db, s1, 0);
		expect(await store.allows(db, s2, 'remove-passkey', 1)).toBe(false);
	});

	it('does not count a recovery-code sign-in as a step-up', async () => {
		const store = createStepUpStore();
		const r = await open();
		await store.markRecoverySignIn(db, r, 0);
		expect(await store.hasAssertion(db, r, 1)).toBe(false);
		expect(await store.allows(db, r, 'remove-passkey', 1)).toBe(false);
		expect(await store.allows(db, r, 'regenerate-codes', 1)).toBe(false);
	});

	it('lets a recovery session add a passkey or set a new password for 10 minutes, and only those', async () => {
		const store = createStepUpStore();
		const r = await open();
		await store.markRecoverySignIn(db, r, 0);
		for (const action of ['add-passkey', 'change-password'] as const) {
			expect(await store.allows(db, r, action, RECOVERY_ADD_MS - 1)).toBe(true);
			expect(await store.allows(db, r, action, RECOVERY_ADD_MS)).toBe(false);
		}
		expect(await store.hasRecoveryWindow(db, r, RECOVERY_ADD_MS - 1)).toBe(true);
		expect(await store.hasRecoveryWindow(db, r, RECOVERY_ADD_MS)).toBe(false);
		expect(await store.hasRecoveryWindow(db, 'other', 1)).toBe(false);
	});

	it('lets a recovery session do everything once it proves a passkey', async () => {
		const store = createStepUpStore();
		const r = await open();
		await store.markRecoverySignIn(db, r, 0);
		await store.markAssertion(db, r, 400_000);
		for (const action of ACTIONS) expect(await store.allows(db, r, action, 400_001)).toBe(true);
		// Past the recovery window, the assertion alone still carries it for its own 5 minutes.
		expect(await store.allows(db, r, 'add-passkey', RECOVERY_ADD_MS + 50_000)).toBe(true);
	});

	it('forgets a session on request', async () => {
		const store = createStepUpStore();
		const s = await open();
		await store.markAssertion(db, s, 0);
		await store.markRecoverySignIn(db, s, 0);
		await store.forget(db, s);
		expect(await store.allows(db, s, 'add-passkey', 1)).toBe(false);
		expect(await store.hasRecoveryWindow(db, s, 1)).toBe(false);
	});
});

describe('TSK-2F1582 the recovery window closes once the password is set', () => {
	it('clears only the recovery window, keeping a fresh proof', async () => {
		const store = createStepUpStore();
		const r = await open();
		await store.markRecoverySignIn(db, r, 0);
		expect(await store.allows(db, r, 'change-password', 1)).toBe(true);
		await store.clearRecoveryWindow(db, r);
		expect(await store.hasRecoveryWindow(db, r, 1)).toBe(false);
		expect(await store.allows(db, r, 'change-password', 1)).toBe(false);
		expect(await store.allows(db, r, 'add-passkey', 1)).toBe(false);

		const both = await open();
		await store.markRecoverySignIn(db, both, 0);
		await store.markAssertion(db, both, 0);
		await store.clearRecoveryWindow(db, both);
		expect(await store.hasRecoveryWindow(db, both, 1)).toBe(false);
		expect(await store.hasAssertion(db, both, 1)).toBe(true);
		await store.clearRecoveryWindow(db, 'unknown');
	});
});

describe('TSK-0D8D10 the confirmation lives on the session row, in the database', () => {
	it('is stored against the session and ends with it, however the session ends', async () => {
		const store = createStepUpStore();
		const a = await createSession(db, 1, 'a');
		const b = await createSession(db, 1, 'b');
		const c = await createSession(db, 1, 'c');
		const [ida, idb, idc] = [a, b, c].map((s) => sha256Hex(s.token));
		for (const id of [ida, idb, idc]) await store.markAssertion(db, id, Date.now());

		const [row] = await db.select().from(session).where(eq(session.id, ida));
		expect(row.stepUpAt).toBeGreaterThan(0);

		await deleteSession(db, a.token); // sign out
		expect(await store.hasAssertion(db, ida)).toBe(false);
		await deleteAllSessions(db, 1); // sign out everywhere
		expect(await store.hasAssertion(db, idb)).toBe(false);
		expect(await store.hasAssertion(db, idc)).toBe(false);
	});

	it('marks nothing for a session that is already gone', async () => {
		const store = createStepUpStore();
		const gone = await open();
		await db.delete(session);
		await store.markAssertion(db, gone, 0);
		expect(await store.hasAssertion(db, gone, 1)).toBe(false);
		expect(await db.select().from(session)).toHaveLength(0);
	});

	it('TSK-6DF544 never reads a stale record as current, and drops it when the session is marked again', async () => {
		const store = createStepUpStore();
		const s = await open();
		await store.markRecoverySignIn(db, s, 0);
		await store.markAssertion(db, s, RECOVERY_ADD_MS + 1);
		const [row] = await db.select().from(session).where(eq(session.id, s));
		expect(row.recoveryAt).toBeNull(); // the expired window was cleaned up by the write
		expect(row.stepUpAt).toBe(RECOVERY_ADD_MS + 1);

		await store.markRecoverySignIn(db, s, RECOVERY_ADD_MS + 1 + STEP_UP_MS + 5);
		const [after] = await db.select().from(session).where(eq(session.id, s));
		expect(after.stepUpAt).toBeNull();
		expect(await store.hasAssertion(db, s, RECOVERY_ADD_MS + 1 + STEP_UP_MS + 6)).toBe(false);
	});
});

describe('TSK-5569A1 a confirmation made in one function instance counts in every other', () => {
	it('is allowed, listed and ended the same way from separate store instances', async () => {
		const signIn = createStepUpStore();
		const settings = createStepUpStore();
		const backup = createStepUpStore();
		const s = await open();
		await signIn.markAssertion(db, s, 1000);
		expect(await settings.allows(db, s, 'remove-passkey', 1001)).toBe(true);
		expect(await backup.hasAssertion(db, s, 1001)).toBe(true);
		expect(await backup.hasAssertion(db, s, 1000 + STEP_UP_MS)).toBe(false);
		await settings.forget(db, s);
		expect(await signIn.hasAssertion(db, s, 1001)).toBe(false);

		const r = await open();
		await signIn.markRecoverySignIn(db, r, 0);
		expect(await settings.hasRecoveryWindow(db, r, 1)).toBe(true);
		await backup.clearRecoveryWindow(db, r);
		expect(await signIn.hasRecoveryWindow(db, r, 1)).toBe(false);
	});
});

describe('TSK-0D8D10 a mark is one statement on the session row', () => {
	const logged = loggedDatabase();

	it('writes with a single UPDATE and takes no owner lock, so it cannot deadlock with one', async () => {
		const store = createStepUpStore();
		const s = await open(logged.db);
		const seen = await logged.statements(async () => {
			await store.markAssertion(logged.db, s);
			await store.markRecoverySignIn(logged.db, s);
			await store.clearRecoveryWindow(logged.db, s);
		});
		expect(seen).toHaveLength(3);
		for (const q of seen) expect(q).toMatch(/^update "payday"\."session" set /i);
		expect(seen.join('\n')).not.toMatch(/for update/i);
	});
});
