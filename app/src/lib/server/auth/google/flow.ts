import type { Cookies } from '@sveltejs/kit';
import type { Db } from '#lib/server/db/open.ts';
import { GOOGLE_FLOW_TTL_MS, GOOGLE_PURPOSES, saveChallenge, takeChallenge } from '../challenge.ts';
import { newToken, sha256Hex } from '../tokens.ts';

export type FlowPurpose = 'google-sign-in' | 'google-connect' | 'google-confirm';

/** What is kept between sending the person to Google and their coming back. */
export type FlowData = {
	codeVerifier: string;
	nonce: string;
	redirectUri: string;
	/** Where to go afterwards (a path on this site), or null. */
	next: string | null;
};

export const FLOW_COOKIE = 'google-flow';
export const SECURE_FLOW_COOKIE = '__Host-google-flow';

const isSecure = (url: URL) => url.protocol === 'https:';

/** `__Host-` over https (Secure, Path=/, no Domain), plain over http: see auth/cookie.ts. */
export const flowCookieName = (url: URL) => (isSecure(url) ? SECURE_FLOW_COOKIE : FLOW_COOKIE);

export const flowCookieOptions = (url: URL) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: isSecure(url),
	maxAge: GOOGLE_FLOW_TTL_MS / 1000
});

/** The binding a cookie value stands for: its hash, so the database never holds the value itself. */
export const flowBinding = (cookieValue: string): string => sha256Hex(cookieValue);

/** A fresh cookie value for a sign-in flow, and the binding the flow is stored under. */
export function newFlowCookie(): { value: string; binding: string } {
	const value = newToken();
	return { value, binding: flowBinding(value) };
}

export const setFlowCookie = (cookies: Cookies, url: URL, value: string) =>
	cookies.set(flowCookieName(url), value, flowCookieOptions(url));

/** The binding of the flow cookie this request carries, or null when it has none. */
export function readFlowBinding(cookies: Cookies, url: URL): string | null {
	const value = cookies.get(flowCookieName(url));
	return value ? flowBinding(value) : null;
}

export const clearFlowCookie = (cookies: Cookies, url: URL) =>
	cookies.delete(flowCookieName(url), { path: '/', secure: isSecure(url) });

/**
 * Stores a flow and returns its `state`. `binding` is the hash of the flow cookie for a sign-in, or
 * the session id for a connect or confirm.
 */
export async function startFlow(
	db: Db,
	purpose: FlowPurpose,
	binding: string,
	data: FlowData,
	now?: Date
): Promise<{ state: string }> {
	const state = await saveChallenge(db, purpose, JSON.stringify(data), now, binding);
	return { state };
}

/**
 * Takes the flow a `state` names. Single use; null when unknown, replayed, expired, or when
 * `binding` is not the one it was started with (another browser, another session).
 */
export async function takeFlow(
	db: Db,
	state: string,
	binding: string,
	now?: Date
): Promise<{ purpose: FlowPurpose; data: FlowData } | null> {
	const row = await takeChallenge(db, state, binding, now, GOOGLE_PURPOSES);
	if (!row) return null;
	const data = parse(row.challenge);
	return data ? { purpose: row.purpose as FlowPurpose, data } : null;
}

function parse(raw: string): FlowData | null {
	try {
		const v: unknown = JSON.parse(raw);
		if (typeof v !== 'object' || v === null) return null;
		const d = v as Record<string, unknown>;
		if (
			typeof d.codeVerifier !== 'string' ||
			typeof d.nonce !== 'string' ||
			typeof d.redirectUri !== 'string' ||
			(d.next !== null && typeof d.next !== 'string')
		) {
			return null;
		}
		return {
			codeVerifier: d.codeVerifier,
			nonce: d.nonce,
			redirectUri: d.redirectUri,
			next: d.next
		};
	} catch {
		return null;
	}
}
