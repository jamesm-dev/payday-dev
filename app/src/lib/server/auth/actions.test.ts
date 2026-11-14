import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, passkey, session } from '#lib/server/db/schema.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';
import { eraseBudget } from '#lib/server/money/erase.ts';
import { backupText, exportBackup, lastBackupAt } from '#lib/server/money/fullBackup.ts';
import { getOwner, listItems } from '#lib/server/money/store.ts';

/*
 * The sign-in and security actions, run as SvelteKit would run them, against an in-memory database.
 * Only the framework's env modules and the one shared database are replaced.
 */
const state = vi.hoisted(() => ({ db: null as unknown, slept: [] as number[] }));
// The real brake, but its waiting is recorded instead of slept, so the suite stays fast.
vi.mock('./failureBrake.ts', async (original) => {
	const real = await original<typeof import('./failureBrake.ts')>();
	return {
		...real,
		failureBrake: real.createFailureBrake({ sleep: async (ms) => void state.slept.push(ms) })
	};
});
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));

import {
	actions as passwordActions,
	load as passwordLoad
} from '../../../routes/settings/security/password/+page.server.ts';
import { actions as backupActions } from '../../../routes/settings/backup/+page.server.ts';
import { GET as downloadBackup } from '../../../routes/settings/backup/download/+server.ts';
import { actions as securityActions } from '../../../routes/settings/security/+page.server.ts';
import { actions as signinActions } from '../../../routes/signin/+page.server.ts';
import { failureBrake } from './failureBrake.ts';
import {
	hashPassword,
	MAX_CONCURRENT,
	MAX_WAITING,
	PasswordBusyError,
	passwordGate,
	setPasswordHash
} from './password.ts';
import { createGlobalSlots } from './rateLimit.ts';
import { addPasskey, OWNER_ID } from './passkeys.ts';
import { insertRecoveryCodes } from './recovery.ts';
import { createSession, deleteAllSessions } from './session.ts';
import { PASSWORD_CHANGED, TOO_MANY } from './signInAttempt.ts';
import { STEP_UP_MESSAGE, stepUps } from './stepUp.ts';
import { cookieJar, testEvent } from './testEvent.ts';
import { sha256Hex } from './tokens.ts';

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const OLD = 'the old passphrase here';
const NEW = 'a brand new passphrase';
const PASSWORD_PAGE = '/settings/security/password';

let db: Db;
let ip = 0;
/** A fresh address per test, so the shared per-IP limits never carry over. */
const nextIp = () => `198.51.100.${++ip}`;

beforeEach(async () => {
	db = await freshDb();
	state.db = db;
	await db.insert(owner).values({ id: OWNER_ID });
	await setPasswordHash(db, OWNER_ID, await hashPassword(OLD, FAST));
});

const holders: Array<() => Promise<void>> = [];
// A test that fails with the queue held must not starve the ones after it.
afterEach(async () => {
	while (holders.length) await holders.pop()!();
});

