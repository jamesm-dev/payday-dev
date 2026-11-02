---
title: DESIGN
created: 2026-08-30
updated: 2026-09-01
tags: [design, management, moc]
status: active
---

# Dashboard Design

How the `/management` dashboard looks and behaves when `/setup` builds it. Four sections behind a
sidebar — Board, Specs, Team, Status. This is the index; the detail lives in [design/](design/), one
concern per note.

**Read [[Requirements]] and [[Data Sources]] before writing any code.** They carry the two decisions
everything else depends on: where the data lives, and what the page may edit.

> [!important] These notes are the specification, not a sketch of one
> They describe the dashboard **as it was built and refined**, down to the words on the buttons.
> Every `/setup` run must land on the same page: the same sections in the same order, the same
> components with the same anatomy, the same spacing, the same colours by role, the same behaviour,
> and the same copy.
>
> Where a note and the running page disagree, that is a bug in one of them — **say so and stop**.
> Do not quietly build the third thing.
>
> **And do not take that on trust.** Prose read by a model is not reproducible, so the
> checkable half of this design also exists as data in [contract/](contract/), and a
> rebuild has to prove it conforms:
>
> ```bash
> bash .claude/scripts/dashboard-conformance.sh
> ```
>
> See [[Conformance]] for what that proves, what it cannot, and the derivation goldens
> that cover the rest.

> [!important] What the app owns, and what these notes own
> **Appearance comes from the app**, always: its theme, its tokens, its components, its dark mode.
> These notes fix **layout, anatomy, behaviour and wording** — not palette.
>
> | The app's theme and components decide | These notes decide |
> |---|---|
> | Colour values, dark mode, fonts, shadows | Spacing, size, ratio, breakpoint, type *scale* |
> | Which `Card`, `Badge`, `Dialog`, `Select` is used | What goes inside it, in what order |
> | Border and motion style | Every behaviour, and every string |
>
> Where the project offers its own scale, snap to its nearest step. Where it offers nothing, build
> the component and use these values as written. Either way, **say so in the build report** — a
> silent substitution is how two builds drift apart.

## The four reference notes

A rebuild that reads only the section notes will land somewhere defensible but different. These four
are what make it land in the *same* place:

| Note | Fixes |
|---|---|
| [[Reference Implementation]] | Every measurement, breakpoint, timing, module split, and the epic colour algorithm |
| [[Derivations]] | Every computed number, as portable pseudocode |
| [[API Surface]] | The two reads and seventeen writes, and nothing else |
| [[Copy Deck]] | The exact words, where a softened phrase becomes a dishonest one |

## What this page is for

One person, glancing for ten seconds, answering four questions:

1. **What phase are we in, and how far through?**
2. **Is anything stuck?**
3. **What is next?**
4. **Who is on what, and how much is left?**

Everything else is secondary. If a section does not serve one of those four, it goes below the fold,
into the task drawer, or does not ship.

It is also the one place where assignment, effort and status are **recorded** — the only data here a
person types in rather than derives.

> [!warning] Record and measure, but never forecast
> Sprint points, estimates, and actuals are shown because someone entered them. [[Status]] flags
> risks from rules that fire on observable facts. It does not draw a burndown line, compute a
> velocity, or project a completion date — a handful of sprints cannot support one, and a projection
> dressed in the same UI as a measurement is not honest.

## The notes

**Foundations**

| Note | Covers |
|---|---|
| [[Requirements]] | What must exist first: the standalone database, the GitHub MCP, and what degrades when each is missing |
| [[Data Sources]] | The three stores, the task reference id that joins them, and why sync beats live fetch |
| [[Database Schema]] | The thirteen tables, the migration rule, and what is deliberately not a table |
| [[Sprints]] | What a sprint is, how it differs from a phase, and how points are counted |
| [[Derivations]] | Every derived number as portable pseudocode: task index, phase gate, advance cascade, colours, references |
| [[API Surface]] | The complete operation set, the meaning of `null`, and the error contract |

**The four sections**

| Note | Covers |
|---|---|
| [[Navigation]] | The sidebar, fragment routing, the three URL layers, and the per-section search |
| [[Board]] | Five columns, the filters, dragging, parking, and creating a task |
| [[Specs]] | The read-only epic list, its disclosures, and what was deliberately not built |
| [[Team]] | Load, contribution, the unpointed gap, and adding people |
| [[Status]] | Tiles, attention, readiness gates, sprints, phases, and the advance panel |

