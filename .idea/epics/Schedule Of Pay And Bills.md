---
title: Schedule Of Pay And Bills
created: 2026-10-31
updated: 2026-10-31
tags: [epic, paycheck-and-bills]
status: done
theme: Paycheck And Bills Out Of Sync
phase: 1
sources: [Recurring Money Schedule]
---

# Schedule Of Pay And Bills

## Outcome

Every paycheck, bill and loan payment is entered once as a repeating rule, and the app knows each
dated occurrence for the year ahead — including yearly bills, saved for a little at a time.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] Money is stored and computed as integer minor units, enforced by a branded type, with no floats anywhere in the engine — verified by money.test.ts, including a grep for parseFloat and toFixed (2 pts) ^tsk-f859ea
- [x] Repeat rules — every 14 days from an anchor, monthly on a day, quarterly, yearly — expand into dated occurrences, and a day 29 to 31 falls on the month's last day when it is shorter — verified by schedule.test.ts (5 pts) ^tsk-94b259
- [x] Paychecks, bills and loan payments can be added, edited and ended at phone and laptop sizes — verified by journey.e2e.ts, schedule.e2e.ts, store.test.ts (5 pts) ^tsk-55d1dc
- [x] A single occurrence can be skipped or changed without changing its rule — verified by schedule.test.ts, store.test.ts, journey.e2e.ts (3 pts) ^tsk-92b79f
- [x] Yearly and quarterly bills set aside an equal share from each paycheck before they fall due — verified by safeToSpend.test.ts (3 pts) ^tsk-b9d04d
- [x] A seed script loads a fictional household that the tests and demos share — verified by seed.test.ts; pnpm seed loads the fixture (2 pts) ^tsk-4bcd15

## Approach

The engine is a pure TypeScript module — rules in, dated occurrences out — with no database or
framework imports, so it is tested densely and cheaply. Screens and storage sit around it. Loan
payments are plain bills here; [[Loan Ledger]] links them to loans in Phase 3.

## Dependencies

- Blocked by: [[Private Single User Access]] for real data; the engine itself can start at once
- Unblocks: [[Paycheck Periods And Safe To Spend]], [[Guided First Run Setup]]

> [!warning] Risks
> - Date edge cases eat the phase. Write the fixture tests before the screens.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Recurring Money Schedule]]
- Decision: [[ADR-0007 Money As Integer Minor Units]]
- Phase: [[ROADMAP]]
