---
title: INDEX
created: 2026-10-31
updated: 2026-11-16
tags: [moc]
status: active
---

# Idea Vault

> [!abstract] State
> **Spec:** [[SPECS]] (active) · **Roadmap:** [[ROADMAP]] (active) · Phases 0 to 5 are built and
> tested, in the project's own repository with CI green since 2026-11-02. Phases 0 and 3 are
> verified; Phases 1, 2, 4 and 5 wait on checks a person does with real phones. Phase 6, the move to
> a free Netlify and Supabase setup, went live at payday-birc.netlify.app on 2026-11-15 and is
> verified. Phases 7 and 8 were added the same day; Phase 8's public home page is live since a second
> deploy that day, with Lighthouse SEO 100 on the live site. Phase 7, pay that fits, went live on
> 2026-11-16 and is done. Phases 9 to 11, shaped the same night, open Payday to everyone with an
> email and a password (Google waits for a domain, ADR-0026), a product page and offline use. The
> product page, Phase 10, went live first; Phase 9 and Phase 12 (Google sign-in built switched off,
> ready for the owner to turn on, ADR-0028) went live on 2026-11-16. Phase 11, offline use, is
> verified on its branch (ADR-0029). 18 ideas across 5 themes, 12 committed into 32 epics (3 cut),
> 29 decisions.

## Themes

- [[Paycheck And Bills Out Of Sync]] — pay and bills arrive on different rhythms; the problem is timing. *(7 ideas, 6 committed)*
- [[Getting Out Of Debt]] — many loans make the total and the end date invisible. *(2 ideas, 1 committed)*
- [[Tracking Without Willpower]] — tracking never started; capture must not need daily discipline. *(5 ideas, 2 committed)*
- [[Many People And Any Device]] — many people, any device, even offline; Payday was built for one person online. *(3 ideas, 3 committed)*
- [[Build Or Adopt]] — whether to build at all; dormant, the answer was build. *(1 idea, 0 committed)*

## Committed

| Idea | Epics | Phase |
|---|---|---|
| [[Safe To Spend Number]] | [[Paycheck Periods And Safe To Spend]], [[Private Single User Access]], [[Guided First Run Setup]]; carried by [[Walking Skeleton Deployed]], [[Installable App Shell]], [[Backups And Restore Drill]] (cut); in Phase 6 by [[Backup Download And Restore]], [[Postgres On Supabase]], [[Sign-In State In The Database]], [[Deploy On Netlify]] | 1, 6 |
| [[Recurring Money Schedule]] | [[Schedule Of Pay And Bills]], [[Guided First Run Setup]] | 1 |
| [[Paycheck Period Budgeting]] | [[Paycheck Plan View]] | 2 |
| [[Payday Check-In]] | [[Payday Check-In Flow]], [[Payday Reminder]] (cut), [[Expenses At Check-In]], [[Deploy On Netlify]] | 2, 5, 6 |
| [[Loan Ledger With Debt Free Date]] | [[Loan Ledger]], [[Debt Free Date Projection]], [[Loan Balances At Check-In]] | 3 |
| [[Handwritten Paycheck List]] | [[Paid Optional And Grouped Bills]], [[Paycheck List Export]] | 4 |
| [[Five Second Quick Add]] | [[Daily Expense Log]], [[Expenses At Check-In]] | 5 |
| [[Pay Rhythm Setting]] | [[Paydays From Any Pay Rhythm]], [[Choose How Often You Are Paid]] | 7 |
| [[Pay A Bill Early]] | [[Early Payments Count Once]] | 7 |
| [[Found In Search]] | [[Public Home Page]], [[Product Landing Page]] | 8, 10 |
| [[Many People On One Site]] | [[Every Budget Has Its Owner]], [[Sign Up With Email And Password]], [[Your Account And Your Data]], [[Product Landing Page]], [[Continue With Google]] | 9, 10, 12 |
| [[Offline Use With Sync]] | [[Offline Number And Expenses]] | 11 |

## Where the build stands

| Phase | Status | Waiting on |
|---|---|---|
| 0 | verified | The first deploy, installs on both phones, and the budget on production, at release; its Litestream restore criterion awaits `/shape` |
| 1 | in-progress | A passkey on both real phones; setup timed by someone else |
| 2 | in-progress | The five-minute stopwatch check-in |
| 3 | verified | Real loans entered at release |
| 4 | in-progress | The owner opening the three files on the laptop; downloads on both phones at release |
| 5 | in-progress | The owner logging an expense on their own phone in under ten seconds |
| 6 | verified | Live at payday-birc.netlify.app since 2026-11-15; the owner's backup restored on the live site and "$0 at release" are `/ship`'s |
| 7 | done | Live since deploy 6af9eb66, 2026-11-16, its migrations on Supabase |
| 8 | in-progress | Live since deploy 6af97c2c, 2026-11-15, and [[Public Home Page]] is done (Lighthouse SEO 100 live); left: a reader who did not write it |
| 9 | verified | Live since deploy 6afa417b, 2026-11-16, after the owner's real backup matched through the migration check; left: the owner adds their email |
| 10 | verified | Live since deploy 6afa007f, Lighthouse SEO 100 live; its sign-up button live with Phase 9 since deploy 6afa417b |
| 11 | verified | Built and verified 2026-11-16 on `phase-11-offline` (ADR-0029); left: a real iPhone with no signal |
| 12 | verified | Live switched off since deploy 6afa417b; left: the owner turns it on and signs in |

