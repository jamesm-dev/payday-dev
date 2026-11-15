import { PUBLIC_PAGES, publicUrl } from '#lib/site.ts';
import type { RequestHandler } from './$types';

/**
 * Built once, at build time, and served as a static file: no request ever runs the auth hook for it,
 * so it can never carry a session cookie with a public cache header.
 */
export const prerender = true;

/** Exactly the public pages. A private page is never listed: add to PUBLIC_PAGES only on purpose. */
export const GET: RequestHandler = () => {
	const urls = PUBLIC_PAGES.map((path) => `  <url><loc>${publicUrl(path)}</loc></url>`).join('\n');
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	// No cache-control: a prerendered file is served without this handler's headers, so the host's
	// own static-file caching applies. The content type only matters to `vite dev`.
	return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
