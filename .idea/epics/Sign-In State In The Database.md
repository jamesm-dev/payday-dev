---
title: Sign-In State In The Database
created: 2026-11-02
updated: 2026-11-15
tags: [epic, foundation]
status: done
theme: Paycheck And Bills Out Of Sync
phase: 6
sources: [Safe To Spend Number]
---

# Sign-In State In The Database

## Outcome

Everything sign-in remembers between requests lives in the database, so it holds when every request
may run in a different function: the attempt limits, the failure brake, the 5-minute confirmation,
the recovery-code window and the one-time slots.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] The sign-in attempt limits and the failure brake hold across separate function instances, kept in the database — verified by rateLimit.test.ts, failureBrake.test.ts, signInAttempt.test.ts and firstRegistration.test.ts across separate store instances, and live on Supabase through four connections, ceeef3a, 2026-11-15 (3 pts) ^tsk-5569a1
- [x] The 5-minute confirmation, the recovery-code window and the one-time slots live in the database, keyed by session — verified by stepUp.test.ts, oneTimeSlot.test.ts and recovery.test.ts, and live on Supabase, ceeef3a, 2026-11-15 (3 pts) ^tsk-0d8d10
- [x] Rows past their time are cleaned up, and never read as current — verified by the TSK-6DF544 tests in rateLimit, challenge, oneTimeSlot and stepUp, and live on Supabase, ceeef3a, 2026-11-15 (1 pt) ^tsk-6df544
- [x] An independent security review of the move finds no exploitable hole, and everything it asks for is fixed — verified: the review approved after ten findings over two rounds were fixed, each with a test, ceeef3a, 2026-11-15 (2 pts) ^tsk-c337dd

## Approach

Each in-memory store keeps its interface and gets a database-backed twin; the rules
([[ADR-0010 Password Sign-In With Optional Passkeys]]) do not change. Two requests at once must not
both pass a limit meant for one, so each check-and-count is one statement or one transaction.

## Dependencies

- Blocked by: [[Postgres On Supabase]]

> [!warning] Risks
> - A limit that is counted after the check lets two guesses through where one was allowed. Early
>   warning: a test that fires the same attempt from two connections at once.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Safe To Spend Number]] — private access is part of trusting the number
- Builds on: [[Private Single User Access]]
- Decided in: [[ADR-0013 Netlify As The Host]], [[ADR-0018 Password Checks Queue In The Database]]
- Phase: [[ROADMAP]]
