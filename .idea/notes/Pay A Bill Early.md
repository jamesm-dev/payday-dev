---
title: Pay A Bill Early
created: 2026-11-15
updated: 2026-11-15
tags: [idea, paycheck-and-bills]
status: committed
theme: Paycheck And Bills Out Of Sync
horizon: now
impact: 4
effort: 3
confidence: 3
epic: [Early Payments Count Once]
---

# Pay A Bill Early

## Pitch

When the owner pays a bill that is due in a later paycheck, they say so in the app: the money comes
off the safe-to-spend number now, because it has left the account, and the later paycheck stops
holding it back.

The owner's words, 2026-11-15: "allow users to pay early for the upcoming bills and things". Asked
what Payday should do with an early payment, they chose **take it off now** over a label only.

## Why it might work

- People pay early when they have the money: a bill paid the day pay lands cannot be forgotten. The
  app already lets a bill in any of the next six paychecks be marked paid
  ([[Paid Optional And Grouped Bills]]), but the mark is only a label, so the number is wrong in
  both paychecks until the next check-in: too high now, and the later paycheck still reserves money
  that is gone.
- It has the same shape as a logged expense ([[ADR-0012 Logged Expenses Count Until The Next Balance]]):
  money that left after the last balance lowers the number at once, until a balance taken after it
  takes over. The later paycheck then treats the occurrence as paid, the way a check-in's "it went
  out" does.

## Why it might not

- It reverses SPECS decision 13 for early payments: today a paid mark never changes the number
  ([[ADR-0009 Conservative Safe To Spend Rules]]). The conservative rule existed because a mark is
  a claim the balance has not confirmed yet; an early payment the owner forgets to make leaves the
  later paycheck short.
- Counting it exactly once is subtle. Paid before the balance was taken, it must not come off
  again; paid after, it must. Unmarking must put the reservation back.
- A loan payment paid early also changes the loan's balance and its projection.

> [!warning] Riskiest assumption
> That an early payment is recorded on the day it is paid. If the owner marks it days later, after
> entering a balance that already lacks the money, the date the payment carries decides whether it
> is counted once or twice.

## What would raise confidence

- [ ] Fixture tests by hand for a payment before and after a fresh balance, for unmarking, and for
  an early loan payment, before any UI.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- Builds on: [[Handwritten Paycheck List]] (the paid mark), [[Safe To Spend Number]]
- Tension with: [[ADR-0009 Conservative Safe To Spend Rules]]
- Session: [[2026-11-15 Brainstorm - Pay Rhythm And Early Bills]]
