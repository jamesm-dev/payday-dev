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

[[ADR-0010 Password Sign-In With Optional Passkeys]] limits how many password and recovery-code
checks run at once: at most 2 hashing and 16 waiting, on the one machine, so a flood of guesses from
many addresses is queued and refused rather than computed. On Netlify
([[ADR-0013 Netlify As The Host]]) every request may run in its own function instance, each with its
own copy of that in-memory queue, so the global ceiling disappears. The independent security review of
[[Sign-In State In The Database]] on 2026-11-15 found it: the total guess rate would then be bounded
only by the per-address limits times the attacker's addresses.

## Options

| Option | Pros | Cons |
|---|---|---|
| **A database-held queue: one lease per check, at most 18 at once, shared by every instance** | Restores ADR-0010's ceiling exactly; uses the same atomic counter as the other limits; leases expire, so a killed function cannot hold a place | One more statement per sign-in; keeps the trade-off SPECS already accepts: a flood from about 40 addresses can delay the owner's password sign-in, never lock it |
| Accept the per-instance queue only | Nothing to build | The global ceiling is gone; guesses scale with the attacker's addresses and Netlify's concurrency |

## Decision

A database-held queue: an `attempt_counter` scope `hash-queue`, key `all`, at most 18 leases
(2 + 16), taken atomically before a password or recovery-code check and released after it, with the
same lease expiry as the per-address slots. A refused lease answers with the existing "busy" response.
The in-memory per-instance gate stays as well: it still protects one instance's CPU. Decided by
`/setup` on 2026-11-15, following the security review; the owner may overrule it.

## Consequences

- ADR-0010's global ceiling holds on Netlify as it did on one machine.
- The known trade-off is unchanged: existing sessions and passkeys keep working during a flood, and a
  password sign-in waits at most for the queue, never a lockout.
- Revisit if Netlify's concurrency or the free database's connection limit makes the queue itself
  the bottleneck in normal use.

## Related

- Builds on: [[ADR-0010 Password Sign-In With Optional Passkeys]], [[ADR-0013 Netlify As The Host]]
- Epic: [[Sign-In State In The Database]]
- Phase: [[ROADMAP]]
