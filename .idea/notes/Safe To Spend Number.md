---
title: Safe To Spend Number
created: 2026-10-31
updated: 2026-11-02
tags: [idea, paycheck-and-bills]
status: committed
theme: Paycheck And Bills Out Of Sync
horizon: now
impact: 5
effort: 2
confidence: 4
epic: [Paycheck Periods And Safe To Spend, Private Single User Access, Guided First Run Setup, Walking Skeleton Deployed, Installable App Shell, Backups And Restore Drill, Backup Download And Restore, Postgres On Supabase, Sign-In State In The Database, Deploy On Netlify]
---

# Safe To Spend Number

## Pitch

The home screen shows one number: what you can spend between now and the next payday, after every
bill, loan payment and savings target due before then has been set aside.

## Why it might work

- It answers the question you actually have — standing in a shop — in under a second.
- It is the 10x-simpler budget: useful on day one, with no categories and no history.
- It suits a phone by nature. A number, not a dashboard.

## Why it might not

- Argued against on purpose, because it is the favourite: a single number creates false safety. If an
  irregular expense — a yearly fee, a car repair — is not in the schedule, the number says "fine"
  right up until it is not. It survives only if [[Recurring Money Schedule]] handles yearly and
  quarterly bills by setting a little aside every paycheck.
- It is only as fresh as the balance it starts from.

> [!warning] Riskiest assumption
> That the starting balance is current. Without a recent balance — from [[Payday Check-In]] or an
> import — the number is confidently wrong.

## What would raise confidence

- [ ] For two pay periods, work the number out by hand each morning (balance minus everything due
  before payday) and note whether it changed a single decision.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- Builds on: [[Recurring Money Schedule]], [[Paycheck Period Budgeting]]
- Kept honest by: [[Payday Check-In]]
- Expanded by: [[Cash Flow Runway]]
- Session: [[2026-10-31 Brainstorm - Personal Budget App]]

## Committed

Delivered in Phase 1 of the [[ROADMAP]] by [[Paycheck Periods And Safe To Spend]], with
[[Private Single User Access]] and [[Guided First Run Setup]]. The three Phase 0 epics —
[[Walking Skeleton Deployed]], [[Installable App Shell]], [[Backups And Restore Drill]] — exist to
carry it. The false-safety argument above became a criterion: yearly bills are set aside each
paycheck in [[Schedule Of Pay And Bills]].
