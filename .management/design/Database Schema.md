---
title: Database Schema
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, data]
status: active
---

# Database Schema

The standalone store behind the dashboard. SQLite by default — see [[Requirements]] for the choice
and its fallbacks.

**It holds authored data only.** No text, titles, or structure for anything that came from the plan:
those live in `.idea/` and reach the page through `state.json`. The one exception is
`task_authored`, which holds tasks created on the board — work that has no home in `.idea/`. Every
table joins on `task_id`, the reference id described in [[Data Sources]].

Thirteen tables, and a rebuild should create all thirteen even where the UI does not yet write to
every column: the read paths expect them, and an absent column fails at runtime rather than at
startup.

## Tables

```sql
-- Everything a person records about one task.
CREATE TABLE task_meta (
  task_id      TEXT PRIMARY KEY,          -- TSK-7F3A21 (derived) or ADH-3C81 (authored)
  origin       TEXT NOT NULL,             -- derived|authored
  points       INTEGER,                   -- sprint points; NULL means unset, never 0
  estimate_min INTEGER,                   -- estimate in minutes
  sprint_id    INTEGER,
  notes        TEXT,                      -- free text, dashboard-only
  orphaned_at  TEXT,                      -- set when the task leaves .idea/; never deleted
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Authored tasks only. Derived tasks carry their text in .idea/, never here.
CREATE TABLE task_authored (
  task_id      TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  epic         TEXT NOT NULL,             -- epic title from state.json; required
  status       TEXT NOT NULL,             -- parked|blocked|in-progress|next-up|done
  promote_requested INTEGER NOT NULL DEFAULT 0,
  promoted_to  TEXT,                      -- the TSK- id it became, once promoted by /shape
  created_by   INTEGER,
  created_at   TEXT NOT NULL
);

CREATE TABLE sprint (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  starts_on    TEXT NOT NULL,             -- date only, YYYY-MM-DD
  ends_on      TEXT NOT NULL,
  goal         TEXT,
  created_at   TEXT NOT NULL
  -- status is derived from the dates, never stored
);

-- An epic assigned to a sprint as a statement of intent. Does not cascade to tasks.
CREATE TABLE epic_sprint (
  epic         TEXT PRIMARY KEY,
  sprint_id    INTEGER NOT NULL,
  notes        TEXT,
  assigned_at  TEXT NOT NULL
);

CREATE TABLE assignee (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  handle       TEXT,                      -- github login, for matching PR authors
  avatar_url   TEXT,
  active       INTEGER NOT NULL DEFAULT 1 -- deactivate, never delete
);

CREATE TABLE task_assignee (
  task_id      TEXT NOT NULL,
  assignee_id  INTEGER NOT NULL,
  assigned_at  TEXT NOT NULL,
  PRIMARY KEY (task_id, assignee_id)
);

-- Actual time is the sum of its entries, never a typed-in total.
CREATE TABLE time_entry (
  id           INTEGER PRIMARY KEY,
  task_id      TEXT NOT NULL,
  minutes      INTEGER NOT NULL,
  note         TEXT,
  assignee_id  INTEGER,
  logged_at    TEXT NOT NULL
);

-- Pull requests. Rows are synced by Claude, or added by hand as a bare link.
CREATE TABLE task_pr (
  id           INTEGER PRIMARY KEY,
  task_id      TEXT NOT NULL,
  url          TEXT NOT NULL,
  number       INTEGER,
  title        TEXT,
  author       TEXT,
  state        TEXT,                      -- draft|open|changes_requested|approved|merged|closed
  checks       TEXT,                      -- passing|failing|pending|none
  synced_at    TEXT,                      -- NULL means never synced: show status unknown
  added_at     TEXT NOT NULL,
  UNIQUE (task_id, url)
);

-- The test trail.
CREATE TABLE test_run (
  id           INTEGER PRIMARY KEY,
  task_id      TEXT,                      -- NULL when only the epic is known
  epic         TEXT,                      -- epic title, for epic-level runs
  name         TEXT NOT NULL,
  status       TEXT NOT NULL,             -- passed|failed|skipped|error
  duration_ms  INTEGER,
  url          TEXT,                      -- link to full output, if any
  detail       TEXT,                      -- failure message, truncated
  ran_at       TEXT NOT NULL,
  synced_at    TEXT NOT NULL,
  source       TEXT NOT NULL              -- github|ci-file|manual
);

-- An explicit status set by a person (or the agent). A derived task otherwise
-- takes its status from state.json. This is what makes dragging honest: a drop
-- records what someone says is happening, and never edits the plan.
CREATE TABLE task_status (
  task_id       TEXT PRIMARY KEY,
  status        TEXT NOT NULL,            -- parked|blocked|in-progress|next-up|done
  source        TEXT NOT NULL,            -- human|agent
  note          TEXT,                     -- REQUIRED when source = agent: why
  evidence_shas TEXT,                     -- comma-separated commit shas
  pr_url        TEXT,
  confirmed_by  INTEGER,                  -- assignee.id; NULL until a person confirms
  confirmed_at  TEXT,
  rejected_at   TEXT,                     -- set when a person rejects the agent's completion;
                                          -- the row is then ignored, and kept so it is not re-marked
  set_at        TEXT NOT NULL
);

-- A person overriding the priority /setup derived from the phase.
CREATE TABLE task_priority (
  task_id      TEXT PRIMARY KEY,
  priority     TEXT NOT NULL,             -- high|normal|low
  set_at       TEXT NOT NULL
);

-- An exit criterion set aside deliberately. Keyed by phase and the criterion's
-- own text, because criteria have no ids and an index shifts when the roadmap
-- is edited. Parking one is how a phase moves on without it.
CREATE TABLE criterion_park (
  phase        INTEGER NOT NULL,
  text         TEXT NOT NULL,
  parked_at    TEXT NOT NULL,
  PRIMARY KEY (phase, text)
);

-- A phase advance is RECORDED here and applied to .idea/ROADMAP.md by /setup.
-- The dashboard moves on immediately using this; the plan still has one writer.
CREATE TABLE phase_advance (
  phase        INTEGER PRIMARY KEY,       -- the phase advanced FROM
  requested_at TEXT NOT NULL,
  consumed_at  TEXT,                      -- set by /setup once the roadmap agrees
  forced       INTEGER NOT NULL DEFAULT 0,
  left_unfinished TEXT                    -- what was outstanding at that moment
);
```

