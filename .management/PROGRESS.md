---
title: PROGRESS
created: 2026-11-01
updated: 2026-11-02
tags: [progress, management]
status: active
---

# PROGRESS

**Phase 1 - Safe to spend:** 19/21 tasks, 4 of 7 exit criteria met
**Readiness:** 6 of 7 gates met. Open: Deploy path

Dashboard: `/management`, dev only — 404 in production.

Building Phase 6, Free on Netlify: the backup is done and Postgres is being built. Phase 0 is verified and waits on its first deploy; Phases 1, 2, 4 and 5 are built and wait only on checks a person does.

| Phase | Goal | Tasks | Status |
|---|---|---|---|
| 0 | Walking skeleton | 8/12 | verified |
| 1 | Safe to spend | 19/21 | in-progress |
| 2 | Payday check-in | 9/9 | in-progress |
| 3 | Loans and debt-free date | 10/10 | verified |
| 4 | Paycheck list export | 10/11 | in-progress |
| 5 | Daily expenses | 14/14 | in-progress |
| 6 | Free on Netlify | 5/21 | in-progress |

## Deployment readiness — Phase 0

6 of 7 gates met.

- [x] **Exit criteria** — 4 of 8 met, 4 at release
- [x] **Tasks** — none blocked or in progress
- [x] **Tests** — latest run passed (the local run of 2026-11-02 after the backup step: 891 unit and 523 browser tests); every Phase 0 epic has a linked run
- [x] **Checks** — lint, typecheck and build pass locally after the backup step (2026-11-02); CI green on run 41402666302
- [x] **Pull requests** — none open against Phase 0's epics; PR #1 merged 2026-11-02
- [x] **Risks** — no critical item; 3 warnings
- [ ] **Deploy path** — never exercised: nothing has been deployed, and Phase 6 moves the target to Netlify

## Phase 0 — Walking skeleton

A number read from the real database appears on the deployed app, installed on an iPhone and an Android phone, with its data backed up and the performance budget measured.

- [x] From a fresh clone, `cd app && pnpm install && pnpm dev` starts the app, and the home route shows a number read from SQLite through a migrated table. — verified 2026-10-31 on a clean copy of `app/`: 412.50 shown 14 s after install began
- [x] CI is green on a real Vitest unit test and a real Playwright test. — GitHub Actions run 41402666302 on PR #1, 2026-11-02
- [x] A new contributor gets from clone to running in under 15 minutes by following `app/README.md`. — verified 2026-10-31 by the same walk-through, following the README; not yet timed by a person
- [x] The JavaScript shipped for the home screen is measured from the production build and recorded in `SPECS.md`. — 33.5 KB gzipped against 60 KB, by budget.e2e.ts, 2026-10-31
- [ ] The app is deployed and reachable over HTTPS — at release
- [ ] It installs to the home screen and opens full-screen on an iPhone and an Android phone — at release
- [ ] A restore from object storage into a fresh volume brings back a row written before the drill — at release
- [ ] Every `SPECS.md` performance budget is measured on both phones against production and the numbers recorded — at release

Verified 2026-11-02, when CI ran green on PR #1. The four criteria at release are `/ship`'s. The Litestream restore criterion is flagged for `/shape`: Phase 6 replaces it.

## Phase 1 — Safe to spend

Starting from nothing, the owner enters their pay, bills and loan payments in under 20 minutes and sees, behind a passkey, what is safe to spend until the next payday.

- [x] Every route except sign-in redirects to sign-in without a session, proven by a Playwright test that visits them all. — auth.e2e.ts over every route in tests/support/routes.ts, 2026-10-31
- [ ] A passkey registered on one device signs in on the other phone and the laptop, by adding a second passkey or the cross-device flow.
- [x] For the fixture household, the safe-to-spend number matches a hand calculation on five named dates — including a payday itself, a month-end and a three-paycheck month — in unit tests. — safeToSpend.test.ts, 2026-10-31
- [ ] Someone who did not build it completes first-run setup for the fixture household in under 20 minutes, timed, ending on the number.
- [x] The home screen shows the number, the next payday and what is reserved, at phone and laptop sizes. — home.e2e.ts on the iphone, android and laptop projects, 2026-10-31
- [x] The performance budget is re-checked with five years of generated data, and the numbers recorded. — performance.test.ts: p95 22.3 ms locally for 40 items and 600 overrides; home JavaScript 39.1 KB; recorded in SPECS.md, 2026-10-31
- [ ] The owner's real pay, bills and loan payments are entered on production — at release

Built and tested. Remaining: a passkey on both real phones, and setup timed by someone who did not build it. Real data is entered at release.

## Phase 2 — Payday check-in

On payday the phone reminds the owner, and a five-minute check-in turns the new balance into what was spent and a plan for the next 14 days.

