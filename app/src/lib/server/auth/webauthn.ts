import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type RegistrationResponseJSON,
	type WebAuthnCredential
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { log } from '#lib/server/log.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { consumeChallenge, saveChallenge, type ChallengePurpose } from './challenge.ts';
import { findPasskey, listPasskeys, recordPasskeyUse, type NewPasskey } from './passkeys.ts';

const RP_NAME = 'Payday';
/** What the device shows for a person who has no email (the first owner, before emails existed). */
const NO_EMAIL_NAME = 'Payday owner';

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
 * The relying party comes from the request URL. On Netlify that is the public https address the
 * function was called on. (The browser tests' adapter-node server builds it as https plus the Host
 * header, or the protocol named by PROTOCOL_HEADER.)
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

/**
 * The person's own passkey handle (owner.webauthn_user_id) and the name their device shows: their
 * email, or "Payday owner" when they have none. Owner 1's stored handle is the bytes of
 * `payday-owner`, so the passkeys they made before there were handles per person keep matching.
 */
async function passkeyIdentity(db: Db, ownerId: number) {
	const [row] = await db
		.select({ handle: owner.webauthnUserId, email: owner.email })
		.from(owner)
		.where(eq(owner.id, ownerId));
	if (!row) throw new AuthError('That account no longer exists.', 403);
	return { userID: new Uint8Array(row.handle), name: row.email ?? NO_EMAIL_NAME };
}

/**
 * `bound` ties an add-passkey challenge to the session that asked, so another session cannot
 * finish it (pass the same value to finishRegistration).
 */
export async function beginRegistration(
	db: Db,
	rp: RelyingParty,
	purpose: Extract<ChallengePurpose, 'register' | 'add-passkey'>,
	ownerId: number,
	bound?: string
) {
	// Adding a passkey excludes this person's own, so a device cannot register twice.
	const existing = purpose === 'add-passkey' ? await listPasskeys(db, ownerId) : [];
	const { userID, name } = await passkeyIdentity(db, ownerId);
	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: rp.id,
		userName: name,
		userDisplayName: name,
		userID,
		attestationType: 'none',
		excludeCredentials: existing.map((p) => ({
			id: p.id,
			transports: parseTransports(p.transports)
		})),
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
	});
	return {
		challengeId: await saveChallenge(db, purpose, options.challenge, new Date(), bound),
		options
	};
}

export async function finishRegistration(
	db: Db,
	rp: RelyingParty,
	purpose: Extract<ChallengePurpose, 'register' | 'add-passkey'>,
	challengeId: string,
	response: RegistrationResponseJSON,
	nickname: string,
	bound?: string
): Promise<NewPasskey> {
	const challenge = await consumeChallenge(db, challengeId, purpose, new Date(), bound);
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
	db: Db,
	rp: RelyingParty,
	purpose: AuthPurpose = 'authenticate',
	bound?: string
) {
	// No allowCredentials: the passkey is discoverable, so the device offers its own.
	const options = await generateAuthenticationOptions({
		rpID: rp.id,
		userVerification: 'required'
	});
	return {
		challengeId: await saveChallenge(db, purpose, options.challenge, new Date(), bound),
		options
	};
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
	const challenge = await consumeChallenge(db, challengeId, purpose, now, bound);
	if (!challenge) throw new AuthError('That took too long. Please try again.');

	const stored = await findPasskey(db, response.id);
	if (!stored) throw new AuthError('Payday does not know that passkey.');
	// A second check: the person the device says it is must be the person the credential belongs to.
	const handle = response.response.userHandle;
	if (handle) {
		const [row] = await db
			.select({ handle: owner.webauthnUserId })
			.from(owner)
			.where(eq(owner.id, stored.ownerId));
		if (!row || Buffer.from(row.handle).toString('base64url') !== handle) {
			log({ level: 'warn', msg: 'passkey user handle does not match its owner' });
			throw new AuthError('That passkey could not be verified. Please try again.');
		}
	}

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

	await recordPasskeyUse(db, stored.id, verification.authenticationInfo.newCounter, now);
	return stored.ownerId;
}
