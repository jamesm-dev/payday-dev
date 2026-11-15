---
title: Pay Rhythm Setting
created: 2026-11-15
updated: 2026-11-15
tags: [idea, paycheck-and-bills]
status: committed
theme: Paycheck And Bills Out Of Sync
horizon: now
impact: 4
effort: 4
confidence: 3
epic: [Paydays From Any Pay Rhythm, Choose How Often You Are Paid]
---

# Pay Rhythm Setting

## Pitch

How often the owner is paid becomes a setting: **every two weeks**, **twice a month** on two dates
(such as the 15th and the last day), or **once a month**. Setup asks it, Settings can change it,
and the plan, the safe-to-spend number and the payday check-in follow it.

The owner's words, 2026-11-15: "on check-in, allow users to choose bi-weekly or monthly pay". Asked
what they meant, they chose a setting, chosen once and changeable, over a choice at every check-in
or a choice of plan length only. They also chose to add twice a month, common in the Philippines.

## Why it might work

- The schedule already expands monthly rules ([[Recurring Money Schedule]]); what is fixed at 14
  days is what counts as a payday. Today only income that repeats every 14 days defines the
  paycheck periods (`periods.ts`, `plan.ts`), so the same engine can take its paydays from any one
  rhythm.
- Twice-a-month and monthly pay are the norm for many salaried jobs, including in the Philippines,
  so the app stops fitting only one kind of payslip.

## Why it might not

- It changes a founding assumption: [[SPECS]] says the owner is paid every 14 days, and
  [[Paycheck Period Budgeting]] names a regular 14-day schedule as its riskiest assumption. Periods,
  the six-paycheck plan, the check-in's "next 14 days", set-aside shares, a loan's interest per
  payment and the export all assume it.
- Twice a month needs a new repeat rule with two days, and a day past the month's end (the 30th or
  31st) falls on the last day. A payday on a weekend or holiday is paid early by many employers;
  Payday does not know holidays.
- Changing the rhythm mid-way, with a check-in under way or set-asides half built, needs a rule.

> [!warning] Riskiest assumption
> That one rhythm per person is enough: one main pay, on a regular pattern. Two jobs, or pay that
> moves with weekends, would need more.

## What would raise confidence

- [ ] Hand-calculated fixtures for a twice-a-month and a monthly owner through a year, including
  February and a 31-day month, before the engine changes.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- Builds on: [[Recurring Money Schedule]], [[Paycheck Period Budgeting]], [[Payday Check-In]]
- Tension with: [[SPECS]] (paid every 14 days)
- Session: [[2026-11-15 Brainstorm - Pay Rhythm And Early Bills]]
