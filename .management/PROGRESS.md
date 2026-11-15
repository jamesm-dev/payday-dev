---
title: PROGRESS
created: 2026-11-01
updated: 2026-11-16
tags: [progress, management]
status: active
---

# PROGRESS

**Phase 1 - Safe to spend:** 19/21 tasks, 4 of 7 exit criteria met
**Readiness:** 7 of 7 gates met.

Dashboard: `/management`, dev only — 404 in production.

Payday is live at payday-birc.netlify.app (deploy 6afa007f, 2026-11-16): Phase 7 (pay rhythm, bills paid early) and the Phase 10 product page, Lighthouse SEO 100 live. Phase 9, open to everyone (email and password sign-up up to 100 accounts, a privacy notice, account deletion), is built and verified on branch phase-9-open-to-everyone after a security and an integration review; its pull request waits for the owner, and its deploy for the owner's real backup through scripts/check-owner-migration.ts. Next: Google sign-in ready to switch on, then offline (Phase 11). Phases 1, 2, 4 and 5 wait only on checks a person does; Phase 8 on a reader.

| Phase | Goal | Tasks | Status |
|---|---|---|---|
| 0 | Walking skeleton | 8/12 | verified |
| 1 | Safe to spend | 19/21 | in-progress |
| 2 | Payday check-in | 9/9 | in-progress |
| 3 | Loans and debt-free date | 10/10 | verified |
| 4 | Paycheck list export | 10/11 | in-progress |
| 5 | Daily expenses | 14/14 | in-progress |
| 6 | Free on Netlify | 20/21 | verified |
| 7 | Pay that fits | 19/19 | done |
| 8 | A front door | 6/6 | in-progress |
| 9 | Open to everyone | 18/18 | verified |
| 10 | A product page | 7/7 | verified |
| 11 | Works without signal | 0/6 | planned |

## Deployment readiness — Phase 0

7 of 7 gates met.

- [x] **Exit criteria** — 4 of 8 met, 4 at release
- [x] **Tasks** — none blocked or in progress
- [x] **Tests** — latest run passed (the full Phase 9 run of 2026-11-16 on its branch: 1,324 unit and 641 browser tests); every Phase 0 epic has a linked run
- [x] **Checks** — lint, typecheck, test and build pass on the Phase 9 branch; CI green on PR #8, merged and deployed 2026-11-16
- [x] **Pull requests** — Phase 9's pull request is about to open; PRs #7 and #8 merged 2026-11-16
- [x] **Risks** — no critical item; 1 warnings
- [x] **Deploy path** — deployed four times: 6af8ecd2 and 6af97c2c on 2026-11-15, 6af9eb66 (Phase 7) and 6afa007f (the product page) on 2026-11-16, each built by Netlify from the deploy branch

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

- [x] Every existing every-14-days fixture keeps its value, and new hand-calculated fixtures for twice-a-month and monthly pay pass through a full year. — no existing domain test or fixture edited; periods.rhythm, plan.rhythm and safeToSpend.rhythm tests run a year of the 15th and last day and of monthly on the 31st, with February and a leap year, 2026-11-15
- [x] A twice-a-month and a monthly owner each finish guided setup and a payday update at phone size, in browser tests, with no "14 days" or "two weeks" shown to them. — rhythm.e2e.ts at iPhone size, setup screens included, 2026-11-15
- [x] A bill paid early lowers the number by its amount at once and is not held back again, whatever balance comes next, in unit and browser tests. — safeToSpend.early, plan.early, edges.early, earlyMarks and reviewFixes tests; marks.e2e.ts TSK-500C4F and TSK-342C1F, 2026-11-15
- [x] A backup from before Phase 7 restores unchanged, as every 14 days. — fullBackup.test.ts TSK-86C4B3: the version 1 fixture keeps its number, its main pay inferred as migration 0003 does, 2026-11-15
- [x] The home screen stays inside its performance budget for all three rhythms. — home p95 15.4 ms every 14 days, 14.7 ms twice a month and 16.0 ms monthly with five years of data (150 ms budget); home JavaScript 54.9 KB of 60, 2026-11-15

Done 2026-11-16: live in deploy 6af9eb66, migrations 0002 to 0005 confirmed on Supabase.

## Phase 8 — A front door

A visitor who is not signed in finds a public home page that says what Payday does in simple words and makes them want to try it, and the public pages pass a search-engine audit.

