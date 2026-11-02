---
title: ADR-0001 Build Rather Than Adopt
created: 2026-10-31
updated: 2026-10-31
tags: [adr, decision]
status: accepted
decision: build the app, not adopt one
supersedes:
superseded_by:
---

# ADR-0001 Build Rather Than Adopt

## Context

The brainstorm raised [[Adopt An Existing Budget App]] as the premise-questioning option: use an
existing app for a month and build only the gap. Neither of the named apps was checked for bi-weekly
pay or for several kinds of loan.

## Options

| Option | Pros | Cons |
|---|---|---|
| Build | Fits paycheck-by-paycheck budgeting and all four loan kinds exactly; the owner controls the data | Five to six weeks before it is useful |
| Adopt an existing app | Useful this week | Unverified fit for bi-weekly pay and mixed loans; subscription or self-hosting |

## Decision

Build. Inferred from the owner asking to *create* the app and running `/shape` without taking up the
adopt option; recorded during `/shape`, and accepted when `SPECS.md` was signed off, on 2026-10-31.

## Consequences

- Five to six weeks of building before the app helps. The [[ROADMAP]] softens this by suggesting the
  first two payday check-ins be done by hand while it is built.
- [[Adopt An Existing Budget App]] is parked, not deleted. Revisit if the build stalls before Phase 2.
