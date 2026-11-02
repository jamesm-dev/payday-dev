---
title: ADR-0014 Supabase Postgres As The Database
created: 2026-11-02
updated: 2026-11-02
tags: [adr, decision]
status: accepted
decision: Supabase Postgres, backups by download
supersedes: ADR-0004 SQLite With Continuous Backup
superseded_by:
---

# ADR-0014 Supabase Postgres As The Database

## Context

[[ADR-0004 SQLite With Continuous Backup]] kept the data in one SQLite file on a disk, copied to
object storage by Litestream. On Netlify ([[ADR-0013 Netlify As The Host]]) there is no disk to keep
a file on. The owner named Supabase. Its free plan (pricing page, checked 2026-11-02): a 500 MB
database, 5 GB of egress, two active projects, **no automatic backups or point-in-time recovery**,
and **projects paused after 1 week of inactivity** until restored from the dashboard.

## Options

| Option | Pros | Cons |
|---|---|---|
| Supabase Postgres, used only as a database | Free; real Postgres; the owner's choice | Every query becomes asynchronous and the schema and migrations move to Postgres; no backups on the free plan; paused after a quiet week |
| Turso (hosted SQLite) | Keeps the SQLite dialect and migrations | Every query still becomes asynchronous; not the owner's choice |
| Keep SQLite on a disk | No change | Needs a host with a disk, which Netlify is not |

## Decision

Supabase Postgres, reached from the server only, through Drizzle's `postgres` driver (drizzle-orm
0.45.4 supports `postgres` 3 and up; version 4.0.0 is current, checked on npm 2026-11-02). Supabase's
own APIs, auth and storage are not used. Tests and local development run an in-process Postgres,
PGlite (`@electric-sql/pglite`, 0.5.14 current), so neither needs Docker or a network.

**Backups are the owner's**: Settings offers "Download a full backup", one file with everything, and
a way to restore it. The owner's choice, 2026-11-02, over a nightly automatic copy.

## Consequences

- Every data function becomes asynchronous, and every test moves from in-memory SQLite to PGlite.
  The largest change to the code since setup.
- Supabase exposes tables through a public data API by default. The app's tables live where that
  API cannot reach them, or behind row-level security that allows nothing; the app itself connects
  with the database password, as a server, never from the browser.
- A week with no use pauses the project, and the app is down until it is restored in Supabase's
  dashboard. Daily expenses make a quiet week less likely; it is still the first thing to check.
- No backup exists unless the owner downloads one. The app says when the last download was.
- Money stays integer minor units ([[ADR-0007 Money As Integer Minor Units]]), as `integer` columns.
- Revisit if the data nears 500 MB (years away for one person), or if a missed restore loses data.