**Craft**

| Note | Covers |
|---|---|
| [[Design System]] | Using the project's own theme and components, and the visual language |
| [[Page Layout]] | The shell, the wireframe, responsive behaviour, and the spacing scale |
| [[Components]] | The full component inventory, and what is deliberately absent |
| [[Task Card And Drawer]] | The card, the drawer, and every editable field |
| [[Interaction And States]] | The data flow, the exposure gate, and every state to handle |
| [[Accessibility And Anti-Patterns]] | Keyboard, screen reader, contrast, and what not to do |
| [[Reference Implementation]] | The measured fixed point: constants, geometry, timings, module layout, palette |
| [[Copy Deck]] | Every user-facing string, and the ones that must never be softened |
| [[Conformance]] | How a rebuild is **checked** against all of the above, and what the check cannot prove |

## Do not rebuild these

Each was specified once, deliberately dropped or never built, and would be a regression to add back
without a decision. The note named says why.

| Absent | Note |
|---|---|
| A page header, and a page footer | [[Page Layout]] |
| A separate **Delivered** log | [[Components]] |
| Any chart at all | [[Status]] |
| An epic drawer, and epic-level editing | [[Specs]] |
| A member drawer, avatars, active/inactive UI | [[Team]] |
| A promote-to-plan control on the board | [[Board]] |
| A PR badge or test glyph on the card | [[Task Card And Drawer]] |
| `commit_log`, `sprint_carry`, `readiness` tables | [[Database Schema]] |
| A carry-forward prompt at sprint close | [[Sprints]] |

## Compliance checklist

`/setup` must walk this before reporting the dashboard built. A rule that is never checked is a rule
the next build quietly drops, and "it looks right" is not a check.

**Conformance** — see [[Conformance]]. These four come first because they are the only ones a
machine can settle:
- [ ] `bash .claude/scripts/dashboard-conformance.sh` passes.
- [ ] `contract/sources.txt` names the real paths, **including the server side** — a list naming
      only the UI passes while every server message has been reworded.
- [ ] `contract/tokens.map` declares every measurement the project expressed its own way. A
      declared substitution can be reviewed; a silent one is how two builds drift apart.
- [ ] The derivation goldens in `contract/fixtures/` are written as tests in the project's own
      runner, and pass.

**Theme fidelity** — see [[Design System]]
- [ ] Every colour, font, radius and shadow comes from the project's own tokens. No second palette,
      no hardcoded hex beyond the two semantic tokens [[Reference Implementation]] defines.
- [ ] Where the project has a component — Card, Badge, Dialog, Sheet, Avatar, Select — the dashboard
      uses **that** component. shadcn is preferred wherever the project already has it.
- [ ] Where the project has none, components are built once in `ui/`, from the project's tokens, and
      reused — never a second drawer beside an existing one, never a UI kit added for this page.
- [ ] Dark mode is the project's own mechanism. Never a second toggle.
- [ ] No new dependency for this page. The one sanctioned exception is a database driver.
- [ ] **The test:** someone opening the page cannot tell it was generated. A page that matches every
      measurement here but looks like a different product bolted on has failed.

**Shell and navigation** — see [[Navigation]], [[Page Layout]]
- [ ] Two-column shell, sidebar 248px, content with **no max width**; prose capped at 78ch.
- [ ] **No page header and no page footer.** The sidebar carries identity; `generatedAt` is Status's
      lede.
- [ ] Sidebar shows the project name, then the current phase, then the active sprint — and never the
      words "No sprint defined".
- [ ] The sprint line, and the board's Sprint filter, are absent entirely until a sprint exists.
- [ ] Nav is a `<nav>`; the active item carries `aria-current="page"`; counts sit inside the
      accessible name.
- [ ] Counts are open tasks (excluding parked), epics in the current phase, people — and nothing on
      Status.
- [ ] Phase progress in the footer carries its count as text, not colour alone.
- [ ] Section in the fragment, filters in query params via `replaceState`, the open task via
      `pushState` so the back button closes the drawer.
- [ ] Board, Specs and Team each search on **their own URL key** (`q`, `sq`, `tq`).

