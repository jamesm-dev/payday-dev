---
title: Deploy On Netlify
created: 2026-11-02
updated: 2026-11-15
tags: [epic, foundation]
status: in-progress
theme: Paycheck And Bills Out Of Sync
phase: 6
sources: [Safe To Spend Number, Payday Check-In]
---

# Deploy On Netlify

## Outcome

The app builds for Netlify, runs its migrations on Supabase as it deploys, and costs nothing: no
always-on server, no push reminders, no Fly.io, Docker or Litestream. The payday reminder is the
calendar file.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] The app builds with SvelteKit's Netlify adapter, and its pages, forms and downloads work in a production build — verified by Netlify deploy 6af8ecd2 of c727e13 (adapter-netlify 7.0.1, Node 24, us-east-2), netlify-function.smoke.ts 6/6 against the built function, the browser tests' downloads on the same code, and the owner registering live through the sign-in form, 2026-11-15 (3 pts) ^tsk-eecfcf
- [x] The deploy's build runs the migrations on Supabase, and a failed migration fails the deploy — verified by deploy 6af8ecd2: `pnpm build && pnpm db:migrate` (netlify.toml) applied both migrations, 16 tables in `payday` owned by `payday_app`; scripts/migrate.ts exits 1 on any error, 2026-11-15 (2 pts) ^tsk-7975b9
- [x] Push reminders, their job, keys and tables are gone, and the calendar file still holds every payday at the chosen time — verified by d90fd7a and the reminders unit tests (ics) (3 pts) ^tsk-6f8ec9
- [x] The Fly, Docker and Litestream files are gone, and the README and .env.example describe the Netlify and Supabase setup — verified by d90fd7a, 9bb8766 (2 pts) ^tsk-60846d
- [x] The content security policy, private never-cached pages and the secure session cookie behave on Netlify as before — verified live on payday-birc.netlify.app (CSP with a nonce and frame-ancestors 'none', HSTS, nosniff, DENY, no-store on /signin, http redirected to https), netlify-function.smoke.ts, and a `__Host-` session cookie accepted by the owner's browser, which requires Secure, 2026-11-15 (2 pts) ^tsk-13d3eb
- [x] CI runs the checks on every push; deploys are started on purpose, to stay within the free credits — verified by .github/workflows/app.yml on every push and pull request, and production built only from the `deploy` branch, pushed by hand, 2026-11-15 (1 pt) ^tsk-b20bf4
- [ ] Deployed on Netlify with Supabase in the same region, reachable over HTTPS, for $0 — at release (2 pts) ^tsk-2fb9f1

## Approach

`@sveltejs/adapter-netlify` replaces adapter-node ([[ADR-0013 Netlify As The Host]]). The build runs
the migrations first ([[ADR-0015 Migrations Run At Deploy]]). Push goes, the calendar file stays
([[ADR-0016 Reminders By Calendar File Only]]). The functions' region and Supabase's are chosen
together at release.

## Dependencies

- Blocked by: [[Postgres On Supabase]], [[Sign-In State In The Database]]

> [!warning] Risks
> - 300 credits a month is a hard cap: a busy month of deploys could stop the site until the next.
>   Early warning: Netlify's usage page past half by mid-month.
> - Supabase pauses a free project after a quiet week. Early warning: the app's error page saying the
>   database cannot be reached; the fix is Restore in Supabase's dashboard.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]] · [[Payday Check-In]] (the reminder)
- Replaces: the Fly parts of [[Walking Skeleton Deployed]], and [[Payday Reminder]]
- Decided in: [[ADR-0013 Netlify As The Host]], [[ADR-0015 Migrations Run At Deploy]], [[ADR-0016 Reminders By Calendar File Only]], [[ADR-0019 Node 24 On Netlify And Tests On Adapter-Node]]
- Phase: [[ROADMAP]]
