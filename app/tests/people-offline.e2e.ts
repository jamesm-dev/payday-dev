import type { BrowserContext, Locator, Page } from './support/test.ts';
import { parseMinor } from '../src/lib/domain/money.ts';
import { moneyText } from '../src/lib/format.ts';
import { SIGNED_OUT } from './support/auth.ts';
import { newAddress, newEmail, PEOPLE_PASSWORD, presentAs, signUp } from './support/people.ts';
import { expect, test, untilStarted } from './support/test.ts';

/*
 * Phase 11, works without signal (ADR-0024, ADR-0029), with the service worker on and the network
 * really off. Each person has an account of their own, so nothing here touches the shared owner's
 * budget. A sign-up costs one of the site's 30 an hour, so the steps share one person per project.
 */
test.use({
	storageState: SIGNED_OUT,
	serviceWorkers: 'allow',
	locale: 'en-US',
	timezoneId: 'America/New_York'
});

const STORE = { copy: 'payday-offline-copy', queue: 'payday-offline-queue' };

/** Signs a new person up and through the shortest guided setup, onto a home screen with a number. */
async function newPersonWithBudget(page: Page, email: string) {
	await signUp(page, { email, address: newAddress() });
	await page.getByRole('link', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/setup$/);
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('heading', { name: 'Your currency and time zone' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your pay' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Pay each payday').fill('1,850.00');
	await page.getByLabel('Your last or next payday').fill('2026-01-09');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'What is in your account today?' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Balance', { exact: true }).fill('2,300.00');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: "That's all" }).click();
	await expect(page.getByRole('heading', { name: 'Loan payments' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: "That's all" }).click();
	await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
	await page.getByRole('button', { name: 'Open Payday' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByTestId('safe-to-spend')).toBeVisible();
	await page.waitForLoadState('networkidle');
}

/** Waits until the service worker has the app shell and controls this page. */
async function workerReady(page: Page) {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) {
			await new Promise((done) =>
				navigator.serviceWorker.addEventListener('controllerchange', done, { once: true })
			);
		}
	});
}

/**
 * Turns the network off and reloads until the offline page shows: the browser can take a moment to
 * put the service worker offline too, and until then a reload still reaches the server.
 */
async function goOffline(context: BrowserContext, page: Page) {
	await context.setOffline(true);
	await expect(async () => {
		await page.reload();
		await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible({
			timeout: 2_000
		});
	}).toPass({ timeout: 20_000 });
	await expect(page.getByTestId('offline-from')).toBeVisible();
}

/**
 * Turns the network back on. The offline page reloads itself when the browser says it is online;
 * if it has not yet, this reloads it, until `ready` (something only the real page shows) is there.
 */
async function backOnline(context: BrowserContext, page: Page, ready: Locator) {
	await context.setOffline(false);
	await expect(async () => {
		if (await page.getByRole('heading', { name: "You're offline" }).isVisible()) {
			await page.reload();
			await untilStarted(page);
		}
		await expect(ready).toBeVisible({ timeout: 3_000 });
	}).toPass({ timeout: 20_000 });
}

/** Only the real home screen has the balance form. */
const homeReady = (page: Page) => page.getByText('Update my balance');

const amountOf = async (page: Page) =>
	parseMinor((await page.getByTestId('safe-to-spend').innerText()).replace(/[^\d.,-]/g, ''));

async function logExpense(page: Page, amount: string, note: string) {
	await page.getByLabel('Add an expense').fill(amount);
	await page.getByLabel('What was it for?').fill(note);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
}

const stored = (page: Page) =>
	page.evaluate(
		(keys) => ({
			copy: localStorage.getItem(keys.copy),
			queue: JSON.parse(localStorage.getItem(keys.queue) ?? '[]') as { id: string; state: string }[]
		}),
		STORE
	);

/** The rows of the expense list on the home screen with this note, saved or not. */
const rows = (page: Page, note: string) =>
	page.getByTestId('expenses-since').getByRole('listitem').filter({ hasText: note });

