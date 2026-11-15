import { expect, test } from './support/test.ts';
import { SIGNED_OUT } from './support/auth.ts';
import {
	fillSignUp,
	newAddress,
	newEmail,
	PEOPLE_PASSWORD,
	presentAs,
	signUp
} from './support/people.ts';

/*
 * Phase 9: a stranger signs up. Each test starts signed out, as a Filipino visitor would arrive
 * (English, Manila time). Nothing here touches the shared owner's budget: the accounts are new. A
 * sign-up costs one of the site's 30 an hour, so the tests make as few accounts as they can.
 */
test.use({ storageState: SIGNED_OUT, locale: 'en-PH', timezoneId: 'Asia/Manila' });

const email = newEmail();

test.describe.serial('TSK-a9d999 a new person signs up', () => {
	test('TSK-a9d999 TSK-01b260 TSK-4d0fc2 TSK-be6817 sign up, save the codes once, and land in setup', async ({
		page,
		context
	}) => {
		const answer = page.waitForResponse(
			(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/signin/new'
		);
		const codes = await signUp(page, { email, address: newAddress() });

		// TSK-01b260: ten codes, in plain words that they are the only way back in, shown now.
		expect(codes).toHaveLength(10);
		await expect(page.getByText('the only way back in')).toBeVisible();
		await expect(page.getByText('Payday cannot reset a password by email')).toBeVisible();
		await expect(page.getByText('This is the only time they are shown.')).toBeVisible();

		// TSK-be6817: the same locked-down session cookie. The server's own Set-Cookie header says
		// what it asked for, whatever each engine's cookie jar later reports (WebKit's SameSite differs).
		const header = (await (await answer).allHeaders())['set-cookie'] ?? '';
		expect(header).toMatch(/^session=[A-Za-z0-9_-]{43};/);
		expect(header).toContain('HttpOnly');
		expect(header).toContain('SameSite=Lax');
		expect(header).toContain('Path=/');
		const cookie = (await context.cookies()).find((c) => /session$/.test(c.name));
		expect(cookie).toMatchObject({ httpOnly: true, path: '/' });

		// A reload does not show them again: a signed-in person is sent on.
		await page.reload();
		await expect(page.getByTestId('recovery-code')).toHaveCount(0);
		await expect(page).toHaveURL(/\/setup$/);

		await expect(page.getByRole('heading', { name: "Let's set up Payday" })).toBeVisible();

		// TSK-4d0fc2: an empty budget, and setup guesses the money and the zone from the browser.
		await page.getByRole('button', { name: 'Start' }).click();
		await expect(page.getByRole('heading', { name: 'Your currency and time zone' })).toBeVisible();
		await page.waitForLoadState('networkidle'); // the guess is made once the page has hydrated
		await expect(page.getByLabel('Currency')).toHaveValue('PHP');
		await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Manila');
	});

	test('TSK-01b260 Continue takes a new person on to setup', async ({ page }) => {
		await signUp(page, { email: newEmail(), address: newAddress() });
		await page.getByRole('link', { name: 'Continue' }).click();
		await expect(page).toHaveURL(/\/setup$/);
		await expect(page.getByRole('heading', { name: "Let's set up Payday" })).toBeVisible();
	});

	test('TSK-a9d999 an email that is taken is refused in plain words, in any case', async ({
		page
	}) => {
		await presentAs(page, newAddress());
		await fillSignUp(page, { email: email.toUpperCase() });
		await page.getByRole('button', { name: 'Create a free account' }).click();
		await expect(page.getByRole('alert')).toContainText(
			'An account with this email already exists. Sign in instead.'
		);
		await expect(page.getByRole('alert').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
			'href',
			'/signin'
		);
	});
});

test.describe('TSK-a9d999 the form refuses mistakes in plain words', () => {
	test('TSK-a9d999 two different passwords are refused, and nothing is created', async ({
		page
	}) => {
		await presentAs(page, newAddress());
		await fillSignUp(page, { email: newEmail(), again: `${PEOPLE_PASSWORD} oops` });
		await page.getByRole('button', { name: 'Create a free account' }).click();
		await expect(page.getByRole('alert')).toContainText(
			'The two passwords are not the same. Type the same one twice.'
		);
		await expect(page.getByRole('heading', { name: 'Create a free account' })).toBeVisible();
	});

	test('TSK-a9d999 the page says plainly that no email is sent', async ({ page }) => {
		await page.goto('/signin/new');
		await expect(page.getByText('Payday does not check or email this address')).toBeVisible();
	});
});
