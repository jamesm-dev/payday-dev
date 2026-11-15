import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const env = vi.hoisted(() => ({ id: '', secret: '' }));
vi.mock('$app/env/private', () => ({
	get GOOGLE_CLIENT_ID() {
		return env.id;
	},
	get GOOGLE_CLIENT_SECRET() {
		return env.secret;
	},
	GOOGLE_TEST_PROVIDER: undefined
}));

const { load } = await import('./+page.server.ts');
const { default: Page } = await import('./+page.svelte');

type LoadEvent = Parameters<typeof load>[0];
const run = () => load({} as LoadEvent) as unknown as { google: boolean };
const html = (google: boolean) =>
	render(Page, { props: { data: { google, nav: false, flash: null, signedIn: false } } }).body;

beforeEach(() => {
	env.id = '';
	env.secret = '';
});

describe('TSK-c3b872 the privacy notice follows the Google switch', () => {
	it('says off while Google is off or half set', () => {
		expect(run()).toEqual({ google: false });
		env.id = 'id';
		expect(run()).toEqual({ google: false });
	});

	it('says on only with both values, and carries neither of them', () => {
		env.id = 'the-client-id';
		env.secret = 'the-client-secret';
		expect(run()).toEqual({ google: true });
	});

	it('off: no word Google anywhere in the page', () => {
		expect(html(false)).not.toMatch(/google/i);
	});

	it('off: the page is the on page without the Google paragraph', () => {
		const on = html(true);
		const off = html(false);
		expect(on).toContain('Continue with Google');
		const bare = (text: string) => text.replace(/<!--.*?-->/g, '');
		const stripped = bare(on).replace(
			/<h2[^>]*>Continue with Google<\/h2>\s*<p[^>]*>[\s\S]*?<\/p>/,
			''
		);
		expect(stripped).not.toBe(bare(on));
		expect(stripped).toBe(bare(off));
	});

	it('on: the paragraph says what Google sends, the cookie, disconnecting and deleting', () => {
		const on = html(true).replace(/\s+/g, ' ');
		expect(on).toContain('only your Google account number and your email address');
		expect(on).toContain('short cookie');
		expect(on).toContain('disconnect Google in Settings › Security');
		expect(on).toContain('delete your account');
	});
});
