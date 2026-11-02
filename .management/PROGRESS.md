---
title: PROGRESS
created: 2026-11-01
updated: 2026-11-01
tags: [progress, management]
status: active
---

# PROGRESS

**Phase 0 - Walking skeleton:** 7/15 tasks, 3 of 8 exit criteria met
**Readiness:** 5 of 7 gates met. Open: Exit criteria, Deploy path

Dashboard: `/management`, dev only — 404 in production.

| Phase | Goal | Tasks | Status |
|---|---|---|---|
| 0 | Walking skeleton | 7/15 | in-progress |
| 1 | Safe to spend | 19/21 | in-progress |
| 2 | Payday check-in | 12/13 | in-progress |
| 3 | Loans and debt-free date | 10/10 | verified |
| 4 | Paycheck list export | 10/11 | in-progress |

## Deployment readiness — Phase 0

5 of 7 gates met.

- [ ] **Exit criteria** — 3 of 8 met, 4 at release; open: CI is green on a real Vitest unit test and a real Playwright test
- [x] **Tasks** — none blocked or in progress
- [x] **Tests** — latest run passed; every Phase 0 epic has a linked run
- [x] **Checks** — lint, typecheck and build pass (2026-11-01)
- [x] **Pull requests** — none open: the project has no repository yet
- [x] **Risks** — no critical item; 4 warnings
- [ ] **Deploy path** — never exercised: nothing has been deployed

## Phase 0 — Walking skeleton

A number read from the real database appears on the deployed app, installed on an iPhone and an Android phone, with its data backed up and the performance budget measured.

- [x] From a fresh clone, `cd app && pnpm install && pnpm dev` starts the app, and the home route shows a number read from SQLite through a migrated table. — verified 2026-10-31 on a clean copy of `app/`: 412.50 shown 14 s after install began
- [ ] CI is green on a real Vitest unit test and a real Playwright test.
- [x] A new contributor gets from clone to running in under 15 minutes by following `app/README.md`. — verified 2026-10-31 by the same walk-through, following the README; not yet timed by a person
- [x] The JavaScript shipped for the home screen is measured from the production build and recorded in `SPECS.md`. — 33.5 KB gzipped against 60 KB, by budget.e2e.ts, 2026-10-31
- [ ] The app is deployed and reachable over HTTPS — at release
- [ ] It installs to the home screen and opens full-screen on an iPhone and an Android phone — at release
- [ ] A restore from object storage into a fresh volume brings back a row written before the drill — at release
- [ ] Every `SPECS.md` performance budget is measured on both phones against production and the numbers recorded — at release

Remaining before `verified`: CI green, which needs the project's own repository. The four criteria at release are `/ship`'s.

## Phase 1 — Safe to spend

Starting from nothing, the owner enters their pay, bills and loan payments in under 20 minutes and sees, behind a passkey, what is safe to spend until the next payday.

- [x] Every route except sign-in redirects to sign-in without a session, proven by a Playwright test that visits them all. — auth.e2e.ts over every route in tests/support/routes.ts, 2026-10-31
- [ ] A passkey registered on one device signs in on the other phone and the laptop, by adding a second passkey or the cross-device flow.
- [x] For the fixture household, the safe-to-spend number matches a hand calculation on five named dates — including a payday itself, a month-end and a three-paycheck month — in unit tests. — safeToSpend.test.ts, 2026-10-31
- [ ] Someone who did not build it completes first-run setup for the fixture household in under 20 minutes, timed, ending on the number.
- [x] The home screen shows the number, the next payday and what is reserved, at phone and laptop sizes. — home.e2e.ts on the iphone, android and laptop projects, 2026-10-31
- [x] The performance budget is re-checked with five years of generated data, and the numbers recorded. — performance.test.ts: p95 22.3 ms locally for 40 items and 600 overrides; home JavaScript 39.1 KB; recorded in SPECS.md, 2026-10-31
- [ ] The owner's real pay, bills and loan payments are entered on production — at release

