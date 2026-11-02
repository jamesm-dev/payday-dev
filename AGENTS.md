# AGENTS.md

For AI coding tools other than Claude Code — Codex, Cursor, Gemini CLI, Copilot, and anything else
that reads `AGENTS.md`.

**tateru is Claude-first.** It is built for [Claude Code](https://claude.com/claude-code), and the
complete instructions live in [CLAUDE.md](CLAUDE.md). This file does not repeat them. It tells you
what carries over to your tool, what does not, and how to follow the workflow by hand.

## Read first

1. [CLAUDE.md](CLAUDE.md) — the project rules. They apply to you too, except where they name a
   Claude Code feature you do not have.
2. [.claude/skills/shared/vault-contract.md](.claude/skills/shared/vault-contract.md) — how every
   note in `.idea/` and `.management/` must be written.
3. [.claude/skills/shared/quality-bar.md](.claude/skills/shared/quality-bar.md) — how stack and
   structure get decided.
4. `.claude/team/stack.md`, once `/setup` has written it — the stack, the real commands, and the
   specialist persona for each part of the codebase.

## What works in any tool

| Piece | Where |
|---|---|
| The plan: ideas, spec, roadmap, epics, decisions | `.idea/` — plain Markdown |
| Execution state | `.management/` — Markdown, `state.json`, `board.db` (SQLite) |
| Commit tracking and pre-push checks | `.githooks/`, wired by `git config core.hooksPath .githooks` |
| Dashboard conformance check | `bash .claude/scripts/dashboard-conformance.sh` |
| The method behind every command | `.claude/skills/<name>/SKILL.md` and its `references/` |

## What only works in Claude Code

- **Slash commands** (`/brainstorm`, `/shape`, `/setup`, `/work-on`, …). Your tool will not run them.
- **Subagents** in `.claude/agents/`, including the `/work-on` team and its parallel slices.
- **The vault hooks** in `.claude/settings.json`. Nothing validates your notes as you write them, so
  check them yourself (below).
- **`AskUserQuestion`** — where a skill uses it, ask the user in plain text instead.

## Following the workflow by hand

Each command is a thin wrapper around a skill. To do what a command does, open its skill and follow
it as a procedure:

| Command | Follow |
|---|---|
| `/brainstorm` | `.claude/skills/brainstorm/SKILL.md` |
| `/shape` | `.claude/skills/shape/SKILL.md` |
| `/epic` | `.claude/skills/epic/SKILL.md` |
| `/setup` | `.claude/skills/setup/SKILL.md` |
| `/work-on` | `.claude/skills/work-on/SKILL.md` — do every agent's step yourself, in order, without parallel slices |
| `/ship` | `.claude/skills/ship/SKILL.md` |
| `/maintain` | `.claude/skills/maintain/SKILL.md` |
| `/upgrade` | `.claude/skills/upgrade/SKILL.md` |
| `/decide` | `.claude/commands/decide.md` — it has no skill |

Expect to be slower and less checked than in Claude Code. That is the cost of not being in the tool
the workflow was built for.

## Non-negotiables

- After writing any note in `.idea/` or `.management/`, validate it, and fix what it reports:

  ```bash
  bash .claude/hooks/validate-vault-note.sh --check "<path to the note>"
  ```

- Application code lives in `app/`, and only `/setup`'s procedure creates it.
- Never delete or overwrite a note in `.idea/` — supersede it and link the replacement.
- Never fabricate a version, a CLI flag, a command's output, or a secret.
- Never edit `.claude/` to make it fit your tool. Claude Code users depend on it as it is.
