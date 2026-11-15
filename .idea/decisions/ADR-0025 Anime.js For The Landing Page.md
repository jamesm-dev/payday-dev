---
title: ADR-0025 Anime.js For The Landing Page
created: 2026-11-15
updated: 2026-11-15
tags: [adr, decision]
status: accepted
decision: anime.js animates the signed-out product page only
supersedes:
superseded_by:
---

# ADR-0025 Anime.js For The Landing Page

## Context

The owner asked, 2026-11-15, that the product page "is interactive, use anime.js". Payday has no
animation library: its styling is scoped CSS and tokens, and the signed-in home screen ships at most
60 KB of JavaScript, gzipped, with about 5 KB left ([[SPECS]] performance budget). The product page
lives in the same `/` route as the home screen ([[Public Home Page]]). The CSP allows no inline
style attributes.

## Options

| Option | Pros | Cons |
|---|---|---|
| CSS transitions and the browser's Web Animations API | No dependency, nothing to download | Timelines, staggers and number counting written by hand |
| anime.js, loaded only on the signed-out page | The owner's choice; timelines, staggers and scroll triggers ready-made | A dependency to keep up to date; its weight on the product page |
| A larger motion library | More features | More weight, no demand for them |

## Decision

**anime.js**, the owner's choice, for the signed-out product page only.

- It is imported only when the signed-out page runs in the browser (a dynamic import), never in
  the signed-in home screen's bundle, so that budget does not move.
- The page reads in full with no JavaScript, and nothing moves for people who ask the system for
  reduced motion.
- Animation sets styles through the DOM's style properties, which the strict CSP allows; no
  `style="…"` is written into the page.
- The version is pinned from the registry at `/setup`, never from memory.

## Consequences

- A new dependency, kept current by `/maintain`.
- The product page's own JavaScript is measured in its tests, beside the home screen's budget.
- Revisit if the library's weight makes the page's first screen slower than 2 seconds on 4G.
