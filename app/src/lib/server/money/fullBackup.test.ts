import { readFileSync, writeFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { addPasskey } from '#lib/server/auth/passkeys.ts';
import { setPasswordHash } from '#lib/server/auth/password.ts';
import { insertRecoveryCodes } from '#lib/server/auth/recovery.ts';
import { createSession, deleteAllSessions } from '#lib/server/auth/session.ts';
import { sha256Hex } from '#lib/server/auth/tokens.ts';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import {
	account,
	checkIn,
	loan,
	loanBalance,
	owner,
	paidMark,
	paymentConfirmation,
	scheduleItem
} from '#lib/server/db/schema.ts';
import { setReminderTime } from '#lib/server/reminders/store.ts';
import { eraseBudget, SessionEndedError } from './erase.ts';
import { addExpense } from './expenses.ts';
import {
	backupDue,
	backupFilename,
	backupText,
	BackupRefused,
	exportBackup,
	lastBackupAt,
	markBackupDownloaded,
	MAX_BACKUP_BYTES,
	parseBackup,
	restoreBackup
} from './fullBackup.ts';
import { computeSafe } from './home.ts';
import { seedHousehold } from './seed.ts';

const NOW = new Date('2026-10-31T12:00:00Z');

/** The demo household with a paid mark, an expense, a finished check-in and a loan balance from it. */
async function household(db: Db, ownerId: number) {
	await db.insert(owner).values(ownerRow(ownerId));
	await seedHousehold(db, { ownerId, production: false, now: NOW });
	const item = (
		await db
			.select({ id: scheduleItem.id })
			.from(scheduleItem)
			.innerJoin(account, eq(scheduleItem.accountId, account.id))
			.where(eq(account.ownerId, ownerId))
	)[0]!;
	const owed = (await db.select({ id: loan.id }).from(loan).where(eq(loan.ownerId, ownerId)))[0]!;
	await db.insert(paidMark).values({ itemId: item.id, originalDate: '2026-11-01' });
	await addExpense(
		db,
		ownerId,
		{ amount: minor(1250), note: 'Lunch', spentOn: d('2026-10-31') },
		new Date('2026-10-31T13:00:00Z')
	);
	const done = (
		await db
			.insert(checkIn)
			.values({
				ownerId,
				startedAt: '2026-10-30T09:00:00.000Z',
				finishedAt: '2026-10-30T09:02:00.000Z',
				balanceReadAt: '2026-10-30T09:01:00.000Z',
				durationSeconds: 120,
				currentStep: 'done',
				payLanded: true,
				payAmountMinor: 185000,
				balanceMinor: 230000,
				expectedMinor: 231000,
				spentMinor: 1000,
				asOf: '2026-10-30'
			})
			.returning()
	)[0];
	await db.insert(paymentConfirmation).values({
		checkInId: done.id,
		itemId: item.id,
		originalDate: '2026-10-15',
		dueDate: '2026-10-15',
		amountMinor: 5000,
		status: 'paid'
	});
	await db.insert(loanBalance).values({
		loanId: owed.id,
		checkInId: done.id,
		asOf: '2026-10-30',
		balanceMinor: 90000,
		source: 'check-in',
		// Saved by a loans step: the moment the figure was read, which is not the check-in's own.
		readAt: '2026-10-30T09:01:30.000Z'
	});
	// Everything that is NOT the budget.
	await setReminderTime(db, ownerId, '07:30');
	await setPasswordHash(db, ownerId, `scrypt$secret-${ownerId}`);
	await addPasskey(db, ownerId, {
		id: `cred-${ownerId}`,
		publicKey: new Uint8Array([1, 2, 3]),
		counter: 0,
		transports: ['internal'],
		nickname: 'Phone'
	});
	await insertRecoveryCodes(db, ownerId);
	await createSession(db, ownerId, 'test');
}

/** The export without the moment it was made: what must come back identical. */
const budgetOf = async (db: Db, ownerId: number) => ({
	...(await exportBackup(db, ownerId, NOW)),
	exportedAt: ''
});
/**
 * The same document with every id replaced by its place in its table. Postgres never hands an id out
 * twice, so a budget erased and restored in the same database comes back with the same content under
 * new ids; renumbered this way, it compares equal to the original.
 */
function byPlace<T extends Record<string, unknown>>(doc: T): T {
	const place = (rows: { id: number }[]) => new Map(rows.map((r, i) => [r.id, i + 1]));
	const d = doc as unknown as Record<string, Record<string, number | null>[]>;
	const maps = {
		accounts: place(d.accounts as never),
		scheduleItems: place(d.scheduleItems as never),
		checkIns: place(d.checkIns as never),
		loans: place(d.loans as never)
	};
	const through = (map: Map<number, number>, v: number | null) => (v === null ? null : map.get(v)!);
	const out: Record<string, unknown> = { ...doc };
	for (const [key, rows] of Object.entries(d)) {
		if (!Array.isArray(rows)) continue;
		out[key] = rows.map((r, i) => ({
			...r,
			id: i + 1,
			...('accountId' in r ? { accountId: through(maps.accounts, r.accountId) } : {}),
			...('itemId' in r ? { itemId: through(maps.scheduleItems, r.itemId) } : {}),
			...('checkInId' in r ? { checkInId: through(maps.checkIns, r.checkInId) } : {}),
			...('loanId' in r ? { loanId: through(maps.loans, r.loanId) } : {}),
			...('scheduleItemId' in r
				? { scheduleItemId: through(maps.scheduleItems, r.scheduleItemId) }
				: {})
		}));
	}
	return out as T;
}

const number = async (db: Db, ownerId: number) => {
	const c = await computeSafe(db, ownerId, NOW);
	if (c.state !== 'ready') throw new Error(`not ready: ${c.state}`);
	return c.result.amount;
};

const refusal = (text: string) => {
	try {
		parseBackup(text);
	} catch (e) {
		if (e instanceof BackupRefused) return e.message;
		throw e;
	}
	throw new Error('was accepted');
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withDoc = async (change: (doc: Record<string, any>) => void) => {
	const db = await freshDb();
	await household(db, 1);
	const doc = JSON.parse(backupText(await exportBackup(db, 1, NOW)));
	change(doc);
	return JSON.stringify(doc);
};

describe('TSK-F3FBD8 the backup file holds the budget and nothing that signs in', () => {
	it('has the budget, its settings and every table, with amounts as whole numbers', async () => {
		const db = await freshDb();
		await household(db, 1);
		const doc = JSON.parse(backupText(await exportBackup(db, 1, NOW)));
		expect(doc).toMatchObject({
			format: 'payday-backup',
			version: 2,
			exportedAt: '2026-10-31T12:00:00.000Z',
			settings: { currency: 'USD', timeZone: 'UTC', setupStep: null, reminderTime: '07:30' }
		});
		for (const key of [
			'accounts',
			'scheduleItems',
			'overrides',
			'paidMarks',
			'expenses',
			'checkIns',
			'paymentConfirmations',
			'loans',
			'loanBalances'
		]) {
			expect(doc[key].length, key).toBeGreaterThan(0);
		}
		expect(doc.accounts[0].balanceMinor).toBeTypeOf('number');
		expect(Number.isInteger(doc.expenses[0].amountMinor)).toBe(true);
	});

	it('never holds the password, devices, recovery codes or sessions', async () => {
		const db = await freshDb();
		await household(db, 1);
		const text = backupText(await exportBackup(db, 1, NOW));
		for (const secret of ['scrypt$secret', 'cred-1', 'passwordHash']) {
			expect(text).not.toContain(secret);
		}
		for (const key of Object.keys(JSON.parse(text))) {
			expect(key).not.toMatch(/passkey|session|recovery|password/i);
		}
	});

	it('is byte-identical for the same budget, apart from the moment it was exported', async () => {
		const db = await freshDb();
		await household(db, 1);
		const a = backupText(await exportBackup(db, 1, NOW));
		const b = backupText(await exportBackup(db, 1, new Date('2026-11-05T08:00:00Z')));
		expect(a).not.toBe(b);
		expect(b.replace('2026-11-05T08:00:00.000Z', '2026-10-31T12:00:00.000Z')).toBe(a);
	});

	it('names the file by the owner-zone day, and records the download without touching the budget', async () => {
		expect(backupFilename('Pacific/Auckland', new Date('2026-10-31T12:00:00Z'))).toBe(
			'payday-backup-2026-11-01.json'
		);
		expect(backupFilename(null, new Date('2026-10-31T12:00:00Z'))).toBe(
			'payday-backup-2026-10-31.json'
		);
		const db = await freshDb();
		await household(db, 1);
		const before = await budgetOf(db, 1);
		expect(await lastBackupAt(db, 1)).toBeNull();
		await markBackupDownloaded(db, 1, NOW);
		expect(await lastBackupAt(db, 1)).toBe(NOW.toISOString());
		expect(await budgetOf(db, 1)).toEqual(before);
	});
});

describe('TSK-B78EFD the last backup is remembered and a new one suggested after two weeks', () => {
	it('is due when never taken, or more than 14 days old', () => {
		const day = 24 * 60 * 60 * 1000;
		expect(backupDue(null, NOW)).toBe(true);
		expect(backupDue(new Date(NOW.getTime() - 14 * day).toISOString(), NOW)).toBe(false);
		expect(backupDue(new Date(NOW.getTime() - 14 * day - 1000).toISOString(), NOW)).toBe(true);
		expect(backupDue(new Date(NOW.getTime() - day).toISOString(), NOW)).toBe(false);
		expect(backupDue('not a date', NOW)).toBe(true);
	});

	it('survives Start over and a restore', async () => {
		const db = await freshDb();
		await household(db, 1);
		const text = backupText(await exportBackup(db, 1, NOW));
		await markBackupDownloaded(db, 1, NOW);
		await eraseBudget(db, 1);
		expect(await lastBackupAt(db, 1)).toBe(NOW.toISOString());
		await restoreBackup(db, 1, text);
		expect(await lastBackupAt(db, 1)).toBe(NOW.toISOString());
	});
});

describe('TSK-86C4B3 back up, start over, restore: every row is as it was', () => {
	it('brings back every row and the same number', async () => {
		const db = await freshDb();
		await household(db, 1);
		const before = await budgetOf(db, 1);
		const numberBefore = await number(db, 1);
		const text = backupText(await exportBackup(db, 1, NOW));

		await eraseBudget(db, 1);
		expect((await exportBackup(db, 1, NOW)).scheduleItems).toEqual([]);
		await restoreBackup(db, 1, text);

		expect(byPlace(await budgetOf(db, 1))).toEqual(byPlace(before));
		expect(await number(db, 1)).toBe(numberBefore);
	});

	it('leaves sign-in alone, and another owner untouched', async () => {
		const db = await freshDb();
		await household(db, 1);
		await household(db, 2);
		const text = backupText(await exportBackup(db, 1, NOW));
		const theirs = await budgetOf(db, 2);
		const me = (await db.select().from(owner).where(eq(owner.id, 1)))[0]!;
		await restoreBackup(db, 1, text);
		expect(await budgetOf(db, 2)).toEqual(theirs);
		expect((await db.select().from(owner).where(eq(owner.id, 1)))[0]).toEqual(me);
	});
});

describe('TSK-818581 a restore replaces the budget with the file, remapping every id', () => {
	it('replaces a different budget, giving rows new ids and pointing each reference at them', async () => {
		const source = await freshDb();
		await household(source, 1);
		const text = backupText(await exportBackup(source, 1, NOW));
		const numberBefore = await number(source, 1);

		// The target has other rows first, so the new ids are not the file's.
		const db = await freshDb();
		await household(db, 9);
		await household(db, 1);
		const restored = await restoreBackup(db, 1, text);
		expect(restored.items).toBeGreaterThan(0);

		expect(await number(db, 1)).toBe(numberBefore);
		const doc = await exportBackup(db, 1, NOW);
		const itemIds = new Set(doc.scheduleItems.map((i) => i.id));
		const loanIds = new Set(doc.loans.map((l) => l.id));
		const checkInIds = new Set(doc.checkIns.map((c) => c.id));
		expect(doc.scheduleItems[0].id).not.toBe(JSON.parse(text).scheduleItems[0].id);
		for (const p of doc.paidMarks) expect(itemIds.has(p.itemId)).toBe(true);
		for (const o of doc.overrides) expect(itemIds.has(o.itemId)).toBe(true);
		for (const c of doc.paymentConfirmations) {
			expect(itemIds.has(c.itemId) && checkInIds.has(c.checkInId)).toBe(true);
		}
		for (const l of doc.loans) {
			expect(l.scheduleItemId === null || itemIds.has(l.scheduleItemId)).toBe(true);
		}
		for (const b of doc.loanBalances) {
			expect(loanIds.has(b.loanId)).toBe(true);
			expect(b.checkInId === null || checkInIds.has(b.checkInId)).toBe(true);
		}
		// Same content, ids aside: the loans still name the same payments.
		const named = (x: typeof doc) =>
			x.loans.map((l) => [l.name, x.scheduleItems.find((i) => i.id === l.scheduleItemId)?.name]);
		expect(named(doc)).toEqual(named(await exportBackup(source, 1, NOW)));
	});

	it('is all or nothing: a failure part-way leaves the old budget', async () => {
		const db = await freshDb();
		await household(db, 1);
		const text = backupText(await exportBackup(db, 1, NOW));
		const before = await budgetOf(db, 1);
		await db.execute(sql`create function payday.refuse() returns trigger language plpgsql
			as $$ begin raise exception 'refused'; end $$`);
		await db.execute(
			sql`create trigger refuse before insert on payday.loan_balance for each row execute function payday.refuse()`
		);
		try {
			await expect(restoreBackup(db, 1, text)).rejects.toMatchObject({
				cause: { message: expect.stringContaining('refused') }
			});
			expect(await budgetOf(db, 1)).toEqual(before);
		} finally {
			await db.execute(sql`drop trigger refuse on payday.loan_balance`);
			await db.execute(sql`drop function payday.refuse()`);
		}
	});
});

describe('TSK-2FB11D a file that is not a usable backup is refused in words, and changes nothing', async () => {
	const cases: [string, string, RegExp][] = [
		['not JSON', 'hello', /not a Payday backup/],
		['another JSON file', '{"a":1}', /not a Payday backup/],
		['a list', '[]', /not a Payday backup/],
		[
			'a newer version',
			await withDoc((d) => {
				d.version = 3;
			}),
			/newer version/
		],
		[
			'no version',
			await withDoc((d) => {
				delete d.version;
			}),
			/not a Payday backup/
		],
		[
			'a missing table',
			await withDoc((d) => {
				delete d.loans;
			}),
			/damaged.*loans is missing/
		],
		[
			'an amount that is not a whole number',
			await withDoc((d) => {
				d.expenses[0].amountMinor = 12.5;
			}),
			/amountMinor is not a whole number/
		],
		[
			'a bad date',
			await withDoc((d) => {
				d.accounts[0].balanceAsOf = '2026-13-45';
			}),
			/balanceAsOf is not a date/
		],
		[
			'a bill pointing at an account that is not there',
			await withDoc((d) => {
				d.scheduleItems[0].accountId = 999;
			}),
			/accountId points to account 999, which is not in the file/
		],
		[
			'a paid mark pointing at a missing bill',
			await withDoc((d) => {
				d.paidMarks[0].itemId = 999;
			}),
			/itemId points to item 999/
		],
		[
			'a loan balance pointing at a missing check-in',
			await withDoc((d) => {
				d.loanBalances[0].checkInId = 999;
			}),
			/check-in 999/
		],
		[
			'a loan pointing at a missing bill',
			await withDoc((d) => {
				d.loans[0].scheduleItemId = 999;
			}),
			/item 999/
		],
		[
			'a repeated id',
			await withDoc((d) => {
				d.scheduleItems[1].id = d.scheduleItems[0].id;
			}),
			/appears twice/
		],
		[
			'an unknown kind of bill',
			await withDoc((d) => {
				d.scheduleItems[0].kind = 'gift';
			}),
			/kind has a value Payday does not know/
		],
		[
			'a monthly bill with no day',
			await withDoc((d) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const m = d.scheduleItems.find((i: any) => i.ruleKind === 'monthly');
				m.ruleDay = null;
			}),
			/repeat that does not add up/
		],
		[
			'a bill at a negative amount',
			await withDoc((d) => {
				d.scheduleItems[1].amountMinor = -120000;
			}),
			/amountMinor must be above zero/
		],
		[
			'a changed amount of zero',
			await withDoc((d) => {
				d.overrides.push({
					...d.overrides[0],
					id: 99,
					originalDate: '2026-12-01',
					action: 'change',
					newAmountMinor: 0
				});
			}),
			/newAmountMinor must be above zero/
		],
		[
			'a negative loan rate',
			await withDoc((d) => {
				d.loans[0].rateBp = -1;
			}),
			/rateBp must not be negative/
		],
		[
			'a currency Payday does not know',
			await withDoc((d) => {
				d.settings.currency = 'XXX';
			}),
			/currency is not one Payday knows/
		],
		[
			'a year the forms would not take',
			await withDoc((d) => {
				d.scheduleItems[0].startsOn = '1999-01-01';
			}),
			/startsOn is not a date/
		],
		[
			'a name longer than the forms allow',
			await withDoc((d) => {
				d.scheduleItems[0].name = 'x'.repeat(61);
			}),
			/name is longer than 60 letters/
		],
		[
			'an expense note longer than the form allows',
			await withDoc((d) => {
				d.expenses[0].note = 'x'.repeat(61);
			}),
			/note is longer than 60 letters/
		],
		[
			'a logged time without milliseconds',
			await withDoc((d) => {
				d.expenses[0].loggedAt = '2026-10-31T13:00:00Z';
			}),
			/loggedAt is not a date and time/
		],
		[
			'a balance time in the +00:00 spelling',
			await withDoc((d) => {
				d.accounts[0].balanceSavedAt = '2026-10-31T12:00:00.000+00:00';
			}),
			/balanceSavedAt is not a date and time/
		],
		[
			'a balance read time with the wrong precision',
			await withDoc((d) => {
				d.checkIns[0].balanceReadAt = '2026-10-30T09:01:00.5Z';
			}),
			/balanceReadAt is not a date and time/
		],
		[
			'two unfinished check-ins',
			await withDoc((d) => {
				d.checkIns.push({ ...d.checkIns[0], id: 99999, finishedAt: null, currentStep: 'pay' });
				d.checkIns[0].finishedAt = null;
				d.checkIns[0].currentStep = 'pay';
			}),
			/more than one check-in is unfinished/
		],
		[
			'the same loan confirmed twice at one check-in',
			await withDoc((d) => {
				const own = d.loanBalances.find((b: { checkInId: number | null }) => b.checkInId !== null)!;
				d.loanBalances.push({ ...own, id: 99999 });
			}),
			/appears twice/
		],
		[
			'a zero expense',
			await withDoc((d) => {
				d.expenses[0].amountMinor = 0;
			}),
			/above zero/
		]
	];

	it.each(cases)('refuses %s', (_name, text, words) => {
		expect(refusal(text)).toMatch(words);
		expect(refusal(text)).toMatch(/nothing was changed/);
	});

	it('refuses a file over the size cap', () => {
		expect(refusal('x'.repeat(MAX_BACKUP_BYTES + 1))).toMatch(/too big/);
	});

	it('changes nothing in the database for any of them', async () => {
		const db = await freshDb();
		await household(db, 1);
		const before = await budgetOf(db, 1);
		for (const [, text] of cases) {
			await expect(restoreBackup(db, 1, text)).rejects.toThrow(BackupRefused);
		}
		expect(await budgetOf(db, 1)).toEqual(before);
	});
});

describe('TSK-86C4B3 the committed fixture restores to the number it was made with', () => {
	// The next slice (Postgres) re-runs this: the file and the number are the contract.
	const FIXTURE = new URL('./backup.fixture.json', import.meta.url);
	const EXPECTED = new URL('./backup.fixture.expected.json', import.meta.url);

	// `UPDATE_BACKUP_FIXTURE=1 pnpm vitest run src/lib/server/money/fullBackup.test.ts` rewrites both
	// from the fictional household. Fictional data only: never put a real budget here.
	it.runIf(process.env.UPDATE_BACKUP_FIXTURE === '1')('writes the fixture', async () => {
		const db = await freshDb();
		await household(db, 1);
		expect(await number(db, 1)).toBeTypeOf('number');
		writeFileSync(FIXTURE, backupText(await exportBackup(db, 1, NOW)));
		writeFileSync(
			EXPECTED,
			`${JSON.stringify({ on: NOW.toISOString(), safeToSpendMinor: await number(db, 1) }, null, 2)}\n`
		);
	});

	it('restores into a fresh database and gives the same safe-to-spend number', async () => {
		const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as {
			on: string;
			safeToSpendMinor: number;
		};
		const text = readFileSync(FIXTURE, 'utf8');
		const db = await freshDb();
		await db.insert(owner).values({ id: 1 });
		await restoreBackup(db, 1, text);
		const c = await computeSafe(db, 1, new Date(expected.on));
		expect(c.state).toBe('ready');
		expect(c.state === 'ready' && c.result.amount).toBe(expected.safeToSpendMinor);
		// The fixture is a version 1 file, and a restore writes version 2, so the re-export cannot be
		// the same bytes. It must be exactly the version 2 form of the same file: the version bumped,
		// every schedule item given `ruleDay2` (null: version 1 had no such rule) right after
		// `ruleDay`, and `isMainPay` right after `optional` (true for the lowest-id every-14-days
		// income, which is the migration's rule; false for the rest). Nothing else may differ.
		const v1 = JSON.parse(text);
		const firstPay = v1.scheduleItems.find(
			(i: { kind: string; ruleKind: string }) => i.kind === 'income' && i.ruleKind === 'every14'
		);
		const v2 = {
			...v1,
			version: 2,
			scheduleItems: v1.scheduleItems.map((i: Record<string, unknown>) =>
				Object.fromEntries(
					Object.entries(i).flatMap(([k, v]) => [
						[k, v],
						...(k === 'ruleDay' ? [['ruleDay2', null]] : []),
						...(k === 'optional' ? [['isMainPay', i === firstPay]] : [])
					])
				)
			),
			// Version 1 loan balances had no `readAt`; it is null and comes last.
			loanBalances: v1.loanBalances.map((b: Record<string, unknown>) => ({ ...b, readAt: null }))
		};
		const again = backupText(await exportBackup(db, 1, new Date(v1.exportedAt)));
		expect(again).toBe(`${JSON.stringify(v2)}\n`);
		// Written again it is stable: a version 2 file restores and re-exports byte for byte.
		const db2 = await freshDb();
		await db2.insert(owner).values({ id: 1 });
		await restoreBackup(db2, 1, again);
		expect(backupText(await exportBackup(db2, 1, new Date(v1.exportedAt)))).toBe(again);
	});
});

describe('TSK-20E9EF a version 1 backup restores with no second day and its main pay inferred', () => {
	/** The household as a version 1 file: the two new fields taken out, the version put back. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function v1File(change: (doc: Record<string, any>) => void = () => {}) {
		const db = await freshDb();
		await household(db, 1);
		const doc = JSON.parse(backupText(await exportBackup(db, 1, NOW)));
		doc.version = 1;
		for (const i of doc.scheduleItems) {
			delete i.ruleDay2;
			delete i.isMainPay;
		}
		for (const b of doc.loanBalances) delete b.readAt;
		change(doc);
		return { text: `${JSON.stringify(doc)}\n`, number: await number(db, 1) };
	}

	it('marks the lowest-id every-14-days income and leaves the number as it was', async () => {
		const { text, number: before } = await v1File();
		const db = await freshDb();
		await db.insert(owner).values({ id: 1 });
		await restoreBackup(db, 1, text);
		const rows = await db.select().from(scheduleItem).orderBy(scheduleItem.id);
		expect(rows.filter((r) => r.isMainPay).map((r) => r.name)).toEqual(['Pay']);
		expect(rows.every((r) => r.ruleDay2 === null)).toBe(true);
		expect(await number(db, 1)).toBe(before);
	});

	it('TSK-86C4B3 a loan balance saved by a loans step keeps its read time; a version 1 file has none', async () => {
		const db = await freshDb();
		await household(db, 1);
		const text = backupText(await exportBackup(db, 1, NOW));
		expect(JSON.parse(text).loanBalances.map((b: { readAt: string | null }) => b.readAt)).toContain(
			'2026-10-30T09:01:30.000Z'
		);
		const again = await freshDb();
		await again.insert(owner).values({ id: 1 });
		await restoreBackup(again, 1, text);
		expect((await again.select().from(loanBalance)).map((b) => b.readAt)).toContain(
			'2026-10-30T09:01:30.000Z'
		);
		expect(backupText(await exportBackup(again, 1, NOW))).toBe(text);

		const old = await v1File();
		const third = await freshDb();
		await third.insert(owner).values({ id: 1 });
		await restoreBackup(third, 1, old.text);
		expect((await third.select().from(loanBalance)).every((b) => b.readAt === null)).toBe(true);
	});

	it('marks nothing when there is no every-14-days income', async () => {
		const { text } = await v1File((doc) => {
			for (const i of doc.scheduleItems) {
				if (i.kind === 'income') {
					i.ruleKind = 'monthly';
					i.ruleAnchor = null;
					i.ruleDay = 1;
				}
			}
		});
		const db = await freshDb();
		await db.insert(owner).values({ id: 1 });
		await restoreBackup(db, 1, text);
		expect((await db.select().from(scheduleItem)).some((r) => r.isMainPay)).toBe(false);
	});

	it('a version 1 file cannot hold a twice-a-month rule, and a version 2 file can', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const twice = (doc: Record<string, any>) => {
			const pay = doc.scheduleItems.find((i: { kind: string }) => i.kind === 'income');
			Object.assign(pay, { ruleKind: 'twiceMonthly', ruleAnchor: null, ruleDay: 15 });
			return pay;
		};
		const old = await v1File((doc) => {
			twice(doc);
		});
		expect(refusal(old.text)).toMatch(/repeat that does not add up/);

		const db = await freshDb();
		await household(db, 1);
		const doc = JSON.parse(backupText(await exportBackup(db, 1, NOW)));
		Object.assign(twice(doc), { ruleDay2: 30 });
		const again = await freshDb();
		await again.insert(owner).values({ id: 1 });
		await restoreBackup(again, 1, `${JSON.stringify(doc)}\n`);
		const [pay] = await again.select().from(scheduleItem).where(eq(scheduleItem.name, 'Pay'));
		expect(pay).toMatchObject({
			ruleKind: 'twiceMonthly',
			ruleDay: 15,
			ruleDay2: 30,
			isMainPay: true
		});
	});

	it('infers the still-running pay when the lowest-id one has ended (same rule as migration 0003)', async () => {
		const { text } = await v1File((doc) => {
			const first = doc.scheduleItems.find((i: { kind: string }) => i.kind === 'income');
			first.endsOn = '2026-06-30';
			doc.scheduleItems.push({
				...first,
				id: 700,
				name: 'Newer pay',
				startsOn: '2026-07-01',
				endsOn: null
			});
		});
		const db = await freshDb();
		await db.insert(owner).values({ id: 1 });
		await restoreBackup(db, 1, text);
		const rows = await db.select().from(scheduleItem);
		expect(rows.filter((r) => r.isMainPay).map((r) => r.name)).toEqual(['Newer pay']);
	});

	it('TSK-20E9EF refuses a second pay that is main and still running', async () => {
		const bad = await withDoc((doc) => {
			const pay = doc.scheduleItems.find((i: { kind: string }) => i.kind === 'income');
			pay.isMainPay = true;
			doc.scheduleItems.push({ ...pay, id: 70, name: 'Second pay' });
		});
		expect(refusal(bad)).toMatch(/more than one main pay is still running/);
	});

	it('TSK-20E9EF refuses two main pays whose dates overlap, and accepts the rhythm-switch shape', async () => {
		const make = (oldEnds: string, newStarts: string) =>
			withDoc((doc) => {
				const pay = doc.scheduleItems.find((i: { kind: string }) => i.kind === 'income');
				Object.assign(pay, { isMainPay: true, startsOn: '2026-01-01', endsOn: oldEnds });
				doc.scheduleItems.push({
					...pay,
					id: 70,
					name: 'New pay',
					startsOn: newStarts,
					endsOn: null
				});
			});
		expect(refusal(await make('2026-11-20', '2026-11-20'))).toMatch(/main pays overlap/);
		expect(refusal(await make('2026-11-20', '2026-11-10'))).toMatch(/main pays overlap/);
		const ok = await make('2026-11-19', '2026-11-20');
		expect(() => parseBackup(ok)).not.toThrow();
	});

	it('TSK-20E9EF refuses a main pay that is not every 2 weeks, monthly or twice a month', async () => {
		const bad = await withDoc((doc) => {
			const pay = doc.scheduleItems.find((i: { kind: string }) => i.kind === 'income');
			Object.assign(pay, {
				isMainPay: true,
				ruleKind: 'yearly',
				ruleAnchor: '2026-03-01',
				ruleDay: null
			});
		});
		expect(refusal(bad)).toMatch(/pay that comes every 2 weeks, once a month or twice a month/);
	});

	it('TSK-20E9EF refuses a second day on a rule that is not twice a month', async () => {
		const bad = await withDoc((doc) => {
			doc.scheduleItems[0].ruleDay2 = 20;
		});
		expect(refusal(bad)).toMatch(/second day/);
	});

	it('refuses a version 2 file whose main pay is not pay', async () => {
		const bad = await withDoc((doc) => {
			doc.scheduleItems.find((i: { kind: string }) => i.kind === 'bill').isMainPay = true;
		});
		expect(refusal(bad)).toMatch(/only pay can be the main pay/);
	});
});

describe('TSK-818581 a restore checks the session inside its transaction', () => {
	it('refuses, leaving the old budget, when the session ended before the restore ran', async () => {
		const db = await freshDb();
		await household(db, 1);
		const text = backupText(await exportBackup(db, 1, NOW));
		const { token } = await createSession(db, 1, 'vitest');
		await deleteAllSessions(db, 1);
		const before = await budgetOf(db, 1);
		await expect(restoreBackup(db, 1, text, sha256Hex(token))).rejects.toBeInstanceOf(
			SessionEndedError
		);
		expect(await budgetOf(db, 1)).toEqual(before);
	});
});
