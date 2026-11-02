---
name: upgrade
description: Pull a newer version of the tateru workflow into a project that was cloned from it, without touching the project's own plan, state, or code. Use when the user asks to upgrade or update tateru, get the latest commands or hooks, pull workflow fixes from upstream, or asks "is my tateru out of date". Never use it to update the app's own dependencies - that is /maintain.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

# Upgrade

A project cloned from tateru is a frozen copy of the workflow. This brings the **workflow** up to
date and leaves everything the project owns exactly where it was.

**Plain language.** Everything you say to the person — questions, plans, summaries, reports —
follows `.claude/skills/shared/plain-language.md`: assume they are not a developer, use simple
words, recommend an option when you ask, and explain any technical word the first time it appears.
Notes in `.idea/` may stay technical; explain them, don't paste them.

## What is whose

| Owned by the workflow — upgraded | Owned by the project — never touched |
|---|---|
| `.claude/commands/`, `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `.claude/scripts/`, `.claude/settings.json` | `.idea/` — the plan |
| `.githooks/`, `.gitattributes`, `.github/workflows/selftest.yml` and `release.yml` (it only ever runs in tateru's own repository) | `app/` — the code |
| `.management/README.md`, `.management/DESIGN.md`, `.management/design/`, `.management/contract/` (except `sources.txt` and `tokens.map`) | `.claude/team/` — the generated stack profile; `.management/contract/sources.txt` and `tokens.map`, which `/setup` writes for this project; `.claude/TATERU_BASE` |
| `AGENTS.md`, `.claude/TATERU_VERSION`, `.claude/CHANGELOG.md` | Every other file in `.management/`, and the root `README.md` |

`CLAUDE.md` is shared: `/setup` writes the project's stack and commands into it. It is merged, never
replaced. So is `.gitignore`: take tateru's new lines (the self-test checks some of them) and keep
the project's own. So is `.claude/agents/project-manager.md`, which `/setup` tailors per project: the
three-way merge below keeps that tailoring and still brings in tateru's fixes to the agent.

A workflow file the user has edited is still theirs to decide on. **Never overwrite a local edit
silently** — that is the one way this skill can destroy work.

## Phase 1 — Where are we

1. Read `.claude/TATERU_VERSION`. Missing means the project predates versioning: say so. Phase 3
   then finds its starting point from the git history it shares with tateru.
2. Find the remote that points at tateru, whatever it is called. A plain `git clone` names it
   `origin`, so never assume `tateru`:

   ```bash
   git remote -v | awk '/jamesm-dev\/tateru\.dev/ { print $1; exit }'
   ```

   Use that name everywhere below, written `<up>` here, and set
   `git config remote.<up>.tagOpt --no-tags` so a plain fetch never brings tateru's bare `v*` tags
   back into the project. If no remote matches, **ask before adding
   one**, then use `tateru`:

   ```bash
   git remote add tateru https://github.com/jamesm-dev/tateru.dev.git
   ```

3. Fetch tateru's release tags **into their own namespace**, so they can never collide with the
   project's own `v*` tags from `/ship`:

   ```bash
   git fetch <up> --no-tags '+refs/tags/v*:refs/tags/tateru/v*'
   git tag -l 'tateru/v*' --sort=-v:refname | head -1
   ```

   That newest `tateru/v<version>` is the **target tag**; read the changelog entries between the two
   versions with `git show tateru/v<version>:.claude/CHANGELOG.md`. Never use a bare `v*` tag here —
   in a project that has released, that is the project's own version, not tateru's. Unreleased work
   on `<up>/main` is never installed.
4. Already current → say so and stop.
5. Refuse to start on a dirty working tree (`git status --porcelain`). Ask the user to commit or
   stash first, so the upgrade is one reviewable diff they can throw away.

## Phase 2 — Show what is coming

Before changing anything, report: the version jump, the changelog entries in between (in plain
words, not pasted), and any entry marked **Breaking**. Ask whether to proceed.

## Phase 3 — Apply, file by file

The base is tateru's tag for the local version, `tateru/v<local version>`. For every workflow path that
differs between that tag and the **target tag** `tateru/v<upstream version>` — never `<up>/main`, which can
carry unreleased work:

| Local file vs. base | Do |
|---|---|
| Identical — never edited | Take the upstream version: `git checkout tateru/v<upstream version> -- <path>` |
| Edited locally, unchanged upstream | Keep the local file. Nothing to do |
| Edited locally **and** changed upstream | Three-way merge with `git merge-file`. Clean merge → keep it and say so. Conflict → show both changes and ask: take upstream, keep local, or leave the conflict markers for the user |
| Deleted upstream | Ask before deleting a file the user may still use |
| New upstream | Add it |

No base tag (a project cloned before versioning, or the tag was never fetched): use the last
commit the project shares with upstream, `git merge-base HEAD tateru/v<upstream version>`. A normal clone keeps
tateru's history, so this finds the exact version it started from, and only the files the user
really edited need a decision. Comparing against the target tag directly instead would flag every
file upstream changed as a possible local edit — in testing, 19 questions for one real edit.

No shared history at all (a "Use this template" copy): then, and only then, compare local against
the target tag directly, take files that are identical or missing, and ask about each one that
differs.

Then:

- **`CLAUDE.md`**: show the upstream diff since the base, and apply only the workflow sections it
  changed. Keep the project's stack, commands and conventions as written. Once `app/` exists, never
  bring back the `<!-- tateru:before-setup -->` block — `/setup` replaced it on purpose.
  **A project set up at 0.1.0 or earlier** still has that section without markers ("No app exists yet"),
  and its stack under some other heading. Offer to convert it: remove the stale section, and gather
  the stack and commands under `## Stack and commands`, which the self-test checks for. Show the
  diff and ask; never rewrite the project's own wording silently.
- **Executable bits**: after checking out scripts, confirm `git ls-files -s .githooks .claude/hooks
  .claude/scripts` shows `100755`, and fix with `git update-index --chmod=+x` if not.
- Write the new version into `.claude/TATERU_VERSION`.

## Phase 4 — Verify

```bash
bash .claude/scripts/selftest.sh
```

Report the real result. If it fails, say which check and leave the tree as is for the user to
inspect; do not try to "fix" the workflow beyond what upstream shipped.

If the upgrade changed `.claude/settings.json`, tell the user to run `/hooks` once so Claude Code
reloads the hooks.

## Phase 5 — Hand over

Leave the changes uncommitted. Report: the version jump, files taken from upstream, files merged,
local edits kept, anything left with conflict markers, and the self-test result. Suggest a commit
message like `chore: upgrade tateru 0.1.0 → 0.2.0`.

Never push, and never touch a path in the right-hand column of the table above.