/** Holds `n` places in the hash queue until released. Hash anything you need BEFORE calling it. */
function hold(n: number) {
	const releases: Array<() => void> = [];
	let settled = 0;
	const jobs = Array.from({ length: n }, () =>
		passwordGate(() => new Promise<void>((resolve) => releases.push(resolve)))
			.catch(() => {})
			.finally(() => settled++)
	);
	const release = async () => {
		// Jobs start one by one as places free up, so keep letting go until every one has finished.
		while (settled < n) {
			while (releases.length) releases.shift()!();
			await new Promise((r) => setImmediate(r));
		}
		await Promise.all(jobs);
	};
	holders.push(release);
	return { release };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

type Failed = { status: number; data: { message: string } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (action: any, event: ReturnType<typeof testEvent>) => action(event);

const thrown = async (promise: unknown) => {
	try {
		await promise;
	} catch (error) {
		return error as { status: number; location: string };
	}
	return undefined;
};

/** A signed-in browser: a session row and its cookie. */
async function signedIn() {
	const { token } = await createSession(db, OWNER_ID, 'test');
	const { cookies } = cookieJar({ session: token });
	return { id: sha256Hex(token), cookies, address: nextIp() };
}

const passwordForm = (
	me: Awaited<ReturnType<typeof signedIn>>,
	fields: Record<string, string>,
	path = PASSWORD_PAGE
) => testEvent({ fields, cookies: me.cookies, address: me.address, ownerId: OWNER_ID, path });

describe('TSK-2F1582 the sign-in action', () => {
	it('signs in with the right password and goes to the page asked for', async () => {
		const { cookies, jar } = cookieJar();
		const event = testEvent({
			fields: { password: OLD, next: '/schedule' },
			cookies,
			address: nextIp()
		});
		expect(await thrown(run(signinActions.password, event))).toMatchObject({
			status: 303,
			location: '/schedule'
		});
		expect(jar.get('session')).toBeTruthy();
	});

	it('refuses a sign-in with the OLD password that finishes after the password was changed', async () => {
		const newHash = await hashPassword(NEW, FAST);
		const held = hold(2); // both hash places are taken: the sign-in has read the hash, then waits
		const { cookies, jar } = cookieJar();
		const attempt = run(
			signinActions.password,
			testEvent({ fields: { password: OLD }, cookies, address: nextIp() })
		);
		await tick();
		// The owner's change lands in the meantime: a new hash in the row, the other sessions gone.
		await setPasswordHash(db, OWNER_ID, newHash);
		await db.delete(session);
		const before = await failureBrake.count(db);
		await held.release();

		const result = (await attempt) as Failed;
		expect(result.status).toBe(400);
		expect(result.data.message).toBe(PASSWORD_CHANGED);
		expect(jar.size).toBe(0);
		expect(await db.select().from(session)).toHaveLength(0);
		expect(await failureBrake.count(db)).toBe(before + 1); // a failed attempt, as asked
	});

	it('slows guessing: a wrong password is a brake failure, a right one is not, and the brake waits', async () => {
		const address = nextIp();
		const before = await failureBrake.count(db);
		await run(
			signinActions.password,
			testEvent({ fields: { password: 'wrong wrong wrong' }, address })
		);
		expect(await failureBrake.count(db)).toBe(before + 1);
		await thrown(run(signinActions.password, testEvent({ fields: { password: OLD }, address })));
		expect(await failureBrake.count(db)).toBe(before + 1);

		for (let i = 0; i < 8; i++) await failureBrake.recordFailure(db);
		expect(await failureBrake.delayMs(db)).toBeGreaterThanOrEqual(300);
		state.slept.length = 0;
		await run(
			signinActions.password,
			testEvent({ fields: { password: 'wrong wrong wrong' }, address: nextIp() })
		);
		expect(state.slept).toHaveLength(1);
		expect(state.slept[0]).toBeGreaterThanOrEqual(300);
	});
});

describe('TSK-2F1582 the queue through the actions', () => {
	it('charges every attempt: the 11th from one address in a minute is a 429', async () => {
		const address = nextIp();
		for (let i = 0; i < 10; i++) {
			const r = (await run(
				signinActions.recovery,
				testEvent({ fields: { code: 'nope' }, address })
			)) as Failed;
			expect(r.status).toBe(400);
		}
		const eleventh = (await run(
			signinActions.recovery,
			testEvent({ fields: { code: 'nope' }, address })
		)) as Failed;
		expect(eleventh.status).toBe(429);
		expect(eleventh.data.message).toBe(TOO_MANY);
	});

	it('refunds a success: the owner signing in again and again is never limited', async () => {
		const address = nextIp();
		for (let i = 0; i < 14; i++) {
			const { cookies } = cookieJar();
			const event = testEvent({ fields: { password: OLD }, cookies, address });
			expect(await thrown(run(signinActions.password, event))).toMatchObject({ status: 303 });
		}
	});

	it('holds one address to 2 places, so the owner from another address still gets in', async () => {
		const held = hold(2);
		const attacker = nextIp();
		const guess = () =>
			run(
				signinActions.password,
				testEvent({ fields: { password: 'guess guess guess' }, address: attacker })
			);
		const pending = [guess(), guess()];
		await tick();
		expect(((await guess()) as Failed).status).toBe(429);

		const { cookies, jar } = cookieJar();
		const owners = run(
			signinActions.password,
			testEvent({ fields: { password: OLD }, cookies, address: nextIp() })
		);
		await tick();
		await held.release();
		expect(await thrown(owners)).toMatchObject({ status: 303 });
		expect(jar.get('session')).toBeTruthy();
		await Promise.all(pending);
	});

	it('answers 503, not a hang, when the whole queue is full', async () => {
		const held = hold(2 + 16);
		await tick();
		const result = (await run(
			signinActions.password,
			testEvent({ fields: { password: OLD }, address: nextIp() })
		)) as Failed;
		expect(result.status).toBe(503);
		await held.release();
	});

	it('does not confirm a session when the password changed while the check waited', async () => {
		const me = await signedIn();
		const newHash = await hashPassword(NEW, FAST);
		const held = hold(2);
		const confirming = run(
			securityActions.confirm,
			testEvent({
				fields: { password: OLD },
				cookies: me.cookies,
				address: me.address,
				ownerId: OWNER_ID
			})
		);
		await tick();
		await setPasswordHash(db, OWNER_ID, newHash);
		await held.release();
		const result = (await confirming) as Failed;
		expect(result).toMatchObject({ status: 400 });
		expect(result.data.message).toBe(PASSWORD_CHANGED);
		expect(await stepUps.hasAssertion(db, me.id)).toBe(false);
	});
});

describe('TSK-2F1582 recovery sign-in keeps its next page through setting the password', () => {
	it('goes recovery, then set password, then back to the page asked for, and shuts the window', async () => {
		const [code] = await insertRecoveryCodes(db, OWNER_ID);
		const { cookies, jar } = cookieJar();
		const address = nextIp();

		const signedInByCode = await thrown(
			run(
				signinActions.recovery,
				testEvent({ fields: { code, next: '/schedule' }, cookies, address })
			)
		);
		expect(signedInByCode).toMatchObject({
			status: 303,
			location: `${PASSWORD_PAGE}?next=${encodeURIComponent('/schedule')}`
		});
		const id = sha256Hex(jar.get('session')!);
		expect(await stepUps.hasRecoveryWindow(db, id)).toBe(true);

		const page = (await passwordLoad({
			locals: { ownerId: OWNER_ID },
			cookies,
			url: new URL(`http://localhost${signedInByCode!.location}`)
		} as never)) as { next: string; recovering: boolean; canSkipCurrent: boolean };
		expect(page).toMatchObject({ next: '/schedule', recovering: true, canSkipCurrent: true });

		const change = testEvent({
			fields: { current: '', password: NEW, again: NEW, next: page.next },
			cookies,
			address,
			ownerId: OWNER_ID,
			path: PASSWORD_PAGE
		});
		expect(await thrown(run(passwordActions.change, change))).toMatchObject({
			status: 303,
			location: '/schedule'
		});

		// The window is shut: the same session cannot set the password again without the new one.
		expect(await stepUps.hasRecoveryWindow(db, id)).toBe(false);
		const again = (await run(
			passwordActions.change,
			testEvent({
				fields: {
					current: '',
					password: 'yet another passphrase',
					again: 'yet another passphrase'
				},
				cookies,
				address,
				ownerId: OWNER_ID,
				path: PASSWORD_PAGE
			})
		)) as Failed;
		expect(again.status).toBe(403);
		const stored = (await db.select().from(owner))[0]!.passwordHash!;
		expect(stored).toContain('N=32768');
	});
});

describe('TSK-2F1582 changing the password at the action level', () => {
	it('refuses a session with no step-up and no current password, and changes nothing', async () => {
		const me = await signedIn();
		const before = (await db.select().from(owner))[0]!.passwordHash;
		const result = (await run(
			passwordActions.change,
			passwordForm(me, { current: '', password: NEW, again: NEW })
		)) as Failed;
		expect(result.status).toBe(403);
		expect(result.data.message).toContain('current password');
		expect((await db.select().from(owner))[0]!.passwordHash).toBe(before);
	});

	it('refuses a wrong current password even from a confirmed session, and charges it', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		const before = await failureBrake.count(db);
		const result = (await run(
			passwordActions.change,
			passwordForm(me, { current: 'not the old one', password: NEW, again: NEW })
		)) as Failed;
		expect(result.status).toBe(400);
		expect(await failureBrake.count(db)).toBe(before + 1);
	});

	it('changes it with the current password, ends the other sessions, keeps this one', async () => {
		const me = await signedIn();
		const other = await signedIn();
		const change = passwordForm(me, { current: OLD, password: NEW, again: NEW, next: '/loans' });
		expect(await thrown(run(passwordActions.change, change))).toMatchObject({
			status: 303,
			location: '/loans'
		});
		expect((await db.select().from(session)).map((s) => s.id)).toEqual([me.id]);
		expect(await stepUps.hasAssertion(db, other.id)).toBe(false);
		expect(await stepUps.hasAssertion(db, me.id)).toBe(true);
	});
});

describe('TSK-2F1582 an owner with no password keeps their last passkey', () => {
	it('refuses the removal with a plain message, then allows it once a password is set', async () => {
		await db.update(owner).set({ passwordHash: null });
		await addPasskey(db, OWNER_ID, {
			id: 'cred-1',
			publicKey: new Uint8Array([1, 2, 3]),
			counter: 0,
			transports: ['internal'],
			nickname: 'Phone'
		});
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		const event = () =>
			testEvent({
				fields: { id: 'cred-1' },
				cookies: me.cookies,
				address: me.address,
				ownerId: OWNER_ID,
				path: '/settings/security'
			});

		const refused = (await run(securityActions.remove, event())) as Failed;
		expect(refused.status).toBe(409);
		expect(refused.data.message).toContain('Set a password first');
		expect(await db.select().from(passkey)).toHaveLength(1);

		await setPasswordHash(db, OWNER_ID, await hashPassword(OLD, FAST));
		expect(await run(securityActions.remove, event())).toEqual({ done: 'remove' });
		expect(await db.select().from(passkey)).toHaveLength(0);
	});
});

describe('starting over at the action level', () => {
	type Refused = { status: number; data: { erase: string; field?: string } };
	const erase = (me: Awaited<ReturnType<typeof signedIn>>, confirm: string) =>
		run(
			securityActions.erase,
			testEvent({
				fields: { confirm },
				cookies: me.cookies,
				address: me.address,
				ownerId: OWNER_ID,
				path: '/settings/security'
			})
		);
	const items = async () => (await listItems(db, OWNER_ID)).length;

	beforeEach(async () => {
		await seedHousehold(db, { production: false, now: new Date('2026-10-31T12:00:00Z') });
	});

	it('refuses a session that has not just confirmed it is the owner, and deletes nothing', async () => {
		const me = await signedIn();
		const before = await items();
		const refused = (await erase(me, 'DELETE')) as Refused;
		expect(refused.status).toBe(403);
		expect(refused.data.erase).toBe(STEP_UP_MESSAGE);
		expect(await items()).toBe(before);
	});

	it('is not allowed by a recovery-code sign-in alone', async () => {
		const me = await signedIn();
		await stepUps.markRecoverySignIn(db, me.id);
		const refused = (await erase(me, 'DELETE')) as Refused;
		expect(refused.status).toBe(403);
		expect(await items()).toBeGreaterThan(0);
	});

	it('refuses anything but the word, even confirmed, and deletes nothing', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		const before = await items();
		for (const word of ['', 'DELET', 'yes', 'DELETE everything']) {
			const refused = (await erase(me, word)) as Refused;
			expect(refused.status, word).toBe(400);
			expect(refused.data).toMatchObject({ field: 'confirm' });
			expect(refused.data.erase).toContain('Nothing was deleted');
		}
		expect(await items()).toBe(before);
	});

	it('refuses when the session ends while the form is still arriving', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		let arrive!: () => void;
		const arrived = new Promise<void>((resolve) => (arrive = resolve));
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				await arrived;
				controller.enqueue(new TextEncoder().encode('confirm=DELETE'));
				controller.close();
			}
		});
		const event = {
			...testEvent({
				cookies: me.cookies,
				address: me.address,
				ownerId: OWNER_ID,
				path: '/settings/security'
			}),
			request: new Request('http://localhost/settings/security', {
				method: 'POST',
				body,
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				duplex: 'half'
			} as RequestInit)
		};
		const before = await items();

		const pending = run(securityActions.erase, event);
		// "Sign out everywhere" from another device, before the slow form has finished arriving.
		await deleteAllSessions(db, OWNER_ID);
		arrive();

		const refused = (await pending) as Refused;
		expect(refused.status).toBe(403);
		expect(await items()).toBe(before);
	});

	it('deletes the budget and goes to setup, still signed in, with the word in any case', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		expect(await thrown(erase(me, ' delete '))).toMatchObject({ status: 303, location: '/setup' });
		expect(await items()).toBe(0);
		expect((await getOwner(db, OWNER_ID)).setupStep).toBe('welcome');
		expect(me.cookies.get('flash')).toBe('data-erased');
		expect((await db.select().from(session)).map((s) => s.id)).toEqual([me.id]);
		expect((await db.select().from(owner))[0]!.passwordHash).not.toBeNull();
	});
});

