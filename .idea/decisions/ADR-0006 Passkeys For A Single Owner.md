---
title: ADR-0006 Passkeys For A Single Owner
created: 2026-10-31
updated: 2026-11-01
tags: [adr, decision]
status: superseded
decision: passkeys, one owner, recovery codes
supersedes:
superseded_by: ADR-0010 Password Sign-In With Optional Passkeys
---

# ADR-0006 Passkeys For A Single Owner

> [!warning] Superseded on 2026-11-01 by [[ADR-0010 Password Sign-In With Optional Passkeys]]: a password
> is now primary, and passkeys are optional per device. Kept as the record of the original choice.

## Context

The app holds salary, balances and every loan. It is reachable on the public internet so the phone
can use it. The phone glance at [[Safe To Spend Number]] has to stay fast, so sign-in cannot be a
chore.

## Options

| Option | Pros | Cons |
|---|---|---|
| Passkeys with recovery codes | Phishing-resistant; Face ID or fingerprint on both phones; no email provider | More to build; bound to the domain; Apple and Google passkeys do not sync with each other |
| Password plus TOTP | Familiar; simple to build | Phishable; slow on a phone |
| Email magic link | No password | Needs an email provider; slow on a phone |
| Hosted auth service | Little to build | Another vendor holding the door, for one user |

## Decision

Passkeys through SimpleWebAuthn, sessions on the server, registration closed after the owner's first
passkey, and one-time recovery codes shown once. Proposed by Claude during `/shape`; accepted when
`SPECS.md` was signed off, on 2026-10-31.

## Consequences

- The domain must be fixed before Phase 1 — changing it later means registering passkeys again.
- The owner registers a passkey on each phone, since iPhone and Android passkeys do not sync.
- Losing every device and the recovery codes locks the owner out. The codes are the only way back,
  and setup says so plainly.
