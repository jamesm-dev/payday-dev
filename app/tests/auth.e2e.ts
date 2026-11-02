import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
	addVirtualAuthenticator,
	newDevice,
	OWNER_PASSWORD,
	readOwner,
	SIGNED_OUT,
	signInWithPassword
} from './support/auth.ts';
import { HOSTILE_NEXT } from './support/hostile.ts';
import {
	listRoutes,
	PROTECTED_APP_PATHS,
	PUBLIC_APP_PATHS,
	PUBLIC_ROUTES
} from './support/routes.ts';

/*
 * The owner was registered by tests/auth.setup.ts, and every project here starts signed in as them
 * (storageState). The three projects share one server and one database, so a test that spends
 * something shared uses its own slice of it: recovery codes are handed out by project below.
 *
 * The owner signs in with a PASSWORD (ADR-0010), and that is tested on every device project, WebKit
 * included. Passkeys ("this device's PIN, fingerprint or face") are optional, and their ceremonies
 * need a virtual authenticator, which is a Chromium DevTools feature. WebKit (the iPhone project)
 * has none, so those tests run on the laptop project only. A real iPhone still has to be tried by
 * hand; see the epic's approach. Tests that change the password are in password.e2e.ts, which runs last.
 */

const CODE_SLICE: Record<string, number> = { iphone: 0, android: 3, laptop: 6 };
/**
 * Each project owns three recovery codes: [0] for E31665, [1] for 2F1582, [2] spare. The laptop's
 * spare one (index 8) is password.e2e.ts's.
 */
const codeFor = (project: string, n: 0 | 1) => readOwner().recoveryCodes[CODE_SLICE[project] + n];

async function signInWithCode(page: Page, code: string) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByText('Use a recovery code').click();
	await page.getByLabel('Recovery code').fill(code);
	await page.getByRole('button', { name: 'Sign in with recovery code' }).click();
}

/** A recovery-code sign-in leads straight to choosing a new password (the forgotten-password path). */
async function expectSetNewPassword(page: Page) {
	await expect(page).toHaveURL(/\/settings\/security\/password/);
	await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
}

test.describe('TSK-46617D registration is closed once the owner exists', () => {
	test.use({ storageState: SIGNED_OUT });

	test('a second visit shows sign-in, not "create your password"', async ({ page }) => {
		await page.goto('/signin');
		await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create your password' })).toHaveCount(0);
		await expect(page.getByLabel('Setup code')).toHaveCount(0);
	});

	test('a hand-made registration form post is refused, even with the right setup code', async ({
		request,
		baseURL
	}) => {
		const post = await request.post('/signin?/register', {
			form: {
				password: 'another long passphrase 99',
				again: 'another long passphrase 99',
				setupCode: 'e2e-setup-code'
			},
			headers: { origin: new URL(baseURL!).origin },
			maxRedirects: 0
		});
		expect(post.status()).toBe(403);
		expect(await post.text()).toContain('Registration is closed');
	});

	test('the registration endpoints refuse a visitor with no session', async ({ request }) => {
		const options = await request.post('/signin/register/options', { data: {} });
		expect(options.status()).toBe(403);

		const verify = await request.post('/signin/register/verify', {
			data: { challengeId: 'x', response: {}, nickname: 'Intruder' }
		});
		expect(verify.status()).toBe(403);
	});
});

