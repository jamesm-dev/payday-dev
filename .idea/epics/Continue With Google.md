---
title: Continue With Google
created: 2026-11-16
updated: 2026-11-16
tags: [epic, many-people]
status: in-progress
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

- [x] The switch: off means nothing about Google shows or answers — verified by config.test.ts, complete.test.ts and the loads' tests (off: 404s, no word of Google), people-google.e2e.ts on the main server, and the Netlify smoke tests (the hosted bundle reads no test provider and serves no Google paragraph), 2026-11-16 (2 pts) ^tsk-5c19e2
- [x] Migration 0007 adds owner.google_sub; deletion removes it and backups never carry it — verified by googleSubMigration.test.ts (0007 only adds the column and a unique index), deleteAccount.test.ts (the sub goes, and can make a new account) and fullBackup.test.ts (a backup never carries it), 2026-11-16 (2 pts) ^tsk-b7d40a
- [x] The OpenID Connect steps on the server: PKCE, state, nonce, and the ID token's checks — verified by oidc.test.ts (PKCE against RFC 7636, the token exchange, iss, aud exactly the client, azp, exp, iat required, nonce, email_verified) and flow.test.ts (single use, 10 minutes, bound to a cookie or the session), after a security review, 2026-11-16 (5 pts) ^tsk-3e8f61
- [x] A newcomer through the same path as sign-up (the cap, lock and limits), recovery codes shown once, guided setup, then signing in again to the same budget — verified by accounts.test.ts (the shared sign-up path: full first, the lock, the limits, closed at 0) and people-google.e2e.ts (codes once, setup, sign in again to the same budget), 2026-11-16 (5 pts) ^tsk-d24c97
- [x] An email that matches an existing account is refused in plain words; no automatic linking — verified by accounts.test.ts and people-google.e2e.ts: an existing email, in any case, is refused and nothing is written, 2026-11-16 (1 pt) ^tsk-81af3b
- [x] Connect, disconnect and Confirm with Google in Settings › Security; disconnect refused when it is the last way in — verified by the security page's tests and people-google.e2e.ts (connect, sign in with Google to the same budget; disconnect refused as the last way in, allowed with a password, other devices signed out); the two-person sweep covers connect and confirm, 2026-11-16 (3 pts) ^tsk-6f0e5d
- [x] The privacy notice mentions Google only while it is on — verified by the privacy load test and people-google.e2e.ts's build check (the paragraph and no client id or secret with the variables; nothing without them), 2026-11-16 (1 pt) ^tsk-c3b872
- [x] Browser tests against a fake Google on iPhone and laptop, and the Netlify proof that the build cannot reach anything but Google — verified by people-google.e2e.ts on iPhone and laptop against tests/support/fakeGoogle.ts, and netlify-google.smoke.ts (no test provider in the hosted bundle; the full redirect to Google needs a database, so it is proved at release by 47b9c8), 2026-11-16 (3 pts) ^tsk-9a4d16
- [x] The owner's step-by-step how-to, with no secrets — verified by app/README.md "Turn on Continue with Google", checked against the code by the security review, 2026-11-16 (1 pt) ^tsk-e7215f
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
