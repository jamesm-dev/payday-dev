---
title: Paid Optional And Grouped Bills
created: 2026-11-01
updated: 2026-11-01
tags: [epic, paycheck-and-bills]
status: done
theme: Paycheck And Bills Out Of Sync
phase: 4
sources: [Handwritten Paycheck List]
---

# Paid Optional And Grouped Bills

## Outcome

Every bill and loan payment can carry the owner's own group name and an optional mark, and any bill
in a paycheck can be marked paid from the plan, so the app holds every mark on the owner's
handwritten list.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] On the Schedule page, a bill or loan payment can be given a group name and marked optional, and a migration leaves every existing item ungrouped and required — verified by money/paycheckList.test.ts, marks.e2e.ts; migration 0007_paycheck_list (3 pts) ^tsk-afd0d0
- [x] On the Plan, each bill in a paycheck can be marked paid and unmarked, without JavaScript — verified by money/paycheckList.test.ts, marks.e2e.ts; the Plan page sends no script (3 pts) ^tsk-645a0d
- [x] The next check-in starts with every bill marked paid already ticked, and a check-in's answer outranks the mark — verified by money/paycheckList.test.ts, the later word winning by time (2 pts) ^tsk-3d4bad
- [x] Marking a bill optional or paid leaves the safe-to-spend number unchanged, in a fixture test — verified by money/paycheckList.test.ts (1 pt) ^tsk-4a3a52
- [x] A Playwright test groups a bill, marks one optional and one paid, at phone size — verified by marks.e2e.ts on WebKit at iPhone size (2 pts) ^tsk-c13066

## Approach

Two columns on `schedule_item` (a group name and an optional flag) and one small table of paid marks,
keyed like a check-in's confirmation by the item and the date its rule gave the occurrence. A mark is
only a mark: it moves no money and changes no number. The safe-to-spend number keeps holding back
optional and paid bills, because the balance it counts from does not yet show them
([[ADR-0009 Conservative Safe To Spend Rules]]); the owner chose this on 2026-11-01.

## Dependencies

- Blocked by: [[Schedule Of Pay And Bills]], [[Paycheck Plan View]], [[Payday Check-In Flow]]
- Unblocks: [[Paycheck List Export]]

> [!warning] Risks
> - A group name drifts toward spending categories, a [[SPECS]] non-goal. It labels scheduled items
>   only; nothing is logged per expense.
> - A bill marked paid on the plan and then marked missed at a check-in. The check-in is the later
>   evidence, so it wins.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Handwritten Paycheck List]]
- Phase: [[ROADMAP]]
