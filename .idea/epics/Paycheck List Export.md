---
title: Paycheck List Export
created: 2026-11-01
updated: 2026-11-01
tags: [epic, paycheck-and-bills]
status: in-progress
theme: Paycheck And Bills Out Of Sync
phase: 4
sources: [Handwritten Paycheck List]
---

# Paycheck List Export

## Outcome

Any of the next six paychecks downloads as a text file, a PDF or a Word document laid out exactly as
the owner's handwritten list, with every total computed by the app.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] A paycheck is laid out as the owner's list: pay, a rule, groups separated by blank lines, `*` optional, `/` paid, then the three totals, and the owner's sample reproduces line for line in a unit test — verified by domain/paycheckList.test.ts (the sample, with its Total (ALL) computed as 97560), money/paycheckList.test.ts (3 pts) ^tsk-eb7093
- [x] It downloads as a text file that opens in Notepad with its tabs and line breaks — verified byte for byte by export.test.ts and export.e2e.ts: UTF-8, tabs, Windows line breaks (1 pt) ^tsk-65262c
- [x] It downloads as a PDF, on as many A4 pages as it needs, in a fixed-width font — verified by export.test.ts, export.e2e.ts, and read back by poppler's pdftotext (3 pts) ^tsk-bc8f24
- [ ] It downloads as a Word document that opens in Word (3 pts) ^tsk-e37aa3
- [x] Each of the next six paychecks on the Plan offers the three downloads, and every download needs a session — verified by export.e2e.ts and the route sweep in auth.e2e.ts (2 pts) ^tsk-1ba934
- [x] A Playwright test downloads all three formats and checks what they contain — verified by export.e2e.ts on WebKit, Android and laptop (2 pts) ^tsk-92a9a7

> [!note] Status 2026-11-01 — built and tested locally
> Five of six criteria are verified. The Word document is a valid package (its own zip and XML
> checks pass in export.test.ts, and Python's zipfile and XML parser read it), but it has not been
> opened in Word itself yet: that is the owner's check on the laptop, with the other two files.

## Approach

One pure function in the domain turns a paycheck into the list's lines; three small writers turn
those lines into a file, with no new dependency
([[ADR-0011 Exports Written Without New Dependencies]]). Each line carries at most one mark: `/` once
paid, otherwise `*` when optional. The totals are read from the marks, so a reader can check them by
eye: "without the *OPTIONAL" leaves out the `*` lines, "current salary week" counts only the
unmarked ones. A paid optional bill shows `/`: it is no longer optional once it is paid.

Blocks follow the owner's group names, in the order of each block's earliest due date, with the
ungrouped bills as one block. Yearly and quarterly shares appear as their own lines, so the list adds
up to what the plan says the paycheck must cover.

The download links carry no `download` attribute: the server already sends each file as an
attachment with its name. The attribute hands the request to the browser's download manager, which
leaves out headers a page request carries, and on the test server that lost the session.

## Dependencies

- Blocked by: [[Paid Optional And Grouped Bills]]

> [!warning] Risks
> - The owner's sample states a "Total (ALL)" of 97200; its lines add to 97560. The export always
>   computes; the owner is told once.
> - The PDF's built-in fixed-width font covers Latin text only. A name with a character outside it,
>   such as an emoji, shows as `?` in the PDF; the text file and Word document keep it.
> - Downloads from the installed iPhone app open in a preview sheet rather than saving; checked on the
>   real phone at release.

## Related

- Theme: [[Paycheck And Bills Out Of Sync]]
- From: [[Handwritten Paycheck List]]
- Phase: [[ROADMAP]]
