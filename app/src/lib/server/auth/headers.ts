/**
 * Headers set on every response. The Content-Security-Policy is not here: SvelteKit builds it
 * (the `csp` option in vite.config.ts) because it must carry a nonce or hash per page.
 */
export const SECURITY_HEADERS: Record<string, string> = {
	// Browsers ignore this over plain http, so it is safe to send always.
	'strict-transport-security': 'max-age=63072000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'same-origin',
	'x-frame-options': 'DENY',
	// Payday uses none of these. (Passkeys need publickey-credentials-*, which stay allowed.)
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

export function applySecurityHeaders(headers: Headers): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
}

/**
 * A page or data response for a signed-in owner is private and never kept, so Back after signing
 * out cannot show financial pages from the browser's back-forward cache. Only HTML and SvelteKit
 * data requests, and only when the route set no cache-control of its own.
 */
export function applyPrivateCache(
	headers: Headers,
	options: { signedIn: boolean; isDataRequest: boolean }
): void {
	if (!options.signedIn || headers.has('cache-control')) return;
	const html = (headers.get('content-type') ?? '').toLowerCase().includes('text/html');
	if (html || options.isDataRequest) headers.set('cache-control', 'private, no-store');
}
