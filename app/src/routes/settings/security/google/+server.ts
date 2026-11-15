import { error } from '@sveltejs/kit';
import { clientKey, currentSessionId } from '#lib/server/auth/cookie.ts';
import { googleFor } from '#lib/server/auth/google/complete.ts';
import { startFlow } from '#lib/server/auth/google/flow.ts';
import { authorizeUrl, newNonce, newPkce } from '#lib/server/auth/google/oidc.ts';
import { safeNext } from '#lib/server/auth/next.ts';
import { optionsRequests } from '#lib/server/auth/rateLimit.ts';
import { stepUps } from '#lib/server/auth/stepUp.ts';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import type { RequestHandler } from './$types';

const see = (location: string) =>
	new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

/**
 * Starts connecting Google to this account, or confirming it is you with Google (ADR-0028). A GET on
 * purpose: the page's form-action 'self' blocks a form that redirects to another site, so the
 * button is a plain link. The flow is bound to this session, so only this session can finish it.
 * Starting changes nothing for the person. Off, this does not exist (404).
 */
export const GET: RequestHandler = async (event) => {
	const config = googleFor(event.url);
	if (!config) error(404, 'Not found');
	if (event.locals.ownerId === null) return see('/signin');

	const intent = event.url.searchParams.get('intent');
	if (intent !== 'connect' && intent !== 'confirm') error(400, 'Unknown request');

	const db = await getDb();
	const sessionId = currentSessionId(event.cookies, event.url);
	if (!sessionId) return see('/signin');

	// Connecting adds a way into the account, so it needs a fresh confirmation first.
	if (intent === 'connect' && !(await stepUps.allows(db, sessionId, 'connect-google'))) {
		setFlash(event.cookies, 'google-confirm-first');
		return see('/settings/security#confirm');
	}

	// Each start stores a row, and the table is shared with passkeys: the same ceiling their options have.
	if (!(await optionsRequests.hit(db, clientKey(event)))) {
		setFlash(event.cookies, 'google-too-many');
		return see('/settings/security');
	}

	const { codeVerifier, codeChallenge } = newPkce();
	const nonce = newNonce();
	const redirectUri = `${event.url.origin}/signin/google/callback`;
	const { state } = await startFlow(
		db,
		intent === 'connect' ? 'google-connect' : 'google-confirm',
		sessionId,
		{ codeVerifier, nonce, redirectUri, next: safeNext(event.url.searchParams.get('next')) }
	);
	return see(authorizeUrl(config, { state, nonce, codeChallenge, redirectUri }));
};
