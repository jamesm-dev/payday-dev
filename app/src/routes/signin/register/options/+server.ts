import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { clientKey, currentSessionId } from '#lib/server/auth/cookie.ts';
import { optionsRequests } from '#lib/server/auth/rateLimit.ts';
import { STEP_UP_MESSAGE } from '#lib/server/auth/stepUp.ts';
import { stepUpAllows } from '#lib/server/auth/stepUpGate.ts';
import { beginRegistration, relyingPartyFrom } from '#lib/server/auth/webauthn.ts';
import type { RequestHandler } from './$types';

/**
 * Adding a device that unlocks with its PIN, fingerprint or face (a passkey). Only a signed-in owner
 * may, and only just after confirming it is them (a password or passkey sign-in or confirmation,
 * or a recovery-code sign-in's window). The first registration is not here: it is the password form
 * on /signin. (/signin is public to the guard, so this endpoint does its own check.)
 */
export const POST: RequestHandler = async (event) => {
	const db = await getDb();
	if (!(await optionsRequests.hit(db, clientKey(event)))) {
		return json({ message: 'Too many tries. Wait a minute, then try again.' }, { status: 429 });
	}
	const sessionId = currentSessionId(event.cookies, event.url);
	if (event.locals.ownerId === null || sessionId === null) {
		return json({ message: 'Registration is closed.' }, { status: 403 });
	}
	if (!(await stepUpAllows(db, event.cookies, event.url, 'add-passkey'))) {
		return json({ message: STEP_UP_MESSAGE, needsStepUp: true }, { status: 403 });
	}
	// Bound to this session, so a challenge another session fetched cannot be answered here.
	return json(
		await beginRegistration(
			db,
			relyingPartyFrom(event.url),
			'add-passkey',
			event.locals.ownerId,
			sessionId
		)
	);
};