**Board and cards** — see [[Board]], [[Task Card And Drawer]]
- [ ] Five columns, **Parked first**, then Blocked, In progress, Next up, Done. Done is a full
      column, not a collapsed section.
- [ ] Cards sort by priority, then phase, then epic — a board that displays priority without
      ordering by it is decorating.
- [ ] Columns are lists. Each card is a `<li>` containing a `<button>` — never a `div` with a click
      handler — and the whole card opens the drawer.
- [ ] An empty column keeps its heading and shows a muted `Nothing here.`; the layout does not
      collapse.
- [ ] Unassigned renders a dashed placeholder that is itself the assign control.
- [ ] Points omitted when unset; `0 pts` and `1 pt` are real values and display.
- [ ] Estimate/actual pair omitted when neither is set; actual emphasised when it exceeds estimate.
- [ ] Ad-hoc tasks are identified by their `ADH-` reference alone — no second "ad-hoc" pill.
- [ ] Creating a task is **one button** opening a drawer — no form parked in the toolbar — and title,
      epic **and points** are all required.
- [ ] **Every epic is colour-coded**, hue from its phase and shade from its position within it, and
      that colour appears on every card belonging to it. The epic name is always shown too.
- [ ] **Every task has a priority**, derived from the phase it sits in against the *effective* phase,
      overridable in the drawer, rendered with its word and not colour alone.
- [ ] **Every card is draggable**, always. A drop writes an explicit status to `board.db` and never
      touches `.idea/`.
- [ ] Dragging a derived task back to its derived column **clears** the override rather than writing
      the opposite status.
- [ ] Dropping a derived task into Done renders `done · unverified` until `/setup` verifies the exit
      criterion, and it is not counted as done in readiness.
- [ ] Every drag has a keyboard equivalent in the drawer, and drops announce through a live region.
- [ ] A parked task is excluded from its phase's task requirement, keeps its points and assignee,
      and is reported as a count rather than silently removed.
- [ ] Board carries search plus epic, assignee, sprint and origin filters, each written to the URL.
- [ ] An active filter is visible, with a Clear control naming the count.

**Drawer** — see [[Task Card And Drawer]]
- [ ] Built from the project's sheet or dialog where it has one; otherwise hand-built **once** in
      `ui/` and reused by both the task drawer and the create form.
- [ ] A modal dialog: focus moves in, is trapped, returns to the card on close; Escape and backdrop
      close it; the page behind does not scroll; reduced motion is respected.
- [ ] Sets `?task=` so a task is linkable, and the back button closes it.
- [ ] Sections in order: Reference · Epic · Note from `/setup` · Status · Priority · Assignee ·
      Effort · Sprint · Test trail · Remove (ad-hoc only) · Pull request.
- [ ] The epic path renders as monospace text, not a link — `.idea/` is not served.
- [ ] Empty states are visible text — `No test runs linked.`, `None linked.`, `status unknown`.
- [ ] Only `board.db`-backed fields are editable. Task text, epic, phase and completion are
      read-only, with no control that would edit `.idea/`.
- [ ] Every write reports through one live region: a brief confirmation, or the server's own message
      inline. Never silent, never a lost keystroke.

**Specs, Team** — see [[Specs]], [[Team]]
- [ ] Specs is **entirely read-only** and says so in its lede.
- [ ] Epic disclosures are open only for the current phase; counts read `done / still required` with
      any parked count beside them.
- [ ] Team shows load as points across a task count, never as a percentage of an invented capacity.
- [ ] Unpointed open tasks are counted and named on Team, not badged on every card.
- [ ] Team's empty state says an empty team is a **correct result**, not missing data.

**Status, sprints and phases** — see [[Status]], [[Sprints]]
- [ ] Order is tiles → **needs attention** → readiness → sprints → phases → advance → closing note.
- [ ] Each attention item carries a copyable `ATT-` reference and the `/epic` command that acts on
      it. Severity carries its word.
- [ ] Readiness is a checklist read as `{n} of {m} gates met`, never a percentage.
- [ ] Only **Exit criteria** and **Tasks** are computed live; every other gate is shown as `/setup`
      left it, with the date, and named as stale.
- [ ] A sprint can be created, with the end date after the start, no overlap, and a unique name;
      status is derived from the dates, never typed.
