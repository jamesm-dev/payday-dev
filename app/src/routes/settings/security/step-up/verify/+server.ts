import { json } from '@sveltejs/kit';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { clientKey, currentSessionId } from '#lib/server/auth/cookie.ts';
import { signInFailures } from '#lib/server/auth/rateLimit.ts';
import { stepUps } from '#lib/server/auth/stepUp.ts';
import { AuthError, finishAuthentication, relyingPartyFrom } from '#lib/server/auth/webauthn.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/** Checks a fresh, user-verified passkey assertion and records it against this session for 5 minutes. */
export const POST: RequestHandler = async (event) => {
	const sessionId = currentSessionId(event.cookies, event.url);
	if (event.locals.ownerId === null || !sessionId) {
		return json({ message: 'Sign in to continue.' }, { status: 401 });
	}
	const key = clientKey(event);
	if (signInFailures.isLimited(key)) {
		return json({ message: 'Too many tries. Wait a minute, then try again.' }, { status: 429 });
	}

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

	try {
		const ownerId = await finishAuthentication(
			getDb(),
			relyingPartyFrom(event.url),
			body.challengeId,
			body.response as AuthenticationResponseJSON,
			{ purpose: 'step-up', bound: sessionId }
		);
		if (ownerId !== event.locals.ownerId) throw new AuthError('That passkey is not yours.');
		stepUps.markAssertion(sessionId);
		return json({ ok: true });
	} catch (error) {
		signInFailures.recordFailure(key);
		const message =
			error instanceof AuthError ? error.message : 'That passkey could not be verified.';
		return json({ message }, { status: 400 });
	}
};
