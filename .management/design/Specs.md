---
title: Specs
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Specs

The epics, as agreed in `.idea/`. This section is the plan's face on the dashboard: entirely
derived, and **entirely read-only**.

> [!important] Nothing on this page is editable. Not one field.
> Changing an epic is `/shape`. The lede says so in the first two lines, so nobody hunts for a
> control that should not exist. A page that is read-only by design says it out loud rather than
> greying things out.

## Layout, top to bottom

1. **`h2` — Specs.**
2. **Lede** — every epic is derived from `.idea/epics/`; structure is never editable here; counts
   read **done / still required**, because parked work leaves the denominator and is shown
   separately rather than vanishing.
3. **A search box** on its own URL key, `?sq=` — see [[Navigation]].
4. **One group per phase**, every phase, in roadmap order.

With a search that matches nothing: `Nothing matches that search.` The phase groups still render, so
the shape of the plan is never hidden by a filter.

## Phase groups

Each phase is an `h3` reading `Phase {n} — {name}`, carrying exactly one status pill:

| Phase | Pill |
|---|---|
| Verified, not yet shipped | `verified · not shipped`, in `warn` — built and checked, not yet released. **This row wins** over "before the current one" |
| Before the current one | `advanced past`, in `ok` — or `advanced past, roadmap pending` while `/setup` has not caught up |
| The current one | `current`, in `accent`, weight 600 |
| Later | The phase's own status from the roadmap |

Phase status follows the phase the project is **effectively** on, so advancing updates it here as
well as in the sidebar. Beneath the heading sits the phase goal as a lede.

## Epics

One native `<details>` per epic, in its own epic colour with a 4px leading edge — the same colour it
carries on the board, so an epic is recognisable across sections.

**Open by default only for the current phase.** Everything else stays closed: the summary already
carries what a scan needs.

### Summary

```
Expense Ledger Store        5/8      2 parked      in-progress
```

- **Title**, in the epic's colour, weight 600.
- **`{done}/{required}`** — required is the task count with parked work removed.
- **`{n} parked`** in `warn`, only when something is parked. A shrunken denominator always says by
  how much.
- **The epic's status** from its note.

### Body

- One muted line: `Theme: {theme}` and, when the epic has sources, `· From: {source ideas}`.
- Then every task in the epic, one row each:

| Glyph | Meaning | Row |
|---|---|---|
| `✓` in `ok` | done | text, id |
| `⏸` in `warn` | parked | text, id, and the whole row at 65% opacity |
| `·` muted | open | text, id, muted |

Each row also carries its **points pill** where a value exists, and — on a done task that has one —
`/setup`'s note about it on a second line. Every count on this page reads the shared task index, so
parking a task on the board changes these numbers immediately and without a reload.

Where a phase has no epics: `No epics in this phase.`

## Not built, and deliberately

An earlier draft specified an epic drawer with approach, risks, dependencies, an effort roll-up, and
an editable sprint. None of it shipped, and rebuilding it is a regression:

| Absent | Why |
|---|---|
| An epic drawer | The disclosure already shows everything the epic note carries that this page uses. A drawer would be a second place to read the same thing |
| Editing the epic's sprint here | Sprint assignment is per task, in the task drawer. An epic-level assignment that does not cascade is a statement of intent nothing reads |
| Approach, risks, dependencies | They live in the epic note. Duplicating them here creates a second copy that drifts |
| A progress bar per epic | The `{done}/{required}` count is the number. A bar beside it adds nothing and invites reading a rounded percentage |
| Assignee avatars per epic | An epic has no owner; it inherits from its tasks. That belongs on [[Team]] |

## Related

[[Board]] · [[Navigation]] · [[Components]] · [[Derivations]] · [[Status]] · [[Copy Deck]]
