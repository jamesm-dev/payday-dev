# Changelog

Changes to the tateru workflow itself — not to a project built with it. A project's own changelog is
`.management/CHANGELOG.md`.

`/upgrade` reads this file to tell a cloned project what changed. Mark anything that needs action
after upgrading as **Breaking**, and say what to do.

## Releasing tateru

1. Every change since the last release is listed under **Unreleased** below, in plain words.
2. Pick the version: patch for fixes only, minor for anything new, and before 1.0 a minor marked
   **Breaking** for anything a project must act on.
3. In one commit on `main`: rename **Unreleased** to `## <version> — <date>`, start a fresh empty
   **Unreleased** above it, and write the version into `.claude/TATERU_VERSION`. `selftest.sh`
   fails if the two disagree.
4. Tag that commit `v<version>` and publish a GitHub release from the entry. `/upgrade` diffs
   against the tag, so a version with no tag cannot be upgraded from.

## Unreleased

Nothing yet.

## 0.2.0 — 2026-10-31

Phases, completions and upgrades that hold together end to end. Projects on 0.1.0: read the
**Breaking** entries first; each says what to do.

- **Fixed:** `/epic` and `/shape` show acceptance criteria with points, as the vault validator
  requires. Following the old example blocked every `/epic` run.
- **Fixed:** the vault validator no longer counts `# comments` inside code blocks as headings, and
  now checks that a note's heading matches its title.
- **Fixed:** a commit naming a task `/epic` added since the last `/setup` is accepted, instead of
  rejected as unknown.
- **Fixed:** `/setup` replaces `CLAUDE.md`'s "No app exists yet" section once the app exists.
- **Fixed:** `/upgrade` works when the tateru remote is called `origin`, as a plain clone names it.
- **Fixed:** `/setup` creates `board.db` even when the dashboard is deferred, writes `checks.env`
  before it tests the hooks, and skips epics that were only suggested.
- **Fixed:** `checks.env` with Windows line endings no longer breaks every push.
- **Changed:** hooks never write `board.db`; `.management/README.md` ships with tateru and `/setup`
  leaves it alone.
- **Added:** this release process, and CI that blocks on macOS and Windows as well as Linux.
- **Breaking for projects that already ran `/setup`:** `/upgrade` offers to convert `CLAUDE.md` —
  the stale "No app exists yet" section goes, and the stack moves under `## Stack and commands`,
  which the self-test (and so CI) now checks. Say no and CI fails until you do it by hand. Any phase
  an older `/setup` marked `done` that was never released: set it back to `verified` in
  `ROADMAP.md`, so `/ship` can release it.
- **Breaking for clones:** a plain `git clone` brings tateru's own `v*` tags. The first `/setup` now
  moves them to `tateru/v*`. In a project that already ran `/setup`, run this once before the next
  `/ship`. It moves only tags that match tateru's exactly, never your own releases:

  ```bash
  git ls-remote --tags https://github.com/jamesm-dev/tateru.dev.git 'v*' |
    while read -r sha ref; do
      t=${ref#refs/tags/}; case "$t" in *'^{}') continue ;; esac
      [ "$(git rev-parse -q --verify "refs/tags/$t")" = "$sha" ] || continue
      git tag "tateru/$t" "$t" && git tag -d "$t"
    done
  ```

- **Breaking for 0.1.0 projects running `/upgrade`:** the 0.1.0 `/upgrade` fetches tags the old way
  and would collide with your own. Fetch the new skill first, then run `/upgrade`:

  ```bash
  up=$(git remote -v | awk '/jamesm-dev\/tateru\.dev/ { print $1; exit }')   # origin, or tateru after the new /setup
  [ -n "$up" ] || { git remote add tateru https://github.com/jamesm-dev/tateru.dev.git; up=tateru; }
  git config "remote.$up.tagOpt" --no-tags
  git fetch "$up" --no-tags '+refs/tags/v*:refs/tags/tateru/v*'
  git checkout tateru/v0.2.0 -- .claude/skills/upgrade .claude/commands/upgrade.md
  git commit -m "chore: fetch the new /upgrade"
  ```

  Commit it before running `/upgrade`, which refuses to start on uncommitted changes.

- **Breaking for a dashboard built at 0.1.0:** its derivations predate the confirm, unverified,
  rejected and advance fixes, so it counts unconfirmed work as done. `/upgrade` never touches
  `app/`: after upgrading, update the dashboard to match `.management/design/Derivations.md` and
  `API Surface.md` — add the `task_status.rejected_at` column, keep it on `POST /status`, and make
  `POST /phase/advance` upsert — then run the goldens (including the new
  `fixtures/lifecycle/`) and `dashboard-conformance.sh`. `/setup` now runs them on every run.
- **Changed:** phases now go `planned → in-progress → verified → done`. Once every phase is
  `verified` or `done`, `currentPhase` is the last phase and `/setup` reports the roadmap complete. `/setup` sets `verified`;
  only `/ship` sets `done`, after the release is live. Phase 0's "deployed" criterion is met by its
  first `/ship`, which was otherwise impossible to satisfy.
- **Fixed:** a task the agent marked done counts as not done until you confirm it. `/setup` now asks
  you to confirm or reject each one; nothing could set `confirmed_by` before.
- **Fixed:** a dashboard advance with unmet exit criteria is recorded as such in `ROADMAP.md`, not
  as a finished phase.
- **Fixed:** `/setup` ticks the epic criteria it verified, including work done through `/work-on`;
  nothing ticked them before.
- **Fixed:** `/setup` tracks progress on a red run too, and reads commits from `git log`, so pulled
  and squash-merged commits count, not only this machine's.
