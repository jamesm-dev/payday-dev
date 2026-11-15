---
title: ADR-0022 Open Sign-Up With A Limit
created: 2026-11-15
updated: 2026-11-15
tags: [adr, decision]
status: accepted
decision: Anyone may sign up, up to 100 accounts
supersedes:
superseded_by:
---

# ADR-0022 Open Sign-Up With A Limit

## Context

[[SPECS]] made Payday one owner's private tool: "Other users, sign-up, sharing a budget" was a
non-goal, and sign-in was built for one fixed owner ([[ADR-0010 Password Sign-In With Optional Passkeys]]).
On 2026-11-15 the owner asked for many people on one site, each with a private budget that is the
same on every device ([[Many People On One Site]]), and chose "Open sign-up now" for the product
page's main button. Payday runs on Netlify's and Supabase's free plans, sized for one person.

## Options

| Option | Pros | Cons |
|---|---|---|
| Invite only | Safest; no strangers, no abuse | Strangers who find the page cannot join |
| Anyone, no limit | Simplest message | Free plans can run out in a month; no time to learn |
| Anyone, up to a limit | Open, while the free plans and the privacy work are proven | A "full" message to explain; a decision to make when it fills |

## Decision

Anyone may create an account, up to **100 accounts** for now; the owner's choice, 2026-11-15.

- Every row of money data belongs to one person, and every read and write is scoped in the app's
  own queries to the person signed in. The app connects as one database role, so Supabase's
  row-level security is not the mechanism ([[ADR-0014 Supabase Postgres As The Database]]).
- The owner's budget migrates unchanged as the first person.
- When 100 accounts exist, sign-up says it is full for now; nothing about the visitor is stored.
- It stays on the free plans until it nears the limit; then the owner decides on paid plans.

## Consequences

- The SPECS non-goal "Other users, sign-up, sharing a budget" is superseded. Sharing one budget
  between people stays out.
- [[ADR-0010 Password Sign-In With Optional Passkeys]] still holds for the first owner; its "one
  owner, registration closed" part now applies to password registration only.
- Privacy becomes the product: a privacy notice under the Philippines' Data Privacy Act of 2012,
  account deletion and per-person backups ([[Your Account And Your Data]]).
- Revisit at 80 accounts, or if Netlify's monthly credits or Supabase's free limits run short.
