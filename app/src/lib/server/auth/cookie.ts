import type { Cookies } from '@sveltejs/kit';
import type { Db } from '#lib/server/db/open.ts';
import { getPasswordHash } from './password.ts';
import { createSession, SECURE_SESSION_COOKIE, SESSION_COOKIE } from './session.ts';
import { stepUps } from './stepUp.ts';
import { sha256Hex } from './tokens.ts';

type CookieContext = { cookies: Cookies; url: URL; request: Request };

const isSecure = (url: URL) => url.protocol === 'https:';

/**
 * Over https the cookie is `__Host-session`, which a browser accepts only as Secure, Path=/ and
 * without a Domain, so no sibling subdomain can plant or overwrite it. Over plain http (development,
 * the test server) it is `session`: a `__Host-` cookie cannot exist there. Reading looks for exactly
 * the name this request would have been given, so an http-era `session` cookie is not honoured over https.
 */
export const sessionCookieName = (url: URL) =>
	isSecure(url) ? SECURE_SESSION_COOKIE : SESSION_COOKIE;

export const readSessionToken = (cookies: Cookies, url: URL) => cookies.get(sessionCookieName(url));

/** The id the session is stored under: the hash of the cookie's token. */
export const currentSessionId = (cookies: Cookies, url: URL): string | null => {
	const token = readSessionToken(cookies, url);
	return token ? sha256Hex(token) : null;
};

/**
 * HttpOnly so no script can read it, SameSite=Lax so a cross-site POST does not carry it, and
 * Secure whenever the request came over https (always, in production: Fly terminates TLS, and
 * adapter-node builds `event.url` as https unless PROTOCOL_HEADER says otherwise).
 */
export function setSessionCookie(cookies: Cookies, url: URL, token: string, expiresAt: string) {
	cookies.set(sessionCookieName(url), token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure(url),
		expires: new Date(expiresAt)
	});
}

export const clearSessionCookie = (cookies: Cookies, url: URL) =>
	cookies.delete(sessionCookieName(url), { path: '/', secure: isSecure(url) });

/**
 * How the owner proved who they are. A password, a passkey, or creating the account is a step-up;
 * a recovery code is not (it opens a 10-minute window to set a new password instead).
 */
export type SignInMethod = 'password' | 'passkey' | 'registration' | 'recovery';

/** Signs the owner in: a server session plus its cookie. */
export function startSession(
	db: Db,
	event: CookieContext,
	ownerId: number,
	method: SignInMethod
): void {
	const { token, expiresAt } = createSession(db, ownerId, event.request.headers.get('user-agent'));
	setSessionCookie(event.cookies, event.url, token, expiresAt);
	const sessionId = sha256Hex(token);
	if (method === 'recovery') stepUps.markRecoverySignIn(sessionId);
	else stepUps.markAssertion(sessionId);
}

/**
 * Starts a password sign-in session, but only if the owner's stored password is still exactly the
 * one the attempt was verified against. The check and the session are one synchronous turn inside
 * a transaction (better-sqlite3 is synchronous), so a change of password cannot land between them.
 * Returns false, starting nothing, when the password changed while the attempt waited its turn:
 * the old password must not open a session after the owner has replaced it.
 */
export function startPasswordSession(
	db: Db,
	event: CookieContext,
	ownerId: number,
	verifiedHash: string
): boolean {
	return db.transaction((tx) => {
		if (getPasswordHash(tx as unknown as Db, ownerId) !== verifiedHash) return false;
		startSession(tx as unknown as Db, event, ownerId, 'password');
		return true;
	});
}

/** The key failed attempts are counted under. */
export function clientKey(event: { getClientAddress: () => string }): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}
