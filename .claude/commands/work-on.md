---
description: Work on one task with the smallest effective agent team - route first, then implement directly, with one specialist implementer, or with parallel slices only when safely independent
argument-hint: <TSK id | epic | bug | description> [--plan-only]
allowed-tools: Skill, Agent, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

Invoke the `work-on` skill and follow it in full. Task: **$ARGUMENTS**

- Empty: ask what to work on and stop. `--plan-only`: stop after the plan.
- Application work with no `app/` yet is routed to `/setup`, never built here.
- The agents become stack specialists from `.claude/team/stack.md`, which `/setup` writes. Before it
  exists they work as generalists and say so.
- This does one task. A whole phase is `/setup`; a change to the plan is `/shape` or `/epic`.
- Never commits, pushes, or opens a PR unless asked in this session.
