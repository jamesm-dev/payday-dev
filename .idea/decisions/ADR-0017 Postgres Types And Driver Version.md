---
title: ADR-0017 Postgres Types And Driver Version
created: 2026-11-02
updated: 2026-11-02
tags: [adr, decision]
status: accepted
decision: bigint money, text instants, postgres 3.4.9
supersedes:
superseded_by:
---

# ADR-0017 Postgres Types And Driver Version

## Context

[[ADR-0014 Supabase Postgres As The Database]] moves the data from SQLite to Postgres and names the
`postgres` driver, but leaves two things open that `/setup` had to settle before
[[Postgres On Supabase]] could be built.

1. **Column types.** SQLite's integers are 64-bit, and the app stores instants (when an expense was
   logged, when a balance was saved or read) as ISO text such as `2026-11-02T06:53:59.583Z`. The
   safe-to-spend number compares those instants **as strings** (`money/expenses.ts`), and the
   backup file carries them verbatim ([[Backup Download And Restore]]). ADR-0014 said money would
   be `integer` columns; Postgres's `integer` is 32-bit, which caps an amount at 21,474,836.47 in
   major units.
2. **Driver version.** `postgres` 4.0.0 was released on 2026-10-29, four days before this decision.
   Its notes say it "rewrites everything below the public API: the pool, the connection, the
   protocol, startup and the socket layer", and lets the server decide every parameter's type.
   drizzle-orm 0.45.4 (2026-10-08) predates it and declares `postgres >= 3`. 3.4.9 (2026-04-05) is
   the last 3.x.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Money as `bigint`** (Drizzle `mode: 'number'`) | Same range as SQLite up to JavaScript's safe integers; still integer minor units ([[ADR-0007 Money As Integer Minor Units]]) | 8 bytes a value instead of 4: nothing, at one person's scale |
| Money as `integer` | What ADR-0014 wrote | A loan or a mortgage in some currencies passes 21 million; the cap would be silent until an insert fails |
| Money as `numeric` | Unbounded | Returned as strings; every read needs converting, and floats creep back in |
| **Instants as `text`, in the exact form the app writes** | Behaviour and backups stay byte-identical; string comparison keeps working | No time arithmetic in SQL; the format is enforced by the app and the backup parser, not the column |
| Instants as `timestamptz` | Native, and comparable in SQL | The driver returns `Date` objects or another ISO shape: every comparison, every view and the backup format change at once, inside the largest change since setup |
| **Driver `postgres` 3.4.9, pinned exactly** | Seven months in use; the version Drizzle was built against | Misses 4.0's rewrite; its two security fixes concern untrusted connection parameters and column names, and this app has neither |
| Driver `postgres` 4.0.0 | Current | Four days old, a rewrite, untested by Drizzle 0.45.4 |

## Decision

- Money columns are `bigint` with Drizzle's `mode: 'number'`. Rates stay integer basis points.
- Instants stay `text`, always `YYYY-MM-DDTHH:MM:SS.sssZ`, as the app writes them today. Calendar dates
  are `date` columns read as `'YYYY-MM-DD'` strings; booleans are `boolean`.
- Every table lives in a `payday` schema, not `public` (ADR-0014's "where that API cannot reach
  them").
- `postgres` is pinned at **3.4.9**, exactly; PGlite at 0.5.14.

Decided by `/setup` on 2026-11-02 while building Phase 6.

## Consequences

- Amends ADR-0014's "as `integer` columns" to `bigint`; the rest of ADR-0014 stands.
- The domain engine and the backup format see exactly the values they see today.
- The backup parser accepts only the exact instant format, so a hand-edited file cannot make the
  string comparison lie.
- Revisit the driver when Drizzle releases with `postgres` 4 support, or if 3.x gets a security fix
  this app needs. Revisit `text` instants only if SQL ever needs to do time arithmetic.

## Related

- Builds on: [[ADR-0014 Supabase Postgres As The Database]], [[ADR-0007 Money As Integer Minor Units]]
- Epics: [[Postgres On Supabase]], [[Backup Download And Restore]]
- Phase: [[ROADMAP]]
