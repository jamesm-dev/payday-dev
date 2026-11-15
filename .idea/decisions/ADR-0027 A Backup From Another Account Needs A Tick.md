---
title: ADR-0027 A Backup From Another Account Needs A Tick
created: 2026-11-16
updated: 2026-11-16
tags: [adr, decision]
status: accepted
decision: A backup says whose it is; one from another account restores only after the person ticks that it is theirs
supersedes:
superseded_by:
---

# ADR-0027 A Backup From Another Account Needs A Tick

## Context

From Phase 9 many people share one site ([[ADR-0022 Open Sign-Up With A Limit]]). The criterion
in [[Every Budget Has Its Owner]] asked that a full backup "restores only into that person's
account" and "says whose it is". Backup version 3 carries a random `backup_id` of the account that
made it. Supabase's free plan keeps no backups of its own, so a downloaded file is a person's only
way back after the database is rebuilt, or after they delete their account and make a new one; in
both cases their new account has a new `backup_id`.

## Options

| Option | Pros | Cons |
|---|---|---|
| Refuse every file from another account | Simple; no mix-ups | A person can never recover their own budget into a new account: backups lose their point |
| Accept any file silently | Simple; recovery always works | Someone could replace their budget with a file that is not theirs by mistake |
| Say whose it is, and restore another account's file only after a tick | Recovery stays possible; a mix-up needs a deliberate choice | One more box on the restore form |

## Decision

A version 3 backup carries its account's `backup_id`. A file whose id is not the restoring
account's is refused in plain words, before anything changes, unless the person also ticks "Yes,
this is my budget from another account"; the word DELETE is still required. Version 1 and 2 files
have no marker and restore as before. Decided by the main session on 2026-11-16 during Phase 9,
because a hard refusal would make disaster recovery impossible.

## Consequences

- The tick prevents mistakes; it is not access control. A restore only ever writes the
  restoring person's own rows, so a file from someone else can never touch their data, and
  `backup_id` is never a credential.
- [[Every Budget Has Its Owner]]'s criterion TSK-258eac is reworded to match, its id kept.
- Revisit if a restore ever writes anything outside the restoring account.
