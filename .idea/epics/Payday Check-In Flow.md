---
title: Payday Check-In Flow
created: 2026-10-31
updated: 2026-10-31
tags: [epic, tracking]
status: done
theme: Tracking Without Willpower
phase: 2
sources: [Payday Check-In]
---

# Payday Check-In Flow

## Outcome

Every payday, in five minutes or less, the owner confirms the pay, enters the balance, sees what was
spent since last time and which payments went out, and leaves with the plan for the next 14 days.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] A check-in asks whether the pay landed and for how much, then the current balance — verified by checkin.e2e.ts, checkin.test.ts (3 pts) ^tsk-47adf0
- [x] It shows the expected balance, the actual balance, and the difference as spending since the last check-in — verified by domain/checkin.test.ts (hand-calculated), checkin.e2e.ts (3 pts) ^tsk-8a4cf1
- [x] Each scheduled payment since the last check-in is confirmed paid or marked missed, and a missed payment stays reserved — verified by domain/checkin.test.ts, server checkin.test.ts, checkin.e2e.ts (3 pts) ^tsk-6553da
- [x] It ends on the plan for the next 14 days and the new safe-to-spend number — verified by checkin.test.ts, checkin.e2e.ts (2 pts) ^tsk-7dcf09
- [x] Each check-in is saved with its date, numbers and duration, and past check-ins are listed — verified by checkin.test.ts, checkin.e2e.ts (2 pts) ^tsk-52a3db
- [x] A Playwright test completes a check-in at phone size — verified by checkin.e2e.ts at iPhone size on WebKit (2 pts) ^tsk-b64cc9

## Approach

A short sequence of steps, each one form, so a step survives a dropped connection. The balance
entered here is what keeps the safe-to-spend number honest. Card spending is invisible until the card
is paid; the spending step says so until [[Loan Balances At Check-In]] closes the gap.

## Dependencies

- Blocked by: [[Paycheck Periods And Safe To Spend]]
- Unblocks: [[Payday Reminder]], [[Loan Balances At Check-In]]

> [!warning] Risks
> - The check-in grows past five minutes as steps are added. The stopwatch criterion in the roadmap
>   is the guard.

## Related

- Theme: [[Tracking Without Willpower]]
- From: [[Payday Check-In]]
- Phase: [[ROADMAP]]
