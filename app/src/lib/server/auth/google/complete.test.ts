import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { takeFlash } from '#lib/server/flash.ts';
import { startSession } from '../cookie.ts';
import { newRecoveryCodes } from '../oneTimeSlot.ts';
import { createRateLimiter } from '../rateLimit.ts';
import { RECOVERY_CODE_COUNT } from '../recovery.ts';
import { stepUps } from '../stepUp.ts';
import { cookieJar, testEvent } from '../testEvent.ts';
import { sha256Hex } from '../tokens.ts';
import { EMAIL_EXISTS_MESSAGE } from './accounts.ts';
import { completeGoogleCallback, googleFor, type GoogleCallbackEvent } from './complete.ts';
import { resolveGoogleConfig } from './config.ts';
import { newFlowCookie, startFlow, type FlowPurpose } from './flow.ts';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$app/env/private', () => ({
	GOOGLE_CLIENT_ID: '',
	GOOGLE_CLIENT_SECRET: '',
	GOOGLE_TEST_PROVIDER: ''
}));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));

const config = resolveGoogleConfig({ clientId: 'cid', clientSecret: 'secret' }, false)!;
const REDIRECT = 'http://localhost/signin/google/callback';
const NOW = new Date();

let db: Db;
let n = 0;
const address = () => `198.51.100.${++n}`;

beforeEach(async () => {
	db = await freshDb();
	state.db = db;
});
afterEach(() => vi.restoreAllMocks());

const idToken = (claims: Record<string, unknown>) => {
	const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
	return `${part({ alg: 'RS256' })}.${part({
		iss: 'https://accounts.google.com',
		aud: 'cid',
		azp: 'cid',
		exp: NOW.getTime() / 1000 + 600,
		iat: NOW.getTime() / 1000 - 5,
		email_verified: true,
		...claims
	})}.sig`;
};
const exchanges = (token: string | (() => never)): typeof fetch =>
	(async () => {
		if (typeof token === 'function') token();
		return new Response(JSON.stringify({ id_token: token }), { status: 200 });
	}) as typeof fetch;

type Person = { cookies: ReturnType<typeof cookieJar>['cookies']; jar: Map<string, string> };
const browser = (): Person => cookieJar();

/** A person who is signed in (a session in `jar`), with a fresh confirmation unless told otherwise. */
async function signedIn(values: { email: string; googleSub?: string }, confirmed = true) {
	const [row] = await db.insert(owner).values(values).returning({ id: owner.id });
	const person = browser();
	await startSession(db, testEvent({ cookies: person.cookies }), row.id, 'password');
	const sessionId = sha256Hex(person.jar.get('session')!);
	if (!confirmed) await stepUps.forget(db, sessionId);
	return { ...person, ownerId: row.id, sessionId };
}

/** Starts a flow as the start endpoint does and returns the state and nonce Google would echo. */
async function begin(
	person: Person,
	purpose: FlowPurpose,
	extra: { next?: string | null; sessionId?: string } = {}
) {
	const nonce = `nonce-${++n}`;
	let binding: string;
	if (purpose === 'google-sign-in') {
		const cookie = newFlowCookie();
		person.jar.set('google-flow', cookie.value);
		binding = cookie.binding;
	} else binding = extra.sessionId!;
	const { state: s } = await startFlow(
		db,
		purpose,
		binding,
		{ codeVerifier: 'verifier', nonce, redirectUri: REDIRECT, next: extra.next ?? null },
		NOW
	);
	return { state: s, nonce };
}

const callback = (
	person: Person,
	query: string,
	ownerId: number | null = null,
	ip = address()
): GoogleCallbackEvent => {
	const url = new URL(`http://localhost/signin/google/callback?${query}`);
	return {
		cookies: person.cookies,
		url,
		request: new Request(url, { headers: { 'user-agent': 'vitest' } }),
		getClientAddress: () => ip,
		locals: { ownerId }
	};
};

const finish = (
	person: Person,
	query: string,
	token: string | (() => never),
	ownerId: number | null = null,
	ip = address()
) =>
	completeGoogleCallback(db, callback(person, query, ownerId, ip), config, {
		fetchFn: exchanges(token),
		now: NOW
	});