- [x] A Playwright test completes a check-in at phone size: pay confirmed, balance entered, spending shown, payments confirmed, plan shown. — checkin.e2e.ts on WebKit at iPhone size, 2026-10-31
- [x] For the fixture household, spending since the last check-in equals expected minus actual balance, and a payment marked missed stays reserved, in unit tests. — domain/checkin.test.ts, checkin.test.ts, 2026-10-31
- [x] The next six paychecks each show what they must cover, and a fixture paycheck that cannot cover its bills is flagged with the shortfall. — domain/plan.test.ts, phase2.e2e.ts, 2026-10-31
- [ ] A check-in on the fixture household takes five minutes or less by stopwatch, from opening the reminder to the plan shown.
- [ ] A payday reminder arrives on an installed iPhone and an Android phone at the chosen time and opens the check-in — at release
- [ ] The owner completes the first real payday check-in on their phone — at release

Built and tested. Remaining: the five-minute stopwatch check-in. The reminder and the first real check-in are checked at release; Phase 6 makes the calendar file the reminder (ADR-0016).

## Phase 3 — Loans and debt-free date

Every loan, of all four kinds, is on one screen with the total owed, the interest it costs each month and the date it will all be paid off — kept true at every check-in.

- [x] A credit card, an instalment loan, a buy-now-pay-later plan and an informal loan can each be entered with the fields their kind needs. — loans.test.ts, loans.e2e.ts, 2026-10-31
- [x] Each kind's payoff projection matches a reference calculation within one minor unit per period, in unit tests. — loans.test.ts, checked after every period, 2026-10-31
- [x] A loan whose payment does not cover its interest shows that it will never be paid off at this pace, instead of a date. — loans.test.ts, loans.e2e.ts, 2026-10-31
- [x] Loan payments are counted once in the safe-to-spend number, proven by a fixture test that converts a bill into a loan. — loans.test.ts, 2026-10-31
- [x] A check-in pre-fills each loan's expected balance, and a credit card's balance change counts toward spending. — checkinLoans.test.ts, loans.e2e.ts, 2026-10-31
- [x] The performance budget is re-checked with five years of generated data, and the numbers recorded. — performance.test.ts: home p95 30–63 ms and loans p95 57–70 ms locally with 8 loans and 130 check-ins; recorded in SPECS.md, 2026-10-31
- [ ] The owner's real loans are entered on production and the debt-free date is shown — at release

Verified. Entering the real loans is checked at release.

## Phase 4 — Paycheck list export

Any of the next six paychecks downloads as a text file, a PDF or a Word document laid out exactly as the owner's handwritten list, with what is optional and what is already paid marked.

- [x] The owner's sample list reproduces line for line from the fixture, with every total computed, in a unit test. — domain/paycheckList.test.ts, 2026-11-01
- [x] A bill marked paid on the plan is ticked at the next check-in, and marking bills paid or optional leaves the safe-to-spend number unchanged, in tests. — money/paycheckList.test.ts, 2026-11-01
- [x] A Playwright test downloads the text file, the PDF and the Word document and checks their contents. — export.e2e.ts on WebKit, Android and laptop; marks.e2e.ts at iPhone size, 2026-11-01
- [ ] The three files open in Notepad, a PDF viewer and Word on the owner's laptop.
- [ ] A download from the installed app works on an iPhone and an Android phone — at release

Built and tested. Remaining: the owner opening the three files in Notepad, a PDF reader and Word. Downloads on both phones are checked at release.

## Phase 5 — Daily expenses

An expense is logged in a few seconds and lowers the safe-to-spend number at once, and the payday check-in shows what was logged against what the bank says was spent.

- [x] An expense logged on the home screen lowers the number by its amount at once, in a browser test at iPhone, Android and laptop sizes. — expenses.e2e.ts on all three, 2026-11-02
- [x] A fresh balance, from the home screen or a check-in, takes over from the expenses before it, so none is counted twice, in unit tests. — domain/safeToSpend.test.ts, money/expenses.test.ts, money/checkinLogged.test.ts, 2026-11-02
- [x] The check-in shows logged, spent and not logged, and counts a card purchase once, in tests. — money/checkinLogged.test.ts, spent-vs-logged.e2e.ts, 2026-11-02
- [x] The home screen stays inside its performance budget with a year of daily expenses. — performance.test.ts: home p95 20.2 ms locally with 365 expenses; budget.e2e.ts green in CI, 2026-11-02
- [ ] The owner logs an expense on their own phone in under ten seconds, timed.

Built and tested, recorded 2026-11-02. Remaining: the owner logging an expense on their own phone in under ten seconds.

## Phase 6 — Free on Netlify

The same app, on Netlify's free plan with its data in Supabase, costs nothing, and the owner can download and restore a full backup.

- [ ] Every unit and browser test passes on Postgres (PGlite), with no Docker and no network.
- [ ] A backup downloaded from the current app restores into the Postgres version, and the number matches, in a test.
- [ ] Sign-in limits and the 5-minute confirmation hold across separate function instances, in tests.
- [ ] The app's tables cannot be reached through Supabase's public data API.
- [ ] The production build for Netlify passes, and the performance budget is measured again.
- [ ] Deployed on Netlify with Supabase, reachable over HTTPS, for $0 — at release

In progress. Backup Download And Restore is done (2026-11-02); Postgres On Supabase is being built; then Sign-In State In The Database and Deploy On Netlify.
