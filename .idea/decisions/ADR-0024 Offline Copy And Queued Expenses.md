---
title: ADR-0024 Offline Copy And Queued Expenses
created: 2026-11-15
updated: 2026-11-15
tags: [adr, decision]
status: accepted
decision: Offline shows the last copy and queues expenses
supersedes:
superseded_by:
---

# ADR-0024 Offline Copy And Queued Expenses

## Context

The owner asked that people "can also use things even offline" ([[Offline Use With Sync]]). Today
every screen is drawn by the server and every change is a form posted to it; with no signal only
the app shell and an offline page open ([[Installable App Shell]]). The service worker never caches
a page with money on it, because a stale number is worse than an honest "offline".

## Options

| Option | Pros | Cons |
|---|---|---|
| See only | Simplest: a copy of the last number and plan | Spending cannot be logged where it happens |
| See it and log spending | The most useful part; expenses only add, so two phones never conflict | A small store on the phone, a queue, and clearing it on sign-out |
| Everything offline | Every screen works | A new architecture; edits from two phones must be merged |

## Decision

**See it and log spending**; the owner's choice, 2026-11-15.

- The installed app keeps a copy of the last number and plan on the phone, shown with no signal
  as "Offline: from <day and time>", never as newer than it is.
- An expense logged offline is queued on the phone with an id made there, lowers the shown number
  at once marked "Not sent yet", and is saved on the site exactly once when the signal returns.
- Every other change needs a connection and says so in plain words.
- The copy and the queue belong to one person, and are removed on sign-out or when another person
  signs in on the phone.

## Consequences

- The service worker's rule stays: no server-rendered page is cached. The copy is a separate store
  the app owns, written from the data it already shows.
- The first task of [[Offline Number And Expenses]] is a spike on the store and its cost to the
  home screen's 60 KB JavaScript budget.
- Revisit for offline payday updates or bill edits only if people ask for them.
