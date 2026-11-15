---
title: Every Budget Has Its Owner
created: 2026-11-15
updated: 2026-11-16
tags: [epic, many-people]
status: done
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

- [x] Every query and write in `server/money`, `server/reminders` and the routes takes the signed-in person's owner id from the session; the fixed `OWNER_ID` is gone from every request path, and a test fails if it comes back — verified by noFixedOwner.test.ts (no fixed owner in auth, routes, money, reminders, export or hooks, with self-tests) and the two-person sweep, 2026-11-16 (5 pts) ^tsk-4da7e9
- [x] A test signs in two people and proves, for every route in `src/routes`, that neither can read, change, download or restore the other's budget — verified by ownership.test.ts: every load, action and endpoint as person 2 with person 1's ids, with a leak detector for names, amounts, dates, passkeys, devices and email, meta-tests for unlisted routes, and a planted leak caught; passkeyOwnership.test.ts for step-up and add-passkey, 2026-11-16 (5 pts) ^tsk-0a6680
- [x] The owner's budget migrates unchanged as person 1: the number, the plan, loans, history, marks and passkeys are the same after the migration, proven on a copy of a version 2 backup — verified by ownerMigration.test.ts: a version 2 fixture restored at 0005, every row, the number, plan, loans, check-ins, marks, passkeys and export unchanged after 0006; the real backup is checked with scripts/check-owner-migration.ts before the deploy, 2026-11-16 (3 pts) ^tsk-ea2432
- [x] Sign-in limits, the failure brake and the password-check queue protect each person and the site without one person locking another out — verified by signInAttempt, failureBrake and signin page tests: one person's typos on a shared address never stop another, an account's failures only slow it (at most 3 s), a sprayer stays held, 2026-11-16 (3 pts) ^tsk-8fcc17
- [x] A full backup holds only its person's data and says whose it is; another account's file restores only after the person ticks that it is theirs ([[ADR-0027 A Backup From Another Account Needs A Tick]]; reworded 2026-11-16, the id kept) — verified by fullBackup.test.ts (each export holds only its owner's rows; another account's v3 file refused without the tick and restored with it; v1 and v2 still restore) and backup.e2e.ts, 2026-11-16 (2 pts) ^tsk-258eac
- [x] The performance budget is measured again with 100 people's five years of data in one database: the home screen's p95 stays within 150 ms — verified by performanceMany.test.ts: 100 owners with five years each, owner 50 home p95 32.7 ms and loans p95 58.9 ms (budget 150 ms), 2026-11-16 (2 pts) ^tsk-adbca1

## Approach

Most tables already carry `owner_id`, and writers already take `lockOwner(tx, ownerId)`; the work is
removing the single fixed owner from the request paths and proving the scoping with a sweep, the
way `guard.test.ts` sweeps every route. The scoping lives in the app's queries, not in Supabase's
row-level security, because the app connects as one database role
([[ADR-0014 Supabase Postgres As The Database]]). See [[ADR-0022 Open Sign-Up With A Limit]].

## Dependencies

- Builds on: [[Private Single User Access]], [[Sign-In State In The Database]], [[Postgres On Supabase]]
- Unblocks: [[Sign Up With Email And Password]], [[Your Account And Your Data]] ([[Sign In With Google]] was cut)

> [!warning] Risks
> - One unscoped query shows a stranger's money. Early warning: the two-person sweep failing, or a
>   route added without it.
> - The migration touches the owner's real budget. Early warning: any number different after the
>   migration on a copy of the real backup.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Many People On One Site]]
- Phase: [[ROADMAP]]
