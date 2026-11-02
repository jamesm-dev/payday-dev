---
title: Payday Reminder
created: 2026-10-31
updated: 2026-11-02
tags: [epic, tracking]
status: cut
theme: Tracking Without Willpower
phase: 2
sources: [Payday Check-In]
---

# Payday Reminder

## Outcome

On every payday, at a time the owner chose, the phone shows a reminder that opens straight into the
check-in — and when reminders stop working, the owner can see that.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] The installed app subscribes to push reminders on iPhone and Android, after a prompt that says why (3 pts) ^tsk-21f5e9
- [x] A reminder is sent on each payday at the chosen time, and tapping it opens the check-in — verified by job.test.ts (fake clock and sender) and serviceWorker.test.ts; delivery to a real phone is checked at release (3 pts) ^tsk-dc74df
- [x] An expired or rejected subscription is removed, and the app shows that reminders are off — verified by job.test.ts, checkin.e2e.ts (2 pts) ^tsk-e54285
- [x] A calendar file with every payday can be downloaded as a fallback reminder — verified by ics.test.ts, phase2.e2e.ts (1 pt) ^tsk-e03c29

## Why cut

The owner, 2026-11-02: free hosting on Netlify, and "remove the reminders if need be to make this free app". Nothing is always on there to send a push, so push reminders go ([[ADR-0016 Reminders By Calendar File Only]]). The calendar file, the last criterion above, carries on; keeping it working on Netlify is a task in [[Deploy On Netlify]].

## Approach

Web Push with VAPID keys through the `web-push` library. A job inside the always-on app process checks
for due reminders; the machine must never auto-stop, or the job never runs.

## Dependencies

- Blocked by: [[Payday Check-In Flow]], [[Installable App Shell]]

> [!warning] Risks
> - iPhone push works only from the installed app. The prompt says so, and the calendar file covers
>   the gap.

## Related

- Theme: [[Tracking Without Willpower]]
- From: [[Payday Check-In]]
- Decision: [[ADR-0005 Fly.io As The Host]] — auto-stop off
- Phase: [[ROADMAP]]
