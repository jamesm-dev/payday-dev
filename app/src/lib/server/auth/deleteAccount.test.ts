/*
 * TSK-3ad574 Delete my account: every row of the person goes, none of anyone else's, and nothing
 * can be written for them afterwards. The every-table test fails on a table it has not classified,
 * so a new table forces a decision about whether it holds a person's data.
 */
import { readFileSync } from 'node:fs';
import { isHttpError } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import type { Db } from '#lib/server/db/open.ts';
import {
	attemptCounter,
	authChallenge,
	oneTimeSlot,
	owner,
	session
} from '#lib/server/db/schema.ts';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import { startCheckIn } from '#lib/server/money/checkin.ts';
import { SessionEndedError } from '#lib/server/money/erase.ts';
import { addExpense } from '#lib/server/money/expenses.ts';
import { backupText, exportBackup, restoreBackup } from '#lib/server/money/fullBackup.ts';
import { createLoan } from '#lib/server/money/loans.ts';
import {
	addItem,
	ensureAccount,
	getOwner,
	saveRegion,
	setBalance,
	setPaidMark
} from '#lib/server/money/store.ts';
import { saveChallenge } from './challenge.ts';
import { deleteAccount } from './deleteAccount.ts';
import { ACCOUNT_BRAKE_SCOPE, accountBrake, failureBrake } from './failureBrake.ts';
import { newRecoveryCodes } from './oneTimeSlot.ts';
import { startSession } from './cookie.ts';
import { chargeEmailChange, EMAIL_CHANGE_ACCOUNT_SCOPE } from './ownerEmail.ts';
import { addPasskey, ownerExists } from './passkeys.ts';
import { insertRecoveryCodes, redeemRecoveryCode } from './recovery.ts';
import { checkSession, createSession, deleteAllSessions } from './session.ts';
import { accountKeyOf } from './signInLookup.ts';
import { stepUps } from './stepUp.ts';
import { cookieJar, testEvent } from './testEvent.ts';
import { sha256Hex } from './tokens.ts';

const NOW = new Date('2026-11-16T12:00:00Z');
const FIXTURE = readFileSync(new URL('../db/fixtures/backup-v2.json', import.meta.url), 'utf8');
/** Person 1 registered before emails existed and has none: their counter is under the blank key. */
const EMAIL = (id: number) => (id === 1 ? null : `owner${id}@example.test`);

let db: Db;
const tokens = new Map<number, string>();

/** One person with a budget, two devices, a passkey, recovery codes, and everything sign-in keeps. */
async function person(id: number) {
	await db.insert(owner).values(ownerRow(id));
	await restoreBackup(db, id, FIXTURE);
	await saveRegion(db, id, 'USD', 'UTC');
	await addPasskey(
		db,
		id,
		{
			id: `credential-${id}`,
			publicKey: new Uint8Array([id]),
			counter: 1,
			nickname: `Phone ${id}`
		},
		NOW
	);
	await insertRecoveryCodes(db, id, NOW);
	const { token } = await createSession(db, id, `Browser ${id}`, NOW);
	await createSession(db, id, `Second ${id}`, NOW);
	tokens.set(id, token);
	await stepUps.markAssertion(db, sha256Hex(token));
	await newRecoveryCodes.put(db, token, ['CODE-ONE']);
	await saveChallenge(db, 'step-up', `challenge-${id}`, NOW, sha256Hex(token));
	await saveChallenge(db, 'add-passkey', `add-${id}`, NOW, sha256Hex(token));
	// Wrong passwords counted under the person's email (the blank key for the person with none).
	await accountBrake.recordFailure(db, accountKeyOf(EMAIL(id)));
}

beforeEach(async () => {
	db = await freshDb();
	tokens.clear();
	await person(1);
	await person(2);
	// Counters that belong to a network address, not to a person.
	await failureBrake.recordFailure(db);
	await db.insert(authChallenge).values({
		id: 'unbound-sign-in',
		challenge: 'x',
		purpose: 'authenticate',
		bound: null,
		expiresAt: NOW.getTime() + 60_000
	});
});

// ---- Every table, classified ----

type Sql = ReturnType<typeof sql>;
type Kind =
	'owner-keyed' | 'child of an owner-keyed row' | 'keyed by session' | 'keyed by account key';

/** The identifiers a person's rows hang from, read BEFORE their account is deleted. */
type Ids = {
	owner: number;
	accounts: Sql[];
	items: Sql[];
	checkIns: Sql[];
	loans: Sql[];
	sessions: Sql[];
	accountKey: string;
};

const inList = (values: Sql[]) => sql.join(values, sql`, `);

