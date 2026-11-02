---
title: ADR-0013 Netlify As The Host
created: 2026-11-02
updated: 2026-11-02
tags: [adr, decision]
status: accepted
decision: Netlify free plan, serverless
supersedes: ADR-0005 Fly.io As The Host
superseded_by:
---

# ADR-0013 Netlify As The Host

## Context

[[ADR-0005 Fly.io As The Host]] chose one always-on Fly.io machine, for SQLite's disk and the
reminder job. On 2026-11-02 the owner asked for the app to be free and hosted on Netlify, accepting
that reminders and the database would change to make that possible. Fly.io no longer has a free
tier for new accounts: a trial of up to 2 hours of runtime or 7 days, then about $2.34 a month for
the smallest always-on machine and a 1 GB volume (Fly's pricing page, checked 2026-11-02).

## Options

| Option | Pros | Cons |
|---|---|---|
| Netlify free plan, the app as serverless functions | $0; deploys and HTTPS handled; the owner's choice | No disk and no always-on process: the database moves out ([[ADR-0014 Supabase Postgres As The Database]]), push reminders go ([[ADR-0016 Reminders By Calendar File Only]]), and in-memory state must move to the database; 300 credits a month, a hard cap, with 15 per production deploy |
| Fly.io, as decided | Built for it already | About $2.34 a month; the owner wants $0 |
| Oracle Cloud or Google Cloud free VM | $0 and always on, so nothing changes in the app | A server to run: OS updates, TLS, a domain; Oracle may reclaim an idle free VM |

## Decision

Netlify's free plan, with SvelteKit's Netlify adapter (`@sveltejs/adapter-netlify` 7.0.1, which
supports SvelteKit 3, checked on npm 2026-11-02). The owner's choice, 2026-11-02.

## Consequences

- Each request may start a fresh function, so nothing may live in memory between requests: the
  sign-in attempt limits, the failure brake, the 5-minute confirmation and the one-time slots move
  into the database. That is a security change and gets its own review.
- No always-on process: the payday reminder job ends ([[ADR-0016 Reminders By Calendar File Only]]).
- Deploys are counted. At 15 credits each, about 20 a month fit if nothing else is used; the app's own
  traffic, one person's, costs a few credits. Deploy on purpose, not on every push.
- The functions and the database must sit in the same region, or every query crosses an ocean.
- Revisit if the 300 credits run out in a normal month, or if the app needs anything always on again.
