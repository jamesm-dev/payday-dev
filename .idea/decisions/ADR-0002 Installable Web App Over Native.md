---
title: ADR-0002 Installable Web App Over Native
created: 2026-10-31
updated: 2026-10-31
tags: [adr, decision]
status: accepted
decision: one installable web app
supersedes:
superseded_by:
---

# ADR-0002 Installable Web App Over Native

## Context

The app must work on the web and on the owner's iPhone and Android phone. [[Payday Check-In]] needs a
payday reminder, and [[Safe To Spend Number]] needs to be one tap from the home screen.

## Options

| Option | Pros | Cons |
|---|---|---|
| Installable web app | One codebase; no app store; installs with an icon; push on both phones | iPhone push works only once installed to the home screen; no access to bank SMS or notifications |
| Cross-platform native plus web | Full phone features | App-store builds, signing, two release targets for one user |
| Separate native apps | Best phone integration | Three codebases |

## Decision

An installable web app — a manifest, a service worker and Web Push. Chosen by the owner during
`/shape`.

## Consequences

- One deploy updates every device.
- Reading bank notifications or SMS is impossible, which also rules out one route for
  [[AI Capture From Screenshots]] — screenshots and pasting still work.
- Revisit if iPhone push proves unreliable for the payday reminder in Phase 2.
