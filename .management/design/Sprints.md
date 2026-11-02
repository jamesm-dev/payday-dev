---
title: Sprints
created: 2026-08-30
updated: 2026-08-31
tags: [design, management]
status: active
---

# Sprints

A sprint is a dated window that work is assigned to. It is **entirely authored** — `.idea/` has
phases, not sprints, and the two are deliberately different things.

| | Phase | Sprint |
|---|---|---|
| Comes from | `.idea/ROADMAP.md` | Created here |
| Defined by | An outcome and its exit criteria | Dates |
| Ends when | The exit criteria are met | The end date arrives |
| Can overlap | No | May span parts of several phases |

A phase finishes when the work is done; a sprint finishes when time runs out. Conflating them is how
a roadmap turns into a wish with a deadline attached, so the dashboard keeps them separate and shows
both.

## The model

```
sprint: name, starts_on, ends_on, goal, status
```

Status is derived from the dates, never typed: `planned` before the start, `active` between,
`closed` after. Exactly one sprint can be active — the one containing today. If none does, the
dashboard shows `no active sprint` rather than guessing at the nearest.

Things are assigned to a sprint at two levels:

- **A task** belongs to at most one sprint.
- **An epic** may be assigned to a sprint as a whole, which is a statement of intent. It does not
  cascade: assigning an epic to Sprint 4 does not move its tasks. `epic_sprint` holds it; **no UI
  writes it yet**, and a rebuild should not invent one — an assignment nothing reads is a promise
  the page cannot keep.

> [!danger] Sprints are created here. Phases are not.
> A sprint lives in `board.db` and this page is its only editor, so creating one here is correct.
> A **phase** lives in `.idea/ROADMAP.md`, and the dashboard may not write to `.idea/` — that is the
> rule in [[Interaction And States]] that stops this page becoming a rival source of truth for the
> plan.
>
> Where a reader might reasonably look for "add a phase", show the phase list read-only with one
> line: phases come from the roadmap, and `/shape` adds them. Never a disabled button with no
> explanation, and never a control that appears to work and silently does nothing.

## Advancing to the next phase

Creating a phase is out of bounds. **Advancing to the next one is not** — but it is gated, and the
dashboard requests it rather than performing it.

### A finished phase moves on by itself

**Tasks drive the advance.** When every task in a phase is done or parked and nothing is blocked or
in progress, the project moves to the next phase on its own — no button to find, no confirmation of
something the page already knows. Parking the last outstanding task *is* the decision.

It **cascades**: a run of phases with no work left is crossed in one movement, stopping at the first
phase that still has a task to do, and never past the last phase in the roadmap.

Exit criteria do **not** block it. They are the definition of a phase, so an unmet one is recorded on
the advance — `advanced past 4 exit criteria unmet` — and written into the roadmap by `/setup`. The
phase is never marked finished; the record says what it moved past.

> [!warning] Announce it, never slip it through
> An advance that happens on its own must say so: which phases were crossed, that every task was
> done or parked, and anything it moved past. A phase number that changes while nobody is looking is
> how a roadmap stops being trusted.
>
> **Step back** undoes it while the roadmap has not yet caught up.

### Advancing manually

The advance is also available by hand **while work is still outstanding** — sometimes a phase is
simply over. That is a deliberate act, not a gate opening, so it:

- asks for confirmation, naming exactly what will be left behind,
- is recorded as **forced**, with that summary,
- shows in the phase banner as *advanced with work outstanding*, never as finished.

### The clean gate

A phase counts as properly finished — no "moved past" note anywhere — when **all** of these hold:

1. Every **exit criterion** is met **or parked**.
2. Every **task** is done **or parked**.
3. No task is blocked or in progress.

### Parking a criterion

Tasks are the means; exit criteria are the definition. So parking every task in a phase does not
finish it — the criteria still stand. **A criterion can be parked too**, and that is how a phase
moves on without something.

