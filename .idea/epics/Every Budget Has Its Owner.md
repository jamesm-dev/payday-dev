---
title: Every Budget Has Its Owner
created: 2026-11-15
updated: 2026-11-15
tags: [epic, many-people]
status: planned
theme: Many People And Any Device
phase: 9
sources: [Many People On One Site]
---

# Every Budget Has Its Owner

## Outcome

Every row of money data belongs to one person, and every read and write is scoped to the person
signed in. Two people on the same site can never see, change, export or restore into each other's
budget, and the owner's budget carries over unchanged as the first person.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] Every query and write in `server/money`, `server/reminders` and the routes takes the signed-in person's owner id from the session; the fixed `OWNER_ID` is gone from every request path, and a test fails if it comes back (5 pts) ^tsk-4da7e9
- [ ] A test signs in two people and proves, for every route in `src/routes`, that neither can read, change, download or restore the other's budget (5 pts) ^tsk-0a6680
- [ ] The owner's budget migrates unchanged as person 1: the number, the plan, loans, history, marks and passkeys are the same after the migration, proven on a copy of a version 2 backup (3 pts) ^tsk-ea2432
- [ ] Sign-in limits, the failure brake and the password-check queue protect each person and the site without one person locking another out (3 pts) ^tsk-8fcc17
- [ ] A full backup holds only its person's data and restores only into that person's account; the backup format says whose it is (2 pts) ^tsk-258eac
- [ ] The performance budget is measured again with 100 people's five years of data in one database: the home screen's p95 stays within 150 ms (2 pts) ^tsk-adbca1

## Approach

Most tables already carry `owner_id`, and writers already take `lockOwner(tx, ownerId)`; the work is
removing the single fixed owner from the request paths and proving the scoping with a sweep, the
way `guard.test.ts` sweeps every route. The scoping lives in the app's queries, not in Supabase's
row-level security, because the app connects as one database role
([[ADR-0014 Supabase Postgres As The Database]]). See [[ADR-0022 Open Sign-Up With A Limit]].

## Dependencies

- Builds on: [[Private Single User Access]], [[Sign-In State In The Database]], [[Postgres On Supabase]]
- Unblocks: [[Sign In With Google]], [[Your Account And Your Data]]

> [!warning] Risks
> - One unscoped query shows a stranger's money. Early warning: the two-person sweep failing, or a
>   route added without it.
> - The migration touches the owner's real budget. Early warning: any number different after the
>   migration on a copy of the real backup.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Many People On One Site]]
- Phase: [[ROADMAP]]
