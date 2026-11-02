---
title: Expenses At Check-In
created: 2026-11-02
updated: 2026-11-02
tags: [epic, tracking]
status: planned
theme: Tracking Without Willpower
phase: 5
sources: [Five Second Quick Add, Payday Check-In]
---

# Expenses At Check-In

## Outcome

The payday check-in shows what was logged since the last balance beside what the bank says was
spent, and the difference as not logged. Once it is saved, its balance is the new starting point:
the expenses it covers stay in the history but no longer lower the number.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] The check-in's spending step shows what was logged since the last balance, what the bank balance says was spent, and the difference as not logged (3 pts) ^tsk-0f0d82
- [ ] A card purchase logged as an expense is counted once at the check-in: it is matched by the card's balance change, not added to it (2 pts) ^tsk-85a7c6
- [ ] After a check-in the home screen counts no expense from before it, and the number is the check-in's (2 pts) ^tsk-3b4755
- [ ] Each past check-in shows what was logged in its stretch beside the spending it worked out (2 pts) ^tsk-bcf25e
- [ ] A browser test at iPhone size logs expenses, does a check-in, and checks the comparison and the hand-over (2 pts) ^tsk-f9d442

## Approach

The check-in already works out what was spent from the balance it is given
([[Payday Check-In Flow]], [[Loan Balances At Check-In]]). This adds the logged total beside it and
saves the comparison with the check-in, so past check-ins can show it. The hand-over needs no extra
step: the check-in saves a new balance, and the rule in
[[ADR-0012 Logged Expenses Count Until The Next Balance]] does the rest.

## Dependencies

- Blocked by: [[Daily Expense Log]]

> [!warning] Risks
> - "Not logged" can read as a telling-off. It is shown as plain information, and only when there
>   is something logged to compare with.
> - A card purchase is money spent before the bank balance shows it. Counted through the card's
>   balance at the check-in and through the log before it, it must not be counted twice in the
>   comparison.

## Related

- Theme: [[Tracking Without Willpower]]
- From: [[Five Second Quick Add]] · [[Payday Check-In]]
- After: [[Daily Expense Log]]
- Phase: [[ROADMAP]]
