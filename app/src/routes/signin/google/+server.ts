import { error } from '@sveltejs/kit';
import { clientKey } from '#lib/server/auth/cookie.ts';
import { googleFor } from '#lib/server/auth/google/complete.ts';
import { newFlowCookie, setFlowCookie, startFlow } from '#lib/server/auth/google/flow.ts';
import { authorizeUrl, newNonce, newPkce } from '#lib/server/auth/google/oidc.ts';
import { safeNext } from '#lib/server/auth/next.ts';
import { optionsRequests } from '#lib/server/auth/rateLimit.ts';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import type { RequestHandler } from './$types';

const see = (location: string, extra: Record<string, string> = {}) =>
	new Response(null, {
		status: 303,
		headers: { location, 'cache-control': 'no-store', ...extra }
	});

/**
 * Starts "Continue with Google" for signing in or signing up (ADR-0028). A GET on purpose: the
 * page's form-action 'self' blocks a form that redirects to another site, so the button is a plain
 * link. Starting changes nothing for the person: it only stores a short-lived flow. Off, or over
 * plain http on the hosted build, this does not exist (404).
 */
export const GET: RequestHandler = async (event) => {
	const config = googleFor(event.url);
	if (!config) error(404, 'Not found');

	const next = safeNext(event.url.searchParams.get('next'));
	// Someone already signed in has nothing to start.
	if (event.locals.ownerId !== null) return see(next);

	const db = await getDb();
	// Each start stores a row, and the table is shared with passkeys: the same ceiling their options have.
	if (!(await optionsRequests.hit(db, clientKey(event)))) {
		setFlash(event.cookies, 'google-too-many');
		return see('/signin');
	}

	const { codeVerifier, codeChallenge } = newPkce();
	const nonce = newNonce();
	const redirectUri = `${event.url.origin}/signin/google/callback`;
	const cookie = newFlowCookie();
	const { state } = await startFlow(db, 'google-sign-in', cookie.binding, {
		codeVerifier,
		nonce,
		redirectUri,
		next
	});
	setFlowCookie(event.cookies, event.url, cookie.value);
	return see(authorizeUrl(config, { state, nonce, codeChallenge, redirectUri }));
};
