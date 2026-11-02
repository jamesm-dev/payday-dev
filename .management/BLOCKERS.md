---
title: BLOCKERS
created: 2026-11-01
updated: 2026-11-02
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

### Domain not chosen

- **Reference:** `ATT-B5AE82` · **Severity:** warning
- **Since:** 2026-11-01
- **Holds up:** [Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md) — optional passkeys and the production URL: a passkey is bound to the domain it was registered on
- **Next action:** Choose before /ship: Netlify's free `*.netlify.app` name or a domain of your own. Register the owner there with a password and OWNER_SETUP_CODE.

### Supabase database password not known

- **Reference:** `ATT-504482` · **Severity:** warning
- **Since:** 2026-11-02
- **Holds up:** [Deploy On Netlify](../.idea/epics/Deploy%20On%20Netlify.md) — TSK-7975B9 and TSK-2FB9F1 at release: the deploy's build runs the migrations and the functions connect with it
- **Next action:** At /ship, reset the password in Supabase's dashboard (project payday, us-east-2) and set it only as a Netlify environment variable, never in the repository.

## Notes

Hand-written notes below this heading are kept when `/setup` regenerates this file.
