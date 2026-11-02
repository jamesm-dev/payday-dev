---
name: brainstorm
description: Diverge on ideas for a project or feature, then capture them as atomic, grouped, Obsidian-compatible notes in .idea/. Use when the user wants to brainstorm, explore options, think through a problem space, generate ideas, or asks "what could we build", "what are our options", "help me think about X". Also use before shaping a spec when .idea/notes is thin or empty.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
---

# Brainstorm

Generate ideas that are actually worth having, then leave behind a vault that `shape` can turn into
a plan. Read `.claude/skills/shared/vault-contract.md` before writing anything to `.idea/`.

## Phase 1 — Ground yourself

1. `ls -R .idea/ 2>/dev/null`. If it exists: read `INDEX.md`, every `themes/*.md`, and any
   `notes/*.md` whose title touches the topic. **Do not re-propose an idea already in the vault** —
   build on it, sharpen it, or argue against it, and say which note you are extending.
2. Read `SPECS.md` and `ROADMAP.md` if present. Ideas that contradict a committed phase are still
   welcome, but you must flag the contradiction explicitly.
3. If the repo has code, skim README, the package manifest, and the main entry points. Ideas
   ungrounded in what exists are cheap and mostly useless.

## Phase 2 — Predict the intent before generating

This is the step that makes the rest accurate. Before any ideas, state in 4 short bullets:

- **The real goal** — what the user is actually trying to achieve, beneath the literal ask.
- **Success in 6 months** — what would have to be true for this to have been worth doing.
- **The constraint that binds** — time, money, skill, distribution, or an existing commitment.
- **What this is probably not** — the adjacent thing you are deliberately not going to explore.

Then say: *"Correct me on any of these and I'll re-aim."* Do not wait for a reply — proceed on your
stated reading, and revise if corrected. Record these as the **Intent ledger** in the session note;
`shape` reads it to write the SPECS rationale.

## Phase 3 — Diverge

Load `references/divergence.md` and work through the axes there. Non-negotiables:

- **8-12 distinct ideas before evaluating any of them.** Quantity first, judgment later.
- Every axis in the reference gets at least one idea, including the ones that are uncomfortable:
  the contrarian, the 10x-simpler, the premise-questioning, and the **horizon bet** — what becomes
  possible or obsolete in 12-24 months as costs, models, and platforms shift.
- One line of pitch plus one line of why-it-might-work, each. No essays at this stage.
- Never suppress an idea for being hard. Mark it `#stretch` and keep it.

## Phase 4 — Group, break down, converge

1. **Cluster** the ideas into 3-6 themes by the *problem they solve*, not by technology. A theme with
   one member is a signal you mis-clustered or found a genuine outlier — say which.
2. **Break down** anything that is really a container: if an idea implies three separable pieces of
   work, it is a theme, and its pieces are the notes.
3. **Score** each idea `impact` / `effort` / `confidence` 1-5 and assign a `horizon`. The numbers are
   a sort order and a conversation starter, not a verdict — state your reasoning in one line.
4. **Recommend** the 2-3 strongest with actual reasoning, name the riskiest assumption in each, and
   list the open questions.

## Phase 5 — Discuss

Ask for reactions and keep iterating as long as the user wants. Ideas the user contributes are
captured the same way and attributed to them in the session note. New ideas mid-conversation go
through Phase 4 too — do not let late ideas skip grouping and scoring.

## Phase 6 — Capture

Checkpoint after every round; do not save only at the end of a long session.

Write, per `references/note-templates.md`:
- `.idea/notes/<Idea>.md` — one per idea, atomic, scored, linked to its theme.
- `.idea/themes/<Theme>.md` — the grouping layer, with the theme's thesis and its member notes.
- `.idea/sessions/<YYYY-MM-DD> Brainstorm - <Topic>.md` — intent ledger, every idea produced as
  wikilinks, decisions reached, and next steps as `- [ ]` tasks.
- `.idea/INDEX.md` — regenerated, never appended to.

Get the date from `date +%Y-%m-%d`.

## Handoff

Close by telling the user what changed on disk, then: **"Run `/shape` when you want these turned into
a spec and a phased roadmap."** If 5+ notes now sit at `status: promising`, say so — that is the
signal that shaping is worth doing.
