import { describe, expect, it } from 'vitest';
import { GET } from './+server.ts';

describe('TSK-d572c8 the sitemap lists the public pages and nothing else', () => {
	it('is XML with exactly / and /signin, as absolute addresses', async () => {
		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.headers.get('content-type')).toContain('application/xml');
		// Served as a prerendered file, so no header of this handler reaches anyone: it sets none to cache.
		expect(response.headers.get('cache-control')).toBeNull();
		const body = await response.text();
		expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
		const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
		expect(locs).toEqual([
			'https://payday-birc.netlify.app/',
			'https://payday-birc.netlify.app/signin'
		]);
	});

	it('robots.txt allows crawling and points at the sitemap', async () => {
		const { readFileSync } = await import('node:fs');
		const robots = readFileSync(new URL('../../../static/robots.txt', import.meta.url), 'utf8');
		expect(robots).toMatch(/^Disallow:\s*$/m);
		expect(robots).toContain('Sitemap: https://payday-birc.netlify.app/sitemap.xml');
	});
});