Timestamps are ISO-8601 UTC strings. SQLite has no date type, and a string sorts correctly. Dates
without a time are `YYYY-MM-DD`, which sorts and compares the same way — sprint status is a string
comparison against today.

## Foreign keys, and why they are not declared

`PRAGMA foreign_keys = ON` is set, but the columns above are **not** declared as references. That is
deliberate:

- **`task_id` is not a foreign key to anything.** The tasks live in Markdown. A row may exist for a
  task that has not been seen yet, and must survive one that disappears.
- Cross-table references that *could* be declared — `sprint_id`, `assignee_id` — are enforced by the
  endpoints instead, because a cascade delete here would destroy exactly the human-entered data this
  store exists to protect. Deleting a sprint is refused while it holds tasks; it does not cascade.

## Migrations

There is no migrations directory. The schema is applied with `CREATE TABLE IF NOT EXISTS` on every
start, plus an explicit **additive column helper**:

```
ensureColumn(table, column, definition)
  read the table's columns
  if the table does not exist yet   -> return; the schema statement creates it
  if the column is already there    -> return
  otherwise ALTER TABLE ... ADD COLUMN
```

> [!warning] `CREATE TABLE IF NOT EXISTS` never migrates
> It creates or it does nothing. A database made before a column existed keeps its old shape, and
> every write touching the new column fails at runtime rather than at startup. Adding a column has
> to be explicit and idempotent — and every one added after the first release needs a call here, or
> the next person to open an old `board.db` gets an error nobody can reproduce.

Anything beyond adding a column — renaming, changing a type, splitting a table — needs a real
numbered migration. Reach for one then, not before.

## Rules

- **Actual time is derived** — `SUM(time_entry.minutes)`. Never store a total that can disagree with
  its parts.
- **`points`, `estimate_min` NULL means unset.** Zero is a real value meaning zero. The UI shows them
  differently: unset omits the badge, `0` renders as `0 pts`.
- **Nothing is hard-deleted by automation.** Removing an assignee or a task is a person's action.
  Regeneration only ever sets `orphaned_at`.
- **`synced_at` NULL means never synced.** The UI shows `status unknown`, not a guess.
- **Two task origins.** `origin = 'derived'` means the text lives in `.idea/`; `origin = 'authored'`
  means it lives in `task_authored`. Never store text for a derived task. See [[Board]].
- **Sprint status is never stored.** It is computed from today against `starts_on` and `ends_on`, so
  it can never drift from the calendar.
- **Sprints must not overlap**, and names are unique. Both are enforced on write: two active sprints
  make every "this sprint" number ambiguous.
- **A sprint holding tasks cannot be deleted.** Move them off it first, or leave it closed — it is
  part of the record of when work happened.
- **`parked` is a status like any other**, and the one that removes a task from its phase's
  requirement. Any status enum that omits it breaks the gate.
- **`criterion_park` is keyed by text**, never by index. Editing the roadmap shifts indexes.
- **`phase_advance.phase` is the phase advanced *from*.** The effective phase is that plus one. A
  row with `consumed_at` set has been applied to the roadmap and is no longer read.
- **An agent status update must carry a note.** `source = 'agent'` with a NULL `note` is invalid;
  reject the write. The note is what makes an automated completion auditable.
- **Only a person sets `confirmed_by`.** Until then the UI shows `done · unconfirmed`, and the status
  never satisfies a phase exit criterion — only verified criteria do, via `/setup`.
- **Members are deactivated, never deleted**, once they hold tasks or time. The board reads only
  `active = 1`. See [[Team]].

## Deliberately not tables

| Absent | Where it lives instead |
|---|---|
| `commit_log`, `task_commit` | `.management/commits.jsonl`, appended by the post-commit hook. Hooks are shell scripts; keeping them out of the database keeps them dependency-free |
| `readiness` | `state.json`, written by `/setup`, which actually ran the commands. Two of the gates are recomputed live in the page — see [[Derivations]] |
| `sprint_carry` | Not built. Carry-over between sprints is a manual reassignment, and recording it needs a UI that does not exist |

Adding any of them is a real decision, not a schema tidy-up: each implies a writer, and a table with
no writer is a promise the page cannot keep.

## Indexes

None are created. At the scale this store operates — hundreds of rows, one reader, a local file —
SQLite scans faster than the plan cost of maintaining them, and every query here is a full table read
into memory anyway. Add one when a query is measurably slow, and say which.

## Seeding

On creation, insert nothing but the schema. Assignees are added by people through the form, or
imported from the repository's contributors on request. **Never invent a name.**

## Related

[[Data Sources]] · [[API Surface]] · [[Requirements]] · [[Derivations]] · [[Sprints]] · [[Team]]
