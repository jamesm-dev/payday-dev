---
title: Deploy On Netlify
created: 2026-11-02
updated: 2026-11-02
tags: [epic, foundation]
status: planned
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

- [ ] The app builds with SvelteKit's Netlify adapter, and its pages, forms and downloads work in a production build (3 pts) ^tsk-eecfcf
- [ ] The deploy's build runs the migrations on Supabase, and a failed migration fails the deploy (2 pts) ^tsk-7975b9
- [ ] Push reminders, their job, keys and tables are gone, and the calendar file still holds every payday at the chosen time (3 pts) ^tsk-6f8ec9
- [ ] The Fly, Docker and Litestream files are gone, and the README and .env.example describe the Netlify and Supabase setup (2 pts) ^tsk-60846d
- [ ] The content security policy, private never-cached pages and the secure session cookie behave on Netlify as before (2 pts) ^tsk-13d3eb
- [ ] CI runs the checks on every push; deploys are started on purpose, to stay within the free credits (1 pt) ^tsk-b20bf4
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
- Phase: [[ROADMAP]]
