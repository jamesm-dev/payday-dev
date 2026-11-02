---
title: Private Single User Access
created: 2026-10-31
updated: 2026-11-01
tags: [epic, paycheck-and-bills]
status: in-progress
theme: Paycheck And Bills Out Of Sync
phase: 1
sources: [Safe To Spend Number]
---

# Private Single User Access

## Outcome

Only the owner can see anything. They sign in with a password on both phones and the laptop (a passkey is an optional extra), can
recover if the password is forgotten, and nobody else can register.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] The first visit registers the owner with a password (typed twice), and registration is closed from then on; a passkey can be added afterwards but is optional — verified by passkeys.test.ts, auth.setup.ts; a setup code guards the first registration in production (amended 2026-11-01, ADR-0010) (5 pts) ^tsk-46617d
- [ ] Password sign-in works on both phones and the laptop, and a passkey ("this device's PIN, fingerprint or face") is an optional extra that can be added and removed from a signed-in device (amended 2026-11-01, ADR-0010) (5 pts) ^tsk-d7d015
- [x] One-time recovery codes are shown once at registration, stored hashed, and each signs in exactly once — verified by recovery.test.ts, auth.setup.ts, auth.e2e.ts (3 pts) ^tsk-e31665
- [x] Sessions live on the server behind HttpOnly, Secure, SameSite cookies, and expire after a set idle time — verified by session.test.ts, auth.e2e.ts; __Host-session with Secure proven over https (2 pts) ^tsk-2f1582
- [x] A Playwright test confirms every route except sign-in redirects to sign-in without a session — verified by guard.test.ts and auth.e2e.ts over every route in tests/support/routes.ts (2 pts) ^tsk-ef5663
- [x] Security headers — a content security policy, HSTS and frame-ancestors — are set and checked by a test — verified by auth.e2e.ts; strict CSP with a nonce, no unsafe-inline (2 pts) ^tsk-4e3ec1

## Approach

Amended 2026-11-01 by [[ADR-0010 Password Sign-In With Optional Passkeys]]: a scrypt-hashed password is
the way in, SimpleWebAuthn passkeys are optional, recovery codes lead to setting a new password, and
the first two criteria are reworded to match. Sessions in SQLite. Prove sign-in from inside the installed iPhone app
before anything else in Phase 1 — it is the assumption most likely to surprise.

## Dependencies

- Blocked by: [[Walking Skeleton Deployed]], [[Backups And Restore Drill]]
- Blocks: entering any real data

> [!warning] Risks
> - The domain changes after passkeys are registered, and they stop working. Fix the domain first.
> - Passkeys sync within Apple's or Google's ecosystem but not across them, so one owner with both
>   phones needs a passkey on each.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]] — private financial data behind it
- Decision: [[ADR-0010 Password Sign-In With Optional Passkeys]], which supersedes
  [[ADR-0006 Passkeys For A Single Owner]]
- Phase: [[ROADMAP]]
