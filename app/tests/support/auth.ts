import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	expect,
	type Browser,
	type BrowserContext,
	type CDPSession,
	type Page
} from '@playwright/test';

/*
 * The owner is registered once, by tests/auth.setup.ts, against the run's one in-memory database.
 * It leaves the session (storageState), the recovery codes and the passkey's credential here, for
 * the tests that need to sign in again. The password is a constant: it must not contain the setup code.
 */

const DIR = join(import.meta.dirname, '../../test-results/.auth');
export const AUTH_STATE = join(DIR, 'owner-state.json');
const OWNER_FILE = join(DIR, 'owner.json');

/** OWNER_SETUP_CODE for the test server (playwright.config.ts): production builds require it for the first owner. */
export const SETUP_CODE = 'e2e-setup-code';

/** The owner's password in every test; tests that change it change it back (or run last). */
export const OWNER_PASSWORD = 'correct horse battery staple 41';
export const NEW_PASSWORD = 'a different long passphrase 77';

/** Signs in on the sign-in page with a password and waits until the page has moved on. */
export async function signInWithPassword(page: Page, password = OWNER_PASSWORD) {
	await page.goto('/signin');
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function expectSignedOut(page: Page) {
	await page.goto('/');
	await expect(page).toHaveURL(/\/signin\?next=%2F$/);
}

/**
 * The password project presents its own client address, so its few failed sign-ins do not add to the
 * per-IP count the other projects share (the test server reads it from x-forwarded-for).
 */
export const PASSWORD_PROJECT_HEADERS = {
	'x-forwarded-proto': 'http',
	'x-forwarded-for': '203.0.113.50'
};

/**
 * The three read-only projects run in parallel on one server. Sign-in attempts are charged to the
 * client address when they ENTER (and each address may have only two in flight), so each project
 * presents its own address, as three separate people would, rather than all sharing one.
 */
export const projectHeaders = (lastOctet: number) => ({
	'x-forwarded-proto': 'http',
	'x-forwarded-for': `203.0.113.${lastOctet}`
});

export const SIGNED_OUT = { cookies: [], origins: [] };

type Credential = Record<string, unknown>;
export type SavedOwner = { recoveryCodes: string[]; credentials: Credential[] };

export function saveOwner(owner: SavedOwner) {
	mkdirSync(dirname(OWNER_FILE), { recursive: true });
	writeFileSync(OWNER_FILE, JSON.stringify(owner, null, 2));
}

export const readOwner = (): SavedOwner => JSON.parse(readFileSync(OWNER_FILE, 'utf8'));

/**
 * A virtual authenticator that behaves like Face ID or Windows Hello: internal, with resident keys
 * and user verification. Chromium only: WebKit has no CDP, so passkey ceremonies are not run there.
 */
export async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
	const cdp: CDPSession = await context.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	return {
		cdp,
		authenticatorId,
		async credentials(): Promise<Credential[]> {
			const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
			return credentials as unknown as Credential[];
		},
		async restore(credentials: Credential[]) {
			for (const credential of credentials) {
				await cdp.send('WebAuthn.addCredential', {
					authenticatorId,
					credential: credential as never
				});
			}
		}
	};
}

/** A browser context with no session, holding the given passkey credentials on a new device. */
export async function newDevice(browser: Browser, baseURL: string, credentials: Credential[]) {
	const context = await browser.newContext({ baseURL, storageState: SIGNED_OUT });
	const page = await context.newPage();
	const authenticator = await addVirtualAuthenticator(context, page);
	await authenticator.restore(credentials);
	return { context, page, authenticator };
}
