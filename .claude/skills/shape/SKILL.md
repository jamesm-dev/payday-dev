---
name: shape
description: Turn brainstormed ideas in .idea/ into a committed SPECS.md and a phased ROADMAP.md with clear goals and exit criteria, breaking ideas down into traceable epics. Use when the user wants to move from ideas to a plan, asks "what do we build first", "turn this into a roadmap", "write the spec", "break this down", or before running setup when SPECS.md does not exist yet.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
---

# Shape

The bridge between `brainstorm` and `setup`. Ideas go in; a spec, a phased roadmap, and broken-down
epics come out — with traceability in both directions. Read
`.claude/skills/shared/vault-contract.md` before writing anything, and
`.claude/skills/shared/quality-bar.md` before choosing any technology — it governs how stack and
structure decisions are resolved, and requires a performance budget in `SPECS.md`.

**Plain language.** Everything you say to the person — questions, plans, summaries, reports —
follows `.claude/skills/shared/plain-language.md`: assume they are not a developer, use simple
words, recommend an option when you ask, and explain any technical word the first time it appears.
Notes in `.idea/` may stay technical; explain them, don't paste them.

## Phase 1 — Read the vault

Read `.idea/INDEX.md`, every `themes/*.md`, every `notes/*.md` not `superseded`, the most recent
session note's **Intent ledger**, and any existing `SPECS.md` / `ROADMAP.md` / `decisions/*.md`.

- **No `.idea/` or fewer than ~5 ideas?** Stop and say so: run `/brainstorm` first. Shaping thin
  input produces a confident-looking plan built on nothing. Offer to run brainstorm now.
- **Existing SPECS.md?** You are *amending*, not replacing. Preserve accepted decisions, keep phase
  numbering stable, and record what changed and why.
- Also read the repo itself. A lockfile or an existing framework outranks any idea note.

## Phase 2 — Restate the intent, then fill the gaps

Restate the Intent ledger in your own words and say what has changed since it was written.

Then identify what the vault cannot tell you, and ask — via `AskUserQuestion`, batched, up to 4 per
call. Every question leads with your recommended option marked `(Recommended)`, with the reason
drawn from a specific note: *"[[Realtime Presence]] assumes websockets, so..."*. Never present a
blank menu when the notes imply an answer. If the user says "you decide", decide, record it as an
ADR, and move on — do not re-ask.

Gaps worth closing before planning: the primary user and the job they hire this for; the one metric
that says it worked; the hard constraints (deadline, budget, team size, must-use tech); what is
explicitly out of scope for v1; and the **performance budget** — the target device and network, and
the interaction that has to stay fast.

Ask these as the person would think about them, not as a developer would. "Will people mostly use
this on their phone?" — not "What is the target device class?". "How long is too long to wait for
a page?" — not "What is the p95 latency target?". Turn their answer into the precise number
yourself, and read it back to them in plain words.

**You choose the technology; they approve it.** Most people using tateru are not developers and
cannot judge one framework against another. Propose the stack yourself, against `quality-bar.md`,
and explain each choice by what it means for them — cost, effort, what it makes easy or hard later
— never by its technical merits alone. Ask about the stack only when a choice genuinely changes
something they care about (a monthly bill, a service they already pay for, a tool their team must
use). Per `quality-bar.md` those numbers become Phase 0 exit
criteria, so ask for them here rather than inventing them later.

## Phase 3 — Break ideas down into epics

An idea is a bet. An epic is deliverable work. The conversion:

1. Take every idea at `promising` or above, plus anything the user just elevated.
2. **Decompose** each into epics of roughly 1-5 days. An epic that cannot be described by its
   *observable outcome* is still an idea — split it again.
3. **Merge** where two ideas need the same substrate; that substrate is its own epic and its
   `sources` lists both.
4. **Surface the invisible** — auth, migrations, deploy pipeline, error handling, seed data. Idea
   notes never contain these and a roadmap without them is fiction.
5. **Spikes are epics too.** Any idea with `confidence` ≤ 2 becomes a timeboxed spike whose exit
   criterion is a decision, not a feature.
