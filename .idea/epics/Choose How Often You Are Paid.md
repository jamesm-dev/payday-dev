---
title: Choose How Often You Are Paid
created: 2026-11-15
updated: 2026-11-15
tags: [epic, paycheck-and-bills]
status: planned
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

- [ ] Guided setup asks "How often are you paid?" with three plain choices: every two weeks (one date), twice a month (two days of the month), once a month (one day), each with an example (3 pts) ^tsk-79352e
- [ ] Settings changes the rhythm; the change applies from the next payday, a payday update under way is finished on the old rhythm, and the screen says so (3 pts) ^tsk-c8da31
- [ ] The payday update, the plan, the home screen and the export speak of "until your next payday" and count paychecks by the rhythm, with no "14 days" or "two weeks" left for a twice-a-month or monthly owner (2 pts) ^tsk-c2a0c8
- [ ] The calendar file lists the paydays the rhythm gives (1 pt) ^tsk-904aa5
- [ ] A full backup carries the rhythm and restores it, and a backup from before this change restores as every 14 days (1 pt) ^tsk-20e9ef
- [ ] Playwright tests at phone size set up a twice-a-month and a monthly owner, do a payday update, and see the right next payday on the plan (3 pts) ^tsk-ae3a14

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
