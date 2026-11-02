---
title: Loan Ledger
created: 2026-10-31
updated: 2026-10-31
tags: [epic, debt]
status: done
theme: Getting Out Of Debt
phase: 3
sources: [Loan Ledger With Debt Free Date]
---

# Loan Ledger

## Outcome

Every loan — credit card, instalment loan, buy-now-pay-later plan or informal loan — is in one list
with its balance, rate and next payment, and the total owed is one number.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] Credit cards, instalment loans, buy-now-pay-later plans and informal loans can each be added with the fields their kind needs — verified by loans.test.ts, seed.test.ts, loans.e2e.ts (5 pts) ^tsk-a641f9
- [x] A loan's payments are linked to its schedule item, so the safe-to-spend number counts each payment once — verified by loans.test.ts, which converts a bill into a loan and leaves the number unchanged, and loans.e2e.ts (3 pts) ^tsk-d5aaaa
- [x] A loan-payment bill entered during setup can be turned into a loan without entering it again — verified by loans.e2e.ts, loans.test.ts (2 pts) ^tsk-f2d30c
- [x] The loan list shows each balance, rate, next payment and due date, and the total owed — verified by loans.test.ts, loans.e2e.ts (2 pts) ^tsk-4e012e

## Approach

One table with a `type` and the fields each type needs; a credit card's minimum-payment rule is a
field per card, not a constant. A loan saved without a known rate shows it as unknown rather than
guessing.

## Dependencies

- Blocked by: [[Schedule Of Pay And Bills]]
- Unblocks: [[Debt Free Date Projection]], [[Loan Balances At Check-In]]

> [!warning] Risks
> - Four kinds of loan tempt four code paths. Keep one model; let only the projection differ by type.

## Related

- Theme: [[Getting Out Of Debt]]
- From: [[Loan Ledger With Debt Free Date]]
- Phase: [[ROADMAP]]