6. Write each to `.idea/epics/<Epic Title>.md` with acceptance criteria as `- [ ]` tasks and
   `sources:` pointing back at its idea notes. Set `epic:` on those notes and flip them to
   `committed`.
7. **Give every acceptance criterion sprint points.** Not optional, and not left for someone to
   fill in later — a points field that starts empty on thirty tasks stays empty, and an unpointed
   backlog cannot answer "how much is on this person" at all.

   Write them inline, before the block reference, because a block reference must end the line:

   ```
   - [ ] A document survives a restart (3 pts) ^tsk-7f3a21
   - [ ] It reloads without a prompt (1 pt) ^tsk-9c04e8
   ```

   Use a Fibonacci-ish scale — 1, 2, 3, 5, 8, 13 — and size **relative effort, not hours**. A 13 is
   a criterion that should have been split; treat it as a signal to re-decompose rather than a
   number to record.

   Points are a plan-time estimate and live in `.idea/`. A person can override one later on the
   dashboard, and that override is authored data in `board.db` — the estimate itself is never
   rewritten from there.

8. **Give every acceptance criterion a task reference id** as an Obsidian block reference:
   `- [ ] A document survives a restart (3 pts) ^tsk-7f3a21`. Six lowercase hex characters, unique across
   the vault. Assign once and **never reassign** - the management dashboard keys assignees, effort,
   and pull requests on it, so a changed id orphans real data. When amending an epic, add ids only
   to criteria that lack one; leave existing ids alone even if the wording changed.

Anything not committed stays in `notes/` untouched. Do not quietly drop ideas — list what you left
out and why.

## Phase 4 — Sequence into phases

Load `references/phases.md`. The rules that matter:

- **Every phase is a vertical slice** that ends in something runnable and demoable. No "Phase 1:
  backend, Phase 2: frontend".
- **Phase 0 is always a walking skeleton**: the thinnest end-to-end path — one route, one query, one
  test, deployed. It de-risks the stack before any feature depends on it.
- Each phase gets: a one-sentence **Goal** stated as an outcome, its **Epics** as wikilinks, **Exit
  criteria** that are checkable by someone else, a **Demo** sentence, **Risks**, and **Non-goals**.
- Order by dependency first, then by risk — pull the assumption that could kill the project into the
  earliest phase that can test it. Never sequence by what is easiest.
- 3-6 phases. More than that is a wish list; fewer is not a plan.

## Phase 5 — Write the artefacts

Per `references/templates.md`:

- `.idea/SPECS.md` — the contract `setup` consumes: identity, users, scope and non-goals, the stack
  with a rationale per choice, the **performance budget**, data model sketch, decisions table, open
  questions, success metrics. Every stack rationale must name the demand it serves, what it costs,
  and what it beat — see `quality-bar.md`. Familiarity is a legitimate reason, but record it as one.
- `.idea/ROADMAP.md` — the phases, plus a mermaid dependency graph.
- `.idea/decisions/ADR-NNNN <Decision>.md` — one per consequential or hard-to-reverse choice.
- Update every touched idea note, every theme MoC, and regenerate `INDEX.md`.

Get the date from `date +%Y-%m-%d`. Number ADRs by scanning `.idea/decisions/` for the highest.

## Phase 6 — Verify traceability, then hand off

Before reporting, check and state the result of each:

- [ ] Every epic has ≥1 source idea note, and that note's `epic:` points back.
- [ ] **Every acceptance criterion carries points** in `(N pts)` form and a `^tsk-` id. No criterion
      is unpointed; capacity cannot be computed from a backlog with holes in it.
- [ ] Every committed idea appears in exactly one phase.
- [ ] Every phase has a goal, checkable exit criteria, and a demo.
- [ ] Every `SPECS.md` stack choice has a rationale that names its cost and its rejected
      alternative, and an ADR if it was contested.
- [ ] `SPECS.md` has a performance budget whose entries someone else could measure — or an explicit
      statement of why this product has no meaningful performance surface.
- [ ] Phase 0's exit criteria include measuring that budget.
- [ ] No orphan notes; `INDEX.md` matches disk.

Then present the phase table, the assumptions the plan rests on, and: **"Run `/setup` to build
Phase 0."** Ask for explicit sign-off before treating SPECS as `active`.
