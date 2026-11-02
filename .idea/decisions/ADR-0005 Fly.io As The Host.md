---
title: ADR-0005 Fly.io As The Host
created: 2026-10-31
updated: 2026-11-02
tags: [adr, decision]
status: superseded
decision: Fly.io, one always-on machine
supersedes:
superseded_by: ADR-0013 Netlify As The Host
---

# ADR-0005 Fly.io As The Host

> [!warning] Superseded 2026-11-02 by [[ADR-0013 Netlify As The Host]]
> The owner moved the app to a free Netlify and Supabase setup. Kept for the record.

## Context

SQLite needs a persistent disk, the payday reminder needs a process that is running on payday, and
the budget is a few dollars a month. Prices below were not checked; they are verified at setup.

## Options

| Option | Pros | Cons |
|---|---|---|
| Fly.io, one machine with a volume | Persistent volume; HTTPS and custom domain handled; Docker deploys from CI | A Dockerfile to own; one region; machines can auto-stop when idle unless configured not to |
| A small VPS | Cheapest; full control | OS patching, TLS, firewall and restarts are this project's job |
| Vercel or Netlify | Zero-config deploys | No persistent disk, which would force a hosted database |

## Decision

Fly.io: one small machine with a volume, **auto-stop turned off** so the reminder job runs on payday,
deployed from CI. Proposed by Claude during `/shape`; accepted when `SPECS.md` was signed off, on 2026-10-31.

## Consequences

- Deploys cause a few seconds of downtime on a single machine. Acceptable for one user.
- If pricing at setup exceeds a few dollars a month, or volumes behave unexpectedly, fall back to a
  small VPS and supersede this ADR.