test.describe('TSK-D7D015 password sign-in on any device', () => {
	test.use({ storageState: SIGNED_OUT });

	test('the password signs in on a fresh device, and returns to the page asked for', async ({
		page
	}) => {
		await page.goto('/settings/security');
		await expect(page).toHaveURL(/\/signin\?next=%2Fsettings%2Fsecurity$/);
		await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();

		await expect(page).toHaveURL(/\/settings\/security$/);
		await expect(page.getByRole('heading', { name: 'Security', exact: true })).toBeVisible();
		// A password sign-in is a step-up: adding a device or new recovery codes needs no extra step.
		await expect(page.getByText('Confirmed.')).toBeVisible();
	});

	test('with no next, it lands on the home screen', async ({ page }) => {
		await signInWithPassword(page);
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
	});

	test('the sign-in cookie is the same locked-down session cookie', async ({ context, page }) => {
		await signInWithPassword(page);
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		const [cookie] = (await context.cookies()).filter((c) => c.name === 'session');
		expect(cookie.httpOnly).toBe(true);
		expect(cookie.path).toBe('/');
	});

	test('a wrong password is refused with a sentence, and nothing is opened', async ({
		page
	}, info) => {
		// Wrong tries count against the one per-IP limit that all the projects share, so only one
		// project makes them.
		test.skip(info.project.name !== 'laptop', 'wrong tries share one per-IP limit');
		await signInWithPassword(page, 'not the password at all');
		await expect(page.getByRole('alert')).toContainText('That password is not right.');
		await expect(page).toHaveURL(/\/signin/);
		await page.goto('/');
		await expect(page).toHaveURL(/\/signin\?next=%2F$/);
	});
});

test.describe('TSK-D7D015 passkey sign-in, and adding a second passkey', () => {
	test.skip(
		({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
		'needs a virtual authenticator (Chromium), and runs once, on the laptop project'
	);
	test.describe.configure({ mode: 'serial' });

	test('the saved passkey signs in on a fresh device, and returns to the page asked for', async ({
		browser,
		baseURL
	}) => {
		const { context, page } = await newDevice(browser, baseURL!, readOwner().credentials);

		await page.goto('/settings/security');
		await expect(page).toHaveURL(/\/signin\?next=%2Fsettings%2Fsecurity$/);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: "Use this device's PIN, fingerprint or face" }).click();

		await expect(page).toHaveURL(/\/settings\/security$/);
		await expect(page.getByRole('heading', { name: 'Security', exact: true })).toBeVisible();
		await context.close();
	});

	test('a signed-in owner adds a second passkey, signs in with it, then removes it', async ({
		browser,
		baseURL,
		page,
		context
	}) => {
		// A second device: its own authenticator, so it holds a different credential.
		const second = await addVirtualAuthenticator(context, page);

		await page.goto('/settings/security');
		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('passkey')).toHaveCount(1);

		// Adding or removing a passkey needs a passkey confirmation within the last 5 minutes. The
		// session may or may not still hold one from registering, so confirm if the page asks. The
		// device that confirms must hold the owner's passkey; it leaves again before the second is made.
		const owned = readOwner().credentials;
		await second.restore(owned);
		const confirm = page.getByRole('button', {
			name: "Confirm with this device's PIN, fingerprint or face"
		});
		if (await confirm.isVisible()) await confirm.click();
		await expect(page.getByText('Confirmed.')).toBeVisible();
		for (const credential of owned) {
			await second.cdp.send('WebAuthn.removeCredential', {
				authenticatorId: second.authenticatorId,
				credentialId: credential.credentialId as string
			});
		}
		expect(await second.credentials()).toHaveLength(0);

		await page.getByLabel('Name this device').fill('Second device');
		await page.getByRole('button', { name: 'Unlock with this device' }).click();
		await expect(page.getByText('Device added.')).toBeVisible();
		await expect(page.getByTestId('passkey')).toHaveCount(2);
		await expect(page.getByTestId('passkey').nth(1).getByLabel('Name')).toHaveValue(
			'Second device'
		);

		// Sign in with the new passkey alone, on a device that has nothing else.
		const fresh = await newDevice(browser, baseURL!, await second.credentials());
		await fresh.page.goto('/signin');
		await fresh.page.waitForLoadState('networkidle');
		await fresh.page
			.getByRole('button', { name: "Use this device's PIN, fingerprint or face" })
			.click();
		await expect(fresh.page.getByTestId('safe-to-spend')).toBeVisible();
		await fresh.context.close();

		// Rename it, then remove it.
		await page.reload();
		const row = page.getByTestId('passkey').nth(1);
		await row.getByLabel('Name').fill('Tablet');
		await row.getByRole('button', { name: 'Rename' }).click();
		await expect(page.getByTestId('passkey').nth(1).getByLabel('Name')).toHaveValue('Tablet');

		await page.getByRole('button', { name: 'Remove this device: Tablet' }).click();
		await expect(page.getByTestId('passkey')).toHaveCount(1);

		// Even the last one can be removed: the password always remains. Then sign-in offers only
		// the password, until a device is added again.
		await page.getByRole('button', { name: /^Remove / }).click();
		await expect(page.getByTestId('passkey')).toHaveCount(0);
		await expect(page.getByText('No devices added yet.')).toBeVisible();
		const none = await newDevice(browser, baseURL!, []);
		await none.page.goto('/signin');
		await none.page.waitForLoadState('networkidle');
		await expect(none.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
		await expect(
			none.page.getByRole('button', { name: "Use this device's PIN, fingerprint or face" })
		).toHaveCount(0);
		await none.context.close();

		// Add one back (the confirmation is still fresh), so the rest of the run still has a device.
		await page.getByLabel('Name this device').fill('Laptop again');
		await page.getByRole('button', { name: 'Unlock with this device' }).click();
		await expect(page.getByText('Device added.')).toBeVisible();
		await expect(page.getByTestId('passkey')).toHaveCount(1);
		const back = await newDevice(browser, baseURL!, []);
		await back.page.goto('/signin');
		await expect(
			back.page.getByRole('button', { name: "Use this device's PIN, fingerprint or face" })
		).toBeVisible();
		await back.context.close();
	});
});

