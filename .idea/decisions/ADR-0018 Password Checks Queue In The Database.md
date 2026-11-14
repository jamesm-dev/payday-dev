---
title: ADR-0018 Password Checks Queue In The Database
created: 2026-11-15
updated: 2026-11-15
tags: [adr, decision, security]
status: accepted
decision: a global hash queue held in the database
supersedes:
superseded_by:
---

# ADR-0018 Password Checks Queue In The Database

## Context

[[ADR-0010 Password Sign-In With Optional Passkeys]] limits how many password checks run at once:
at most 2 scrypt hashes and 16 waiting, on the one machine, so a flood of guesses from many addresses
is queued and refused rather than computed. Recovery codes are a SHA-256 lookup, not a hash, and
were never in that queue. On Netlify
([[ADR-0013 Netlify As The Host]]) every request may run in its own function instance, each with its
own copy of that in-memory queue, so the global ceiling disappears. The independent security review of
[[Sign-In State In The Database]] on 2026-11-15 found it: the total guess rate would then be bounded
only by the per-address limits times the attacker's addresses.

## Options

| Option | Pros | Cons |
|---|---|---|
| **A database-held queue: one lease per check, at most 18 at once, shared by every instance** | Restores a global ceiling of 18; uses the same atomic counter as the other limits; leases expire, so a killed function cannot hold a place | One more statement per sign-in; a place is held through the failure brake's wait (up to 3 s) as well as the hash, so it fills with fewer addresses than the old queue; while it is full, a password sign-in is refused with "busy" and can be tried again |
| Accept the per-instance queue only | Nothing to build | The global ceiling is gone; guesses scale with the attacker's addresses and Netlify's concurrency |

## Decision

A database-held queue: an `attempt_counter` scope `hash-queue`, key `all`, at most 18 leases
(2 + 16), taken atomically before a password check and released after it, with the same lease expiry
as the per-address slots. A refused lease answers with the existing "busy" response. Recovery-code
sign-in does not take a place, so a password flood never closes the way back in for an owner who has
forgotten the password; it keeps the per-address limit, slots and brake.
The in-memory per-instance gate stays as well: it still protects one instance's CPU. Decided by
`/setup` on 2026-11-15, following the security review; the owner may overrule it.

## Consequences

- ADR-0010's global ceiling holds on Netlify as it did on one machine.
- The known trade-off is unchanged: while the queue is full, a password sign-in is refused with
  "busy" and can be tried again; existing sessions, passkeys and recovery codes keep working.
- Revisit if Netlify's concurrency or the free database's connection limit makes the queue itself
  the bottleneck in normal use.

## Related

- Builds on: [[ADR-0010 Password Sign-In With Optional Passkeys]], [[ADR-0013 Netlify As The Host]]
- Epic: [[Sign-In State In The Database]]
- Phase: [[ROADMAP]]
