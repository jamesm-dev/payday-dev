import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';

/*
 * TSK-8fcc17 the passkey confirmation in Settings, run as SvelteKit would run it, with the WebAuthn
 * check replaced by a verdict the test chooses. What is tested is the limit around it: one person's
 * wrong passkeys on a shared address must not stop another person's right one.
 */
const state = vi.hoisted(() => ({ db: null as unknown, right: false }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));
// The brakes' waiting is not what is tested here, and 10 failures would sleep for seconds.
vi.mock('./failureBrake.ts', async (original) => ({
	...(await original<typeof import('./failureBrake.ts')>()),
	waitForBrakes: async () => 0
}));
vi.mock('./webauthn.ts', async (original) => {
	const real = await original<typeof import('./webauthn.ts')>();
	return {
		...real,
		finishAuthentication: async () => {
			if (!state.right) throw new real.AuthError('That passkey did not work.');
			return 1;
		}
	};
});

import { POST } from '../../../routes/settings/security/step-up/verify/+server.ts';
import { accountBrake } from './failureBrake.ts';
import { addressFailures, addressPasses, ADDRESS_FAILURES_MAX } from './rateLimit.ts';
import { ADDRESS_PASSES_PER_MINUTE } from './rateLimit.ts';
import { createSession } from './session.ts';
import { TOO_MANY } from './signInAttempt.ts';
import { accountKeyOf } from './signInLookup.ts';
import { stepUps } from './stepUp.ts';
import { cookieJar } from './testEvent.ts';
import { sha256Hex } from './tokens.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
	state.db = db;
	state.right = false;
	await db.insert(owner).values({ id: 1, email: 'me@example.com' });
});

async function post(address: string) {
	const { token } = await createSession(db, 1, 'test');
	const url = new URL('http://localhost/settings/security/step-up/verify');
	const response = await POST({
		request: new Request(url, {
			method: 'POST',
			body: JSON.stringify({ challengeId: 'c', response: {} }),
			headers: { 'content-type': 'application/json' }
		}),
		cookies: cookieJar({ session: token }).cookies,
		url,
		locals: { ownerId: 1 },
		getClientAddress: () => address
	} as never);
	return { status: response.status, body: await response.json(), sessionId: sha256Hex(token) };
}

describe('TSK-8fcc17 the passkey confirmation counts wrong ones after the answer', () => {
	it('answers 12 wrong passkeys from one address as wrong, never "too many", then accepts the right one', async () => {
		for (let i = 0; i < 12; i++) {
			const r = await post('192.0.2.10');
			expect(r.status).toBe(400);
			expect(r.body.message).not.toBe(TOO_MANY);
		}
		state.right = true;
		const right = await post('192.0.2.10');
		expect(right.status).toBe(200);
		expect(await stepUps.hasAssertion(db, right.sessionId)).toBe(true);
		// The wrong ones were counted, against the address and the account.
		expect(await addressFailures.isLimited(db, '192.0.2.10')).toBe(false);
		expect(await accountBrake.count(db, accountKeyOf('me@example.com'))).toBe(12);
	});

	it('still holds an address that has guessed past the threshold and used its few passes', async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX; i++)
			await addressFailures.recordFailure(db, '192.0.2.11');
		for (let i = 0; i < ADDRESS_PASSES_PER_MINUTE; i++) await addressPasses.hit(db, '192.0.2.11');
		const held = await post('192.0.2.11');
		expect(held.status).toBe(429);
		expect(held.body.message).toBe(TOO_MANY);
		// Another address is not affected.
		state.right = true;
		expect((await post('192.0.2.12')).status).toBe(200);
	});

	it('lets a calm account through past the threshold, and gives the place back on a right passkey', async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX; i++)
			await addressFailures.recordFailure(db, '192.0.2.13');
		state.right = true;
		for (let i = 0; i < ADDRESS_PASSES_PER_MINUTE + 5; i++) {
			expect((await post('192.0.2.13')).status).toBe(200);
		}
	});
});