test.describe('TSK-EF5663 a signed-in owner is never bounced to another site', () => {
	test('every hostile next target lands on "/"', async ({ request }) => {
		for (const hostile of HOSTILE_NEXT) {
			const response = await request.get(`/signin?next=${encodeURIComponent(hostile)}`, {
				headers: { accept: 'text/html' },
				maxRedirects: 0
			});
			expect(response.status(), hostile).toBe(303);
			expect(response.headers()['location'], hostile).toBe('/');
		}
	});
});

test.describe('TSK-E31665 a recovery code signs in exactly once', () => {
	test.use({ storageState: SIGNED_OUT });

	test('works the first time and fails the second', async ({ browser, baseURL, page }, info) => {
		const code = codeFor(info.project.name, 0);

		await signInWithCode(page, code);
		// The way back after a forgotten password: straight to choosing a new one.
		await expectSetNewPassword(page);
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();

		// The same code, from a different browser: refused.
		const other = await browser.newContext({ baseURL, storageState: SIGNED_OUT });
		const again = await other.newPage();
		await signInWithCode(again, code);
		await expect(again.getByRole('alert')).toContainText('did not work');
		await expect(again).toHaveURL(/\/signin/);
		await other.close();
	});

	test('a made-up code is refused', async ({ page }) => {
		await signInWithCode(page, 'AAAA-BBBB-CCCC-DDDD');
		await expect(page.getByRole('alert')).toContainText('did not work');
	});
});

