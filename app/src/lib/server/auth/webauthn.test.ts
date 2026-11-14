import { describe, expect, it } from 'vitest';
import { freshDb } from '#lib/server/db/testing.ts';
import { authChallenge } from '#lib/server/db/schema.ts';
import { beginAuthentication, beginRegistration, relyingPartyFrom } from './webauthn.ts';

describe('TSK-D7D015 asking for options writes nothing to the database', () => {
	const rp = relyingPartyFrom(new URL('https://payday.example/signin'));

	it('keeps challenges in memory, so an anonymous caller cannot grow the volume', async () => {
		const db = await freshDb();
		for (let i = 0; i < 5; i++) {
			await beginRegistration(db, rp, 'register');
			await beginAuthentication(rp);
			await beginAuthentication(rp, 'step-up', 'session-id');
		}
		expect(await db.select().from(authChallenge)).toHaveLength(0);
	});

	it('takes the relying party from the request URL', () => {
		expect(rp).toEqual({ id: 'payday.example', origin: 'https://payday.example' });
	});
});
