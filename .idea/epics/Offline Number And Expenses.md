---
title: Offline Number And Expenses
created: 2026-11-15
updated: 2026-11-15
tags: [epic, many-people]
status: planned
theme: Many People And Any Device
phase: 11
sources: [Offline Use With Sync]
---

# Offline Number And Expenses

## Outcome

With no signal, the installed app still shows the last number and plan, clearly marked with when
they are from, and an expense can be logged. It lowers the number shown at once and reaches the
site exactly once when the signal returns. Everything else says it needs a connection.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] Spike: how the installed app keeps the last number and plan on the phone, sends queued expenses, and clears both on sign-out, and what it adds to the home screen's JavaScript — ends in a written decision (3 pts) ^tsk-03858e
- [ ] With no signal, the home screen shows the last number and plan with "Offline: from <day and time>", and never a number newer than it is (5 pts) ^tsk-e87f11
- [ ] An expense logged with no signal is kept on the phone, lowers the shown number at once with "Not sent yet", and is saved on the site exactly once when the signal returns, even if sent twice (5 pts) ^tsk-6ff9b3
- [ ] Two phones that each log expenses while offline end with each expense once on both; every other change is online only, with a plain "This needs a connection" (3 pts) ^tsk-e377f0
- [ ] Signing out, or another person signing in on the phone, removes the kept copy and any unsent expenses from the phone, after asking about unsent ones (2 pts) ^tsk-faf834
- [ ] A Playwright test with the network off sees the number, logs an expense, goes back online, and finds it saved once (3 pts) ^tsk-b90a33

## Approach

Expenses only add, so there is no conflict to resolve between two phones: each queued expense
carries an id made on the phone, and the site ignores a repeat. Pages stay server-rendered online,
and the service worker still never caches a page with money on it; the offline copy is a separate,
small store the app owns ([[ADR-0024 Offline Copy And Queued Expenses]]).

## Dependencies

- Blocked by: [[Every Budget Has Its Owner]] (the copy belongs to one person)
- Builds on: [[Installable App Shell]], [[Daily Expense Log]]

> [!warning] Risks
> - A confidently wrong number from an old copy. Early warning: the "Offline: from" line missing on
>   any screen that shows a number with no signal.
> - Money data left on a shared or lost phone. Early warning: a copy surviving sign-out in a test.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Offline Use With Sync]]
- Phase: [[ROADMAP]]