Built and tested locally. Remaining: a passkey on both real phones, and setup timed by someone who did not build it. Real data is entered at release.

## Phase 2 — Payday check-in

On payday the phone reminds the owner, and a five-minute check-in turns the new balance into what was spent and a plan for the next 14 days.

- [x] A Playwright test completes a check-in at phone size: pay confirmed, balance entered, spending shown, payments confirmed, plan shown. — checkin.e2e.ts on WebKit at iPhone size, 2026-10-31
- [x] For the fixture household, spending since the last check-in equals expected minus actual balance, and a payment marked missed stays reserved, in unit tests. — domain/checkin.test.ts, checkin.test.ts, 2026-10-31
- [x] The next six paychecks each show what they must cover, and a fixture paycheck that cannot cover its bills is flagged with the shortfall. — domain/plan.test.ts, phase2.e2e.ts, 2026-10-31
- [ ] A check-in on the fixture household takes five minutes or less by stopwatch, from opening the reminder to the plan shown.
- [ ] A payday reminder arrives on an installed iPhone and an Android phone at the chosen time and opens the check-in — at release
- [ ] The owner completes the first real payday check-in on their phone — at release

Built and tested locally. Remaining: the five-minute stopwatch check-in. A real reminder and the first real check-in are checked at release.

## Phase 3 — Loans and debt-free date

Every loan, of all four kinds, is on one screen with the total owed, the interest it costs each month and the date it will all be paid off — kept true at every check-in.

- [x] A credit card, an instalment loan, a buy-now-pay-later plan and an informal loan can each be entered with the fields their kind needs. — loans.test.ts, loans.e2e.ts, 2026-10-31
- [x] Each kind's payoff projection matches a reference calculation within one minor unit per period, in unit tests. — loans.test.ts, checked after every period, 2026-10-31
- [x] A loan whose payment does not cover its interest shows that it will never be paid off at this pace, instead of a date. — loans.test.ts, loans.e2e.ts, 2026-10-31
- [x] Loan payments are counted once in the safe-to-spend number, proven by a fixture test that converts a bill into a loan. — loans.test.ts, 2026-10-31
- [x] A check-in pre-fills each loan's expected balance, and a credit card's balance change counts toward spending. — checkinLoans.test.ts, loans.e2e.ts, 2026-10-31
- [x] The performance budget is re-checked with five years of generated data, and the numbers recorded. — performance.test.ts: home p95 30–63 ms and loans p95 57–70 ms locally with 8 loans and 130 check-ins; recorded in SPECS.md, 2026-10-31
- [ ] The owner's real loans are entered on production and the debt-free date is shown — at release

Verified locally. Real loans are entered at release.

## Phase 4 — Paycheck list export

Any of the next six paychecks downloads as a text file, a PDF or a Word document laid out exactly as the owner's handwritten list, with what is optional and what is already paid marked.

- [x] The owner's sample list reproduces line for line from the fixture, with every total computed, in a unit test. — domain/paycheckList.test.ts, 2026-11-01
- [x] A bill marked paid on the plan is ticked at the next check-in, and marking bills paid or optional leaves the safe-to-spend number unchanged, in tests. — money/paycheckList.test.ts, 2026-11-01
- [x] A Playwright test downloads the text file, the PDF and the Word document and checks their contents. — export.e2e.ts on WebKit, Android and laptop; marks.e2e.ts at iPhone size, 2026-11-01
- [ ] The three files open in Notepad, a PDF viewer and Word on the owner's laptop.
- [ ] A download from the installed app works on an iPhone and an Android phone — at release

Built and tested locally. Remaining: the owner opening the text file, the PDF and the Word document on the laptop. A download from each installed phone app is checked at release.

## Test trail

Latest run 2026-11-01: 1155 passed, 14 skipped, 0 failed — rows in `board.db` `test_run`, one per task a test names. Home-screen JavaScript 40.6 KB gzipped against 60 KB; with five years of data, home p95 30–63 ms and loans p95 57–70 ms locally.
