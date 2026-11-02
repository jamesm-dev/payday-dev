---
title: Walking Skeleton Deployed
created: 2026-10-31
updated: 2026-11-02
tags: [epic, paycheck-and-bills]
status: in-progress
theme: Paycheck And Bills Out Of Sync
phase: 0
sources: [Safe To Spend Number]
---

# Walking Skeleton Deployed

## Outcome

The thinnest real path exists: a SvelteKit app reads one number from SQLite and shows it, tests pass
in CI, and every push to main deploys it over HTTPS.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] A SvelteKit and TypeScript app is scaffolded in `app/` with the official `sv` scaffolder, versions pinned by the lockfile — verified: `sv` 1.1.1 scaffold, SvelteKit 3.1.1 pinned by `app/pnpm-lock.yaml` (2 pts) ^tsk-1c63df
- [x] One drizzle-kit migration creates one table, and the home route reads one row from SQLite and renders it — verified by open.test.ts, home.e2e.ts (3 pts) ^tsk-213dcd
- [x] One Vitest unit test and one Playwright test pass locally — verified: 30 Vitest and 23 Playwright tests pass at iPhone, Android and laptop sizes (2 pts) ^tsk-2ffc7b
- [x] An unexpected server error shows a plain error page, and is logged with a request id — verified by errors.test.ts, errors.e2e.ts (2 pts) ^tsk-ae10fb
- [ ] CI runs install, lint, typecheck, unit, e2e and build on every push, and is green (3 pts) ^tsk-32fcb1
- [ ] The built app runs on the host with its database: amended 2026-11-02 from "a Docker image with the database file on a mounted volume", now Netlify functions on Supabase ([[ADR-0013 Netlify As The Host]]) (3 pts) ^tsk-0f628f
- [ ] A deploy started on purpose publishes the app to the host, reachable over HTTPS: amended 2026-11-02 from "a push to main deploys the image", to stay within Netlify's free credits (3 pts) ^tsk-97392e
- [x] `app/README.md` takes a new contributor from clone to running in under 15 minutes — verified by a walk-through from a clean copy of `app/`, 14 s with a warm package cache; not yet timed by a person (1 pt) ^tsk-56bd3d

## Approach

Scaffold with the ecosystem's own tool and change as little as possible. The one table holds a
fictional figure, standing in for the safe-to-spend number the skeleton exists to carry. The Docker
image and the deploy are proven now, while a wrong guess about the host costs an afternoon.

## Dependencies

- Blocked by: nothing
- Unblocks: [[Installable App Shell]], [[Backups And Restore Drill]]

> [!warning] Risks
> - The native better-sqlite3 module fails to build in the image. Catch it on the first image build,
>   not the first deploy.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]]
- Phase: [[ROADMAP]]
