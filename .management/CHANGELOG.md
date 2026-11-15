---
title: CHANGELOG
created: 2026-10-31
updated: 2026-11-15
tags: [changelog, management]
status: active
---

# CHANGELOG

What actually shipped, newest first. Append only.

## 2026-11-15, night — Phase 7 built, not online yet

Nothing new shipped: Phase 7 is built and verified on its branch, and goes live with the next
deploy.

- **Pay that fits:** guided setup and Settings ask how often you are paid (every two weeks, twice
  a month or once a month), and paydays, the plan, the number, loans and the calendar file follow
  it. [Paydays From Any Pay Rhythm](../.idea/epics/Paydays%20From%20Any%20Pay%20Rhythm.md), [Choose How Often You Are Paid](../.idea/epics/Choose%20How%20Often%20You%20Are%20Paid.md).
- **Paid early:** a bill paid before its day comes off the number at once and is counted once, from
  the plan, the home screen, the payday update and loans. [Early Payments Count Once](../.idea/epics/Early%20Payments%20Count%20Once.md).
- **Checked:** 1,175 unit and 579 browser tests, lint, typecheck and the build. Five reviews asked
  for changes, all made.
- **The next deploy** runs four database changes on Supabase (0002 to 0005), all additive.
- **Planned:** Phases 9 to 11, open to everyone with Google sign-in, a product page, and use without
  signal.

## 2026-11-15, evening — the home page and the payday update are online

**Shipped: a public home page, and the "Payday update" in plain words** (deploy 6af97c2c, from
`main` at 31d16ca; no database change).

- **[Public Home Page](../.idea/epics/Public%20Home%20Page.md) done:** all 6 tasks verified.
  Lighthouse 13.6.0, mobile, on the live site: SEO 100 and accessibility 100 on `/` and `/signin`.
  Phase 8 waits only on a reader who did not write the page.
- **Checked live:** a signed-out browser asking for a private page is sent to sign in, other requests
  for one are refused, and a POST to `/` is refused. The sitemap lists only `/` and `/signin`.
- **Found:** Netlify injects its own script into every page. Payday's security rules block the frame
  it opens, which is why Lighthouse's Best Practices reads 92.
- **Two test races fixed** (PR #6, tests only), after three blocked pushes. The deploy went out
  once every check passed: 978 unit and 595 browser tests.
- **Phase 7 next:** planned in eight slices, with the owner's four choices made the same day.

## 2026-11-15, later — Payday is live

**Shipped: Payday is online at payday-birc.netlify.app**, free, on Netlify with its data in Supabase
(deploy 6af8ecd2). The owner created their account on it.

- **[Deploy On Netlify](../.idea/epics/Deploy%20On%20Netlify.md):** 6 of its 7 tasks are verified on
  the live site: the build, the database set-up at deploy, the security headers, and deploys only
  on purpose. The last task, "$0 at release", is checked by `/ship` once the owner's budget is
  restored on the live site.
- **Phase 6 is verified.** The app's tables cannot be read through Supabase's public API, checked
  live.
- **Merged, not online yet:** the check-in is now the "Payday update", in plain words for older
  readers who are not native English speakers (PR #4). It goes live with the next deploy.
- **Planned:** Phase 7, pay that fits (pay every two weeks, twice a month or monthly; a bill paid
  early counted once), and Phase 8, a public home page. Many people on one site and offline use
  wait for `/shape`.
- **Built, not online yet:** [Public Home Page](../.idea/epics/Public%20Home%20Page.md), 5 of 6 tasks
  verified. A security review asked for changes in its first round and approved the second.
  Lighthouse locally: SEO 100, accessibility 100. The live audit waits for the deploy.
- **A flaky speed test fixed:** it now runs on its own, with the same 150 ms budget.

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
