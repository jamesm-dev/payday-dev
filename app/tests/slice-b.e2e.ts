import { expect, test, type Page } from '@playwright/test';

/*
 * Read-only checks of the check-in and loan screens: page headers and back links, the loan cards
 * as single links, the kinds of loan as rows, and the paid-off confirm that stays closed. Nothing
 * here submits a form. A check-in's steps (its progress bar, its balance field-and-button row)
 * need a check-in started, which changes the household, so the steps are covered where the
 * check-in is run, in checkin.e2e.ts; the saved-message check that changes data is in
 * marks.e2e.ts.
 */

async function box(locator: ReturnType<Page['locator']>) {
	const b = await locator.boundingBox();
	expect(b).not.toBeNull();
	return b!;
}

test.describe('check-in headers', () => {
	test('the start page has a title, a description and the start button before Past check-ins', async ({
		page
	}) => {
		await page.goto('/checkin');
		await expect(page.getByRole('heading', { name: 'Payday check-in', level: 1 })).toBeVisible();
		await expect(page.locator('.page-header .description')).toContainText('about five minutes');
		const start = await box(page.getByRole('button', { name: 'Start my check-in', exact: true }));
		const past = await box(page.getByRole('link', { name: 'Past check-ins', exact: true }));
		expect(past.y + past.height).toBeGreaterThan(start.y + start.height - 1);
		await expect(page.getByText('Back to the check-in')).toHaveCount(0);
	});

	test('the history leads back to the check-in and its rows are plain, not links', async ({
		page
	}) => {
		await page.goto('/checkin/history');
		await expect(page.getByRole('heading', { name: 'Past check-ins', level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to Payday check-in' })).toHaveAttribute(
			'href',
			/\/checkin$/
		);
		const rows = page.getByTestId('history-row');
		expect(await rows.count()).toBeGreaterThan(0);
		await expect(rows.first().getByRole('link')).toHaveCount(0);
	});
});

test.describe('the loans list', () => {
	test('each loan is one card and one link, at least 56px tall, with a chevron', async ({
		page
	}) => {
		await page.goto('/loans');
		await expect(page.getByRole('heading', { name: 'What I owe', level: 1 })).toBeVisible();
		const cards = page.getByTestId('loan');
		expect(await cards.count()).toBeGreaterThan(0);
		for (const card of await cards.all()) {
			await expect(card.getByRole('link')).toHaveCount(1);
			const link = card.locator('a.loan-link');
			expect((await box(link)).height).toBeGreaterThanOrEqual(56);
			const chevron = await link.evaluate((a) => getComputedStyle(a, '::after').content);
			expect(chevron).not.toBe('none');
			await expect(link).toHaveAttribute('href', /\/loans\/\d+$/);
			await expect(card.getByTestId('loan-balance')).toBeVisible();
		}
	});

	test('"Add a loan" is a small secondary button level with the section title', async ({
		page
	}) => {
		await page.goto('/loans');
		const add = page.getByRole('link', { name: 'Add a loan', exact: true });
		await expect(add).toHaveClass(/secondary/);
		await expect(add).toHaveClass(/small/);
		const title = await box(page.getByRole('heading', { name: 'Each loan', exact: true }));
		const button = await box(add);
		const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
		expect(Math.abs(centre(title) - centre(button))).toBeLessThanOrEqual(2);
		expect(button.height).toBeGreaterThanOrEqual(44);
	});
});

test.describe('adding a loan', () => {
	test('the kinds of loan are rows with a one-line description and lead back to What I owe', async ({
		page
	}) => {
		await page.goto('/loans/new');
		await expect(
			page.getByRole('heading', { name: 'What kind of loan is it?', level: 1 })
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to What I owe' })).toHaveAttribute(
			'href',
			/\/loans$/
		);
		const kinds = page.getByTestId('kinds').getByRole('listitem');
		await expect(kinds).toHaveCount(4);
		for (const item of await kinds.all()) {
			const row = item.locator('a.row');
			expect((await box(row)).height).toBeGreaterThanOrEqual(56);
			await expect(row.locator('.sub')).toBeVisible();
		}
		await page.getByRole('link', { name: /Credit card/ }).click();
		await expect(page).toHaveURL(/\/loans\/new\/credit-card$/);
		await expect(page.getByRole('link', { name: 'Back to Kinds of loan' })).toHaveAttribute(
			'href',
			/\/loans\/new$/
		);
	});
});

test.describe('one loan', () => {
	test('has its name as the title, a way back, and a paid-off confirm that starts closed', async ({
		page
	}) => {
		await page.goto('/loans');
		const first = page.getByTestId('loan').first();
		const name = await first.getAttribute('data-name');
		await first.getByRole('link').click();
		await expect(page.getByRole('heading', { name: name!, level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to What I owe' })).toHaveAttribute(
			'href',
			/\/loans$/
		);
		await expect(page.locator('.page-header .description')).toContainText('Balance');

		const confirm = page.locator('details.confirm');
		await expect(confirm).not.toHaveJSProperty('open', true);
		const submit = page.getByRole('button', { name: 'Yes, it is paid off' });
		await expect(submit).toBeHidden();
		await confirm.locator('summary').click();
		await expect(submit).toBeVisible();
		await expect(submit).toHaveClass(/danger/);
		// Never submitted: it would close a loan the other tests rely on.
	});
});
