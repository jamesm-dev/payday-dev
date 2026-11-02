---
title: Status
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui, dataviz]
status: active
---

# Status

How the work is going, what is in the way, and whether the phase can move on. It is also the only
section that **writes to the plan's own timeline** — by recording a phase advance that `/setup`
later applies.

> [!warning] Record and measure, but never forecast
> Points, estimates and actuals are shown because someone entered them. This page charts nothing,
> draws no burndown, computes no velocity, and projects no completion date. A handful of sprints
> cannot support one, and a projection dressed in the same UI as a measurement is not honest.

## Sections, in order

1. **Headline tiles** — four numbers.
2. **Needs attention** — what is in the way.
3. **Deployment readiness** — the gate checklist.
4. **Sprint progress** — the table, then the create form.
5. **Phases** — one collapsed disclosure each, carrying what that phase delivered.
6. **The advance panel** — park, step back, advance.
7. **The closing note** — what this page will never show.

**Needs attention comes before readiness.** Readiness answers *can we ship yet*; the attention list
is *why not*. A reader who meets the gates first has to scroll back up to act on anything. Put the
obstacles above the score.

The lede under the title names the snapshot: `Derived from state.json, generated {timestamp}`.
Nothing on this page is shown without saying when it was known.

## 1. Headline tiles

Four, and they are **stat tiles, not charts**. A single current number is a tile; a one-bar bar
chart is a mistake.

| Tile | Value | Label | Detail line |
|---|---|---|---|
| Tasks | `{done} / {counted}` | `Tasks done` | `across {n} epics`, plus `, {n} parked` only when something is |
| Blocked | `{n}` — in `warn` **only when above zero** | `Blocked` | `waiting on the user` or `nothing stuck` |
| Phase | `Phase {n} of {m}` | the phase name | `{met} of {total} exit criteria met` |
| Accuracy | `not enough data` | `Estimate accuracy` | `needs ten completed tasks; {n} so far` |

The counted denominator **excludes parked work**, and says so in the same tile. The accuracy tile
shows a number only once ten tasks have been completed; until then it names exactly what is missing
rather than hedging or hiding.

## 2. Needs attention

A rules list, not a prediction. Every entry names what fired, since when, what it holds up, and one
concrete next action. Nothing here is statistical and nothing carries a probability.

Empty reads `No rules firing.` — the heading stays. A section that vanishes when empty teaches the
reader it does not exist.

### Every item is actionable by reference

Each item carries a stable reference — `ATT-3C81F0` — written by `/setup` where it can, and
otherwise derived from the item's own title so it survives across runs and a link to it does not
rot. See [[Derivations]].

```
!  warning   Storage adapter undecided                    [ ATT-3C81F0 ]
Since 2026-08-28 · holds up Expense Ledger Store
Spike both options and record an ADR by Friday.
/epic ATT-3C81F0   creates the epic and tasks that address this
```

- The reference is a **button**: clicking it copies `/epic ATT-3C81F0` to the clipboard and the
  label reads ` copied` for about 1.4 seconds.
- Severity carries **its word** — `critical` or `warning` — never colour alone. A critical item
  takes a `fail` leading edge; a warning takes `warn`.
- The command is shown in full beneath, with one muted line saying what it does.

> [!warning] A risk list you cannot act on is decoration
> An item that names a problem and offers no way to start on it trains people to scroll past the
> section. The reference and the command are what make it a queue rather than a lament.

## 3. Deployment readiness

A **checklist, never a percentage**. The heading reads `{n} of {m} gates met` — a percentage of a
checklist invites rounding up, and shipping is not a rounding decision.

The gates are for the **readiness phase**: the lowest phase at `verified`, waiting for `/ship`, and
otherwise the current one. Readiness answers *can we ship yet*, so it looks at what `/ship` would
ship — not at the next phase's unmet work.

```
[x] Exit criteria    4 of 7 met, 3 parked
[x] Tasks            none blocked or in progress
[ ] Risks            1 critical rule firing
```

Each row is a monospace `[x]`/`[ ]` marker in `ok` or `fail`, the gate's name, and its reason
right-aligned and muted. No partial states, no weighting.

### Only two gates are computed live

```
LIVE_GATES = { Exit criteria, Tasks }
```

| Gate | Met when | Reason reads |
|---|---|---|
| **Exit criteria** | The phase has criteria and none is outstanding | `{met} of {total} met`, plus `, {n} parked` when any is |
| **Tasks** | Nothing is blocked or in progress | `{n} blocked or in progress`, or `none blocked or in progress`, plus `, {n} parked` |

Every other gate comes from `state.json` exactly as `/setup` wrote it, and the note beneath the list
says which ones and when they were computed. A browser cannot see a test run, a pull request, or
whether a deploy happened; guessing would be worse than deferring. **A gate with no evidence stays
unmet, never assumed green.**

> [!danger] Do not widen the live set on instinct
> Both live gates were wrong the first time. **Tasks** was computed more strictly than its own
> definition — "nothing left to do" rather than "nothing in flight" — and **Risks** was derived from
> blockers, which are not the risk rules. A gate that computes something adjacent to its name is
> worse than one that admits it is stale, because it looks fresh.
>
> With no readiness written yet, the list falls back to the seven gate names, all unmet.

## 4. Sprint progress

With no sprints: `No sprints yet. A project without them is perfectly normal — create one below when
a dated window is useful.` No empty table, and no implication that something is missing.

