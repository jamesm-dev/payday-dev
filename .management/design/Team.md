---
title: Team
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Team

Who is on what. Entirely authored data — `.idea/` has no opinion about people, so all of it lives in
`board.db`.

> [!important] Capacity is the reason points are mandatory
> A member's **load** is the sum of points on their **open** tasks — neither done nor parked. It is
> only meaningful because every task carries points: one unpointed task makes the figure wrong by an
> unknown amount.
>
> So the unpointed ones are **counted and named** rather than folded silently into the total, and
> load is shown as a number with its task count beside it — `13 pts across 5 open tasks` — never as
> a percentage of an assumed capacity. Nobody has told this dashboard how many points a person can
> take, and inventing that denominator would turn a fact into a fiction.

## Layout, top to bottom

1. **`h2` — Team.**
2. **Lede** — who is on what; names live in `board.db`, never in `.idea/`.
3. **The empty note**, when nobody has been added — see below.
4. **A search box** on its own URL key, `?tq=` — see [[Navigation]].
5. **The member grid.**
6. **The add-person form.**

### The empty state is a correct result, not missing data

With nobody added, the section shows a note saying so plainly: this is a single-person project by
design — `SPECS.md` names one user and rules out accounts entirely — so this section may stay empty,
**and that is a correct result rather than missing data**.

The distinction matters. An empty section that reads like a configuration failure sends someone off
to fix nothing.

## Member card

One card per person, in a responsive grid:

```
+--------------------------------------------+
| Jamie Doe  @jamiedoe                       |
|                                            |
| 13 pts  across 5 open tasks                |
| 47 pts completed · 8 tasks assigned        |
| 2 open tasks unpointed - the load above is |
| short by an unknown amount                 |
|                                            |
| TSK-8F31 Persist documents  (Expense Ledger)|
| TSK-2C09 Restore on open    (Expense Ledger)|
+--------------------------------------------+
```

| Line | Contents |
|---|---|
| **Name** | Plus `@handle` in monospace, muted, when set — it is what matches them to PR authors |
| **Load** | The points figure, large and tabular, with `across {n} open task{s}` beside it |
| **Contribution** | `{n} pts completed · {n} task{s} assigned` |
| **Unpointed gap** | In `warn`, and **only when there is one**: `{n} open task{s} unpointed — the load above is short by an unknown amount` |
| **Assigned tasks** | Every task assigned to them: id, text, and an epic chip in that epic's colour. Empty reads `Nothing assigned.` |

Every figure reads the shared task index, so parking a task on the board removes it from that
person's load immediately — set aside is not pending — while leaving it visible in their list.

Points are credited on **done**, never on assignment: a member's contribution is what shipped, not
what was hoped for. On a task with several assignees points are **not** divided; each is credited
with the whole task. Splitting them invents precision nobody entered.

## Adding a person

One row: **name** (required), **GitHub handle** (optional), **Add person**. Nothing else — no email,
no role, no avatar upload. This is a build tool, not an HR system, and every extra field is personal
data with no job to do here.

Never auto-populate the team from git history. Commit authors are not the team; names may be
*suggested* from contributors for a person to confirm.

## Removing a person

**Not built as a control, and the schema explains why.** `assignee.active` exists so a person can be
deactivated rather than deleted: their name stays on the tasks they did and the time they logged,
and the board reads only active people. Deleting the row would corrupt every historical total.

A rebuild that adds the control must deactivate, never delete — except for a person with no tasks
and no time entries, the one case where nothing is lost.

## Not built, and deliberately

| Absent | Why |
|---|---|
| A member drawer | The card already carries every figure this section has. A drawer would repeat it |
| Avatars from a URL | Initials are enough at this size, and an image is a network dependency for decoration |
| Active/inactive UI | The column exists; no project here has needed the control yet |
| Per-sprint contribution bars | Two or three sprints is not a history. See the forecast rule on [[Status]] |
| A leaderboard, or any ranking by points | The section is titled contribution. A dashboard that ranks people by points will get people gaming points |

## Privacy

This section holds real people's names. It is why the dashboard defaults to development-only, and
why `board.db` is gitignored — see [[Requirements]]. It is one person's board: in a team, one person
runs `/setup` and holds it, and assigns on everyone's behalf.

## Related

[[Board]] · [[Navigation]] · [[Components]] · [[Sprints]] · [[Derivations]] · [[Requirements]]
