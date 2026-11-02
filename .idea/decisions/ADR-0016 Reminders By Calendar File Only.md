---
title: ADR-0016 Reminders By Calendar File Only
created: 2026-11-02
updated: 2026-11-02
tags: [adr, decision]
status: accepted
decision: no push, calendar file remains
supersedes:
superseded_by:
---

# ADR-0016 Reminders By Calendar File Only

## Context

The payday reminder was a Web Push notification sent by a job in the always-on server, with a
calendar file (.ics) as the fallback ([[Payday Reminder]]). On Netlify
([[ADR-0013 Netlify As The Host]]) nothing is always on. The owner said to remove reminders if that
is what it takes to be free.

## Options

| Option | Pros | Cons |
|---|---|---|
| Calendar file only | Free; nothing runs on a schedule; the phone's own calendar reminds | No notification from the app itself; a payday added to the schedule later needs a fresh download |
| Push, sent by a Netlify scheduled function | Keeps notifications | Uses some of the 300 monthly credits; keeps the push keys and subscriptions |

## Decision

Calendar file only. Push notifications, their subscriptions, keys and the reminder job are removed;
"Add your paydays to your calendar" stays, with the reminder time the owner chose. The owner's
choice, 2026-11-02.

## Consequences

- The `VAPID_*` secrets and the `push_subscription` and `reminder_sent` tables go.
- [[ADR-0002 Installable Web App Over Native]] gave push on both phones as one reason for an
  installable web app. The app stays installable; that one reason no longer applies.
- Revisit if the calendar file proves too easy to forget: a scheduled function could send push again.
