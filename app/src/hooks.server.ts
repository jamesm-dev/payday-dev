import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { LITESTREAM_METRICS_URL } from '$app/env/private';
import { watchBackups } from '#lib/server/backup.ts';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '#lib/server/auth/cookie.ts';
import { decideGuard } from '#lib/server/auth/guard.ts';
import { applyPrivateCache, applySecurityHeaders } from '#lib/server/auth/headers.ts';
import { checkSession } from '#lib/server/auth/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { reportError } from '#lib/server/errors.ts';
import { log } from '#lib/server/log.ts';
import { startReminders } from '#lib/server/reminders/webpush.ts';

/** Open and migrate the database before the first request, so a bad migration fails the boot. */
export const init: ServerInit = () => {
	// The build runs the server to prerender /offline; it must not need, or create, a database.
	if (building) return;
	getDb();
	watchBackups(LITESTREAM_METRICS_URL);
	log({ level: 'info', msg: 'database ready', backups: Boolean(LITESTREAM_METRICS_URL) });
	// An always-on timer in this process (ADR-0005: the machine never auto-stops).
	startReminders();
};

const requestId: Handle = async ({ event, resolve }) => {
	event.locals.requestId = crypto.randomUUID();
	const response = await resolve(event);
	response.headers.set('x-request-id', event.locals.requestId);
	return response;
};

/** Outermost after the id, so redirects and 401s carry the headers too. */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	applySecurityHeaders(response.headers);
	return response;
};

/** Reads the session cookie into `locals.ownerId`, then keeps out anyone without one. */
const auth: Handle = async ({ event, resolve }) => {
	event.locals.ownerId = null;
	// The build's prerender crawler requests pages anonymously, with no database. Nothing it renders
	// is kept unless the page opted in to prerendering, and the only such page is public.
	if (building) return resolve(event);

	const token = readSessionToken(event.cookies, event.url);
	if (token) {
		const check = checkSession(getDb(), token);
		if (check) {
			event.locals.ownerId = check.ownerId;
			// The expiry slid forward, so the cookie's must too.
			if (check.refreshedUntil)
				setSessionCookie(event.cookies, event.url, token, check.refreshedUntil);
		} else {
			clearSessionCookie(event.cookies, event.url);
		}
	}

	const decision = decideGuard({
		method: event.request.method,
		pathname: event.url.pathname,
		search: () => event.url.search,
		accept: event.request.headers.get('accept'),
		isDataRequest: event.isDataRequest,
		isRemoteRequest: event.isRemoteRequest,
		signedIn: event.locals.ownerId !== null
	});
	if (decision.action === 'redirect') {
		// SvelteKit's client cannot follow a 303 on a data request (`/__data.json`); it reads a JSON
		// body naming the redirect. SvelteKit would convert a 303 into that itself, but only after
		// `handle` returns, so the response would lose the security headers and request id
		// added around this hook. Building it here keeps them.
		if (event.isDataRequest) {
			return Response.json(
				{ type: 'redirect', status: 303, location: decision.location },
				{ headers: { 'cache-control': 'private, no-store' } }
			);
		}
		return new Response(null, { status: 303, headers: { location: decision.location } });
	}
	if (decision.action === 'unauthorized') {
		return Response.json({ message: 'Sign in to continue.' }, { status: 401 });
	}
	const response = await resolve(event);
	applyPrivateCache(response.headers, {
		signedIn: event.locals.ownerId !== null,
		isDataRequest: event.isDataRequest
	});
	return response;
};

export const handle: Handle = sequence(requestId, securityHeaders, auth);

export const handleError: HandleServerError = ({ kind, error, event }) =>
	reportError(
		{
			kind,
			error,
			requestId: event.locals.requestId ?? crypto.randomUUID(),
			method: event.request.method,
			path: event.url.pathname
		},
		log
	);
