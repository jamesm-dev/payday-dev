import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { listLines, paycheckList } from '../src/lib/domain/paycheckList.ts';
import { planPaychecks } from '../src/lib/domain/plan.ts';
import { pdfString } from '../src/lib/server/export/pdf.ts';
import { expandTabs } from '../src/lib/server/export/text.ts';
import { listEntries } from '../src/lib/server/money/paycheckListView.ts';
import { householdItems, todayNow, yesterday } from './support/household.ts';

/*
 * Read-only checks of the paycheck list downloads, on every project. Nothing here marks a bill:
 * that is marks.e2e.ts, which runs on its own afterwards. So the expected list is the engine's, from
 * the same household the plan test uses, with no group, optional or paid mark.
 */

const today = () => todayNow();
const items = () =>
	householdItems(today(), {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today()) }
	});
const paychecks = () => planPaychecks(items(), [], today(), 6);

const expectedLines = (index = 0) => {
	const p = paychecks()[index];
	return listLines(
		paycheckList(
			p.pays.map((o) => ({ name: o.name, amount: o.amount })),
			listEntries(p, items(), new Set())
		)
	);
};

/** Clicks a download link in the first paycheck and returns the file's name and bytes. */
async function download(page: Page, label: string) {
	await page.goto('/plan');
	const card = page.getByTestId('paycheck').first();
	await card.getByLabel(/^Download the list for/).click();
	const [file] = await Promise.all([
		page.waitForEvent('download'),
		card.getByTestId('downloads').getByRole('link', { name: label, exact: true }).click()
	]);
	return { name: file.suggestedFilename(), bytes: readFileSync((await file.path())!) };
}

test.describe('TSK-1BA934 each paycheck on the plan offers the three downloads', () => {
	test('every one of the six paychecks links its text file, PDF and Word document', async ({
		page,
		baseURL
	}) => {
		await page.goto('/plan');
		const cards = page.getByTestId('paycheck');
		await expect(cards).toHaveCount(6);
		for (const [i, p] of paychecks().entries()) {
			// Behind the card's menu: a closed menu's links are not on show, so open it first.
			await cards
				.nth(i)
				.getByLabel(/^Download the list for/)
				.click();
			const links = cards.nth(i).getByTestId('downloads');
			for (const [label, ext] of [
				['Text file', 'txt'],
				['PDF', 'pdf'],
				['Word', 'docx']
			]) {
				// The app writes links relative to the page; what matters is where the browser goes.
				await expect(links.getByRole('link', { name: label, exact: true })).toHaveJSProperty(
					'href',
					new URL(`/plan/${p.payday}/list.${ext}`, baseURL).href
				);
			}
		}
	});

	test('the downloads sit behind a menu on each card, which closes on Escape, outside and after a choice', async ({
		page
	}) => {
		await page.goto('/plan');
		await page.waitForLoadState('networkidle');
		await expect(page.getByText('Download this list:')).toHaveCount(0);
		const card = page.getByTestId('paycheck').first();
		const button = card.getByLabel(/^Download the list for/);
		const links = card.getByTestId('downloads').getByRole('link');
		await expect(links.first()).toBeHidden();

		await button.click();
		await expect(links).toHaveCount(3);
		await expect(links.first()).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(links.first()).toBeHidden();
		await expect(button).toBeFocused();

		await button.click();
		await page.getByRole('heading', { level: 1 }).click();
		await expect(links.first()).toBeHidden();

		// Any choice closes it. The PDF, because WebKit on Linux never downloads the text file.
		await button.click();
		await Promise.all([
			page.waitForEvent('download'),
			card.getByTestId('downloads').getByRole('link', { name: 'PDF', exact: true }).click()
		]);
		await expect(links.first()).toBeHidden();
	});

	test('a download is private, never cached, and named for its payday', async ({ page }) => {
		const { payday } = paychecks()[0];
		await page.goto('/plan');
		const response = await page.request.get(`/plan/${payday}/list.pdf`);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toBe('application/pdf');
		expect(response.headers()['cache-control']).toBe('private, no-store');
		expect(response.headers()['content-disposition']).toBe(
			`attachment; filename="payday-${payday}.pdf"`
		);
	});

	test('needs a session: with none, the list is not handed over', async ({ browser, baseURL }) => {
		const path = `/plan/${paychecks()[0].payday}/list.txt`;
		const anonymous = await browser.newContext({
			baseURL,
			storageState: { cookies: [], origins: [] }
		});
		// A link followed in the browser is sent to sign in; anything else is refused outright.
		const followed = await anonymous.request.get(path, {
			headers: { accept: 'text/html' },
			maxRedirects: 0
		});
		expect(followed.status()).toBe(303);
		expect(followed.headers()['location']).toBe(`/signin?next=${encodeURIComponent(path)}`);
		const fetched = await anonymous.request.get(path, { maxRedirects: 0 });
		expect(fetched.status()).toBe(401);
		expect(await fetched.text()).not.toContain('Total (ALL)');
		await anonymous.close();
	});

	test('refuses a payday that is not one of the six, and a format it does not write', async ({
		page
	}) => {
		await page.goto('/plan');
		expect((await page.request.get('/plan/2001-01-05/list.txt')).status()).toBe(404);
		expect((await page.request.get('/plan/not-a-day/list.txt')).status()).toBe(404);
		const { payday } = paychecks()[0];
		expect((await page.request.get(`/plan/${payday}/list.xlsx`)).status()).toBe(404);
	});
});

test.describe('TSK-92A9A7 the three downloads hold the paycheck list', () => {
	test('the text file is the list, line for line, with tabs and Windows line breaks', async ({
		page,
		browserName
	}) => {
		test.skip(
			browserName === 'webkit' && process.platform === 'linux',
			'WebKit on Linux never fires the download for text/plain; a real iPhone is checked at release'
		);
		const file = await download(page, 'Text file');
		expect(file.name).toBe(`payday-${paychecks()[0].payday}.txt`);
		const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
		expect(text).toBe(
			expectedLines()
				.map((l) => `${l}\r\n`)
				.join('')
		);
		expect(text).toContain('\tTotal (without the *OPTIONAL)\r\n');
	});

	test('the PDF draws every line of the list', async ({ page }) => {
		const file = await download(page, 'PDF');
		expect(file.name).toBe(`payday-${paychecks()[0].payday}.pdf`);
		const pdf = new TextDecoder('latin1').decode(file.bytes);
		expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
		expect(pdf.endsWith('%%EOF\n')).toBe(true);
		for (const line of expectedLines().filter(Boolean)) {
			expect(pdf).toContain(`${pdfString(expandTabs(line))} Tj`);
		}
	});

	test('the Word document holds every line, with a tab between amount and name', async ({
		page
	}) => {
		const file = await download(page, 'Word');
		expect(file.name).toBe(`payday-${paychecks()[0].payday}.docx`);
		expect([...file.bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
		// The parts are stored, not compressed, so the document's XML is readable in the bytes.
		const zip = new TextDecoder().decode(file.bytes);
		expect(zip).toContain('word/document.xml');
		for (const line of expectedLines().filter((l) => l.includes('\t'))) {
			const [amount, name] = line.split('\t');
			expect(zip).toContain(
				`<w:t xml:space="preserve">${amount}</w:t><w:tab/><w:t xml:space="preserve">${name
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')}</w:t>`
			);
		}
	});
});
