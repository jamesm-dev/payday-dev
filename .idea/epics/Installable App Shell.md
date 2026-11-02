---
title: Installable App Shell
created: 2026-10-31
updated: 2026-10-31
tags: [epic, paycheck-and-bills]
status: in-progress
theme: Paycheck And Bills Out Of Sync
phase: 0
sources: [Safe To Spend Number]
---

# Installable App Shell

## Outcome

The app installs to the home screen of an iPhone and an Android phone, opens full-screen, still opens
with no signal, and its speed against the performance budget is known.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] A web app manifest and icons make the app installable, and it opens full-screen from the home screen on iPhone and Android (3 pts) ^tsk-3924c2
- [x] A service worker caches the app shell, so the installed app opens with no network and says it is offline — verified by offline.e2e.ts on WebKit and Chromium, in the browser rather than installed (3 pts) ^tsk-7ee732
- [x] Colour, type and spacing tokens live as CSS custom properties in one file, with light and dark themes whose text meets WCAG AA contrast — verified by tokens.test.ts, 12 text pairs at 4.5:1 or more (2 pts) ^tsk-de00c5
- [ ] The performance budget is measured — JavaScript per route from the production build, cold and warm opens on both phones over 4G — and recorded in `SPECS.md` (3 pts) ^tsk-79c0d4

## Approach

Use SvelteKit's built-in service worker rather than a plugin: one cached shell does not need Workbox.
Measure opens by screen recording from tap to number, so someone else can repeat it.

## Dependencies

- Blocked by: [[Walking Skeleton Deployed]]
- Unblocks: [[Payday Reminder]], which needs the installed app for push on iPhone

> [!warning] Risks
> - iPhone and Android differ in what an installed web app can do. Test on both from the first
>   install, never on one and assume the other.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]] — a number glanced at on the phone
- Decision: [[ADR-0002 Installable Web App Over Native]]
- Phase: [[ROADMAP]]
