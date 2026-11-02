---
title: Debt Free Date Projection
created: 2026-10-31
updated: 2026-10-31
tags: [epic, debt]
status: done
theme: Getting Out Of Debt
phase: 3
sources: [Loan Ledger With Debt Free Date]
---

# Debt Free Date Projection

## Outcome

The owner sees what the loans cost in interest each month and the date they will all be paid off at
the current pace — or, honestly, that one of them never will be.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] Each kind of loan projects its payoff date at current payments, matching a reference calculation within one minor unit per period, in unit tests — verified by loans.test.ts, against the closed-form amortisation after every period, for every kind (5 pts) ^tsk-7dfbfa
- [x] The interest all loans cost this month is shown as one figure — verified by loans.test.ts, loans.e2e.ts (2 pts) ^tsk-05b6cf
- [x] The overall debt-free date is shown, and a loan whose payment does not cover its interest says it will never be paid off at this pace — verified by loans.test.ts, loans.e2e.ts (3 pts) ^tsk-5cefea

## Approach

Pure functions in the engine module, beside the schedule. Projection only at current payments —
comparing strategies is [[Debt Payoff Planner]], deliberately after v1.

## Dependencies

- Blocked by: [[Loan Ledger]]

> [!warning] Risks
> - Variable rates make a single date look more certain than it is. Show the rate it assumes.

## Related

- Theme: [[Getting Out Of Debt]]
- From: [[Loan Ledger With Debt Free Date]]
- Phase: [[ROADMAP]]