Each outstanding criterion carries a **Park** control, and parked ones are listed together with an
**Unpark**. Parking is recorded, counted, and displayed wherever the phase is described.

> [!danger] Parked is not met
> A parked criterion is never counted as met and never presented as done. The gate reads
> `4 of 7 met, 3 parked`, never `7 of 7`. Parking records *that you chose to skip something*, which
> is a different claim from having done it, and the record is what keeps "done" meaning done.
>
> A criterion that should never have been required is a mistake in the plan, and the plan is fixed
> with `/shape`. Parking is for the ones you are consciously moving past.

> [!warning] A disabled control must say why
> When the gate fails, show the specific unmet items — "3 of 7 exit criteria met; 7 tasks
> outstanding" and the list — not a greyed-out button. A control that refuses without a reason
> teaches people to distrust the page.

### Advancing takes effect immediately

Clicking **Advance** moves the dashboard to the next phase at once: the sidebar, the board's
priorities, the tiles and the gate all follow. Waiting for a tool to run before the screen agrees
with the button you just pressed is not a workflow, it is a bug.

What it does **not** do is edit `.idea/ROADMAP.md`. The advance is recorded in `board.db`, and the
**effective** phase is the roadmap's phase plus any advance made here. `/setup` writes it into the
roadmap on its next run.

Until it has, every view showing the phase also shows **`roadmap pending`**, and the Status page
names both numbers: the phase you are on, and the one the roadmap still says. A **Step back** control
undoes the advance while it is pending.

This keeps a single writer for the plan, the same reason the `project-manager` agent proposes epics
at `status: suggested` rather than writing them into a phase. The person decides; one tool records;
the screen never lies about which is which.

## Creating a sprint

From [[Status]]. The form asks for a name, a start date, an end date, and an optional goal sentence.

Rules enforced on save:

- The end date must follow the start date.
- Dates may not overlap an existing sprint. Two active sprints make every "this sprint" number
  ambiguous.
- A name is required and must be unique. Default it to `Sprint N`, but let it be renamed — a sprint
  named `Beta prep` is more useful than `Sprint 7`.

## Removing a sprint

A sprint created with the wrong dates should not be permanent. It can be deleted **only while no
task is assigned to it** — once it has held work, it is part of the record, and removing it would
erase which sprint that work was completed in. Move the tasks off first, or leave it closed.

## Closing a sprint

A sprint closes on its end date, and its status changes because the date passed. **Nothing happens
automatically to its tasks** — unfinished work is not silently rolled forward, because a sprint that
quietly absorbs its own overflow can never be learned from.

Moving that work on is a person's action, one task at a time, through the task drawer's sprint
select.

> [!note] The carry-forward prompt is not built
> An earlier draft had Status list a closed sprint's unfinished tasks and offer to move them in one
> action, recording what was carried. It is a good idea and it is still unbuilt. Do not rebuild it
> from this note alone — it needs `sprint_carry`, a writer, and somewhere to show the history, and
> half of it is worse than none.

## Counting

- **Committed points** — the sum of points on every task in the sprint, at any status.
- **Completed points** — the sum on tasks that are done.
- **Every task is pointed**, because `/shape` points every acceptance criterion. A task with no
  points is therefore a defect in the plan, not a normal case — and it is counted as zero, so the
  hole has to be visible somewhere. It is **not** shown on the card, where a `no pts` badge would be
  noise on every card of a healthy project; it surfaces on [[Team]], as the count of unpointed open
  tasks that makes a load figure wrong, and in the sprint table's footnote. Report a gap where it
  distorts a number, not where it merely exists.
- Both the task count and the points total are shown. Points alone would hide a sprint of many tiny
  tasks; the count alone would hide a sprint of one enormous one.
- Points are credited to the sprint the task was **in when it was completed**, not the one it was
  created in.

> [!warning] Do not compute velocity
> Committed and completed points, per sprint, are facts. An average of them presented as capacity is
> a forecast, and two or three sprints cannot support one. [[Status]] shows the history; it does not
> extrapolate a line through it.
