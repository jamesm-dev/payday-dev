---
title: BLOCKERS
created: 2026-11-01
updated: 2026-11-16
tags: [blockers, management]
status: active
---

# BLOCKERS

> [!warning] [ATT-4CB25C](#checks-only-a-person-with-real-phones-can-do) keeps Phases 1, 2, 4 and 5 in progress: their last criteria need a person and real phones. Phase 9's deploy waits on the owner: the pull request, and their real backup through the migration check.

### Checks only a person with real phones can do

- **Reference:** `ATT-4CB25C` · **Severity:** warning
- **Since:** 2026-11-01
- **Holds up:** [Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md) — TSK-D7D015, a passkey on both real phones, and the timed criteria in Phases 1, 2, 4 and 5: setup timed by someone else, a five-minute payday update, the three downloads opened on the laptop, an expense logged in under ten seconds
- **Next action:** Payday is live, so these can be done now. On 2026-11-15 adding a passkey on the owner's Windows 10 laptop (Chrome 157) failed: Chrome showed its list of where to save, and nothing reached Payday. Next: add each phone's passkey on the phone itself, retry the laptop choosing Windows Hello and note the message, then time setup, a payday update and an expense.

## Notes

Hand-written notes below this heading are kept when `/setup` regenerates this file.
