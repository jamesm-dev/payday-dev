# `.idea/` vault contract

The single source of truth for how the idea vault is structured and formatted.
`brainstorm`, `shape`, and `setup` all obey this file. If it conflicts with a skill, this wins.

## Folder layout

```
.idea/
  INDEX.md              Root Map of Content + dashboard. Always current.
  SPECS.md              The contract: what we are building and with what. Written by `shape`.
  ROADMAP.md            Phased plan with goals and exit criteria. Written by `shape`.
  themes/               One MoC per theme. The grouping layer.
  notes/                Atomic ideas. One idea per file. Never more.
  epics/                Broken-down deliverable work. Links notes upward, phases downward.
  decisions/            ADRs. One irreversible-ish decision per file.
  sessions/             Brainstorm session logs, dated.
  assets/               Images, diagrams, exports.
```

Create with `mkdir -p`. Never nest deeper than this — Obsidian's graph is the hierarchy, not folders.

## Obsidian compatibility — strict

**Filenames**
- `Title Case With Spaces.md`. Under ~60 chars.
- Never use `# ^ [ ] | : / \ * ? " < >` — Obsidian and/or Windows reject them.
- ADRs are the one exception to Title Case: `ADR-0007 Use Postgres Over SQLite.md`.
- The filename (minus `.md`) must equal frontmatter `title`. Wikilinks depend on it.

**Frontmatter** — every note, no exceptions.
- Dates unquoted `YYYY-MM-DD`. Get today from `date +%Y-%m-%d`; never guess.
- Tags lowercase kebab-case, no `#` prefix inside frontmatter, no spaces.
- Numeric fields unquoted so Dataview can sort them.

**Links**
- `[[Note Title]]` or `[[Note Title|display text]]`. Never bare Markdown links between vault notes.
- Link liberally. A wikilink to a note that does not exist yet is a valid stub, not an error.
- Every note links *up* (to its theme) and *sideways* (to related notes). No orphans.

**Body**
- Exactly one `#` H1, matching `title`. `##`/`###` below it. The exception is a fixed-name system
  file — an all-caps filename such as `README`, `INDEX` or `DESIGN` — whose H1 may describe it
  (`# Idea Vault`), because its filename is a role, not a subject.
- Inline tags `#kebab-case` — never at the start of a line (Obsidian parses that as a heading).
  Indent them or put them inline after text.
- Tasks as `- [ ] text` so Obsidian's task queries pick them up.
- Callouts: `> [!question]`, `> [!warning]`, `> [!tip]`, `> [!note]`, `> [!danger]`, `> [!example]`,
  `> [!abstract]`, `> [!todo]`, `> [!success]`. Use them for anything a reader must not skim past.
- ```mermaid fences render natively. Use for flows, state, and dependency graphs.
- Block refs: append ` ^kebab-id` to a line you expect to cite as `[[Note#^kebab-id]]`.
- Spaces, never tabs. No HTML unless Markdown genuinely cannot express it.
- Dataview queries are allowed only in `INDEX.md` and `themes/`, in a clearly optional section —
  they degrade to a visible code block when the plugin is absent, so nothing load-bearing goes there.

## Shared frontmatter schema

Every note:
```yaml
title: <matches filename>
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [ ... ]
status: <see vocab>
```

**`notes/` idea notes** add:
```yaml
theme: <Theme Title>        # wikilink target, unbracketed here
horizon: now | next | later | someday
impact: 1-5                 # how much it moves the goal
effort: 1-5                 # 5 = expensive
confidence: 1-5             # how sure we are it works
epic:                       # filled in by `shape` once committed
```

**`epics/` notes** add:
```yaml
theme: <Theme Title>
phase: <n>                  # roadmap phase, or empty if uncommitted
sources: [Idea A, Idea B]   # the notes this epic came from
```

**`decisions/` ADRs** add: `decision`, `supersedes`, `superseded_by`.

## Status vocabulary — do not invent new values

| Type | Values |
|---|---|
| idea note | `seed` → `exploring` → `promising` → `committed` / `parked` / `superseded` |
| theme MoC | `active` / `dormant` |
| brainstorm session | `active` / `done` |
| epic | `suggested` → `planned` → `in-progress` → `done` / `cut` |
| SPECS / ROADMAP | `draft` → `active` → `superseded` |
| a phase, inside `ROADMAP.md` | `planned` → `in-progress` → `verified` (`/setup`) → `done` (`/ship`) / `cut` |
| ADR | `proposed` → `accepted` / `rejected` / `superseded` |

## Two vaults, and how to write to them

Obsidian ignores any folder whose name starts with a dot, so `.idea/` and `.management/` are
invisible as folders *inside* a vault. Each is therefore opened as its **own vault root**, where the
rule does not apply.

Two consequences:

1. **Wikilinks cannot cross between the two vaults.** `[[Some Epic]]` written in `.management/` will
   never resolve to `.idea/epics/`. Use a relative Markdown link for anything crossing over — it
   works in VS Code and on GitHub, and degrades to plain text rather than a broken link in Obsidian.
   Wikilinks are for links *within* one vault.
2. **Write notes with ordinary `Write` and `Edit`.** Both folders are always writable and nothing
   gates that. What is enforced is the **format**: every note must satisfy this contract so each
   folder stays a valid Obsidian vault. The `PostToolUse` validator checks every write and blocks on
   violations; the `SessionStart` audit catches notes changed outside Claude. An Obsidian MCP server
   is optional — if one is configured and covers the folder its `obsidian_*` tools work too, and are
   validated identically.

### Not everything in these folders is a note

The contract governs **Markdown**. `.management/` also holds data that is deliberately not
Obsidian-compatible and must never be given frontmatter:

| Path | Is |
|---|---|
| `.management/board.db` | The dashboard's SQLite store |
| `.management/commits.jsonl` | The append-only commit log the `post-commit` hook writes |
| `.management/state.json` | The generated snapshot the dashboard reads |
| `.management/contract/` | The machine-checkable half of the dashboard design — strings, measurements, order, and JSON fixtures |

The validator only inspects `.md`, so these pass through untouched. That is the intent, not an
oversight: they are read by scripts and test runners in any language, and a YAML header would break
every one of them.

### `suggested` epics are proposals, not plan

An epic at `status: suggested` was proposed by the `project-manager` agent, not agreed by a person.
It is the **only** thing that agent may write, and the only status it may write.

- It never counts toward progress, readiness, or any total.
- It belongs to no phase until a person accepts it.
- A person accepts it (`/epic accept`), edits it, or rejects it (`/epic reject`), which sets
  `status: cut` with a `## Why rejected` section. Nothing is deleted — a rejection is a decision,
  and the agent reads it so it never proposes the same thing twice.
- Nothing else may be written at `suggested`. An idea note uses `seed`; a spec uses `draft`.

## Invariants

1. **Never delete a note.** Kill an idea by setting `status: superseded` and linking what replaced it.
2. **Never overwrite.** Read, edit in place, bump `updated`.
3. **One idea per file.** If a note needs a second H1-worthy subject, split it.
4. **No orphans.** A new note is linked from its theme MoC and from `INDEX.md` in the same turn. The
   one exception is an epic at `status: suggested`: the `project-manager` agent may not edit
   existing notes, so `/epic accept` does its linking.
5. **Traceability runs both ways.** idea ↔ epic ↔ phase. Any deliverable must trace back to an idea;
   any committed idea must trace forward to an epic. `shape` enforces this.
6. **INDEX.md is regenerated, not appended to.** It must never drift from what is on disk.
