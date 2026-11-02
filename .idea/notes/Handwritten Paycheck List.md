---
title: Handwritten Paycheck List
created: 2026-11-01
updated: 2026-11-02
tags: [idea, paycheck-and-bills]
status: committed
theme: Paycheck And Bills Out Of Sync
horizon: now
impact: 4
effort: 3
confidence: 4
epic: [Paid Optional And Grouped Bills, Paycheck List Export]
---

# Handwritten Paycheck List

## Pitch

The owner already keeps, for each salary, a plain list: the pay, a rule, what it must pay in their
own groups, `*` on what is optional and `/` on what is paid, then three totals. Let the app produce
that exact list as a text file, a PDF or a Word document, instead of the owner retyping it.

## Why it might work

- It is a habit the owner already has, not one the app has to create, which is the binding constraint
  in [[2026-10-31 Brainstorm - Personal Budget App]].
- The app already knows every line on it: the pay and what each paycheck covers come from
  [[Paycheck Period Budgeting]]. Only three marks are missing: a group, optional, and paid.
- A file can be printed, pinned, or sent to someone without giving them the app.

## Why it might not

- The groups and their order are the owner's own; a group name per bill gets close but cannot
  reproduce an arbitrary hand-made order.
- "Paid" mid-period is something only the owner knows until the next check-in, so it needs a tap on
  the plan.

> [!warning] Riskiest assumption
> That the owner's sample is a stable format, not a one-off. The sample's own "Total (ALL)" reads
> 97200 where its lines add to 97560, so the export computes every total rather than trusting one.

## What would raise confidence

- [ ] The owner exports the next real paycheck and compares it line by line with their own list.

## Owner's sample

The format, as given on 2026-11-01 (amounts tab-separated from names). The names are fake and
the amounts scaled, so the owner's real list stays private:

```
30000   Salary
---------------------
*4500   Outreach
/3000   Mika/Ren
*3000   Crypto (BTC 1200, ETH 600)

21000   Lorna
/5400   Electric Bill
/1260   Fiber Bill
...
3000    Pamalengke
---------------------
85560  Total (without the *OPTIONAL)
66000  Total (current salary week)

97200  Total (ALL)
```

`*` is optional, `/` is already paid. "Without the *OPTIONAL" leaves out the `*` lines;
"current salary week" counts only the unmarked lines, what is still to pay.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- Builds on: [[Paycheck Period Budgeting]], [[Recurring Money Schedule]]
- Touches: [[Payday Check-In]], whose payments step can start from what was marked paid
- Session: [[2026-11-01 Brainstorm - Paycheck List Export]]
