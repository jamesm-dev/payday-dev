---
title: Data Sources
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, data]
status: active
---

# Data Sources

Three stores, each with exactly one owner. Keeping them separate is what lets the page be editable
without `.management/` becoming a rival source of truth for the plan.

| Store | Holds | Owner | Written by |
|---|---|---|---|
| `.idea/` | Intent — epics, phases, acceptance criteria | The plan | `/shape` |
| `state.json` | Derived structure — tasks, their phase and epic | Regenerated wholesale | `/setup` |
| `board.db` | **Authored data** — assignees, estimates, actuals, points, links, test runs | People | This page, and sync |

`board.db` is owned by the dashboard alone. It never holds task *text* or structure — only what
people record *about* a task. Tables in [[Database Schema]].

## The join key: task reference ID

Every task carries a stable id like `TSK-7F3A21`, written into the epic note as an Obsidian block
reference on its acceptance-criteria line:

```markdown
- [ ] A document survives a restart ^tsk-7f3a21
```

`/shape` assigns it once, when the criterion is first written, and never reassigns it. It survives
rewording, reordering, and regeneration — which is precisely why authored data can hang off it.
`state.json` carries it, `board.db` keys on it, and the drawer displays it.

The id is displayed uppercase (`TSK-7F3A21`) and stored lowercase in the block reference, because
Obsidian block refs are lowercase by convention. Compare case-insensitively.

> [!warning] Never match on task text
> If a task has no id, show the card with a muted `no id` and disable its editing. Do not invent an
> id, and never fall back to matching on text — a reworded task would silently inherit another
> task's assignees, time, and PR.

## Two kinds of task

Structure is derived, with one deliberate exception: tasks created on the board. They live only in
`board.db` with `origin = 'authored'` and an `ADH-` id, are identified by that id in the UI, and are
invisible to `/shape` and `/setup`. Promoting one into its epic means writing an acceptance criterion
into `.idea/`, which is `/shape`'s job and not this page's. [[Board]] covers why the distinction is
not cosmetic.

Sprints, team members, and their contribution are authored in full — `.idea/` has phases, not
sprints, and no opinion about people. See [[Sprints]] and [[Team]].

## Commits as evidence

Git hooks record every commit into `board.db` and `.management/commits.jsonl`, linking it to any
task ids in the message. Hooks are shell scripts: they write data, **never vault Markdown**, since
they cannot go through the Obsidian MCP.

A commit is evidence that work happened. It never marks a task done — completion comes from a
verified exit criterion. Commits referencing no task are the record that unplanned work happened at
all; `commits.jsonl` keeps them, and **no page reads it yet**. See
`.claude/skills/setup/references/git-hooks.md`.

## Sync, not live fetch

PR status and test results come from outside the project. **The page never fetches them.** Claude
writes them into `board.db` during `/setup` or an explicit refresh; the page reads only the database.

This is not a stylistic preference. A browser page cannot call an MCP server — MCP tools run on
Claude's side — so any design where the page fetches PR status simply cannot work.

Consequences the UI must honour:

- Every externally sourced row carries `synced_at`.
- The page displays that timestamp wherever it shows synced data.
- Stale is shown as stale. Never present an old status as though it were current.
- A failed or skipped sync leaves the previous value in place, with its original timestamp.

## What regeneration may and may not touch

When `/setup` regenerates:

- **Rewritten:** `state.json` and the derived sections of the Markdown files.
- **Never touched:** every row in `board.db`. Regeneration must not clear an assignee or a logged
  hour.
- **Orphans:** if a task id disappears from `.idea/` — its criterion was deleted — its `board.db`
  rows are kept and marked orphaned, not deleted. Report them so a person decides. Data a human
  typed is never destroyed by an automated regeneration.

## One derivation, read by every view

Structure comes from `state.json`; status, points and priority may be overridden in `board.db`. The
**effective** value of a task is the plan with those overrides applied — and it must be computed
**once**, in one place, and read by every section.

This is not tidiness. Board, Specs, Status and Team each derived "done" for themselves, and parking
a task moved the card while Specs and the headline tiles went on counting the plan as though nothing
had happened. Two views showing different numbers for the same question is worse than a view showing
none: the reader cannot tell which one is lying.

> [!warning] A section that computes its own status is a bug
> If a view needs to know whether a task is done, parked, or how many points it carries, it reads
> the shared index. Never `task.done` straight from `state.json` in a component — that value is the
> plan's opinion, not the current one.

Changes propagate without a reload: a write refreshes the shared data, the index recomputes, and
every section re-renders from it. Switching tabs must never show a stale number, because there is
only one number.

## Parked work and denominators

Parked work leaves the denominator rather than sitting in it forever:

- Specs counts read **done / still required**, with the parked count shown beside them.
- Phase progress and the headline tile exclude parked work from the total.
- A member's load excludes parked tasks — set aside is not pending.

Never simply subtract it and move on: every place a denominator shrank says how many were parked, so
progress cannot be manufactured by parking things.
