---
title: Sign Up With Email And Password
created: 2026-11-16
updated: 2026-11-16
tags: [epic, many-people]
status: done
theme: Many People And Any Device
phase: 9
sources: [Many People On One Site]
---

# Sign Up With Email And Password

## Outcome

A new person types an email and a password, gets an account with an empty budget of their own,
and lands in guided setup. Next time, the same email and password sign them in on any device.
Nothing is sent and nothing is bought: the email is not checked
([[ADR-0026 Email And Password Sign-Up For Now]]). Accounts stop at 100 for now, and the owner
keeps their password and budget.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] "Create a free account" asks for an email, a password and the password again; the email is stored in lower case and must be unique, and a taken email is refused in plain words; no email is sent — verified by signUp.test.ts and people-signup.e2e.ts (lower case, unique in any case, a taken email refused plainly, no email sent), 2026-11-16 (5 pts) ^tsk-a9d999
- [x] A new person is shown their recovery codes once, right after sign-up, with plain words that these are the only way back in if the password is forgotten — verified by people-signup.e2e.ts and people-journey.e2e.ts: the codes shown once, no-store, not on reload, 2026-11-16 (2 pts) ^tsk-01b260
- [x] Everyone signs in with an email and a password; the first owner adds an email in Settings › Security, and until they do, their password-only sign-in keeps working — verified by signin page tests, owner-email.e2e.ts (the owner adds an email, a blank email then fails, the email signs in) and the browser suite signing in with a blank email before it, 2026-11-16 (3 pts) ^tsk-55c7a4
- [x] Accounts stop at 100: the 101st person is told in plain words that sign-up is full for now, and nothing about them is stored — verified by signUp.test.ts: the 101st is refused with every table unchanged, the lock before the count and the insert, two sign-ups at 99 cannot both get in, 2026-11-16 (2 pts) ^tsk-29100a
- [x] A new person lands in guided setup with an empty budget of their own, in their own time zone and currency — verified by people-signup.e2e.ts and people-journey.e2e.ts in Manila: an empty budget, setup guessing PHP and Asia/Manila, 2026-11-16 (2 pts) ^tsk-4d0fc2
- [x] Sign-up and sign-in are limited per address and site-wide, a wrong password counts against the brake, and the session is the same locked-down cookie, in tests — verified by signUp.test.ts (3 per address and 30 per hour for the site, the hash queue), the sign-in limit tests, and the Set-Cookie flags in people-signup.e2e.ts, 2026-11-16 (3 pts) ^tsk-be6817
- [x] The product page's button becomes "Create a free account", and when sign-up is full it offers "Sign in" only — verified by Landing.test.ts (open and full), page.server.test.ts and landing.e2e.ts, 2026-11-16 (1 pt) ^tsk-cd259c
- [x] Every account has an email: the sign-in form and the first registration require one, a blank email is refused in plain words and signs nobody in, and the "leave it empty" line is gone (the owner's request, 2026-11-16; [[ADR-0026 Email And Password Sign-Up For Now]], amended) — verified by account.test.ts (registration needs an email), signin/+page.server.test.ts (a blank email is refused before anything is counted), owner-email.e2e.ts, and every browser test now signing the owner in with an email; an email typed before the page starts is no longer wiped, 2026-11-16 (2 pts) ^tsk-37d755

## Approach

The sign-up form posts to a server action like the password sign-in, and reuses its scrypt queue,
limits and brake ([[ADR-0018 Password Checks Queue In The Database]]). An `email` column on `owner`,
unique in lower case, in a new additive migration; the first owner's row keeps a null email until
they add one. Registration of a second password owner, closed since
[[ADR-0010 Password Sign-In With Optional Passkeys]], opens only through this form and only under
the account limit. No email service, no domain ([[ADR-0026 Email And Password Sign-Up For Now]]).

## Dependencies

- Blocked by: [[Every Budget Has Its Owner]]
- Unblocks: [[Product Landing Page]]'s main button
- Replaces: [[Sign In With Google]], cut on 2026-11-16

> [!warning] Risks
> - A made-up email cannot be reached: a person who forgets their password and loses their codes
>   loses their budget. Early warning: people asking to be let back in.
> - Sign-up opens a door to bots. Early warning: accounts appearing in bursts from one address; the
>   limits and the 100-account cap hold until a check is added.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Many People On One Site]]
- Phase: [[ROADMAP]]
