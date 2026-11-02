---
title: Backups And Restore Drill
created: 2026-10-31
updated: 2026-11-02
tags: [epic, paycheck-and-bills]
status: cut
theme: Paycheck And Bills Out Of Sync
phase: 0
sources: [Safe To Spend Number]
---

# Backups And Restore Drill

## Outcome

The production database is copied off the machine continuously, a restore has actually been done
once, and a stopped backup is noticed rather than discovered after a loss.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] The production SQLite file is replicated continuously to S3-compatible object storage (3 pts) ^tsk-f23ade
- [ ] A written restore drill rebuilds the database from the backup into a fresh volume, and a row written before the drill is there afterwards (3 pts) ^tsk-93f82d
- [ ] A health endpoint reports the age of the last successful replication (2 pts) ^tsk-b61aaa

## Why cut

The owner, 2026-11-02: free hosting on Netlify with Supabase. There is no file to replicate, and Supabase's free plan has no backups, so the owner chose a backup they download themselves ([[ADR-0014 Supabase Postgres As The Database]]). Replaced by [[Backup Download And Restore]].

## Approach

Litestream runs beside the app in the same container. If it is unmaintained at setup, fall back to a
scheduled `sqlite3 .backup` to the same storage and record the swap as an ADR. A backup that has
never been restored is a hope, so the drill is the criterion that matters.

## Found during setup

- Litestream is maintained: 0.5.17 was released on 2026-08-31, so the `sqlite3 .backup` fallback
  is not needed.
- Litestream 0.5.17 exports counters, not timestamps, and only for its own sync loop
  (`litestream_sync_count`, `litestream_sync_error_count`). It has no metric for the upload to
  object storage. `/health` therefore reports the age of the last sync that rose with no new error,
  which catches a stopped or failing Litestream but may miss an upload that fails on its own. The
  restore drill is what proves the upload. The health-endpoint task, TSK-B61AAA, is built and
  unit-tested against the real metric format, and stays open until a production run shows the age
  moving.
- The drill is written in `app/docs/restore-drill.md`; it restores with `-o` on a one-off machine,
  so no second replicator ever writes to the bucket.

## Dependencies

- Blocked by: [[Walking Skeleton Deployed]]
- Must be done before any real data is entered in Phase 1

> [!warning] Risks
> - Storage credentials leak into the image or the repository. They live in Fly secrets only.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]] — and every other record the owner will build up
- Decision: [[ADR-0004 SQLite With Continuous Backup]]
- Phase: [[ROADMAP]]
