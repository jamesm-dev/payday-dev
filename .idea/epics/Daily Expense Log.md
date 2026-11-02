---
title: Daily Expense Log
created: 2026-11-02
updated: 2026-11-02
tags: [epic, tracking]
status: planned
theme: Tracking Without Willpower
phase: 5
sources: [Five Second Quick Add]
---

# Daily Expense Log

## Outcome

An expense is logged from the home screen in a few seconds, and the safe-to-spend number drops by
its amount at once. The owner can see, change and remove what they logged, and a fresh balance takes
over from the expenses before it, so nothing is ever counted twice.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] An expense is stored with its amount in minor units, what it was for, its day and the moment it was logged, and each balance records when it was saved; one migration adds both (2 pts) ^tsk-5f4bf5
- [ ] From the home screen an expense is logged in one short form, the amount and what it was for, with the day already today, and the number drops by that amount at once (3 pts) ^tsk-6dc197
- [ ] An expense counts when its day is after the balance's day, or on that day and logged after the balance was read (amended 2026-11-02), so a fresh balance from the home screen or a check-in takes over and nothing is counted twice, in unit tests on the number (3 pts) ^tsk-063dbd
- [ ] The home screen lists what was logged since the balance, with its total, and each one can be changed or removed (3 pts) ^tsk-e44178
- [ ] An Expenses page lists every logged expense by day, newest first, with each day's total (2 pts) ^tsk-b5233d
- [ ] A mistake is explained in words and keeps what was typed: no amount, not a number, a day in the future (1 pt) ^tsk-a9146a
- [ ] Starting over deletes the expenses with the rest of the budget (1 pt) ^tsk-c19e67
- [ ] The home screen stays inside its performance budget with a year of daily expenses (2 pts) ^tsk-dd46d6
- [ ] Browser tests at iPhone, Android and laptop sizes log, change and remove an expense and see the number move (2 pts) ^tsk-e2a26c

## Approach

One new table for expenses, owned like everything else, with amounts in minor units
([[ADR-0007 Money As Integer Minor Units]]). The safe-to-spend calculation takes the expenses that
count and subtracts them, in the pure domain, beside the reserved bills; which ones count is
[[ADR-0012 Logged Expenses Count Until The Next Balance]]. "What it was for" is optional and
free text: speed is the feature, so the form asks for the amount first and fills the day in.
Works without JavaScript, like every other form in the app.

## Dependencies

- Blocked by: [[Paycheck Periods And Safe To Spend]] (done)

> [!warning] Risks
> - Daily logging is the habit that never started ([[Five Second Quick Add]]'s riskiest
>   assumption). Logging stays optional: the number and the check-in work exactly as before for an
>   owner who logs nothing.
> - An expense logged on the same day as a balance, after it was saved, may already be in that
>   balance. It is counted anyway: the number errs low, never high
>   ([[ADR-0009 Conservative Safe To Spend Rules]]).

## Related

- Theme: [[Tracking Without Willpower]]
- From: [[Five Second Quick Add]]
- Next: [[Expenses At Check-In]]
- Phase: [[ROADMAP]]