test('TSK-e87f11 TSK-6ff9b3 TSK-b90a33 TSK-faf834 with no signal: the last number, an expense kept, saved once back online', async ({
	page,
	context,
	browserName
}) => {
	test.slow();
	const email = newEmail();
	await newPersonWithBudget(page, email);
	const before = await amountOf(page);
	await workerReady(page);

	await test.step('with the network off, the home screen shows the last number, dated', async () => {
		await goOffline(context, page);
		await expect(page.getByTestId('offline-from')).toContainText('Offline: from');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(moneyText(before, 'USD'));
		await expect(page.getByTestId('copy-old')).toHaveCount(0);
	});

	await test.step('an expense logged offline lowers the number at once, marked not sent yet', async () => {
		await logExpense(page, '12.50', 'Groceries');
		await expect(page.getByTestId('kept-on-phone')).toBeVisible();
		await expect(rows(page, 'Groceries')).toHaveCount(1);
		await expect(rows(page, 'Groceries')).toContainText('Not sent yet');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 1250, 'USD'));
		// The site's own checks run on the phone too.
		await logExpense(page, '0', 'Nothing');
		await expect(page.getByText('Enter an amount above zero.')).toBeVisible();
		await expect(rows(page, 'Nothing')).toHaveCount(0);
	});

	await test.step('every other page says it needs a connection', async () => {
		await page.goto('/plan');
		await expect(page.getByTestId('needs-connection')).toContainText(
			'This page needs a connection'
		);
		// The copy is still there, with the expense not sent yet.
		await expect(page.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 1250, 'USD'));
		await page.goto('/');
		await expect(page.getByTestId('needs-connection')).toHaveCount(0);
		await expect(page.getByTestId('offline-from')).toBeVisible();
	});

	const kept = (await stored(page)).queue;
	expect(kept).toHaveLength(1);

	await test.step('back online, it is saved on the site once', async () => {
		await backOnline(context, page, homeReady(page));
		await expect(page.getByTestId('not-sent')).toHaveCount(0);
		await expect(rows(page, 'Groceries')).toHaveCount(1);
		await expect(page.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 1250, 'USD'));
		await expect.poll(async () => (await stored(page)).queue).toEqual([]);
	});

	await test.step('sent a second time, the site saves nothing more', async () => {
		await page.evaluate(
			({ key, item }) => localStorage.setItem(key, JSON.stringify([{ ...item, state: 'waiting' }])),
			{ key: STORE.queue, item: kept[0]! }
		);
		await page.reload();
		await expect.poll(async () => (await stored(page)).queue).toEqual([]);
		await page.reload();
		await expect(rows(page, 'Groceries')).toHaveCount(1);
		await expect(page.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 1250, 'USD'));
		await page.goto('/expenses');
		await expect(page.getByRole('main').getByText('Groceries')).toHaveCount(1);
	});

	await test.step('a change made offline says it was not saved', async () => {
		// Playwright's WebKit on Windows crashes the page whenever the page itself opens another one
		// with the network off: a plain link does it too, while the same steps pass on Chromium. So
		// this step, which needs exactly that, runs on Chromium; an iPhone is checked by hand.
		if (browserName === 'webkit') {
			test.info().annotations.push({
				type: 'not on webkit',
				description: 'a page-started navigation with the network off crashes this WebKit build'
			});
			return;
		}
		await page.getByRole('main').getByText('Groceries').click();
		await expect(page.getByLabel('Amount')).toBeVisible();
		await page.waitForLoadState('networkidle');
		await context.setOffline(true);
		await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
		await page.getByLabel('Amount').fill('99.00');
		await page.getByRole('button', { name: /save/i }).click();
		await expect(page.getByTestId('needs-connection')).toContainText('That was not saved');
		await backOnline(context, page, homeReady(page));
		await expect(page.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 1250, 'USD'));
	});

	await test.step('signing out asks about an expense not sent yet, then removes it', async () => {
		await goOffline(context, page);
		await logExpense(page, '7.00', 'Taxi');
		await expect(rows(page, 'Taxi')).toContainText('Not sent yet');
		// To Settings while still offline: there, coming back online does not send the queue.
		await page.goto('/settings');
		const signOut = page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true });
		await backOnline(context, page, signOut);
		await page.waitForLoadState('networkidle');

		page.once('dialog', (dialog) => {
			expect(dialog.message()).toContain('One expense on this phone has not been sent yet');
			void dialog.dismiss();
		});
		await signOut.click();
		await expect(page).toHaveURL(/\/settings$/);
		expect((await stored(page)).queue).toHaveLength(1);

		page.once('dialog', (dialog) => void dialog.accept());
		await signOut.click();
		await expect(page).toHaveURL(/\/signin$/);
		expect(await stored(page)).toEqual({ copy: null, queue: [] });
		await expect(page.getByTestId('unsent-on-phone')).toHaveCount(0);
	});

	await test.step('signed out another way, the copy goes and the sign-in page asks', async () => {
		await untilStarted(page);
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password', { exact: true }).fill(PEOPLE_PASSWORD);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		await page.waitForLoadState('networkidle');
		await workerReady(page);
		await goOffline(context, page);
		await logExpense(page, '3.20', 'Coffee');
		await expect(rows(page, 'Coffee')).toContainText('Not sent yet');
		// The session ends somewhere else (it expired, or "sign out everywhere").
		await context.clearCookies();
		await presentAs(page, newAddress());
		await backOnline(context, page, page.getByRole('link', { name: 'Sign in' }).first());
		await page.goto('/signin');
		await expect(page.getByTestId('unsent-on-phone')).toContainText(
			'This phone has 1 expense that was not sent yet'
		);
		await expect.poll(async () => (await stored(page)).copy).toBeNull();
		await page.getByRole('button', { name: 'Remove it from this phone' }).click();
		await expect(page.getByText('Removed from this phone.')).toBeVisible();
		expect(await stored(page)).toEqual({ copy: null, queue: [] });
	});
});

