import { json } from '@sveltejs/kit';
import { clientKey, currentSessionId } from '#lib/server/auth/cookie.ts';
import { optionsRequests } from '#lib/server/auth/rateLimit.ts';
import { beginAuthentication, relyingPartyFrom } from '#lib/server/auth/webauthn.ts';
import type { RequestHandler } from './$types';

/** A signed-in owner asking to prove, with a passkey, that they are at the keyboard. */
export const POST: RequestHandler = async (event) => {
	const sessionId = currentSessionId(event.cookies, event.url);
	if (event.locals.ownerId === null || !sessionId) {
		return json({ message: 'Sign in to continue.' }, { status: 401 });
	}
	if (!optionsRequests.hit(clientKey(event))) {
		return json({ message: 'Too many tries. Wait a minute, then try again.' }, { status: 429 });
	}
	// Bound to this session, so a challenge another session fetched cannot be answered here.
	return json(await beginAuthentication(relyingPartyFrom(event.url), 'step-up', sessionId));
};
