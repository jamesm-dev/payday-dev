import { expect, test, type Page } from '@playwright/test';
import { SIGNED_OUT } from './support/auth.ts';

/*
 * Read-only checks of the shared interface rules: tap targets, page transitions, the skip link,
 * the friendly error page and the size of a page title on a phone. Nothing here changes anything.
 */

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** Every stylesheet the page uses, as text: linked files and inline blocks. */
async function stylesheetText(page: Page): Promise<string> {
	const hrefs = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href)
	);
	const inline = await page.evaluate(() =>
		[...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
	);
	const files = await Promise.all(hrefs.map(async (h) => (await page.request.get(h)).text()));
	return [inline, ...files].join('\n');
}

test.describe('shared interface rules', () => {
	test('a field with nothing in it is empty once the page has loaded, never the word "undefined"', async ({
		page
	}) => {
		let seen = 0;
		for (const path of ['/', '/schedule/new/bill', '/loans/new', '/settings/security']) {
			await page.goto(path);
			// After the scripts have run: setting a field's default to undefined writes "undefined".
			await page.waitForLoadState('networkidle');
			for (const input of await page.locator('input:not([type=hidden])').all()) {
				expect(await input.inputValue(), path).not.toBe('undefined');
				seen += 1;
			}
		}
		expect(seen).toBeGreaterThan(5);
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await expect(page.getByLabel('Balance in your account')).toHaveValue('');
	});

	test('every visible button is at least 44px tall, and the default is 48px', async ({ page }) => {
		let seen = 0;
		for (const path of ['/schedule', '/loans', '/no-such-page']) {
			await page.goto(path);
			for (const btn of await page.locator('.btn:visible').all()) {
				const box = (await btn.boundingBox())!;
				expect(box.height).toBeGreaterThanOrEqual(44);
				seen += 1;
			}
		}
		expect(seen).toBeGreaterThan(0);
		await page.goto('/no-such-page');
		const home = (await page.getByRole('link', { name: 'Go to Home' }).boundingBox())!;
		expect(Math.round(home.height)).toBe(48);
	});

	test('a group of actions stacks on a phone and sits in a row on a wide screen', async ({
		page
	}) => {
		await page.goto('/schedule');
		const tops = await page.evaluate(() => {
			const group = document.createElement('div');
			group.className = 'actions';
			group.innerHTML =
				'<button class="btn">Save</button><button class="btn danger">Delete</button>';
			document.querySelector('main')!.append(group);
			return [...group.children].map((c) => c.getBoundingClientRect().top);
		});
		if (isPhone(page)) expect(tops[1]).toBeGreaterThan(tops[0]);
		else expect(tops[1]).toBe(tops[0]);
	});

	test('page transitions are declared, guarded for reduced motion, and the nav holds still', async ({
		page
	}) => {
		await page.goto('/');
		const css = await stylesheetText(page);
		expect(css).toMatch(
			/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^]*@view-transition\s*\{\s*navigation:\s*auto/
		);
		expect(css).toMatch(/view-transition-name:\s*app-nav/);
	});

	test('the skip link is the first Tab stop and moves focus to the content', async ({
		page
	}, info) => {
		test.skip(info.project.name === 'iphone', 'Tab does not move focus in mobile Safari');
		await page.goto('/plan');
		await page.keyboard.press('Tab');
		const skip = page.getByRole('link', { name: 'Skip to content' });
		await expect(skip).toBeFocused();
		await expect(skip).toBeInViewport();
		await page.keyboard.press('Enter');
		await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('content');
	});

	test('a wrong address shows a friendly page with a way home and the reference', async ({
		page
	}) => {
		const response = await page.goto('/no-such-page');
		expect(response?.status()).toBe(404);
		await expect(
			page.getByRole('heading', { level: 1, name: "We can't find that page" })
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
		await expect(page.getByText(/^Reference:/)).toBeVisible();
	});

	test('a page title is at least 26px on a phone', async ({ page }) => {
		test.skip(!isPhone(page), 'phone sizes only');
		await page.goto('/plan');
		const size = await page
			.locator('main h1')
			.first()
			.evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
		expect(size).toBeGreaterThanOrEqual(26);
	});
});

test.describe('sign-in, settings and security layout', () => {
	test.describe('signed out', () => {
		test.use({ storageState: SIGNED_OUT });

		test('the sign-in brand block is centred, with the mark left of the word and room before the fields', async ({
			page
		}) => {
			await page.goto('/signin');
			const heading = page.getByRole('heading', { level: 1, name: 'Payday', exact: true });
			await expect(heading).toBeVisible();
			const tagline = page.getByText("Know what's safe to spend until payday.");
			await expect(tagline).toBeVisible();

			const geometry = await page.evaluate(() => {
				const h1 = document.querySelector('main h1')!;
				const range = document.createRange();
				const text = [...h1.childNodes].find(
					(n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ''
				)!;
				range.selectNodeContents(text);
				const word = range.getBoundingClientRect();
				const mark = h1.querySelector('svg')!.getBoundingClientRect();
				const main = document.querySelector('main')!;
				const cs = getComputedStyle(main);
				const column = main.getBoundingClientRect();
				const pad = parseFloat(cs.paddingLeft);
				const columnCentre =
					column.left + pad + (column.width - pad - parseFloat(cs.paddingRight)) / 2;
				const tag = document.querySelector('main .tagline')!;
				const tagRange = document.createRange();
				tagRange.selectNodeContents(tag);
				const tagText = tagRange.getBoundingClientRect();
				const input = document
					.querySelector('main input:not([type=hidden])')!
					.getBoundingClientRect();
				return {
					wordLeft: word.left,
					wordRight: word.right,
					markLeft: mark.left,
					markRight: mark.right,
					blockCentre: (mark.left + word.right) / 2,
					tagCentre: (tagText.left + tagText.right) / 2,
					columnCentre,
					gap: input.top - tag.getBoundingClientRect().bottom
				};
			});
			expect(geometry.markRight).toBeLessThanOrEqual(geometry.wordLeft + 1);
			expect(Math.abs(geometry.blockCentre - geometry.columnCentre)).toBeLessThanOrEqual(2);
			expect(Math.abs(geometry.tagCentre - geometry.columnCentre)).toBeLessThanOrEqual(2);
			expect(geometry.gap).toBeGreaterThanOrEqual(40);
		});

		test('the sign-in page does not scroll sideways at 320px', async ({ page }) => {
			await page.setViewportSize({ width: 320, height: 640 });
			await page.goto('/signin');
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});
	});

	test('the settings options are tappable rows with a chevron', async ({ page }) => {
		await page.goto('/settings');
		for (const name of ['Reminders', 'Security']) {
			const row = page.getByRole('main').getByRole('link', { name });
			const box = (await row.boundingBox())!;
			expect(box.height).toBeGreaterThanOrEqual(56);
			const chevron = await row.evaluate((a) => getComputedStyle(a, '::after').content);
			expect(chevron).not.toBe('none');
		}
	});

	test('"Sign out everywhere" is a danger button', async ({ page }) => {
		await page.goto('/settings/security');
		const button = page.getByRole('button', { name: 'Sign out everywhere' });
		await expect(button).toHaveClass(/danger/);
	});

	test('a field and its button share a line on a wide screen and stack on a phone', async ({
		page
	}) => {
		await page.goto('/settings/security');
		const input = (await page.getByLabel('Name this device').boundingBox())!;
		const button = (await page
			.getByRole('button', { name: 'Unlock with this device' })
			.boundingBox())!;
		if (isPhone(page)) {
			expect(button.y).toBeGreaterThanOrEqual(input.y + input.height);
		} else {
			expect(Math.abs(button.y + button.height - (input.y + input.height))).toBeLessThanOrEqual(1);
			expect(Math.abs(button.height - input.height)).toBeLessThanOrEqual(1);
		}
	});
});
