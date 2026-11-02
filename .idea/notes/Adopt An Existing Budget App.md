---
title: Adopt An Existing Budget App
created: 2026-10-31
updated: 2026-10-31
tags: [idea, build-or-adopt]
status: parked
theme: Build Or Adopt
horizon: now
impact: 4
effort: 1
confidence: 3
epic:
---

# Adopt An Existing Budget App

## Pitch

Before building anything, live in an existing budgeting app for a month — the open-source Actual
Budget or the paid YNAB, for example — then build only what it cannot do, or nothing.

## Why it might work

- The goal is control over money, not owning a codebase. If an existing app gives that this week, the
  loans start shrinking a month earlier.
- A month of real use is the cheapest requirements research there is: you learn which screens you
  actually open.
- Whatever it cannot do — perhaps the paycheck-by-paycheck plan, or a payoff plan across many loans —
  becomes a small, sharply scoped build.

## Why it might not

- If building it is part of the point — to learn, or as a portfolio piece — adopting defeats it.
- Off-the-shelf apps may assume monthly income or handle loans poorly. That is unverified either way.
- A subscription costs money; self-hosting an open-source one costs time.

> [!warning] Riskiest assumption
> That an existing app handles bi-weekly pay and several loans well enough. Neither has been checked.

## What would raise confidence

- [ ] Spend one evening entering your real bills and loans into one existing app, and list what it
  cannot express.

## Why parked

The owner asked to *create* the app and went on to `/shape` without taking this up, so the decision is
to build — recorded in [[ADR-0001 Build Rather Than Adopt]]. Parked rather than superseded: if the
build stalls before Phase 2, this is the first thing to reopen.

## Related

- Theme: [[Build Or Adopt]]
- Decision: [[ADR-0001 Build Rather Than Adopt]]
- Tension with: every other idea in the vault — this one asks whether they get built at all
- Session: [[2026-10-31 Brainstorm - Personal Budget App]]
