import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { open, type Db } from '#lib/server/db/open.ts';
import { owner, passkey, session } from '#lib/server/db/schema.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';
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
import { actions as securityActions } from '../../../routes/settings/security/+page.server.ts';
import { actions as signinActions } from '../../../routes/signin/+page.server.ts';
import { failureBrake } from './failureBrake.ts';
import { hashPassword, passwordGate, setPasswordHash } from './password.ts';
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
	db = open(':memory:');
	state.db = db;
	db.insert(owner).values({ id: OWNER_ID }).run();
	setPasswordHash(db, OWNER_ID, await hashPassword(OLD, FAST));
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
function signedIn() {
	const { token } = createSession(db, OWNER_ID, 'test');
	const { cookies } = cookieJar({ session: token });
	return { id: sha256Hex(token), cookies, address: nextIp() };
}

const passwordForm = (
	me: ReturnType<typeof signedIn>,
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
		setPasswordHash(db, OWNER_ID, newHash);
		db.delete(session).run();
		const before = failureBrake.count();
		await held.release();

		const result = (await attempt) as Failed;
		expect(result.status).toBe(400);
		expect(result.data.message).toBe(PASSWORD_CHANGED);
		expect(jar.size).toBe(0);
		expect(db.select().from(session).all()).toHaveLength(0);
		expect(failureBrake.count()).toBe(before + 1); // a failed attempt, as asked
	});

	it('slows guessing: a wrong password is a brake failure, a right one is not, and the brake waits', async () => {
		const address = nextIp();
		const before = failureBrake.count();
		await run(
			signinActions.password,
			testEvent({ fields: { password: 'wrong wrong wrong' }, address })
		);
		expect(failureBrake.count()).toBe(before + 1);
		await thrown(run(signinActions.password, testEvent({ fields: { password: OLD }, address })));
		expect(failureBrake.count()).toBe(before + 1);

		for (let i = 0; i < 8; i++) failureBrake.recordFailure();
		expect(failureBrake.delayMs()).toBeGreaterThanOrEqual(300);
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
		const me = signedIn();
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
		setPasswordHash(db, OWNER_ID, newHash);
		await held.release();
		const result = (await confirming) as Failed;
		expect(result).toMatchObject({ status: 400 });
		expect(result.data.message).toBe(PASSWORD_CHANGED);
		expect(stepUps.hasAssertion(me.id)).toBe(false);
	});
});

describe('TSK-2F1582 recovery sign-in keeps its next page through setting the password', () => {
	it('goes recovery, then set password, then back to the page asked for, and shuts the window', async () => {
		const [code] = insertRecoveryCodes(db, OWNER_ID);
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
		expect(stepUps.hasRecoveryWindow(id)).toBe(true);

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
		expect(stepUps.hasRecoveryWindow(id)).toBe(false);
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
		const stored = db.select().from(owner).get()!.passwordHash!;
		expect(stored).toContain('N=32768');
	});
});

describe('TSK-2F1582 changing the password at the action level', () => {
	it('refuses a session with no step-up and no current password, and changes nothing', async () => {
		const me = signedIn();
		const before = db.select().from(owner).get()!.passwordHash;
		const result = (await run(
			passwordActions.change,
			passwordForm(me, { current: '', password: NEW, again: NEW })
		)) as Failed;
		expect(result.status).toBe(403);
		expect(result.data.message).toContain('current password');
		expect(db.select().from(owner).get()!.passwordHash).toBe(before);
	});

	it('refuses a wrong current password even from a confirmed session, and charges it', async () => {
		const me = signedIn();
		stepUps.markAssertion(me.id);
		const before = failureBrake.count();
		const result = (await run(
			passwordActions.change,
			passwordForm(me, { current: 'not the old one', password: NEW, again: NEW })
		)) as Failed;
		expect(result.status).toBe(400);
		expect(failureBrake.count()).toBe(before + 1);
	});

	it('changes it with the current password, ends the other sessions, keeps this one', async () => {
		const me = signedIn();
		const other = signedIn();
		const change = passwordForm(me, { current: OLD, password: NEW, again: NEW, next: '/loans' });
		expect(await thrown(run(passwordActions.change, change))).toMatchObject({
			status: 303,
			location: '/loans'
		});
		expect(
			db
				.select()
				.from(session)
				.all()
				.map((s) => s.id)
		).toEqual([me.id]);
		expect(stepUps.hasAssertion(other.id)).toBe(false);
		expect(stepUps.hasAssertion(me.id)).toBe(true);
	});
});

