import { eq, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { authChallenge } from '#lib/server/db/schema.ts';
import { newToken } from './tokens.ts';

export type ChallengePurpose = 'register' | 'authenticate' | 'add-passkey' | 'step-up';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** The most challenges held at once. A flood evicts the oldest instead of growing without bound. */
export const CHALLENGE_CAP = 200;

/*
 * Challenges live in the database (`auth_challenge`), not in memory: on Netlify the request that
 * asks for a challenge and the one that answers it may run in different function instances. The
 * options endpoints are open to anyone, so the table is bounded: every save drops expired rows and
 * anything past the cap, oldest first, in the same statement.
 */
export type ChallengeStore = {
	/** Stores a challenge and returns the id the browser sends back with its answer. */
	save(
		db: Db,
		purpose: ChallengePurpose,
		challenge: string,
		now?: Date,
		bound?: string
	): Promise<string>;
	/**
	 * Takes a challenge. Single use: it is removed whether or not the caller then succeeds, so a
	 * failed attempt needs a fresh challenge. Null when unknown, expired, for another purpose, or
	 * bound to a different session. The removal is one `DELETE … RETURNING`, so two requests
	 * answering the same challenge at once cannot both get it.
	 */
	consume(
		db: Db,
		id: string,
		purpose: ChallengePurpose,
		now?: Date,
		bound?: string
	): Promise<string | null>;
	size(db: Db): Promise<number>;
};

export function createChallengeStore(
	cap = CHALLENGE_CAP,
	ttlMs = CHALLENGE_TTL_MS
): ChallengeStore {
	return {
		async save(db, purpose, challenge, now = new Date(), bound) {
			const t = now.getTime();
			const id = newToken();
			await db
				.insert(authChallenge)
				.values({ id, challenge, purpose, bound: bound ?? null, expiresAt: t + ttlMs });
			// Both bounded by the cap: the table never holds more than `cap` rows after a save.
			await db.delete(authChallenge).where(
				sql`${authChallenge.expiresAt} <= ${t}::bigint or ${authChallenge.id} in (
					select "id" from "payday"."auth_challenge"
					order by "expires_at" desc, "id" offset ${cap}::int
				)`
			);
			return id;
		},
		async consume(db, id, purpose, now = new Date(), bound) {
			const [entry] = await db.delete(authChallenge).where(eq(authChallenge.id, id)).returning();
			if (!entry) return null;
			if (entry.purpose !== purpose || entry.expiresAt <= now.getTime()) return null;
			if (entry.bound !== (bound ?? null)) return null;
			return entry.challenge;
		},
		size: async (db) => (await db.select({ id: authChallenge.id }).from(authChallenge)).length
	};
}

const challenges = createChallengeStore();

export const saveChallenge = challenges.save;
export const consumeChallenge = challenges.consume;
