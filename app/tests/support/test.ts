import { test as base, type Page } from '@playwright/test';

/*
 * Playwright's own `test`, with one change: `page.goto` waits for the page to have STARTED, both the
 * page it leaves and the page it opens. Every browser test imports `test` and `expect` from here.
 *
 * Why: once a page has loaded, SvelteKit's client starts and writes its first history entry
 * (history.replaceState with 'sveltekit:metadata'), a few milliseconds after the load event. WebKit
 * reports that as a navigation, so a page.goto made in the same instant was "interrupted by another
 * navigation" to the page it was leaving, on a busy machine and in CI. The wait is that start-up, not
 * a fixed time: a page without SvelteKit's client (csr = false, about:blank) has nothing to wait for.
 */

export * from '@playwright/test';

/** True once there is nothing left to start: no SvelteKit client, or one that has started. */
function started(): boolean {
	const kit = Object.keys(window).some((key) => key.startsWith('__sveltekit_'));
	if (!kit) return true;
	return document.readyState === 'complete' && Boolean(history.state?.['sveltekit:metadata']);
}

/** Waits until the page has started (see above). A page that never does is for the test to judge. */
export async function untilStarted(page: Page): Promise<void> {
	try {
		await page.waitForFunction(started, undefined, { timeout: 10_000 });
	} catch {
		// Never started, or navigated away mid-wait: the test's own expectations decide what that means.
	}
}

export const test = base.extend({
	page: async ({ page, javaScriptEnabled }, use) => {
		// Without JavaScript nothing starts, and there is nothing to wait for.
		if (javaScriptEnabled !== false) {
			const goto = page.goto.bind(page);
			page.goto = async (url: string, options?: Parameters<Page['goto']>[1]) => {
				await untilStarted(page);
				const response = await goto(url, options);
				await untilStarted(page);
				return response;
			};
		}
		await use(page);
	}
});
