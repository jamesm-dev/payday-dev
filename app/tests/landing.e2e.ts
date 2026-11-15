import { expect, test, type Page } from './support/test.ts';
import { SIGNED_OUT } from './support/auth.ts';
import { EXAMPLE, exampleNumber } from '../src/lib/landing/example.ts';
import { moneyText } from '../src/lib/format.ts';

/*
 * The product page (Phase 10, replacing Phase 8's plain page at the same address): what a visitor
 * who is not signed in sees at "/". Read-only, so it runs with the other read-only projects, at
 * iPhone, Android and laptop sizes. Accounts for new people are not open yet (Phase 9), so its
 * button is "Sign in".
 */

const H1 = 'Know how much you can spend until payday';
const TITLE = 'Payday: a free budget app to know what you can spend until payday';
const ORIGIN = 'https://payday-birc.netlify.app';
const pesos = (n: number) => moneyText(n, EXAMPLE.currency);

/** Moves a slider as a drag would: the value changes and an input event fires. */
async function slide(page: Page, label: RegExp, value: number) {
	await page.getByLabel(label).evaluate((el: HTMLInputElement, to) => {
		el.value = String(to);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
}

/** The page's words, as a visitor reads them (every FAQ answer opened). */
async function pageText(page: Page) {
	for (const details of await page.locator('details').all()) {
		await details.evaluate((el: HTMLDetailsElement) => (el.open = true));
	}
	return page.locator('body').innerText();
}

test.describe('TSK-04a739 a signed-out visitor at / gets the product page', () => {
	test.use({ storageState: SIGNED_OUT });

	test('is a 200, not a redirect, and is never kept by a shared cache', async ({ request }) => {
		const response = await request.get('/', { headers: { accept: 'text/html' }, maxRedirects: 0 });
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		expect(response.headers()['vary']).toMatch(/cookie/i);
		expect(await response.text()).toContain(H1);
	});

	test('TSK-c7fcd1 the first screen has the name, the promise and the button; then every section, and the button again', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('heading', { level: 1, name: H1 })).toBeVisible();
		await expect(page.getByText('A free budget app. Not a loan.')).toBeVisible();
		await expect(page.locator('.brand')).toContainText('Payday');

		// The sections, in order.
		const headings = await page.getByRole('heading', { level: 2 }).allInnerTexts();
		expect(headings).toEqual([
			'Payday is not a loan',
			'See how your number works',
			'How it works',
			'What Payday does for you',
			'See the app',
			'Questions people ask',
			'Plan your money before payday'
		]);
		await expect(page.locator('ol.steps > li')).toHaveCount(3);
		await expect(page.locator('ul.features > li')).toHaveCount(6);
		for (const question of ['Is Payday a loan?', 'Is it free?', 'Who sees my money?']) {
			await expect(page.locator('summary', { hasText: question })).toBeVisible();
		}

		// "Sign in" at the top, in the first screen and at the end, all to /signin.
		const signIns = page.getByRole('link', { name: 'Sign in', exact: true });
		await expect(signIns).toHaveCount(3);
		for (const link of await signIns.all()) await expect(link).toHaveAttribute('href', '/signin');
		await expect(page.getByRole('navigation')).toHaveCount(0);

		await signIns.nth(1).click();
		await expect(page).toHaveURL(/\/signin$/);
		await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
	});

	test('TSK-d22bce says what Payday is and is not, and nothing the app does not do', async ({
		page
	}) => {
		await page.goto('/');
		const text = await pageText(page);
		for (const claim of [
			'Payday is not a loan',
			'Payday never lends money, and it is not a bank.',
			'It does not connect to your bank.',
			'There is nothing to pay, and there are no ads.',
			'your data is not sold',
			'Download a full copy of your budget at any time.',
			'Every two weeks, twice a month or once a month.',
			'Yearly bills are saved for a little each payday.',
			'Payday shows the day you will be free of debt.',
			'Mark it paid. The money comes off your number at once',
			'Payday never asks for your bank password.'
		]) {
			expect(text, claim).toContain(claim);
		}
		// Never a lender's words, and never a promise the app cannot keep.
		const lower = text.toLowerCase();
		for (const word of ['apply now', 'get cash', 'borrow', 'instant approval', 'credit score']) {
			expect(lower, word).not.toContain(word);
		}
	});

	test('TSK-499c09 says accounts are not open, and never offers a sign-up', async ({ page }) => {
		await page.goto('/');
		await expect(
			page.getByText('Accounts for new people are not open yet. They will be free.')
		).toBeVisible();
		const text = (await pageText(page)).toLowerCase();
		for (const word of ['sign up', 'signup', 'register', 'create an account', 'join']) {
			expect(text, word).not.toContain(word);
		}
		await expect(page.getByRole('link', { name: /sign up|register|create/i })).toHaveCount(0);
		await expect(page.getByRole('button')).toHaveCount(0);
	});

	test('TSK-161509 the app screens are real pictures with words, fixed sizes, and phone-sized files', async ({
		page,
		request
	}) => {
		await page.goto('/');
		const images = page.locator('main img');
		await expect(images).toHaveCount(4);
		for (const image of await images.all()) {
			expect(await image.getAttribute('alt')).toMatch(/\w{4,}.*\w{4,}/);
			expect(await image.getAttribute('width')).toBe('720');
			expect(await image.getAttribute('height')).toBe('1440');
		}
		// The first screen's picture loads at once; the others wait until they are scrolled to.
		await expect(images.first()).toHaveAttribute('fetchpriority', 'high');
		for (const image of (await images.all()).slice(1)) {
			await expect(image).toHaveAttribute('loading', 'lazy');
		}
		for (const name of ['home', 'plan', 'loans']) {
			const response = await request.get(`/landing/${name}.webp`);
			expect(response.status(), name).toBe(200);
			expect(response.headers()['content-type'], name).toContain('image/webp');
			expect((await response.body()).length, name).toBeLessThan(120 * 1024);
		}
	});

	test('TSK-464e30 carries the title, description, canonical, Open Graph and structured data', async ({
		page,
		request
	}) => {
		await page.goto('/');
		await expect(page).toHaveTitle(TITLE);
		const meta = (selector: string) => page.locator(selector).getAttribute('content');
		expect(await meta('meta[name="description"]')).toContain('free budget app, not a loan');
		expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${ORIGIN}/`);
		expect(await meta('meta[property="og:type"]')).toBe('website');
		expect(await meta('meta[property="og:url"]')).toBe(`${ORIGIN}/`);
		expect(await meta('meta[property="og:title"]')).toBe(TITLE);
		expect(await meta('meta[property="og:description"]')).toBeTruthy();
		expect(await meta('meta[property="og:image"]')).toBe(`${ORIGIN}/landing/og.png`);
		expect((await request.get('/landing/og.png')).status()).toBe(200);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

		const data = JSON.parse(
			(await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}'
		);
		expect(data).toMatchObject({
			'@context': 'https://schema.org',
			'@type': 'WebApplication',
			name: 'Payday',
			url: `${ORIGIN}/`,
			applicationCategory: 'FinanceApplication',
			isAccessibleForFree: true,
			offers: { '@type': 'Offer', price: '0' }
		});
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
		expect(locs).toEqual([
			`${ORIGIN}/`,
			`${ORIGIN}/signin`,
			`${ORIGIN}/privacy`,
			`${ORIGIN}/terms`
		]);
		const robots = await (await request.get('/robots.txt')).text();
		expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
	});

	test('TSK-2c985a has no sideways scroll at 320 and 375px wide', async ({ page }) => {
		for (const width of [320, 375]) {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/');
			await expect(page.getByRole('heading', { level: 1, name: H1 })).toBeVisible();
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
		}
	});
});

test.describe('TSK-619b8d the example moves, and is only ever an example', () => {
	test.use({ storageState: SIGNED_OUT, reducedMotion: 'reduce' });

	test('moving a slider changes the example number at once, with the same arithmetic', async ({
		page
	}) => {
		await page.goto('/');
		const start = exampleNumber({
			pay: EXAMPLE.pay.start,
			bills: EXAMPLE.bills.start,
			loans: EXAMPLE.loans.start,
			days: EXAMPLE.days.start
		});
		await expect(page.getByTestId('try-figure')).toHaveText(pesos(start.safe));
		await expect(page.getByText('Example', { exact: true })).toBeVisible();
		await expect(page.getByText('This is only an example, not your real budget.')).toBeVisible();

		// More bills: the number drops by exactly that much.
		await slide(page, /^Bills before your next payday/, EXAMPLE.bills.start + 200_000);
		const after = exampleNumber({
			pay: EXAMPLE.pay.start,
			bills: EXAMPLE.bills.start + 200_000,
			loans: EXAMPLE.loans.start,
			days: EXAMPLE.days.start
		});
		await expect(page.getByTestId('try-figure')).toHaveText(pesos(after.safe));
		await expect(page.getByTestId('try-result')).toHaveText(
			`Safe to spend until payday: ${pesos(after.safe)}.`
		);

		// Bills bigger than the pay: it says what is short, in words.
		await slide(page, /^Bills before your next payday/, EXAMPLE.bills.max);
		await expect(page.getByText('Short before payday by', { exact: true })).toBeVisible();
		await expect(page.getByTestId('try-result')).toContainText('Short before payday by');
	});

	test('with less motion asked for, nothing moves and nothing waits hidden', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		const states = await page
			.locator('[data-reveal-part], [data-pop], [data-float]')
			.evaluateAll((elements) =>
				elements.map((el) => ({
					opacity: getComputedStyle(el).opacity,
					transform: getComputedStyle(el).transform
				}))
			);
		expect(states.length).toBeGreaterThan(10);
		for (const state of states) {
			expect(state.opacity).toBe('1');
			expect(state.transform).toBe('none');
		}
	});
});

test.describe('TSK-619b8d with motion, every part of the page appears as it is scrolled to', () => {
	test.use({ storageState: SIGNED_OUT, reducedMotion: 'no-preference' });

	test('the sections rise into view and end fully shown', async ({ page }) => {
		await page.goto('/');
		for (const part of await page.locator('[data-reveal-part]').all()) {
			await part.scrollIntoViewIfNeeded();
			await expect(part).toHaveCSS('opacity', '1');
		}
	});
});

test.describe('TSK-2c985a the product page reads without JavaScript', () => {
	test.use({ storageState: SIGNED_OUT, javaScriptEnabled: false });

	test('shows every section, the example at its first position, and a working Sign in link', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1, name: H1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Questions people ask' })).toBeVisible();
		await expect(page.getByText('Accounts for new people are not open yet.').first()).toBeVisible();
		const start = exampleNumber({
			pay: EXAMPLE.pay.start,
			bills: EXAMPLE.bills.start,
			loans: EXAMPLE.loans.start,
			days: EXAMPLE.days.start
		});
		await expect(page.getByTestId('try-figure')).toHaveText(pesos(start.safe));
		// Nothing waits hidden for a script that will never run.
		const hidden = await page
			.locator('[data-reveal-part], [data-pop]')
			.evaluateAll(
				(elements) => elements.filter((el) => getComputedStyle(el).opacity !== '1').length
			);
		expect(hidden).toBe(0);
		await page.getByRole('link', { name: 'Sign in', exact: true }).first().click();
		await expect(page).toHaveURL(/\/signin$/);
	});
});

test.describe('TSK-04a739 a signed-in owner at / still gets the number', () => {
	test('shows the home screen, not the product page', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		await expect(page.getByRole('heading', { name: H1 })).toHaveCount(0);
	});

	test('TSK-121277 loads none of the product page: no motion library, no example', async ({
		page
	}) => {
		const scripts: string[] = [];
		page.on('response', async (response) => {
			if (response.request().resourceType() !== 'script') return;
			scripts.push(await response.text().catch(() => ''));
		});
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		const all = scripts.join('\n');
		expect(all).not.toContain('See how your number works');
		expect(all).not.toContain('Short before payday by');
	});

	test('is private and never kept', async ({ request }) => {
		const response = await request.get('/', { headers: { accept: 'text/html' } });
		expect(response.headers()['cache-control']).toBe('private, no-store');
	});
});
