import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '#lib/server/auth/cookie.ts';
import { decideGuard } from '#lib/server/auth/guard.ts';
import { applyPrivateCache, applySecurityHeaders } from '#lib/server/auth/headers.ts';
import { checkSession } from '#lib/server/auth/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import {
	DATABASE_UNREACHABLE_MESSAGE,
	isDatabaseUnreachable,
	loggable,
	reportError
} from '#lib/server/errors.ts';
import { log } from '#lib/server/log.ts';

/**
 * Open the database before the first request, so a bad address fails the boot. An in-process
 * database (development, tests) is migrated as it opens; a real Postgres is NOT: its migrations ran
 * in the deploy's build (`pnpm db:migrate`, ADR-0015), never on a request or a boot.
 */
export const init: ServerInit = async () => {
	// The build runs the server to prerender /offline; it must not need, or create, a database.
	if (building) return;
	await getDb();
	log({ level: 'info', msg: 'database ready' });
};

/**
 * The answer when the database cannot be reached. Built here, not thrown as an error, so it still
 * passes through the headers and request id added around this hook. Plain words, no styling (the
 * strict CSP allows no inline style); never the address or the driver's message.
 */
function databaseUnreachable(accept: string | null): Response {
	const headers = { 'cache-control': 'no-store' };
	if (accept?.includes('text/html')) {
		return new Response(
			`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>503 · Payday</title></head><body><main><h1>Payday can't reach its database</h1><p>${DATABASE_UNREACHABLE_MESSAGE}</p></main></body></html>`,
			{ status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } }
		);
	}
	return Response.json({ message: DATABASE_UNREACHABLE_MESSAGE }, { status: 503, headers });
}

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
		let check;
		try {
			check = await checkSession(await getDb(), token);
		} catch (failure) {
			// A paused or unreachable database gets a plain 503 answer. Anything else is an ordinary 500.
			if (!isDatabaseUnreachable(failure)) throw failure;
			log({
				level: 'error',
				msg: 'database unreachable',
				requestId: event.locals.requestId,
				error: loggable(failure).message
			});
			return databaseUnreachable(event.request.headers.get('accept'));
		}
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
