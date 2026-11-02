import { expect, test, type Page } from '@playwright/test';
import { SIGNED_OUT } from './support/auth.ts';

/*
 * Read-only checks of the main navigation, on every project: a left sidebar from 48rem (768px) up and a
 * tab bar along the bottom below it. The journey has finished setup by now, so the owner is signed
 * in with a finished household. Nothing here changes anything.
 */

const WIDE_FROM = 768;
const PAGES = ['/', '/plan', '/checkin', '/schedule', '/loans', '/settings'];

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= WIDE_FROM;

async function expectNoSidewaysScroll(page: Page) {
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth
	}));
	expect(scroll).toBeLessThanOrEqual(client);
}

test.describe('the main navigation: what it holds', () => {
	for (const path of PAGES) {
		test(`${path} has one Main landmark with the five sections`, async ({ page }) => {
			await page.goto(path);
			await expect(mainNav(page)).toHaveCount(1);
			for (const name of ['Home', 'Plan', 'Check-in', 'Bills', 'Loans']) {
				await expect(mainNav(page).getByRole('link', { name, exact: true })).toBeVisible();
			}
			// The brand and Settings are the sidebar's; the tab bar leaves them out.
			const wide = isWide(page);
			await expect(mainNav(page).getByRole('link', { name: 'Payday', exact: true })).toBeVisible({
				visible: wide
			});
			await expect(mainNav(page).getByRole('link', { name: 'Settings', exact: true })).toBeVisible({
				visible: wide
			});
		});
	}

	test('lists the sections in order, and leaves the icons out of the names', async ({ page }) => {
		await page.goto('/plan');
		const names = await mainNav(page).locator('ul a').allInnerTexts();
		expect(names.map((n) => n.trim())).toEqual(['Home', 'Plan', 'Check-in', 'Bills', 'Loans']);
	});
});

test.describe('the main navigation: where it sits', () => {
	test('is a left sidebar on a wide screen and along the bottom on a phone', async ({ page }) => {
		await page.goto('/plan');
		const box = await mainNav(page).boundingBox();
		const viewport = page.viewportSize()!;
		expect(box).not.toBeNull();
		if (isWide(page)) {
			// A sidebar: against the left edge, taller than wide, the full height of the screen.
			expect(box!.x).toBeLessThanOrEqual(1);
			expect(box!.height).toBeGreaterThan(box!.width);
			expect(Math.round(box!.height)).toBe(viewport.height);
			// It stays put as the page scrolls.
			await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
			const after = (await mainNav(page).boundingBox())!;
			expect(after.x).toBeLessThanOrEqual(1);
			expect(after.y).toBeLessThanOrEqual(1);
			// Settings, then Sign out, sit at the bottom of it, below the five sections.
			const settings = (await mainNav(page).getByRole('link', { name: 'Settings' }).boundingBox())!;
			const loans = (await mainNav(page).getByRole('link', { name: 'Loans' }).boundingBox())!;
			const signOut = (await mainNav(page)
				.getByRole('button', { name: 'Sign out', exact: true })
				.boundingBox())!;
			expect(settings.y).toBeGreaterThan(loans.y + loans.height);
			expect(signOut.y).toBeGreaterThanOrEqual(settings.y + settings.height - 1);
			expect(signOut.y + signOut.height).toBeGreaterThan(viewport.height - 32);
		} else {
			expect(Math.round(box!.y + box!.height)).toBe(viewport.height);
			for (const link of await mainNav(page).locator('ul a').all()) {
				expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
			}
		}
	});

	test('never covers the end of a long page', async ({ page }) => {
		await page.goto('/plan');
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		const last = await page.evaluate(() => {
			const main = document.querySelector('main')!;
			const parts = main.querySelectorAll('*');
			return parts[parts.length - 1].getBoundingClientRect().bottom;
		});
		const nav = (await mainNav(page).boundingBox())!;
		if (isWide(page)) {
			// Beside the sidebar, not under it.
			const box = await page.evaluate(
				() => document.querySelector('main')!.getBoundingClientRect().left
			);
			expect(box).toBeGreaterThanOrEqual(nav.x + nav.width);
			expect(last).toBeGreaterThan(0);
		} else {
			expect(last).toBeLessThanOrEqual(nav.y + 1);
		}
	});

	test('does not scroll sideways, even at 320px wide', async ({ page }) => {
		for (const width of [320, page.viewportSize()!.width]) {
			await page.setViewportSize({ width, height: 700 });
			for (const path of PAGES) {
				await page.goto(path);
				await expectNoSidewaysScroll(page);
			}
		}
	});
});

test.describe('the main navigation: the current section', () => {
	const current = (page: Page) => mainNav(page).locator('[aria-current="page"]');
	const sectionOf = (page: Page) =>
		current(page)
			.locator('xpath=self::a')
			.evaluateAll((links) => links.map((a) => a.textContent?.trim()));

	test('Home is current on / only', async ({ page }) => {
		await page.goto('/');
		expect(await sectionOf(page)).toEqual(['Home']);
		await page.goto('/plan');
		expect(await sectionOf(page)).toEqual(['Plan']);
	});

	test('a section stays current on the pages below it', async ({ page }) => {
		await page.goto('/checkin/history');
		expect(await sectionOf(page)).toEqual(['Check-in']);

		await page.goto('/schedule');
		await page.locator('main ul a').first().click();
		await expect(page).toHaveURL(/\/schedule\/[^/]+$/);
		expect(await sectionOf(page)).toEqual(['Bills']);

		await page.goto('/settings/reminders');
		expect(await sectionOf(page)).toEqual(['Settings']);
	});
});

