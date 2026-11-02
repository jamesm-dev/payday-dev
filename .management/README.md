---
title: README
created: 2026-08-30
updated: 2026-09-01
tags: [meta, management]
status: active
---

# Project Management

This folder tracks **how the work is actually going**. It is the execution layer sitting under the
idea vault in `.idea/`.

## The split — the one thing to understand

| Folder | Holds | Changes when |
|---|---|---|
| `.idea/` | **Intent.** What we are building and why. Ideas, spec, roadmap, epics, decisions. | The plan changes |
| `.management/` | **State.** Progress, blockers, dates, what shipped. | Work happens |

`.idea/` is upstream. Everything here is **derived** from it, and adds only what `.idea/` does not
track: status, dates, blockers, and a record of what actually shipped.

> [!warning] This folder is not a second source of truth for the plan
> If reality contradicts the roadmap, that is a signal to amend the plan with `/shape` — not to
> quietly edit the roadmap from here. Never write back into `.idea/` from this folder.

There is one exception, and it is deliberate. **Assignees, estimates, actuals, sprint points, links,
and test runs are authored here**, because `.idea/` has no opinion about who does a task or how long
it took. They live in `board.db`, keyed on each task's reference id, and are never derived from
anything. Structure stays derived; that data does not.

## What lives here

| File | Holds | Written by |
|---|---|---|
| `README.md` | This file | Ships with tateru; `/upgrade` keeps it current |
| `DESIGN.md` | Index of the dashboard design | By hand |
| `design/` | The design spec, one concern per note | By hand |
| `contract/` | The machine-checkable half of that spec: strings, measurements, order, fixtures | By hand |
| `board.db` | Assignees, effort, PR links, test runs — the dashboard's own store | People, via the dashboard |
| `BOARD.md` | Every task by status, each linked to its epic | Generated |
| `PROGRESS.md` | Per-phase rollup with exit criteria | Generated |
| `BLOCKERS.md` | What is stuck, since when, and the next action | Generated + hand notes |
| `CHANGELOG.md` | Dated log of what actually shipped | Appended |
| `state.json` | Machine-readable snapshot — the dashboard's data source | Generated |
| `commits.jsonl` | Append-only commit log | The post-commit git hook |

**Before `/setup` has run, only `README.md`, `DESIGN.md`, `design/`, and `contract/` exist.** Every
other row above is created by `/setup`, once there are real epics to derive it from — writing one now would mean inventing
progress that has not happened. Until then, do not read, link to, or cite any of them; if a question
needs `BOARD.md` or `PROGRESS.md`, the answer is that the work has not started.

## How it stays accurate

- Regenerated from `.idea/` on every `/setup` run.
- A task exists only if an epic's acceptance criteria created it. Nothing is invented.
- An epic with no acceptance criteria is reported as a gap, not filled in.
- A task is ticked only against evidence — a verified check, not an assumption.
- Hand-written notes in `BLOCKERS.md` and `CHANGELOG.md` survive regeneration; derived sections
  are rewritten.
- `state.json` is generated wholesale. Never hand-edit it.

## Obsidian

Same conventions as `.idea/` — see
[the vault contract](../.claude/skills/shared/vault-contract.md).

**Open this folder itself as a vault**, not the project root. Obsidian ignores any folder whose name
starts with a dot, so `.management/` is invisible if it sits inside a vault — but it works fine as a
vault *root*, because the rule applies to a vault's contents, not to the root itself.

That makes `.idea/` and `.management/` two separate vaults.

> [!warning] Wikilinks cannot cross between them
> `[[Some Epic]]` written here will not reach `.idea/epics/`. Use a relative Markdown link for
> anything pointing at the idea vault — it resolves in VS Code and on GitHub, and degrades to plain
> text in Obsidian rather than showing as a broken link. Wikilinks are for links *within* this
> folder, such as [[DESIGN]].

## The dashboard

Until `/setup` has run there is no dashboard, because there is no app to serve it from. Whether one
exists after that is the project's choice: `/setup` records it in `PROGRESS.md`.

When `/setup` does run, it offers to serve this folder at a `/management` route — **after** the app
is built and verified, never alongside it, because the page is assembled from the app's own theme,
components and dark mode. Where the app has none of those yet, it offers to defer instead; tracking
carries on regardless, and only the page waits. The page reads `state.json` and is built to [[DESIGN]]. It is opt-in and gated — by default
it returns a 404 outside development, because it exposes the roadmap, blockers, and unshipped plans
to anyone who can reach it.

Structure comes from `.idea/` and is read-only there; assignees, points, and ad-hoc tasks are
authored into `board.db`, which is gitignored because it holds names and is a binary file git cannot merge. It is one
person's board, and it is not regenerable — parks, advances and confirmations live only there — so
back it up rather than deleting it.
