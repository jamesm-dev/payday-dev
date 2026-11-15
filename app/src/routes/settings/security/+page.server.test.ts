import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, session } from '#lib/server/db/schema.ts';
import { hashPassword, setPasswordHash } from '#lib/server/auth/password.ts';
import { getOwnerEmail } from '#lib/server/auth/ownerEmail.ts';
import { createSession } from '#lib/server/auth/session.ts';
import { stepUps } from '#lib/server/auth/stepUp.ts';
import { cookieJar, testEvent } from '#lib/server/auth/testEvent.ts';
import { sha256Hex } from '#lib/server/auth/tokens.ts';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));

const { actions, load } = await import('./+page.server.ts');

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const PASSWORD = 'the first owner passphrase';

let db: Db;
let ownerId: number;
let ip = 0;
const nextIp = () => `198.51.100.${++ip}`;

beforeEach(async () => {
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
	name: 'setEmail' | 'confirm' | 'signoutOthers',
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
