import { describe, expect, it } from 'vitest';
import { open } from '#lib/server/db/open.ts';
import { authChallenge } from '#lib/server/db/schema.ts';
import { beginAuthentication, beginRegistration, relyingPartyFrom } from './webauthn.ts';

describe('TSK-D7D015 asking for options writes nothing to the database', () => {
	const rp = relyingPartyFrom(new URL('https://payday.example/signin'));

	it('keeps challenges in memory, so an anonymous caller cannot grow the volume', async () => {
		const db = open(':memory:');
		for (let i = 0; i < 5; i++) {
			await beginRegistration(db, rp, 'register');
			await beginAuthentication(rp);
			await beginAuthentication(rp, 'step-up', 'session-id');
		}
		expect(db.select().from(authChallenge).all()).toHaveLength(0);
	});

	it('takes the relying party from the request URL', () => {
		expect(rp).toEqual({ id: 'payday.example', origin: 'https://payday.example' });
	});
});
