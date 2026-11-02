---
description: Pull a newer version of the tateru workflow into this project without touching its plan, state, or code
argument-hint: [optional: "check" to report what is new without changing anything]
allowed-tools: Skill, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

Invoke the `upgrade` skill and follow it in full. Hints: **$ARGUMENTS**

- `check`: stop after Phase 2. Report the version jump and what changed; change nothing.
- `.idea/`, `app/`, `.claude/team/` and the project's own `.management/` state are never touched.
- A workflow file the user edited is merged or asked about, never silently overwritten.
- Adding the upstream remote is confirmed first. Nothing is committed or pushed.
