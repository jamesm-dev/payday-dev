import { json } from '@sveltejs/kit';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { currentSessionId } from '#lib/server/auth/cookie.ts';
import { addPasskey, cleanNickname } from '#lib/server/auth/passkeys.ts';
import { sessionExists } from '#lib/server/auth/session.ts';
import { STEP_UP_MESSAGE } from '#lib/server/auth/stepUp.ts';
import { stepUpAllows } from '#lib/server/auth/stepUpGate.ts';
import { AuthError, finishRegistration, relyingPartyFrom } from '#lib/server/auth/webauthn.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

type Body = { challengeId?: unknown; response?: unknown; nickname?: unknown };

export const POST: RequestHandler = async (event) => {
	if (event.locals.ownerId === null) {
		return json({ message: 'Registration is closed.' }, { status: 403 });
	}
	if (!stepUpAllows(event.cookies, event.url, 'add-passkey')) {
		return json({ message: STEP_UP_MESSAGE, needsStepUp: true }, { status: 403 });
	}

	const body: Body | null = await event.request.json().catch(() => null);
	if (
		typeof body?.challengeId !== 'string' ||
		typeof body.response !== 'object' ||
		!body.response
	) {
		return json({ message: 'That request was not understood.' }, { status: 400 });
	}

	try {
		const fresh = await finishRegistration(
			relyingPartyFrom(event.url),
			'add-passkey',
			body.challengeId,
			body.response as RegistrationResponseJSON,
			cleanNickname(body.nickname)
		);
		// The verification above awaited: a password change may have ended this session meanwhile.
		// Check again, synchronously, right before the write, so an ended session adds nothing.
		const db = getDb();
		const sessionId = currentSessionId(event.cookies, event.url);
		if (!sessionId || !sessionExists(db, sessionId)) {
			return json(
				{ message: 'You were signed out. Sign in again, then try once more.' },
				{ status: 403 }
			);
		}
		addPasskey(db, event.locals.ownerId, fresh);
		return json({ ok: true });
	} catch (error) {
		if (error instanceof AuthError)
			return json({ message: error.message }, { status: error.status });
		return json({ message: 'That could not be saved. Please try again.' }, { status: 400 });
	}
};
