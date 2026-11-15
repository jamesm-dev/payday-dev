/*
 * Smoke test of the BUILT Netlify function (TSK-13D3EB, TSK-EECFCF). It imports what
 * @sveltejs/adapter-netlify emitted, `.netlify/v1/functions/sveltekit-render.mjs`, and calls it the
 * way Netlify does: a Request and a context carrying `ip`. So it proves the headers come from the
 * app's own hooks in the real function, not from any host setting.
 *
 *   pnpm build && pnpm test:netlify
 *
 * It needs a Netlify build (not the browser tests' adapter-node build), so it is not part of the
 * default unit run; CI runs it right after `pnpm build`.
 *
 * No database is needed. DATABASE_URL is a postgres:// address on a closed local port: postgres-js
 * connects lazily, so only the two requests that read the database ever try, and both are meant to
 * find it unreachable (a health check and a request that carries a session cookie).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

const FUNCTION = new URL('../.netlify/v1/functions/sveltekit-render.mjs', import.meta.url);
const HTML = { accept: 'text/html' };

type Handler = (request: Request, context: { ip: string }) => Promise<Response>;
let call: (path: string, headers?: Record<string, string>) => Promise<Response>;
let post: (path: string, headers?: Record<string, string>) => Promise<Response>;

before(async () => {
	assert.ok(
		existsSync(FUNCTION),
		'No Netlify build found: run `pnpm build` (not the adapter-node build) first.'
	);
	process.env.DATABASE_URL = 'postgres://payday:unused@127.0.0.1:1/postgres';
	process.env.OWNER_SETUP_CODE = 'smoke-test-code';
	// Google sign-in is OFF here (tests/netlify-google.smoke.ts runs it on, in a process of its own).
	delete process.env.GOOGLE_CLIENT_ID;
	delete process.env.GOOGLE_CLIENT_SECRET;
	delete process.env.GOOGLE_TEST_PROVIDER;
	const handler = (await import(FUNCTION.href)).default as Handler;
	call = (path, headers = {}) =>
		handler(new Request(`https://payday.example${path}`, { headers, redirect: 'manual' }), {
			ip: '203.0.113.7'
		});
	post = (path, headers = {}) =>
		handler(
			new Request(`https://payday.example${path}`, {
				method: 'POST',
				headers: { origin: 'https://payday.example', ...headers },
				body: new URLSearchParams({ amount: '1' }),
				redirect: 'manual'
			}),
			{ ip: '203.0.113.7' }
		);
});

const expectAppHeaders = (response: Response) => {
	const h = response.headers;
	assert.match(h.get('strict-transport-security') ?? '', /max-age=\d+/);
	assert.equal(h.get('x-content-type-options'), 'nosniff');
	assert.equal(h.get('x-frame-options'), 'DENY');
	assert.equal(h.get('referrer-policy'), 'same-origin');
	assert.ok(h.get('x-request-id'));
};

describe('TSK-13D3EB the built Netlify function sets the security headers itself', () => {
	it('shows a signed-out visitor the public home page, never kept by a shared cache', async () => {
		const response = await call('/', HTML);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.match(response.headers.get('vary') ?? '', /cookie/i);
		expectAppHeaders(response);
		const csp = response.headers.get('content-security-policy') ?? '';
		assert.match(csp, /script-src 'self' 'nonce-[\w+/=-]+'/);
		const body = await response.text();
		assert.match(body, /Know how much you can spend until payday/);
		assert.match(body, /<link rel="canonical" href="https:\/\/payday-birc\.netlify\.app\/"/);
	});

	it('shows a link-preview fetcher (Accept */* or none) the page and its Open Graph tags', async () => {
		for (const headers of [{ accept: '*/*' }, {}] as Record<string, string>[]) {
			const response = await call('/', headers);
			assert.equal(response.status, 200);
			assert.equal(response.headers.get('cache-control'), 'no-store');
			const body = await response.text();
			assert.match(body, /property="og:title"/);
			assert.match(
				body,
				/property="og:image" content="https:\/\/payday-birc\.netlify\.app\/icon-512\.png"/
			);
		}
		assert.equal((await call('/', { accept: 'application/json' })).status, 401);
	});

	it('sends a signed-out visitor to sign in from a private page, with the headers', async () => {
		const response = await call('/plan', HTML);
		assert.equal(response.status, 303);
		assert.equal(response.headers.get('location'), '/signin?next=%2Fplan');
		expectAppHeaders(response);
	});

	it('refuses a signed-out write to the home page with 401', async () => {
		const response = await post('/?/balance', HTML);
		assert.equal(response.status, 401);
		expectAppHeaders(response);
	});

	it('answers a protected data request with a private, never-kept redirect', async () => {
		const response = await call('/plan/__data.json');
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
		expectAppHeaders(response);
		assert.equal(((await response.json()) as { type: string }).type, 'redirect');
	});

	it('gives a 404 page the content security policy as well', async () => {
		const response = await call('/management', HTML);
		assert.equal(response.status, 404);
		expectAppHeaders(response);
		const csp = response.headers.get('content-security-policy') ?? '';
		assert.match(csp, /default-src 'self'/);
		assert.match(csp, /frame-ancestors 'none'/);
		assert.match(csp, /script-src 'self' 'nonce-[\w+/=-]+'/);
		assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
	});

	it('refuses an unsafe request from a signed-out visitor with 401 and the headers', async () => {
		const response = await call('/settings/reminders', { accept: 'application/json' });
		assert.equal(response.status, 401);
		expectAppHeaders(response);
	});
});

