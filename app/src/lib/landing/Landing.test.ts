/* TSK-cd259c The product page offers sign-up, or says it is full: a render test, since a browser run cannot reach 100 accounts. */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { MAX_ACCOUNTS } from '#lib/server/auth/signUp.ts';
import Landing from './Landing.svelte';

const html = (open: boolean) => render(Landing, { props: { open } }).body;
const links = (body: string, label: string) =>
	[...body.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>\s*([^<]*?)\s*<\/a>/g)].filter(
		(m) => m[2] === label
	);

describe('TSK-cd259c the product page and the cap on accounts', () => {
	it('offers "Create a free account" to /signin/new in the first screen and at the end, and "Sign in" beside it', () => {
		const body = html(true);
		const create = links(body, 'Create a free account');
		expect(create).toHaveLength(2);
		for (const link of create) expect(link[1]).toBe('/signin/new');
		const signIn = links(body, 'Sign in');
		expect(signIn).toHaveLength(3);
		for (const link of signIn) expect(link[1]).toBe('/signin');
		expect(body).toContain('Free. No bank login. Up to 100 people for now.');
		expect(body).not.toContain('not open yet');
	});

	it('says the number of people is the real cap', () => {
		expect(MAX_ACCOUNTS).toBe(100);
	});

	it('when sign-up is full, says so in plain words and offers "Sign in" only', () => {
		const body = html(false);
		expect(links(body, 'Create a free account')).toHaveLength(0);
		expect(body).not.toContain('/signin/new');
		expect(body).toContain(
			'Sign-up is full for now. If you already have an account, you can sign in.'
		);
		expect(body).not.toContain('Up to 100 people');
		const signIn = links(body, 'Sign in');
		expect(signIn.length).toBeGreaterThanOrEqual(2);
		for (const link of signIn) expect(link[1]).toBe('/signin');
	});
});
