---
title: BLOCKERS
created: 2026-11-01
updated: 2026-11-01
tags: [blockers, management]
status: active
---

# BLOCKERS

> [!warning] Holding up Phases 0 to 2
> [ATT-C9FFED](#no-project-repository-so-ci-has-never-run) keeps Phase 0 from `verified`; the real-phone checks hold Phases 1 and 2.

### No project repository, so CI has never run

- **Reference:** `ATT-C9FFED` · **Severity:** warning
- **Since:** 2026-11-01
- **Holds up:** [Walking Skeleton Deployed](../.idea/epics/Walking%20Skeleton%20Deployed.md) — TSK-32FCB1 and the Phase 0 exit criterion 'CI is green'
- **Next action:** Create the project's own private repository (not tateru.dev), push the work to a branch, and watch .github/workflows/app.yml run.

### Docker image never built

- **Reference:** `ATT-91530E` · **Severity:** warning
- **Since:** 2026-11-01
- **Holds up:** [Walking Skeleton Deployed](../.idea/epics/Walking%20Skeleton%20Deployed.md) — TSK-0F628F
- **Next action:** Let Fly's remote builder build it on the first /ship, or build it locally once Docker may be used: cd app && docker build .

### Domain not chosen

- **Reference:** `ATT-B5AE82` · **Severity:** warning
- **Since:** 2026-11-01
- **Holds up:** [Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md) — optional passkeys and the production URL: a passkey is bound to the domain it was registered on
- **Next action:** Choose the domain before /ship; register the owner there with a password and OWNER_SETUP_CODE.

### Checks only a person with real phones can do

- **Reference:** `ATT-4CB25C` · **Severity:** warning
- **Since:** 2026-11-01
- **Holds up:** [Payday Reminder](../.idea/epics/Payday%20Reminder.md) — TSK-D7D015, TSK-21F5E9, TSK-86C13F, and the stopwatch criteria in Phases 1 and 2
- **Next action:** After /ship: sign in with the password on both phones (and optionally add each phone's PIN or face), turn reminders on from the installed app, have setup timed by someone else, and time a check-in under five minutes.

## Notes

Hand-written notes below this heading are kept when `/setup` regenerates this file.
