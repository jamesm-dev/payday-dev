---
title: Postgres On Supabase
created: 2026-11-02
updated: 2026-11-15
tags: [epic, foundation]
status: done
theme: Paycheck And Bills Out Of Sync
phase: 6
sources: [Safe To Spend Number]
---

# Postgres On Supabase

## Outcome

The app keeps its data in Postgres: Supabase in production, an in-process PGlite in development and
tests. Every test still passes, with no Docker and no network, and Supabase's public data API cannot
reach the app's tables.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] One Postgres migration creates every table as the app has it, money in integer columns, and the SQLite migrations are retired — verified by db/open.test.ts (every table, in schema payday, bigint money), 558e8ef, 2026-11-15 (3 pts) ^tsk-670346
- [x] Every data function runs on Postgres through Drizzle's postgres driver, asynchronously, and the app reads its connection from DATABASE_URL — verified by the full suite on PGlite, db/lockOrder.test.ts, and a verified login to the Supabase pooler through openDatabase, 558e8ef, 2026-11-15 (8 pts) ^tsk-10c918
- [x] Unit and browser tests run on an in-process Postgres, PGlite, with no Docker and no network, and all of them pass — verified: 930 unit and 523 browser tests on PGlite, 558e8ef, 2026-11-15 (5 pts) ^tsk-c9a0d3
- [x] The app's tables cannot be read or written through Supabase's public data API — verified by db/open.test.ts with Supabase's anon and authenticated roles simulated, including a table added later; checked on the live project at release, 558e8ef, 2026-11-15 (2 pts) ^tsk-e6c4d8
- [x] The home screen and the loans screen stay inside the performance budget on Postgres — verified by performance.test.ts on PGlite: home p95 33 ms, loans p95 53 ms; network latency is measured on production at release, 2026-11-15 (2 pts) ^tsk-166239

## Approach

Drizzle stays; its SQLite schema becomes a Postgres schema, and better-sqlite3's synchronous calls
become awaited ones, store by store, with the domain engine untouched. PGlite stands in for Postgres
wherever a test or a local server needs a database. The app's tables go in their own schema, which
Supabase does not expose, so its public API sees nothing.

## Dependencies

- Blocked by: [[Backup Download And Restore]], so today's data can be carried across

> [!warning] Risks
> - The largest change since setup: every store, route and test. Built in slices, each green before
>   the next.
> - PGlite is not the Supabase server. Early warning: a query that passes locally and fails on
>   Supabase, caught by a first deploy to a preview before the real one.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]]
- Decided in: [[ADR-0014 Supabase Postgres As The Database]], [[ADR-0017 Postgres Types And Driver Version]]
- Phase: [[ROADMAP]]
