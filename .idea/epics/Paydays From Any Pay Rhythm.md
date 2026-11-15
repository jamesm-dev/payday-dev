---
title: Paydays From Any Pay Rhythm
created: 2026-11-15
updated: 2026-11-15
tags: [epic, paycheck-and-bills]
status: planned
theme: Paycheck And Bills Out Of Sync
phase: 7
sources: [Pay Rhythm Setting]
---

# Paydays From Any Pay Rhythm

## Outcome

The engine takes its paydays from the owner's main pay whatever its rhythm: every 14 days, twice a
month on two dates, or once a month on one date. Paycheck periods, the safe-to-spend number,
set-aside shares, the six-paycheck plan and loan projections are all right for each.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] A twice-a-month repeat rule with two days of the month expands into dated occurrences, a day past the month's end falls on its last day, and a migration adds the second day — in unit tests (3 pts) ^tsk-981e6b
- [ ] Paycheck periods and the six-paycheck plan come from the one main pay, marked on its income item (today's every-14-days pay is marked by the migration), for every 14 days, twice a month and once a month — hand-calculated fixtures through a year, including February and 31-day months (5 pts) ^tsk-f95975
- [ ] The safe-to-spend number and the yearly and quarterly set-aside shares stay exact with 26, 24 or 12 paydays a year — every existing every-14-days fixture keeps its value (3 pts) ^tsk-0c2e2e
- [ ] A loan paid twice a month gets its interest per payment and its debt-free date from that rhythm, against a closed-form reference (3 pts) ^tsk-2a2b3a
- [ ] The home screen stays inside its performance budget with five years of data for a twice-a-month and a monthly owner (1 pt) ^tsk-766633

## Approach

`periods.ts` and `plan.ts` select the main pay as income with an `every14` rule today; they select
it by being the owner's main pay instead, and the 14-day search window becomes the rhythm's own
longest gap. The new rule is `twiceMonthly` with `rule_day` and a new `rule_day_2`
([[ADR-0021 Pay Rhythm Is A Setting]]). All of it is `domain/`: fixtures first, by hand.

## Dependencies

- Builds on: [[Schedule Of Pay And Bills]], [[Paycheck Periods And Safe To Spend]],
  [[Debt Free Date Projection]]
- Unblocks: [[Choose How Often You Are Paid]]

> [!warning] Risks
> - Every number in the app depends on these periods. Early warning: any every-14-days fixture
>   changing value.
> - Holidays and weekends move real paydays; Payday does not know them. Early warning: the owner
>   moving a payday by hand on the plan, month after month.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Pay Rhythm Setting]]
- Phase: [[ROADMAP]]
