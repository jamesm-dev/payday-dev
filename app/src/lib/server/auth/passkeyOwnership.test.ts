import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import { authChallenge, owner, passkey, session } from '#lib/server/db/schema.ts';

/*
 * TSK-2ad8f3, TSK-4da7e9: the passkey endpoints with more than one person in the database. The
 * browser's answer is replaced (the WebAuthn verification says "fine" to anything); everything
 * that decides WHOSE passkey and WHICH session is real.
 */
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));
vi.mock('./stepUpGate.ts', () => ({ stepUpAllows: () => true }));
vi.mock('@simplewebauthn/server', async (original) => {
	const real = await original<typeof import('@simplewebauthn/server')>();
	return {
		...real,
		verifyRegistrationResponse: async () => ({
			verified: true,
			registrationInfo: {
				credential: { id: 'a-new-credential', publicKey: new Uint8Array([9, 9]), counter: 0 },
				credentialDeviceType: 'singleDevice',
				credentialBackedUp: false
			}
		}),
		verifyAuthenticationResponse: async () => ({
			verified: true,
			authenticationInfo: { newCounter: 5 }
		})
	};
});

import { POST as registerOptions } from '../../../routes/signin/register/options/+server.ts';
import { POST as registerVerify } from '../../../routes/signin/register/verify/+server.ts';
import { POST as stepUpVerify } from '../../../routes/settings/security/step-up/verify/+server.ts';
import { stepUps } from './stepUp.ts';
import { addPasskey } from './passkeys.ts';
import { createSession } from './session.ts';
import { cookieJar } from './testEvent.ts';
import { sha256Hex } from './tokens.ts';
import {
	beginAuthentication,
	beginRegistration,
	finishAuthentication,
	relyingPartyFrom
} from './webauthn.ts';

const RP_URL = new URL('http://localhost/signin');
let db: Db;
let ip = 0;

const key = (id: string) => ({
	id,
	publicKey: new Uint8Array([1, 2, 3]),
	counter: 0,
	nickname: 'x'
});

beforeEach(async () => {
	db = await freshDb();
	state.db = db;
	// Owner 1 as the migration left them (the handle of every older passkey), then person 2.
	await db
		.insert(owner)
		.values([{ ...ownerRow(1), webauthnUserId: Buffer.from('payday-owner') }, ownerRow(2)]);
	await addPasskey(db, 1, key('credential-of-1'));
	await addPasskey(db, 2, key('credential-of-2'));
});

async function signedIn(ownerId: number) {
	const { token } = await createSession(db, ownerId, 'vitest');
	return { cookies: cookieJar({ session: token }).cookies, sessionId: sha256Hex(token) };
}

function jsonEvent(
	who: { cookies: unknown },
	ownerId: number | null,
	path: string,
	body: unknown = {}
) {
	const url = new URL(`http://localhost${path}`);
	return {
		request: new Request(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json', 'user-agent': 'vitest' }
		}),
		cookies: who.cookies,
		url,
		locals: { ownerId },
		getClientAddress: () => `198.51.100.${++ip}`
	} as never;
}

const rp = relyingPartyFrom(RP_URL);

describe('TSK-2ad8f3 adding a passkey asks for options as the signed-in person', () => {
	it("excludes only that person's credentials and uses that person's handle", async () => {
		const two = await signedIn(2);
		const res = await registerOptions(jsonEvent(two, 2, '/signin/register/options'));
		expect(res.status).toBe(200);
		const { options } = await res.json();
		expect(options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([
			'credential-of-2'
		]);
		const [row] = await db.select().from(owner).where(eq(owner.id, 2));
		expect(Buffer.from(options.user.id, 'base64url')).toEqual(Buffer.from(row!.webauthnUserId));
		expect(options.user.name).toBe('owner2@example.test');

		const one = await signedIn(1);
		const first = (
			await (await registerOptions(jsonEvent(one, 1, '/signin/register/options'))).json()
		).options;
		expect(first.excludeCredentials.map((c: { id: string }) => c.id)).toEqual(['credential-of-1']);
		expect(Buffer.from(first.user.id, 'base64url')).toEqual(Buffer.from('payday-owner'));
	});

	it('binds the challenge it gives to the session that asked', async () => {
		const two = await signedIn(2);
		const res = await registerOptions(jsonEvent(two, 2, '/signin/register/options'));
		expect(res.status).toBe(200);
		const rows = await db.select().from(authChallenge);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.purpose).toBe('add-passkey');
		expect(rows[0]!.bound).toBe(two.sessionId);
	});

	it('answers in words, not with a 500, when the account was deleted meanwhile', async () => {
		const two = await signedIn(2);
		await db.delete(passkey).where(eq(passkey.ownerId, 2));
		await db.delete(session).where(eq(session.ownerId, 2));
		await db.delete(owner).where(eq(owner.id, 2));
		const res = await registerOptions(jsonEvent(two, 2, '/signin/register/options'));
		expect(res.status).toBe(403);
		expect((await res.json()).message).toMatch(/no longer exists/);
	});
});

