---
title: ADR-0007 Money As Integer Minor Units
created: 2026-10-31
updated: 2026-10-31
tags: [adr, decision]
status: accepted
decision: integer minor units everywhere
supersedes:
superseded_by:
---

# ADR-0007 Money As Integer Minor Units

## Context

Every screen is money arithmetic: set-asides split across paychecks, interest per period, a balance
compared to an expected one. Floating-point amounts drift by fractions of a cent, and a stored format
is hard to change once real data exists.

## Options

| Option | Pros | Cons |
|---|---|---|
| Integers in minor units, rates in basis points | Exact; fast; native to SQLite | Formatting and rounding rules must be explicit |
| A decimal library | Exact; reads naturally | A dependency in every calculation; slower |
| Floating point | Nothing to build | Drift; wrong totals in tests |

## Decision

Every amount is an integer in minor units behind a branded TypeScript type, and every rate is an
integer in basis points. Rounding happens once per period, in one named function. Proposed by Claude
during `/shape`; accepted when `SPECS.md` was signed off, on 2026-10-31.

## Consequences

- Interest projections in [[Debt Free Date Projection]] can match a reference calculation to one
  minor unit per period — a criterion only an exact format can meet.
- A second currency would need a currency per amount; out of scope for v1.
