---
title: ADR-0012 Logged Expenses Count Until The Next Balance
created: 2026-11-02
updated: 2026-11-02
tags: [adr, decision]
status: accepted
decision: logged expenses lower the number
supersedes:
superseded_by:
---

# ADR-0012 Logged Expenses Count Until The Next Balance

## Context

v1 never logged expenses. Spending was inferred from the balance at each check-in ([[SPECS]]
decision 9), and logging individual expenses was a v1 non-goal, because tracking had "never really
started" and [[Five Second Quick Add]] was parked on that evidence. On 2026-11-02 the owner asked
for daily expenses directly, and chose how they should affect the number.

The number is counted from the balance's own date, conservatively
([[ADR-0009 Conservative Safe To Spend Rules]]). Logged expenses have to fit that without ever
counting money twice: an expense that is already in a balance must not be taken off it again.

## Options

| Option | Pros | Cons |
|---|---|---|
| Each expense lowers the number at once, until the next balance takes over | The number is right between paydays; the check-in can compare logged with spent | Needs a rule for which expenses a balance already covers |
| A list only; the number still changes only at a check-in | Simplest; nothing can be counted twice | Logging changes nothing the owner can see, so there is little reason to keep doing it |
| Keep v1 as it is | No work | The owner asked for it |

## Decision

Each logged expense lowers the safe-to-spend number at once. An expense counts while its day is on
or after the current balance's date **and** it was logged after that balance was saved; a fresh
balance, from the home screen or a check-in, takes over from everything before it. The owner's
choice, 2026-11-02.

A balance therefore records the moment it was saved, not only the day it was true on. An expense
logged on the same day as a balance, after it was saved, is counted even if the bank had already
shown it: the number errs low, never high, as [[ADR-0009 Conservative Safe To Spend Rules]] asks.

## Amendment 2026-11-02: the day comes first

A review of the first build found two ways the rule above could make the number read too high, which
[[ADR-0009 Conservative Safe To Spend Rules]] forbids:

- A balance typed in for an earlier day (true on Nov 1, saved on Nov 5) stopped the expenses of
  Nov 2 to 4 counting, though a Nov 1 balance cannot contain them.
- A check-in stamped its balance when it finished, not when the bank figure was typed in, so an
  expense logged in between stopped counting.

The rule is now: **an expense counts when its day is after the balance's day, or on that day and it
was logged after the balance was read.** A balance from the home screen is read when it is saved; a
check-in's, at its balance step. This counts the same expenses or more, never fewer, so the owner's
choice stands: nothing is counted twice, and when in doubt the number errs low.

## Consequences

- The number moves between paydays, and the check-in can show logged against spent
  ([[Expenses At Check-In]]).
- Logging stays optional. An owner who logs nothing sees exactly the v1 behaviour.
- Expenses are history once a balance covers them: they stay listed, but no longer count.
- Supersedes [[SPECS]] decision 9 and the v1 non-goal "Logging individual expenses, categories".
  Categories are still out: what an expense was for is free text.
- Revisit if [[Bank Statement Import]] arrives: an imported line and a logged expense would then
  describe the same money, and the two must be matched rather than both counted.
