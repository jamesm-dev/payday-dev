import { readFileSync, writeFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { addPasskey } from '#lib/server/auth/passkeys.ts';
import { setPasswordHash } from '#lib/server/auth/password.ts';
import { insertRecoveryCodes } from '#lib/server/auth/recovery.ts';
import { createSession } from '#lib/server/auth/session.ts';
import { open, type Db } from '#lib/server/db/open.ts';
import {
	account,
	checkIn,
	loan,
	loanBalance,
	owner,
	paidMark,
	paymentConfirmation,
	pushSubscription,
	scheduleItem
} from '#lib/server/db/schema.ts';
import { setReminderTime } from '#lib/server/reminders/store.ts';
import { eraseBudget } from './erase.ts';
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
function household(db: Db, ownerId: number) {
	db.insert(owner).values({ id: ownerId }).run();
	seedHousehold(db, { ownerId, production: false, now: NOW });
	const item = db
		.select({ id: scheduleItem.id })
		.from(scheduleItem)
		.innerJoin(account, eq(scheduleItem.accountId, account.id))
		.where(eq(account.ownerId, ownerId))
		.get()!;
	const owed = db.select({ id: loan.id }).from(loan).where(eq(loan.ownerId, ownerId)).get()!;
	db.insert(paidMark).values({ itemId: item.id, originalDate: '2026-11-01' }).run();
	addExpense(
		db,
		ownerId,
		{ amount: minor(1250), note: 'Lunch', spentOn: d('2026-10-31') },
		new Date('2026-10-31T13:00:00Z')
	);
	const done = db
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
		.get();
	db.insert(paymentConfirmation)
		.values({
			checkInId: done.id,
			itemId: item.id,
			originalDate: '2026-10-15',
			dueDate: '2026-10-15',
			amountMinor: 5000,
			status: 'paid'
		})
		.run();
	db.insert(loanBalance)
		.values({
			loanId: owed.id,
			checkInId: done.id,
			asOf: '2026-10-30',
			balanceMinor: 90000,
			source: 'check-in'
		})
		.run();
	// Everything that is NOT the budget.
	db.insert(pushSubscription)
		.values({ ownerId, endpoint: `https://push.invalid/${ownerId}`, p256dh: 'k', auth: 'a' })
		.run();
	setReminderTime(db, ownerId, '07:30');
	setPasswordHash(db, ownerId, `scrypt$secret-${ownerId}`);
	addPasskey(db, ownerId, {
		id: `cred-${ownerId}`,
		publicKey: new Uint8Array([1, 2, 3]),
		counter: 0,
		transports: ['internal'],
		nickname: 'Phone'
	});
	insertRecoveryCodes(db, ownerId);
	createSession(db, ownerId, 'test');
}

/** The export without the moment it was made: what must come back identical. */
const budgetOf = (db: Db, ownerId: number) => ({
	...exportBackup(db, ownerId, NOW),
	exportedAt: ''
});
const number = (db: Db, ownerId: number) => {
	const c = computeSafe(db, ownerId, NOW);
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
const withDoc = (change: (doc: Record<string, any>) => void) => {
	const db = open(':memory:');
	household(db, 1);
	const doc = JSON.parse(backupText(exportBackup(db, 1, NOW)));
	change(doc);
	return JSON.stringify(doc);
};

describe('TSK-F3FBD8 the backup file holds the budget and nothing that signs in', () => {
	it('has the budget, its settings and every table, with amounts as whole numbers', () => {
		const db = open(':memory:');
		household(db, 1);
		const doc = JSON.parse(backupText(exportBackup(db, 1, NOW)));
		expect(doc).toMatchObject({
			format: 'payday-backup',
			version: 1,
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

	it('never holds the password, devices, recovery codes, sessions, phones or reminder bookkeeping', () => {
		const db = open(':memory:');
		household(db, 1);
		const text = backupText(exportBackup(db, 1, NOW));
		for (const secret of ['scrypt$secret', 'cred-1', 'push.invalid', 'passwordHash', 'endpoint']) {
			expect(text).not.toContain(secret);
		}
		for (const key of Object.keys(JSON.parse(text))) {
			expect(key).not.toMatch(/passkey|session|recovery|push|reminderSent|password/i);
		}
	});

	it('is byte-identical for the same budget, apart from the moment it was exported', () => {
		const db = open(':memory:');
		household(db, 1);
		const a = backupText(exportBackup(db, 1, NOW));
		const b = backupText(exportBackup(db, 1, new Date('2026-11-05T08:00:00Z')));
		expect(a).not.toBe(b);
		expect(b.replace('2026-11-05T08:00:00.000Z', '2026-10-31T12:00:00.000Z')).toBe(a);
	});

	it('names the file by the owner-zone day, and records the download without touching the budget', () => {
		expect(backupFilename('Pacific/Auckland', new Date('2026-10-31T12:00:00Z'))).toBe(
			'payday-backup-2026-11-01.json'
		);
		expect(backupFilename(null, new Date('2026-10-31T12:00:00Z'))).toBe(
			'payday-backup-2026-10-31.json'
		);
		const db = open(':memory:');
		household(db, 1);
		const before = budgetOf(db, 1);
		expect(lastBackupAt(db, 1)).toBeNull();
		markBackupDownloaded(db, 1, NOW);
		expect(lastBackupAt(db, 1)).toBe(NOW.toISOString());
		expect(budgetOf(db, 1)).toEqual(before);
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

	it('survives Start over and a restore', () => {
		const db = open(':memory:');
		household(db, 1);
		const text = backupText(exportBackup(db, 1, NOW));
		markBackupDownloaded(db, 1, NOW);
		eraseBudget(db, 1);
		expect(lastBackupAt(db, 1)).toBe(NOW.toISOString());
		restoreBackup(db, 1, text);
		expect(lastBackupAt(db, 1)).toBe(NOW.toISOString());
	});
});

describe('TSK-86C4B3 back up, start over, restore: every row is as it was', () => {
	it('brings back every row and the same number', () => {
		const db = open(':memory:');
		household(db, 1);
		const before = budgetOf(db, 1);
		const numberBefore = number(db, 1);
		const text = backupText(exportBackup(db, 1, NOW));

		eraseBudget(db, 1);
		expect(exportBackup(db, 1, NOW).scheduleItems).toEqual([]);
		restoreBackup(db, 1, text);

		expect(budgetOf(db, 1)).toEqual(before);
		expect(number(db, 1)).toBe(numberBefore);
	});

	it('leaves sign-in alone, and another owner untouched', () => {
		const db = open(':memory:');
		household(db, 1);
		household(db, 2);
		const text = backupText(exportBackup(db, 1, NOW));
		const theirs = budgetOf(db, 2);
		const me = db.select().from(owner).where(eq(owner.id, 1)).get()!;
		restoreBackup(db, 1, text);
		expect(budgetOf(db, 2)).toEqual(theirs);
		expect(db.select().from(owner).where(eq(owner.id, 1)).get()).toEqual(me);
	});
});

describe('TSK-818581 a restore replaces the budget with the file, remapping every id', () => {
	it('replaces a different budget, giving rows new ids and pointing each reference at them', () => {
		const source = open(':memory:');
		household(source, 1);
		const text = backupText(exportBackup(source, 1, NOW));
		const numberBefore = number(source, 1);

		// The target has other rows first, so the new ids are not the file's.
		const db = open(':memory:');
		household(db, 9);
		household(db, 1);
		const restored = restoreBackup(db, 1, text);
		expect(restored.items).toBeGreaterThan(0);

		expect(number(db, 1)).toBe(numberBefore);
		const doc = exportBackup(db, 1, NOW);
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
		expect(named(doc)).toEqual(named(exportBackup(source, 1, NOW)));
	});

	it('is all or nothing: a failure part-way leaves the old budget', () => {
		const db = open(':memory:');
		household(db, 1);
		const text = backupText(exportBackup(db, 1, NOW));
		const before = budgetOf(db, 1);
		db.$client.exec(
			"CREATE TRIGGER refuse BEFORE INSERT ON loan_balance BEGIN SELECT RAISE(ABORT, 'refused'); END"
		);
		expect(() => restoreBackup(db, 1, text)).toThrow('refused');
		expect(budgetOf(db, 1)).toEqual(before);
	});
});

describe('TSK-2FB11D a file that is not a usable backup is refused in words, and changes nothing', () => {
	const cases: [string, string, RegExp][] = [
		['not JSON', 'hello', /not a Payday backup/],
		['another JSON file', '{"a":1}', /not a Payday backup/],
		['a list', '[]', /not a Payday backup/],
		[
			'a newer version',
			withDoc((d) => {
				d.version = 2;
			}),
			/newer version/
		],
		[
			'no version',
			withDoc((d) => {
				delete d.version;
			}),
			/not a Payday backup/
		],
		[
			'a missing table',
			withDoc((d) => {
				delete d.loans;
			}),
			/damaged.*loans is missing/
		],
		[
			'an amount that is not a whole number',
			withDoc((d) => {
				d.expenses[0].amountMinor = 12.5;
			}),
			/amountMinor is not a whole number/
		],
		[
			'a bad date',
			withDoc((d) => {
				d.accounts[0].balanceAsOf = '2026-13-45';
			}),
			/balanceAsOf is not a date/
		],
		[
			'a bill pointing at an account that is not there',
			withDoc((d) => {
				d.scheduleItems[0].accountId = 999;
			}),
			/accountId points to account 999, which is not in the file/
		],
		[
			'a paid mark pointing at a missing bill',
			withDoc((d) => {
				d.paidMarks[0].itemId = 999;
			}),
			/itemId points to item 999/
		],
		[
			'a loan balance pointing at a missing check-in',
			withDoc((d) => {
				d.loanBalances[0].checkInId = 999;
			}),
			/check-in 999/
		],
		[
			'a loan pointing at a missing bill',
			withDoc((d) => {
				d.loans[0].scheduleItemId = 999;
			}),
			/item 999/
		],
		[
			'a repeated id',
			withDoc((d) => {
				d.scheduleItems[1].id = d.scheduleItems[0].id;
			}),
			/appears twice/
		],
		[
			'an unknown kind of bill',
			withDoc((d) => {
				d.scheduleItems[0].kind = 'gift';
			}),
			/kind has a value Payday does not know/
		],
		[
			'a monthly bill with no day',
			withDoc((d) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const m = d.scheduleItems.find((i: any) => i.ruleKind === 'monthly');
				m.ruleDay = null;
			}),
			/repeat that does not add up/
		],
		[
			'a bill at a negative amount',
			withDoc((d) => {
				d.scheduleItems[1].amountMinor = -120000;
			}),
			/amountMinor must be above zero/
		],
		[
			'a changed amount of zero',
			withDoc((d) => {
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
			withDoc((d) => {
				d.loans[0].rateBp = -1;
			}),
			/rateBp must not be negative/
		],
		[
			'a currency Payday does not know',
			withDoc((d) => {
				d.settings.currency = 'XXX';
			}),
			/currency is not one Payday knows/
		],
		[
			'a year the forms would not take',
			withDoc((d) => {
				d.scheduleItems[0].startsOn = '1999-01-01';
			}),
			/startsOn is not a date/
		],
		[
			'a name longer than the forms allow',
			withDoc((d) => {
				d.scheduleItems[0].name = 'x'.repeat(61);
			}),
			/name is longer than 60 letters/
		],
		[
			'an expense note longer than the form allows',
			withDoc((d) => {
				d.expenses[0].note = 'x'.repeat(61);
			}),
			/note is longer than 60 letters/
		],
		[
			'a logged time without milliseconds',
			withDoc((d) => {
				d.expenses[0].loggedAt = '2026-10-31T13:00:00Z';
			}),
			/loggedAt is not a date and time/
		],
		[
			'a balance time in the +00:00 spelling',
			withDoc((d) => {
				d.accounts[0].balanceSavedAt = '2026-10-31T12:00:00.000+00:00';
			}),
			/balanceSavedAt is not a date and time/
		],
		[
			'a balance read time with the wrong precision',
			withDoc((d) => {
				d.checkIns[0].balanceReadAt = '2026-10-30T09:01:00.5Z';
			}),
			/balanceReadAt is not a date and time/
		],
		[
			'a zero expense',
			withDoc((d) => {
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

	it('changes nothing in the database for any of them', () => {
		const db = open(':memory:');
		household(db, 1);
		const before = budgetOf(db, 1);
		for (const [, text] of cases) {
			expect(() => restoreBackup(db, 1, text)).toThrow(BackupRefused);
		}
		expect(budgetOf(db, 1)).toEqual(before);
	});
});

describe('TSK-86C4B3 the committed fixture restores to the number it was made with', () => {
	// The next slice (Postgres) re-runs this: the file and the number are the contract.
	const FIXTURE = new URL('./backup.fixture.json', import.meta.url);
	const EXPECTED = new URL('./backup.fixture.expected.json', import.meta.url);

	// `UPDATE_BACKUP_FIXTURE=1 pnpm vitest run src/lib/server/money/fullBackup.test.ts` rewrites both
	// from the fictional household. Fictional data only: never put a real budget here.
	it.runIf(process.env.UPDATE_BACKUP_FIXTURE === '1')('writes the fixture', () => {
		const db = open(':memory:');
		household(db, 1);
		expect(number(db, 1)).toBeTypeOf('number');
		writeFileSync(FIXTURE, backupText(exportBackup(db, 1, NOW)));
		writeFileSync(
			EXPECTED,
			`${JSON.stringify({ on: NOW.toISOString(), safeToSpendMinor: number(db, 1) }, null, 2)}\n`
		);
	});

	it('restores into a fresh database and gives the same safe-to-spend number', () => {
		const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as {
			on: string;
			safeToSpendMinor: number;
		};
		const text = readFileSync(FIXTURE, 'utf8');
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		restoreBackup(db, 1, text);
		const c = computeSafe(db, 1, new Date(expected.on));
		expect(c.state).toBe('ready');
		expect(c.state === 'ready' && c.result.amount).toBe(expected.safeToSpendMinor);
		// And it re-exports to the same file, so the format round-trips byte for byte.
		const again = backupText(exportBackup(db, 1, new Date(JSON.parse(text).exportedAt)));
		expect(again).toBe(text);
	});
});
