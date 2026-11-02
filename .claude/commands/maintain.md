---
description: Health-check a shipped project - dependencies, tests, stale decisions, work that never landed
argument-hint: [optional focus, e.g. "just dependencies"]
allowed-tools: Skill, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
---

Invoke the `maintain` skill and follow it in full. Focus: **$ARGUMENTS**

- Run the checks; never report health from a status file.
- Report ranked by cost of delay, and include what is fine so nothing unlisted reads as broken.
- Fix only with permission, batched by risk, verifying after each batch.
- Anything needing real work is an epic, not a maintenance edit — offer `/epic`.
