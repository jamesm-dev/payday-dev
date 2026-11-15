---
title: ADR-0023 Google Sign-In For New Accounts
created: 2026-11-15
updated: 2026-11-16
tags: [adr, decision]
status: superseded
decision: New people sign in with Google; email waits for a domain
supersedes:
superseded_by: ADR-0026 Email And Password Sign-Up For Now
---

# ADR-0023 Google Sign-In For New Accounts

> [!warning] Superseded 2026-11-16
> By [[ADR-0026 Email And Password Sign-Up For Now]], at the owner's request: nothing that needs
> a domain for now. Google sign-in can come back once Payday has one.
> Its design returns, built and switched off, in [[ADR-0028 Google Sign-In Built Switched Off]].

## Context

New people need a way to sign up and to get back in after forgetting a password. The owner first
chose "email and password or through Google". Sending email (to confirm an address or reset a
password) needs a sending domain Payday owns; the site lives at `payday-birc.netlify.app`, which
Netlify owns, so no email service will send from it. A domain costs roughly $10 to $20 a year. The
owner chose to stay at $0 for now.

## Options

| Option | Pros | Cons |
|---|---|---|
| Buy a domain; email and password, with email reset | Works for everyone; a permanent-looking address; better in search | A yearly cost; passkeys registered again on the new address |
| Google sign-in only, for now | $0; no password to forget; Google confirms the email | People without a Google account cannot join; losing the Google account loses the way in |
| Email from a personal Gmail | $0 | Daily limits, spam folders, ties Payday to a personal mailbox |
| Password and recovery codes for everyone | No outside service | A lost code and a forgotten password lose the budget; hard for older people |

## Decision

New people sign up and sign in with **Google** (OpenID Connect, authorisation-code flow with PKCE,
done on the server); the owner's choice, 2026-11-15.

- The server checks Google's ID token (issuer, audience, expiry, nonce) and the `state`, and stores
  only Google's account id and the email.
- The first owner keeps password sign-in, and may link a Google account to it.
- Password registration stays closed to everyone else.
- Each person may still add their device's PIN, fingerprint or face (passkeys), per person.

## Consequences

- Email sign-up and password reset wait for a domain; an open question in [[SPECS]].
- Google may ask to verify a `netlify.app` address before the sign-in screen is published; the
  first task of [[Sign In With Google]] is a spike that settles it. If it must, a domain comes
  first.
- Two secrets (the Google client id and secret) are set in Netlify by the owner, documented empty
  in `.env.example`.
- Revisit when a domain is bought, or if people ask to join without Google.
