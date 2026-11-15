---
title: Offline Use With Sync
created: 2026-11-15
updated: 2026-11-15
tags: [idea, many-people]
status: committed
theme: Many People And Any Device
horizon: next
impact: 4
effort: 5
confidence: 2
epic: [Offline Number And Expenses]
---

# Offline Use With Sync

## Pitch

Payday keeps working with no signal: the number, the plan, logging an expense, even a check-in.
What was done offline is saved on the phone and sent to the site when the signal returns, so every
device ends up with the same budget.

The owner's words, 2026-11-15: "make sure they can also use things even offline".

## Why it might work

- The app shell is already cached by the service worker, and an offline page exists
  ([[Installable App Shell]]). A phone often loses signal exactly where money is spent.
- The domain engine is pure TypeScript with no server dependencies
  (`app/src/lib/domain/`), so the number can be computed on the phone from a local copy.

## Why it might not

- Today every screen is drawn by the server and every change is a form posted to it; nothing
  works offline beyond the shell. Offline changes need a local store on the device, a queue of
  changes, and a rule for two devices that changed the same thing while apart. That is a new
  architecture, not a feature.
- A number computed from a stale local copy can be confidently wrong, the thing
  [[Safe To Spend Number]] must never be.
- Data kept on the phone must be protected when the phone is shared or lost, and cleared on sign
  out.

> [!warning] Riskiest assumption
> That offline edits from two devices rarely conflict, and a simple rule (the latest change wins,
> or offline only for adding an expense) is good enough.

## What would raise confidence

- [x] A `/shape` decision on what must work offline: reading only, adding an expense, or
  everything. Each step up costs much more than the one before. Decided 2026-11-15: see the last
  number and plan, and log expenses ([[ADR-0024 Offline Copy And Queued Expenses]]). Phase 11.

## Related

- Theme: [[Many People And Any Device]]
- Builds on: [[Installable App Shell]], [[Five Second Quick Add]]
- Together with: [[Many People On One Site]]
- Session: [[2026-11-15 Brainstorm - Pay Rhythm And Early Bills]]
