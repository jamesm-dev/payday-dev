---
title: Many People On One Site
created: 2026-11-15
updated: 2026-11-15
tags: [idea, many-people]
status: committed
theme: Many People And Any Device
horizon: next
impact: 5
effort: 5
confidence: 2
epic: [Every Budget Has Its Owner, Sign In With Google, Your Account And Your Data, Product Landing Page]
---

# Many People On One Site

## Pitch

Several people sign up on the same Payday site, each with their own private budget, and see it the
same on every device they sign in from.

The owner's words, 2026-11-15, asked who will use Payday: "Many on one site", then "many users can
login via site so that users can see their budget accurately the same even if they switch devices".
They have in mind older people who are not native English speakers.

## Why it might work

- The data already lives on the server, so one person's budget is already the same on every
  device. Most tables already carry an owner id.
- One site to look after is easier than a copy per person.

## Why it might not

- It reverses a [[SPECS]] non-goal: "Other users, sign-up, sharing a budget — a personal tool for one
  owner. Multi-user is a different product." Sign-in assumes one owner throughout: registration
  closes after the first, passkeys belong to one fixed user handle, the setup code guards one
  registration ([[ADR-0010 Password Sign-In With Optional Passkeys]]).
- Other people's money data makes privacy the product: every query must be scoped to its person,
  sign-up needs protection from abuse, a forgotten password needs a way back without email today,
  and the law on personal data applies (in the Philippines, the Data Privacy Act of 2012).
- The free plans were sized for one person: Netlify's 300 monthly credits and Supabase's free
  project, which pauses after a quiet week and has no backups of its own.

> [!warning] Riskiest assumption
> That the free plans and a one-person design can carry other people's budgets safely. If not, it
> costs money every month, or a rebuild of sign-in and data access.

## What would raise confidence

- [x] A `/shape` session: who exactly, how many, how they get an account, and what it may cost.
  Shaped 2026-11-15: anyone may sign up, up to 100 accounts ([[ADR-0022 Open Sign-Up With A Limit]]);
  new people sign in with Google, email waiting for a domain ([[ADR-0023 Google Sign-In For New Accounts]]);
  free plans until it nears the limit. Phase 9 in [[ROADMAP]].

## Related

- Theme: [[Many People And Any Device]]
- Tension with: [[SPECS]] non-goals, [[ADR-0010 Password Sign-In With Optional Passkeys]]
- Together with: [[Offline Use With Sync]]
- Session: [[2026-11-15 Brainstorm - Pay Rhythm And Early Bills]]