describe('TSK-2ad8f3 adding a passkey finishes only in the session that asked', () => {
	const answer = (challengeId: string) => ({ challengeId, response: { id: 'x', response: {} } });

	it('refuses a challenge another session asked for, and adds nothing', async () => {
		const asking = await signedIn(2);
		const other = await signedIn(2);
		const { challengeId } = await beginRegistration(db, rp, 'add-passkey', 2, asking.sessionId);
		const res = await registerVerify(
			jsonEvent(other, 2, '/signin/register/verify', answer(challengeId))
		);
		expect(res.status).toBe(400);
		expect(await db.select().from(passkey).where(eq(passkey.id, 'a-new-credential'))).toHaveLength(
			0
		);
	});

	it('adds the passkey for the session that asked, to its own person only', async () => {
		const asking = await signedIn(2);
		const { challengeId } = await beginRegistration(db, rp, 'add-passkey', 2, asking.sessionId);
		const res = await registerVerify(
			jsonEvent(asking, 2, '/signin/register/verify', answer(challengeId))
		);
		expect(res.status).toBe(200);
		const [added] = await db.select().from(passkey).where(eq(passkey.id, 'a-new-credential'));
		expect(added?.ownerId).toBe(2);
	});

	it('does not take a challenge that was made with no session at all', async () => {
		const two = await signedIn(2);
		const { challengeId } = await beginRegistration(db, rp, 'add-passkey', 2);
		const res = await registerVerify(
			jsonEvent(two, 2, '/signin/register/verify', answer(challengeId))
		);
		expect(res.status).toBe(400);
	});
});

describe('TSK-2ad8f3 a passkey of person 2 cannot confirm person 1 is at the keyboard', () => {
	it('is refused with 400 and leaves person 1’s session unconfirmed', async () => {
		const one = await signedIn(1);
		const { challengeId } = await beginAuthentication(db, rp, 'step-up', one.sessionId);
		const res = await stepUpVerify(
			jsonEvent(one, 1, '/settings/security/step-up/verify', {
				challengeId,
				response: { id: 'credential-of-2', response: {} }
			})
		);
		expect(res.status).toBe(400);
		expect((await res.json()).message).toBe('That passkey is not yours.');
		const [row] = await db.select().from(session).where(eq(session.id, one.sessionId));
		expect(row!.stepUpAt).toBeNull();
		expect(await stepUps.hasAssertion(db, one.sessionId)).toBe(false);
	});

	it('confirms the session when the passkey is the person’s own (the control)', async () => {
		const one = await signedIn(1);
		const { challengeId } = await beginAuthentication(db, rp, 'step-up', one.sessionId);
		const res = await stepUpVerify(
			jsonEvent(one, 1, '/settings/security/step-up/verify', {
				challengeId,
				response: { id: 'credential-of-1', response: {} }
			})
		);
		expect(res.status).toBe(200);
		expect(await stepUps.hasAssertion(db, one.sessionId)).toBe(true);
	});
});

describe('TSK-2ad8f3 a passkey sign-in checks the device’s user handle too', () => {
	const handleOf = async (id: number) => {
		const [row] = await db.select().from(owner).where(eq(owner.id, id));
		return Buffer.from(row!.webauthnUserId).toString('base64url');
	};
	const finish = async (credential: string, userHandle?: string) => {
		const { challengeId } = await beginAuthentication(db, rp);
		return finishAuthentication(db, rp, challengeId, {
			id: credential,
			response: { userHandle }
		} as never);
	};

	it('accepts the credential’s own person, with or without a handle', async () => {
		expect(await finish('credential-of-2', await handleOf(2))).toBe(2);
		expect(await finish('credential-of-1', await handleOf(1))).toBe(1);
		expect(await finish('credential-of-2')).toBe(2);
	});

	it('refuses a handle that belongs to someone else, and does not count the use', async () => {
		await expect(finish('credential-of-2', await handleOf(1))).rejects.toThrow(
			/could not be verified/
		);
		const [row] = await db.select().from(passkey).where(eq(passkey.id, 'credential-of-2'));
		expect(row!.counter).toBe(0);
	});
});