test.describe('TSK-2F1582 the session cookie is locked down and signing out ends it', () => {
	test.use({ storageState: SIGNED_OUT });

	test('is HttpOnly and SameSite=Lax, and not Secure over plain http', async ({
		page,
		context,
		request,
		baseURL
	}, info) => {
		// Sign in without a browser to read the server's raw Set-Cookie header: it is what the server
		// said, whatever each engine's cookie jar later reports (WebKit's SameSite differs).
		const response = await request.post('/signin?/recovery', {
			form: { code: codeFor(info.project.name, 1), next: '/' },
			headers: { origin: new URL(baseURL!).origin, accept: 'text/html' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		const header = response.headers()['set-cookie'];
		expect(header).toMatch(/^session=[A-Za-z0-9_-]{43};/);
		expect(header).toContain('HttpOnly');
		expect(header).toContain('SameSite=Lax');
		expect(header).toContain('Path=/');
		// The test server is http://localhost; over https (production) the cookie is also Secure.
		expect(header).not.toContain('Secure');
		// Persistent, following the 14-day idle window.
		const expires = /Expires=([^;]+)/.exec(header)?.[1];
		const days = (Date.parse(expires!) - Date.now()) / 86_400_000;
		expect(days).toBeGreaterThan(13.9);
		expect(days).toBeLessThanOrEqual(14.01);

		// The browser keeps it out of script's reach, and it works.
		const token = /^session=([^;]+)/.exec(header)![1];
		await context.addCookies([
			{ name: 'session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' }
		]);
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		expect(await page.evaluate(() => document.cookie)).not.toContain('session');
	});

	test('signing out deletes the session on the server, not just the cookie', async ({
		page,
		context
	}) => {
		await signInWithPassword(page);
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		const [kept] = (await context.cookies()).filter((c) => c.name === 'session');

		await page.goto('/settings/security');
		await page.waitForLoadState('networkidle');
		// The page's own button; the sidebar has one too, on wide screens, posting the same action.
		await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
		await expect(page).toHaveURL(/\/signin$/);
		await page.goto('/');
		await expect(page).toHaveURL(/\/signin\?next=%2F$/);

		// Replaying the old cookie gets nothing: the server forgot the session.
		await context.addCookies([kept]);
		await page.goto('/');
		await expect(page).toHaveURL(/\/signin\?next=%2F$/);
	});
});

test.describe('TSK-2F1582 over https the cookie is __Host-session, and a recovery session cannot take over', () => {
	test.skip(
		({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
		'spends the one recovery code the phone projects do not use, so it runs once, on the laptop project'
	);

	test('Secure, __Host-, HttpOnly, SameSite=Lax and Path=/, and no other name is honoured', async ({
		playwright,
		baseURL
	}) => {
		// A new request context per call: the cookie jar of a shared one would add its own cookie.
		const call = async <T>(use: (api: APIRequestContext) => Promise<T>) => {
			const api = await playwright.request.newContext({ baseURL });
			try {
				return await use(api);
			} finally {
				await api.dispose();
			}
		};
		// The server trusts x-forwarded-proto (PROTOCOL_HEADER), as it does from Fly's proxy.
		const https = { 'x-forwarded-proto': 'https' };
		const http = { 'x-forwarded-proto': 'http' };
		const origin = new URL(baseURL!).origin.replace('http:', 'https:');

		const response = await call((api) =>
			api.post('/signin?/recovery', {
				form: { code: readOwner().recoveryCodes[9], next: '/' },
				headers: { ...https, origin, accept: 'text/html' },
				maxRedirects: 0
			})
		);
		expect(response.status()).toBe(303);
		const header = response.headers()['set-cookie'];
		expect(header).toMatch(/^__Host-session=[A-Za-z0-9_-]{43};/);
		expect(header).toContain('Secure');
		expect(header).toContain('HttpOnly');
		expect(header).toContain('SameSite=Lax');
		expect(header).toContain('Path=/');
		expect(header).not.toMatch(/Domain=/i);
		const token = /^__Host-session=([^;]+)/.exec(header)![1];

		const securityStatus = (cookie: string, headers: Record<string, string>) =>
			call(async (api) =>
				(
					await api.get('/settings/security', {
						headers: { ...headers, cookie, accept: 'text/html' },
						maxRedirects: 0
					})
				).status()
			);
		// Over https only the __Host- name opens the door, over plain http only the plain name.
		expect(await securityStatus(`__Host-session=${token}`, https)).toBe(200);
		expect(await securityStatus(`session=${token}`, https)).toBe(303);
		expect(await securityStatus(`session=${token}`, http)).toBe(200);
		expect(await securityStatus(`__Host-session=${token}`, http)).toBe(303);

		// A session opened with a recovery code is not a step-up. It can remove no passkey and make no
		// new recovery codes; it can start adding a passkey (the way back in after losing every device).
		const owner = { ...https, origin, cookie: `__Host-session=${token}` };
		const regenerate = await call(async (api) => {
			const r = await api.post('/settings/security?/regenerate', {
				form: {},
				headers: owner,
				maxRedirects: 0
			});
			return { status: r.status(), body: await r.text() };
		});
		expect(regenerate.status).toBe(403);
		expect(regenerate.body).toContain('Confirm it is you first');

		const remove = await call((api) =>
			api.post('/settings/security?/remove', {
				form: { id: 'whatever' },
				headers: owner,
				maxRedirects: 0
			})
		);
		expect(remove.status()).toBe(403);

		const add = await call(async (api) => {
			const r = await api.post('/signin/register/options', { data: {}, headers: owner });
			return { status: r.status(), body: await r.json() };
		});
		expect(add.status).toBe(200);
		// It is the add-a-passkey ceremony (the existing passkey is excluded), not first registration.
		expect(add.body.options.excludeCredentials.length).toBeGreaterThan(0);

		// It can open the "set a new password" page, which it may use without the old password for 10
		// minutes. (Submitting it is covered in password.e2e.ts, which changes the password.)
		const setPage = await call(async (api) => {
			const r = await api.get('/settings/security/password', {
				headers: { ...owner, accept: 'text/html' },
				maxRedirects: 0
			});
			return { status: r.status(), body: await r.text() };
		});
		expect(setPage.status).toBe(200);
		expect(setPage.body).toContain('Set a new password');

		// Starting a step-up is allowed to a signed-in session, and to nobody else.
		const stepUp = await call((api) =>
			api.post('/settings/security/step-up/options', { data: {}, headers: owner })
		);
		expect(stepUp.status()).toBe(200);
		const stranger = await call((api) =>
			api.post('/settings/security/step-up/options', { data: {}, headers: https })
		);
		expect(stranger.status()).toBe(401);
	});
});

test.describe('TSK-EF5663 without a session every route but sign-in goes to sign-in', () => {
	test.use({ storageState: SIGNED_OUT });

	const routes = listRoutes();
	const protectedRoutes = routes.filter((r) => !PUBLIC_ROUTES.includes(r.id));

	test('there are protected routes to check', () => {
		expect(protectedRoutes.map((r) => r.id)).toEqual(
			expect.arrayContaining(['/', '/settings/security'])
		);
	});

	for (const route of protectedRoutes) {
		test(`${route.id}: a page request is sent to /signin, a write gets 401`, async ({
			request
		}) => {
			const page = await request.get(route.path, {
				headers: { accept: 'text/html' },
				maxRedirects: 0
			});
			expect(page.status()).toBe(303);
			expect(page.headers()['location']).toBe(`/signin?next=${encodeURIComponent(route.path)}`);

			for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
				const write = await request.fetch(route.path, { method, data: {}, maxRedirects: 0 });
				expect(write.status(), `${method} ${route.path}`).toBe(401);
			}
			const endpoint = await request.get(route.path, {
				headers: { accept: 'application/json' },
				maxRedirects: 0
			});
			expect(endpoint.status()).toBe(401);
		});
	}

	test('an address that matches no route does not reveal that it is missing', async ({
		request
	}) => {
		const response = await request.get('/no-such-page', {
			headers: { accept: 'text/html' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
	});

	test('the browser lands on the sign-in page, which asks for the password', async ({ page }) => {
		await page.goto('/settings/security');
		await expect(page).toHaveURL(/\/signin\?next=%2Fsettings%2Fsecurity$/);
		await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
	});

	test('a hostile next parameter cannot leave the site', async ({ page }) => {
		await page.goto('/signin?next=//evil.example/steal');
		await page.getByText('Use a recovery code').click();
		// Both forms (password and recovery code) carry it.
		const nexts = page.locator('input[name="next"]');
		await expect(nexts).toHaveCount(2);
		for (const next of await nexts.all()) await expect(next).toHaveValue('/');
	});

	test('no hostile next parameter survives into the sign-in form', async ({ request }) => {
		for (const hostile of HOSTILE_NEXT) {
			const response = await request.get(`/signin?next=${encodeURIComponent(hostile)}`);
			expect(response.status(), hostile).toBe(200);
			const hidden = /name="next"[^>]*value="([^"]*)"/.exec(await response.text());
			expect(hidden?.[1], hostile).toBe('/');
		}
	});

	test('a data request without a session is told to sign in in a form the client can follow', async ({
		request
	}) => {
		for (const [path, next] of [
			['/settings/security/__data.json?x-sveltekit-invalidated=01&a=1', '/settings/security?a=1'],
			['/__data.json', '/']
		]) {
			const response = await request.get(path, { maxRedirects: 0 });
			// SvelteKit's client reads this body; a bare 303 it cannot follow.
			expect(response.status(), path).toBe(200);
			expect(await response.json()).toEqual({
				type: 'redirect',
				status: 303,
				location: `/signin?next=${encodeURIComponent(next)}`
			});
			// And it still carries what every response carries.
			expectHeaders(response.headers(), false);
			expect(response.headers()['x-request-id']).toBeTruthy();
		}
	});

	test('only the built files under /_app are public; remote functions are not', async ({
		request,
		baseURL
	}) => {
		expect(PUBLIC_APP_PATHS).toContain('/_app/version.json');
		expect((await request.get('/_app/version.json')).status()).toBe(200);
		// Anything else under /_app that is not a real file never reaches SvelteKit (adapter-node
		// answers 404 itself), except remote functions, which run server code.
		for (const path of PROTECTED_APP_PATHS.filter((p) => p.startsWith('/_app/remote/'))) {
			const page = await request.get(path, { headers: { accept: 'text/html' }, maxRedirects: 0 });
			expect(page.status(), path).toBe(401);
			// Same-origin, so SvelteKit's own cross-site check passes and this is the guard's answer.
			const call = await request.post(path, {
				data: {},
				headers: { origin: new URL(baseURL!).origin },
				maxRedirects: 0
			});
			expect(call.status(), `POST ${path}`).toBe(401);
		}
	});

	test('the public pages answer without a session', async ({ request }) => {
		expect((await request.get('/signin')).status()).toBe(200);
		expect((await request.get('/health')).status()).toBe(200);
		expect((await request.get('/offline')).status()).toBe(200);
		expect((await request.get('/manifest.webmanifest')).status()).toBe(200);
	});
});

test.describe('TSK-4E3EC1 security headers are set on every response', () => {
	test.use({ storageState: SIGNED_OUT });

	for (const path of ['/signin', '/health']) {
		test(`${path} carries the CSP, HSTS, nosniff and frame protection`, async ({ request }) => {
			const headers = (await request.get(path, { headers: { accept: 'text/html' } })).headers();
			expectHeaders(headers, path === '/signin');
		});
	}

	test('the sign-in redirect carries them too', async ({ request }) => {
		const response = await request.get('/', { headers: { accept: 'text/html' }, maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expectHeaders(response.headers(), false);
	});
});

test.describe('TSK-4E3EC1 the policy blocks nothing the app needs', () => {
	for (const path of [
		'/',
		'/schedule',
		'/settings/security',
		'/settings/security/password',
		'/signin',
		'/offline'
	]) {
		test(`${path} loads with no CSP violation`, async ({ page, request }) => {
			const violations: string[] = [];
			page.on('console', (message) => {
				if (/content security policy/i.test(message.text())) violations.push(message.text());
			});
			page.on('pageerror', (error) => violations.push(error.message));

			const response = await page.goto(path, { waitUntil: 'networkidle' });
			expect(response?.status()).toBe(200);
			await page.waitForTimeout(300);
			expect(violations).toEqual([]);

			// Signed in, the home page also carries the full set.
			if (path === '/') {
				expectHeaders((await request.get('/')).headers(), true);
			}
		});
	}
});

function expectHeaders(headers: Record<string, string>, hasCsp: boolean) {
	expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['referrer-policy']).toBe('same-origin');
	expect(headers['permissions-policy']).toContain('camera=()');
	if (!hasCsp) return;

	const csp = headers['content-security-policy'];
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("base-uri 'self'");
	expect(csp).toContain("form-action 'self'");
	// Scripts: a nonce for the inline bootstrap, never 'unsafe-inline'.
	expect(csp).toMatch(/script-src 'self' 'nonce-[\w+/=-]+'/);
	expect(csp).not.toContain("'unsafe-inline'");
}
