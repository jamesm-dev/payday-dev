import type { Cookies } from '@sveltejs/kit';
import { lockOwner } from '#lib/server/db/lock.ts';
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
 * Secure whenever the request came over https (always, in production: Netlify terminates TLS and
 * hands the function the https address; the browser tests' adapter-node server builds `event.url`
 * as https unless PROTOCOL_HEADER says otherwise).
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

/**
 * Signs the owner in: a server session plus its cookie. It runs under the owner lock and stops
 * (a 401) when the account is gone, so a passkey or recovery-code sign-in that was checked just
 * before the account was deleted leaves no session behind. When the caller already holds the lock
 * (a password sign-in) this takes it again inside the same transaction, which costs nothing and
 * cannot deadlock: the same transaction already owns the row.
 */
export function startSession(
	db: Db,
	event: CookieContext,
	ownerId: number,
	method: SignInMethod
): Promise<void> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const { token, expiresAt } = await createSession(
			tx,
			ownerId,
			event.request.headers.get('user-agent')
		);
		const sessionId = sha256Hex(token);
		if (method === 'recovery') await stepUps.markRecoverySignIn(tx, sessionId);
		else await stepUps.markAssertion(tx, sessionId);
		// The cookie last: nothing is set if the session could not be made.
		setSessionCookie(event.cookies, event.url, token, expiresAt);
	});
}

/**
 * Starts a password sign-in session, but only if the owner's stored password is still exactly the
 * one the attempt was verified against. The check and the session are one transaction under the
 * owner row lock, and a change of password takes the same lock, so a change of password cannot land
 * between them.
 * Returns false, starting nothing, when the password changed while the attempt waited its turn:
 * the old password must not open a session after the owner has replaced it.
 */
export function startPasswordSession(
	db: Db,
	event: CookieContext,
	ownerId: number,
	verifiedHash: string
): Promise<boolean> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		if ((await getPasswordHash(tx, ownerId)) !== verifiedHash) return false;
		await startSession(tx, event, ownerId, 'password');
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
