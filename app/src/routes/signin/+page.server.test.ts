import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { hashPassword, setPasswordHash } from '#lib/server/auth/password.ts';
import { cookieJar, testEvent } from '#lib/server/auth/testEvent.ts';

const state = vi.hoisted(() => ({ db: null as unknown, google: false }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({
	OWNER_SETUP_CODE: 'e2e-setup-code',
	// Google is on only while a test says so (ADR-0028).
	get GOOGLE_CLIENT_ID() {
		return state.google ? 'cid' : '';
	},
	get GOOGLE_CLIENT_SECRET() {
		return state.google ? 'secret' : '';
	},
	GOOGLE_TEST_PROVIDER: ''
}));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));

const { actions, load } = await import('./+page.server.ts');
const signUpPage = await import('./new/+page.server.ts');

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const FIRST = 'the first owner passphrase';
const ANA = 'ana has a long passphrase';

let db: Db;
let ip = 0;
const nextIp = () => `198.51.100.${++ip}`;

beforeEach(async () => {
	db = await freshDb();
	state.db = db;
	state.google = false;
	// The first owner, from before emails: no email. Then Ana, who signed up with one.
	const [first] = await db.insert(owner).values({}).returning({ id: owner.id });
	await setPasswordHash(db, first.id, await hashPassword(FIRST, FAST));
	const [ana] = await db
		.insert(owner)
		.values({ email: 'ana@example.com' })
		.returning({ id: owner.id });
	await setPasswordHash(db, ana.id, await hashPassword(ANA, FAST));
});

