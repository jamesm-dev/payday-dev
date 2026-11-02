---
title: Paycheck Period Budgeting
created: 2026-10-31
updated: 2026-10-31
tags: [idea, paycheck-and-bills]
status: committed
theme: Paycheck And Bills Out Of Sync
horizon: now
impact: 5
effort: 3
confidence: 5
epic: [Paycheck Plan View]
---

# Paycheck Period Budgeting

## Pitch

Budget by paycheck, not by calendar month: every bill and loan payment is assigned to the paycheck
that has to cover it, and each 14-day period gets its own plan.

## Why it might work

- Pay arrives every 14 days but bills arrive monthly, so a monthly budget hides the real crunch — rent
  and two loan payments landing before the next payday.
- Each period answers one concrete question: "this paycheck must cover these five things; the rest is
  mine."
- It is the contrarian answer to the ask. The request says "monthly budget"; the income says
  otherwise.

## Why it might not

- A monthly view still matters for comparing months and for bills quoted per month, so the app needs
  both views without counting anything twice.
- The edge cases bite: due dates that drift between periods, bills due on the 31st, paydays that land
  on a holiday.

> [!warning] Riskiest assumption
> That the pay schedule is regular — every 14 days, on a fixed weekday, for a roughly fixed amount.
> Overtime, commission or irregular deductions turn each period's plan into an estimate.

## What would raise confidence

- [ ] On paper, set the next three months of bills and loan due dates against the next six paydays,
  and see whether any period comes up short.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- Builds on: [[Recurring Money Schedule]]
- Feeds: [[Safe To Spend Number]], [[Debt Payoff Planner]]
- Session: [[2026-10-31 Brainstorm - Personal Budget App]]

## Committed

> [!success] Riskiest assumption resolved
> During `/shape` the owner confirmed pay lands every 14 days on the same weekday for the same
> amount. Confidence raised from 4 to 5.

Elevated from `exploring` during `/shape`. The pay periods themselves are computed in Phase 1 as part
of [[Paycheck Periods And Safe To Spend]]; the full paycheck-by-paycheck plan is delivered in Phase 2
of the [[ROADMAP]] by [[Paycheck Plan View]].