/**
 * Every table of the `payday` schema, how it ties to a person, and a count of the rows tied to the
 * person whose `Ids` are given. No table here is purely global: the counters held per network
 * address live in `attempt_counter` beside the per-email ones, and `auth_challenge` holds unbound
 * ones; the counts look only at the person's own rows, and a separate test shows the others stay.
 */
const TABLES: Record<string, { kind: Kind; tied: (i: Ids) => Sql }> = {
	owner: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.owner where id = ${i.owner}`
	},
	passkey: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.passkey where owner_id = ${i.owner}`
	},
	recovery_code: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.recovery_code where owner_id = ${i.owner}`
	},
	session: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.session where owner_id = ${i.owner}`
	},
	account: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.account where owner_id = ${i.owner}`
	},
	expense: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.expense where owner_id = ${i.owner}`
	},
	check_in: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.check_in where owner_id = ${i.owner}`
	},
	loan: {
		kind: 'owner-keyed',
		tied: (i) => sql`select count(*) from payday.loan where owner_id = ${i.owner}`
	},
	schedule_item: {
		kind: 'child of an owner-keyed row',
		tied: (i) =>
			sql`select count(*) from payday.schedule_item where account_id in (${inList(i.accounts)}) or id in (${inList(i.items)})`
	},
	paid_mark: {
		kind: 'child of an owner-keyed row',
		tied: (i) => sql`select count(*) from payday.paid_mark where item_id in (${inList(i.items)})`
	},
	occurrence_override: {
		kind: 'child of an owner-keyed row',
		tied: (i) =>
			sql`select count(*) from payday.occurrence_override where item_id in (${inList(i.items)})`
	},
	payment_confirmation: {
		kind: 'child of an owner-keyed row',
		tied: (i) =>
			sql`select count(*) from payday.payment_confirmation where check_in_id in (${inList(i.checkIns)}) or item_id in (${inList(i.items)})`
	},
	loan_balance: {
		kind: 'child of an owner-keyed row',
		tied: (i) =>
			sql`select count(*) from payday.loan_balance where loan_id in (${inList(i.loans)}) or check_in_id in (${inList(i.checkIns)})`
	},
	one_time_slot: {
		kind: 'keyed by session',
		tied: (i) =>
			sql`select count(*) from payday.one_time_slot where session_id in (${inList(i.sessions)})`
	},
	auth_challenge: {
		kind: 'keyed by session',
		tied: (i) =>
			sql`select count(*) from payday.auth_challenge where bound in (${inList(i.sessions)})`
	},
	attempt_counter: {
		kind: 'keyed by account key',
		tied: (i) =>
			sql`select count(*) from payday.attempt_counter where scope = ${ACCOUNT_BRAKE_SCOPE} and key = ${i.accountKey}`
	}
};

const NONE = sql`null`;
const list = (rows: { id: string | number }[]) =>
	rows.length ? rows.map((r) => sql`${r.id}`) : [NONE];
/** The rows a raw query returned (PGlite's result, or an array, as the driver gives it). */
const rows = async <T>(query: Sql): Promise<T[]> => {
	const out = (await db.execute(query)) as unknown as { rows?: T[] } | T[];
	return Array.isArray(out) ? out : (out.rows ?? []);
};
const all = (query: Sql) => rows<{ id: string | number }>(query);

async function idsOf(ownerId: number): Promise<Ids> {
	const accounts = list(await all(sql`select id from payday.account where owner_id = ${ownerId}`));
	return {
		owner: ownerId,
		accounts,
		items: list(
			await all(sql`select id from payday.schedule_item where account_id in (${inList(accounts)})`)
		),
		checkIns: list(await all(sql`select id from payday.check_in where owner_id = ${ownerId}`)),
		loans: list(await all(sql`select id from payday.loan where owner_id = ${ownerId}`)),
		sessions: list(await all(sql`select id from payday.session where owner_id = ${ownerId}`)),
		accountKey: accountKeyOf(EMAIL(ownerId))
	};
}

async function tiedRows(ids: Ids): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	for (const [name, table] of Object.entries(TABLES)) {
		const [row] = await rows<{ count: string | number }>(table.tied(ids));
		out[name] = Number(row!.count);
	}
	return out;
}

const NOTHING = () => Object.fromEntries(Object.keys(TABLES).map((name) => [name, 0]));

const tableNames = async () =>
	(
		await rows<{ tablename: string }>(
			sql`select tablename from pg_tables where schemaname = 'payday' order by 1`
		)
	).map((r) => r.tablename);

describe('TSK-3ad574 every table is classified', () => {
	it('knows every table in the payday schema, and nothing that is not there', async () => {
		// A new table fails here until someone decides how it ties to a person, adds it above, and
		// makes deleteAccount remove it.
		expect(Object.keys(TABLES).sort()).toEqual(await tableNames());
	});
});

describe('TSK-3ad574 deleting person 1 leaves nothing of them, and person 2 as they were', () => {
	it('empties every table of what is tied to person 1', async () => {
		const one = await idsOf(1);
		const two = await idsOf(2);
		const before = await tiedRows(one);
		// The check means something: every table held something of person 1 to remove.
		for (const [name, count] of Object.entries(before)) {
			expect(count, `${name} held nothing of person 1 before`).toBeGreaterThan(0);
		}
		const twoBefore = await tiedRows(two);
		const exported = async () =>
			backupText({ ...(await exportBackup(db, 2, NOW)), exportedAt: '' });
		const exportBefore = await exported();

		await deleteAccount(db, 1, sha256Hex(tokens.get(1)!));

		expect(await tiedRows(one)).toEqual(NOTHING());
		expect(await tiedRows(two)).toEqual(twoBefore);
		expect(await exported()).toBe(exportBefore);
		expect((await db.select().from(owner)).map((o) => o.id)).toEqual([2]);
	});

	it('keeps the rows that belong to a network address, and the unbound challenges', async () => {
		const perAddress = async () =>
			(await db.select().from(attemptCounter)).filter((r) => r.scope !== ACCOUNT_BRAKE_SCOPE)
				.length;
		const before = await perAddress();
		expect(before).toBeGreaterThan(0);
		await deleteAccount(db, 1);
		expect(await perAddress()).toBe(before);
		expect((await db.select().from(authChallenge)).map((c) => c.id)).toContain('unbound-sign-in');
		// Person 2's counter for their own email is still there.
		const brake = (await db.select().from(attemptCounter)).filter(
			(r) => r.scope === ACCOUNT_BRAKE_SCOPE
		);
		expect(brake.map((r) => r.key)).toEqual([accountKeyOf(EMAIL(2))]);
	});

	it('removes the one-time slots of its sessions and none of person 2', async () => {
		expect((await db.select().from(oneTimeSlot)).length).toBe(2);
		await deleteAccount(db, 1);
		const left = await db.select().from(oneTimeSlot);
		expect(left.map((s) => s.sessionId)).toEqual([sha256Hex(tokens.get(2)!)]);
	});

	it('lets any person delete theirs, the later sign-ups as well as the first', async () => {
		await deleteAccount(db, 2);
		expect((await db.select().from(owner)).map((o) => o.id)).toEqual([1]);
		expect((await tiedRows(await idsOf(1)))['session']).toBeGreaterThan(0);
	});

	it('opens the first registration again once the only account is gone', async () => {
		expect(await ownerExists(db)).toBe(true);
		await deleteAccount(db, 1);
		expect(await ownerExists(db)).toBe(true);
		await deleteAccount(db, 2);
		expect(await ownerExists(db)).toBe(false);
	});

	it('refuses, changing nothing, when the asking session has already ended', async () => {
		const asking = sha256Hex(tokens.get(1)!);
		await db.execute(sql`delete from payday.session where id = ${asking}`);
		const before = await tiedRows(await idsOf(1));
		await expect(deleteAccount(db, 1, asking)).rejects.toBeInstanceOf(SessionEndedError);
		expect(await tiedRows(await idsOf(1))).toEqual(before);
		expect((await db.select().from(owner)).length).toBe(2);
	});
});

describe('TSK-3ad574 a request already running for a deleted person writes nothing', () => {
	it('stops every writer that was handed the old id, and leaves no row behind', async () => {
		const one = await idsOf(1);
		await deleteAccount(db, 1);
		const refused = async (run: () => Promise<unknown>) => {
			const error = await run().then(
				() => null,
				(e: unknown) => e
			);
			expect(isHttpError(error, 401), String(error)).toBe(true);
		};
		const today = d('2026-11-16');
		await refused(() => ensureAccount(db, 1));
		await refused(() =>
			addItem(db, 1, {
				kind: 'bill',
				name: 'Late bill',
				amount: minor(100),
				rule: { kind: 'monthly', day: 3 },
				startsOn: today
			})
		);
		await refused(() => addExpense(db, 1, { amount: minor(100), note: null, spentOn: today }, NOW));
		await refused(() => setBalance(db, 1, minor(100), today));
		await refused(() => setPaidMark(db, 1, 1, today, true, NOW));
		await refused(() => startCheckIn(db, 1, NOW));
		await refused(() =>
			createLoan(
				db,
				1,
				{
					type: 'informal',
					name: 'Late loan',
					lender: null,
					balance: minor(100),
					rateBp: 0,
					scheduleItemId: null,
					minPctBp: null,
					minFloor: null
				},
				today
			)
		);
		await refused(() => restoreBackup(db, 1, FIXTURE));
		await refused(() => deleteAccount(db, 1));
		expect(await tiedRows(one)).toEqual(NOTHING());
		expect((await db.select().from(owner).where(eq(owner.id, 1))).length).toBe(0);
	});
});

describe('TSK-3ad574 signing in as a person whose account was just deleted', () => {
	const sessionsOf = async (id: number) =>
		(await db.select().from(session).where(eq(session.ownerId, id))).length;

	/** The way in was already checked (a passkey assertion, a recovery code); then the account went. */
	async function startAfterDeletion(method: 'passkey' | 'recovery') {
		const { cookies, jar } = cookieJar();
		const event = testEvent({ cookies });
		await deleteAccount(db, 1);
		const error = await startSession(db, event, 1, method).then(
			() => null,
			(e: unknown) => e
		);
		return { error, jar };
	}

	it('TSK-2ad8f3 a passkey sign-in that raced a deletion starts no session and sets no cookie', async () => {
		const { error, jar } = await startAfterDeletion('passkey');
		expect(isHttpError(error, 401), String(error)).toBe(true);
		expect(await sessionsOf(1)).toBe(0);
		expect(jar.size).toBe(0);
		// The other person's sessions were not touched.
		expect(await sessionsOf(2)).toBe(2);
	});

	it('TSK-2ad8f3 a recovery-code sign-in that raced a deletion starts no session and no recovery window', async () => {
		const { error, jar } = await startAfterDeletion('recovery');
		expect(isHttpError(error, 401), String(error)).toBe(true);
		expect(await sessionsOf(1)).toBe(0);
		expect(jar.size).toBe(0);
		expect(await db.select().from(session)).toHaveLength(2);
	});

	it('still signs in a live person, under the lock, with a session and a cookie', async () => {
		const { cookies, jar } = cookieJar();
		await startSession(db, testEvent({ cookies }), 2, 'passkey');
		expect(jar.get('session')).toBeTruthy();
		expect(await sessionsOf(2)).toBe(3);
	});

	it('treats a session whose owner is gone as signed out, and removes it', async () => {
		const token = tokens.get(1)!;
		// The owner row vanishes while its session row is still there (the state a race leaves).
		await db.delete(owner).where(eq(owner.id, 1));
		expect(await checkSession(db, token, NOW)).toBeNull();
		expect(await sessionsOf(1)).toBe(1);
		expect(await checkSession(db, tokens.get(2)!, NOW)).toMatchObject({ ownerId: 2 });
	});

	it('a backup download that raced the deletion is a 401, never a 500', async () => {
		await deleteAccount(db, 1);
		const error = await exportBackup(db, 1, NOW).then(
			() => null,
			(e: unknown) => e
		);
		expect(isHttpError(error, 401), String(error)).toBe(true);
	});

	it('removes the email-change counter kept under the account number, and only that one', async () => {
		await chargeEmailChange(db, 1, '192.0.2.1');
		await chargeEmailChange(db, 2, '192.0.2.1');
		await deleteAccount(db, 1);
		const keys = (await db.select().from(attemptCounter))
			.filter((r) => r.scope === EMAIL_CHANGE_ACCOUNT_SCOPE)
			.map((r) => r.key);
		expect(keys).toEqual(['2']);
	});

	it('answers a request for a deleted account with a 401, never a 500', async () => {
		await deleteAccount(db, 1);
		const error = await getOwner(db, 1).then(
			() => null,
			(e: unknown) => e
		);
		expect(isHttpError(error, 401), String(error)).toBe(true);
	});
});

describe('TSK-2ad8f3 one person’s way in is never another’s', () => {
	it('opens only its own account with a recovery code, and nothing once that account is deleted', async () => {
		const codes = async (id: number) => {
			const issued = await insertRecoveryCodes(db, id, NOW);
			return issued[0]!;
		};
		const one = await codes(1);
		const two = await codes(2);
		expect(await redeemRecoveryCode(db, two)).toBe(2);
		expect(await redeemRecoveryCode(db, one)).toBe(1);
		// Spent once, spent for good, and the other person's codes were not touched.
		expect(await redeemRecoveryCode(db, two)).toBeNull();
		const unspent = await codes(2);
		await deleteAccount(db, 1);
		expect(await redeemRecoveryCode(db, one)).toBeNull();
		expect(await redeemRecoveryCode(db, unspent)).toBe(2);
	});

	it('signs out only its own devices when one person signs out everywhere', async () => {
		const count = async (id: number) =>
			(
				await rows<{ n: number }>(
					sql`select count(*)::int as n from payday.session where owner_id = ${id}`
				)
			)[0]!.n;
		expect(await count(1)).toBe(2);
		expect(await count(2)).toBe(2);
		await deleteAllSessions(db, 1);
		expect(await count(1)).toBe(0);
		expect(await count(2)).toBe(2);
	});
});
