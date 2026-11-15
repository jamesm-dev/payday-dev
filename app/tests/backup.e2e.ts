import { expect, test, type Page } from './support/test.ts';
import { OWNER_PASSWORD, SIGNED_OUT } from './support/auth.ts';

/*
 * The backup file: downloaded behind the 5-minute confirmation, refused when it is not a Payday
 * backup, and restored (the budget replaced, the number back exactly). It changes the shared
 * household for a moment, so it runs in its own project after the read-only ones and ends by
 * restoring the file it downloaded: the household is as it was found. The file is fetched with the
 * page's own session, not a download event: WebKit on Linux does not fire one for every type.
 */

const HEADERS = { 'x-forwarded-proto': 'http', 'x-forwarded-for': '203.0.113.64' };
const word = (page: Page) => page.getByLabel('Type DELETE to confirm');
const file = (page: Page) => page.getByLabel(/^Backup file/);
const replace = (page: Page) =>
	page.getByRole('button', { name: 'Replace my budget with this backup' });

async function confirmOwner(page: Page) {
	await page.goto('/settings/security');
	await page.waitForLoadState('networkidle'); // the form is safe to use once the page has hydrated
	// Still confirmed from a moment ago (the page then offers no password box): nothing to do. Asking
	// every time means no step runs at the edge of the 5 minutes.
	const password = page.getByLabel('Password', { exact: true });
	if (await password.count()) {
		await password.fill(OWNER_PASSWORD);
		await page.getByRole('button', { name: 'Confirm with your password' }).click();
	}
	await expect(page.getByText('Confirmed. This lasts 5 minutes.')).toBeVisible();
	// The confirmation is a plain form post: let its page finish loading, or WebKit reports the next
	// page.goto as "Frame load interrupted".
	await page.waitForLoadState('networkidle');
}

async function number(page: Page) {
	await page.goto('/');
	return (await page.getByTestId('safe-to-spend').textContent())!.trim();
}

async function upload(page: Page, text: string, typed = 'DELETE') {
	await confirmOwner(page);
	await page.goto('/settings/backup');
	await file(page).setInputFiles({
		name: 'backup.json',
		mimeType: 'application/json',
		buffer: Buffer.from(text)
	});
	await word(page).fill(typed);
	await replace(page).click();
}

test.describe('TSK-F3FBD8 TSK-818581 TSK-2FB11D TSK-B78EFD download a full backup, refuse a bad file, restore a good one', () => {
	test('the round trip, behind the confirmation', async ({ page, browser, baseURL }) => {
		const before = await number(page);

		// Never downloaded: Settings says so, and suggests one.
		await page.goto('/settings');
		await expect(page.getByTestId('backup-sub')).toContainText('not downloaded a backup yet');
		await page.goto('/settings/backup');
		await expect(page.getByTestId('last-backup')).toContainText('not downloaded a backup yet');
		await expect(page.getByTestId('backup-due')).toBeVisible();
		await expect(page.getByText('It holds your whole budget in plain text')).toBeVisible();

		// Signed out, the route is not there to be fetched. (An unconfirmed session cannot be tested
		// here: every session in this run signed in with a password minutes ago, which counts as a
		// confirmation, and five minutes cannot be waited out.)
		const signedOut = await browser.newContext({
			serviceWorkers: 'block',
			baseURL,
			storageState: SIGNED_OUT,
			extraHTTPHeaders: HEADERS
		});
		const away = await signedOut.request.get('/settings/backup/download', {
			headers: { accept: 'text/html' },
			maxRedirects: 0
		});
		expect([away.status(), away.headers().location ?? (await away.text()).slice(0, 80)]).toEqual([
			303,
			'/signin?next=%2Fsettings%2Fbackup%2Fdownload'
		]);
		const api = await signedOut.request.get('/settings/backup/download', { maxRedirects: 0 });
		expect(api.status()).toBe(401);
		await signedOut.close();

		await confirmOwner(page);
		await page.goto('/settings/backup');
		const href = await page
			.getByRole('link', { name: 'Download a full backup' })
			.getAttribute('href');
		// The link may be relative to the page (SvelteKit's resolve), so resolve it as the browser would.
		const target = new URL(href!, page.url()).pathname;
		expect(target).toBe('/settings/backup/download');
		const response = await page.request.get(new URL(href!, page.url()).href);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-disposition']).toMatch(
			/^attachment; filename="payday-backup-\d{4}-\d{2}-\d{2}\.json"$/
		);
		expect(response.headers()['cache-control']).toBe('private, no-store');
		const text = await response.text();
		const doc = JSON.parse(text);
		// Version 2 since Phase 7: it carries the main pay and a second day of the month.
		expect(doc).toMatchObject({ format: 'payday-backup', version: 2 });
		expect(doc.scheduleItems.length).toBeGreaterThan(0);
		expect(text).not.toMatch(/password|passkey|recovery|session|endpoint/i);

		// Now it says when, and stops nagging.
		await page.goto('/settings/backup');
		await expect(page.getByTestId('last-backup')).toContainText('Last downloaded on');
		await expect(page.getByTestId('backup-due')).toHaveCount(0);
		await page.goto('/settings');
		await expect(page.getByTestId('backup-sub')).not.toContainText('Download one now');

		// A file that is not a backup, or is from a newer version, changes nothing, in words.
		await upload(page, 'this is not a backup');
		await expect(page.getByRole('alert')).toContainText('not a Payday backup');
		await expect(page.getByRole('alert')).toContainText('nothing was changed');
		await upload(page, JSON.stringify({ ...doc, version: 3 }));
		await expect(page.getByRole('alert')).toContainText('newer version');
		const broken = {
			...doc,
			loans: doc.loans.map((l: object) => ({ ...l, scheduleItemId: 9999 }))
		};
		await upload(page, JSON.stringify(broken));
		await expect(page.getByRole('alert')).toContainText('does not add up');
		// The word is asked for too.
		await upload(page, text, 'nope');
		await expect(page.getByRole('alert')).toContainText('Type DELETE');
		expect(await number(page)).toBe(before);

		// A different budget (a bigger balance) replaces this one; the original brings the number back exactly.
		const richer = structuredClone(doc);
		richer.accounts[0].balanceMinor += 123400;
		await upload(page, JSON.stringify(richer));
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByText('Your backup is restored.')).toBeVisible();
		expect(await number(page)).not.toBe(before);

		await upload(page, text);
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByText('Your backup is restored.')).toBeVisible();
		expect(await number(page)).toBe(before);
	});
});
