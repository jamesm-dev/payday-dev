---
title: Bank Statement Import
created: 2026-10-31
updated: 2026-10-31
tags: [idea, tracking]
status: seed
theme: Tracking Without Willpower
horizon: next
impact: 4
effort: 3
confidence: 3
epic:
---

# Bank Statement Import

## Pitch

Your bank already records every card payment: import its exported statement each payday, and let
rules you write once — "anything from this merchant is groceries" — categorise it for you.

## Why it might work

- It flips the premise of "I can't track my expenses". The tracking is already done; what is missing
  is seeing it in one place.
- Rules compound. Every rule makes the next import faster, until most lines need no attention.
- No third-party aggregator and no stored bank login: you download a file you already have access to.

## Why it might not

- Export formats differ by bank, and each card and loan provider may be a separate file.
- It is still manual — download, then upload — and handling files on a phone is clumsy.

> [!warning] Riskiest assumption
> That your banks offer a usable export (CSV or similar) at all. Some only give PDF statements.

## What would raise confidence

- [ ] Download one month's statement from every bank and card you use, and note which formats you
  get.

## Related

- Theme: [[Tracking Without Willpower]]
- Pairs with: [[Payday Check-In]]
- Overlaps with: [[Five Second Quick Add]]
- Cheaper step towards: [[Live Bank Sync]]
- Session: [[2026-10-31 Brainstorm - Personal Budget App]]