describe('TSK-818581 TSK-F3FBD8 restoring and downloading a backup at the action level', () => {
	type Refused = { status: number; data: { restore: string; field?: string } };
	const NOW = new Date('2026-10-31T12:00:00Z');
	let text: string;
	const items = async () => (await listItems(db, OWNER_ID)).length;

	beforeEach(async () => {
		await seedHousehold(db, { production: false, now: NOW });
		text = backupText(await exportBackup(db, OWNER_ID, NOW));
	});

	const restoreEvent = (
		me: Awaited<ReturnType<typeof signedIn>>,
		{ confirm = 'DELETE', file = text as string | null } = {}
	) => {
		const body = new FormData();
		body.set('confirm', confirm);
		if (file !== null)
			body.set('file', new File([file], 'backup.json', { type: 'application/json' }));
		return {
			...testEvent({
				cookies: me.cookies,
				address: me.address,
				ownerId: OWNER_ID,
				path: '/settings/backup'
			}),
			request: new Request('http://localhost/settings/backup', { method: 'POST', body })
		};
	};
	const restore = (
		me: Awaited<ReturnType<typeof signedIn>>,
		options?: Parameters<typeof restoreEvent>[1]
	) => run(backupActions.restore, restoreEvent(me, options));

	it('refuses a session that has not just confirmed it is the owner, and changes nothing', async () => {
		const me = await signedIn();
		await eraseBudget(db, OWNER_ID);
		const refused = (await restore(me)) as Refused;
		expect(refused.status).toBe(403);
		expect(refused.data.restore).toBe(STEP_UP_MESSAGE);
		expect(await items()).toBe(0);
	});

	it('is not allowed by a recovery-code sign-in alone', async () => {
		const me = await signedIn();
		await stepUps.markRecoverySignIn(db, me.id);
		await eraseBudget(db, OWNER_ID);
		expect(((await restore(me)) as Refused).status).toBe(403);
		expect(await items()).toBe(0);
	});

	it('refuses when the session ends while the file is still arriving', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		await eraseBudget(db, OWNER_ID);
		const event = restoreEvent(me);
		const form = await event.request.formData();
		// "Sign out everywhere" from another device, before the slow upload has finished arriving.
		const slow = {
			...event,
			request: {
				formData: async () => {
					await deleteAllSessions(db, OWNER_ID);
					return form;
				}
			}
		};
		const refused = (await run(backupActions.restore, slow as never)) as Refused;
		expect(refused.status).toBe(403);
		expect(await items()).toBe(0);
	});

	it('refuses the wrong word, a missing file, a body that did not arrive and a bad file, changing nothing', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		const before = backupText(await exportBackup(db, OWNER_ID, NOW));
		const same = async () => expect(backupText(await exportBackup(db, OWNER_ID, NOW))).toBe(before);

		const word = (await restore(me, { confirm: 'yes' })) as Refused;
		expect([word.status, word.data.field]).toEqual([400, 'confirm']);
		const none = (await restore(me, { file: null })) as Refused;
		expect([none.status, none.data.field]).toEqual([400, 'file']);
		const bad = (await restore(me, { file: 'not a backup' })) as Refused;
		expect(bad.status).toBe(400);
		expect(bad.data.restore).toContain('not a Payday backup');
		// adapter-node throws a 413 from formData() past its BODY_SIZE_LIMIT.
		const big = (await run(backupActions.restore, {
			...restoreEvent(me),
			request: {
				formData: async () => {
					throw Object.assign(new Error('Payload Too Large'), { status: 413 });
				}
			}
		} as never)) as Refused;
		expect(big.status).toBe(400);
		expect(big.data.restore).toContain('too big');
		await same();
	});

	it('replaces the budget with the file when confirmed, still signed in', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		await eraseBudget(db, OWNER_ID);
		expect(await thrown(restore(me))).toMatchObject({ status: 303, location: '/' });
		expect(await items()).toBeGreaterThan(0);
		expect(me.cookies.get('flash')).toBe('backup-restored');
		expect((await db.select().from(session)).map((x) => x.id)).toEqual([me.id]);
	});

	const download = (
		me: Awaited<ReturnType<typeof signedIn>>,
		headers: Record<string, string> = {}
	) => {
		const url = new URL('http://localhost/settings/backup/download');
		return downloadBackup({
			locals: { ownerId: OWNER_ID },
			cookies: me.cookies,
			url,
			request: new Request(url, { headers })
		} as never);
	};

	it('sends nothing, and records no download, without a fresh confirmation', async () => {
		const me = await signedIn();
		expect(await thrown(Promise.resolve().then(() => download(me)))).toMatchObject({
			status: 303,
			location: '/settings/backup'
		});
		await stepUps.markRecoverySignIn(db, me.id);
		expect(await thrown(Promise.resolve().then(() => download(me)))).toMatchObject({
			status: 303,
			location: '/settings/backup'
		});
		expect(await lastBackupAt(db, OWNER_ID)).toBeNull();
	});

	it('refuses a request from another site, or another site of the same host, and records nothing', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		for (const site of ['cross-site', 'same-site']) {
			const response = (await download(me, { 'sec-fetch-site': site })) as Response;
			expect(response.status, site).toBe(403);
		}
		expect(await lastBackupAt(db, OWNER_ID)).toBeNull();
	});

	it('sends the file to a confirmed owner who asked themselves, and records the moment', async () => {
		const me = await signedIn();
		await stepUps.markAssertion(db, me.id);
		for (const headers of [
			{} as Record<string, string>,
			{ 'sec-fetch-site': 'same-origin' },
			{ 'sec-fetch-site': 'none' }
		]) {
			const response = (await download(me, headers)) as Response;
			expect(response.status).toBe(200);
			expect(response.headers.get('cache-control')).toBe('private, no-store');
			expect(response.headers.get('content-disposition')).toMatch(
				/^attachment; filename="payday-backup-/
			);
			expect(JSON.parse(await response.text()).format).toBe('payday-backup');
		}
		expect(await lastBackupAt(db, OWNER_ID)).not.toBeNull();
	});
});

