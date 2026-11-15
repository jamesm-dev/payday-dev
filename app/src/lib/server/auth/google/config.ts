import { log } from '#lib/server/log.ts';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TEST_PROVIDER } from '$app/env/private';

/** What the Google flow needs, or null when Google sign-in is switched off. */
export type GoogleConfig = {
	clientId: string;
	clientSecret: string;
	authorizeUrl: string;
	tokenUrl: string;
	/** The values the ID token's `iss` may have. */
	issuers: string[];
};

export type GoogleValues = {
	clientId?: string | undefined;
	clientSecret?: string | undefined;
	testProvider?: string | undefined;
};

const GOOGLE = {
	authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	issuers: ['https://accounts.google.com', 'accounts.google.com']
};

/** http://127.0.0.1:<port> or http://localhost:<port>, nothing after the port. */
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}\/?$/;

let warnedInsecureTls = false;
/** For tests: forgets that the warning was given. */
export const resetInsecureTlsWarning = () => {
	warnedInsecureTls = false;
};

/**
 * Null while either the client id or the secret is empty (after trimming): Google is switched off.
 * A test provider replaces Google's three constants only when the build is not hosted, and only if
 * it is a loopback address; anything else throws. A hosted build ignores it entirely.
 */
export function resolveGoogleConfig(
	values: GoogleValues,
	hosted: boolean,
	env: Record<string, string | undefined> = process.env
): GoogleConfig | null {
	const clientId = values.clientId?.trim() ?? '';
	const clientSecret = values.clientSecret?.trim() ?? '';
	if (!clientId || !clientSecret) return null;
	// The ID token is trusted because it came over TLS from Google (oidc.ts). If Node is told to
	// skip certificate checks (a debugging setting), that trust is gone: Google stays off.
	if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
		if (!warnedInsecureTls) {
			warnedInsecureTls = true;
			log({
				level: 'warn',
				msg: 'Google sign-in is switched off because NODE_TLS_REJECT_UNAUTHORIZED is 0, which turns off certificate checks. Remove that setting to use it.'
			});
		}
		return null;
	}

	const provider = hosted ? '' : (values.testProvider?.trim() ?? '');
	if (!provider) return { clientId, clientSecret, ...GOOGLE, issuers: [...GOOGLE.issuers] };

	if (!LOOPBACK.test(provider)) {
		throw new Error(
			'GOOGLE_TEST_PROVIDER must be http://127.0.0.1:<port> or http://localhost:<port>. It is for browser tests only.'
		);
	}
	const origin = provider.replace(/\/$/, '');
	return {
		clientId,
		clientSecret,
		authorizeUrl: `${origin}/authorize`,
		tokenUrl: `${origin}/token`,
		issuers: [origin]
	};
}

/**
 * True in the production build for Netlify (vite.config.ts defines it). Written so the bundler folds
 * it to a constant and drops the test provider from that bundle. See db/open.ts.
 */
const hosted = typeof __PAYDAY_HOSTED__ !== 'undefined' && __PAYDAY_HOSTED__;

/** The live configuration, read from the environment. Null while Google sign-in is off. */
export function googleConfig(): GoogleConfig | null {
	return resolveGoogleConfig(
		{
			clientId: GOOGLE_CLIENT_ID,
			clientSecret: GOOGLE_CLIENT_SECRET,
			testProvider: hosted ? undefined : GOOGLE_TEST_PROVIDER
		},
		hosted
	);
}
