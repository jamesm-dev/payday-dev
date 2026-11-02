# Git hooks — commit tracking and progress

Set these up on every project, in Phase 4. They are what keeps `.management/` honest between
`/setup` runs: the plan says what should happen, the commits say what did.

## Which runner

**None. The hooks already exist** — this repository ships them in [.githooks/](../../../../.githooks/),
as three plain shell scripts. Wire them up and verify:

```bash
git config core.hooksPath .githooks
git config core.hooksPath          # must echo the path back
```

Do that from whatever the project's install step is, so a fresh clone gets them without anyone
remembering: an `npm prepare` script, a `make hooks` target, a line in the setup docs.

> [!important] Do not install Husky, and do not reach for a hook runner
> A runner installs beside the manifest — `app/.husky`, not `.husky` — and git looks in
> `.git/hooks`, so the hooks silently never fire. That looks exactly like a project where nobody
> commits. Pointing `core.hooksPath` at the runner's directory fixes it, at which point the runner
> is a dependency that manages three files git was already going to run.
>
> It is also a Node dependency in a workflow that has to work for Python, Go and Rust. Shell scripts
> in `.githooks/` work everywhere and ship with the clone.
>
> The exception is a project that **already** uses one for its own hooks — lint-staged, a
> commit-message linter. Keep its runner, and have it call these three scripts rather than
> replacing them.

Hook scripts run with the working directory at the repository root, so paths to
`.management/commits.jsonl` stay root-relative, while any command needing the manifest must
`cd app` (or wherever the app lives) first.

The three scripts are described below. They are committed, so read them before changing one — and if
the project genuinely needs different behaviour, change the script rather than adding a layer on top
of it.

## The hard rule

> [!warning] Hooks never write Markdown in `.idea/` or `.management/`
> A git hook is a shell script running outside Claude, so anything it wrote to the vault would skip
> the `PostToolUse` validator and could silently break the contract that keeps those notes valid.
>
> Hooks write **`.management/commits.jsonl`** and nothing else. They may *read* `board.db` — to
> check an `ADH-` id — but never write it: a shell script with a database driver is a dependency
> bought for rows nothing reads yet. `/setup` reads the log, writes the database, and regenerates the
> Markdown properly.

They must also be fast and never block on network. A hook that takes ten seconds gets disabled by
the third developer who hits it.

## The three hooks

### `commit-msg` — link the commit to work

Parse the message for task references: `TSK-7F3A21`, `ADH-3C81`, case-insensitive, anywhere in the
message. Also accept a trailer:

```
Task: TSK-7F3A21, TSK-9C04E8
```

Behaviour:

- **Warn, do not block, when no task is referenced.** Plenty of legitimate commits — a typo fix, a
  dependency bump — belong to no task. Blocking those teaches people to pass `--no-verify`, which
  disables every other hook too.
- **Block only on a reference that does not exist.** Silently losing the link is worse than one
  rejected commit. `TSK-` plus six hex characters is a planned task, checked against `state.json`
  and, for a task `/epic` added since the last `/setup`, against the `^tsk-` ids in `.idea/epics/`.
  `ADH-` plus four to six hex characters is an ad-hoc task authored on the dashboard, checked
  against `board.db`'s `task_authored` table when `sqlite3` is installed, and accepted otherwise.
- Keep the message itself unmodified. Do not rewrite what someone wrote.

### `post-commit` — record it

Append one line to `.management/commits.jsonl`:

```json
{"sha":"a1b2c3d","at":"2026-08-30T14:02:11Z","author":"jamie","subject":"Persist docs on save","tasks":["TSK-7F3A21"],"files":7,"insertions":184,"deletions":22}
```

Append-only, one JSON object per line, never rewritten. It survives rebases badly on purpose: it is
a log of what happened locally, not a mirror of history.

**The JSONL is a local cache, not the record.** It only sees commits made on this machine after the
hooks were wired. The record is `git log --all`, which `/setup` and the `project-manager` agent
parse for task ids — so pulled commits, GitHub squash-merges and a teammate's work all count. There
are still no `commit_log` or `task_commit` tables, deliberately — see the *not tables* section of
`.management/design/Database Schema.md`.

### `pre-push` — verify, then take stock

1. Run the project's real checks: lint, typecheck, test, build — the same as CI. **Block the push if
   they fail.** This is the
   one hook that should stop you, because a red push is what turns into a broken deploy.

   The commands come from **`.claude/team/checks.env`**, which `/setup` writes when it wires the
   hooks (execution step 9) and refreshes in Phase 7 from the verified commands — the hook itself names no package manager, so it works for any stack. Until that file
   exists the hook skips the checks and says so.

   Leave the machine-readable report where the runner wrote it — the optional `TRAIL` command in
   `checks.env` only makes sure the runner writes one. `/setup` reads it and records the runs in
   `board.db`'s `test_run` table, because that is where a database driver already exists; the hook
   stays a shell script with no dependencies.
2. Print a two-line summary so the developer sees where the phase stands as they push:

```
**Phase 1 - Core loop:** 12/19 tasks, 3 of 4 exit criteria met
**Readiness:** 5 of 7 gates met. Open: Tests, Deploy path
```

Never push, tag, or deploy from a hook.

## Readiness

The answer to "how much more before this can ship". Computed from `.idea/` and `.management/`, never
guessed, and expressed as a checklist rather than a percentage.

The **readiness phase** is the one waiting to ship — the lowest phase at `verified` — and otherwise
the current phase. Readiness answers "can we ship yet", so it must look at what `/ship` would ship.

| Gate | Met when |
|---|---|
| Exit criteria | Every criterion of the readiness phase is met with evidence, or parked (recorded, never counted as met). Criteria marked ` — at release` count as satisfied here, as on the dashboard; `/ship` proves them after the deploy and fails the release if they do not hold |
| Tasks | No task in the phase is blocked or in progress |
| Tests | The latest run passed, and every epic in the phase has at least one linked run |
| Checks | Lint, typecheck, build all pass |
| Pull requests | None open against the phase's epics, or all approved |
| Risks | No `critical` rule firing on the Status page |
| Deploy path | Exercised at least once — the Phase 0 skeleton reached the real target |

Deployable means **every gate met**. Report it as `5 of 7 gates met` plus the two that are not,
never as `71% ready` — a percentage of a checklist invites rounding up.

## What `/setup` does with all this

On each run, before regenerating `.management/`:

1. Read `bash .claude/scripts/project-log.sh` — the project's commit record, without tateru's own
   history, read whole every run. `commits.jsonl` is only this machine's
   cache of it.
2. Map commits to tasks by reference id. **A commit never marks a task done** — it is evidence, not
   completion. Completion comes from a verified exit criterion in Phase 5.
3. Surface commits that referenced no task as untracked work, so unplanned effort is recorded
   rather than vanishing. **No page reads this yet** — the dashboard has no delivery log; see
   `.management/design/Components.md` for why one was dropped. It is kept because the record is
   cheap and reconstructing it later is impossible.
4. Recompute readiness and write it into `PROGRESS.md`.
5. Report: commits since last run, tasks they touched, and the readiness gates still open.
