import { expect, test, type Browser, type Page } from './support/test.ts';
import { addVirtualAuthenticator, SIGNED_OUT } from './support/auth.ts';
import { newAddress, newEmail, PEOPLE_PASSWORD, presentAs, signUp } from './support/people.ts';

/*
 * TSK-3ad574, TSK-2ad8f3, TSK-0a6680: two people, each with a small budget, in one database. Neither
 * can open the other's loan, expense or schedule item by its address. One adds a passkey and signs
 * in with it; "Sign out everywhere" leaves the other signed in. The other deletes their account: they
 * are signed out, cannot sign in again, and the first person is unaffected.
 *
 * Two sign-ups only: the site allows 30 an hour, and each address 3. Every sign-up has an email and
 * an address of its own. It runs in the people-* projects, which start signed out.
 */
test.use({ storageState: SIGNED_OUT });
// The passkey step needs a virtual authenticator, a Chromium DevTools feature (as in auth.e2e.ts),
// so this runs in people-laptop; people-journey.e2e.ts covers the phone.
test.skip(({ browserName }) => browserName !== 'chromium', 'needs a virtual authenticator');

type Budget = { item: string; loan: string; expense: string; number: string };

const ID_AT_END = /\/(\d+)$/;

/** The least guided setup asks for: pay, a balance, no bills, no loans. */
async function setUp(page: Page) {
	await page.getByRole('link', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/setup$/);
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
	await expect(page.getByTestId('safe-to-spend')).toBeVisible();
	await page.waitForLoadState('networkidle');
}

/** A bill, a loan and an expense of the person's own; their addresses are returned. */
async function addBudget(page: Page, label: string): Promise<Budget> {
	const origin = new URL(page.url()).origin;
	const post = (path: string, form: Record<string, string>) =>
		page.request.post(path, { form, headers: { origin } });

	await post('/schedule/new/bill', {
		name: `${label} rent`,
		amount: '4500',
		repeat: 'monthly',
		date: '',
		day: '5',
		day2: ''
	});
	await post('/loans/new/informal', {
		name: `${label} loan`,
		lender: `${label} lender`,
		balance: '500',
		rate: '0',
		item: '',
		minPct: '',
		minFloor: ''
	});
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Add an expense', { exact: true }).fill('12.50');
	await page.getByLabel(/^What was it for\?/).fill(`${label} coffee`);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Expense added.' })).toBeVisible();
	const number = await page.getByTestId('safe-to-spend').innerText();

	const idOf = async (path: string, name: RegExp) => {
		await page.goto(path);
		const link = page.getByRole('link', { name }).first();
		const href = (await link.getAttribute('href')) ?? '';
		const match = ID_AT_END.exec(href);
		expect(match, `no link for ${name} on ${path}`).not.toBeNull();
		return match![1]!;
	};
	return {
		item: await idOf('/schedule', new RegExp(`${label} rent`)),
		loan: await idOf('/loans', new RegExp(`${label} loan`)),
		expense: await idOf('/expenses', new RegExp(`${label} coffee`)),
		number
	};
}

/** A person's own browser, signed out, as if on another phone. */
async function person(browser: Browser, baseURL: string) {
	const context = await browser.newContext({ baseURL, storageState: SIGNED_OUT, locale: 'en-US' });
	return { context, page: await context.newPage() };
}

async function expectNotFound(page: Page, path: string) {
	const response = await page.goto(path);
	expect(response?.status(), path).toBe(404);
}

