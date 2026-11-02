---
description: Turn .idea/ ideas into SPECS.md, a phased ROADMAP.md, and broken-down epics
argument-hint: [optional focus, e.g. "just the auth theme"]
allowed-tools: Skill, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
---

Invoke the `shape` skill and follow it in full. Focus: **$ARGUMENTS**

- Empty `$ARGUMENTS`: shape everything at `status: promising` or above.
- Existing `SPECS.md`: amend it. Preserve accepted decisions and keep phase numbering stable.
- Too few ideas to shape honestly: stop and offer `/brainstorm` rather than inventing a plan.
