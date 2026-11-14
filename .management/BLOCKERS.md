---
title: BLOCKERS
created: 2026-11-01
updated: 2026-11-15
tags: [blockers, management]
status: active
---

# BLOCKERS

> [!warning] [ATT-4CB25C](#checks-only-a-person-with-real-phones-can-do) keeps Phases 1, 2, 4 and 5 in progress: their last criteria need a person and real phones. Nothing blocks building Phase 6.

### Checks only a person with real phones can do

- **Reference:** `ATT-4CB25C` · **Severity:** warning
- **Since:** 2026-11-01
- **Holds up:** [Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md) — TSK-D7D015, a passkey on both real phones, and the timed criteria in Phases 1, 2, 4 and 5: setup timed by someone else, a five-minute check-in, the three downloads opened on the laptop, an expense logged in under ten seconds
- **Next action:** The laptop checks can be done now with `cd app && pnpm dev`: open the three downloads in Notepad, a PDF reader and Word. After /ship: sign in on both phones and add each phone's PIN or face, have setup timed by someone else, and time a check-in and an expense.

## Notes

Hand-written notes below this heading are kept when `/setup` regenerates this file.
