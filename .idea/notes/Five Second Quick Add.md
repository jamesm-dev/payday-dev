---
title: Five Second Quick Add
created: 2026-10-31
updated: 2026-11-02
tags: [idea, tracking]
status: committed
theme: Tracking Without Willpower
horizon: now
impact: 3
effort: 2
confidence: 3
epic: [Daily Expense Log, Expenses At Check-In]
---

# Five Second Quick Add

## Pitch

Log an expense from the phone's home screen in under five seconds: the amount, a category from your
top five, done — the date and account fill themselves in.

## Why it might work

- It is the obvious move for capture, and the only way to record cash, which no bank import sees.
- Speed is the whole feature. Every extra field is a reason to skip it.

## Why it might not

- It is exactly the habit you said you cannot keep. A faster version of a failed habit may still
  fail.
- It duplicates whatever a bank import brings in later, and reconciling the two is real work.

> [!warning] Riskiest assumption
> That speed was why tracking failed before. If the real reason was avoidance — not wanting to look —
> five seconds will not fix it.

## What would raise confidence

- [ ] Write down why tracking stopped last time: too slow, forgot, or did not want to see it. Only
  "too slow" makes this the answer.

## Evidence from shaping

Asked during `/shape` why tracking stopped, the owner said it **never really started** — not that it
was too slow. By this note's own test, speed is not the bottleneck, so it stays out of v1. A guided
first run, [[Guided First Run Setup]], took its place in the plan.

## Committed 2026-11-02

The owner asked for daily expenses directly, after v1 was built, and chose that each one lowers the
number at once until the next balance takes over
([[ADR-0012 Logged Expenses Count Until The Next Balance]]). The riskiest assumption still stands, so
logging stays optional: the check-in keeps working for an owner who logs nothing. Built as
[[Daily Expense Log]] and [[Expenses At Check-In]], Phase 5. Categories stay out; what an expense
was for is free text.

## Related

- Theme: [[Tracking Without Willpower]]
- Tension with: [[Payday Check-In]] — log every expense, or only balances
- Overlaps with: [[Bank Statement Import]]
- Session: [[2026-10-31 Brainstorm - Personal Budget App]]
