import { fail, redirect } from '@sveltejs/kit';
import { clientKey, readSessionToken, startSession } from '#lib/server/auth/cookie.ts';
import { googleFor } from '#lib/server/auth/google/complete.ts';
import { newRecoveryCodes } from '#lib/server/auth/oneTimeSlot.ts';
import { signUp, signUpFull } from '#lib/server/auth/signUp.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request, setHeaders, cookies, url }) => {
	// Never kept by the browser, so Back and reload ask the server again.
	if (request.method === 'GET') setHeaders({ 'cache-control': 'no-store' });
	const db = await getDb();
	if (locals.ownerId !== null) {
		// A newcomer from Google lands here signed in, with their recovery codes waiting in a
		// one-time slot (ADR-0028). Taking them empties it: a reload shows nothing and moves on.
		const token = readSessionToken(cookies, url);
		const codes = token ? await newRecoveryCodes.take(db, token) : undefined;
		if (!codes) redirect(303, '/');
		return { open: false, google: null, codes };
	}
	// A read only: a visitor who finds sign-up full leaves nothing behind.
	const open = !(await signUpFull(db));
	// Offered only while sign-up is open, and only while Google is switched on.
	return { open, google: open && googleFor(url) ? { path: '/signin/google' } : null, codes: null };
};

export const actions: Actions = {
	/** Works without JavaScript: a plain form post. */
	default: async (event) => {
		if (event.locals.ownerId !== null) redirect(303, '/');
		const form = await event.request.formData();
		const email = form.get('email');
		const db = await getDb();
		const result = await signUp(db, {
			email,
			password: form.get('password'),
			again: form.get('again'),
			address: clientKey(event)
		});
		if (!result.ok) {
			return fail(result.status, {
				reason: result.reason,
				field: result.field,
				message: result.message,
				// What was typed comes back, so a mistake does not mean typing it again. Never the password.
				email: typeof email === 'string' ? email.slice(0, 300) : ''
			});
		}
		await startSession(db, event, result.ownerId, 'registration');
		// The only time the codes exist in plain text; only their hashes are stored.
		event.setHeaders({ 'cache-control': 'no-store' });
		return { recoveryCodes: result.recoveryCodes };
	}
};
