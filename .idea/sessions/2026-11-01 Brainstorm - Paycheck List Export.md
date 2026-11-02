---
title: 2026-11-01 Brainstorm - Paycheck List Export
created: 2026-11-01
updated: 2026-11-01
tags: [session, brainstorm]
status: done
---

# 2026-11-01 Brainstorm - Paycheck List Export

A one-idea capture for `/epic`, not a full divergence session.

## The ask

> Add a feature to export data into a notepad, pdf, or docx with this format — followed by the
> owner's own salary list (kept in [[Handwritten Paycheck List]]).

## Intent ledger

- **Real goal:** keep the list the owner already writes by hand each salary, without retyping it,
  and with totals they can trust.
- **Success in 6 months:** every paycheck's list comes out of the app, and the owner no longer keeps
  a separate one.
- **Binding constraint:** the format is the owner's, exactly; the app adapts to it, not the reverse.
- **Explicitly not:** spending categories or per-expense logging (still a [[SPECS]] non-goal), and
  spreadsheets or bank-import formats.
- **Corrections from the user:** none to the ledger.

## Ideas produced

### [[Paycheck And Bills Out Of Sync]]

- [[Handwritten Paycheck List]] — the paycheck plan, exported in the owner's own list format.

## Decisions

The owner's answers, 2026-11-01:

- `/` means **already paid**, marked from the plan; a check-in then starts with it ticked.
- Groups are **named by the owner**, one optional group name per bill.
- A `*` optional bill is **still held back** by the safe-to-spend number; the mark only shows in the
  plan and the export.

## Next steps

- [x] Turn it into epics with `/epic`: [[Paid Optional And Grouped Bills]] and
  [[Paycheck List Export]], Phase 4 of the [[ROADMAP]].
