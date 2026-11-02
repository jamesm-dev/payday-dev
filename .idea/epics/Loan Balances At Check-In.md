---
title: Loan Balances At Check-In
created: 2026-10-31
updated: 2026-10-31
tags: [epic, debt]
status: done
theme: Getting Out Of Debt
phase: 3
sources: [Loan Ledger With Debt Free Date]
---

# Loan Balances At Check-In

## Outcome

Loan balances stay true without separate upkeep: each payday check-in confirms them, card spending
finally counts as spending, and the total owed can be watched going down.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] Each check-in pre-fills every loan's expected balance and lets it be confirmed or corrected — verified by checkinLoans.test.ts, loans.e2e.ts (3 pts) ^tsk-1e7743
- [x] A credit card's balance change counts toward spending since the last check-in, so card purchases are no longer missed — verified by checkinLoans.test.ts, loans.e2e.ts (3 pts) ^tsk-5a6861
- [x] The total owed at each check-in is listed, newest first, with the change since the previous one — verified by checkinLoans.test.ts, loans.e2e.ts (2 pts) ^tsk-2aab96

## Approach

One more step in the existing check-in, not a separate flow. The list of totals is a list, not a
chart and not a forecast.

## Dependencies

- Blocked by: [[Loan Ledger]], [[Payday Check-In Flow]]

> [!warning] Risks
> - The extra step pushes the check-in past five minutes with many loans. Pre-filled balances that
>   need only a tap to confirm are the defence.

## Related

- Theme: [[Getting Out Of Debt]]
- From: [[Loan Ledger With Debt Free Date]]
- Extends: [[Payday Check-In Flow]]
- Phase: [[ROADMAP]]
