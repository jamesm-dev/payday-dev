---
title: ADR-0029 Offline Copy In Local Storage
created: 2026-11-16
updated: 2026-11-16
tags: [adr, decision]
status: accepted
decision: Keep the offline copy and the expense queue in the phone's local storage, send queued expenses to the home screen's own form action with an id made on the phone, and remember every id received
supersedes:
superseded_by:
---

# ADR-0029 Offline Copy In Local Storage

The spike that opens [[Offline Number And Expenses]] (TSK-03858e). It settles how
[[ADR-0024 Offline Copy And Queued Expenses]] is built and changes none of what it decided.

## Context

Every page is drawn by the server. With no signal, the service worker answers any page with the
prerendered offline page, and never with a cached page that holds money
([[Installable App Shell]]). Most pages ship no script at all (`csr = false`). The home screen
does, inside a 60 KB budget. Web pages on iPhones get no Background Sync, so nothing can send
while the app is closed.

## Options

| Question | Chosen | Rejected, and why |
|---|---|---|
| Where the copy and queue live | `localStorage`, two keys | IndexedDB: asynchronous and more code for a few kilobytes. The Cache API: the service worker would be its only gain, and it never needs to read the copy |
| Who writes the copy | The home screen's script, from the data it already shows | Caching the page: the rule stays that no page with money is cached. A second request for the copy: more server work for data already on the screen |
| Who shows it offline | The prerendered offline page, which reads the copy once its script starts | A separate static page: it would sit outside the build, the type checks and the security policy |
| Where queued expenses go | The home screen's existing `?/expense` action, as a JSON action request with a `clientId` field | A new endpoint: a second copy of the same checks, limits and lock |
| How a repeat is ignored | A new table `expense_receipt (owner_id, client_id)`, written in the same transaction as the expense | A column on `expense`: a deleted expense would come back if an old send arrived after the delete |
| When the queue is sent | When the home screen opens, and when the phone comes back online while it is open | Background Sync: iPhones do not have it |

## Decision

**The copy.** Each time the home screen shows a number, its script writes one record to local
storage. It holds the screen's own words for the number, the kept-aside list (this paycheck's
plan), the set-asides and the logged expenses, plus what the offline page needs to adjust it:
the number in minor units, the currency, the balance's day, the next payday, the owner's time
zone, the owner's id, and when the server worked it out. A home screen with no number removes it.
The longer plan (`/plan`) stays online only.

**Offline.** The offline page, at whatever address was asked for, shows "Offline: from <day and
time>" and the copy. It also shows an expense form that checks the amount, note and day by the
same rules as the server: those rules move from `lib/server` into a shared module. The number
shown is the copy's, minus each queued expense dated on or after the balance's day
([[ADR-0012 Logged Expenses Count Until The Next Balance]]). Each one is listed as "Not sent yet".
Once the copy's next payday has come, the number is labelled out of date. Any other address says
"This page needs a connection". When a form is sent while the browser knows it has no network,
the plain script on every page stops it and opens the offline page, which says nothing was saved,
instead of the browser's error. The service worker still never touches a form: answering a form
post from it crashed WebKit in the browser tests, and iPhones run WebKit.

**Sending.** The home screen's expense form goes through `fetch` once its script runs. With no
script it posts the old way. Each expense gets an id made on the phone (`crypto.randomUUID`).

- If the network fails, the expense joins the queue and the number drops at once.
- On every home screen load, and on the browser's `online` event, each queued expense is sent to
  `?/expense` with its id.
- The server checks it exactly as a typed one. It stores the id in `expense_receipt` in the same
  transaction, and answers a repeat as if it were new. An expense the server refuses stays on the
  phone, with the server's reason and a Remove button.
- A sent expense stays queued, marked sent, until the next data from the server, which already
  holds it. Until then it still comes off an older copy's number. The number can read low for a
  moment. It never reads high.
- A queued expense's time logged is when the server received it. An expense on the balance's day
  therefore counts, so the number errs low.

**Belonging to one person.**

- The copy and the queue carry the owner's id.
- A home screen for a different owner removes both. That person cannot send the other's expenses,
  and must not see them.
- Any page that runs a script for someone signed out removes the copy. The root layout learns
  `signedIn` for this.
- Signed out, the queue stays for its owner, and the sign-in page asks: "This phone has N expenses
  that were not sent yet." The person can remove them, or sign in again to send them.
- Deleting the account removes its receipts with everything else.

**The cost.** The home screen gains SvelteKit's `enhance`, the store and the sender. The offline
page carries the shared checks and the number component, outside the home budget. The home
screen's total is measured by `tests/budget.e2e.ts`. It must stay at or under 60 KB.

## Consequences

- A copy can outlive a session that ended elsewhere, if the phone never comes online again: "sign
  out everywhere" cannot reach a phone with no signal. It is removed the next time any page runs
  for someone signed out. The same holds when a phone's session simply expires.
- Safari drops script storage for a site unused for seven days, in a browser tab but not in an
  installed app. The offline page then says plainly that it has nothing to show.
- `expense_receipt` grows by one small row per expense sent from a script. It holds no money and no
  note, and goes when the account goes.
- The checks for an expense now live in a shared module, imported by both the server and the
  offline page. The server still checks everything again, so a changed client proves nothing.

## Related

- Implements: [[ADR-0024 Offline Copy And Queued Expenses]]
- Epic: [[Offline Number And Expenses]]
- Counting rule: [[ADR-0012 Logged Expenses Count Until The Next Balance]]