- **Changed:** `/epic reject` keeps the note at `status: cut` with a reason, so nothing in the vault
  is deleted and the agent never re-suggests a rejected epic.
- **Fixed:** `/upgrade` leaves project-written files alone: `project-manager.md`, and the dashboard's
  `sources.txt` and `tokens.map`.
- **Added:** `/ship` handles a re-run after a failed release without bumping the version twice.
- **Added:** `pre-push` runs an optional `BUILD` check, like CI.
- **Fixed:** the `verified` phase status is defined everywhere it is read: the vault contract, the
  `state.json` schema and the dashboard (`verified · not shipped`). A forced advance also sets
  `verified`, and `/setup` keeps `currentPhase` in step, so the dashboard never falls back.
- **Fixed:** a card dragged into Done counts as not done until `/setup` verifies it, as the board
  design always said; only the agent's completions were excluded before.
- **Fixed:** `/ship` measures the performance budget on the live release, and its exit-criteria gate
  treats criteria marked ` — at release` as this release's to prove, not as unmet.
- **Fixed:** adding an epic to a `verified` phase sets it back to `in-progress`, and `/setup` asks
  before building past a phase that was never shipped.
- **Fixed:** rejecting the agent's completion keeps a record, so it is not re-marked; confirming
  names an assignee; an accepted suggestion gets linked into the vault.
- **Fixed:** `/upgrade` installs the newest release tag, never unreleased work on `main`.
- **Fixed:** `/upgrade` keeps tateru's tags under `tateru/v*`, so a project's own release tags can
  never be mistaken for tateru's, or block the fetch.
- **Fixed:** the self-test passes after `/setup` has replaced the before-setup block in `CLAUDE.md`;
  it failed on every project that had run `/setup`.
- **Fixed:** readiness and the dashboard look at the phase waiting to ship, not the next one; `/setup`
  picks up a dashboard advance before choosing what to build; criteria marked ` — at release` no
  longer make every advance look forced.
- **Changed:** `/upgrade` three-way merges `project-manager.md` instead of skipping it, so fixes to
  the agent reach projects that tailored it.
- **Fixed:** a rejected agent completion is marked `rejected_at` and ignored, and never asked about
  again. A confirmed one reads `done · unverified`, like a person's drag: done only once a verified
  criterion ticks it.
- **Changed:** the docs say plainly that `board.db` is one person's board: gitignored, binary, not
  mergeable, and not regenerable.
- **Added:** `contract/fixtures/lifecycle/`, goldens for the confirm, unverified, rejected,
  consumed-advance, at-release and readiness-phase rules, so a rebuilt dashboard cannot skip them.
- **Fixed:** `/upgrade` merges `.gitignore` (tateru's new lines plus the project's own) and sets
  `tagOpt --no-tags` on the tateru remote, so moved tags stay moved.
- **Fixed:** commit history excludes tateru's own commits. The first `/setup` records where the
  project began in `.claude/TATERU_BASE` (a committed file, so every clone has it) and renames a
  plain clone's `origin` remote to `tateru`. An older project gets the file on its next `/setup`.
  Everything reads commits through `.claude/scripts/project-log.sh`, which also excludes tateru's
  fetched release tags and its remote, whatever that remote is called.
- **Fixed:** a consumed advance no longer moves the dashboard; a parked criterion keeps its text;
  `/ship` and `/maintain` refresh `.management/` the way `/setup` does.

## 0.1.0 — 2026-10-30

The first versioned release. Projects cloned earlier have no `.claude/TATERU_VERSION` and no
`/upgrade` yet. Fetch it once from the project root, then run `/upgrade`, which works out what was
edited locally from the git history the project shares with tateru:

```bash
git remote add tateru https://github.com/jamesm-dev/tateru.dev.git
git fetch tateru main
git checkout tateru/main -- .claude/commands/upgrade.md .claude/skills/upgrade
```

- **Fixed:** the git hooks were committed without the executable bit, so git skipped them on macOS
  and Linux — no commit tracking, no task links, no pre-push checks. **Breaking for earlier clones:**
  run `/upgrade`, or `git update-index --chmod=+x .githooks/*` and commit.
- **Fixed:** shell scripts are pinned to LF line endings, so a Windows checkout cannot break them.
- **Fixed:** `commit-msg` and `post-commit` accept ad-hoc `ADH-` task ids, and a tab in a commit
  subject no longer breaks `commits.jsonl`.
- **Added:** `/work-on` and its agent team — `task-router`, `repo-scout`, `work-planner`,
  `implementer`, `reviewer` — which become specialists in the project's stack via
  `.claude/team/stack.md`, written by `/setup`.
- **Changed:** `pre-push` runs the commands in `.claude/team/checks.env` instead of assuming pnpm.
  It skips its checks until `/setup` writes that file.
- **Added:** `/upgrade`, `.claude/TATERU_VERSION`, and this changelog.
- **Added:** `selftest.sh` and a CI workflow that run it, and a session-start warning when the hooks
  are unwired or not executable.
- **Added:** `AGENTS.md`, for tools other than Claude Code.
- **Fixed:** `/upgrade` on a project cloned before versioning now finds the starting point from the
  git history it shares with tateru, so it only asks about files you actually edited. Before, it
  would have asked about every file tateru had changed.
- **Fixed:** `selftest.sh` tests the working tree, not the last commit, so it verifies an upgrade
  `/upgrade` has applied but not committed. It no longer checks the root `README.md`, which is the
  project's own file in a clone, or fails because of the project's own notes.
