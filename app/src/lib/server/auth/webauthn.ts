import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type RegistrationResponseJSON,
	type WebAuthnCredential
} from '@simplewebauthn/server';
import { log } from '#lib/server/log.ts';
import type { Db } from '#lib/server/db/open.ts';
import { consumeChallenge, saveChallenge, type ChallengePurpose } from './challenge.ts';
import {
	findPasskey,
	listPasskeys,
	OWNER_ID,
	recordPasskeyUse,
	type NewPasskey
} from './passkeys.ts';

const RP_NAME = 'Payday';
/** A stable handle for the one owner, so every passkey belongs to the same account. */
const USER_HANDLE = new TextEncoder().encode('payday-owner');

/** A failure with a sentence that is safe to show the owner. */
export class AuthError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

/**
 * The relying party comes from the request URL. adapter-node does not read ORIGIN: it builds the URL
 * as https plus the Host header (or the protocol named by PROTOCOL_HEADER), which behind Fly's TLS
 * proxy is the public address.
 */
export type RelyingParty = { id: string; origin: string };
export const relyingPartyFrom = (url: URL): RelyingParty => ({
	id: url.hostname,
	origin: url.origin
});

const parseTransports = (json: string | null): string[] | undefined => {
	try {
		const value: unknown = json ? JSON.parse(json) : undefined;
		return Array.isArray(value) ? value.map(String) : undefined;
	} catch {
		return undefined;
	}
};

export async function beginRegistration(
	db: Db,
	rp: RelyingParty,
	purpose: Extract<ChallengePurpose, 'register' | 'add-passkey'>
) {
	// Adding a passkey excludes the ones that exist, so a device cannot register twice.
	const existing = purpose === 'add-passkey' ? listPasskeys(db, OWNER_ID) : [];
	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: rp.id,
		userName: 'owner',
		userDisplayName: 'Payday owner',
		userID: USER_HANDLE,
		attestationType: 'none',
		excludeCredentials: existing.map((p) => ({
			id: p.id,
			transports: parseTransports(p.transports)
		})),
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
	});
	return { challengeId: saveChallenge(purpose, options.challenge), options };
}

export async function finishRegistration(
	rp: RelyingParty,
	purpose: Extract<ChallengePurpose, 'register' | 'add-passkey'>,
	challengeId: string,
	response: RegistrationResponseJSON,
	nickname: string
): Promise<NewPasskey> {
	const challenge = consumeChallenge(challengeId, purpose);
	if (!challenge) throw new AuthError('That took too long. Please try again.');

	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: challenge,
			expectedOrigin: rp.origin,
			expectedRPID: rp.id,
			requireUserVerification: true
		});
	} catch (error) {
		// Logged for the owner-operator; the page gets only a plain sentence.
		log({ level: 'warn', msg: 'passkey verification failed', reason: String(error) });
		throw new AuthError('That passkey could not be verified. Please try again.');
	}
	if (!verification.verified) throw new AuthError('That passkey could not be verified.');

	const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
	return {
		id: credential.id,
		publicKey: credential.publicKey,
		counter: credential.counter,
		transports: credential.transports ?? response.response.transports,
		deviceType: credentialDeviceType,
		backedUp: credentialBackedUp,
		nickname
	};
}

type AuthPurpose = Extract<ChallengePurpose, 'authenticate' | 'step-up'>;

/**
 * `step-up` challenges are bound to the session that asked, so another session cannot answer them.
 * Both purposes need a user-verified assertion.
 */
export async function beginAuthentication(
	rp: RelyingParty,
	purpose: AuthPurpose = 'authenticate',
	bound?: string
) {
	// No allowCredentials: the passkey is discoverable, so the device offers its own.
	const options = await generateAuthenticationOptions({
		rpID: rp.id,
		userVerification: 'required'
	});
	return { challengeId: saveChallenge(purpose, options.challenge, new Date(), bound), options };
}

/** Returns the owner id the passkey belongs to. */
export async function finishAuthentication(
	db: Db,
	rp: RelyingParty,
	challengeId: string,
	response: AuthenticationResponseJSON,
	{
		now = new Date(),
		purpose = 'authenticate',
		bound
	}: { now?: Date; purpose?: AuthPurpose; bound?: string } = {}
): Promise<number> {
	const challenge = consumeChallenge(challengeId, purpose, now, bound);
	if (!challenge) throw new AuthError('That took too long. Please try again.');

	const stored = findPasskey(db, response.id);
	if (!stored) throw new AuthError('Payday does not know that passkey.');

	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: challenge,
			expectedOrigin: rp.origin,
			expectedRPID: rp.id,
			requireUserVerification: true,
			credential: {
				id: stored.id,
				publicKey: new Uint8Array(stored.publicKey),
				counter: stored.counter,
				transports: parseTransports(stored.transports) as WebAuthnCredential['transports']
			}
		});
	} catch (error) {
		// Logged for the owner-operator; the page gets only a plain sentence.
		log({ level: 'warn', msg: 'passkey verification failed', reason: String(error) });
		throw new AuthError('That passkey could not be verified. Please try again.');
	}
	if (!verification.verified) throw new AuthError('That passkey could not be verified.');

	recordPasskeyUse(db, stored.id, verification.authenticationInfo.newCounter, now);
	return stored.ownerId;
}
