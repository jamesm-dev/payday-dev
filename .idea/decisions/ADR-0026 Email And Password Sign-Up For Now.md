---
title: ADR-0026 Email And Password Sign-Up For Now
created: 2026-11-16
updated: 2026-11-16
tags: [adr, decision]
status: accepted
decision: New people sign up with an email and a password, with no email check; Google waits for a domain
supersedes: ADR-0023 Google Sign-In For New Accounts
superseded_by:
---

# ADR-0026 Email And Password Sign-Up For Now

## Context

[[ADR-0023 Google Sign-In For New Accounts]] chose Google sign-in for new people, so Payday could
stay at $0 with no domain. Its first task was a spike, because Google may ask to verify the
site's address, `payday-birc.netlify.app`, before it publishes a sign-in screen, and Payday does
not own that address. On 2026-11-16 the owner said: "avoid anything path right now that requires
me to buy a domain, I'm okay with users signing up even dummy emails to create account, what I
need right now is to put the app out there, if users want it we can buy domain and set all these
things up in the future".

## Options

| Option | Pros | Cons |
|---|---|---|
| Google sign-in (ADR-0023) | No password to forget; Google confirms the email | May need a verified address Payday does not own; people without Google cannot join |
| Email and password, the email not checked | $0, no outside service, no domain; works for anyone | A typed email may be wrong or made up; no email reset; a forgotten password needs a recovery code |
| Buy a domain first, then email with checks | Real email reset; a permanent-looking address | A yearly cost now, before anyone has asked for Payday |

## Decision

New people **sign up with an email and a password**, and **the email is not checked**: no message
is sent, and a made-up address works. The owner's choice, 2026-11-16.

- The email is the name an account signs in with, nothing more; it is stored in lower case and
  must be unique.
- The password follows the same rules and scrypt hashing as the owner's
  ([[ADR-0010 Password Sign-In With Optional Passkeys]]).
- The way back in after a forgotten password is a recovery code, as for the owner today: each new
  person is shown their codes once, at sign-up. Payday says plainly that it cannot reset a password
  by email.
- The first owner adds an email to their account in Settings › Security and keeps their password.
- Accounts stop at 100 ([[ADR-0022 Open Sign-Up With A Limit]]); sign-up and sign-in are limited
  per address and site-wide.
- Each person may still add their device's PIN, fingerprint or face (passkeys).

## Consequences

- ADR-0023 is superseded; [[Sign In With Google]] is cut, and [[Sign Up With Email And Password]]
  replaces it in Phase 9.
- No Google client, no secrets to set in Netlify, nothing to buy.
- A person who loses both their password and their recovery codes loses their budget. The
  sign-up screen says so, and asks them to keep the codes.
- Revisit when a domain is bought: email checks, email reset, and Google sign-in can then follow.
