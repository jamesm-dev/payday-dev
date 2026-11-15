---
title: Early Payments Count Once
created: 2026-11-15
updated: 2026-11-15
tags: [epic, paycheck-and-bills]
status: planned
theme: Paycheck And Bills Out Of Sync
phase: 7
sources: [Pay A Bill Early]
---

# Early Payments Count Once

## Outcome

A bill or loan payment paid before its due date, in this paycheck or a later one, is marked paid
early from the plan. The safe-to-spend number drops by its amount at once, its own paycheck stops
holding it back, and it is counted exactly once whatever balance is entered afterwards.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] The engine counts an occurrence marked paid before its due date as paid on the day it was marked: after the balance's date it lowers the number at once, on or before it the balance already holds it, and it is no longer reserved in its own paycheck — hand-calculated fixture tests first, in `domain/` (5 pts) ^tsk-15df8b
- [ ] Taking the mark off puts the reservation back, and a check-in's "did not go out" outranks an early mark and reserves it again — in fixture tests (2 pts) ^tsk-7642d5
- [ ] On the plan, a bill in any of the next six paychecks offers "Paid early", says in plain words what it does to the number, and works without JavaScript (3 pts) ^tsk-4c1d5a
- [ ] A loan payment paid early lowers that loan's expected balance and moves its projection, and the next check-in expects the lower balance (3 pts) ^tsk-bfbb02
- [ ] The check-in of the paycheck an early payment belonged to shows it as paid already and does not ask again (2 pts) ^tsk-c00c8a
- [ ] The paycheck list export shows an early-paid bill with `/` in its own paycheck, and its totals add up (1 pt) ^tsk-a8feb5
- [ ] A Playwright test at phone size pays a later bill early: the number drops by its amount, and that paycheck no longer holds it (2 pts) ^tsk-500c4f

## Approach

An early payment is a paid mark with a meaning: `paid_mark.marked_at` already records when it was
made, so the change is in `domain/safeToSpend.ts` and `domain/plan.ts` rather than the schema. It
counts like a logged expense until a later balance takes over
([[ADR-0020 Early Payments Count Until The Next Balance]]), which amends SPECS decision 13 for
marks made before the due date.

## Dependencies

- Builds on: [[Paid Optional And Grouped Bills]], [[Paycheck Periods And Safe To Spend]],
  [[Daily Expense Log]] (the same "until the next balance" rule)
- Unblocks: nothing yet

> [!warning] Risks
> - `domain/safeToSpend.ts` is the number the app exists for. Early warning: any existing fixture
>   changing value. None may; only new fixtures may differ from today.
> - A mark made days after the payment, after a balance that already lacks the money, counts it
>   twice. Early warning: a check-in whose spending is negative by about one bill.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Pay A Bill Early]]
- Phase: [[ROADMAP]]
