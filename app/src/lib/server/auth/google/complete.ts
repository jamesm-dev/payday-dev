import type { Cookies } from '@sveltejs/kit';
import { loggable } from '#lib/server/errors.ts';
import { setFlash, type FlashId } from '#lib/server/flash.ts';
import { log } from '#lib/server/log.ts';
import type { Db } from '#lib/server/db/open.ts';
import { clientKey, currentSessionId, readSessionToken, startSession } from '../cookie.ts';
import { safeNext } from '../next.ts';
import { newRecoveryCodes } from '../oneTimeSlot.ts';
import type { SlotLimiter } from '../rateLimit.ts';
import { beginSignInAttempt, type SignInDeps } from '../signInAttempt.ts';
import type { SignUpLimits } from '../signUp.ts';
import { stepUps } from '../stepUp.ts';
import {
	confirmWithGoogle,
	connectGoogle,
	signInWithGoogle,
	type GoogleRefusal
} from './accounts.ts';
import { googleConfig, type GoogleConfig } from './config.ts';
import { clearFlowCookie, readFlowBinding, takeFlow } from './flow.ts';
import { exchangeCode, OidcError, verifyIdToken } from './oidc.ts';

/*
 * What happens when Google sends the person back (ADR-0028). One callback serves three intents,
 * told apart by the flow row's purpose: sign in (or sign up), connect, and confirm.
 *
 * Nothing here puts the account id, the email, the code or a token in a flash, a page or a log: a
 * refusal is a flash id with fixed words, and an error is logged by its fixed reason alone.
 */

const hosted = typeof __PAYDAY_HOSTED__ !== 'undefined' && __PAYDAY_HOSTED__;

/**
 * The configuration for this request, or null when Google must not answer: it is switched off, or
 * the hosted build was reached over plain http (Google is offered only over https there; local and
 * test builds may use http).
 */
export function googleFor(
	url: URL,
	config: GoogleConfig | null = googleConfig(),
	isHosted = hosted
): GoogleConfig | null {
	if (!config) return null;
	if (isHosted && url.protocol !== 'https:') return null;
	return config;
}

/** Fixed words for each way a newcomer's sign-up can be refused. */
const REFUSAL_FLASH: Record<GoogleRefusal['reason'], FlashId> = {
	full: 'google-full',
	closed: 'google-closed',
	invalid: 'google-failed',
	'email-exists': 'google-email-exists',
	limit: 'google-limit',
	busy: 'google-busy'
};

/** The sign-in door takes no hash-queue place: Google's callback hashes nothing. */
const noQueue: SlotLimiter = { acquire: async () => async () => {}, size: async () => 0 };

export type GoogleCallbackEvent = {
	cookies: Cookies;
	url: URL;
	request: Request;
	getClientAddress: () => string;
	locals: { ownerId: number | null };
};

export type CompleteOptions = {
	fetchFn?: typeof fetch;
	now?: Date;
	signUpLimits?: SignUpLimits;
	attemptDeps?: SignInDeps;
};

type Outcome = { ok: boolean; location: string };

/**
 * Finishes a Google round trip and returns where to send the person (always a path on this site).
 * The caller answers with a 303 to it, so the code leaves the address bar.
 *
 * Refused, each with a plain flash: a missing, expired, replayed or foreign flow, Google's own
 * `error`, a token that does not check out, and every sign-up refusal. Only a failure of a real flow
 * counts against the address's sign-in failure limit (an attempt that works gives its place back);
 * a request that names no flow touches no limit at all.
 *
 * Which binding opens the flow: a signed-out request carries the flow cookie (sign-in); a signed-in
 * one is a connect or a confirm, bound to its session. The start endpoint sends a signed-in person
 * away, so a sign-in flow never starts signed in.
 */
