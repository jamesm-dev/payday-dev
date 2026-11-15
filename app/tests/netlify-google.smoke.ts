/*
 * Smoke test of the BUILT Netlify function with Google sign-in switched ON (TSK-9a4d16, TSK-5c19e2).
 * Its twin, netlify-function.smoke.ts, runs the same function with the Google variables unset and
 * proves nothing about Google shows. node --test runs each file in a process of its own, which
 * matters: the function reads its environment once, so the two cases cannot share a process.
 *
 *   pnpm build && pnpm test:netlify
 *
 * What it proves: GOOGLE_TEST_PROVIDER, the switch the browser tests use to point the app at a fake
 * Google, is not in the hosted bundle. Set to a loopback address beside the real variables, it must
 * change nothing: the function is still on, still talks to Google's own address, and never sends
 * anyone to the loopback one. Two proofs, because the second cannot be a complete one here:
 *
 *   1. The built chunks hold Google's real addresses, and every place that reads the test provider
 *      reads `undefined` (the build folded it away; see config.ts).
 *   2. The function itself, called as Netlify calls it, is on (not 404) and sends nobody, and no
 *      request, to the loopback provider.
 *
 * Seeing the redirect to https://accounts.google.com/ end to end needs a database to store the flow
 * in, and this test has none (DATABASE_URL is a closed port, as in the twin): if the function does
 * redirect, the test checks where; without a database it answers 5xx, and that is accepted here.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startFakeGoogle, type FakeGoogle } from './support/fakeGoogle.ts';

const FUNCTION = new URL('../.netlify/v1/functions/sveltekit-render.mjs', import.meta.url);
const SERVER_DIR = fileURLToPath(new URL('../.netlify/v1/server/', import.meta.url));
const HTML = { accept: 'text/html' };

type Handler = (request: Request, context: { ip: string }) => Promise<Response>;
let call: (path: string) => Promise<Response>;
let provider: FakeGoogle;

before(async () => {
	assert.ok(
		existsSync(FUNCTION),
		'No Netlify build found: run `pnpm build` (not the adapter-node build) first.'
	);
	provider = await startFakeGoogle({ clientId: 'smoke-client', clientSecret: 'smoke-secret' });
	process.env.DATABASE_URL = 'postgres://payday:unused@127.0.0.1:1/postgres';
	process.env.OWNER_SETUP_CODE = 'smoke-test-code';
	process.env.GOOGLE_CLIENT_ID = 'smoke-client';
	process.env.GOOGLE_CLIENT_SECRET = 'smoke-secret';
	process.env.GOOGLE_TEST_PROVIDER = provider.origin;
	const handler = (await import(FUNCTION.href)).default as Handler;
	call = (path) =>
		handler(new Request(`https://payday.example${path}`, { headers: HTML, redirect: 'manual' }), {
			ip: '203.0.113.9'
		});
});

after(async () => {
	await provider?.close();
});

const chunks = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return chunks(path);
		return name.endsWith('.js') ? [path] : [];
	});

describe('TSK-9a4d16 TSK-5c19e2 the Netlify build ignores the test provider', () => {
	it('has Google’s own addresses, and every read of the test provider is undefined', () => {
		const withGoogle = chunks(SERVER_DIR).filter((file) =>
			readFileSync(file, 'utf8').includes('https://oauth2.googleapis.com/token')
		);
		assert.ok(withGoogle.length > 0, 'the build holds no Google configuration at all');
		for (const file of withGoogle) {
			const text = readFileSync(file, 'utf8');
			const reads = [...text.matchAll(/testProvider:\s*([^\n,}]+)/g)].map((m) => m[1].trim());
			assert.ok(reads.length > 0, `${file} does not read a test provider`);
			for (const read of reads) assert.equal(read, 'void 0', `${file} reads ${read}`);
		}
	});

	it('is on with the variables set (not a 404), and never sends anyone to the loopback provider', async () => {
		for (const path of ['/signin/google', '/signin/google/callback?state=x&code=y']) {
			const response = await call(path);
			assert.notEqual(response.status, 404, `${path} answers as if Google were off`);
			const location = response.headers.get('location');
			if (location) {
				if (path === '/signin/google') {
					assert.match(location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
				}
				assert.doesNotMatch(location, /127\.0\.0\.1|localhost/);
			}
		}
		assert.equal(provider.requestsSeen(), 0, 'something reached the loopback provider');
	});
});
