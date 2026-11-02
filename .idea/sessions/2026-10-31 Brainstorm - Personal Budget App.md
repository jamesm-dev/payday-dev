---
title: 2026-10-31 Brainstorm - Personal Budget App
created: 2026-10-31
updated: 2026-10-31
tags: [session, brainstorm]
status: done
---

# 2026-10-31 Brainstorm - Personal Budget App

## The ask

> A monthly budgeting app, for myself, to control my monthly expenses. My salary comes in bi-weekly,
> I can't track my expenses, and I have a lot of loans I want to keep track of. Usable on web and
> mobile.

## Intent ledger

- **Real goal:** know, on any given day, how much can be spent before the next paycheck without
  missing a bill or loan payment — and watch the loans shrink. The app is the means; control is the
  point.
- **Success in 6 months:** used through about 13 paychecks; no missed or late loan payment; total
  debt and a debt-free date are known, and the total is lower than today.
- **Binding constraint:** follow-through on tracking. It has already failed once, so any design that
  needs daily discipline repeats the failure. Second: solo build time, alongside maintaining tateru.
- **Explicitly not:** a product for other people (sign-up, multiple users, billing), investing or
  net worth, taxes, shared household budgeting.
- **Corrections from the user:** none to the ledger. Answers given during `/shape`: build rather
  than adopt; an installable web app; SvelteKit with TypeScript; a few dollars a month for hosting;
  20+ hours a week; both an iPhone and an Android phone; loans of all four kinds; pay on the same day
  for the same amount; tracking never really started.

## Requirements, not ideas

> [!note] Web and mobile
> Stated as a hard requirement, so it is not scored as an idea. How to meet it — one installable web
> app, native apps, or a cross-platform framework — is a stack decision for `/shape`, recorded as an
> ADR. So is where the financial data lives and how the phone and the laptop stay in sync.

## Ideas produced

### [[Paycheck And Bills Out Of Sync]]

- [[Safe To Spend Number]] — one number: what is spendable until payday. *10x simpler*
- [[Paycheck Period Budgeting]] — budget per 14-day paycheck, not per month. *Contrarian*
- [[Recurring Money Schedule]] — enter every repeating item once; everything else reads it. *Compounding*
- [[Cash Flow Runway]] — an eight-week day-by-day balance projection. *Stolen from corporate treasury*

### [[Getting Out Of Debt]]

- [[Loan Ledger With Debt Free Date]] — every loan, the total, the monthly interest, the end date. *Obvious*
- [[Debt Payoff Planner]] — avalanche against snowball, what-ifs, third-paycheck months. *Constraint flip*

### [[Tracking Without Willpower]]

- [[Payday Check-In]] — five minutes every payday instead of logging daily. *Failure-first*
- [[Five Second Quick Add]] — log an expense from the home screen in five seconds.
- [[Bank Statement Import]] — the bank already tracks it; import and auto-categorise.
- [[AI Capture From Screenshots]] — a model reads screenshots and receipts. *Horizon bet*
- [[Live Bank Sync]] — transactions arrive on their own. *Ambitious, stretch*

### [[Build Or Adopt]]

- [[Adopt An Existing Budget App]] — try one for a month, build only the gap. *Premise-questioning*

## Recommendation

> [!tip] The core — three ideas that answer the real goal together
> 1. **[[Safe To Spend Number]]**, on top of [[Recurring Money Schedule]]. It answers the daily
>    question directly. Riskiest assumption: the starting balance is current.
> 2. **[[Loan Ledger With Debt Free Date]]**. It answers the loan question directly, with
>    well-known maths. Riskiest assumption: the true rate and terms of every loan can be found.
> 3. **[[Payday Check-In]]**. It removes the riskiest assumption of the first, and replaces the
>    daily habit that failed with one every two weeks. Riskiest assumption: it actually happens
>    every payday.

Argued against the favourite: a single safe-to-spend number creates false safety when irregular
expenses are missing from the schedule. It survives only if the schedule sets money aside for yearly
and quarterly bills — now a requirement on [[Recurring Money Schedule]].

## Decisions

- Web and mobile is treated as a requirement for `/shape`, not as an idea.
- The three recommended ideas are at `promising`, pending the user's reaction.

## Next steps

- [x] Answer: is building it part of the goal, or only solving the problem? Build — [[ADR-0001 Build Rather Than Adopt]].
- [x] Answer: why did tracking stop last time? It never really started.
- [ ] Gather every loan into one table: balance, APR, minimum payment, due date.
- [ ] List every recurring payment from the last two bank statements.
- [ ] Check which export formats each bank and card offers.
- [x] Run `/shape` — produced [[SPECS]] and [[ROADMAP]].