test.describe('the main navigation: where it does not show', () => {
	test.describe('signed out', () => {
		test.use({ storageState: SIGNED_OUT });

		test('is not on the sign-in page', async ({ page }) => {
			await page.goto('/signin');
			await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
			await expect(page.getByRole('navigation')).toHaveCount(0);
		});

		test('is not on the offline page', async ({ page }) => {
			await page.goto('/offline');
			await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
			await expect(page.getByRole('navigation')).toHaveCount(0);
		});
	});

	test('is not on the offline page for a signed-in owner either', async ({ page }) => {
		await page.goto('/offline');
		await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
		await expect(mainNav(page)).toHaveCount(0);
	});
});

test.describe('the main navigation: with JavaScript off', () => {
	test.use({ javaScriptEnabled: false });

	test('tapping a tab on a page that sends no script still navigates', async ({ page }) => {
		await page.goto('/schedule');
		await expect(page.locator('main h1')).toHaveText('Pay and bills');
		await mainNav(page).getByRole('link', { name: 'Loans', exact: true }).click();
		await expect(page).toHaveURL(/\/loans$/);
		await expect(mainNav(page).locator('[aria-current="page"]')).toHaveText(/Loans/);
	});
});

test.describe('settings', () => {
	test('lists the reminders and security, and the home footer is one Settings link', async ({
		page
	}) => {
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
		await expect(page.getByRole('main').getByRole('link', { name: 'Reminders' })).toHaveAttribute(
			'href',
			/\/settings\/reminders$/
		);
		await expect(page.getByRole('main').getByRole('link', { name: 'Security' })).toHaveAttribute(
			'href',
			/\/settings\/security$/
		);

		await page.goto('/');
		const footer = page.getByRole('main').locator('.footer-links');
		await expect(footer.getByRole('link')).toHaveCount(1);
		await expect(footer.getByRole('link', { name: 'Settings' })).toHaveAttribute(
			'href',
			/\/settings$/
		);
		await expect(page.getByRole('navigation', { name: 'More' })).toHaveCount(0);
	});

	test('the top-level pages no longer carry a Back to my number link', async ({ page }) => {
		for (const path of ['/plan', '/schedule', '/loans', '/checkin']) {
			await page.goto(path);
			await expect(page.getByRole('link', { name: 'Back to my number' })).toHaveCount(0);
		}
	});
});

test.describe('signing out', () => {
	/*
	 * Only that the buttons are there and post to the Security page's sign-out action: the projects
	 * share one session, so clicking here would sign the others out. auth.e2e.ts signs out for real.
	 */
	const action = (page: Page) => new URL('/settings/security?/signout', page.url()).href;

	test('the sidebar has Sign out under Settings; the tab bar leaves it out', async ({ page }) => {
		await page.goto('/plan');
		// Found by its text, not its role: on a phone it is in the page but hidden, which a role
		// query cannot see.
		const form = mainNav(page).locator('form', { hasText: 'Sign out' });
		await expect(form).toHaveCount(1);
		await expect(form).toHaveAttribute('method', 'POST');
		expect(await form.evaluate((f: HTMLFormElement) => f.action)).toBe(action(page));
		await expect(mainNav(page).getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({
			visible: isWide(page)
		});
	});

	test('the Settings page has Sign out on every size', async ({ page }) => {
		await page.goto('/settings');
		const main = page.getByRole('main');
		await expect(main.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
		const form = main.locator('form', { hasText: 'Sign out' });
		await expect(form).toHaveAttribute('method', 'POST');
		expect(await form.evaluate((f: HTMLFormElement) => f.action)).toBe(action(page));
	});
});

test.describe('one page width', () => {
	test('every page puts its content in the same column', async ({ page }) => {
		const paths = [...PAGES, '/checkin/history', '/settings/reminders', '/settings/security'];
		const boxes: Record<string, { left: number; width: number }> = {};
		for (const path of paths) {
			await page.goto(path);
			const box = (await page.getByRole('main').boundingBox())!;
			boxes[path] = { left: Math.round(box.x), width: Math.round(box.width) };
		}
		const first = boxes[paths[0]];
		for (const path of paths) expect(boxes[path], path).toEqual(first);
	});
});

test.describe('dividers', () => {
	test('a row has a line under it only when something follows it, and never one above', async ({
		page
	}) => {
		for (const path of [...PAGES, '/checkin/history', '/settings/security']) {
			await page.goto(path);
			const wrong = await page.evaluate(() =>
				[...document.querySelectorAll('ul.lines')].flatMap((ul) => {
					const rows = [...ul.children];
					return rows.flatMap((row, i) => {
						const style = getComputedStyle(row);
						const under = parseFloat(style.borderBottomWidth) > 0;
						const above = parseFloat(style.borderTopWidth) > 0;
						// In a paycheck card no list has a line under its last row: the card's foot draws its own.
						const followed =
							i < rows.length - 1 || (ul.nextElementSibling !== null && !ul.closest('.paycheck'));
						const text = (row.textContent ?? '').trim().slice(0, 30);
						return under !== followed || above ? [`${text} (under ${under}, above ${above})`] : [];
					});
				})
			);
			expect(wrong, path).toEqual([]);
		}
	});
});
