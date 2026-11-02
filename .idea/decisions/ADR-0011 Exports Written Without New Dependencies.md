---
title: ADR-0011 Exports Written Without New Dependencies
created: 2026-11-01
updated: 2026-11-01
tags: [adr, decision]
status: accepted
decision: Hand-written text, PDF and DOCX
supersedes:
superseded_by:
---

# ADR-0011 Exports Written Without New Dependencies

## Context

[[Paycheck List Export]] produces one short list, about 20 to 40 lines in a fixed-width layout, as a
text file, a PDF and a Word document. The quality bar counts every dependency as a permanent cost and
prefers the platform where it is adequate. Node 26 already has everything a DOCX needs (`zlib.crc32`
for the zip) and a PDF of plain text needs nothing beyond a byte buffer.

## Options

| Option | Pros | Cons |
|---|---|---|
| Hand-written writers, about 200 lines in total | No dependency, no update churn, small server bundle; output fully under test | The formats are ours to get right; the PDF uses the built-in Courier font, which covers Latin text only |
| `pdfkit` and `docx` | Full layout engines, Unicode with an embedded font | Two dependency trees (fonts, zip, XML) to keep patched, for one fixed list |
| `pdf-lib` | Small API | Unmaintained since 2021, and the same Latin-only limit without embedding a font |
| Print the page to PDF in the browser | Nothing to write | Not a file the server can hand over; differs per browser and phone |

## Decision

Hand-written writers, chosen by `/epic` on 2026-11-01 under the quality bar's dependency rule. The
text file is UTF-8 with Windows line breaks, so Notepad shows it as written. The PDF is A4, Courier
from the 14 standard fonts, WinAnsi encoding, a new page when one fills. The Word document is the
minimum OOXML package — content types, relationships, one document part — in an uncompressed zip.

## Consequences

- No new package in `app/package.json`; `pnpm audit` has nothing new to watch.
- A character Courier cannot draw becomes `?` in the PDF only. If a name ever needs one, revisit
  with an embedded font and `pdfkit`.
- The writers are tested by reading their own output back: PDF cross-reference offsets, and the
  zip's entries and checksums.