describe('TSK-2F1582 an owner with no password keeps their last passkey', () => {
	it('refuses the removal with a plain message, then allows it once a password is set', async () => {
		db.update(owner).set({ passwordHash: null }).run();
		addPasskey(db, OWNER_ID, {
			id: 'cred-1',
			publicKey: new Uint8Array([1, 2, 3]),
			counter: 0,
			transports: ['internal'],
			nickname: 'Phone'
		});
		const me = signedIn();
		stepUps.markAssertion(me.id);
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
		expect(db.select().from(passkey).all()).toHaveLength(1);

		setPasswordHash(db, OWNER_ID, await hashPassword(OLD, FAST));
		expect(await run(securityActions.remove, event())).toEqual({ done: 'remove' });
		expect(db.select().from(passkey).all()).toHaveLength(0);
	});
});

describe('starting over at the action level', () => {
	type Refused = { status: number; data: { erase: string; field?: string } };
	const erase = (me: ReturnType<typeof signedIn>, confirm: string) =>
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
	const items = () => listItems(db, OWNER_ID).length;

	beforeEach(() => {
		seedHousehold(db, { production: false, now: new Date('2026-10-31T12:00:00Z') });
	});

	it('refuses a session that has not just confirmed it is the owner, and deletes nothing', async () => {
		const me = signedIn();
		const before = items();
		const refused = (await erase(me, 'DELETE')) as Refused;
		expect(refused.status).toBe(403);
		expect(refused.data.erase).toBe(STEP_UP_MESSAGE);
		expect(items()).toBe(before);
	});

	it('is not allowed by a recovery-code sign-in alone', async () => {
		const me = signedIn();
		stepUps.markRecoverySignIn(me.id);
		const refused = (await erase(me, 'DELETE')) as Refused;
		expect(refused.status).toBe(403);
		expect(items()).toBeGreaterThan(0);
	});

	it('refuses anything but the word, even confirmed, and deletes nothing', async () => {
		const me = signedIn();
		stepUps.markAssertion(me.id);
		const before = items();
		for (const word of ['', 'DELET', 'yes', 'DELETE everything']) {
			const refused = (await erase(me, word)) as Refused;
			expect(refused.status, word).toBe(400);
			expect(refused.data).toMatchObject({ field: 'confirm' });
			expect(refused.data.erase).toContain('Nothing was deleted');
		}
		expect(items()).toBe(before);
	});

	it('refuses when the session ends while the form is still arriving', async () => {
		const me = signedIn();
		stepUps.markAssertion(me.id);
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
		const before = items();

		const pending = run(securityActions.erase, event);
		// "Sign out everywhere" from another device, before the slow form has finished arriving.
		deleteAllSessions(db, OWNER_ID);
		arrive();

		const refused = (await pending) as Refused;
		expect(refused.status).toBe(403);
		expect(items()).toBe(before);
	});

	it('deletes the budget and goes to setup, still signed in, with the word in any case', async () => {
		const me = signedIn();
		stepUps.markAssertion(me.id);
		expect(await thrown(erase(me, ' delete '))).toMatchObject({ status: 303, location: '/setup' });
		expect(items()).toBe(0);
		expect(getOwner(db, OWNER_ID).setupStep).toBe('welcome');
		expect(me.cookies.get('flash')).toBe('data-erased');
		expect(
			db
				.select()
				.from(session)
				.all()
				.map((s) => s.id)
		).toEqual([me.id]);
		expect(db.select().from(owner).get()!.passwordHash).not.toBeNull();
	});
});