Epics in progress: [[Walking Skeleton Deployed]], [[Installable App Shell]],
[[Private Single User Access]], [[Guided First Run Setup]], [[Paycheck List Export]],
[[Deploy On Netlify]]. Cut on 2026-11-02 by the move to Netlify:
[[Backups And Restore Drill]], [[Payday Reminder]]; cut on 2026-11-16 for email sign-up:
[[Sign In With Google]]. Done: [[Schedule Of Pay And Bills]],
[[Paycheck Periods And Safe To Spend]], [[Payday Check-In Flow]], [[Paycheck Plan View]],
[[Loan Ledger]], [[Debt Free Date Projection]], [[Loan Balances At Check-In]],
[[Paid Optional And Grouped Bills]], [[Daily Expense Log]], [[Expenses At Check-In]],
[[Backup Download And Restore]], [[Postgres On Supabase]], [[Sign-In State In The Database]],
[[Public Home Page]], [[Paydays From Any Pay Rhythm]], [[Choose How Often You Are Paid]],
[[Early Payments Count Once]], [[Product Landing Page]], [[Every Budget Has Its Owner]],
[[Sign Up With Email And Password]], [[Your Account And Your Data]],
[[Offline Number And Expenses]]. Built and switched off, waiting for the owner: [[Continue With Google]].

## Promising, unshaped

None. [[Many People On One Site]] and [[Offline Use With Sync]] were shaped on 2026-11-15 into
Phases 9 and 11. Still open, without an idea note yet: email checks and email reset once there is a domain (Google
sign-in is Phase 12, built switched off), a new name, and Filipino alongside English.

## Seeds — after v1

In the order the roadmap would reach for them:

- [[Debt Payoff Planner]] — seed
- [[Bank Statement Import]] — seed
- [[Cash Flow Runway]] — seed
- [[AI Capture From Screenshots]] — seed
- [[Live Bank Sync]] — seed

## Parked & superseded

- [[Adopt An Existing Budget App]] — parked; the decision was to build.

## Decisions

- [[ADR-0001 Build Rather Than Adopt]] — accepted
- [[ADR-0002 Installable Web App Over Native]] — accepted
- [[ADR-0003 SvelteKit With TypeScript]] — accepted
- [[ADR-0004 SQLite With Continuous Backup]] — superseded by ADR-0014
- [[ADR-0005 Fly.io As The Host]] — superseded by ADR-0013
- [[ADR-0006 Passkeys For A Single Owner]] — superseded by ADR-0010
- [[ADR-0007 Money As Integer Minor Units]] — accepted
- [[ADR-0008 Migrations Run At Server Start]] — superseded by ADR-0015
- [[ADR-0009 Conservative Safe To Spend Rules]] — accepted; decided by `/setup`
- [[ADR-0010 Password Sign-In With Optional Passkeys]] — accepted; the owner's choice, 2026-11-01
- [[ADR-0011 Exports Written Without New Dependencies]] — accepted; decided by `/epic`, 2026-11-01
- [[ADR-0012 Logged Expenses Count Until The Next Balance]] — accepted; the owner's choice, 2026-11-02
- [[ADR-0013 Netlify As The Host]] — accepted; the owner's choice, 2026-11-02
- [[ADR-0014 Supabase Postgres As The Database]] — accepted; the owner's choice, 2026-11-02
- [[ADR-0015 Migrations Run At Deploy]] — accepted; decided by `/shape`, 2026-11-02
- [[ADR-0016 Reminders By Calendar File Only]] — accepted; the owner's choice, 2026-11-02
- [[ADR-0017 Postgres Types And Driver Version]] — accepted; by `/setup`, 2026-11-02: `bigint` money, `text` instants, `postgres` 3.4.9
- [[ADR-0018 Password Checks Queue In The Database]] — accepted; by `/setup`, 2026-11-15, after the security review
- [[ADR-0019 Node 24 On Netlify And Tests On Adapter-Node]] — accepted; by `/setup`, 2026-11-15
- [[ADR-0020 Early Payments Count Until The Next Balance]] — accepted; the owner's choice, 2026-11-15
- [[ADR-0021 Pay Rhythm Is A Setting]] — accepted; the owner's choice, 2026-11-15
- [[ADR-0022 Open Sign-Up With A Limit]] — accepted; the owner's choice, 2026-11-15
- [[ADR-0023 Google Sign-In For New Accounts]] — superseded by ADR-0026, 2026-11-16
- [[ADR-0024 Offline Copy And Queued Expenses]] — accepted; the owner's choice, 2026-11-15
- [[ADR-0025 Anime.js For The Landing Page]] — accepted; the owner's choice, 2026-11-15
- [[ADR-0026 Email And Password Sign-Up For Now]] — accepted; the owner's choice, 2026-11-16
- [[ADR-0027 A Backup From Another Account Needs A Tick]] — accepted; decided during the Phase 9 build, 2026-11-16
- [[ADR-0028 Google Sign-In Built Switched Off]] — accepted; the owner's request, 2026-11-16; amends ADR-0026
- [[ADR-0029 Offline Copy In Local Storage]] — accepted; ends the Phase 11 spike, builds ADR-0024

## Sessions

- [[2026-10-31 Brainstorm - Personal Budget App]]
- [[2026-11-01 Brainstorm - Paycheck List Export]]
- [[2026-11-15 Brainstorm - Pay Rhythm And Early Bills]]

## About this vault

- [[README]] — how the vault works.

---

> [!note]- Dataview (optional plugin)
> ```dataview
> TABLE horizon, impact, effort, confidence, status
> FROM "notes"
> WHERE status != "superseded"
> SORT impact DESC, effort ASC
> ```
