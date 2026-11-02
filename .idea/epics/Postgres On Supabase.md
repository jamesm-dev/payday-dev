---
title: Postgres On Supabase
created: 2026-11-02
updated: 2026-11-02
tags: [epic, foundation]
status: planned
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

- [ ] One Postgres migration creates every table as the app has it, money in integer columns, and the SQLite migrations are retired (3 pts) ^tsk-670346
- [ ] Every data function runs on Postgres through Drizzle's postgres driver, asynchronously, and the app reads its connection from DATABASE_URL (8 pts) ^tsk-10c918
- [ ] Unit and browser tests run on an in-process Postgres, PGlite, with no Docker and no network, and all of them pass (5 pts) ^tsk-c9a0d3
- [ ] The app's tables cannot be read or written through Supabase's public data API (2 pts) ^tsk-e6c4d8
- [ ] The home screen and the loans screen stay inside the performance budget on Postgres (2 pts) ^tsk-166239

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
- Decided in: [[ADR-0014 Supabase Postgres As The Database]]
- Phase: [[ROADMAP]]
