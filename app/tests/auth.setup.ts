import { expect, test as setup } from '@playwright/test';
import {
	addVirtualAuthenticator,
	AUTH_STATE,
	OWNER_PASSWORD,
	saveOwner,
	SETUP_CODE
} from './support/auth.ts';

// The owner registers with a PASSWORD (ADR-0010). Chromium with a virtual authenticator then also
// adds a device that unlocks with its PIN, fingerprint or face (a passkey), so that optional path
// stays tested: WebKit has no CDP, so it cannot make one. The other projects start from the session
// this leaves behind.
setup(
	'TSK-46617D the first visit registers the owner with a password, then offers a passkey',
	async ({ page, context, baseURL }) => {
		// Until the owner exists, the door is shut. The passkey endpoints are for a signed-in owner
		// only, and the first registration is the password form, which needs the setup code. (The
		// test server is a production build, so the code is required.)
		const options = await page.request.post('/signin/register/options', { data: {} });
		expect(options.status()).toBe(403);
		const verify = await page.request.post('/signin/register/verify', {
			data: { challengeId: 'x', response: {}, nickname: 'Intruder' }
		});
		expect(verify.status()).toBe(403);
		// Posting the registration form by hand, with no or a wrong code, gets nothing either.
		for (const setupCode of [undefined, 'not-the-code']) {
			const post = await page.request.post('/signin?/register', {
				form: {
					password: OWNER_PASSWORD,
					again: OWNER_PASSWORD,
					...(setupCode ? { setupCode } : {})
				},
				headers: { origin: new URL(baseURL!).origin }
			});
			expect(post.status()).toBe(403);
		}

		const authenticator = await addVirtualAuthenticator(context, page);

		await page.goto('/signin');
		await page.waitForLoadState('networkidle'); // the form enhances itself once the page has hydrated
		const create = page.getByRole('button', { name: 'Create your password' });
		await expect(create).toBeVisible();
		await expect(page.getByRole('button', { name: /PIN, fingerprint or face/ })).toHaveCount(0);

		const password = page.getByLabel('New password', { exact: true });
		const again = page.getByLabel('Type it again');
		await password.fill(OWNER_PASSWORD);
		await again.fill(OWNER_PASSWORD);

		// No code, or the wrong one, is refused in the page.
		await create.click();
		await expect(page.getByRole('alert')).toContainText('setup code');
		await page.getByLabel('Setup code').fill('not-the-code');
		await create.click();
		await expect(page.getByRole('alert')).toContainText('not right');
		await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toHaveCount(0);

		// The right code still needs a good password, typed twice.
		await page.getByLabel('Setup code').fill(SETUP_CODE);
		await password.fill('short');
		await again.fill('short');
		await create.click();
		await expect(page.getByRole('alert')).toContainText('at least 12 characters');
		await password.fill(OWNER_PASSWORD);
		await again.fill(OWNER_PASSWORD + 'x');
		await create.click();
		await expect(page.getByRole('alert')).toContainText('not the same');
		await password.fill(`my ${SETUP_CODE} is long`);
		await again.fill(`my ${SETUP_CODE} is long`);
		await create.click();
		await expect(page.getByRole('alert')).toContainText('setup code');
		await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toHaveCount(0);

		await password.fill(OWNER_PASSWORD);
		await again.fill(OWNER_PASSWORD);
		await create.click();

		// Recovery codes are shown once, right after registration.
		await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
		const firstCodes = (await page.getByTestId('recovery-code').allTextContents()).map((c) =>
			c.trim()
		);
		expect(firstCodes).toHaveLength(10);

		// Then the optional step: this device's PIN, fingerprint or face.
		await page.getByRole('button', { name: "I've saved these" }).click();
		await expect(
			page.getByRole('heading', { name: 'Unlock faster on this device?' })
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Not now' })).toBeVisible();
		await page.getByLabel('Name this device').fill('Test laptop');
		await page
			.getByRole('button', { name: "Also unlock with this device's PIN, fingerprint or face" })
			.click();
		// A new owner has not set up yet, so the home screen sends them to the first question.
		await expect(page).toHaveURL(/\/setup$/);
		await expect(page.getByRole('heading', { name: "Let's set up Payday" })).toBeVisible();

		// New recovery codes: shown once, after a redirect, so a reload cannot replace them again. The
		// tests below use these codes; every project starts after this one, so none holds an old set.
		// (Registering just proved the password, so no extra confirmation is asked for.)
		await page.goto('/settings/security');
		await page.waitForLoadState('networkidle');
		const [shown] = await Promise.all([
			page.waitForResponse(
				(r) =>
					r.request().method() === 'GET' &&
					r.request().resourceType() === 'document' &&
					new URL(r.url()).pathname === '/settings/security'
			),
			page.getByRole('button', { name: 'Make new recovery codes' }).click()
		]);
		expect(shown.headers()['cache-control']).toBe('no-store');
		await expect(page.getByText('Your new codes.')).toBeVisible();
		const recoveryCodes = (await page.getByTestId('recovery-code').allTextContents()).map((c) =>
			c.trim()
		);
		expect(recoveryCodes).toHaveLength(10);
		expect(recoveryCodes).not.toEqual(firstCodes);

		const [reloaded] = await Promise.all([
			page.waitForResponse((r) => new URL(r.url()).pathname === '/settings/security'),
			page.reload()
		]);
		expect(reloaded.request().method()).toBe('GET');
		await expect(page.getByTestId('recovery-code')).toHaveCount(0);
		await expect(page.getByText('10 of 10 unused')).toBeVisible();
		await expect(page.getByTestId('passkey')).toHaveCount(1);

		saveOwner({ recoveryCodes, credentials: await authenticator.credentials() });
		await context.storageState({ path: AUTH_STATE });
	}
);