describe('TSK-13D3EB an unreachable database is a plain 503, with the headers', () => {
	it('/health says the database is in error and is never cached', async () => {
		const response = await call('/health');
		assert.equal(response.status, 503);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.deepEqual(await response.json(), { database: 'error' });
		expectAppHeaders(response);
	});

	it('a signed-in-looking request explains it in words, without the address', async () => {
		const response = await call('/', { ...HTML, cookie: '__Host-session=not-a-real-token' });
		assert.equal(response.status, 503);
		expectAppHeaders(response);
		assert.equal(
			response.headers.get('content-security-policy'),
			"default-src 'none'; frame-ancestors 'none'"
		);
		const body = await response.text();
		assert.match(body, /can't reach its database/);
		assert.match(body, /Restore/);
		assert.doesNotMatch(body, /postgres|127\.0\.0\.1|unused/);
	});
});

describe('TSK-5c19e2 TSK-9a4d16 with the Google variables unset, the built function has no Google', () => {
	it('answers 404 at the start and the callback, with the headers', async () => {
		for (const path of ['/signin/google', '/signin/google/callback?state=x&code=y']) {
			const response = await call(path, HTML);
			assert.equal(response.status, 404, path);
			expectAppHeaders(response);
		}
	});

	it('prerendered the privacy notice without the Google paragraph', () => {
		// The notice is a static file on Netlify (publish = build), made when the site is built. This
		// build had no Google variables, so the paragraph is not in it; people-google.e2e.ts proves a
		// build that has them writes it.
		const page = new URL('../build/privacy.html', import.meta.url);
		assert.ok(existsSync(page), 'No prerendered privacy notice: run `pnpm build` first.');
		const body = readFileSync(page, 'utf8');
		assert.match(body, /Privacy notice/);
		assert.doesNotMatch(body, /Continue with Google|Google sends Payday/);
	});

	it('does not even answer a sign-in page with Google when the database is down', async () => {
		// /signin needs the database to know whether anyone has an account, so here it is the plain
		// 503 page: the point is that no Google link leaks into it either way.
		const response = await call('/signin', HTML);
		assert.doesNotMatch(await response.text(), /Continue with Google/);
	});
});
