---
title: Guided First Run Setup
created: 2026-10-31
updated: 2026-10-31
tags: [epic, paycheck-and-bills]
status: in-progress
theme: Paycheck And Bills Out Of Sync
phase: 1
sources: [Recurring Money Schedule, Safe To Spend Number]
---

# Guided First Run Setup

## Outcome

Someone who has never kept a budget goes from an empty app to their own safe-to-spend number in one
sitting of under 20 minutes, one question at a time.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] Setup asks for the payday and pay amount, the current balance, then each bill and loan payment one at a time, and ends on the safe-to-spend number — verified by journey.e2e.ts at iPhone size on WebKit (5 pts) ^tsk-4bccc7
- [x] Setup can be left and resumed at the same step, on another device — verified by journey.e2e.ts, resumed in a new browser context (3 pts) ^tsk-708f11
- [x] Each step has a plain-words prompt and an example, written for someone who has never budgeted — verified by journey.e2e.ts (2 pts) ^tsk-67c7c3
- [ ] Someone who did not build it completes setup for the fixture household in under 20 minutes, timed (1 pt) ^tsk-86c13f

## Approach

A sequence of small forms over the same schedule the rest of the app uses — no separate data path.
Tracking never really started for the owner, so this is the moment the plan most depends on; it ends
by showing the number, which is the reason to come back.

## Dependencies

- Blocked by: [[Schedule Of Pay And Bills]], [[Paycheck Periods And Safe To Spend]]

> [!warning] Risks
> - The owner does not know every bill. Setup suggests the last two bank statements as the source,
>   and lets a bill be added later without starting again.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Recurring Money Schedule]] · [[Safe To Spend Number]]
- Habit: [[Tracking Without Willpower]]
- Phase: [[ROADMAP]]
