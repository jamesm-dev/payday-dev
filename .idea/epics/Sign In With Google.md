---
title: Sign In With Google
created: 2026-11-15
updated: 2026-11-16
tags: [epic, many-people]
status: cut
theme: Many People And Any Device
phase: 9
sources: [Many People On One Site]
---

# Sign In With Google

> [!warning] Cut 2026-11-16
> Replaced by [[Sign Up With Email And Password]] ([[ADR-0026 Email And Password Sign-Up For Now]]).
> Its task ids are kept and never reused.
> Re-planned as [[Continue With Google]] on 2026-11-16 ([[ADR-0028 Google Sign-In Built Switched Off]]).

## Outcome

A new person taps "Continue with Google", gets an account with an empty budget of their own, and
lands in guided setup. The next time, the same tap signs them in. Accounts stop at 100 for now, and
the owner keeps signing in with their password.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] Spike: create the Google sign-in client for the site's address and confirm what Google needs to publish it (consent screen, authorised domain on `netlify.app`, privacy notice link) — ends in a written decision, and the two secrets set in Netlify by the owner (2 pts) ^tsk-f141f1
- [ ] "Continue with Google" creates an account for a new person on first sign-in and signs them in after; the server checks Google's ID token (issuer, audience, expiry, nonce) and the `state`, and stores only Google's account id and email (5 pts) ^tsk-8e996d
- [ ] Accounts stop at 100: the 101st person is told in plain words that sign-up is full for now, and nothing about them is stored (2 pts) ^tsk-93e74f
- [ ] The owner can link a Google account to their password account from Settings › Security, and either way of signing in opens the same budget (3 pts) ^tsk-0982ee
- [ ] A new person lands in guided setup with an empty budget of their own, in their own time zone and currency (2 pts) ^tsk-2d3f6e
- [ ] Sign-in attempts are limited per address and site-wide; a forged, expired, replayed or wrong-audience token is refused, in tests; the session is the same locked-down cookie (3 pts) ^tsk-a8ca92

## Approach

OpenID Connect with Google's authorisation-code flow and PKCE, done on the server with SvelteKit
routes; the library is chosen at `/setup` against the quality bar. No email is sent by Payday, so no
domain is needed yet ([[ADR-0023 Google Sign-In For New Accounts]]). Password registration stays
closed after the first owner ([[ADR-0010 Password Sign-In With Optional Passkeys]]).

## Dependencies

- Blocked by: [[Every Budget Has Its Owner]]
- Unblocks: [[Product Landing Page]]'s main button

> [!warning] Risks
> - Google may ask for verification of a `netlify.app` address before publishing. Early warning: the
>   spike cannot publish the consent screen. Fallback: a domain (see SPECS open questions).
> - A person who loses their Google account loses their way into Payday. Early warning: requests to
>   recover an account; email sign-in with a domain is the next step.

## Why cut

The owner, 2026-11-16: "avoid anything path right now that requires me to buy a domain, I'm okay
with users signing up even dummy emails to create account, what I need right now is to put the
app out there". Google may need a verified address Payday does not own.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Many People On One Site]]
- Phase: [[ROADMAP]]
