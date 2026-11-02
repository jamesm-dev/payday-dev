import { json } from '@sveltejs/kit';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { startSession } from '#lib/server/auth/cookie.ts';
import { AuthError, finishAuthentication, relyingPartyFrom } from '#lib/server/auth/webauthn.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/*
 * Deliberately NOT on the password guess limiter (`signInFailures`): a passkey cannot be guessed,
 * and every attempt needs a single-use challenge, whose issue is already rate-limited per address
 * by the options endpoint. Sharing the limiter let anyone on the owner's network lock out passkey
 * sign-in too, just by failing passwords.
 */
export const POST: RequestHandler = async (event) => {
	const body: { challengeId?: unknown; response?: unknown } | null = await event.request
		.json()
		.catch(() => null);
	if (
		typeof body?.challengeId !== 'string' ||
		typeof body.response !== 'object' ||
		!body.response
	) {
		return json({ message: 'That request was not understood.' }, { status: 400 });
	}

	const db = getDb();
	try {
		const ownerId = await finishAuthentication(
			db,
			relyingPartyFrom(event.url),
			body.challengeId,
			body.response as AuthenticationResponseJSON
		);
		startSession(db, event, ownerId, 'passkey');
		return json({ ok: true });
	} catch (error) {
		const message =
			error instanceof AuthError ? error.message : 'That passkey could not be verified.';
		return json({ message }, { status: 400 });
	}
};
