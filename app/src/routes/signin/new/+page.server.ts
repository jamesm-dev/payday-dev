import { fail, redirect } from '@sveltejs/kit';
import { clientKey, startSession } from '#lib/server/auth/cookie.ts';
import { signUp, signUpOpen } from '#lib/server/auth/signUp.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request, setHeaders }) => {
	// Someone already signed in has nothing to do here; the layout sends them on to setup if needed.
	if (locals.ownerId !== null) redirect(303, '/');
	// Never kept by the browser, so Back and reload ask the server again.
	if (request.method === 'GET') setHeaders({ 'cache-control': 'no-store' });
	// A read only: a visitor who finds sign-up full leaves nothing behind.
	return { open: await signUpOpen(await getDb()) };
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
