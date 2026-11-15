---
title: 2026-11-15 Brainstorm - Pay Rhythm And Early Bills
created: 2026-11-15
updated: 2026-11-15
tags: [session, brainstorm]
status: active
---

# 2026-11-15 Brainstorm - Pay Rhythm And Early Bills

A capture for `/epic`, not a full divergence session, on the day Payday first went live at
payday-birc.netlify.app.

## The ask

> also allow users to pay early for the upcoming bills and things. on check-in, allow users to
> choose bi-weekly or monthly pay

Then, asked who will use Payday: "Many on one site", and

> many users can login via site so that users can see their budget accurately the same even if
> they switch devices but make sure they can also use things even offline

The same day, the owner asked for every check-in text to be rewritten in simple words "for users
who are not native English speakers and are old", and chose to call the check-in "Payday update"
on screen. That rewrite is wording only and is built through `/work-on` on branch
`copy/checkin-plain-words`, so it has no note of its own here.

## Intent ledger

- **Real goal:** make Payday fit how people are actually paid and actually pay their bills, and
  open it to other people, older and not native English speakers, on one site.
- **Success in 6 months:** people paid twice a month or monthly trust their number as the owner
  trusts theirs; a bill paid early is counted once; several people use the site from more than one
  device.
- **Binding constraint:** the free plans and a design built for one person online.
- **Explicitly not:** categories, bank sync, or changing the safe-to-spend rules beyond what an
  early payment needs.
- **Corrections from the user:** "users" means many people on one site, not one owner.

## Ideas produced

### [[Paycheck And Bills Out Of Sync]]

- [[Pay A Bill Early]] — a later bill paid now comes off the number now, and once only.
- [[Pay Rhythm Setting]] — every two weeks, twice a month, or once a month, as a setting.

### [[Many People And Any Device]]

- [[Many People On One Site]] — sign up, private budgets, the same on every device.
- [[Offline Use With Sync]] — keep working with no signal, then sync.
- [[Found In Search]] — public pages that pass a search-engine audit at 100. The owner's later
  words: "the app should pass the SEO testing 100% if possible", then "yes, create a homepage for
  the app with contents simple enough for the users to be attracted to use it".

## Decisions

The owner's answers, 2026-11-15:

- An early payment **takes the money off now**, and the later paycheck stops holding it back. Not a
  label only.
- How often someone is paid is **a setting**, chosen once and changeable. Not a choice at every
  check-in, and not only a longer plan.
- **Twice a month is included**, beside every two weeks and once a month.
- **Many people on one site**, the same budget on every device, usable offline.
- **A public home page now**, in simple words, with "Sign in" as its button and an honest note that
  accounts for new people are not open yet, chosen as the default and open to the owner's veto.

## Next steps

- [x] Turn [[Pay A Bill Early]] and [[Pay Rhythm Setting]] into epics with `/epic`:
  [[Paydays From Any Pay Rhythm]], [[Choose How Often You Are Paid]] and
  [[Early Payments Count Once]], Phase 7 of the [[ROADMAP]].
- [x] Turn the home page part of [[Found In Search]] into [[Public Home Page]], Phase 8, built
  before Phase 7.
- [ ] Run `/shape` for [[Many People On One Site]] and [[Offline Use With Sync]]: both reverse a
  founding choice in [[SPECS]].
