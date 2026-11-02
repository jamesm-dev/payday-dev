---
title: Tracking Without Willpower
created: 2026-10-31
updated: 2026-11-02
tags: [moc, theme]
status: active
---

# Tracking Without Willpower

## Thesis

Tracking expenses has already failed once. Any design that depends on daily discipline will fail the
same way, so getting the data in has to be infrequent, nearly effortless, or automatic.

## Ideas

| Idea | Horizon | I / E / C | Status |
|---|---|---|---|
| [[Payday Check-In]] | now | 5 / 2 / 3 | committed |
| [[Five Second Quick Add]] | now | 3 / 2 / 3 | committed |
| [[Bank Statement Import]] | next | 4 / 3 / 3 | seed |
| [[AI Capture From Screenshots]] | later | 3 / 3 / 2 | seed |
| [[Live Bank Sync]] | someday | 4 / 5 / 2 | seed |

> [!note] The central tension
> Log every expense ([[Five Second Quick Add]], the imports), or log only balances
> ([[Payday Check-In]])? The likely answer is both, in that order: the check-in as the backbone that
> keeps the numbers true, with imports added later for the breakdown.

## Committed epics

| Epic | Phase |
|---|---|
| [[Payday Check-In Flow]] | 2 |
| [[Payday Reminder]] | 2 |
| [[Daily Expense Log]] | 5 |
| [[Expenses At Check-In]] | 5 |

v1 takes the balances side of the tension: spending is inferred at each check-in, and per-expense
detail waits for [[Bank Statement Import]] after v1.

> [!note] 2026-11-02 — both, as predicted
> The owner asked for daily expenses after v1. Phase 5 adds them on top of the check-in rather than
> instead of it: each logged expense lowers the number until the next balance takes over, and the
> check-in compares logged with spent
> ([[ADR-0012 Logged Expenses Count Until The Next Balance]]).

## Open questions

> [!question]
> - How much of your spending is cash?
> - Which banks and cards do you use, and what do their exports look like?

Answered during `/shape`: tracking **never really started**, so the plan leans on a guided first run
and the payday check-in rather than faster logging.

## Related themes

- [[Paycheck And Bills Out Of Sync]] — every view there needs a current balance from here.
- [[Getting Out Of Debt]] — loan balances need updating too.
