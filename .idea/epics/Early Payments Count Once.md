---
title: Early Payments Count Once
created: 2026-11-15
updated: 2026-11-15
tags: [epic, paycheck-and-bills]
status: done
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

- [x] The engine counts an occurrence marked paid before its due date as paid on the day it was marked: after the balance's date it lowers the number at once, on or before it the balance already holds it, and it is no longer reserved in its own paycheck — hand-calculated fixture tests first, in `domain/` — verified by safeToSpend.early.test.ts, plan.early.test.ts and edges.early.test.ts (hand-calculated: 147000 to 107000 after the balance, 150000 before it, the same-day read time, a moved payment); dfce062, 347c52d, 2026-11-15 (5 pts) ^tsk-15df8b
- [x] Taking the mark off puts the reservation back, and a check-in's "did not go out" outranks an early mark and reserves it again — in fixture tests — verified by safeToSpend.early.test.ts, plan.early.test.ts, checkin.early.test.ts and earlyFixes.test.ts (taking the mark off; "did not go out" outranks; a skip refused while paid early) and markLockOrder.test.ts (under the owner lock); dfce062, 347c52d, c392d2a, 2026-11-15 (2 pts) ^tsk-7642d5
- [x] On the plan, a bill in any of the next six paychecks offers "Paid early", says in plain words what it does to the number, and works without JavaScript — verified by earlyMarks.test.ts and reviewFixes.test.ts ("Paid early" with its plain sentence, a plain form post, the number down by the amount and the home screen saying so) and marks.e2e.ts; 2237c7c, c392d2a, 2026-11-15 (3 pts) ^tsk-4c1d5a
- [x] A loan payment paid early lowers that loan's expected balance and moves its projection, and the next check-in expects the lower balance — verified by loans.early.test.ts, loansEarly.test.ts and reviewFixes.test.ts (the expected balance lower from the day paid, the debt-free date moved, a payment marked before or after the loans step counted once; migration 0005, kept in backups); f27ff03, 347c52d, 72ee240, 4559858, 2026-11-15 (3 pts) ^tsk-bfbb02
- [x] The check-in of the paycheck an early payment belonged to shows it as paid already and does not ask again — verified by checkin.early.test.ts, checkinEarly.test.ts, reviewFixes.test.ts and earlyLine.test.ts (shown answered, "Paid early on <date>"; "No, it did not go out" still possible and kept after an error; the done page holds it out); f27ff03, c392d2a, 72ee240, 2026-11-15 (2 pts) ^tsk-c00c8a
- [x] The paycheck list export shows an early-paid bill with `/` in its own paycheck, and its totals add up — verified by earlyMarks.test.ts and paycheckList.test.ts (`/` in its own paycheck; Total (ALL) unchanged, "Total (this paycheck)" without it); 2237c7c, 2026-11-15 (1 pt) ^tsk-a8feb5
- [x] A Playwright test at phone size pays a later bill early: the number drops by its amount, and that paycheck no longer holds it — verified by marks.e2e.ts TSK-500C4F at iPhone size (the number down by exactly the bill, that paycheck no longer holding it, the mark then taken off); 2237c7c, 2026-11-15 (2 pts) ^tsk-500c4f
- [x] A bill due before the next payday offers "Paid early" from the home screen's list of what is kept aside, works without JavaScript, leaves the number as it was (the money was already kept aside), and the payday update then shows it answered — in server and Playwright tests — verified by homeMark.test.ts (the window, the number unchanged, refusals, answered at the payday update, past ones off the list), HomeNumber.test.ts and marks.e2e.ts TSK-342C1F at iPhone size, run every day; ce7f894, b8243a6, df1458a, 2026-11-15 (3 pts) ^tsk-342c1f

> [!note] Added 2026-11-15
> The last criterion was added while Phase 7 was built, at the owner's choice. The integration review
> found that the plan starts at the next payday, so a bill in the current paycheck had no "Paid early"
> anywhere, though the Outcome promises "in this paycheck or a later one". The owner chose to add it
> now rather than later.

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
