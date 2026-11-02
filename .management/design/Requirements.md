---
title: Requirements
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, requirements]
status: active
---

# Requirements

What must exist before the `/management` dashboard can be built, and what each thing is for.
`/setup` checks these and reports what is missing rather than working around it.

## Hard requirements

| # | Requirement | Why | If missing |
|---|---|---|---|
| 1 | A web surface in the project | The dashboard is a route | Fall back to a static `dashboard.html` and a terminal `board` script |
| 2 | `.idea/ROADMAP.md` and `.idea/epics/` | The tasks are derived from them | Run `/shape` first |
| 3 | Task reference ids on acceptance criteria | The join key for all authored data | `/shape` assigns them; without one a card is read-only |
| 4 | `state.json` | Derived structure the page renders | `/setup` generates it |
| 5 | A standalone database | Holds assignees, effort, links, test runs | It is created empty on first request; only if a driver is genuinely unavailable does the board fall back to read-only |
| 6 | Nothing else | — | — |

> [!note] No Obsidian MCP is required
> An earlier draft listed one as a hard requirement. It is not: `.idea/` and `.management/` are
> written with ordinary file writes and validated against the vault contract by a hook. An MCP
> server is optional, and where one is configured its tools are validated identically.

## The database

**Default: SQLite, at `.management/board.db`.** One file, no server, a driver in every ecosystem,
and trivially deletable if the user wants to start over.

This is the **one** sanctioned exception to the no-new-dependencies rule for this page: exactly one
database driver, chosen to match the project's runtime. Nothing else — no ORM added for this, no
query builder, no chart or UI library.

Order of preference:

1. **The project's existing database layer**, pointed at a separate SQLite file or its own schema.
   If the project already has Prisma, Drizzle, ActiveRecord, or SQLAlchemy, reuse it rather than
   adding a second way to talk to a database.
2. **A bare SQLite driver** for the runtime — `better-sqlite3`, `node:sqlite`, `sqlite3`, `sqlx`.
3. **A JSON file** at `.management/board.json`, written atomically, if the user refuses a driver.
   Correct for a solo project; it does not survive concurrent writers.

> [!warning] Keep it out of the product schema
> Never add these tables to the application's own migrations. This is tooling data, not product
> data: it must not appear in the app's schema, its migration history, or its backups. A separate
> file is the whole point of "standalone".

`board.db` is gitignored: it holds names, and it is a binary file git cannot merge. It is one
person's board — in a team, one person runs `/setup` and holds it. It is **not** regenerable: parks,
advances and confirmations live only there, so back it up rather than deleting it.

## GitHub MCP

**Required for pull request status.** Everything else works without it.

| Provides | Used for |
|---|---|
| PR number, title, author, state | The PR row in the task drawer |
| Draft / open / changes-requested / approved / merged / closed | The status badge |
| Check runs and their conclusions | The checks line, and the test trail when CI is the source |

Install, in an interactive session:

```
claude mcp add github -s user -- npx -y @modelcontextprotocol/server-github
```

It needs a GitHub token with `repo` scope. Claude cannot install it or complete an OAuth flow on the
user's behalf — if it is missing, say so plainly and continue without PR status rather than inventing
one.

> [!warning] The page never calls the MCP
> MCP tools run on Claude's side, not in a browser. Claude syncs PR and check data **into the
> database**, and the page reads only the database. Every synced row carries the time it was
> written, and the page shows it. See [[Data Sources]].

**Without the GitHub MCP:** a PR link can still be pasted by hand in the drawer and stored. It
renders as a plain link with `status unknown` and the date it was added. Nothing breaks; the status
badge simply cannot refresh.

## Test results

The test trail is populated by whatever already runs the tests — there is no separate requirement.
In order of preference: the GitHub MCP's check runs, a CI results file the project already produces
(JUnit XML, a JSON reporter), or a manual entry in the drawer.

A test run links to a task by its reference id. If a runner cannot carry that id, link the run to the
epic instead and show it on every task in that epic, labelled as epic-level.
