# CLAUDE.md

Project-wide instructions for Claude Code in this repository.

## This is the person's own project

Whoever opened this folder cloned tateru to **build their own app with it**. Treat it as their
project from the first prompt: run `/brainstorm`, `/shape` and `/setup` here, and build `app/` here.
Never warn that this looks like tateru's own repository, and never refuse or redirect a command
because of it — a git remote still pointing at `jamesm-dev/tateru.dev` is normal in a fresh clone,
and `/setup`'s first run handles it. Only the maintainer edits tateru itself, and only after
switching it on locally (`git config tateru.maintainer true`, never committed); see the last section.

## Always read `.idea/` first

`.idea/` is this project's thinking layer — the recorded intent behind the code. Before acting on
any prompt about this project, read the `.idea/` files relevant to it. A `UserPromptSubmit` hook
([.claude/hooks/idea-context.sh](.claude/hooks/idea-context.sh)) injects a snapshot of what exists
on every prompt; that snapshot is a pointer, not a substitute for reading the files.

Priority order when the prompt concerns what to build or how:
`.idea/SPECS.md` → `.idea/ROADMAP.md` → the relevant `.idea/epics/` and `.idea/notes/` → this file.
For "where does the work stand", read `.management/BOARD.md` and `.management/PROGRESS.md` instead —
but only once `/setup` has generated them. Before that they do not exist, and the roadmap is the
only answer available.

The repo is the source of truth for what exists; `.idea/` is the source of truth for what was
intended. On conflict, ask — do not silently pick one.

Three shared contracts, all authoritative:
- [vault-contract.md](.claude/skills/shared/vault-contract.md) — the **format** of every note in
  `.idea/` and `.management/`. Obey it when writing any note.
- [quality-bar.md](.claude/skills/shared/quality-bar.md) — **what gets built**: stack and structure
  choices in `/shape` and `/setup`, and the performance budget Phase 0 measures.
- [plain-language.md](.claude/skills/shared/plain-language.md) — **how tateru talks**. The person
  using it is assumed not to be a developer: questions, plans and reports use simple words and come
  with a recommendation. `.idea/` notes are the blueprint and may stay technical.

## Hooks

Three hooks in [.claude/settings.json](.claude/settings.json) enforce the above, not memory:

| Event | Script | Does |
|---|---|---|
| `SessionStart` | [vault-preflight.sh](.claude/hooks/vault-preflight.sh) | Audits every existing note against the vault contract and names any that drifted |
| `UserPromptSubmit` | [idea-context.sh](.claude/hooks/idea-context.sh) | Injects a snapshot of `.idea/` and whether `CLAUDE.md` exists |
| `PostToolUse` | [validate-vault-note.sh](.claude/hooks/validate-vault-note.sh) | Checks any vault note — from Write, Edit, or an optional Obsidian MCP — against the vault contract, blocking with the specific violations |

No hook gates a write: `.idea/` and `.management/` are always writable with `Write` and `Edit`. What
is enforced is Obsidian-compatible Markdown. Check one note by hand with
`bash .claude/hooks/validate-vault-note.sh --check "<note>.md"`.

All three fail open and never block on their own error. Everything outside those two folders passes
through untouched. If you change the vault contract, change the validator in the same edit — a rule
that only exists in prose is not a rule.

## Scripts

[.claude/scripts/](.claude/scripts/) holds checks nothing triggers automatically; a skill or a person
runs them by name. [dashboard-conformance.sh](.claude/scripts/dashboard-conformance.sh) checks a
built `/management` dashboard against the data contract in `.management/contract/` — strings,
measurements, and order. It needs only `bash`, `find`, `sed`, `tr` and `awk`, so it runs in any
project before any package manager exists. Exit `2` means it could not run, including "nothing built
yet". [project-log.sh](.claude/scripts/project-log.sh) is the project's commit history without
tateru's own; read commits through it. [selftest.sh](.claude/scripts/selftest.sh) checks tateru's own machinery — every hook and
script — and runs in CI on each push. **Run it after changing any hook or script**; a hook that
silently stops firing looks exactly like a project where nobody commits.

## Commands

| Command | Delegates to | Purpose | Stage |
|---|---|---|---|
| [/brainstorm](.claude/commands/brainstorm.md) | [brainstorm](.claude/skills/brainstorm/SKILL.md) | Diverge on ideas, capture them as grouped Obsidian notes | Idea |
| [/shape](.claude/commands/shape.md) | [shape](.claude/skills/shape/SKILL.md) | Turn ideas into `SPECS.md`, a phased `ROADMAP.md`, and epics | Idea |
| [/epic](.claude/commands/epic.md) | [epic](.claude/skills/epic/SKILL.md) | One epic and its tasks, mid-project. Also triages suggested epics | Development |
| [/setup](.claude/commands/setup.md) | [setup](.claude/skills/setup/SKILL.md) | Build the dev environment and the current roadmap phase | Development |
| [/work-on](.claude/commands/work-on.md) | [work-on](.claude/skills/work-on/SKILL.md) | One task with the smallest agent team: route, then build directly, solo, or in parallel slices | Development |
| [/ship](.claude/commands/ship.md) | [ship](.claude/skills/ship/SKILL.md) | Verify the readiness gates, then release | Production |
| [/maintain](.claude/commands/maintain.md) | [maintain](.claude/skills/maintain/SKILL.md) | Health-check a shipped project and fix the rot | Maintenance |
| [/upgrade](.claude/commands/upgrade.md) | [upgrade](.claude/skills/upgrade/SKILL.md) | Pull a newer tateru workflow into a cloned project, leaving its plan and code alone | Maintenance |
| [/decide](.claude/commands/decide.md) | — | Record an ADR | Any |
| [/explain](.claude/commands/explain.md) | — | List the commands, then explain one in depth (ELI5) | Any |

