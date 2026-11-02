import { safeNext } from './next.ts';

/**
 * The paths a visitor without a session may reach. Everything else is protected by default, so a
 * new route is private until someone lists it here on purpose (guard.test.ts enforces it).
 */
const PUBLIC_EXACT = new Set([
	'/health',
	'/offline',
	'/manifest.webmanifest',
	'/robots.txt',
	'/service-worker.js',
	// SvelteKit's version poll and runtime env script. NOT all of /_app: remote functions are served
	// from /_app/remote/*, and those run server code.
	'/_app/version.json',
	'/_app/env.js',
	'/apple-touch-icon.png',
	'/icon-192.png',
	'/icon-512.png',
	'/icon-maskable-512.png'
]);

const PUBLIC_PREFIXES = [
	// The sign-in page and the endpoints it calls. Each endpoint does its own check.
	'/signin',
	// SvelteKit's built, hashed files.
	'/_app/immutable',
	// The dev-only dashboard keeps its own gate: in production every request there is a 404
	// (assertDev), so it exposes nothing, and in development it is the developer's own tool.
	'/management'
];

export function isPublicPath(pathname: string): boolean {
	if (PUBLIC_EXACT.has(pathname)) return true;
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type GuardRequest = {
	method: string;
	pathname: string;
	/** A function because SvelteKit throws when a prerendered page reads url.search. */
	search: () => string;
	accept: string | null;
	isDataRequest: boolean;
	/**
	 * A remote function call. SvelteKit strips its internal URL, so `pathname` is the page that made
	 * the call (possibly a public one) and says nothing about what is being run.
	 */
	isRemoteRequest: boolean;
	signedIn: boolean;
};

export type GuardDecision =
	{ action: 'allow' } | { action: 'redirect'; location: string } | { action: 'unauthorized' };

/**
 * A page request (GET or HEAD asking for HTML, or SvelteKit's own data fetch) is sent to sign in,
 * with a way back. Anything else, a write or an endpoint, is refused with 401: a fetch has no use
 * for a login page.
 */
export function decideGuard(req: GuardRequest): GuardDecision {
	if (req.signedIn) return { action: 'allow' };
	// Before the public-path test: a remote call made from /signin must not inherit its openness.
	if (req.isRemoteRequest) return { action: 'unauthorized' };
	if (isPublicPath(req.pathname)) return { action: 'allow' };
	const isRead = req.method === 'GET' || req.method === 'HEAD';
	if (isRead && (req.isDataRequest || req.accept?.includes('text/html'))) {
		// For a data request SvelteKit has already stripped `/__data.json` from the pathname.
		const next = safeNext(req.pathname + req.search());
		return { action: 'redirect', location: `/signin?next=${encodeURIComponent(next)}` };
	}
	return { action: 'unauthorized' };
}