- [x] A signed-out visitor at `/` sees the home page with a 200; a signed-in owner sees the number; no private page answers a signed-out visitor, in a test of every route. — guard.test.ts sweeps every route in `src/routes`, auth.e2e.ts every protected route on a running build, landing.e2e.ts at three sizes; security review approved, 2026-11-15
- [x] Lighthouse SEO is 100 on `/` and `/signin` on the deployed site, mobile setting. — Lighthouse 13.6.0, mobile, on payday-birc.netlify.app after deploy 6af97c2c (31d16ca): SEO 100 and accessibility 100 on both, 2026-11-15
- [ ] Someone who did not write it, older or not a native English speaker, reads the page and says back what Payday does.

Live since deploy 6af97c2c, 2026-11-15. Public Home Page is done: Lighthouse 13.6.0 on the live site gives SEO 100 and accessibility 100 on `/` and `/signin`. Left: a reader who did not write the page.

## Phase 9 — Open to everyone

Anyone can create a free account with an email and a password and get a private budget of their own, the same on every device, up to 100 accounts, while the owner's budget stays exactly as it is.

- [x] Two people signed in at once can never see, change, download or restore each other's budget, proven by a test of every route. — ownership.test.ts, passkeyOwnership.test.ts and people-account.e2e.ts, 2026-11-16
- [x] A new person creates an account with an email and a password at phone size, lands in guided setup with an empty budget, and signs in again later to the same budget, in browser tests. — people-journey.e2e.ts, 2026-11-16
- [ ] The owner's budget is unchanged after the migration: the same number, plan, loans and history, checked on a copy of the real backup before the deploy. — at release: proven on a fictional version 2 backup (ownerMigration.test.ts); the owner's real backup goes through scripts/check-owner-migration.ts before the deploy
- [x] The 101st account is refused in plain words, and nothing about that visitor is stored. — signUp.test.ts, Landing.test.ts, 2026-11-16
- [x] A person can read the privacy notice, download their budget and delete their account, and after deleting, no table holds their id. — privacy.e2e.ts, fullBackup.test.ts, deleteAccount.test.ts and people-account.e2e.ts, 2026-11-16
- [x] The home screen stays inside its performance budget with 100 people's five years of data. — home p95 32.7 ms, loans 58.9 ms (150 ms), performanceMany.test.ts, 2026-11-16

Verified 2026-11-16 on its branch: 18 tasks, a security and an integration review, 1,324 unit and 641 browser tests. Left for /ship: the owner's real backup through scripts/check-owner-migration.ts, then the deploy running migration 0006.

## Phase 10 — A product page

A visitor finds a product page that says accurately what Payday is and is not, shows the real app, invites them to try an example, and starts their account with one tap.

- [x] Lighthouse on the live site, mobile: SEO 100 and accessibility at least 95 on the product page. — deploy 6afa007f: SEO 100, accessibility 100, performance 100, 2026-11-16
- [x] Every claim on the page is checked against the app in a test, and the page says plainly it is a budget app, not a loan. — landing.e2e.ts TSK-d22bce and TSK-c7fcd1 at three sizes, 2026-11-16
- [x] The "try it" example and the motion work on a phone, the page reads in full without JavaScript, and nothing moves with reduced motion set. — landing.e2e.ts TSK-619b8d and TSK-2c985a at iPhone, Android and laptop sizes, 2026-11-16
- [x] The first screen shows within 2 seconds on 4G, and the signed-in home screen stays within its 60 KB. — 1.8 s in Lighthouse mobile on simulated slow 4G; the page loads only for visitors (TSK-121277), and rhythm.e2e.ts holds the home screen under 60 KB, 2026-11-16
- [x] "Create a free account" on the page creates an account; when sign-up is full, the page says so. (Was "Continue with Google"; changed by ADR-0026, 2026-11-16.) — people-journey.e2e.ts and Landing.test.ts, 2026-11-16; live with Phase 9

Verified 2026-11-16: live since deploy 6afa007f (Lighthouse mobile on the live site: SEO 100, accessibility 100, performance 100); its "Create a free account" button goes live with Phase 9.

## Phase 11 — Works without signal

With no signal, the installed app shows the last number and plan, clearly dated, and an expense logged offline reaches the site exactly once when the signal returns.

- [ ] With the network off, the home screen shows the last number and plan marked "Offline: from <day and time>", in a browser test.
- [ ] An expense logged offline lowers the shown number at once and is saved on the site exactly once when the network returns, even when sent twice.
- [ ] Expenses logged offline on two phones end up once each on both.
- [ ] Signing out removes the copy and any unsent expenses from the phone.
- [ ] The home screen stays inside its 60 KB JavaScript budget with the offline code.

Planned 2026-11-15 by `/shape`: the last number and plan offline, and expenses logged offline sent once.
