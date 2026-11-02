const BASE = 'http://payday.invalid';

/**
 * Where to go after signing in: a same-origin path, or "/". Anything that could leave the site
 * (an absolute URL, a protocol-relative `//host`, a backslash trick, a dot-segment that collapses
 * into `//host`) falls back to "/".
 */
export function safeNext(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith('/') || raw.includes('\\') || /%5c/i.test(raw)) return '/';
	// Control characters (tabs and newlines are stripped by URL parsers, which turns `/\t/evil`
	// into `//evil`).
	for (const char of raw) {
		const code = char.charCodeAt(0);
		if (code < 0x20 || code === 0x7f) return '/';
	}
	let url: URL;
	try {
		url = new URL(raw, BASE);
	} catch {
		return '/';
	}
	if (url.origin !== BASE) return '/';
	// The parser has now resolved `.`, `..` and `%2e`. `/.//evil.example` becomes `//evil.example`,
	// which a browser reads as another host, so judge the normalised path, not the raw text.
	if (url.pathname.startsWith('//')) return '/';
	// Never bounce back to the sign-in page itself.
	if (url.pathname === '/signin' || url.pathname.startsWith('/signin/')) return '/';
	return url.pathname + url.search;
}
