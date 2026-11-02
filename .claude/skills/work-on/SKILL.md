---
name: work-on
description: Work on one task - a TSK id, an epic, a bug, or a described change - using the smallest effective agent team. Routes first, then implements directly, with one implementer, or with parallel specialist slices only when they are safely independent. Use when the user says "work on", "fix", "implement this task", "build TSK-…", or hands over one piece of work mid-phase. Not for planning (/shape, /epic) or building a whole phase (/setup).
allowed-tools: Agent, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

# Work on

One task, the cheapest safe way. `/setup` builds a whole roadmap phase; this does one piece of work
inside it, with agents that become specialists in whatever stack the project chose.

**Plain language.** Everything you say to the person — questions, plans, summaries, reports —
follows `.claude/skills/shared/plain-language.md`: assume they are not a developer, use simple
words, recommend an option when you ask, and explain any technical word the first time it appears.
Notes in `.idea/` may stay technical; explain them, don't paste them.

## The team

| Agent | Model | Does |
|---|---|---|
| `task-router` | sonnet | Picks the mode, the risk, and whether to check for duplicates |
| `repo-scout` | haiku | Bounded read-only research: duplicate check, locate, trace, log triage |
| `work-planner` | opus | Slices the missing work; decides what can safely run in parallel |
| `implementer` | sonnet | Builds one slice as the lane's specialist |
| `reviewer` | opus | Reviews one slice, or the integrated whole |
| `project-manager` | sonnet | Already exists. Progress and drift across the project — not per run |

The specialist personas come from `.claude/team/stack.md`, which `/setup` generates once the stack is
chosen and verified. Format and derivation: `references/stack-profile.md`. Without it, every agent is
a generalist and says so.

## Phase 0 — Resolve the task

1. Strip flags from `$ARGUMENTS`: `--plan-only` stops after the plan. Nothing left → ask what to work
   on and stop.
2. A `TSK-` id or epic name → find it in `.idea/epics/`. Not found → say so and list close matches;
   never guess.
3. **Not on the default branch** unless the user said so. Check `git branch --show-current`.

## Phase 1 — Route

Spawn `task-router` with the task text and any resolved id — nothing else.

- `NEEDS_CLARIFICATION` → ask its questions (`AskUserQuestion`, at most 3) and stop. If the reason is
  "no `app/`", point to `/setup`; if it is a plan change, point to `/shape` or `/epic`.
- `JEV: yes` and the JEV tools (`mcp__jev__*`) are available → see *JEV* below. Otherwise carry on.
- `DUPLICATE_CHECK: yes` → spawn `repo-scout` in `duplicate-check` mode. `exists` → report the
  evidence and stop unless the user asks to extend it. `partial` → carry the evidence forward so only
  the missing part is planned.

Status to the user: one line per stage, e.g. `route: STANDARD_TASK (medium — touches the session
model)`.

## Phase 2 — Act by mode

### QUICK_FIX

No subagents. Implement directly, as the specialist in `stack.md`'s matching
`### implementer — <lane>` section if one exists.

- `repo-scout` only if a few targeted reads cannot find what you need.
- The smallest correct change; the lane's focused check only.
- Report: changed files, the check and its result, assumptions, a suggested commit message carrying
  the `TSK-` id.

### STANDARD_TASK

1. Write a brief: goal, `files` (write scope), acceptance criteria, lane, focused check, task ids.
2. Spawn one `implementer` with the brief only.
3. Spawn `reviewer` (`slice`) only when `RISK` is high, it touches a `## Caution` path, it crosses
   lanes, or the user asked for review.
4. `CHANGES_REQUESTED` → resume the same implementer with the findings (`SendMessage`), or relaunch
   with a short change request. At most two rounds, then stop and report.

### PARALLEL_BUILD

1. Spawn `work-planner` with the router output and any scout evidence. `DOWNGRADE` → follow it.
2. `--plan-only` → show the plan and stop.
3. For each wave, spawn that wave's implementers **in one message**, so they run concurrently. Give
   each its own slice brief and nothing else. Use `isolation: "worktree"` when the slices run in
   parallel and the plan names any shared file.
4. As each implementer finishes, spawn its `reviewer` (`slice`). A slice is done only on `APPROVED`.
5. Keep the ledger yourself, one line per slice, updated in place:
   `S2 api · implementer ✓ · review ✗ (1 finding) · round 2`.
6. Once every slice is `APPROVED`, spawn one `reviewer` in `integration` mode with the plan and the
   list of changed paths.
7. Report the combined result, remaining risks, `DRIFT`, and a commit strategy — one commit per slice
   with its `TSK-` id, so the `commit-msg` hook links each to the board.

Downgrade the moment the work turns out smaller than routed. Never upgrade silently; say why.

## JEV — bounded decisions only, and only if present

If `mcp__jev__*` tools are available:

- After routing, `jev_classify` the mode against the four modes; on disagreement, take the more
  cautious mode and say so.
- Before a high-risk, migration, security, or cross-lane slice, `jev_check` "safe to start?" and
  `jev_score` the risk.

Pass it a short summary, never files, logs or diffs. It never writes code, plans, reviews, approves,
commits, or pushes. Unavailable → continue without it and say nothing.

## Fast route

Unless the user asks for tests, validation, review, or a CI-style run:

- No full suites, builds, coverage, e2e, or CI dry runs — the `pre-push` hook does that at push.
- Only the checks that leave the change clean.
- Prefer doing small work directly over spawning agents.

## Safety

- Never revert user edits. Never write to `.idea/` or `.management/` from here — progress is recorded
  through commits, and plan changes go through `/shape` or `/epic`.
- Never commit, push, open or edit a PR, or write to an external system unless asked in this session.
- No destructive command — `reset --hard`, `clean`, a remote migration, a deploy — without explicit
  approval.
- Cap parallel lanes at 4 unless the user approves more.

## Report

```
<MODE> · <persona(s) used> · <done | blocked | needs you>
Changed:   <paths, grouped by slice>
Checks:    <command → result, one line each>
Criteria:  <met>/<total> — <unmet, if any>
Risks:     <or none>
Commit:    <message(s), with TSK ids>
Next:      <the one thing to do next>
```

Finished criteria are ticked in the epic by the next `/setup`, which records the evidence; `/work-on`
never writes `.idea/`. Say so in `Next` when a task id was finished.

Never paste file contents, diffs, or full logs into the report.
