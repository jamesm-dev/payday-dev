import { json } from '@sveltejs/kit';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { clientKey, currentSessionId } from '#lib/server/auth/cookie.ts';
import { failureBrake, waitForBrakes } from '#lib/server/auth/failureBrake.ts';
import { getOwnerEmail } from '#lib/server/auth/ownerEmail.ts';
import { beginPasskeyAttempt, TOO_MANY } from '#lib/server/auth/signInAttempt.ts';
import { accountKeyOf } from '#lib/server/auth/signInLookup.ts';
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
	const db = await getDb();
	// Wrong passkeys are counted after the answer, per address (a high threshold, so one person's
	// failures never turn away another on a shared address) and per account (a delay only).
	const accountKey = accountKeyOf(await getOwnerEmail(db, event.locals.ownerId));
	const attempt = await beginPasskeyAttempt(db, clientKey(event), accountKey);
	if (!attempt.ok) return json({ message: TOO_MANY }, { status: 429 });

	let success = false;
	try {
		const body: { challengeId?: unknown; response?: unknown } | null = await event.request
			.json()
			.catch(() => null);
		if (
			typeof body?.challengeId !== 'string' ||
			typeof body.response !== 'object' ||
			!body.response
		) {
			// Not an answer at all, so not a wrong one: nothing is counted.
			success = true;
			return json({ message: 'That request was not understood.' }, { status: 400 });
		}

		try {
			await waitForBrakes(db, accountKey, { site: failureBrake });
			const ownerId = await finishAuthentication(
				db,
				relyingPartyFrom(event.url),
				body.challengeId,
				body.response as AuthenticationResponseJSON,
				{ purpose: 'step-up', bound: sessionId }
			);
			if (ownerId !== event.locals.ownerId) throw new AuthError('That passkey is not yours.');
			await stepUps.markAssertion(db, sessionId);
			success = true;
			return json({ ok: true });
		} catch (error) {
			const message =
				error instanceof AuthError ? error.message : 'That passkey could not be verified.';
			return json({ message }, { status: 400 });
		}
	} finally {
		await attempt.done(success);
	}
};