The [project-manager](.claude/agents/project-manager.md) agent oversees all four stages. It is an
auditor with exactly two write powers: it proposes epics at `status: suggested`, and it marks tasks
done in `board.db` from commit evidence — always with a note saying why, and never confirmed until
a person confirms it. It may not touch the plan, tick a criterion, or deploy.

`/work-on` drives a second team — `task-router`, `repo-scout`, `work-planner`, `implementer`,
`reviewer` — written stack-agnostic. They become specialists by reading `.claude/team/stack.md`,
which `/setup` generates from the verified stack
([format](.claude/skills/work-on/references/stack-profile.md)); its twin `checks.env` is what
`pre-push` runs. Never hand-write either from memory — no stack, no profile, generalist agents.

## Stack and commands

**Payday**, a personal budgeting app ([SPECS](.idea/SPECS.md)), lives in [app/](app/). The four v1
phases were built and tested locally by `/setup` on 2026-10-31, and Phase 4 on 2026-11-01, inside the
tateru.dev checkout by the owner's choice, with nothing committed and nothing deployed:
- sign-in;
- the schedule;
- the safe-to-spend number;
- guided setup;
- the payday check-in, the plan and reminders;
- loans and the debt-free date;
- the paycheck list: groups, optional and paid marks, and a text, PDF or Word download (ADR-0011).

What's still open needs a person, real phones or a release; see `.management/BLOCKERS.md`. See
[app/README.md](app/README.md).

| Layer | Choice |
|---|---|
| Runtime | Node.js 26.13.0 (`app/.nvmrc`), pnpm 12.16.1 (`packageManager`). Node 26 has no corepack: `npm install -g pnpm@12.16.1` |
| App | SvelteKit 3.1 with Svelte 5 and TypeScript 6, adapter-node, Vite 8 |
| Data | SQLite through Drizzle ORM and better-sqlite3; SQL migrations in `app/drizzle/`, applied at server start (ADR-0008) |
| Engine | Pure TypeScript in `app/src/lib/domain/`: money, dates, schedule, pay periods, safe to spend (ADR-0009), the plan, the check-in and loans |
| Sign-in | A password (scrypt), each device's PIN or face optional (passkeys via SimpleWebAuthn), recovery codes, server sessions, a strict CSP; `OWNER_SETUP_CODE` gates the first registration in production (ADR-0010) |
| Reminders | Web Push (`web-push`, `VAPID_*` secrets) sent by a job in the always-on process, with an `.ics` fallback |
| Tests | Vitest for code beside its file as `*.test.ts`; Playwright in `app/tests/*.e2e.ts` at iPhone (WebKit), Android and laptop sizes |
| Production | Fly.io, one machine and a volume, Litestream to object storage (`app/Dockerfile`, `app/fly.toml`); not yet deployed |

Every command runs from `app/`, never the root:

| Purpose | Command |
|---|---|
| install | `cd app && pnpm install` — also sets `core.hooksPath` to `.githooks` |
| dev | `cd app && pnpm dev` |
| lint | `cd app && pnpm lint` |
| typecheck | `cd app && pnpm check` |
| test | `cd app && pnpm test` — unit, then browser; `pnpm e2e:browsers` once per machine first |
| focused test | `cd app && pnpm vitest run <file>` · `cd app && pnpm playwright test <file> --project=iphone` |
| build | `cd app && pnpm build` |
| demo data | `cd app && pnpm seed` — a fictional household; sign in first |

Conventions the code relies on:

- SvelteKit 3 removed `$lib`: import with `#lib/...` and the file extension.
- Environment variables are declared in `app/src/env.ts`.
- Money is integer minor units, never a float (ADR-0007).
- Colours, type and spacing come only from `app/src/lib/styles/tokens.css`.
- Test names carry their `TSK-` id.

The `/work-on` profile is [.claude/team/stack.md](.claude/team/stack.md).

Git hooks live in [.githooks/](.githooks/). Husky is deliberately not used: it installs beside the
manifest in `app/`, cannot find `.git` at the root, and would be a dependency that does nothing.

## Conventions

- People use Windows, macOS and Linux. Keep scripts cross-platform; watch path separators and CRLF.
- Any command in a doc names the directory it runs in (`app/` for the app, the root for tateru).
- `.idea/` is intent; `.management/` is execution state, derived from it. Never let `.management/`
  become a second source of truth, and never edit `.idea/` from it silently.
- Never delete or overwrite a note in `.idea/`. Supersede it and link the replacement.
- Never fabricate a version number, a CLI flag, or a command's output. Verify it.
- Never invent or commit a secret. `.env.example` documents keys with empty values.
- When convenience and quality conflict in a stack or structure decision, resolve toward quality and
  state what it cost. This is a tiebreaker, not a licence to over-build — see `quality-bar.md`.

## Changing tateru itself — maintainer only

Applies only when `git config tateru.maintainer` is `true`. Everyone else is building their own
project, and none of this concerns them.

Commands stay thin: method lives in the skill and its `references/`. Release steps are in
[.claude/CHANGELOG.md](.claude/CHANGELOG.md); merging a version bump publishes the release. **When a command or skill changes, update `/explain`
and `AGENTS.md` in the same change** — `/explain` finds commands at run time, which is exactly why
this gets forgotten:

- [ ] The file sits where `/explain`'s **Stage 1** discovery list looks, and its **Scope** still fits.
- [ ] The command-to-skill table in [AGENTS.md](AGENTS.md) matches; it points at this file, never
      duplicates it.
- [ ] Run `/explain` once and read the output. On removal, confirm nothing still links to it.