test('TSK-e377f0 two phones each log an expense offline, and both end with each once', async ({
	page,
	context,
	browser,
	baseURL
}, info) => {
	test.slow();
	const email = newEmail();
	await newPersonWithBudget(page, email);
	const before = await amountOf(page);
	await workerReady(page);

	// The second phone: the same person, signed in on a device of their own.
	const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
	const second = await browser.newContext({
		viewport,
		userAgent,
		deviceScaleFactor,
		isMobile,
		hasTouch,
		storageState: SIGNED_OUT,
		serviceWorkers: 'allow',
		locale: 'en-US',
		timezoneId: 'America/New_York',
		baseURL
	});
	const other = await second.newPage();
	try {
		await presentAs(other, newAddress());
		await other.goto('/signin');
		await untilStarted(other);
		await other.waitForLoadState('networkidle');
		await other.getByLabel('Email').fill(email);
		await other.getByLabel('Password', { exact: true }).fill(PEOPLE_PASSWORD);
		await other.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(other.getByTestId('safe-to-spend')).toHaveText(moneyText(before, 'USD'));
		await other.waitForLoadState('networkidle');
		await workerReady(other);

		await goOffline(context, page);
		await goOffline(second, other);
		await logExpense(page, '10.00', 'Lunch on phone one');
		await logExpense(other, '4.00', 'Bus on phone two');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 1000, 'USD'));
		await expect(other.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 400, 'USD'));

		await backOnline(context, page, homeReady(page));
		await expect(page.getByTestId('not-sent')).toHaveCount(0);
		await backOnline(second, other, homeReady(other));
		await expect(other.getByTestId('not-sent')).toHaveCount(0);

		for (const phone of [page, other]) {
			await phone.reload();
			await untilStarted(phone);
			await expect(rows(phone, 'Lunch on phone one')).toHaveCount(1);
			await expect(rows(phone, 'Bus on phone two')).toHaveCount(1);
			await expect(phone.getByTestId('not-sent')).toHaveCount(0);
			await expect(phone.getByTestId('safe-to-spend')).toHaveText(moneyText(before - 1400, 'USD'));
		}
	} finally {
		await second.close();
	}
});

test('TSK-faf834 another person signing in on the phone removes the first person’s copy and queue', async ({
	page,
	context
}, info) => {
	// Two sign-ups; the phone project covers the rest of this file.
	test.skip(info.project.name !== 'people-laptop', 'run once, on the laptop');
	test.slow();
	await newPersonWithBudget(page, newEmail());
	await workerReady(page);
	await goOffline(context, page);
	await logExpense(page, '5.00', 'First person');
	await expect(rows(page, 'First person')).toContainText('Not sent yet');
	const first = await stored(page);
	expect(first.queue).toHaveLength(1);

	await context.clearCookies();
	await backOnline(context, page, page.getByRole('link', { name: 'Sign in' }).first());
	await newPersonWithBudget(page, newEmail());
	await expect(rows(page, 'First person')).toHaveCount(0);
	const now = await stored(page);
	expect(now.queue).toEqual([]);
	expect(now.copy).not.toBeNull();
	expect(JSON.parse(now.copy!).owner).not.toBe(JSON.parse(first.copy!).owner);
});
