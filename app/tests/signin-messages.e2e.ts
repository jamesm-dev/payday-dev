import { expect, test, type Browser, type Page } from '@playwright/test';
import { OWNER_PASSWORD, SIGNED_OUT, signInWithPassword } from './support/auth.ts';

/*
 * Sign-in errors show where the tagline is, typed out, then give way to the tagline again. Failed
 * sign-ins count against per-address limits that the other tests share, so each test here has its
 * own browser context and its own client address, and only the laptop project runs them.
 */

const TAGLINE = "Know what's safe to spend until payday.";
const WRONG = 'That password is not right.';

async function visitor(
	browser: Browser,
	baseURL: string,
	last: number,
	options: { reducedMotion?: 'reduce' | 'no-preference' } = {}
) {
	const context = await browser.newContext({
		baseURL,
		storageState: SIGNED_OUT,
		reducedMotion: options.reducedMotion,
		extraHTTPHeaders: {
			'x-forwarded-proto': 'http',
			'x-forwarded-for': `198.51.100.${last}`
		}
	});
	return { context, page: await context.newPage() };
}

const tagline = (page: Page) => page.locator('p.tagline');

test.describe('sign-in messages appear as the tagline', () => {
	test.beforeEach(({ browser }, info) => {
		test.skip(
			info.project.name !== 'laptop' || !browser,
			'failed sign-ins share per-address limits'
		);
	});

	test('TSK-SIGNIN-TAGLINE a wrong password replaces the tagline, then the tagline returns', async ({
		browser,
		baseURL
	}) => {
		const { context, page } = await visitor(browser, baseURL!, 71, { reducedMotion: 'reduce' });
		await signInWithPassword(page, 'not the password at all');

		await expect(tagline(page)).toHaveText(WRONG);
		await expect(page.getByRole('alert')).toContainText(WRONG);
		await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
			'aria-invalid',
			'true'
		);
		await expect(page.locator('form .notice')).toHaveCount(0);

		// Editing the field clears the mark and brings the tagline back at once: well inside the
		// six-second hold, so this cannot pass by the hold simply running out.
		await page.getByLabel('Password', { exact: true }).fill('x');
		await expect(page.getByLabel('Password', { exact: true })).not.toHaveAttribute(
			'aria-invalid',
			'true'
		);
		await expect(tagline(page)).toHaveText(TAGLINE, { timeout: 2_000 });

		// The hidden alert keeps the message after the visible text has gone back.
		await expect(page.getByRole('alert')).toContainText(WRONG);
		await context.close();
	});

	test('TSK-SIGNIN-TAGLINE with motion allowed the message is typed out', async ({
		browser,
		baseURL
	}) => {
		const { context, page } = await visitor(browser, baseURL!, 72);
		// animejs loads here, so a CSP that blocks it would show up as a violation.
		await page.addInitScript(() => {
			(window as unknown as { __csp: string[] }).__csp = [];
			document.addEventListener('securitypolicyviolation', (e) =>
				(window as unknown as { __csp: string[] }).__csp.push(
					`${e.violatedDirective} ${e.blockedURI}`
				)
			);
		});
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
		await page.getByLabel('Password', { exact: true }).fill('not the password at all');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();

		const texts: string[] = [];
		for (let i = 0; i < 400; i++) {
			texts.push((await tagline(page).textContent()) ?? '');
			if (texts.length > 20 && texts.at(-1) === TAGLINE && texts.some((t) => t === WRONG)) break;
			await page.waitForTimeout(40);
		}
		const firstError = texts.findIndex((t) => t.length > 0 && WRONG.startsWith(t) && t !== TAGLINE);
		const shrinking = texts
			.slice(0, firstError)
			.filter((t) => t.length > 0 && t.length < TAGLINE.length);
		expect(shrinking.length, `texts: ${texts.join('|')}`).toBeGreaterThan(1);
		for (const t of shrinking) expect(TAGLINE.startsWith(t)).toBe(true);
		const growing = texts.filter(
			(t) => t.length > 0 && t.length < WRONG.length && WRONG.startsWith(t)
		);
		expect(growing.length).toBeGreaterThan(1);
		const full = texts.indexOf(WRONG);
		expect(full).toBeGreaterThan(firstError);
		expect(texts.at(-1)).toBe(TAGLINE);
		expect(texts.lastIndexOf(TAGLINE)).toBeGreaterThan(full);
		expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
			1
		);
		expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
		await context.close();
	});

	// Not tested here, by necessity: a wrong setup code marking only the setup-code field (registration
	// is closed once the owner exists, and the shared database is registered by auth.setup.ts), and
	// a failed passkey after a failed password not resurrecting the old password error (it needs a
	// virtual authenticator that fails on demand; covered by reading the dismiss logic in +page.svelte).

	test('TSK-SIGNIN-TAGLINE a wrong recovery code shows its error as the tagline', async ({
		browser,
		baseURL
	}) => {
		const { context, page } = await visitor(browser, baseURL!, 73, { reducedMotion: 'reduce' });
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByText('Use a recovery code').click();
		await page.getByLabel('Recovery code').fill('AAAA-BBBB-CCCC-DDDD');
		await page.getByRole('button', { name: 'Sign in with recovery code' }).click();

		await expect(tagline(page)).toContainText('did not work');
		await expect(page.getByRole('alert')).toContainText('did not work');
		await expect(page.getByLabel('Recovery code')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('form .notice')).toHaveCount(0);
		await context.close();
	});

	test('TSK-SIGNIN-TAGLINE a recovery panel the owner closed stays closed through a password try', async ({
		browser,
		baseURL
	}) => {
		const { context, page } = await visitor(browser, baseURL!, 76, { reducedMotion: 'reduce' });
		const panel = page.locator('details.recovery');
		const summary = page.getByText('Forgot your password? Use a recovery code');
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await summary.click();
		await page.getByLabel('Recovery code').fill('AAAA-BBBB-CCCC-DDDD');
		await page.getByRole('button', { name: 'Sign in with recovery code' }).click();
		await expect(tagline(page)).toContainText('did not work');

		await summary.click();
		await expect(panel).not.toHaveAttribute('open');
		// Typing clears the recovery error's mark, and Sign in goes busy: each re-renders the page, and
		// neither may reopen the panel.
		await page.getByLabel('Password', { exact: true }).fill('not the password at all');
		await expect(panel).not.toHaveAttribute('open');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(tagline(page)).toHaveText(WRONG);
		await expect(panel).not.toHaveAttribute('open');
		await expect(page.getByLabel('Recovery code')).toBeHidden();

		// Still the owner's to open again.
		await summary.click();
		await expect(page.getByLabel('Recovery code')).toBeVisible();
		await context.close();
	});

	test('TSK-SIGNIN-TAGLINE Back after signing in does not show the sign-in form again', async ({
		browser,
		baseURL
	}) => {
		const { context, page } = await visitor(browser, baseURL!, 74);
		// A page before sign-in, so Back has somewhere to go: it must land there, not on the sign-in
		// form, because signing in replaced that page in the history.
		await page.goto('/offline');
		await signInWithPassword(page, OWNER_PASSWORD);
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		await page.goBack();
		await expect(page).toHaveURL(/\/offline$/);
		await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
		await context.close();
	});

	test('TSK-SIGNIN-TAGLINE a next posted with the form cannot send the owner off the app', async ({
		browser,
		baseURL
	}) => {
		const { context } = await visitor(browser, baseURL!, 75);
		// As `use:enhance` posts it: the action answers in JSON, with the address it redirects to.
		for (const next of ['//evil.example', 'https://evil.example/x', 'javascript:alert(1)']) {
			const response = await context.request.post('/signin?/password', {
				form: { password: OWNER_PASSWORD, next },
				headers: {
					origin: new URL(baseURL!).origin,
					accept: 'application/json',
					'x-sveltekit-action': 'true'
				}
			});
			const result = await response.json();
			expect(result, next).toMatchObject({ type: 'redirect', location: '/' });
		}
		await context.close();
	});
});
