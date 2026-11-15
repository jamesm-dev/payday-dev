---
title: ADR-0020 Early Payments Count Until The Next Balance
created: 2026-11-15
updated: 2026-11-15
tags: [adr, decision]
status: accepted
decision: Early-paid bills leave the number at once
supersedes:
superseded_by:
---

# ADR-0020 Early Payments Count Until The Next Balance

## Context

SPECS decision 13 ([[ADR-0009 Conservative Safe To Spend Rules]]) keeps a bill marked paid held back
by the safe-to-spend number: the mark only labels the plan and the export, because the balance does
not show the payment until the next check-in. The owner asked on 2026-11-15 to pay upcoming bills
early ([[Pay A Bill Early]]). Under decision 13 an early payment leaves the number too high now, and
its own paycheck keeps reserving money that is already gone.

## Options

| Option | Pros | Cons |
|---|---|---|
| Keep the mark a label | No change to the engine; conservative | The number is wrong in two paychecks until a check-in |
| Count it like a logged expense: off at once, until a later balance takes over; no longer reserved in its own paycheck | The number is right the moment the owner pays; one rule the app already uses ([[ADR-0012 Logged Expenses Count Until The Next Balance]]) | A mark that is not a real payment makes the number too high; a mark made late can double count |

## Decision

Count it like a logged expense. The owner's choice, 2026-11-15, asked to pick between "take it off
now" and "only a label".

- A paid mark made **before the occurrence's due date** is an early payment, dated by
  `paid_mark.marked_at` in the owner's timezone.
- Made after the current balance's date, it lowers the number at once. Made on or before it, the
  balance already holds it.
- Either way the occurrence is no longer reserved in its own paycheck.
- Taking the mark off, or a check-in answering "did not go out", reserves it again.
- A mark made on or after the due date keeps decision 13: a label, held back until a check-in.

## Consequences

- SPECS decision 13 now applies only to marks made on or after the due date.
- The number trusts the owner's mark. The check-in of that paycheck still asks about every payment
  that was not paid early, and a check-in's answer outranks a mark.
- An early loan payment changes the loan's expected balance, so [[Loan Balances At Check-In]] expects
  the lower figure.
- Revisit if check-ins show spending negative by about one bill: marks made after the money left.

> [!note] Amended 2026-11-15, while Phase 7 was built
> - **The same day as the balance.** The day alone does not decide it. As for a logged expense
>   ([[ADR-0012 Logged Expenses Count Until The Next Balance]]), a mark made on the balance's own day
>   after the balance was read also comes off the number; with no read time it comes off, erring low.
>   A payday update does not subtract a mark made after its own balance was read: the next one does.
> - **For a loan**, a same-day early payment with no read time counts as already in the loan's
>   balance, so a debt is never shown lower than it is.
> - **A skip is refused** while the payment is marked paid early: the money has left, and a skip
>   would put it back in the number. Taking the mark off comes first.
> - **Marks made before Phase 7** that were made before their due date count as early payments, the
>   owner's choice; the live database had none.
