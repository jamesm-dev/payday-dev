---
title: PROGRESS
created: 2026-11-01
updated: 2026-11-15
tags: [progress, management]
status: active
---

# PROGRESS

**Phase 1 - Safe to spend:** 19/21 tasks, 4 of 7 exit criteria met
**Readiness:** 7 of 7 gates met.

Dashboard: `/management`, dev only — 404 in production.

Payday is live at payday-birc.netlify.app. Since a second deploy on 2026-11-15 (6af97c2c) it has a public home page, with Lighthouse SEO 100 on the live site, and the "Payday update" in plain words. Phase 6 is verified: the owner restoring their backup on the live site is left, checked by /ship. Phase 8 waits only on a reader who did not write the page. Phase 7, pay that fits, is being built next. Phases 1, 2, 4 and 5 wait only on checks a person does.

| Phase | Goal | Tasks | Status |
|---|---|---|---|
| 0 | Walking skeleton | 8/12 | verified |
| 1 | Safe to spend | 19/21 | in-progress |
| 2 | Payday check-in | 9/9 | in-progress |
| 3 | Loans and debt-free date | 10/10 | verified |
| 4 | Paycheck list export | 10/11 | in-progress |
| 5 | Daily expenses | 14/14 | in-progress |
| 6 | Free on Netlify | 20/21 | verified |
| 7 | Pay that fits | 0/18 | planned |
| 8 | A front door | 6/6 | in-progress |

## Deployment readiness — Phase 0

7 of 7 gates met.

- [x] **Exit criteria** — 4 of 8 met, 4 at release
- [x] **Tasks** — none blocked or in progress
- [x] **Tests** — latest run passed (the pre-push run of 2026-11-15 before deploy 6af97c2c: 978 unit and 595 browser tests); every Phase 0 epic has a linked run
- [x] **Checks** — lint, typecheck, test and build pass in the pre-push run before deploy 6af97c2c; CI green on PR #5, merged 2026-11-15
- [x] **Pull requests** — PR #6 open, test fixes only: nothing deployed waits on it; PRs #3, #4 and #5 merged 2026-11-15
- [x] **Risks** — no critical item; 1 warnings
- [x] **Deploy path** — deployed twice on 2026-11-15: 6af8ecd2 (the first, migrating Supabase) and 6af97c2c (the home page and the payday update wording), both built by Netlify from the deploy branch and published to payday-birc.netlify.app

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

Verified 2026-11-02, when CI ran green on PR #1. The four criteria at release are `/ship`'s; the site is live since 2026-11-15. The Litestream restore criterion is flagged for `/shape`: Phase 6 replaces it.

## Phase 1 — Safe to spend

Starting from nothing, the owner enters their pay, bills and loan payments in under 20 minutes and sees, behind a passkey, what is safe to spend until the next payday.

- [x] Every route except sign-in redirects to sign-in without a session, proven by a Playwright test that visits them all. — auth.e2e.ts over every route in tests/support/routes.ts, 2026-10-31
- [ ] A passkey registered on one device signs in on the other phone and the laptop, by adding a second passkey or the cross-device flow.
- [x] For the fixture household, the safe-to-spend number matches a hand calculation on five named dates — including a payday itself, a month-end and a three-paycheck month — in unit tests. — safeToSpend.test.ts, 2026-10-31
- [ ] Someone who did not build it completes first-run setup for the fixture household in under 20 minutes, timed, ending on the number.
- [x] The home screen shows the number, the next payday and what is reserved, at phone and laptop sizes. — home.e2e.ts on the iphone, android and laptop projects, 2026-10-31
- [x] The performance budget is re-checked with five years of generated data, and the numbers recorded. — performance.test.ts: p95 22.3 ms locally for 40 items and 600 overrides; home JavaScript 39.1 KB; recorded in SPECS.md, 2026-10-31
- [ ] The owner's real pay, bills and loan payments are entered on production — at release

Built and tested. Remaining: a passkey on both real phones, and setup timed by someone who did not build it.

## Phase 2 — Payday check-in

On payday the phone reminds the owner, and a five-minute check-in turns the new balance into what was spent and a plan for the next 14 days.