- [ ] A sprint holding tasks cannot be deleted, and the refusal says how many.
- [ ] Phases are read-only, collapsed by default, with one line saying `/shape` adds them.
- [ ] A phase whose tasks are all done or parked **advances on its own**, cascading across a run of
      finished phases and stopping at the first with work left — never past the last phase.
- [ ] An automatic advance is announced once, from the earliest phase crossed, with a Dismiss.
- [ ] **Advance anyway** is available while work is outstanding, behind a confirmation that names
      what will be left, recorded as forced with that summary.
- [ ] Each outstanding exit criterion carries a **Park** control; parked ones are listed with
      **Unpark**. Parked is never rendered as met — the gate reads `4 of 7 met, 3 parked`.
- [ ] When the gate fails, the specific unmet criteria and outstanding counts are listed — never a
      bare disabled button.
- [ ] Advancing takes effect **immediately** — sidebar, priorities, tiles and gate all move — while
      writing only to `board.db`. The dashboard never edits `.idea/ROADMAP.md` itself.
- [ ] While the roadmap has not caught up, every view showing the phase shows `roadmap pending`, and
      Status names both the effective phase and the roadmap's.
- [ ] A pending advance can be stepped back until `/setup` consumes it.
- [ ] No burndown, no velocity, no forecast, and the closing note that says so is still there.

**Agreement** — see [[Data Sources]], [[Derivations]]
- [ ] Every section reads **one** shared effective-task index, built once per load and passed down.
      No component reads `task.done` from `state.json` directly.
- [ ] Parking a task updates the board, Specs counts, the headline tiles, phase progress and the
      advance gate — without a reload.
- [ ] Wherever a denominator excludes parked work, the parked count is shown beside it.
- [ ] Every write re-reads both stores; nothing is applied optimistically.

**Measurements** — see [[Reference Implementation]]
- [ ] Sidebar 248px; radius 12px on cards, 7–10px on controls; base font size 14px.
- [ ] The board's grid or flex ancestor uses `minmax(0, 1fr)` or `min-width: 0`. A plain `1fr`
      pushes the last column off screen and looks like a board bug.
- [ ] Board columns are `flex: 1 1 0` with a `220px` floor and scroll horizontally — never
      `repeat(5, 1fr)`, which has no floor and squeezes cards to unreadable.
- [ ] Breakpoints at 900px (columns swipe), 820px (shell collapses), 768px (drawer becomes a bottom
      sheet). They are deliberately not equal.
- [ ] Epic colour is four hue families `[152, 210, 32, 285]` by phase, shaded by position within the
      phase and capped at three steps — never one generated hue per epic.
- [ ] Epic index comes from one central sort by phase then title, so every section agrees.
- [ ] Counts, points, durations and dates render in tabular or monospace figures.
- [ ] The derivations live in their own module, apart from every view.

**Derivations** — see [[Derivations]]
- [ ] `tasksSettled` advances a phase; `open` only describes it. Outstanding criteria are recorded
      on the advance, never treated as satisfied.
- [ ] The advance in-flight flag is reactive state — otherwise a run of finished phases advances
      once and stops instead of cascading.
- [ ] A cascade announces once, from the earliest phase it started at.
- [ ] Only `Exit criteria` and `Tasks` are computed live. Widening that set has produced a wrong
      gate twice.
- [ ] `null` clears a status override, a priority override, or an assignment — it never means
      "no change".

**Copy** — see [[Copy Deck]]
- [ ] Every string matches the deck, or its translation does. A softened phrase is a changed meaning.
- [ ] Singular and plural are both written out. `1 tasks not done` undermines every other number.
- [ ] Qualifiers attach with ` · `, so they stay attached to the word they weaken.

**Honesty**
- [ ] Nothing synced is shown without the time it was synced.
- [ ] A gate or figure with no evidence reads unmet or `not enough data`, never assumed green.
- [ ] `pullRequests: null` reads as *not configured*, never as *no open pull requests*.

## The shape of it, in three sentences

Structure is **derived** from `.idea/` and is never editable here. Assignment, effort and status are
**authored** in a standalone database that the dashboard owns alone. Anything from outside — pull
request status, test results, commits — is **synced in** and always displayed with the time it was
synced. A commit is evidence that work happened; only a verified exit criterion makes it done.
