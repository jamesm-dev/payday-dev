---
title: Paycheck Plan View
created: 2026-10-31
updated: 2026-10-31
tags: [epic, paycheck-and-bills]
status: done
theme: Paycheck And Bills Out Of Sync
phase: 2
sources: [Paycheck Period Budgeting]
---

# Paycheck Plan View

## Outcome

The next six paychecks are laid out, each with what it must cover and what is left, so a short
paycheck is seen weeks before it arrives.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] The next six paychecks each list what they must cover and what is left — verified by domain/plan.test.ts (hand-calculated), phase2.e2e.ts (3 pts) ^tsk-145499
- [x] A paycheck that cannot cover its bills is flagged with the shortfall — verified by domain/plan.test.ts, phase2.e2e.ts (2 pts) ^tsk-ca2df6
- [x] Months with a third paycheck are labelled — verified by domain/plan.test.ts, phase2.e2e.ts (1 pt) ^tsk-3f0502

## Approach

The same period assignment that powers the safe-to-spend number, shown forward instead of for today
only. The check-in ends here.

## Dependencies

- Blocked by: [[Paycheck Periods And Safe To Spend]]

> [!warning] Risks
> - It overlaps the deliberately uncommitted [[Cash Flow Runway]]. Keep it a list of paychecks, not a
>   daily projection.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Paycheck Period Budgeting]]
- Phase: [[ROADMAP]]