export async function completeGoogleCallback(
	db: Db,
	event: GoogleCallbackEvent,
	config: GoogleConfig,
	options: CompleteOptions = {}
): Promise<string> {
	const { cookies, url } = event;
	const now = options.now ?? new Date();
	const ownerId = event.locals.ownerId;
	const binding = ownerId === null ? readFlowBinding(cookies, url) : currentSessionId(cookies, url);
	// Done with the cookie whatever happens.
	clearFlowCookie(cookies, url);

	const flash = (id: FlashId, location: string): Outcome => {
		setFlash(cookies, id);
		return { ok: false, location };
	};
	const signedOutHome = '/signin';
	const settings = '/settings/security';

	const home = ownerId === null ? signedOutHome : settings;
	const state = url.searchParams.get('state') ?? '';

	// This is a public GET: any web page can make a visitor's browser fetch it. A request that names
	// no real flow costs nothing, so it cannot be used to push an address over the failure limit.
	if (!state || !binding) {
		setFlash(cookies, 'google-expired');
		return home;
	}
	const flow = await takeFlow(db, state, binding, now);
	if (!flow) {
		setFlash(cookies, 'google-expired');
		return home;
	}

	// A real flow: from here a failure counts against the address (a good sign-in gives its place back).
	const attempt = await beginSignInAttempt(db, clientKey(event), null, {
		queue: noQueue,
		...options.attemptDeps
	});
	if (!attempt.ok) {
		setFlash(cookies, attempt.reason === 'busy' ? 'google-busy' : 'google-too-many');
		return home;
	}

	let outcome: Outcome = { ok: false, location: home };
	try {
		outcome = await run(flow);
	} catch (error) {
		if (error instanceof OidcError) {
			log({ level: 'warn', msg: 'google sign-in refused', reason: error.reason });
		} else {
			log({ level: 'error', msg: 'google sign-in failed', error: loggable(error).message });
		}
		outcome = flash('google-failed', outcome.location);
	} finally {
		await attempt.done(outcome.ok);
	}
	return outcome.location;

	async function run(flow: NonNullable<Awaited<ReturnType<typeof takeFlow>>>): Promise<Outcome> {
		const params = url.searchParams;
		const code = params.get('code') ?? '';
		const isSignIn = flow.purpose === 'google-sign-in';
		const back = isSignIn ? signedOutHome : settings;
		// The flow and the request must agree on who is asking.
		if (isSignIn !== (ownerId === null)) return flash('google-expired', home);

		const error = params.get('error');
		if (error) return flash(error === 'access_denied' ? 'google-cancelled' : 'google-failed', back);
		if (!code) return flash('google-failed', back);
		// It must come back on exactly the address it was sent from.
		if (url.origin + url.pathname !== flow.data.redirectUri) return flash('google-failed', back);

		const idToken = await exchangeCode(
			config,
			{ code, codeVerifier: flow.data.codeVerifier, redirectUri: flow.data.redirectUri },
			options.fetchFn
		);
		const identity = verifyIdToken(config, idToken, { nonce: flow.data.nonce, now });

		if (isSignIn) {
			const result = await signInWithGoogle(
				db,
				identity,
				clientKey(event),
				now,
				options.signUpLimits
			);
			if (!result.ok) return flash(REFUSAL_FLASH[result.reason], back);
			await startSession(db, event, result.ownerId, 'google');
			if (result.created) {
				// The one place the codes exist in plain text: sealed to the new session, shown once.
				const token = readSessionToken(cookies, url);
				if (!token) throw new Error('the new session has no cookie');
				await newRecoveryCodes.put(db, token, result.recoveryCodes, now.getTime());
				return { ok: true, location: '/signin/new' };
			}
			return { ok: true, location: safeNext(flow.data.next) };
		}

		// Connect and confirm: a session is certain here (the binding was its id).
		const sessionId = currentSessionId(cookies, url);
		if (ownerId === null || !sessionId) return flash('google-expired', home);

		if (flow.purpose === 'google-connect') {
			if (!(await stepUps.allows(db, sessionId, 'connect-google', now.getTime()))) {
				return flash('google-confirm-first', settings);
			}
			const connected = await connectGoogle(db, ownerId, identity);
			if (connected === 'sub-taken') return flash('google-taken', settings);
			if (connected === 'other-google') return flash('google-other', settings);
			setFlash(cookies, 'google-connected');
			return { ok: true, location: settings };
		}

		// google-confirm
		if (!(await confirmWithGoogle(db, ownerId, identity.sub))) {
			return flash('google-wrong-account', settings);
		}
		await stepUps.markGoogleConfirmation(db, sessionId, now.getTime());
		setFlash(cookies, 'google-confirmed');
		const next = flow.data.next === null ? '/' : safeNext(flow.data.next);
		return { ok: true, location: next === '/' ? settings : next };
	}
}