describe('d24c97 signing in with Google', () => {
	it('signs a known person in and goes to a safe next', async () => {
		await db.insert(owner).values({ email: 'ana@example.com', googleSub: 'sub-ana' });
		const p = browser();
		const f = await begin(p, 'google-sign-in', { next: '/plan' });
		const location = await finish(
			p,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-ana', email: 'ana@example.com' })
		);
		expect(location).toBe('/plan');
		expect(p.jar.get('session')).toBeTruthy();
		expect(p.jar.has('google-flow')).toBe(false);
		expect(takeFlash(p.cookies)).toBeNull();
	});

	it('never follows an unsafe next', async () => {
		await db.insert(owner).values({ email: 'ana@example.com', googleSub: 'sub-ana' });
		const p = browser();
		const f = await begin(p, 'google-sign-in', { next: '//evil.example' });
		const location = await finish(
			p,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-ana', email: 'ana@example.com' })
		);
		expect(location).toBe('/');
	});

	it('makes a newcomer an account, opens a session and leaves the codes in a one-time slot', async () => {
		// Sign-up is open once someone has an account.
		await db.insert(owner).values({ email: 'first@example.com' });
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		const location = await finish(
			p,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-new', email: 'New@Example.com' })
		);
		expect(location).toBe('/signin/new');
		const token = p.jar.get('session')!;
		const [row] = await db.select().from(owner).where(eq(owner.googleSub, 'sub-new'));
		expect(row.email).toBe('new@example.com');
		expect(row.passwordHash).toBeNull();
		const codes = await newRecoveryCodes.take(db, token);
		expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
		// Shown once: a second look finds nothing.
		expect(await newRecoveryCodes.take(db, token)).toBeUndefined();
	});
});

describe('81af3b a refused callback says so and signs nobody in', () => {
	it('refuses an email that already has an account, with the way forward', async () => {
		await db.insert(owner).values({ email: 'ana@example.com' });
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		const location = await finish(
			p,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-x', email: 'ana@example.com' })
		);
		expect(location).toBe('/signin');
		expect(takeFlash(p.cookies)).toBe(EMAIL_EXISTS_MESSAGE);
		expect(p.jar.has('session')).toBe(false);
	});

	it('refuses a replay', async () => {
		await db.insert(owner).values({ email: 'ana@example.com', googleSub: 'sub-ana' });
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		const token = idToken({ nonce: f.nonce, sub: 'sub-ana', email: 'ana@example.com' });
		const cookieValue = p.jar.get('google-flow')!;
		await finish(p, `state=${f.state}&code=c1`, token);
		const again = browser();
		again.jar.set('google-flow', cookieValue);
		expect(await finish(again, `state=${f.state}&code=c1`, token)).toBe('/signin');
		expect(takeFlash(again.cookies)).toContain('took too long or was already used');
		expect(again.jar.has('session')).toBe(false);
	});

	it('refuses another browser, and the try uses the flow up', async () => {
		await db.insert(owner).values({ email: 'ana@example.com', googleSub: 'sub-ana' });
		const mine = browser();
		const f = await begin(mine, 'google-sign-in');
		const token = idToken({ nonce: f.nonce, sub: 'sub-ana', email: 'ana@example.com' });
		const cookieValue = mine.jar.get('google-flow')!;
		const other = browser();
		other.jar.set('google-flow', 'someone-elses-cookie');
		expect(await finish(other, `state=${f.state}&code=c1`, token)).toBe('/signin');
		expect(other.jar.has('session')).toBe(false);
		mine.jar.set('google-flow', cookieValue);
		expect(await finish(mine, `state=${f.state}&code=c1`, token)).toBe('/signin');
		expect(mine.jar.has('session')).toBe(false);
	});

	it('refuses a missing flow, a missing cookie and an expired flow', async () => {
		const p = browser();
		expect(await finish(p, 'state=nope&code=c1', 'x')).toBe('/signin');
		expect(takeFlash(p.cookies)).toContain('took too long');
		const f = await begin(p, 'google-sign-in');
		p.jar.delete('google-flow');
		expect(await finish(p, `state=${f.state}&code=c1`, 'x')).toBe('/signin');
		const late = browser();
		const g = await begin(late, 'google-sign-in');
		const location = await completeGoogleCallback(
			db,
			callback(late, `state=${g.state}&code=c1`),
			config,
			{ fetchFn: exchanges('x'), now: new Date(NOW.getTime() + 11 * 60 * 1000) }
		);
		expect(location).toBe('/signin');
		expect(late.jar.has('session')).toBe(false);
	});

	it("refuses Google's own error, and says a cancel is a cancel", async () => {
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		expect(await finish(p, `state=${f.state}&error=access_denied`, 'x')).toBe('/signin');
		expect(takeFlash(p.cookies)).toBe('Google sign-in was cancelled.');
		const q = browser();
		const g = await begin(q, 'google-sign-in');
		expect(await finish(q, `state=${g.state}&error=server_error`, 'x')).toBe('/signin');
		expect(takeFlash(q.cookies)).toContain('did not work');
	});

	it('refuses a token that does not check out, and logs a fixed reason only', async () => {
		const out = vi.spyOn(console, 'log').mockImplementation(() => {});
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		const location = await finish(
			p,
			`state=${f.state}&code=secret-code-123`,
			idToken({ nonce: 'wrong', sub: 'sub-leak', email: 'leak@example.com' })
		);
		expect(location).toBe('/signin');
		expect(p.jar.has('session')).toBe(false);
		const written = [...out.mock.calls, ...err.mock.calls].flat().join(' ');
		expect(written).toContain('nonce mismatch');
		for (const secret of ['sub-leak', 'leak@example.com', 'secret-code-123', f.state]) {
			expect(written).not.toContain(secret);
		}
		expect(takeFlash(p.cookies) ?? '').not.toContain('leak');
	});

	it('refuses when the token endpoint fails, without leaking the error', async () => {
		const out = vi.spyOn(console, 'log').mockImplementation(() => {});
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		const location = await finish(p, `state=${f.state}&code=c1`, () => {
			throw new Error('boom');
		});
		expect(location).toBe('/signin');
		expect(takeFlash(p.cookies)).toContain('did not work');
		expect([...out.mock.calls, ...err.mock.calls].flat().join(' ')).not.toContain(f.state);
	});

	it('refuses a callback that did not arrive on the address it was sent from', async () => {
		await db.insert(owner).values({ email: 'ana@example.com', googleSub: 'sub-ana' });
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		const event = callback(p, `state=${f.state}&code=c1`);
		event.url = new URL(
			`https://elsewhere.example/signin/google/callback?state=${f.state}&code=c1`
		);
		const location = await completeGoogleCallback(db, event, config, {
			fetchFn: exchanges(idToken({ nonce: f.nonce, sub: 'sub-ana', email: 'ana@example.com' })),
			now: NOW
		});
		expect(location).toBe('/signin');
		expect(p.jar.has('session')).toBe(false);
	});

	it('says sign-up is not open while nobody has an account', async () => {
		const p = browser();
		const f = await begin(p, 'google-sign-in');
		const location = await finish(
			p,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-1', email: 'one@example.com' })
		);
		expect(location).toBe('/signin');
		expect(takeFlash(p.cookies)).toBe('Sign-up is not open yet.');
	});
});