- [x] A Playwright test completes a check-in at phone size: pay confirmed, balance entered, spending shown, payments confirmed, plan shown. — checkin.e2e.ts on WebKit at iPhone size, 2026-10-31
- [x] For the fixture household, spending since the last check-in equals expected minus actual balance, and a payment marked missed stays reserved, in unit tests. — domain/checkin.test.ts, checkin.test.ts, 2026-10-31
- [x] The next six paychecks each show what they must cover, and a fixture paycheck that cannot cover its bills is flagged with the shortfall. — domain/plan.test.ts, phase2.e2e.ts, 2026-10-31
- [ ] A check-in on the fixture household takes five minutes or less by stopwatch, from opening the reminder to the plan shown.
- [ ] A payday reminder arrives on an installed iPhone and an Android phone at the chosen time and opens the check-in — at release
- [ ] The owner completes the first real payday check-in on their phone — at release

Built and tested. Remaining: the five-minute stopwatch payday update. The calendar file is the reminder (ADR-0016).

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

- [x] Every unit and browser test passes on Postgres (PGlite), with no Docker and no network. — 930 unit and 523 browser tests, 558e8ef, 2026-11-15
- [x] A backup downloaded from the current app restores into the Postgres version, and the number matches, in a test. — fullBackup.test.ts restores the SQLite-era fixture to its number, byte-identical on re-export; the owner's real backup was checked the same way, 2026-11-14
- [x] Sign-in limits and the 5-minute confirmation hold across separate function instances, in tests. — the cross-instance tests in 09c1eba, and live on Supabase through four connections, 2026-11-15
- [x] The app's tables cannot be reached through Supabase's public data API. — live on project `payday` after the first deploy: the REST API answers 406 PGRST106 for the `payday` and `drizzle` schemas and 404 in `public`, `anon` and `authenticated` hold no grant on either schema, and Supabase's security advisor lists nothing, 2026-11-15
- [x] The production build for Netlify passes, and the performance budget is measured again. — Netlify deploy 6af8ecd2 built and published c727e13; home-screen JavaScript 53.1 KB gzipped of 60 (budget.e2e.ts), home p95 12.5 to 15.8 ms and loans p95 29.8 ms locally with five years of data (performance.test.ts), 2026-11-15. Phone timings on production wait for `/ship`.
- [ ] Deployed on Netlify with Supabase, reachable over HTTPS, for $0 — at release

Verified 2026-11-15, and live at payday-birc.netlify.app (deploys 6af8ecd2 and 6af97c2c). Left for `/ship`: the owner's backup restored on the live site, and the last criterion, $0 at release.

## Phase 7 — Pay that fits

Someone paid every two weeks, twice a month or once a month gets a right number and plan for their own paydays, and a bill they pay early comes off the number at once and is counted once.

- [ ] Every existing every-14-days fixture keeps its value, and new hand-calculated fixtures for twice-a-month and monthly pay pass through a full year.
- [ ] A twice-a-month and a monthly owner each finish guided setup and a payday update at phone size, in browser tests, with no "14 days" or "two weeks" shown to them.
- [ ] A bill paid early lowers the number by its amount at once and is not held back again, whatever balance comes next, in unit and browser tests.
- [ ] A backup from before Phase 7 restores unchanged, as every 14 days.
- [ ] The home screen stays inside its performance budget for all three rhythms.

Planned 2026-11-15: how often you are paid as a setting, and a bill paid early counted once. Being built next, in eight slices; the owner settled the four open questions the same day.

## Phase 8 — A front door

A visitor who is not signed in finds a public home page that says what Payday does in simple words and makes them want to try it, and the public pages pass a search-engine audit.

- [x] A signed-out visitor at `/` sees the home page with a 200; a signed-in owner sees the number; no private page answers a signed-out visitor, in a test of every route. — guard.test.ts sweeps every route in `src/routes`, auth.e2e.ts every protected route on a running build, landing.e2e.ts at three sizes; security review approved, 2026-11-15
- [x] Lighthouse SEO is 100 on `/` and `/signin` on the deployed site, mobile setting. — Lighthouse 13.6.0, mobile, on payday-birc.netlify.app after deploy 6af97c2c (31d16ca): SEO 100 and accessibility 100 on both, 2026-11-15
- [ ] Someone who did not write it, older or not a native English speaker, reads the page and says back what Payday does.

Live since deploy 6af97c2c, 2026-11-15. Public Home Page is done: Lighthouse 13.6.0 on the live site gives SEO 100 and accessibility 100 on `/` and `/signin`. Left: a reader who did not write the page.
