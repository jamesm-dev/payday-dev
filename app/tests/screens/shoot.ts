import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '../support/test.ts';
import { SIGNED_OUT } from '../support/auth.ts';

/*
 * The product page's pictures of the app (TSK-161509), taken from the real app with a made-up
 * household: paid twice a month in pesos, a few bills and a motorcycle loan, set up through guided
 * setup like anyone would. Run with `pnpm screens` after a change the screens should show; the
 * files are committed. Each picture is the top of a phone screen, 360 by 720 CSS pixels at twice
 * the density, saved as WebP (encoded by the browser, so no image tool is needed).
 */

const OUT = join(import.meta.dirname, '../../static/landing');

const PAY = '18,000.00';
const BALANCE = '9,500.00';
const BILLS = [
	{ name: 'Rent', amount: '6,500.00', day: '5' },
	{ name: 'Electricity', amount: '1,800.00', day: '20' },
	{ name: 'Internet', amount: '1,299.00', day: '10' },
	{ name: 'Water', amount: '450.00', day: '22' }
];
const YEARLY = { name: 'Motorcycle registration', amount: '1,800.00' };
const LOAN = { name: 'Motorcycle loan', amount: '3,250.00', day: '28' };

test.use({
	viewport: { width: 360, height: 720 },
	deviceScaleFactor: 2,
	isMobile: true,
	hasTouch: true,
	reducedMotion: 'reduce'
});

/** A day about ten months from today, as the date field takes it (YYYY-MM-DD). */
function monthsAhead(months: number): string {
	const d = new Date();
	d.setMonth(d.getMonth() + months);
	return d.toISOString().slice(0, 10);
}

/** Encodes a PNG screenshot as WebP in the browser, and writes it under static/landing/. */
async function save(page: Page, png: Buffer, name: string, quality = 0.82) {
	const encoder = await page.context().newPage();
	const dataUrl = await encoder.evaluate(
		async ({ src, q }) => {
			const image = new Image();
			image.src = src;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			canvas.getContext('2d')!.drawImage(image, 0, 0);
			return canvas.toDataURL('image/webp', q);
		},
		{ src: `data:image/png;base64,${png.toString('base64')}`, q: quality }
	);
	await encoder.close();
	const file = join(OUT, name);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

/** The page as a phone shows it: from the top, or from `from` when the top is only words. */
async function shoot(page: Page, path: string, name: string, from?: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
	await page.evaluate(() => document.fonts.ready);
	if (from) {
		await page
			.locator(from)
			.first()
			.evaluate((el) => {
				window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16);
			});
	}
	await save(page, await page.screenshot({ type: 'png' }), name);
}

test('photographs the home screen, the plan and the loans for the product page', async ({
	page,
	browser,
	baseURL
}) => {
	test.setTimeout(180_000);

	// Guided setup, as a new person in Manila would do it.
	await page.goto('/setup');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('heading', { name: 'Your currency and time zone' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Currency').selectOption('PHP');
	await page.getByLabel('Time zone').selectOption('Asia/Manila');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Your pay' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Pay each payday').fill(PAY);
	await page.getByRole('radio', { name: /Twice a month/ }).check();
	await page.getByLabel('First day of the month you are paid').fill('15');
	await page.getByLabel('Second day of the month you are paid').fill('31');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'What is in your account today?' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Balance', { exact: true }).fill(BALANCE);
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	for (const bill of BILLS) {
		await page.getByLabel('What is it called?').fill(bill.name);
		await page.getByLabel('How much is each payment?').fill(bill.amount);
		await page.getByRole('radio', { name: 'Every month' }).check();
		await page.getByLabel('Day of the month').fill(bill.day);
		await page.getByRole('button', { name: 'Add another' }).click();
		await expect(page.getByTestId('added')).toContainText(bill.name);
		await page.waitForLoadState('networkidle');
	}
	await page.getByLabel('What is it called?').fill(YEARLY.name);
	await page.getByLabel('How much is each payment?').fill(YEARLY.amount);
	await page.getByRole('radio', { name: 'Every year' }).check();
	await page.getByLabel('Date of the next payment').fill(monthsAhead(10));
	await page.getByRole('button', { name: "That's all" }).click();

	await expect(page.getByRole('heading', { name: 'Loan payments' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('What is it called?').fill(LOAN.name);
	await page.getByLabel('How much is each payment?').fill(LOAN.amount);
	await page.getByRole('radio', { name: 'Every month' }).check();
	await page.getByLabel('Day of the month').fill(LOAN.day);
	await page.getByRole('button', { name: "That's all" }).click();

	await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
	await page.getByRole('button', { name: 'Open Payday' }).click();
	await expect(page.getByTestId('safe-to-spend')).toBeVisible();

	// The loan payment becomes a loan, so the loans page has a balance and a debt-free date.
	await page.goto('/schedule');
	await page
		.getByRole('link', { name: new RegExp(LOAN.name) })
		.first()
		.click();
	await page.getByRole('button', { name: 'This is a loan' }).click();
	await page
		.getByTestId('kinds')
		.getByRole('link', { name: /Loan with fixed payments/ })
		.click();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Who is it with?').fill('Lending company');
	await page.getByLabel('How much is left to pay?').fill('39,000.00');
	await page.getByLabel('Yearly interest rate, in percent').fill('12');
	await page.getByRole('button', { name: 'Save this loan' }).click();
	await expect(page).toHaveURL(/\/loans$/);

	await shoot(page, '/', 'home.webp');
	await shoot(page, '/plan', 'plan.webp', '[id^="paycheck-"]');
	await shoot(page, '/loans', 'loans.webp');

	// The link preview (Open Graph): the product page's first screen at 1200 by 630.
	const visitor = await browser.newContext({
		baseURL,
		storageState: SIGNED_OUT,
		viewport: { width: 1200, height: 630 },
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		serviceWorkers: 'block'
	});
	// The server was built before these pictures existed: hand it the one just taken.
	await visitor.route('**/landing/home.webp', (route) =>
		route.fulfill({ path: join(OUT, 'home.webp'), contentType: 'image/webp' })
	);
	const front = await visitor.newPage();
	await front.goto('/');
	await front.waitForLoadState('networkidle');
	await front.evaluate(() => document.fonts.ready);
	writeFileSync(join(OUT, 'og.png'), await front.screenshot({ type: 'png' }));
	await visitor.close();
});