test('TSK-3ad574 TSK-2ad8f3 two people stay apart, a passkey signs one in, and deleting one leaves the other', async ({
	browser,
	baseURL
}) => {
	test.setTimeout(180_000);
	const a = await person(browser, baseURL!);
	const b = await person(browser, baseURL!);
	const emailA = newEmail();
	const emailB = newEmail();

	// Two people sign up from their own addresses and set up minimal budgets.
	await signUp(a.page, { email: emailA, address: newAddress() });
	await setUp(a.page);
	const budgetA = await addBudget(a.page, 'Alder');
	await signUp(b.page, { email: emailB, address: newAddress() });
	await setUp(b.page);
	const budgetB = await addBudget(b.page, 'Birch');
	expect(budgetA.item).not.toBe(budgetB.item);

	// Neither can open the other's loan, expense or schedule item by its address.
	for (const [page, theirs] of [
		[a.page, budgetB],
		[b.page, budgetA]
	] as const) {
		await expectNotFound(page, `/schedule/${theirs.item}`);
		await expectNotFound(page, `/loans/${theirs.loan}`);
		await expectNotFound(page, `/expenses/${theirs.expense}`);
	}

	// A adds a passkey in Settings, Security.
	await addVirtualAuthenticator(a.context, a.page);
	await a.page.goto('/settings/security');
	await a.page.waitForLoadState('networkidle');
	await a.page.getByLabel('Name this device').fill('Alder laptop');
	await a.page.getByRole('button', { name: 'Unlock with this device' }).click();
	await expect(a.page.getByText('Device added.')).toBeVisible();
	await expect(a.page.getByTestId('passkey')).toHaveCount(1);

	// A signs out everywhere: B is still signed in. A comes back with the passkey alone.
	await a.page.getByRole('button', { name: 'Sign out everywhere, this device too' }).click();
	await expect(a.page).toHaveURL(/\/signin/);
	await b.page.goto('/');
	await expect(b.page.getByTestId('safe-to-spend')).toHaveText(budgetB.number);
	await a.page.waitForLoadState('networkidle');
	await a.page.getByRole('button', { name: "Use this device's PIN, fingerprint or face" }).click();
	await expect(a.page.getByTestId('safe-to-spend')).toHaveText(budgetA.number);

	// B's Your account page: where to get the data, and the way out.
	await b.page.goto('/settings/account');
	await expect(b.page.getByRole('heading', { name: 'Your account' })).toBeVisible();
	await expect(b.page.getByRole('link', { name: 'go to Backup' })).toBeVisible();
	await expect(b.page.getByRole('link', { name: 'privacy notice' })).toBeVisible();
	await expect(b.page.getByRole('link', { name: 'terms of use' })).toBeVisible();

	// Deleting needs a fresh confirmation (signing up gave one) and the word typed out.
	await b.page.waitForLoadState('networkidle');
	await b.page.getByLabel('Type DELETE to confirm').fill('delete please');
	await b.page.getByRole('button', { name: 'Delete my account for good' }).click();
	await expect(b.page.getByRole('alert')).toContainText('Type DELETE');
	await b.page.getByLabel('Type DELETE to confirm').fill('DELETE');
	await b.page.getByRole('button', { name: 'Delete my account for good' }).click();

	// B lands on the sign-in page with a plain message, signed out.
	await expect(b.page).toHaveURL(/\/signin$/);
	await expect(b.page.getByRole('status')).toContainText('Your account was deleted');
	await b.page.goto('/settings/account');
	await expect(b.page).toHaveURL(/\/signin/);

	// B cannot sign in again with the email and password.
	await presentAs(b.page, newAddress());
	await b.page.goto('/signin');
	await b.page.waitForLoadState('networkidle');
	await b.page.getByLabel('Email').fill(emailB);
	await b.page.getByLabel('Password', { exact: true }).fill(PEOPLE_PASSWORD);
	await b.page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(b.page.getByRole('alert')).toBeVisible();
	await expect(b.page).toHaveURL(/\/signin/);

	// A is unaffected: still signed in, the same number, the same items.
	await a.page.goto('/');
	await expect(a.page.getByTestId('safe-to-spend')).toHaveText(budgetA.number);
	expect((await a.page.goto(`/schedule/${budgetA.item}`))?.status()).toBe(200);
	expect((await a.page.goto(`/loans/${budgetA.loan}`))?.status()).toBe(200);
	expect((await a.page.goto(`/expenses/${budgetA.expense}`))?.status()).toBe(200);

	await a.context.close();
	await b.context.close();
});