describe('5c19e2 only a failure counts against the address', () => {
	it('charges failed callbacks, and gives a good one back', async () => {
		await db.insert(owner).values({ email: 'ana@example.com', googleSub: 'sub-ana' });
		const ip = '203.0.113.99';

		const failures = createRateLimiter('google-test-failures', 2);
		for (let i = 0; i < 2; i++) {
			const p = browser();
			const f = await begin(p, 'google-sign-in');
			await completeGoogleCallback(db, callback(p, `state=${f.state}&code=c1`, null, ip), config, {
				fetchFn: exchanges('not-a-token'),
				now: NOW,
				attemptDeps: { addressFailures: failures }
			});
		}
		expect(await failures.isLimited(db, ip)).toBe(true);

		const clean = createRateLimiter('google-test-clean', 2);
		for (let i = 0; i < 3; i++) {
			const p = browser();
			const f = await begin(p, 'google-sign-in');
			await completeGoogleCallback(db, callback(p, `state=${f.state}&code=c1`, null, ip), config, {
				fetchFn: exchanges(idToken({ nonce: f.nonce, sub: 'sub-ana', email: 'ana@example.com' })),
				now: NOW,
				attemptDeps: { addressFailures: clean }
			});
		}
		expect(await clean.isLimited(db, ip)).toBe(false);
	});
});

