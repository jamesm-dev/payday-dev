---
title: ADR-0015 Migrations Run At Deploy
created: 2026-11-02
updated: 2026-11-02
tags: [adr, decision]
status: accepted
decision: migrations run in the build
supersedes: ADR-0008 Migrations Run At Server Start
superseded_by:
---

# ADR-0015 Migrations Run At Deploy

## Context

[[ADR-0008 Migrations Run At Server Start]] migrated the SQLite file when the one server started,
because Fly's release step ran without the volume. On Netlify ([[ADR-0013 Netlify As The Host]]) there
is no server start: many short-lived functions may start at once, and none should migrate on a
request.

## Options

| Option | Pros | Cons |
|---|---|---|
| Migrate in the deploy's build step, before the new functions go live | Runs once per deploy; a failed migration fails the deploy, so the old version stays up | The build needs the database password |
| Migrate on the first request | No build secret | Concurrent first requests race; a request pays for it |
| Migrate by hand | Nothing automatic can go wrong | Easy to forget; the code and the schema drift |

## Decision

The deploy's build step runs the checked-in SQL migrations against Supabase before the site is
published; a failed migration fails the deploy. Locally and in tests, the in-process database is
migrated when it is opened, as before. Decided by `/shape` on 2026-11-02, because the move to
Netlify left ADR-0008 with nothing to run on.

## Consequences

- The database password is a Netlify build and function secret, never in the repository.
- Migrations must stay backward compatible for the moment between the build and the switch-over:
  add, then use, then remove, across two deploys.
- `drizzle-kit push` stays forbidden; only checked-in migrations run.
