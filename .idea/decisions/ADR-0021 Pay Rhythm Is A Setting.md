---
title: ADR-0021 Pay Rhythm Is A Setting
created: 2026-11-15
updated: 2026-11-15
tags: [adr, decision]
status: accepted
decision: Pay every 14 days, twice monthly, or monthly
supersedes:
superseded_by:
---

# ADR-0021 Pay Rhythm Is A Setting

## Context

[[SPECS]] describes one owner paid every 14 days, and the engine defines paydays as income with an
`every14` rule only. On 2026-11-15 the owner asked to "choose bi-weekly or monthly pay" and to open
Payday to other people ([[Pay Rhythm Setting]], [[Many People On One Site]]), many of whom are paid
twice a month or once a month.

## Options

| Option | Pros | Cons |
|---|---|---|
| A choice at every check-in | Copes with pay that changes | The plan and the number are wrong between check-ins; a question every payday |
| A plan length only (two weeks or a month) | Little engine change | Does not help anyone not paid every 14 days |
| The rhythm as a setting: the main pay's own repeat rule | One source of truth; the schedule already stores a rule per item | The engine's payday logic and every "14 days" in the app must change |

## Decision

The rhythm is a setting, and the setting is the main pay's own repeat rule. The owner's choice,
2026-11-15, including twice a month at the owner's yes:

- **Every two weeks** — the existing `every14` rule, from an anchor date.
- **Twice a month** — a new `twiceMonthly` rule on two days of the month, stored in `rule_day` and
  a new `rule_day_2`. A day past the month's end falls on its last day, as monthly rules already do.
- **Once a month** — the existing `monthly` rule on one day.

The main pay is one income item, marked as such; its rule defines the paydays. Other income stays
ordinary income.

## Consequences

- SPECS "paid every 14 days" becomes "paid on one regular rhythm". The paycheck periods, the
  six-paycheck plan, set-aside shares, the check-in's plan length, loan interest per payment, the
  export and the calendar file follow the rule.
- A backup from before this change restores as every 14 days.
- Weekends and holidays are not known; a payday they move is moved by hand on the plan, as today.
- Revisit for two jobs, or pay with no regular rhythm.
