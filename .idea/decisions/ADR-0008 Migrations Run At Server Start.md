---
title: ADR-0008 Migrations Run At Server Start
created: 2026-10-31
updated: 2026-11-02
tags: [adr, decision]
status: superseded
decision: Apply database migrations when the server starts
supersedes:
superseded_by: ADR-0015 Migrations Run At Deploy
---

# ADR-0008 Migrations Run At Server Start

> [!warning] Superseded 2026-11-02 by [[ADR-0015 Migrations Run At Deploy]]
> The owner moved the app to a free Netlify and Supabase setup. Kept for the record.

## Context

[[ADR-0004 SQLite With Continuous Backup]] puts the database on one Fly.io volume, mounted on one
machine ([[ADR-0005 Fly.io As The Host]]). Migrations are checked-in SQL from drizzle-kit, and
something has to apply them on every deploy. `SPECS.md` did not say when.

## Options

| Option | Pros | Cons |
|---|---|---|
| A deploy step (Fly's release command) | Migrations run once, before traffic moves | Fly runs it on a temporary machine without the volume, so it would migrate an empty file and leave the real one untouched |
| At server start, before the first request | Runs against the real file on the real volume; a bad migration fails the boot, so the health check keeps the old version serving | Every boot checks for migrations; the first boot after a deploy is slower |
| By hand, with `drizzle-kit migrate` over SSH | Full control | Easy to forget; a deploy can ship code ahead of its schema |

## Decision

Apply migrations at server start, in SvelteKit's `init` hook, through `open()` in
`app/src/lib/server/db/open.ts`. The build skips it: the build runs the server to prerender, and must
not need or create a database. Decided by `/setup` on 2026-10-31, because `SPECS.md` did not cover it.

## Consequences

- Safe only while there is exactly one machine. A second machine starting at the same moment could
  race on the same migration. Revisit if the app ever runs more than one.
- A migration that fails stops the boot and is visible in `fly logs`, rather than serving a broken
  schema.
- Tests use the same path: `open(':memory:')` gives every test run a fresh, migrated database.
