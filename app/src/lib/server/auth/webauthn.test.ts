import { describe, expect, it } from 'vitest';
import { freshDb } from '#lib/server/db/testing.ts';
import { authChallenge } from '#lib/server/db/schema.ts';
import { CHALLENGE_CAP } from './challenge.ts';
import { beginAuthentication, beginRegistration, relyingPartyFrom } from './webauthn.ts';

describe('TSK-D7D015 asking for options keeps its challenge in the database, bounded', () => {
	const rp = relyingPartyFrom(new URL('https://payday.example/signin'));

	it('holds each challenge as a row, and a flood cannot grow the table past its cap', async () => {
		const db = await freshDb();
		for (let i = 0; i < 5; i++) {
			await beginRegistration(db, rp, 'register');
			await beginAuthentication(db, rp);
			await beginAuthentication(db, rp, 'step-up', 'session-id');
		}
		expect(await db.select().from(authChallenge)).toHaveLength(15);
		for (let i = 0; i < CHALLENGE_CAP + 20; i++) await beginAuthentication(db, rp);
		expect(await db.select().from(authChallenge)).toHaveLength(CHALLENGE_CAP);
	});

	it('takes the relying party from the request URL', () => {
		expect(rp).toEqual({ id: 'payday.example', origin: 'https://payday.example' });
	});
});