Otherwise a table — Sprint (with its goal beneath), Dates, Status, Tasks, Points, and a **Remove**
link — followed by one muted line: *completed over committed points; a task with no points still
counts as a task, because points alone would hide the unestimated work*.

- **Status is derived from the dates**, never stored: `planned` before the start, `active` between,
  `closed` after. See [[Sprints]].
- **Points read `{completed} / {committed}`**, both from the shared task index.
- **Remove** refuses while the sprint holds tasks, with the server's own sentence naming how many.

Beneath it, the **New sprint** form: Name, Starts, Ends on one row; Goal and **Create sprint** on
the next. Errors render in `fail` and success in `ok`, in place. Rules are enforced on the server —
end after start, no overlap, unique name — so the form cannot be the only thing standing between a
bad sprint and the database.

## 5. Phases

Phases come from the roadmap and are **read-only here** — `/shape` adds them, and the lede says so.
What this page can do is advance past one.

One `<details>` per phase, **closed by default, including the current one**. The summary already
carries everything a scan needs, so opening one is a deliberate look rather than the page unfolding
itself at you:

```
> Phase 1 — Core loop        current      12/19      2 parked
```

| Phase | Pill |
|---|---|
| Verified, not yet shipped | `verified · not shipped` in `warn`. **This row wins** over "before the current one" |
| Before the current one | `advanced past` in `ok`, or `advanced past, roadmap pending` |
| The current one | `current` in `accent` |
| Later | Its own status from the roadmap |

Then `{done}/{required}` and, only when there is one, `{n} parked` in `warn`. The current phase
takes an accent border and inset edge; a past phase takes an `ok` inset edge.

Inside: the phase goal, then **what it delivered, grouped by epic in the epic's own colour** — done
tasks with `✓`, parked with `⏸` at reduced opacity, open with a muted `·`. A done task shows
`/setup`'s note about it where it carries one. Where a phase has no epics: `No epics in this phase.`

> [!note] There is no separate "Delivered" section
> One existed, and it repeated the same work grouped the same way while growing without bound. One
> collapsible list per phase says the same thing and stays readable at forty epics.

## 6. The advance panel

One card, carrying whichever of these apply:

**A pending advance** — the project is on a phase the roadmap has not caught up with. It names both
numbers, says the roadmap is written by `/setup` because the plan has one writer, and offers **Step
back to Phase {n}**. When the advance was forced, it says which phase was left and with what
outstanding, and takes a `fail` edge instead of `warn`.

**What is parked** — `{n} tasks and {n} criteria parked ({n} pts)`, then the sentence that keeps the
word honest: parked is never counted as met; it records that you chose to skip something, which is a
different claim from having done it. Parked criteria are listed in a disclosure, each with
**Unpark**.

**Then exactly one of three states:**

| State | Shows |
|---|---|
| Last phase | `This is the last phase in the roadmap.` and that `/shape` adds more |
| Gate open | One sentence saying the phase is finished — every criterion met or parked, every task done or parked, nothing in flight — and **Advance to Phase {n} — {name}** |
| Gate closed | `Cannot advance yet.` and **why**, itemised |

The closed state lists the specific unmet criteria, **each with its own Park control**, then the
outstanding task count, the in-flight count, and the parked count as a muted line. Beneath it, the
rule in one sentence: exit criteria are the definition of a phase, tasks are the means; parking a
criterion moves the phase on without it and records that you did.

**Advance anyway** stays available throughout, behind a confirmation box in `warn` that names
exactly what will be left behind and says it will be recorded rather than quietly dropped. The
confirm is destructive-styled; Cancel sits beside it.

> [!warning] A disabled control must say why
> Never a greyed-out button with no explanation. When the gate refuses, the reason is the list.

### A finished phase moves on by itself

When every task in a phase is done or parked and nothing is blocked or in progress, the project
advances on its own, cascading across a run of finished phases and stopping at the first with work
left — never past the last phase.

It is **announced, never slipped through**: a banner at the top of the content area names which
phases were crossed, says every task was done or parked, names anything it moved past, notes that
`.idea/ROADMAP.md` catches up on the next `/setup`, and carries **Dismiss**. A cascade announces
**once**, from the earliest phase it started at. The algorithm and its three easy-to-lose details
are in [[Derivations]]; the reasoning is in [[Sprints]].

## 7. The closing note

The page ends by saying what it will not do: no burndown, no velocity, no projected completion date
— because four phases and a handful of completed tasks cannot support a forecast, and a projection
drawn in the same style as a measurement is not honest.

Keep it. It is the sentence that stops the next build adding a chart.

## Charts

**None are built.** If one is ever added, it is bound by all of this:

> [!warning] Load the dataviz skill first
> Form before colour, then run its palette validator. The rules below are this page's application of
> it, not a replacement for it.

- **Inline SVG. No chart library** — the no-new-dependency rule holds here too.
- **One axis, always.** No dual-scale plot anywhere on this page.
- **Sequential by default** — one hue, more-is-darker — unless the job is genuinely identity.
- **Status colours are reserved** for severity and never reused as a series colour.
- **Every chart carries a table view** with the same numbers, and no chart is the only way to read a
  figure.
- Under three closed sprints, show a table and say why. Three columns is not a trend, and drawing it
  like one invites reading it as one.
- **Never** a trend line, an average line, a projection, a dual axis, a pie of two slices, or a
  ranking of people.

## Related

[[Sprints]] · [[Derivations]] · [[Board]] · [[Specs]] · [[Copy Deck]] ·
[[Accessibility And Anti-Patterns]] · [[Components]]
