---
title: Payday Check-In
created: 2026-10-31
updated: 2026-11-02
tags: [idea, tracking]
status: committed
theme: Tracking Without Willpower
horizon: now
impact: 5
effort: 2
confidence: 3
epic: [Payday Check-In Flow, Payday Reminder, Expenses At Check-In, Deploy On Netlify]
---

# Payday Check-In

## Pitch

Every payday, a guided five-minute check-in: confirm the paycheck landed, enter your account balance,
see what went out since last time, and plan the next 14 days.

## Why it might work

- Failure-first: assume the app launched and you stopped using it within a month. The likely reason
  is that tracking needed daily discipline. This asks for it 26 times a year, on a day you already
  notice.
- The bi-weekly rhythm that makes monthly budgeting awkward becomes the review cadence.
- Entering the balance means you do not have to log every expense to know what you spent: the gap
  between the expected and the actual balance is your day-to-day spending. It also keeps
  [[Safe To Spend Number]] current.

## Why it might not

- A balance gives you a total, not a breakdown. You learn that you overspent, not on what.
- A missed check-in breaks the chain; two missed, and every number is stale.

> [!warning] Riskiest assumption
> That you will actually do it every payday. Habit features fail quietly; tying this one to the
> paycheck itself is the bet.

## What would raise confidence

- [ ] Do the next two paydays as a manual check-in in a notes app or a spreadsheet, and time it. If it
  takes more than ten minutes, or gets skipped, redesign it.

## Related

- Theme: [[Tracking Without Willpower]]
- Builds on: [[Recurring Money Schedule]]
- Keeps honest: [[Safe To Spend Number]]
- Tension with: [[Five Second Quick Add]] — log balances, not every expense; resolved 2026-11-02 as both, in [[Expenses At Check-In]]
- Pairs with: [[Bank Statement Import]] — the import can happen during the check-in
- Session: [[2026-10-31 Brainstorm - Personal Budget App]]

## Committed

Delivered in Phase 2 of the [[ROADMAP]] by [[Payday Check-In Flow]] and [[Payday Reminder]]. Its
riskiest assumption is the plan's riskiest assumption, and the success metric in [[SPECS]] measures
it directly: check-ins on 12 of the first 13 paydays.
