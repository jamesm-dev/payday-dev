---
title: Paycheck And Bills Out Of Sync
created: 2026-10-31
updated: 2026-11-15
tags: [moc, theme]
status: active
---

# Paycheck And Bills Out Of Sync

## Thesis

Pay arrives every 14 days while bills and loan payments arrive monthly on fixed dates, so a monthly
view makes money look free when a bill due before the next payday has already claimed it. The problem
is timing, not totals.

## Ideas

| Idea | Horizon | I / E / C | Status |
|---|---|---|---|
| [[Safe To Spend Number]] | now | 5 / 2 / 4 | committed |
| [[Paycheck Period Budgeting]] | now | 5 / 3 / 5 | committed |
| [[Recurring Money Schedule]] | now | 4 / 2 / 5 | committed |
| [[Cash Flow Runway]] | next | 4 / 3 / 3 | seed |
| [[Handwritten Paycheck List]] | now | 4 / 3 / 4 | committed |
| [[Pay A Bill Early]] | now | 4 / 3 / 3 | committed |
| [[Pay Rhythm Setting]] | now | 4 / 4 / 3 | committed |

[[Recurring Money Schedule]] is the foundation: the others are views of the same schedule.
[[Handwritten Paycheck List]] is the owner's own view of it, added on 2026-11-01.
[[Pay A Bill Early]] and [[Pay Rhythm Setting]] were added on 2026-11-15: the second loosens the
thesis below, since pay may also come twice a month or once a month.

## Committed epics

| Epic | Phase |
|---|---|
| [[Walking Skeleton Deployed]] | 0 |
| [[Installable App Shell]] | 0 |
| [[Backups And Restore Drill]] | 0, cut 2026-11-02 |
| [[Private Single User Access]] | 1 |
| [[Schedule Of Pay And Bills]] | 1 |
| [[Paycheck Periods And Safe To Spend]] | 1 |
| [[Guided First Run Setup]] | 1 |
| [[Paycheck Plan View]] | 2 |
| [[Paid Optional And Grouped Bills]] | 4 |
| [[Backup Download And Restore]] | 6 |
| [[Postgres On Supabase]] | 6 |
| [[Sign-In State In The Database]] | 6 |
| [[Deploy On Netlify]] | 6 |
| [[Paycheck List Export]] | 4 |
| [[Paydays From Any Pay Rhythm]] | 7 |
| [[Choose How Often You Are Paid]] | 7 |
| [[Early Payments Count Once]] | 7 |

## Open questions

> [!question]
> - How many bills and loan payments fall in the first half of the month against the second?

Answered during `/shape`: pay lands every 14 days on the same weekday for the same amount. The phone
opens on the number; the paycheck plan is one tap away, and the runway stays uncommitted.

## Related themes

- [[Getting Out Of Debt]] — loan payments are the largest items on the schedule.
- [[Tracking Without Willpower]] — a check-in or an import keeps the starting balance current.
