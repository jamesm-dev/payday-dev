import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { hashPassword, setPasswordHash } from '#lib/server/auth/password.ts';
import { cookieJar, testEvent } from '#lib/server/auth/testEvent.ts';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));

const { actions } = await import('./+page.server.ts');

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const FIRST = 'the first owner passphrase';
const ANA = 'ana has a long passphrase';

let db: Db;
let ip = 0;
const nextIp = () => `198.51.100.${++ip}`;

beforeEach(async () => {
	db = await freshDb();
	state.db = db;
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

	it('TSK-be6817 a blank email signs in the one owner without an email', async () => {
		const { thrown, jar } = await signIn({ email: '', password: FIRST });
		expect(thrown).toMatchObject({ status: 303 });
		expect(jar.get('session')).toBeTruthy();
		// No email field at all (an old form, or no JavaScript and a cached page) is the same.
		expect((await signIn({ password: FIRST })).thrown).toMatchObject({ status: 303 });
	});

	it('a blank email no longer works once that owner has added an email', async () => {
		await db.update(owner).set({ email: 'first@example.com' }).where(eq(owner.id, 1));
		const blank = await signIn({ email: '', password: FIRST });
		expect((blank.result as Failed).status).toBe(400);
		expect(blank.jar.size).toBe(0);
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
		expect(words).toContain('That password is not right.');
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
		const first = await signIn({ email: '', password: FIRST }, shared);
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
