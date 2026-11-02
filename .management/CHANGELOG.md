---
title: CHANGELOG
created: 2026-10-31
updated: 2026-11-01
tags: [changelog, management]
status: active
---

# CHANGELOG

What actually shipped, newest first. Append only.

## 2026-11-01

Nothing shipped. Sign-in changed at the owner's request: a password first, with each device's PIN,
fingerprint or face optional ([Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md),
ADR-0010). Two security reviews; every finding was fixed with a test. The intermittent browser-test
failure was traced to a race in the tests' save-balance helper, and fixed.

Later the same day, still nothing shipped: Phase 4 was added at the owner's request and built
locally. [Paid Optional And Grouped Bills](../.idea/epics/Paid%20Optional%20And%20Grouped%20Bills.md)
is verified; [Paycheck List Export](../.idea/epics/Paycheck%20List%20Export.md) waits on the owner
opening the Word document in Word. Each paycheck now downloads as a text file, a PDF or a Word
document in the owner's own list format (ADR-0011).

## 2026-10-31

Nothing shipped yet. Phase 0 was built and checked locally by `/setup`; the first release is
`/ship`'s, and nothing has been committed.

- Built, not deployed:
  - [Walking Skeleton Deployed](../.idea/epics/Walking%20Skeleton%20Deployed.md)
  - [Installable App Shell](../.idea/epics/Installable%20App%20Shell.md)
  - [Backups And Restore Drill](../.idea/epics/Backups%20And%20Restore%20Drill.md)
  - 7 of 15 Phase 0 tasks verified.
- Phases 1–3 built and tested locally, the same day: still nothing shipped, and nothing committed.
  - Phase 1: [Private Single User Access](../.idea/epics/Private%20Single%20User%20Access.md),
    [Schedule Of Pay And Bills](../.idea/epics/Schedule%20Of%20Pay%20And%20Bills.md),
    [Paycheck Periods And Safe To Spend](../.idea/epics/Paycheck%20Periods%20And%20Safe%20To%20Spend.md),
    [Guided First Run Setup](../.idea/epics/Guided%20First%20Run%20Setup.md). After a security
    review, one high and four medium findings were fixed.
  - Phase 2: [Payday Check-In Flow](../.idea/epics/Payday%20Check-In%20Flow.md),
    [Payday Reminder](../.idea/epics/Payday%20Reminder.md),
    [Paycheck Plan View](../.idea/epics/Paycheck%20Plan%20View.md).
  - Phase 3: [Loan Ledger](../.idea/epics/Loan%20Ledger.md),
    [Debt Free Date Projection](../.idea/epics/Debt%20Free%20Date%20Projection.md),
    [Loan Balances At Check-In](../.idea/epics/Loan%20Balances%20At%20Check-In.md). Verified.
  - The dashboard was restyled from the app's own tokens; the app gained `--color-surface-2` and
    `--color-warn`.
- **Dashboard: built dev-only at `/management`, on the owner's request**, before the app has
  components of its own. It is plain and draws only on `tokens.css`. **Revisit it in Phase 1**, when
  the setup flow brings the app's first real components, and rebuild its primitives from them.
