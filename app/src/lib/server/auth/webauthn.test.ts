import { describe, expect, it } from 'vitest';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import { authChallenge, owner } from '#lib/server/db/schema.ts';
import { CHALLENGE_CAP } from './challenge.ts';
import { consumeChallenge } from './challenge.ts';
import { addPasskey } from './passkeys.ts';
import { beginAuthentication, beginRegistration, relyingPartyFrom } from './webauthn.ts';

describe('TSK-D7D015 asking for options keeps its challenge in the database, bounded', () => {
	const rp = relyingPartyFrom(new URL('https://payday.example/signin'));

	it('holds each challenge as a row, and a flood cannot grow the table past its cap', async () => {
		const db = await freshDb();
		await db.insert(owner).values(ownerRow(1));
		for (let i = 0; i < 5; i++) {
			await beginRegistration(db, rp, 'register', 1);
			await beginAuthentication(db, rp);
			await beginAuthentication(db, rp, 'step-up', 'session-id');
		}
		expect(await db.select().from(authChallenge)).toHaveLength(15);
		for (let i = 0; i < CHALLENGE_CAP + 20; i++) await beginAuthentication(db, rp);
		expect(await db.select().from(authChallenge)).toHaveLength(CHALLENGE_CAP);
	});

	it('TSK-2ad8f3 gives each person their own passkey handle and name, and excludes only their own passkeys', async () => {
		const db = await freshDb();
		// Owner 1 as the migration left them: the handle every earlier passkey was made with.
		await db
			.insert(owner)
			.values([{ ...ownerRow(1), webauthnUserId: Buffer.from('payday-owner') }, ownerRow(2)]);
		const key = (id: string) => ({ id, publicKey: new Uint8Array([1]), counter: 0, nickname: 'x' });
		await addPasskey(db, 1, key('first-persons-key'));
		await addPasskey(db, 2, key('second-persons-key'));

		const one = (await beginRegistration(db, rp, 'add-passkey', 1)).options;
		const two = (await beginRegistration(db, rp, 'add-passkey', 2)).options;
		const handle = (id: string) => Buffer.from(id, 'base64url').toString('utf8');
		// Owner 1 (no email) keeps the handle every passkey of theirs was made with.
		expect(Buffer.from(one.user.id, 'base64url')).toEqual(Buffer.from('payday-owner'));
		expect(one.user.name).toBe('Payday owner');
		expect(handle(two.user.id)).not.toBe('payday-owner');
		expect(Buffer.from(two.user.id, 'base64url')).toHaveLength(16);
		expect(two.user.name).toBe('owner2@example.test');
		expect(one.excludeCredentials?.map((c) => c.id)).toEqual(['first-persons-key']);
		expect(two.excludeCredentials?.map((c) => c.id)).toEqual(['second-persons-key']);
	});

	it('TSK-2ad8f3 binds an add-passkey challenge to the session that asked', async () => {
		const db = await freshDb();
		await db.insert(owner).values(ownerRow(1));
		const { challengeId, options } = await beginRegistration(db, rp, 'add-passkey', 1, 'session-a');
		expect(
			await consumeChallenge(db, challengeId, 'add-passkey', new Date(), 'session-b')
		).toBeNull();
		const again = await beginRegistration(db, rp, 'add-passkey', 1, 'session-a');
		expect(
			await consumeChallenge(db, again.challengeId, 'add-passkey', new Date(), 'session-a')
		).toBe(again.options.challenge);
		expect(options.challenge).not.toBe(again.options.challenge);
	});

	it('takes the relying party from the request URL', () => {
		expect(rp).toEqual({ id: 'payday.example', origin: 'https://payday.example' });
	});
});
