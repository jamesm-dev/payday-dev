import { newToken } from './tokens.ts';

export type ChallengePurpose = 'register' | 'authenticate' | 'add-passkey' | 'step-up';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** The most challenges held at once. A flood evicts the oldest instead of growing without bound. */
export const CHALLENGE_CAP = 200;

type Entry = {
	challenge: string;
	purpose: ChallengePurpose;
	bound: string | null;
	expiresAt: number;
};

/*
 * Challenges live in memory, not in the database. The options endpoints are open to anyone, and a
 * row written per request is a way to fill the volume. One machine and one owner means nothing needs
 * to share them, and a restart only costs the owner one more tap. (The `auth_challenge` table stays
 * in the schema, unused: dropping it is a migration that is not worth it.)
 */
export type ChallengeStore = {
	/** Stores a challenge and returns the id the browser sends back with its answer. */
	save(purpose: ChallengePurpose, challenge: string, now?: Date, bound?: string): string;
	/**
	 * Takes a challenge. Single use: it is removed whether or not the caller then succeeds, so a
	 * failed attempt needs a fresh challenge. Null when unknown, expired, for another purpose, or
	 * bound to a different session.
	 */
	consume(id: string, purpose: ChallengePurpose, now?: Date, bound?: string): string | null;
	size(): number;
};

export function createChallengeStore(
	cap = CHALLENGE_CAP,
	ttlMs = CHALLENGE_TTL_MS
): ChallengeStore {
	// A Map iterates in insertion order, and every entry has the same lifetime, so the first entry is
	// both the oldest and the first to expire.
	const entries = new Map<string, Entry>();

	return {
		save(purpose, challenge, now = new Date(), bound) {
			const t = now.getTime();
			for (const [id, entry] of entries) {
				if (entry.expiresAt > t) break;
				entries.delete(id);
			}
			while (entries.size >= cap) entries.delete(entries.keys().next().value as string);
			const id = newToken();
			entries.set(id, { challenge, purpose, bound: bound ?? null, expiresAt: t + ttlMs });
			return id;
		},
		consume(id, purpose, now = new Date(), bound) {
			const entry = entries.get(id);
			if (!entry) return null;
			entries.delete(id);
			if (entry.purpose !== purpose || entry.expiresAt <= now.getTime()) return null;
			if (entry.bound !== (bound ?? null)) return null;
			return entry.challenge;
		},
		size: () => entries.size
	};
}

const challenges = createChallengeStore();

export const saveChallenge = challenges.save;
export const consumeChallenge = challenges.consume;
