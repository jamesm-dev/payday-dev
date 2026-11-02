---
name: epic
description: Create one epic from .idea and generate its tasks, mid-project. Use when the user has a new idea to turn into work, wants to add an epic or feature to an existing project, says "make this an epic", "add this to the roadmap", "turn this into tasks", or wants to accept or reject an epic the project-manager agent suggested. The narrow, mid-flight counterpart to /shape.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch, Skill
---

# Epic

One epic, from idea to tasks, without re-shaping the whole plan. `/shape` is for planning a project;
this is for adding to one already underway.

**Plain language.** Everything you say to the person — questions, plans, summaries, reports —
follows `.claude/skills/shared/plain-language.md`: assume they are not a developer, use simple
words, recommend an option when you ask, and explain any technical word the first time it appears.
Notes in `.idea/` may stay technical; explain them, don't paste them.

Read `.claude/skills/shared/vault-contract.md` before writing anything to `.idea/`.


## An `ATT-` reference from the dashboard

`/epic ATT-3C81F0` names an item from **Needs attention** on the management dashboard. Resolve it
before anything else:

1. Read `.management/state.json` and find the blocker whose `ref` matches. If none does, say so and
   list the references that exist rather than guessing at a near match.
2. The item gives you the epic's substance directly: its `title` is the problem, `nextAction` is the
   first concrete step, `epic` names what it holds up, and `since` says how long it has been true.
3. Build the epic against **that**, and say in its `## Why` which attention item it came from and
   what will stop firing once it is done.

A `critical` item is the roadmap's own blocker — it is why a phase cannot finish — so its epic
belongs in the **current** phase unless the user says otherwise. A `warning` can wait.

> [!warning] The attention item is evidence, not the plan
> `.management/` is derived state. The epic still lands in `.idea/epics/` with sources traced back to
> an idea note, like any other. If the item traces to no idea, capture one first — an epic that
> exists only because a dashboard row said so has no recorded reason behind it.

## Phase 1 — Work out which case this is

Read `.idea/INDEX.md`, `SPECS.md`, `ROADMAP.md`, and the existing `epics/`. Then route:

| The user gave you | Do |
|---|---|
| A **subcommand** — `accept`, `reject`, `list` | Jump to *Suggested epics* below |
| An **existing idea note** to promote | Phase 2 |
| A **raw idea**, not yet captured | Capture it first — Phase 1b — then Phase 2 |
| **Nothing** | List idea notes at `promising` or above plus any `suggested` epics, and ask which to work on |

No `.idea/` at all, or no `SPECS.md`? Say so and send them to `/brainstorm` then `/shape`. An epic
with no spec to hang off is a task list, not a plan.

### Phase 1b — Capture first

If the idea is not yet in the vault, **invoke the `brainstorm` skill** to capture it properly, then
return here. Do not write an ad-hoc idea note yourself: brainstorm owns the intent ledger, the
scoring, and the theme grouping, and skipping it produces a note the rest of the workflow cannot use.

Keep it tight — this is one idea, not a full divergence session. Capture the note, score it, link its
theme, then carry on.

## Phase 2 — Check it belongs

Before writing anything, three questions, answered out loud:

1. **Does this already exist?** Compare against every epic. If it overlaps, say which, and propose
   extending that epic instead of creating a near-duplicate.
2. **Does it fit the spec?** If it contradicts `SPECS.md` or a recorded decision in `decisions/`,
   say so plainly. It may still be right — but it is then a spec change, and that is `/shape`.
3. **Which phase?** Existing phase, or after the current one. Never silently insert into a phase
   already in progress; ask, and say what it would displace.

> [!warning] Scope creep enters here
> Mid-project epics are how projects quietly double in size. If this is the third epic added to a
> phase, say so and ask what is being traded away. Naming the cost is not obstruction — it is the
> job.

## Phase 3 — Write the epic

To `.idea/epics/<Epic Title>.md`, per `.claude/skills/shape/references/templates.md`:

- `sources:` pointing back at the idea notes it came from; set `epic:` on those notes and flip them
  to `committed`.
- `phase:` set to the agreed phase.
- Outcome stated as what is observably true when it is done.
- `status: planned`.

If the epic is too big for one — more than about five days, or it needs more than one observable
outcome — **split it** and say why. Two honest epics beat one that hides its size.

## Phase 4 — Generate the tasks

Acceptance criteria are the tasks. For each:

- One observable outcome, finishable in a day or so.
- **Points, then a task reference id as a block ref**:
  `- [ ] The document reopens after a restart (3 pts) ^tsk-4b91c2`. Size relative effort on the
  1, 2, 3, 5, 8, 13 scale, as `/shape` does; a 13 is a criterion to split. When a size is not
  obvious from the notes, ask rather than guess. The validator rejects a criterion with no points.
- The id is six lowercase hex characters, unique across the vault. Assign once, never reassign —
  assignees, effort, and pull requests key on it.
- **Surface the invisible work** the idea note never mentions: migrations, auth, error states, seed
  data, tests, the deploy path. An epic without them is optimistic fiction.
- If confidence in the approach is low, the first task is a **timeboxed spike** whose exit criterion
  is a written decision, not a feature.

## Phase 5 — Wire it in and hand off

- Add the epic to `ROADMAP.md` under its phase, with its tasks counted. If that phase is already
  `verified`, set it back to `in-progress` and say so: it has new work, so `/setup` must build and
  verify it again before `/ship` releases it.
- Update the theme MoC and regenerate `INDEX.md`.
- Write an ADR into `decisions/` for anything consequential that the epic settled.
- Verify traceability both ways: every task has an id, the epic has at least one source note, and
  that note points back.

Close with the epic, its tasks, the phase it landed in, and: **"Run `/setup` when you want it
built."** If it changed the shape of the plan rather than adding to it, say `/shape` instead.

---

## Suggested epics

The `project-manager` agent writes epics at `status: suggested`. They are proposals: they belong to
no phase, count toward nothing, and are never built until a person accepts one.

| Subcommand | Does |
|---|---|
| `/epic list` | Every suggested epic, with why the agent proposed it and the evidence it cited |
| `/epic accept <name>` | Review it with the user, edit as needed, set `status: planned`, assign a phase, generate task ids, and link it from its theme and `INDEX.md` — Phases 2 to 5 above |
| `/epic reject <name>` | Set `status: cut` and add a `## Why rejected` section, after confirming |

Accepting is not rubber-stamping. Run Phase 2 on a suggestion exactly as on a user's idea — the
agent proposed it from evidence, but it did not weigh it against everything else competing for the
phase. Say plainly when you think a suggestion is wrong.

Rejecting **keeps** the note, at `status: cut`, with a `## Why rejected` section in the person's
words. Nothing in the vault is deleted, and this one matters more than most: the `project-manager`
agent reads cut epics before suggesting, so a deleted rejection would simply be proposed again.
