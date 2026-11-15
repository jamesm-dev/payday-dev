import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, passkey, session } from '#lib/server/db/schema.ts';
import { hashPassword, setPasswordHash } from '#lib/server/auth/password.ts';
import { getOwnerEmail } from '#lib/server/auth/ownerEmail.ts';
import { createSession } from '#lib/server/auth/session.ts';
import { stepUps } from '#lib/server/auth/stepUp.ts';
import { cookieJar, testEvent } from '#lib/server/auth/testEvent.ts';
import { sha256Hex } from '#lib/server/auth/tokens.ts';

const state = vi.hoisted(() => ({ db: null as unknown, google: null as unknown }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));
vi.mock('#lib/server/auth/google/config.ts', () => ({ googleConfig: () => state.google }));

const { actions, load } = await import('./+page.server.ts');

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const PASSWORD = 'the first owner passphrase';

let db: Db;
let ownerId: number;
let ip = 0;
const nextIp = () => `198.51.100.${++ip}`;

beforeEach(async () => {
	state.google = null;
	db = await freshDb();
	state.db = db;
	[{ id: ownerId }] = await db.insert(owner).values({}).returning({ id: owner.id });
	await setPasswordHash(db, ownerId, await hashPassword(PASSWORD, FAST));
	await db.insert(owner).values({ email: 'bo@example.com' });
});

/** A signed-in browser for the owner; `confirmed` marks a fresh confirmation on its session. */
async function browser(confirmed = false) {
	const { token } = await createSession(db, ownerId, 'test');
	const id = sha256Hex(token);
	if (confirmed) await stepUps.markAssertion(db, id);
	return { id, cookies: cookieJar({ session: token }).cookies, address: nextIp() };
}

type Me = Awaited<ReturnType<typeof browser>>;
type Failed = { status: number; data: Record<string, string> };
const act = (
	name: 'setEmail' | 'confirm' | 'signoutOthers' | 'disconnectGoogle' | 'remove',
	me: Me,
	fields: Record<string, string> = {}
) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions[name] as any)(
		testEvent({
			fields,
			cookies: me.cookies,
			address: me.address,
			ownerId,
			path: '/settings/security'
		})
	);

