---
description: List this project's commands, then explain any one of them in depth (ELI5), on request
argument-hint: [optional: one command name, e.g. "shape"]
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
---

Explain this project's commands to a smart person who has never seen this repo — **as a
conversation, not a document**. Target: **$ARGUMENTS**

Two stages. **Never skip stage 1 to dump everything at once.** A wall of text is the failure mode
this command exists to avoid.

If `$ARGUMENTS` names a command, skip to stage 2 for that one, then offer the rest.

---

## Stage 1 — The menu

### Discover what actually exists. Never list from memory.

```
.claude/commands/*.md            project commands
.claude/skills/*/SKILL.md        project skills
~/.claude/commands/*.md          personal commands, if any
~/.claude/skills/*/SKILL.md      personal skills, if any
.claude/agents/*.md              subagents — never menu items, read in stage 2 when a command uses them
```

Read each **command** file fully — they are short. For each **skill**, read its frontmatter (the
settings block at the top) and its section headings. That is enough for one accurate line each, and
cheap. Full reading waits for stage 2. Never list a command that is not on disk.

### Then show the menu — and nothing more

1. One sentence of framing: how many commands there are and what they are collectively for.
2. A compact table: `/name` | one line each. **One line means one line** — what it does, in plain
   words, no jargon. No steps, no analogies, no caveats. Resist elaborating; that is stage 2's job.
3. One line on how they chain, if they do.
4. Flag anything genuinely surprising in a single line — a name collision, a command that behaves
   differently from its own description, a skill that is not this project's.

Keep the whole of stage 1 short enough to read without scrolling.

### Then ask

Use `AskUserQuestion`: *"Which one do you want me to walk through?"* Options are the discovered
commands. If there are more than four, offer the ones a newcomer most needs and let "Other" cover
the rest. Ask nothing else — one question, then stop and wait.

---

## Stage 2 — One command, in depth

Only the command they picked. Now read everything: the command file, its skill, and every
`references/` file that skill loads, plus any `.claude/skills/shared/` contract it reads — such as
`quality-bar.md`, which decides how `/shape` and `/setup` pick a stack — and every agent in
`.claude/agents/` the command spawns, such as the team `/work-on` routes between. Those shared files are not
commands and never appear in the stage 1 menu, but they are half of what a skill actually does, so a
walkthrough that skips them describes the wrong thing. Explain what really happens when you run it —
the command's
job *plus* the skill's method — never the ten-line handoff.

Use this shape:

**In one sentence.** No jargon.

**Think of it like...** One everyday analogy.

**What happens when you run it.** The real steps in order, in plain words: what it reads, what it
decides, what it asks you, what it writes. This is the depth — walk the phases, do not compress
them to three bullets.

**When to use it.** The situation where this is the right reach.

**When *not* to use it.** The neighbouring situation, and which command is better there.

**What it changes on your computer.** Files created or edited, honestly. Say plainly if it writes
nothing.

**Try it.** One realistic invocation with arguments filled in.

### Then keep the conversation going

End by offering the next step in one line — another command, or how they chain together. Track what
you have already covered and never repeat it. Stop when the user is done; do not work through the
whole list unprompted.

If they ask a follow-up about a command instead of picking a new one, just answer it. The menu is a
default, not a script.

---

## How to write it

- **Short sentences.** One idea each.
- **No unexplained jargon.** The first time a term like *scaffold*, *epic*, *migration*, *ADR*,
  *frontmatter*, or *vertical slice* appears, unpack it in the same sentence, in six words or fewer.
- **Concrete over abstract.** "It writes a file called SPECS.md" beats "it persists configuration".
- **Analogies from ordinary life** — cooking, moving house, packing a bag, planning a trip. Not
  analogies from programming, which defeat the purpose.
- **ELI5 means simple, never condescending.** No "little buddy", no baby talk, no exclamation marks.
  Assume the reader is clever and simply new here.
- **Say the honest thing.** If a command asks a lot of questions before doing anything, or overlaps
  another, say so and say which you would actually reach for.

## Scope

This project's commands and skills. Subagents are explained only as part of the command that uses
them — `/work-on`'s team, `/setup`'s `project-manager`. Mention Claude Code's built-ins (`/help`, `/clear`, `/config`)
only in one closing line pointing at `/help`.