describe('5c19e2 connecting and confirming', () => {
	it('connects Google to the signed-in account after a fresh confirmation', async () => {
		const me = await signedIn({ email: 'me@example.com' });
		const f = await begin(me, 'google-connect', { sessionId: me.sessionId });
		const location = await finish(
			me,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-me', email: 'me@gmail.test' }),
			me.ownerId
		);
		expect(location).toBe('/settings/security');
		expect(takeFlash(me.cookies)).toBe('Google is connected. You can now sign in with it.');
		const [row] = await db.select().from(owner).where(eq(owner.id, me.ownerId));
		expect(row.googleSub).toBe('sub-me');
		expect(row.email).toBe('me@example.com');
	});

	it('refuses to connect without a fresh confirmation', async () => {
		const me = await signedIn({ email: 'me@example.com' }, false);
		const f = await begin(me, 'google-connect', { sessionId: me.sessionId });
		const location = await finish(
			me,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-me', email: 'me@gmail.test' }),
			me.ownerId
		);
		expect(location).toBe('/settings/security');
		expect(takeFlash(me.cookies)).toBe('Confirm it is you first, then try again.');
		const [row] = await db.select().from(owner).where(eq(owner.id, me.ownerId));
		expect(row.googleSub).toBeNull();
	});

	it('does not connect a Google account that belongs to someone else', async () => {
		await db.insert(owner).values({ email: 'ana@example.com', googleSub: 'sub-ana' });
		const me = await signedIn({ email: 'me@example.com' });
		const f = await begin(me, 'google-connect', { sessionId: me.sessionId });
		await finish(
			me,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-ana', email: 'ana@example.com' }),
			me.ownerId
		);
		expect(takeFlash(me.cookies)).toContain('already connected to another');
	});

	it('is refused when the flow was started by another session', async () => {
		const me = await signedIn({ email: 'me@example.com' });
		const you = await signedIn({ email: 'you@example.com' });
		const f = await begin(me, 'google-connect', { sessionId: me.sessionId });
		const location = await finish(
			you,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-me', email: 'me@gmail.test' }),
			you.ownerId
		);
		expect(location).toBe('/settings/security');
		const [row] = await db.select().from(owner).where(eq(owner.id, you.ownerId));
		expect(row.googleSub).toBeNull();
	});

	it('confirms with the same Google account, then goes to a safe next', async () => {
		const me = await signedIn({ email: 'me@example.com', googleSub: 'sub-me' }, false);
		expect(await stepUps.allows(db, me.sessionId, 'export-data')).toBe(false);
		const f = await begin(me, 'google-confirm', {
			sessionId: me.sessionId,
			next: '/settings/backup'
		});
		const location = await finish(
			me,
			`state=${f.state}&code=c1`,
			idToken({ nonce: f.nonce, sub: 'sub-me', email: 'me@gmail.test' }),
			me.ownerId
		);
		expect(location).toBe('/settings/backup');
		expect(await stepUps.allows(db, me.sessionId, 'export-data')).toBe(true);
	});

	it('goes back to Security with no safe next, and refuses a different Google account', async () => {
		const me = await signedIn({ email: 'me@example.com', googleSub: 'sub-me' }, false);
		const f = await begin(me, 'google-confirm', { sessionId: me.sessionId });
		expect(
			await finish(
				me,
				`state=${f.state}&code=c1`,
				idToken({ nonce: f.nonce, sub: 'sub-me', email: 'me@gmail.test' }),
				me.ownerId
			)
		).toBe('/settings/security');

		const other = await signedIn({ email: 'o@example.com', googleSub: 'sub-o' }, false);
		const g = await begin(other, 'google-confirm', { sessionId: other.sessionId });
		await finish(
			other,
			`state=${g.state}&code=c1`,
			idToken({ nonce: g.nonce, sub: 'sub-different', email: 'x@gmail.test' }),
			other.ownerId
		);
		expect(takeFlash(other.cookies)).toContain('not the Google account connected');
		expect(await stepUps.allows(db, other.sessionId, 'export-data')).toBe(false);
	});
});

describe('5c19e2 Google switched off', () => {
	it('is off with no configuration, and over plain http on the hosted build', () => {
		expect(googleFor(new URL('https://x.test/'), null)).toBeNull();
		expect(googleFor(new URL('http://x.test/'), config, true)).toBeNull();
		expect(googleFor(new URL('https://x.test/'), config, true)).toBe(config);
		expect(googleFor(new URL('http://localhost/'), config, false)).toBe(config);
	});

	it('answers 404 at the start and at the callback', async () => {
		const start = await import('../../../../routes/signin/google/+server.ts');
		const back = await import('../../../../routes/signin/google/callback/+server.ts');
		const p = browser();
		for (const GET of [start.GET, back.GET]) {
			await expect(GET(callback(p, 'state=a&code=b') as never)).rejects.toMatchObject({
				status: 404
			});
		}
		expect(p.jar.size).toBe(0);
	});
});
