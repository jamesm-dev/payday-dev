import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { authChallenge, owner } from '#lib/server/db/schema.ts';
import { createSession } from '#lib/server/auth/session.ts';
import { stepUps } from '#lib/server/auth/stepUp.ts';
import { cookieJar } from '#lib/server/auth/testEvent.ts';
import { sha256Hex } from '#lib/server/auth/tokens.ts';

const state = vi.hoisted(() => ({ db: null as unknown, google: null as unknown }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));
vi.mock('#lib/server/auth/google/config.ts', () => ({ googleConfig: () => state.google }));

const { GET } = await import('./+server.ts');

const GOOGLE_ON = {
	clientId: 'client-id',
	clientSecret: 'client-secret',
	authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	issuers: ['https://accounts.google.com']
};

let db: Db;
let ownerId: number;
let ip = 0;

beforeEach(async () => {
	state.google = null;
	db = await freshDb();
	state.db = db;
	[{ id: ownerId }] = await db.insert(owner).values({}).returning({ id: owner.id });
});

async function call(query: string, opts: { signedIn?: boolean; confirmed?: boolean } = {}) {
	const { signedIn = true, confirmed = false } = opts;
	let cookies = cookieJar().cookies;
	let id = '';
	if (signedIn) {
		const { token } = await createSession(db, ownerId, 'test');
		id = sha256Hex(token);
		if (confirmed) await stepUps.markAssertion(db, id);
		cookies = cookieJar({ session: token }).cookies;
	}
	const url = new URL(`http://localhost/settings/security/google${query}`);
	try {
		const response = (await GET({
			locals: { ownerId: signedIn ? ownerId : null },
			cookies,
			url,
			request: new Request(url, { headers: { 'user-agent': 'vitest' } }),
			getClientAddress: () => `198.51.100.${++ip}`
		} as never)) as Response;
		return { response, id, cookies };
	} catch (error) {
		return { error, id, cookies };
	}
}

describe('TSK-6f0e5d GET /settings/security/google', () => {
	it('answers 404 while Google is off', async () => {
		const out = await call('?intent=connect', { confirmed: true });
		expect(isHttpError(out.error) && out.error.status).toBe(404);
		expect(await db.select().from(authChallenge)).toHaveLength(0);
	});

	it('sends a signed-out visitor to sign in', async () => {
		state.google = GOOGLE_ON;
		const out = await call('?intent=confirm', { signedIn: false });
		expect(out.response?.status).toBe(303);
		expect(out.response?.headers.get('location')).toBe('/signin');
		expect(await db.select().from(authChallenge)).toHaveLength(0);
	});

	it('refuses any intent but connect and confirm with a 400', async () => {
		state.google = GOOGLE_ON;
		for (const query of ['', '?intent=sign-in', '?intent=disconnect', '?intent=']) {
			const out = await call(query, { confirmed: true });
			expect(isHttpError(out.error) && out.error.status, query).toBe(400);
		}
		expect(await db.select().from(authChallenge)).toHaveLength(0);
	});

	it('sends connect without a fresh confirmation to the confirm box, starting nothing', async () => {
		state.google = GOOGLE_ON;
		const out = await call('?intent=connect');
		expect(out.response?.status).toBe(303);
		expect(out.response?.headers.get('location')).toBe('/settings/security#confirm');
		expect(out.cookies.get('flash')).toBe('google-confirm-first');
		expect(await db.select().from(authChallenge)).toHaveLength(0);
	});

	it('starts a connect flow bound to the session and redirects to Google', async () => {
		state.google = GOOGLE_ON;
		const out = await call('?intent=connect', { confirmed: true });
		expect(out.response?.status).toBe(303);
		const location = new URL(out.response!.headers.get('location')!);
		expect(location.origin + location.pathname).toBe(GOOGLE_ON.authorizeUrl);
		expect(location.searchParams.get('redirect_uri')).toBe(
			'http://localhost/signin/google/callback'
		);
		const rows = await db.select().from(authChallenge);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.purpose).toBe('google-connect');
		expect(rows[0]?.id).toBe(location.searchParams.get('state'));
		expect(JSON.stringify(rows[0])).toContain(out.id);
	});

	it('starts a confirm flow with no step-up needed, keeping a safe next only', async () => {
		state.google = GOOGLE_ON;
		const out = await call('?intent=confirm&next=/settings/backup');
		expect(out.response?.status).toBe(303);
		const [row] = await db.select().from(authChallenge);
		expect(row?.purpose).toBe('google-confirm');
		expect(row?.challenge).toContain('/settings/backup');

		const evil = await call('?intent=confirm&next=//evil.example');
		expect(evil.response?.status).toBe(303);
		const rows = await db.select().from(authChallenge);
		expect(rows.some((r) => r.challenge.includes('evil.example'))).toBe(false);
	});
});
