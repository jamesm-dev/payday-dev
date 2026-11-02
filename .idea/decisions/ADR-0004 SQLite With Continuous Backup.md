---
title: ADR-0004 SQLite With Continuous Backup
created: 2026-10-31
updated: 2026-11-02
tags: [adr, decision]
status: superseded
decision: SQLite with continuous backup
supersedes:
superseded_by: ADR-0014 Supabase Postgres As The Database
---

# ADR-0004 SQLite With Continuous Backup

> [!warning] Superseded 2026-11-02 by [[ADR-0014 Supabase Postgres As The Database]]
> The owner moved the app to a free Netlify and Supabase setup. Kept for the record.

## Context

One owner, a few thousand rows a year, and a hosting budget of a few dollars a month. The data layer
is the hardest thing to change later, so it is decided once, here. Losing the schedule, the loans or
the check-in history would undo months of the habit the plan depends on.

## Options

| Option | Pros | Cons |
|---|---|---|
| SQLite on a persistent volume, replicated to object storage | No network hop; one file; trivial local development; cheap | One machine; backups are this project's job |
| Managed Postgres | Backups and failover handled | A second service; a network hop on every read; some free tiers pause idle databases |

## Decision

SQLite on the host's persistent volume, replicated continuously to S3-compatible object storage with
Litestream, falling back to a scheduled `sqlite3 .backup` if Litestream is unmaintained at setup.
Proposed by Claude during `/shape`; accepted when `SPECS.md` was signed off, on 2026-10-31.

## Consequences

- Reads for the home screen are local and fast, within the 150 ms server budget in [[SPECS]].
- The app runs on exactly one machine; there is no horizontal scaling, and none is needed.
- [[Backups And Restore Drill]] is a Phase 0 epic, before any real data exists.
- Revisit if the app ever has a second user.
