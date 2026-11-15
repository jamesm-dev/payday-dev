---
title: Continue With Google
created: 2026-11-16
updated: 2026-11-16
tags: [epic, many-people]
status: planned
theme: Many People And Any Device
phase: 12
sources: [Many People On One Site]
---

# Continue With Google

## Outcome

"Continue with Google" is fully built and switched off until the owner sets two Netlify variables.
Off, nothing about Google shows or answers. On, a new person taps the button, gets an account and
recovery codes through the same path as sign-up, and signs in the same way next time
([[ADR-0028 Google Sign-In Built Switched Off]]).

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] The switch: off means nothing about Google shows or answers (2 pts) ^tsk-5c19e2
- [ ] Migration 0007 adds owner.google_sub; deletion removes it and backups never carry it (2 pts) ^tsk-b7d40a
- [ ] The OpenID Connect steps on the server: PKCE, state, nonce, and the ID token's checks (5 pts) ^tsk-3e8f61
- [ ] A newcomer through the same path as sign-up (the cap, lock and limits), recovery codes shown once, guided setup, then signing in again to the same budget (5 pts) ^tsk-d24c97
- [ ] An email that matches an existing account is refused in plain words; no automatic linking (1 pt) ^tsk-81af3b
- [ ] Connect, disconnect and Confirm with Google in Settings › Security; disconnect refused when it is the last way in (3 pts) ^tsk-6f0e5d
- [ ] The privacy notice mentions Google only while it is on (1 pt) ^tsk-c3b872
- [ ] Browser tests against a fake Google on iPhone and laptop, and the Netlify proof that the build cannot reach anything but Google (3 pts) ^tsk-9a4d16
- [ ] The owner's step-by-step how-to, with no secrets (1 pt) ^tsk-e7215f
- [ ] At release: the owner turns it on and signs in with a real Google account (1 pt) ^tsk-47b9c8

## Approach

The code flow with PKCE on the server with SvelteKit routes; state and nonce live in short-lived
challenge rows (10 minutes), sign-in rows bound to a short cookie, connect and confirm rows bound to
the session. No new dependency and no key fetch: the ID token is trusted from Google's token
endpoint over TLS, and still checked for issuer, audience, expiry and nonce. "Continue with Google"
is a plain link to a start route, because the CSP's `form-action 'self'` blocks a form that
redirects to Google; the CSP stays as it is. A newcomer goes through one sign-up function pulled
out of [[Sign Up With Email And Password]]'s, so the cap, the lock and the limits cannot drift.
Recovery codes, which a redirect cannot carry in a response, go through the one-time slot and are
shown once. Browser tests run against a fake Google started beside the app; the hosted build ignores
the test provider, and a Netlify test proves it.

## Dependencies

- Blocked by: Phase 9's epics: [[Every Budget Has Its Owner]], [[Sign Up With Email And Password]], [[Your Account And Your Data]]
- Builds on: [[Sign Up With Email And Password]]
- Replaces: [[Sign In With Google]], cut on 2026-11-16 and re-planned here

> [!warning] Risks
> - Google may refuse an unverified `netlify.app` address, or leave the app in Testing mode.
>   Early warning: the owner's first real sign-in at release. Fallback: verify `jamesm-dev.com`,
>   or move to `payday.jamesm-dev.com`.
> - A person who signs up with Google and later loses it has only their recovery codes.
>   Early warning: requests to be let back in; the how-to says never to remove the variables once
>   people use Google.
> - Confirm with Google is weaker than a password. Early warning: none; the screen says so.
> - The code is untested against the real Google until release. The fake provider follows Google's
>   documented shapes; the last task proves it live.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Many People On One Site]]
- Decision: [[ADR-0028 Google Sign-In Built Switched Off]]
- Phase: [[ROADMAP]]
