---
title: Sign Up With Email And Password
created: 2026-11-16
updated: 2026-11-16
tags: [epic, many-people]
status: planned
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

- [ ] "Create a free account" asks for an email, a password and the password again; the email is stored in lower case and must be unique, and a taken email is refused in plain words; no email is sent (5 pts) ^tsk-a9d999
- [ ] A new person is shown their recovery codes once, right after sign-up, with plain words that these are the only way back in if the password is forgotten (2 pts) ^tsk-01b260
- [ ] Everyone signs in with an email and a password; the first owner adds an email in Settings › Security, and until they do, their password-only sign-in keeps working (3 pts) ^tsk-55c7a4
- [ ] Accounts stop at 100: the 101st person is told in plain words that sign-up is full for now, and nothing about them is stored (2 pts) ^tsk-29100a
- [ ] A new person lands in guided setup with an empty budget of their own, in their own time zone and currency (2 pts) ^tsk-4d0fc2
- [ ] Sign-up and sign-in are limited per address and site-wide, a wrong password counts against the brake, and the session is the same locked-down cookie, in tests (3 pts) ^tsk-be6817
- [ ] The product page's button becomes "Create a free account", and when sign-up is full it offers "Sign in" only (1 pt) ^tsk-cd259c

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
