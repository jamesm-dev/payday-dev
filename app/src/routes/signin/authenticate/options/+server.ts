import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { clientKey } from '#lib/server/auth/cookie.ts';
import { optionsRequests } from '#lib/server/auth/rateLimit.ts';
import { beginAuthentication, relyingPartyFrom } from '#lib/server/auth/webauthn.ts';
import type { RequestHandler } from './$types';

/** Open to anyone, so it is rate limited: each call holds a challenge in the database. */
export const POST: RequestHandler = async (event) => {
	const db = await getDb();
	if (!(await optionsRequests.hit(db, clientKey(event)))) {
		return json({ message: 'Too many tries. Wait a minute, then try again.' }, { status: 429 });
	}
	return json(await beginAuthentication(db, relyingPartyFrom(event.url)));
};
