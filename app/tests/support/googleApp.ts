import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { OWNER_EMAIL, OWNER_PASSWORD, SETUP_CODE } from './auth.ts';
import { startFakeGoogle, type FakeGoogle } from './fakeGoogle.ts';
import { test as base } from './test.ts';

/*
 * A second Payday server with "Continue with Google" switched ON (TSK-9a4d16), beside the main test
 * server, which keeps Google off. It is the same build output (`node build`, the adapter-node build the
 * main webServer makes), started once per worker on a free port, with an in-memory database of its
 * own and a fake Google (fakeGoogle.ts) standing in for the real one.
 *
 * Only the environment differs from playwright.config.ts's webServer: GOOGLE_CLIENT_ID and
 * GOOGLE_CLIENT_SECRET (made-up values), GOOGLE_TEST_PROVIDER pointing at the fake, and an ORIGIN
 * of its own. The test provider is honoured only outside the hosted build and only on a loopback
 * address; tests/netlify-google.smoke.ts proves the Netlify build ignores it.
 *
 * Sign-up is closed while nobody has an account, so a first owner registers with the setup code.
 */

export const GOOGLE_CLIENT_ID = 'payday-test-client.apps.googleusercontent.com';
export const GOOGLE_CLIENT_SECRET = 'payday-test-secret-not-a-real-one';

const APP_DIR = new URL('../../', import.meta.url);

export type GoogleApp = {
	/** http://localhost:<port>: where the browser opens this server. */
	baseURL: string;
	provider: FakeGoogle;
};

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});
}

async function untilHealthy(port: number, child: ChildProcess, log: () => string) {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`The Google test server stopped (exit ${child.exitCode}):\n${log()}`);
		}
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`, {
				signal: AbortSignal.timeout(2_000)
			});
			if (response.ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`The Google test server did not start in time:\n${log()}`);
}

/** Starts the fake provider and the second server, and registers the first owner. */
async function startGoogleApp(): Promise<{ app: GoogleApp; stop: () => Promise<void> }> {
	const provider = await startFakeGoogle({
		clientId: GOOGLE_CLIENT_ID,
		clientSecret: GOOGLE_CLIENT_SECRET
	});
	const port = await freePort();
	const baseURL = `http://localhost:${port}`;
	let output = '';
	const child = spawn(process.execPath, ['build'], {
		cwd: APP_DIR,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(port),
			ORIGIN: baseURL,
			PROTOCOL_HEADER: 'x-forwarded-proto',
			ADDRESS_HEADER: 'x-forwarded-for',
			DATABASE_URL: 'memory://',
			OWNER_SETUP_CODE: SETUP_CODE,
			GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET,
			GOOGLE_TEST_PROVIDER: provider.origin
		}
	});
	const keep = (chunk: Buffer) => {
		output = (output + chunk.toString()).slice(-4000);
	};
	child.stdout?.on('data', keep);
	child.stderr?.on('data', keep);
	const stop = async () => {
		child.kill();
		await provider.close();
	};

	try {
		await untilHealthy(port, child, () => output);
		// Sign-up is closed at 0 accounts: the first owner registers with the setup code, as in production.
		const response = await fetch(`${baseURL}/signin?/register`, {
			method: 'POST',
			headers: {
				accept: 'application/json',
				origin: baseURL,
				'x-forwarded-proto': 'http',
				'x-forwarded-for': '198.18.250.1'
			},
			body: new URLSearchParams({
				email: OWNER_EMAIL,
				password: OWNER_PASSWORD,
				again: OWNER_PASSWORD,
				setupCode: SETUP_CODE
			})
		});
		const answer = (await response.json()) as { type?: string };
		if (answer.type !== 'success' && answer.type !== 'redirect') {
			throw new Error(`Registering the first owner failed: ${response.status} ${answer.type}`);
		}
	} catch (error) {
		await stop();
		throw error;
	}
	return { app: { baseURL, provider }, stop };
}

type Lazy = { get(): Promise<GoogleApp> };

export const test = base.extend<
	{ googleOn: boolean; googleApp: GoogleApp },
	{ googleServer: Lazy }
>({
	// One server per worker, started the first time a test asks for it, stopped when the worker ends.
	googleServer: [
		// eslint-disable-next-line no-empty-pattern -- Playwright reads the dependencies from this pattern
		async ({}, use) => {
			const held: { started?: ReturnType<typeof startGoogleApp> } = {};
			await use({ get: async () => (await (held.started ??= startGoogleApp())).app });
			await (await held.started?.catch(() => null))?.stop();
		},
		{ scope: 'worker', timeout: 120_000 }
	],
	/** Set `test.use({ googleOn: true })` and the page opens the Google server instead of the main one. */
	googleOn: [false, { option: true }],
	googleApp: async ({ googleServer }, use) => {
		await use(await googleServer.get());
	},
	baseURL: async ({ baseURL, googleOn, googleServer }, use) => {
		await use(googleOn ? (await googleServer.get()).baseURL : baseURL);
	}
});

export { expect } from './test.ts';
