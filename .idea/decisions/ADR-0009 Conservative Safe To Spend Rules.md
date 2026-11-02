---
title: ADR-0009 Conservative Safe To Spend Rules
created: 2026-10-31
updated: 2026-10-31
tags: [adr, decision]
status: accepted
decision: Compute safe to spend from the balance's own date, conservatively
supersedes:
superseded_by:
---

# ADR-0009 Conservative Safe To Spend Rules

## Context

[[Safe To Spend Number]] is the number the whole app exists to show, and "a number that is
confidently wrong is worse than none" ([[Paycheck Periods And Safe To Spend]]). `SPECS.md` defines it
as the balance minus everything due before the next payday minus set-asides, but leaves open three
cases: a balance taken days ago, a bill due on a payday, and yearly bills. The owner checks in only
on paydays ([[Payday Check-In]]), so the balance is usually days old.

## Options

| Option | Pros | Cons |
|---|---|---|
| Count from today: subtract what is due between today and the next payday | Simple | A bill paid since the balance was taken is counted twice, or one not yet paid is missed, depending on the day |
| Count from the balance's own date | Every bill since that balance is counted exactly once | Needs the income that landed since that date too, or a stale balance reads far too low |

## Decision

Count from the balance's own date, conservatively. Decided by `/setup` on 2026-10-31, because
`SPECS.md` did not cover these cases.

- **Reserved:** every bill and loan payment due after the balance's date, up to and including the
  next payday. A bill due on a payday counts against the previous paycheck (SPECS decision 8).
- **Income since the balance:** paychecks due after the balance's date, up to and including today,
  count as landed.
- **Set-asides:** a quarterly or yearly bill that is not yet reserved holds an equal share from each
  payday in its cycle that has already happened. The shares sum exactly to the bill, with any
  remainder going to the earliest paychecks.
- **Stale:** a balance older than the last payday is flagged on the home screen, every time.
- **Negative:** below zero, the app shows what is short and by how much, never a red number alone.

## Consequences

- Assuming a scheduled paycheck landed can overstate the number if pay is late. The stale-balance
  warning and the payday check-in in Phase 2 are the guard; pay is regular, per [[SPECS]].
- Set-aside money stays in the same account; the app holds it back in the number rather than moving
  it.
- The rules live in one pure module, `app/src/lib/domain/safeToSpend.ts`, and are proven on five
  named dates by hand calculation.
