---
title: ADR-0003 SvelteKit With TypeScript
created: 2026-10-31
updated: 2026-10-31
tags: [adr, decision]
status: accepted
decision: SvelteKit and TypeScript
supersedes:
superseded_by:
---

# ADR-0003 SvelteKit With TypeScript

## Context

One codebase must serve the laptop browser and the installed phone app, with a server for sign-in and
the database. The most frequent use is a glance at [[Safe To Spend Number]] on mobile data, so the
download size matters more than ecosystem breadth.

## Options

| Option | Pros | Cons |
|---|---|---|
| SvelteKit with TypeScript | Small client download; server routes and progressive forms in one project | Smaller ecosystem than React; Svelte 5 is newer, with less community material |
| Next.js with TypeScript | Largest ecosystem | Heavier JavaScript on the phone; server and client components to learn |

## Decision

SvelteKit with TypeScript, scaffolded with the official `sv` tool. Chosen by the owner during
`/shape`.

## Consequences

- The home screen has a 60 KB JavaScript budget in [[SPECS]] that this choice makes realistic.
- Fewer ready-made components; forms and controls are built by hand.
- Revisit only if a needed capability exists in React and nowhere else — none is known.