describe('TSK-5ff868 TSK-55c7a4 adding an email in Settings and Security', () => {
	it('shows no email until one is added, and then shows it', async () => {
		const me = await browser();
		const event = {
			locals: { ownerId },
			cookies: me.cookies,
			url: new URL('http://localhost/settings/security'),
			setHeaders: () => {}
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(((await load(event as any)) as { email: string | null }).email).toBeNull();
		await act('setEmail', me, { email: 'First@Example.com', password: PASSWORD });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(((await load(event as any)) as { email: string | null }).email).toBe(
			'first@example.com'
		);
	});

	it('needs the password when there is no fresh confirmation, and a wrong one saves nothing', async () => {
		const me = await browser();
		const none = (await act('setEmail', me, { email: 'first@example.com' })) as Failed;
		expect(none.status).toBe(403);
		const wrong = (await act('setEmail', me, {
			email: 'first@example.com',
			password: 'wrong wrong wrong'
		})) as Failed;
		expect(wrong.status).toBe(400);
		expect(wrong.data.emailMessage).toBe('That password is not right.');
		expect(await getOwnerEmail(db, ownerId)).toBeNull();
		const right = await act('setEmail', me, { email: 'first@example.com', password: PASSWORD });
		expect(right).toMatchObject({ done: 'email' });
		expect(await getOwnerEmail(db, ownerId)).toBe('first@example.com');
	});

	it('needs no password after a fresh confirmation', async () => {
		const me = await browser(true);
		expect(await act('setEmail', me, { email: 'first@example.com' })).toMatchObject({
			done: 'email'
		});
		expect(await getOwnerEmail(db, ownerId)).toBe('first@example.com');
	});

	it("refuses another account's email in plain words, and a bad one before any password guess", async () => {
		const me = await browser(true);
		const taken = (await act('setEmail', me, { email: 'BO@example.com' })) as Failed;
		expect(taken.status).toBe(400);
		expect(taken.data.emailMessage).toContain('already used by another account');
		const bad = (await act('setEmail', await browser(), {
			email: 'nope',
			password: 'whatever'
		})) as Failed;
		expect(bad.status).toBe(400);
		expect(bad.data.emailMessage).toContain('@');
		expect(await getOwnerEmail(db, ownerId)).toBeNull();
	});

	it('TSK-8fcc17 a confirmation for one person is not turned away by another on the same address', async () => {
		const shared = nextIp();
		const me = { ...(await browser()), address: shared };
		for (let i = 0; i < 2; i++) {
			// Someone else on the shared address, failing against their own account.
			const stranger = await browser();
			await act('confirm', { ...stranger, address: shared }, { password: 'nope nope nope' });
		}
		expect(await act('confirm', me, { password: PASSWORD })).toMatchObject({ done: 'confirm' });
	});
});

describe('TSK-5ff868 TSK-be6817 changing the email is limited, so "taken" cannot list accounts', () => {
	it('charges every try to the ACCOUNT, taken ones too, and changing address does not get around it', async () => {
		const me = await browser(true);
		for (let i = 0; i < 3; i++) {
			// A new address each time: the attacker's own, however many they have.
			const taken = (await act(
				'setEmail',
				{ ...me, address: nextIp() },
				{
					email: 'BO@example.com'
				}
			)) as Failed;
			expect(taken.status).toBe(400);
			expect(taken.data.emailMessage).toContain('already used by another account');
		}
		// A fourth, from yet another address, with a free email: refused in plain words, nothing saved.
		const fourth = (await act(
			'setEmail',
			{ ...me, address: nextIp() },
			{
				email: 'free@example.com'
			}
		)) as Failed;
		expect(fourth.status).toBe(429);
		expect(fourth.data.emailMessage).toContain('too many times');
		expect(await getOwnerEmail(db, ownerId)).toBeNull();
	});

	it('does not block other people on a shared address because one person used their tries', async () => {
		const shared = nextIp();
		const me = { ...(await browser(true)), address: shared };
		for (let i = 0; i < 3; i++) await act('setEmail', me, { email: 'BO@example.com' });
		expect(((await act('setEmail', me, { email: 'x@example.com' })) as Failed).status).toBe(429);
		// Someone else, from the same address, is not turned away.
		const [{ id: otherId }] = await db
			.insert(owner)
			.values({ email: 'other@example.com' })
			.returning({ id: owner.id });
		const { token } = await createSession(db, otherId, 'test');
		await stepUps.markAssertion(db, sha256Hex(token));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await (actions.setEmail as any)(
			testEvent({
				fields: { email: 'other.new@example.com' },
				cookies: cookieJar({ session: token }).cookies,
				address: shared,
				ownerId: otherId,
				path: '/settings/security'
			})
		);
		expect(result).toMatchObject({ done: 'email' });
	});

	it('does not charge a try that is not an address at all', async () => {
		const me = await browser(true);
		for (let i = 0; i < 5; i++) await act('setEmail', me, { email: 'nope' });
		expect(await act('setEmail', me, { email: 'free@example.com' })).toMatchObject({
			done: 'email'
		});
	});
});

describe('TSK-5ff868 signing out every other device', () => {
	it('ends the other sessions and keeps this one', async () => {
		const me = await browser();
		await browser();
		await browser();
		expect(await db.select().from(session)).toHaveLength(3);
		expect(await act('signoutOthers', me)).toMatchObject({ done: 'signoutOthers', ended: 2 });
		const left = await db.select().from(session);
		expect(left.map((s) => s.id)).toEqual([me.id]);
	});
});

const GOOGLE_ON = {
	clientId: 'client-id',
	clientSecret: 'client-secret',
	authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	issuers: ['https://accounts.google.com']
};

const loadFor = async (me: Me) =>
	(await load({
		locals: { ownerId },
		cookies: me.cookies,
		url: new URL('http://localhost/settings/security'),
		setHeaders: () => {}
	} as never)) as {
		google: { connected: boolean; canConnect: boolean } | null;
		passkeys: unknown[];
	};

describe('TSK-6f0e5d Settings and Security, the Google section', () => {
	it('is not there while Google is off, and disconnecting refuses', async () => {
		const me = await browser(true);
		expect((await loadFor(me)).google).toBeNull();
		await db.update(owner).set({ googleSub: 'sub-1' }).where(eq(owner.id, ownerId));
		expect((await act('disconnectGoogle', me)) as Failed).toMatchObject({ status: 404 });
		const [row] = await db.select().from(owner).where(eq(owner.id, ownerId));
		expect(row?.googleSub).toBe('sub-1');
	});

	it('when on, offers Connect only after a fresh confirmation, and never shows the account number', async () => {
		state.google = GOOGLE_ON;
		expect((await loadFor(await browser())).google).toEqual({
			connected: false,
			canConnect: false
		});
		expect((await loadFor(await browser(true))).google).toEqual({
			connected: false,
			canConnect: true
		});
		await db.update(owner).set({ googleSub: 'sub-secret-1' }).where(eq(owner.id, ownerId));
		const loaded = await loadFor(await browser(true));
		expect(loaded.google).toEqual({ connected: true, canConnect: true });
		expect(JSON.stringify(loaded)).not.toContain('sub-secret-1');
	});

	it('disconnect needs a confirmation', async () => {
		state.google = GOOGLE_ON;
		await db.update(owner).set({ googleSub: 'sub-1' }).where(eq(owner.id, ownerId));
		const result = (await act('disconnectGoogle', await browser())) as Failed;
		expect(result.status).toBe(403);
		expect(result.data.googleMessage).toBe('Confirm it is you first, then try again.');
		const [row] = await db.select().from(owner).where(eq(owner.id, ownerId));
		expect(row?.googleSub).toBe('sub-1');
	});

	it('disconnect works with a password, and refuses the last way in in plain words', async () => {
		state.google = GOOGLE_ON;
		await db.update(owner).set({ googleSub: 'sub-1' }).where(eq(owner.id, ownerId));
		expect(await act('disconnectGoogle', await browser(true))).toMatchObject({
			done: 'disconnectGoogle'
		});
		const [row] = await db.select().from(owner).where(eq(owner.id, ownerId));
		expect(row?.googleSub).toBeNull();
		expect(((await act('disconnectGoogle', await browser(true))) as Failed).status).toBe(400);

		// Google only: no password, no device. It stays connected.
		await db
			.update(owner)
			.set({ googleSub: 'sub-1', passwordHash: null })
			.where(eq(owner.id, ownerId));
		const last = (await act('disconnectGoogle', await browser(true))) as Failed;
		expect(last.status).toBe(409);
		expect(last.data.googleMessage).toBe(
			'Add a password or a device first, so you can still sign in.'
		);
		const [still] = await db.select().from(owner).where(eq(owner.id, ownerId));
		expect(still?.googleSub).toBe('sub-1');
	});

	it('disconnect ends every other session of the account and keeps this one', async () => {
		state.google = GOOGLE_ON;
		await db.update(owner).set({ googleSub: 'sub-1' }).where(eq(owner.id, ownerId));
		const mine = await browser(true);
		const elsewhere = await browser();
		const result = await act('disconnectGoogle', mine);
		expect(result).toMatchObject({ done: 'disconnectGoogle', signedOutElsewhere: true });
		const left = (await db.select({ id: session.id }).from(session)).map((r) => r.id);
		expect(left).toContain(mine.id);
		expect(left).not.toContain(elsewhere.id);
	});

	it('shows the time a confirmation really has left, shorter after Google', async () => {
		state.google = GOOGLE_ON;
		const left = async (me: Me) =>
			((await loadFor(me)) as unknown as { confirmedMsLeft: number }).confirmedMsLeft;
		expect(await left(await browser())).toBe(0);
		expect(await left(await browser(true))).toBeGreaterThan(4 * 60_000);
		const viaGoogle = await browser();
		await stepUps.markGoogleConfirmation(db, viaGoogle.id);
		const googleLeft = await left(viaGoogle);
		expect(googleLeft).toBeGreaterThan(0);
		expect(googleLeft).toBeLessThanOrEqual(2 * 60_000);
	});

	it('counts Google as a way in for removing the last device only while it is on', async () => {
		await db
			.update(owner)
			.set({ googleSub: 'sub-1', passwordHash: null })
			.where(eq(owner.id, ownerId));
		await db.insert(passkey).values({
			id: 'cred-1',
			ownerId,
			publicKey: new Uint8Array([1]),
			counter: 0,
			nickname: 'Phone'
		} as never);
		const me = await browser(true);
		// Off: the device is the only way in.
		expect(((await act('remove', me, { id: 'cred-1' })) as Failed).status).toBe(409);
		// On: Google is another way in, so the device may go.
		state.google = GOOGLE_ON;
		expect(await act('remove', me, { id: 'cred-1' })).toMatchObject({ done: 'remove' });
	});
});
