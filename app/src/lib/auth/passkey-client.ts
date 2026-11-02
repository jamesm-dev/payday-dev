/*
 * The browser half of "this device's PIN, fingerprint or face" (a passkey). The library is imported on demand, inside the click, so it is a
 * separate file that only the sign-in and security pages ever fetch: the home screen's JavaScript
 * budget never pays for it.
 */

/** An error whose message is plain words for the owner. */
export class PasskeyError extends Error {
	/** True when the server wants the owner to confirm it is them first. */
	needsStepUp = false;
}

type Ceremony = 'register' | 'signin' | 'confirm';

async function post<T>(path: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		throw new PasskeyError('Could not reach Payday. Check your connection and try again.');
	}
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		if (response.status === 429) {
			throw new PasskeyError('Too many tries. Wait a minute, then try again.');
		}
		const error = new PasskeyError(
			typeof data?.message === 'string' ? data.message : 'Something went wrong. Please try again.'
		);
		error.needsStepUp = data?.needsStepUp === true;
		throw error;
	}
	return data as T;
}

function explain(error: unknown, ceremony: Ceremony): PasskeyError {
	if (error instanceof PasskeyError) return error;
	const { name, code } = (error ?? {}) as { name?: string; code?: string };

	if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
		return new PasskeyError(
			'This device is already set up to unlock Payday. Use it to sign in instead.'
		);
	}
	if (
		code === 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT' ||
		code === 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT' ||
		code === 'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG'
	) {
		return new PasskeyError(
			'This device cannot do that. It needs a PIN, fingerprint or face unlock (like Face ID) set up first.'
		);
	}
	if (
		code === 'ERROR_INVALID_DOMAIN' ||
		code === 'ERROR_INVALID_RP_ID' ||
		name === 'SecurityError'
	) {
		return new PasskeyError(
			"Unlocking with a device's PIN, fingerprint or face does not work on this web address."
		);
	}
	if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
		return new PasskeyError(
			ceremony === 'register'
				? 'Cancelled, so nothing was saved. Try again when you are ready.'
				: ceremony === 'confirm'
					? 'Cancelled, or this device is not set up for Payday. Use your password instead.'
					: 'Cancelled, or this device is not set up for Payday. Use your password instead.'
		);
	}
	return new PasskeyError(
		"Something went wrong with the device's PIN, fingerprint or face. Please try again."
	);
}

async function library() {
	const lib = await import('@simplewebauthn/browser');
	if (!lib.browserSupportsWebAuthn()) {
		throw new PasskeyError(
			"This browser cannot unlock with a device's PIN, fingerprint or face. Use your password instead."
		);
	}
	return lib;
}

/** Lets this device unlock Payday with its PIN, fingerprint or face, for the signed-in owner. */
export async function createPasskey(nickname: string): Promise<void> {
	try {
		const { startRegistration } = await library();
		const { challengeId, options } = await post<{ challengeId: string; options: never }>(
			'/signin/register/options',
			{}
		);
		const response = await startRegistration({ optionsJSON: options });
		await post('/signin/register/verify', { challengeId, response, nickname });
	} catch (error) {
		throw explain(error, 'register');
	}
}

export async function signInWithPasskey(): Promise<void> {
	try {
		const { startAuthentication } = await library();
		const { challengeId, options } = await post<{ challengeId: string; options: never }>(
			'/signin/authenticate/options',
			{}
		);
		const response = await startAuthentication({ optionsJSON: options });
		await post('/signin/authenticate/verify', { challengeId, response });
	} catch (error) {
		throw explain(error, 'signin');
	}
}

/**
 * Step-up: proves with this device, right now, that the person here is the owner. Adding or removing
 * a device and making new recovery codes all ask for it (the password does the same).
 */
export async function confirmWithPasskey(): Promise<void> {
	try {
		const { startAuthentication } = await library();
		const { challengeId, options } = await post<{ challengeId: string; options: never }>(
			'/settings/security/step-up/options',
			{}
		);
		const response = await startAuthentication({ optionsJSON: options });
		await post('/settings/security/step-up/verify', { challengeId, response });
	} catch (error) {
		throw explain(error, 'confirm');
	}
}
