---
title: Choose How Often You Are Paid
created: 2026-11-15
updated: 2026-11-15
tags: [epic, paycheck-and-bills]
status: done
theme: Paycheck And Bills Out Of Sync
phase: 7
sources: [Pay Rhythm Setting]
---

# Choose How Often You Are Paid

## Outcome

Guided setup asks how often the owner is paid, Settings can change it, and every screen that spoke
of "14 days" or "two weeks" now follows the chosen rhythm: the payday update (the check-in), the
plan, the home screen, the export and the calendar file.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] Guided setup asks "How often are you paid?" with three plain choices: every two weeks (one date), twice a month (two days of the month), once a month (one day), each with an example — verified by journey.e2e.ts TSK-79352E (three plain choices with examples, the February refusal) and rhythm.e2e.ts (setup as twice a month and as monthly); one main pay saved under the owner lock (rhythm.test.ts); d32b51c, 43859cc, 2026-11-15 (3 pts) ^tsk-79352e
- [x] Settings changes the rhythm; the change applies from the next payday, a payday update under way is finished on the old rhythm, and the screen says so — verified by rhythm.test.ts (the next payday stays on the old rhythm; every switch between the three; a payday still ahead; the last old payday; End and Resume; an update under way untouched) and schedule.e2e.ts; 42b84b2, 43859cc, 2026-11-15 (3 pts) ^tsk-c8da31
- [x] The payday update, the plan, the home screen and the export speak of "until your next payday" and count paychecks by the rhythm, with no "14 days" or "two weeks" left for a twice-a-month or monthly owner — verified by checkin.test.ts TSK-C2A0C8 (the window ends on the next payday) and rhythm.e2e.ts (no "14 days" or "two weeks" on home, plan, payday update, done page, settings or setup for a twice-a-month and a monthly owner); the export reads "Total (this paycheck)", the owner's choice; d32b51c, 2026-11-15 (2 pts) ^tsk-c2a0c8
- [x] The calendar file lists the paydays the rhythm gives — verified by ics.test.ts TSK-904AA5: 24 paydays a year twice a month, 12 monthly, every 14 days unchanged; 42b84b2, 2026-11-15 (1 pt) ^tsk-904aa5
- [x] A full backup carries the rhythm and restores it, and a backup from before this change restores as every 14 days — verified by fullBackup.test.ts (version 2 carries the second day, the main pay and each loan figure's read time; a version 1 file restores with the main pay inferred as migration 0003 does; two running main pays refused), mainPay.test.ts and backup.e2e.ts; c78249e, 00921e1, 4559858, 2026-11-15 (1 pt) ^tsk-20e9ef
- [x] Playwright tests at phone size set up a twice-a-month and a monthly owner, do a payday update, and see the right next payday on the plan — verified by rhythm.e2e.ts at iPhone size: a twice-a-month and a monthly owner set up, do a payday update and see the engine's next payday on the plan; dfb9daf, 43859cc, 2026-11-15 (3 pts) ^tsk-ae3a14

## Approach

The rhythm is the main pay's own repeat rule, so no separate setting can disagree with the
schedule ([[ADR-0021 Pay Rhythm Is A Setting]]). Setup and Settings edit that rule; every
sentence that names a length reads it from the engine instead of a constant.

## Dependencies

- Blocked by: [[Paydays From Any Pay Rhythm]]
- Builds on: [[Guided First Run Setup]], [[Payday Check-In Flow]], [[Paycheck List Export]]

> [!warning] Risks
> - A rhythm changed mid-way can leave a paycheck with no set-aside share. Early warning: a
>   set-aside short at its due date after a change.
> - Wording drift: "two weeks" survives in some screen. Early warning: a search of the routes for
>   "14" and "two weeks" in the tests of a monthly owner.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Pay Rhythm Setting]]
- Phase: [[ROADMAP]]
