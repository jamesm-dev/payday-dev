---
title: INDEX
created: 2026-10-31
updated: 2026-11-02
tags: [moc]
status: active
---

# Idea Vault

> [!abstract] State
> **Spec:** [[SPECS]] (active) · **Roadmap:** [[ROADMAP]] (active) · v1 is built and tested locally:
> Phase 3 is verified, and Phases 0–2 wait on a person, real phones or a release. Phase 4, the
> paycheck list export, was added on 2026-11-01; Phase 5, daily expenses, and Phase 6, the move to a
> free Netlify and Supabase setup, on 2026-11-02. 13 ideas across 4 themes, 7 committed into 21
> epics (2 cut), 16 decisions.

## Themes

- [[Paycheck And Bills Out Of Sync]] — pay is bi-weekly, bills are monthly; the problem is timing. *(5 ideas, 4 committed)*
- [[Getting Out Of Debt]] — many loans make the total and the end date invisible. *(2 ideas, 1 committed)*
- [[Tracking Without Willpower]] — tracking never started; capture must not need daily discipline. *(5 ideas, 2 committed)*
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

## Where the build stands

| Phase | Status | Waiting on |
|---|---|---|
| 0 | in-progress | CI on GitHub, the first deploy, installs on both phones, a restore drill |
| 1 | in-progress | A passkey on both real phones; setup timed by someone else |
| 2 | in-progress | Reminders subscribed on the installed app; the five-minute stopwatch check-in |
| 3 | verified | Real loans entered at release |
| 4 | in-progress | The owner opening the three files on the laptop; downloads on both phones at release |
| 5 | in-progress | Being built by `/setup`, 2026-11-02 |
| 6 | planned | Phase 5 first; then `/setup` |

Epics still in progress: [[Walking Skeleton Deployed]], [[Installable App Shell]],
[[Private Single User Access]], [[Guided First Run Setup]], [[Paycheck List Export]]. Cut on
2026-11-02 by the move to Netlify: [[Backups And Restore Drill]], [[Payday Reminder]]. Done: [[Schedule Of Pay And Bills]],
[[Paycheck Periods And Safe To Spend]], [[Payday Check-In Flow]], [[Paycheck Plan View]],
[[Loan Ledger]], [[Debt Free Date Projection]], [[Loan Balances At Check-In]],
[[Paid Optional And Grouped Bills]]. Planned: [[Daily Expense Log]], [[Expenses At Check-In]], [[Backup Download And Restore]],
[[Postgres On Supabase]], [[Sign-In State In The Database]], [[Deploy On Netlify]].

## Promising, unshaped

None. Every promising idea was committed by `/shape` on 2026-10-31.

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

## Sessions

- [[2026-10-31 Brainstorm - Personal Budget App]]
- [[2026-11-01 Brainstorm - Paycheck List Export]]

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
