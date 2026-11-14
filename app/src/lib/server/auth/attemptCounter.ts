/*
 * The one table behind every sign-in limit that counts events over time: the per-address attempt
 * limits, the passkey-options limit, the per-address hash slots and the global failure brake.
 *
 * A row is (scope, key) with `stamps`, the epoch-ms instants at which each counted event STOPS
 * counting (its time plus its window, or a slot's lease). "How many count now" is "how many stamps
 * are still in the future", so an expired stamp is never counted, whether or not it has been
 * cleaned up yet.
 *
 * Every change is ONE statement, so two requests at once, on one function instance or two, cannot
 * both pass a limit meant for one:
 *  - check-and-count is `INSERT … ON CONFLICT DO UPDATE … WHERE <live count> < max`. Postgres takes
 *    the row's lock before it evaluates the WHERE, and under READ COMMITTED a waiting statement
 *    re-evaluates it against the row the winner left. So the second of two racing hits sees the
 *    first one's count. No row back means the limit held.
 *  - refund and release are single UPDATEs on the row.
 *
 * Cleanup: the same statement drops the key's own expired stamps. A new key also sweeps a bounded
 * batch of expired rows and enforces the scope's row cap, so a flood of distinct addresses cannot
 * grow the table: the least recently touched rows go first, as the in-memory maps did.
 */
import { and, eq, sql } from 'drizzle-orm';
import { log } from '#lib/server/log.ts';
import type { Db } from '#lib/server/db/open.ts';
import { attemptCounter } from '#lib/server/db/schema.ts';

/** How many expired rows one new key may clear. Bounded, so no request pays for a whole sweep. */
const SWEEP_BATCH = 50;

const T = sql`"payday"."attempt_counter"`;
const STAMPS = sql`"payday"."attempt_counter"."stamps"`;

/** The stamps still in the future. */
const liveStamps = (now: number) =>
	sql`array(select s from unnest(${STAMPS}) s where s > ${now}::bigint)`;
const liveCount = (now: number) =>
	sql`(select count(*) from unnest(${STAMPS}) s where s > ${now}::bigint)`;

/**
 * Counts one event for (scope, key), keeping at most the newest `keep` live stamps. With `max` it
 * counts only while fewer than `max` are live, and says whether it did. Without, it always counts.
 * `ttlMs` is how long the event counts for; the returned `stamp` is what `removeStamp` takes.
 */
export async function count(
	db: Db,
	scope: string,
	key: string,
	{
		now,
		ttlMs,
		keep,
		max,
		maxKeys
	}: { now: number; ttlMs: number; keep: number; max?: number; maxKeys: number }
): Promise<{ counted: boolean; stamp: number }> {
	const stamp = now + ttlMs;
	const grown = sql`array_append(${liveStamps(now)}, ${stamp}::bigint)`;
	const kept = sql`(${grown})[greatest(1, cardinality(${grown}) - ${keep}::int + 1):cardinality(${grown})]`;
	const rows = await db
		.insert(attemptCounter)
		.values({ scope, key, stamps: [stamp], until: stamp })
		.onConflictDoUpdate({
			target: [attemptCounter.scope, attemptCounter.key],
			set: {
				stamps: kept,
				until: sql`greatest(${sql`"payday"."attempt_counter"."until"`}, ${stamp}::bigint)`
			},
			setWhere: max === undefined ? undefined : sql`${liveCount(now)} < ${max}::int`
		})
		.returning({ inserted: sql<boolean>`(${T}."xmax" = 0)` });
	if (rows.length === 0) return { counted: false, stamp };
	if (rows[0].inserted) await tidy(db, scope, now, maxKeys);
	return { counted: true, stamp };
}

/** How many events for (scope, key) count at `now`. A read only; expired stamps are never counted. */
export async function live(db: Db, scope: string, key: string, now: number): Promise<number> {
	const [row] = await db
		.select({
			n: sql<number>`(select count(*)::int from unnest(${STAMPS}) s where s > ${now}::bigint)`
		})
		.from(attemptCounter)
		.where(and(eq(attemptCounter.scope, scope), eq(attemptCounter.key, key)));
	return row?.n ?? 0;
}

/** Gives back the newest count of (scope, key). */
export async function popNewest(db: Db, scope: string, key: string): Promise<void> {
	await db
		.update(attemptCounter)
		.set({ stamps: sql`${STAMPS}[1:greatest(cardinality(${STAMPS}) - 1, 0)]` })
		.where(and(eq(attemptCounter.scope, scope), eq(attemptCounter.key, key)));
}

/** Gives back the one count whose stamp is `stamp` (a held slot). Nothing if it already expired. */
export async function removeStamp(
	db: Db,
	scope: string,
	key: string,
	stamp: number
): Promise<void> {
	await db
		.update(attemptCounter)
		.set({
			stamps: sql`coalesce((
				select array_agg(u.s order by u.ord)
				from unnest(${STAMPS}) with ordinality as u(s, ord)
				where u.ord <> coalesce(array_position(${STAMPS}, ${stamp}::bigint), 0)
			), '{}'::bigint[])`
		})
		.where(and(eq(attemptCounter.scope, scope), eq(attemptCounter.key, key)));
}

/** Rows held for a scope (for tests and the cap). */
export async function rows(db: Db, scope: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(attemptCounter)
		.where(eq(attemptCounter.scope, scope));
	return row.n;
}

/** Deletes every expired row of a scope. Tests and maintenance; requests use the bounded `tidy`. */
export async function sweep(db: Db, scope: string, now: number): Promise<void> {
	await db
		.delete(attemptCounter)
		.where(and(eq(attemptCounter.scope, scope), sql`${attemptCounter.until} <= ${now}::bigint`));
}

/**
 * Runs when a new key arrives: clears a bounded batch of expired rows, then enforces the cap.
 *
 * The cap locks only the rows it deletes: a LIMIT of the excess, never an OFFSET, because Postgres
 * would lock every row an OFFSET skips. It may still delete a row refreshed after it was sorted,
 * which is harmless: that key just starts counting again.
 *
 * Best effort: housekeeping must never fail the call that was counted (a failure here would turn a
 * granted slot into an error and leak it), so an error is logged and swallowed. `SKIP LOCKED` keeps
 * it from waiting on, or deadlocking with, a row another request is counting right now, and the
 * expiry test is repeated in the outer DELETE so a row refreshed since the subquery read it stays.
 */
async function tidy(db: Db, scope: string, now: number, maxKeys: number): Promise<void> {
	try {
		await db.execute(sql`
			with doomed as (
				select "scope", "key" from "payday"."attempt_counter"
				where "scope" = ${scope} and "until" <= ${now}::bigint
				order by "until" limit ${SWEEP_BATCH}::int
				for update skip locked
			)
			delete from "payday"."attempt_counter" t using doomed d
			where t."scope" = d."scope" and t."key" = d."key" and t."until" <= ${now}::bigint
		`);
		await db.execute(sql`
			with doomed as (
				select "scope", "key" from "payday"."attempt_counter"
				where "scope" = ${scope}
				order by "until", "key"
				limit greatest(0, (select count(*) from "payday"."attempt_counter" where "scope" = ${scope}) - ${maxKeys}::int)
				for update skip locked
			)
			delete from "payday"."attempt_counter" t using doomed d
			where t."scope" = d."scope" and t."key" = d."key"
		`);
	} catch (error) {
		log({ level: 'warn', msg: 'sign-in counter cleanup failed', reason: String(error) });
	}
}
