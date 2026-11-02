import { beforeEach, describe, expect, it, vi } from 'vitest';
import { open, type Db } from '#lib/server/db/open.ts';
import { owner, passkey } from '#lib/server/db/schema.ts';

/*
 * The two passkey endpoints, run as SvelteKit would run them, with the WebAuthn verification
 * replaced by a promise the test settles, so the moment between "verified" and "written" can be
 * reached on purpose.
 */
const state = vi.hoisted(() => ({
	db: null as unknown,
	settle: null as null | ((value: unknown) => void)
}));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));
vi.mock('./stepUpGate.ts', () => ({ stepUpAllows: () => true }));
vi.mock('./webauthn.ts', async (original) => {
	const real = await original<typeof import('./webauthn.ts')>();
	const pending = () => new Promise((resolve) => (state.settle = resolve));
	return { ...real, finishAuthentication: pending, finishRegistration: pending };
});

import { POST as authenticateVerify } from '../../../routes/signin/authenticate/verify/+server.ts';
import { POST as registerVerify } from '../../../routes/signin/register/verify/+server.ts';
import { OWNER_ID } from './passkeys.ts';
import { signInFailures } from './rateLimit.ts';
import { createSession, deleteAllSessions } from './session.ts';
import { cookieJar } from './testEvent.ts';

let db: Db;
beforeEach(() => {
	db = open(':memory:');
	state.db = db;
	state.settle = null;
	db.insert(owner).values({ id: OWNER_ID }).run();
});

function jsonEvent(path: string, body: unknown, cookies = cookieJar().cookies, address = '') {
	const url = new URL(`http://localhost${path}`);
	return {
		request: new Request(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json', 'user-agent': 'vitest' }
		}),
		cookies,
		url,
		locals: { ownerId: OWNER_ID },
		getClientAddress: () => address
	} as never;
}

/** Waits until the endpoint has reached the mocked verification and is awaiting it. */
async function untilVerifying() {
	for (let i = 0; i < 50 && !state.settle; i++) await new Promise((r) => setTimeout(r, 1));
	expect(state.settle).not.toBeNull();
}

describe('TSK-D7D015 passkey sign-in and adding a device', () => {
	it('signs in with a passkey even when failed passwords have filled the address limit', async () => {
		const address = '192.0.2.44';
		for (let i = 0; i < 20; i++) signInFailures.recordFailure(address);
		expect(signInFailures.isLimited(address)).toBe(true);

		const response = authenticateVerify(
			jsonEvent(
				'/signin/authenticate/verify',
				{ challengeId: 'c', response: {} },
				undefined,
				address
			)
		);
		await untilVerifying();
		state.settle!(OWNER_ID);
		const res = await response;

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it('adds nothing when the session ended while the new device was being verified', async () => {
		const { token } = createSession(db, OWNER_ID, 'vitest');
		const { cookies } = cookieJar({ session: token });

		const response = registerVerify(
			jsonEvent('/signin/register/verify', { challengeId: 'c', response: {} }, cookies)
		);
		await untilVerifying();
		// A password change (or "sign out everywhere") ends the session mid-verification.
		deleteAllSessions(db, OWNER_ID);
		state.settle!({
			id: 'new-credential',
			publicKey: Buffer.from([1, 2, 3]),
			counter: 0,
			transports: [],
			deviceType: 'singleDevice',
			backedUp: false,
			nickname: 'Phone'
		});
		const res = await response;

		expect(res.status).toBe(403);
		expect(db.select().from(passkey).all()).toHaveLength(0);
	});

	it('adds the device when the session is still live', async () => {
		const { token } = createSession(db, OWNER_ID, 'vitest');
		const { cookies } = cookieJar({ session: token });

		const response = registerVerify(
			jsonEvent('/signin/register/verify', { challengeId: 'c', response: {} }, cookies)
		);
		await untilVerifying();
		state.settle!({
			id: 'new-credential',
			publicKey: Buffer.from([1, 2, 3]),
			counter: 0,
			transports: [],
			deviceType: 'singleDevice',
			backedUp: false,
			nickname: 'Phone'
		});
		const res = await response;

		expect(res.status).toBe(200);
		expect(db.select().from(passkey).all()).toHaveLength(1);
	});
});