type Failed = { status: number; data: { message: string } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const signIn = async (fields: Record<string, string>, address = nextIp()): Promise<any> => {
	const { cookies, jar } = cookieJar();
	try {
		const result = await actions.password(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			testEvent({ fields, cookies, address }) as any
		);
		return { result, jar };
	} catch (error) {
		return { thrown: error as { status: number; location: string }, jar };
	}
};

describe('TSK-55c7a4 signing in with an email and a password', () => {
	it('signs a person in with their email (any case) and password', async () => {
		const { thrown, jar } = await signIn({
			email: ' Ana@Example.com ',
			password: ANA,
			next: '/plan'
		});
		expect(thrown).toMatchObject({ status: 303, location: '/plan' });
		expect(jar.get('session')).toBeTruthy();
	});

	it('TSK-be6817 TSK-37d755 a blank email is refused before anything is looked up, even for an owner without one', async () => {
		const { failureBrake } = await import('#lib/server/auth/failureBrake.ts');
		const before = await failureBrake.count(db);
		for (const fields of <Record<string, string>[]>[
			{ email: '', password: FIRST },
			{ email: '   ', password: FIRST },
			{ password: FIRST }
		]) {
			const blank = await signIn(fields);
			expect((blank.result as Failed).status).toBe(400);
			expect(blank.result.data).toMatchObject({ field: 'email', message: 'Enter your email.' });
			expect(blank.jar.size).toBe(0);
		}
		// Nothing was checked or counted: a blank field says nothing about any account.
		expect(await failureBrake.count(db)).toBe(before);
	});

	it('the owner without an email signs in once they have added one', async () => {
		await db.update(owner).set({ email: 'first@example.com' }).where(eq(owner.id, 1));
		const named = await signIn({ email: 'first@example.com', password: FIRST });
		expect(named.thrown).toMatchObject({ status: 303 });
	});

	it("refuses one person's email with another's password, and an unknown email, in the same words", async () => {
		const wrongPassword = await signIn({ email: 'ana@example.com', password: FIRST });
		const unknownEmail = await signIn({ email: 'nobody@example.com', password: ANA });
		const notAnEmail = await signIn({ email: 'not an email', password: ANA });
		for (const attempt of [wrongPassword, unknownEmail, notAnEmail]) {
			expect(attempt.result.status).toBe(400);
			expect(attempt.jar.size).toBe(0);
		}
		const words = wrongPassword.result.data.message as string;
		expect(unknownEmail.result.data.message).toBe(words);
		expect(notAnEmail.result.data.message).toBe(words);
		expect(words).toBe('That email or password is not right. Check both, then try again.');
	});

	it('does the same work for an unknown email as for a real one: both count a failure', async () => {
		const { failureBrake } = await import('#lib/server/auth/failureBrake.ts');
		const before = await failureBrake.count(db);
		await signIn({ email: 'ana@example.com', password: 'wrong wrong wrong' });
		await signIn({ email: 'nobody@example.com', password: 'wrong wrong wrong' });
		expect(await failureBrake.count(db)).toBe(before + 2);
	});

	it('TSK-8fcc17 one person typing wrong on a shared address does not stop another', async () => {
		const shared = nextIp();
		for (let i = 0; i < 3; i++) {
			await signIn({ email: 'ana@example.com', password: 'wrong wrong wrong' }, shared);
		}
		await db.update(owner).set({ email: 'first@example.com' }).where(eq(owner.id, 1));
		const first = await signIn({ email: 'first@example.com', password: FIRST }, shared);
		expect(first.thrown).toMatchObject({ status: 303 });
	});

	it('keeps next inside the app, and sends it back with a refusal', async () => {
		const bad = await signIn({ email: 'ana@example.com', password: ANA, next: '//evil.example' });
		expect(bad.thrown).toMatchObject({ status: 303, location: '/' });
		const refused = await signIn({
			email: 'ana@example.com',
			password: 'wrong wrong wrong',
			next: '/plan'
		});
		expect(refused.result.data).toMatchObject({ next: '/plan', email: 'ana@example.com' });
	});
});

const loadSignIn = (ownerId: number | null = null) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	load({ ...testEvent({ ownerId }), url: new URL('http://localhost/signin') } as any) as Promise<{
		google: { path: string } | null;
	}>;
const loadSignUp = (cookies = cookieJar().cookies, ownerId: number | null = null) =>
	signUpPage.load({
		...testEvent({ ownerId, cookies }),
		url: new URL('http://localhost/signin/new')
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<{
		open: boolean;
		google: { path: string } | null;
		codes: string[] | null;
	}>;

describe('5c19e2 the Google button is invisible while Google is off', () => {
	it('offers nothing on the sign-in and sign-up pages', async () => {
		expect((await loadSignIn()).google).toBeNull();
		expect((await loadSignUp()).google).toBeNull();
	});
});

describe('d24c97 the Google button, while Google is on', () => {
	it('shows on sign-in once there are accounts, and on sign-up while it is open', async () => {
		state.google = true;
		expect((await loadSignIn()).google).toEqual({ path: '/signin/google' });
		expect((await loadSignUp()).google).toEqual({ path: '/signin/google' });
	});

	it('is hidden on sign-in while nobody has an account', async () => {
		state.google = true;
		await db.delete(owner);
		expect((await loadSignIn()).google).toBeNull();
	});

	it('shows the new codes once on the sign-up page, and a reload moves on', async () => {
		const p = cookieJar();
		const [row] = await db
			.insert(owner)
			.values({ email: 'new@example.com' })
			.returning({ id: owner.id });
		const { startSession } = await import('#lib/server/auth/cookie.ts');
		const { newRecoveryCodes } = await import('#lib/server/auth/oneTimeSlot.ts');
		await startSession(db, testEvent({ cookies: p.cookies }), row.id, 'google');
		await newRecoveryCodes.put(db, p.jar.get('session')!, ['AAAA-BBBB-CCCC-DDDD']);
		const first = await loadSignUp(p.cookies, row.id);
		expect(first.codes).toEqual(['AAAA-BBBB-CCCC-DDDD']);
		await expect(loadSignUp(p.cookies, row.id)).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
	});
});
