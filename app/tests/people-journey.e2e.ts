import { expect, test } from './support/test.ts';
import { SIGNED_OUT } from './support/auth.ts';
import { newAddress, newEmail, PEOPLE_PASSWORD, presentAs } from './support/people.ts';

/*
 * Phase 9, TSK-cd259c and TSK-c7fcd1: a stranger's whole path at phone size, from the product page to
 * the same number after signing out and in. One sign-up only: a sign-up costs one of the site's 30 an
 * hour. They arrive as a Filipino visitor would (English, Manila time).
 */
test.use({ storageState: SIGNED_OUT, locale: 'en-PH', timezoneId: 'Asia/Manila' });

test('TSK-cd259c TSK-c7fcd1 from the product page to a budget, and back in with the email and password', async ({
	page
}) => {
	const email = newEmail();
	await presentAs(page, newAddress());

	// 1 and 2: the product page, and its button.
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('link', { name: 'Create a free account', exact: true }).first().click();
	await expect(page).toHaveURL(/\/signin\/new$/);
	await page.waitForLoadState('networkidle');

	// 3: sign up.
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(PEOPLE_PASSWORD);
	await page.getByLabel('Type the password again').fill(PEOPLE_PASSWORD);
	await page.getByRole('button', { name: 'Create a free account' }).click();

	// 4 and 5: the recovery codes, once, then on.
	await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
	await expect(page.getByTestId('recovery-code')).toHaveCount(10);
	await page.getByRole('link', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/setup$/);

	// 6: guided setup, the least it asks: pay, a balance, no bills, no loans.
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('heading', { name: 'Your currency and time zone' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your pay' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Pay each payday').fill('18,000.00');
	await page.getByLabel('Your last or next payday').fill('2026-01-09');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'What is in your account today?' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Balance', { exact: true }).fill('25,000.00');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: "That's all" }).click();
	await expect(page.getByRole('heading', { name: 'Loan payments' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: "That's all" }).click();
	await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
	await page.getByRole('button', { name: 'Open Payday' }).click();

	// 7: the home screen shows a number.
	await expect(page).toHaveURL(/\/$/);
	const number = page.getByTestId('safe-to-spend');
	await expect(number).toBeVisible();
	const before = await number.innerText();
	expect(before).toMatch(/\d/);
	await page.waitForLoadState('networkidle');

	// 8: sign out (Settings has the button on every size).
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page).toHaveURL(/\/signin$/);

	// 9: sign in with the email and the password.
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(PEOPLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByTestId('safe-to-spend')).toBeVisible();

	// 10: the same budget, the same number.
	await expect(page.getByTestId('safe-to-spend')).toHaveText(before);
});
