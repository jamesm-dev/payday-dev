---
title: CHANGELOG
created: 2026-10-31
updated: 2026-11-15
tags: [changelog, management]
status: active
---

# CHANGELOG

What actually shipped, newest first. Append only.

## 2026-11-15

Nothing shipped yet: nothing is deployed. The app moved to Postgres, and its online home is set up.

- **[Postgres On Supabase](../.idea/epics/Postgres%20On%20Supabase.md) done**, all 5 tasks verified (930 unit
  and 523 browser tests on PGlite). Two independent reviews asked for changes, all made: atomic
  check-in steps, encrypted and verified connections, row locks proven by a test, and the session
  re-checked inside Start over and restore.
- **Supabase is up again** (it had paused after a quiet week), with a Payday-only database user that
  owns only its own tables. A verified login through the pooler works on both ports.
- **The Netlify site exists**: `payday-birc.netlify.app`. The owner asked for `payday.netlify.app`,
  which another Netlify account holds, and kept the assigned name. Not deployed yet.
- **The owner's real budget is backed up** to a gitignored file, from a read-only copy of `local.db`,
  and proven to restore into the Postgres version with the same number.
- **Blockers resolved:** the domain is chosen (`ATT-B5AE82`), and the unknown Supabase password is
  replaced by the app's own database user (`ATT-504482`).
- **[Sign-In State In The Database](../.idea/epics/Sign-In%20State%20In%20The%20Database.md) done**, all 4
  tasks verified (982 unit and 523 browser tests). An independent security review asked for ten
  changes over two rounds, all made. The sign-in limits, the brake, passkey challenges, the 5-minute
  confirmation and the one-time recovery-code slot now hold across function instances. The
  password-check queue is global again, in the database (ADR-0018). Verified live on Supabase
  through four connections; the test schemas were dropped afterwards.
- **Deploy On Netlify started**: the live app will run on Node 24 (ADR-0019).

## 2026-11-02

Nothing shipped: nothing is deployed yet. The project moved into its own public repository,
`jamesm-dev/payday-dev` (MIT), and CI ran for the first time.

- **CI green** on PR #1, merged: 842 unit and 515 browser tests in GitHub Actions run 41402666302,
  recorded in `board.db` with the PR linked to TSK-32FCB1 and TSK-C13066. That completes
  [Walking Skeleton Deployed](../.idea/epics/Walking%20Skeleton%20Deployed.md)'s CI task, and Phase 0
  is verified: only its release criteria remain.
- **Phase 5 recorded:** [Daily Expense Log](../.idea/epics/Daily%20Expense%20Log.md) and
  [Expenses At Check-In](../.idea/epics/Expenses%20At%20Check-In.md) are done, all 14 tasks verified
  by tests carrying their ids. The phase waits on the owner timing an expense on their own phone.
- **Blockers resolved:** `ATT-C9FFED` (no repository, so CI never ran) is gone. `ATT-91530E`
  (Docker image never built) is retired: Phase 6 removes Docker. New: the Supabase database
  password, needed at `/ship`.
- **Phase 6 started**, the move to Netlify and Supabase:
  [Backup Download And Restore](../.idea/epics/Backup%20Download%20And%20Restore.md) is being built
  first, on SQLite, so today's data can cross the move.
- **Backup download and restore built:** [Backup Download And Restore](../.idea/epics/Backup%20Download%20And%20Restore.md)
  is done, all 5 tasks verified (891 unit and 523 browser tests). An independent review asked for
  seven changes, all made. Settings > Backup now downloads the whole budget and restores it.
- **Workflow:** tateru 0.2.0 → 0.4.0 waits on its own branch, `chore/tateru-0.4.0`. The dashboard's
  light-mode epic lightness is declared in `contract/tokens.map`: the app is dark only. Conformance
  296/296 again.

## 2026-11-01

Nothing shipped. Sign-in changed at the owner's request: a password first, with each device's PIN,
fingerprint or face optional ([Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md),
ADR-0010). Two security reviews; every finding was fixed with a test. The intermittent browser-test
failure was traced to a race in the tests' save-balance helper, and fixed.

Later the same day, still nothing shipped: Phase 4 was added at the owner's request and built
locally. [Paid Optional And Grouped Bills](../.idea/epics/Paid%20Optional%20And%20Grouped%20Bills.md)
is verified; [Paycheck List Export](../.idea/epics/Paycheck%20List%20Export.md) waits on the owner
opening the Word document in Word. Each paycheck now downloads as a text file, a PDF or a Word
document in the owner's own list format (ADR-0011).

## 2026-10-31

Nothing shipped yet. Phase 0 was built and checked locally by `/setup`; the first release is
`/ship`'s, and nothing has been committed.

- Built, not deployed:
  - [Walking Skeleton Deployed](../.idea/epics/Walking%20Skeleton%20Deployed.md)
  - [Installable App Shell](../.idea/epics/Installable%20App%20Shell.md)
  - [Backups And Restore Drill](../.idea/epics/Backups%20And%20Restore%20Drill.md)
  - 7 of 15 Phase 0 tasks verified.
- Phases 1–3 built and tested locally, the same day: still nothing shipped, and nothing committed.
  - Phase 1: [Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md),
    [Schedule Of Pay And Bills](../.idea/epics/Schedule%20Of%20Pay%20And%20Bills.md),
    [Paycheck Periods And Safe To Spend](../.idea/epics/Paycheck%20Periods%20And%20Safe%20To%20Spend.md),
    [Guided First Run Setup](../.idea/epics/Guided%20First%20Run%20Setup.md). After a security
    review, one high and four medium findings were fixed.
  - Phase 2: [Payday Check-In Flow](../.idea/epics/Payday%20Check-In%20Flow.md),
    [Payday Reminder](../.idea/epics/Payday%20Reminder.md),
    [Paycheck Plan View](../.idea/epics/Paycheck%20Plan%20View.md).
  - Phase 3: [Loan Ledger](../.idea/epics/Loan%20Ledger.md),
    [Debt Free Date Projection](../.idea/epics/Debt%20Free%20Date%20Projection.md),
    [Loan Balances At Check-In](../.idea/epics/Loan%20Balances%20At%20Check-In.md). Verified.
  - The dashboard was restyled from the app's own tokens; the app gained `--color-surface-2` and
    `--color-warn`.
- **Dashboard: built dev-only at `/management`, on the owner's request**, before the app has
  components of its own. It is plain and draws only on `tokens.css`. **Revisit it in Phase 1**, when
  the setup flow brings the app's first real components, and rebuild its primitives from them.
