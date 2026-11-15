---
title: ADR-0028 Google Sign-In Built Switched Off
created: 2026-11-16
updated: 2026-11-16
tags: [adr, decision]
status: accepted
decision: Build "Continue with Google" completely now, switched off until the owner sets two Netlify variables
supersedes:
superseded_by:
---

# ADR-0028 Google Sign-In Built Switched Off

Amends [[ADR-0026 Email And Password Sign-Up For Now]]: email and password stay the way new people
sign up, and Google becomes a second way that exists in the code but is off.

## Context

[[ADR-0026 Email And Password Sign-Up For Now]] cut Google sign-in because Google may want a
verified address, and the owner did not want to buy a domain. Later on 2026-11-16 the owner said:
"make sure to prepare everything to when I enable user login via google". So the owner expects to
switch Google on themselves, at a time of their choosing, and wants nothing left to build when they
do. The owner owns `jamesm-dev.com`, which may help Google approve the sign-in screen, and may move
Payday to `payday.jamesm-dev.com` later.

## Options

| Option | Pros | Cons |
|---|---|---|
| Build now, switched off | Nothing to build on the day; the off state is tested; the owner decides when | Code that no one uses for a while; one more thing to keep working |
| Wait for a domain | No unused code | The owner's request is not met; the work lands later, in a hurry |
| Build and switch on now | People can use Google at once | Google may refuse an unverified `netlify.app` address; the owner has not set up a Google project |

## Decision

**Build "Continue with Google" completely in Phase 12, and ship it switched off.** The owner's
choice, 2026-11-16.

- **The flow.** The authorisation-code flow with PKCE (S256). The `state` and the `nonce` are made
  and kept on the server, in a short-lived row, and the callback must match both.
- **No JWKS, no library.** The ID token comes straight from Google's token endpoint over TLS,
  after the server exchanged a one-time code with its client secret. OpenID Connect Core allows
  trusting that channel instead of checking the signature (section 3.1.3.7), so Payday does not
  fetch Google's signing keys. It still checks the issuer, audience, authorised party, expiry,
  issue time, nonce, a verified email and the presence of Google's account id. Google's three
  addresses are constants in the code. No new dependency.
- **The switch.** Two Netlify variables, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. If either
  is empty, Google is off, and off means nothing: no button, no word on any page, and its routes
  answer 404. A test-only provider address exists for browser tests; it is honoured only outside
  the hosted build, which removes it at build time, and it must be a loopback address. The Netlify
  proof tests exactly that.
- **No linking by email.** Payday does not check emails, so a matching email proves nothing. A
  Google email that matches an existing account is refused in plain words, with the way forward:
  sign in with the password, then connect Google in Settings › Security. Connecting and
  disconnecting live there; disconnecting is refused when it would remove the last way in.
- **The same path as sign-up.** A newcomer from Google goes through the one sign-up function
  password sign-up uses: the full check before any write, the registration lock, the same limits,
  closed with no accounts, refused at 100. Recovery codes are made and shown once, then guided
  setup. Only Google's account id and the email are stored, with no password.
- **Confirm with Google.** A person who has only Google has no password to type for risky steps
  (downloading a backup, deleting the account, making new codes). They confirm with a fresh Google
  round trip tied to their session, which must return the same account id. This is **weaker than a
  password**: Google cannot be forced to ask again (the only prompts it takes are none, consent and
  choose-an-account), so a person already signed in to Google on a borrowed phone can pass it. The
  code and the Settings screen say so.
- **Privacy wording only while on.** The privacy notice mentions Google only while it is switched
  on: what Google sends (the account number and email), what Payday keeps, the short cookie during
  sign-in, how to disconnect, and that deleting the account removes it. Off, the page is as it is
  today.

## Consequences

- Switching it on needs a Netlify deploy, because Netlify applies variable changes only on the next
  deploy (15 of 300 monthly credits). The owner's step-by-step how-to says so.
- Turning it off later leaves people who signed up with Google and have no password with only their
  recovery codes. The how-to says never to remove the variables once people use Google.
- Moving to `payday.jamesm-dev.com` adds a second redirect address in Google's settings. Keep the
  old one until the move is done. Passkeys must be registered again; Google and passwords keep
  working.
- A new migration adds one nullable column, `owner.google_sub`; backups never carry it and a
  restore never sets it. Deleting an account removes it.
- [[ADR-0023 Google Sign-In For New Accounts]] stays superseded, but its design returns here.
- Work: [[Continue With Google]] in Phase 12 of [[ROADMAP]]. The cut [[Sign In With Google]] is
  re-planned there.

## Related

- Theme: [[Many People And Any Device]]
- Amends: [[ADR-0026 Email And Password Sign-Up For Now]]
- Builds on: [[ADR-0022 Open Sign-Up With A Limit]], [[ADR-0010 Password Sign-In With Optional Passkeys]]
