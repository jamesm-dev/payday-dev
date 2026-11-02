---
title: Paycheck Periods And Safe To Spend
created: 2026-10-31
updated: 2026-10-31
tags: [epic, paycheck-and-bills]
status: done
theme: Paycheck And Bills Out Of Sync
phase: 1
sources: [Safe To Spend Number]
---

# Paycheck Periods And Safe To Spend

## Outcome

The home screen shows one number — what can be spent until the next payday — with the payday, what is
already reserved, and how fresh the balance behind it is.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] Pay periods are derived from the payday anchor; each occurrence belongs to the paycheck that covers it, and one due on a payday counts against the previous paycheck — verified by periods.test.ts (3 pts) ^tsk-5642e7
- [x] Safe to spend is the current balance minus everything due before the next payday minus set-asides, and matches hand calculations for the fixture on five named dates, including a payday and a three-paycheck month — verified by safeToSpend.test.ts, five hand-calculated dates (5 pts) ^tsk-4ef766
- [x] The home screen shows the number, the next payday and the list of what is reserved — verified by home.e2e.ts, journey.e2e.ts, home.test.ts (3 pts) ^tsk-997e16
- [x] The number shows the date of the balance behind it, and warns once that balance is older than the last payday — verified by home.test.ts, journey.e2e.ts (2 pts) ^tsk-1899c1
- [x] A negative result shows what is short and by how much, not a red number alone — verified by home.test.ts, journey.e2e.ts (2 pts) ^tsk-dbb197

## Approach

A pure function of the schedule, the overrides, the latest balance and today's date, in the same
engine module as the schedule. The page renders on the server, so the number arrives in the first
response, within the home screen budget.

## Dependencies

- Blocked by: [[Schedule Of Pay And Bills]]
- Unblocks: [[Payday Check-In Flow]], [[Paycheck Plan View]]

> [!warning] Risks
> - A number that is confidently wrong is worse than none. The freshness warning is not optional.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]]
- Uses: the pay periods of [[Paycheck Period Budgeting]], shown in full by [[Paycheck Plan View]]
- Phase: [[ROADMAP]]
