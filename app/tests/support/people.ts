import { randomBytes, randomInt } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/*
 * Helpers for the two-person tests (the people-* projects): each makes accounts of its own and never
 * touches the shared owner's budget.
 */

/** A password that passes the rules and is nobody's real one. */
export const PEOPLE_PASSWORD = 'quiet harbour lantern 5127';

/** A made-up email nobody owns (example.test never resolves), different every time. */
export const newEmail = () => `person-${randomBytes(6).toString('hex')}@example.test`;

/**
 * A made-up client address, different every time, from the range set aside for benchmarking, so no
 * sign-up shares the per-address limit with another test or with the other projects' addresses.
 */
export const newAddress = () => `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`;

/**
 * Presents this browser as coming from `address` (the test server reads x-forwarded-for) and says
 * the page is plain http, which the test server needs to hand out the cookie.
 */
export const presentAs = (page: Page, address: string) =>
	page.context().setExtraHTTPHeaders({ 'x-forwarded-proto': 'http', 'x-forwarded-for': address });

/**
 * Types the form on /signin/new once the page has hydrated. It does not press the button: tests of
 * a refusal use it too.
 */
export async function fillSignUp(
	page: Page,
	{
		email,
		password = PEOPLE_PASSWORD,
		again = password
	}: { email: string; password?: string; again?: string }
) {
	await page.goto('/signin/new');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByLabel('Type the password again').fill(again);
}

/**
 * Signs a new person up, from their own address, and waits for the recovery codes. Returns the codes.
 * The person is left on the page that shows them.
 */
export async function signUp(
	page: Page,
	input: { email: string; password?: string; address: string }
): Promise<string[]> {
	await presentAs(page, input.address);
	await fillSignUp(page, input);
	await page.getByRole('button', { name: 'Create a free account' }).click();
	await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
	return page.getByTestId('recovery-code').allTextContents();
}
