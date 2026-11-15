import { expect, test } from './support/test.ts';
import { SIGNED_OUT } from './support/auth.ts';

/*
 * The public home page (Phase 8): what a visitor who is not signed in sees at "/". Read-only, so it
 * runs with the other read-only projects, at iPhone, Android and laptop sizes.
 */

const H1 = 'Know how much you can spend until payday';
const ORIGIN = 'https://payday-birc.netlify.app';

test.describe('TSK-04a739 a signed-out visitor at / gets the public home page', () => {
	test.use({ storageState: SIGNED_OUT });

	test('is a 200, not a redirect, and is never kept by a shared cache', async ({ request }) => {
		const response = await request.get('/', { headers: { accept: 'text/html' }, maxRedirects: 0 });
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		expect(response.headers()['vary']).toMatch(/cookie/i);
		expect(await response.text()).toContain(H1);
	});

	test('TSK-5dab69 shows the words and a Sign in button that goes to /signin', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('heading', { level: 1, name: H1 })).toBeVisible();
		const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
		await expect(signIn).toHaveAttribute('href', '/signin');
		await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'What Payday does for you' })).toBeVisible();
		await expect(page.locator('ol li')).toHaveCount(3);
		await expect(page.getByText('It is free.')).toBeVisible();
		await expect(page.getByText('There are no ads, and your data is not sold.')).toBeVisible();
		await expect(page.getByRole('navigation')).toHaveCount(0);

		await signIn.click();
		await expect(page).toHaveURL(/\/signin$/);
		await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
	});

	test('TSK-499c09 says accounts are not open, and never offers a sign-up', async ({ page }) => {
		await page.goto('/');
		await expect(
			page.getByText('Right now, Payday has one user. Accounts for new people are not open yet.')
		).toBeVisible();
		const text = (await page.locator('body').innerText()).toLowerCase();
		for (const word of ['sign up', 'signup', 'register', 'create an account', 'join']) {
			expect(text, word).not.toContain(word);
		}
		await expect(page.getByRole('link', { name: /sign up|register|create/i })).toHaveCount(0);
		await expect(page.getByRole('button')).toHaveCount(0);
	});

	test('TSK-d572c8 carries the title, description, canonical and Open Graph tags', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle('Payday: know how much you can spend until payday');
		const meta = (selector: string) => page.locator(selector).getAttribute('content');
		expect(await meta('meta[name="description"]')).toContain('free, simple app');
		expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${ORIGIN}/`);
		expect(await meta('meta[property="og:type"]')).toBe('website');
		expect(await meta('meta[property="og:url"]')).toBe(`${ORIGIN}/`);
		expect(await meta('meta[property="og:title"]')).toBeTruthy();
		expect(await meta('meta[property="og:description"]')).toBeTruthy();
		expect(await meta('meta[property="og:image"]')).toBe(`${ORIGIN}/icon-512.png`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
	});

	test('TSK-d572c8 /signin may be indexed and has its own tags', async ({ page }) => {
		await page.goto('/signin');
		await expect(page).toHaveTitle('Sign in · Payday');
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
		expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(
			`${ORIGIN}/signin`
		);
		expect(await page.locator('meta[name="description"]').getAttribute('content')).toContain(
			'Sign in to Payday'
		);
		expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe(
			`${ORIGIN}/icon-512.png`
		);
	});

	test('TSK-d572c8 the sitemap lists only the public pages, and robots.txt points to it', async ({
		request
	}) => {
		const sitemap = await request.get('/sitemap.xml');
		expect(sitemap.status()).toBe(200);
		// A prerendered static file: the server names it by its extension (text/xml); Netlify uses application/xml.
		expect(sitemap.headers()['content-type']).toMatch(/xml/);
		const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
		expect(locs).toEqual([`${ORIGIN}/`, `${ORIGIN}/signin`]);
		const robots = await (await request.get('/robots.txt')).text();
		expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
	});

	test('TSK-2c985a has no sideways scroll at 375px wide', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1, name: H1 })).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});

test.describe('TSK-2c985a the public home page reads without JavaScript', () => {
	test.use({ storageState: SIGNED_OUT, javaScriptEnabled: false });

	test('shows every section and a working Sign in link', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1, name: H1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
		await expect(page.getByText('Accounts for new people are not open yet.')).toBeVisible();
		await page.getByRole('link', { name: 'Sign in', exact: true }).click();
		await expect(page).toHaveURL(/\/signin$/);
	});
});

test.describe('TSK-04a739 a signed-in owner at / still gets the number', () => {
	test('shows the home screen, not the public page', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		await expect(page.getByRole('heading', { name: H1 })).toHaveCount(0);
	});

	test('is private and never kept', async ({ request }) => {
		const response = await request.get('/', { headers: { accept: 'text/html' } });
		expect(response.headers()['cache-control']).toBe('private, no-store');
	});
});
