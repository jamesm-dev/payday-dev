---
title: Backup Download And Restore
created: 2026-11-02
updated: 2026-11-02
tags: [epic, foundation]
status: planned
theme: Paycheck And Bills Out Of Sync
phase: 6
sources: [Safe To Spend Number]
---

# Backup Download And Restore

## Outcome

Settings downloads the whole budget as one file, and restores it: after a restore the number, the
schedule, the check-ins, the loans and the expenses are exactly as they were. It replaces
[[Backups And Restore Drill]], and it is how the budget moves from the current app to the Netlify one.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] Settings offers "Download a full backup": one file with the budget and its settings (pay, bills, balance, check-ins, loans, marks, expenses), never the password, devices or recovery codes (3 pts) ^tsk-f3fbd8
- [ ] Restoring a backup replaces the budget with the file's, after the same confirmation as Start over, and the number comes back exactly (5 pts) ^tsk-818581
- [ ] A file that is not a Payday backup, or comes from a newer version, is refused in words and changes nothing (2 pts) ^tsk-2fb11d
- [ ] Settings says when the last backup was downloaded, and suggests one when it has been more than two weeks (1 pt) ^tsk-b78efd
- [ ] A round trip in tests: back up, start over, restore, and every row is as it was (2 pts) ^tsk-86c4b3

## Approach

A versioned JSON file, written and read by the server, covering exactly what Start over deletes
(`money/erase.ts`). Restore is Start over followed by an import, in one transaction, behind the same
5-minute confirmation and typed word. Built first in Phase 6, on the current stack, so a backup taken
today restores into the Postgres version.

## Dependencies

- Blocked by: [[Daily Expense Log]], so expenses are in the file from the start

> [!warning] Risks
> - The backup holds the owner's whole budget in plain text. It is offered only to a confirmed
>   session, never cached, and says so where it is downloaded.
> - Ids are rebuilt on restore; anything that points at an id inside the file is mapped, never
>   trusted.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]] — it exists to keep the number's history safe
- Replaces: [[Backups And Restore Drill]]
- Decided in: [[ADR-0014 Supabase Postgres As The Database]]
- Phase: [[ROADMAP]]