describe('TSK-5569A1 a full database-backed hash queue turns away password checks only', () => {
	it('refuses a password sign-in and a confirm as busy when all 18 places are taken', async () => {
		const queue = createGlobalSlots('hash-queue', MAX_CONCURRENT + MAX_WAITING);
		for (let i = 0; i < MAX_CONCURRENT + MAX_WAITING; i++) await queue.acquire(db, 'x');
		const busy = new PasswordBusyError().message;
		const address = nextIp();

		const signIn = (await run(
			signinActions.password,
			testEvent({ fields: { password: OLD }, address })
		)) as Failed;
		expect(signIn).toMatchObject({ status: 503 });
		expect(signIn.data.message).toBe(busy);

		const me = await signedIn();
		const confirm = (await run(
			securityActions.confirm,
			testEvent({ fields: { password: OLD }, cookies: me.cookies, address, ownerId: OWNER_ID })
		)) as Failed;
		expect(confirm).toMatchObject({ status: 503 });
		expect(confirm.data.message).toBe(busy);
	});

	it('still signs in with a recovery code in that same state: it is never hashed with scrypt', async () => {
		const queue = createGlobalSlots('hash-queue', MAX_CONCURRENT + MAX_WAITING);
		for (let i = 0; i < MAX_CONCURRENT + MAX_WAITING; i++) await queue.acquire(db, 'x');
		const [code] = await insertRecoveryCodes(db, OWNER_ID);
		const { cookies, jar } = cookieJar();
		const result = await thrown(
			run(signinActions.recovery, testEvent({ fields: { code }, cookies, address: nextIp() }))
		);
		expect(result).toMatchObject({ status: 303 });
		expect(jar.get('session')).toBeTruthy();
	});
});
