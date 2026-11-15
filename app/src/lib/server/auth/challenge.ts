import { eq, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { authChallenge } from '#lib/server/db/schema.ts';
import { newToken } from './tokens.ts';

export type ChallengePurpose =
	| 'register'
	| 'authenticate'
	| 'add-passkey'
	| 'step-up'
	| 'google-sign-in'
	| 'google-connect'
	| 'google-confirm';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** A Google round trip leaves the site and comes back, so its state lives longer than a passkey's. */
export const GOOGLE_FLOW_TTL_MS = 10 * 60 * 1000;

export const GOOGLE_PURPOSES: readonly ChallengePurpose[] = [
	'google-sign-in',
	'google-connect',
	'google-confirm'
];

const lifeOf = (purpose: ChallengePurpose, ttlMs: number) =>
	GOOGLE_PURPOSES.includes(purpose) ? GOOGLE_FLOW_TTL_MS : ttlMs;
/**
 * The most challenges held at once in each family: passkey challenges, and Google flows, are
 * capped separately. A flood of one kind evicts only its own oldest (by when it was made, which
 * within a family is the same order as `expires_at`), never the other's: Google rows live twice as
 * long, so a shared cap ordered by expiry would let a flood of Google starts push out every fresh
 * passkey challenge (TSK-3e8f61). So the table holds at most twice this many rows.
 */
export const CHALLENGE_CAP = 200;

/*
 * Challenges live in the database (`auth_challenge`), not in memory: on Netlify the request that
 * asks for a challenge and the one that answers it may run in different function instances. The
 * options endpoints are open to anyone, so the table is bounded: every save drops expired rows and
 * anything past its family's cap, oldest first, in the same statement.
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
	/**
	 * Takes a challenge by its id alone and says what it was for. Single use, like `consume`: one
	 * `DELETE … RETURNING`, removed whether or not it is then accepted. Null when unknown, expired,
	 * bound to something else, or (when `purposes` is given) for a purpose not listed.
	 */
	take(
		db: Db,
		id: string,
		bound?: string,
		now?: Date,
		purposes?: readonly ChallengePurpose[]
	): Promise<{ purpose: ChallengePurpose; challenge: string } | null>;
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
			await db.insert(authChallenge).values({
				id,
				challenge,
				purpose,
				bound: bound ?? null,
				expiresAt: t + lifeOf(purpose, ttlMs)
			});
			// Each family is bounded by the cap on its own, newest kept: after a save neither holds more
			// than `cap` rows, and a flood of one cannot evict the other's.
			const google = sql.join(
				GOOGLE_PURPOSES.map((p) => sql`${p}`),
				sql`, `
			);
			await db.delete(authChallenge).where(
				sql`${authChallenge.expiresAt} <= ${t}::bigint or ${authChallenge.id} in (
					select "id" from "payday"."auth_challenge" where "purpose" in (${google})
					order by "expires_at" desc, "id" offset ${cap}::int
				) or ${authChallenge.id} in (
					select "id" from "payday"."auth_challenge" where "purpose" not in (${google})
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
		async take(db, id, bound, now = new Date(), purposes) {
			const [entry] = await db.delete(authChallenge).where(eq(authChallenge.id, id)).returning();
			if (!entry) return null;
			const purpose = entry.purpose as ChallengePurpose;
			if (purposes && !purposes.includes(purpose)) return null;
			if (entry.expiresAt <= now.getTime()) return null;
			if (entry.bound !== (bound ?? null)) return null;
			return { purpose, challenge: entry.challenge };
		},
		size: async (db) => (await db.select({ id: authChallenge.id }).from(authChallenge)).length
	};
}

const challenges = createChallengeStore();

export const saveChallenge = challenges.save;
export const consumeChallenge = challenges.consume;
export const takeChallenge = challenges.take;
