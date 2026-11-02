---
title: Loan Ledger With Debt Free Date
created: 2026-10-31
updated: 2026-10-31
tags: [idea, debt]
status: committed
theme: Getting Out Of Debt
horizon: now
impact: 5
effort: 2
confidence: 5
epic: [Loan Ledger, Debt Free Date Projection, Loan Balances At Check-In]
---

# Loan Ledger With Debt Free Date

## Pitch

One list of every loan — balance, interest rate, minimum payment, due date — that totals what you owe,
what it costs you in interest each month, and the date you will be debt-free at your current pace.

## Why it might work

- "A lot of loans" is the problem you named. One total and one date turn a vague weight into a
  number you can move.
- Interest cost per month makes the stakes concrete: it is money spent on nothing.
- The amortization maths is well known, so the uncertainty is in the data, not the technique.

## Why it might not

- Each kind of loan behaves differently: credit cards revolve, with a variable rate and a minimum
  set as a share of the balance; instalment loans run on a fixed schedule; buy-now-pay-later has its
  own rules; a loan from family may have no interest and no schedule at all. One model has to cover
  them all.
- Balances drift from reality unless they are updated after each payment.

> [!warning] Riskiest assumption
> That you can get the true balance, rate and terms for every loan. Some lenders bury the APR and the
> fees, and a ledger with the wrong rates produces the wrong date.

## What would raise confidence

- [ ] Gather the balance, APR, minimum payment and due date of every loan into one table, and note
  which were hard to find.

## Related

- Theme: [[Getting Out Of Debt]]
- Builds on: [[Recurring Money Schedule]]
- Feeds: [[Debt Payoff Planner]]
- Session: [[2026-10-31 Brainstorm - Personal Budget App]]

## Committed

During `/shape` the owner confirmed loans of all four kinds: credit cards, instalment loans,
buy-now-pay-later and informal loans. So one model must cover them all, as the note feared.

Delivered in Phase 3 of the [[ROADMAP]] by [[Loan Ledger]], [[Debt Free Date Projection]] and
[[Loan Balances At Check-In]]. Until then, loan payments are entered as ordinary bills, so the
safe-to-spend number counts them from Phase 1.
