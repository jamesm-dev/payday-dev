---
title: Derivations
created: 2026-08-31
updated: 2026-08-31
tags: [design, management, data, reference]
status: active
---

# Derivations

Every number the dashboard shows is derived, and **each one is derived exactly once**. This note is
the algorithm set, written so it can be ported to any language. Behaviour differences between builds
almost always start here, not in the CSS.

> [!danger] The rule that everything else depends on
> **No component may compute "is this task done" for itself.** Board, Specs, Team and Status each
> derived it independently once, and parking a task moved the card while Specs and the headline
> tiles went on counting the plan as though nothing had happened.
>
> Views that disagree about the same number are worse than a view that shows no number at all.
> Build the index once per data load, pass it down, and read `done` only from it.

## The three stores, restated

Structure is **derived** from the plan (`state.json`, itself generated from `.idea/`). Assignment and
effort are **authored** in `board.db`. Everything from outside is **synced in** with its sync time.
See [[Data Sources]].

The task reference id (`^tsk-` in the vault, `TSK-` on screen) is the join key across all three. It
is assigned once and never reassigned; changing it orphans real data.

## Task index

The effective state of every task: the plan, with whatever a person authored on top.

```
function buildTaskIndex(plan, board) -> Map<id, TaskState>

  statusById   = board.statuses   keyed by task_id
  priorityById = board.priorities keyed by task_id
  metaById     = board.meta       keyed by task_id

  current = effectivePhase(plan, board)

  # Priority follows the phase the project is ACTUALLY on, so advancing
  # re-prioritises the whole board immediately rather than at the next /setup.
  derivedPriority(phase) =
    'high'   if phase == current
    'normal' if phase == current + 1
    'low'    otherwise

  for each epic in plan.epics, for each task in epic.tasks:
    put(task.id, epic.title, epic.phase,
        planStatus = 'done' if task.done else 'next-up',
        planPoints = task.points,
        planPriority = task.priority,
        authored = false)

  for each a in board.authored:
    phase = phase of the epic named a.epic, else 0
    put(a.task_id, a.epic, phase, a.status, null, null, authored = true)

  where put(...) records:
    explicit  = statusById[id] unless (its source == 'agent' and it has rejected_at)
                                            # may be absent; a rejected agent completion is
                                            # kept, but never applied. A person's later drop
                                            # on that task applies as usual.
    status    = explicit ?? planStatus
    unconfirmed = explicit.source == 'agent' and explicit.confirmed_by is null
                  and status == 'done'      # the agent's reading, not yet a person's
    unverified  = not authored and status == 'done' and planStatus != 'done'
                  and (explicit.source == 'human' or explicit.confirmed_by is not null)
                  # a person's drag into Done, or a confirmed agent reading: claimed, but no
                  # verified exit criterion ticks it yet (Board.md)
    done      = status == 'done' and not unconfirmed and not unverified
    parked    = status == 'parked'
    overridden= explicit is present
    points    = metaById[id].points ?? planPoints
    priority  = priorityById[id] ?? planPriority ?? derivedPriority(phase)
    priorityOverridden = priorityById[id] is present
```

`planStatusOf(id)` returns the plan's own status ignoring any override — an authored task's own
`status`, otherwise `done`/`next-up` from the plan. Dragging a task back to its derived column
**clears** the override rather than writing the opposite status, and this is how that column is
known.

## Effective phase

```
function effectivePhase(plan, board) -> number
  last     = max phase number in plan.phases, else 0
  advanced = [ a.phase + 1 for a in board.advances where a.consumed_at is null ]
             # a consumed advance is already in plan.project.currentPhase
  return min(last, max(plan.project.currentPhase, ...advanced, 0))

function readinessPhase(plan, board) -> number
  # The phase "can we ship yet" is about: the lowest one /setup verified and /ship
  # has not released, otherwise the effective phase.
  waiting = [ p.n for p in plan.phases where p.status == 'verified' ]
  return min(waiting) if waiting else effectivePhase(plan, board)

function advancePending(plan, board) -> bool
  return effectivePhase(plan, board) > plan.project.currentPhase
```

`state.json` carries the phase `/setup` last wrote. An advance made on the dashboard is recorded in
`board.db` and takes effect here **immediately**, so sidebar, priorities, tiles and gate all move
together. The roadmap itself still changes only when `/setup` runs — one writer for the plan — and
every view showing a phase says `roadmap pending` until it has.

Clamping to `last` is what stops the project advancing past its final phase.

## Exit criteria, with parking

```
function criteriaOf(plan, board, phase) -> CriterionState[]
  parked = { c.text for c in board.parkedCriteria where c.phase == phase }
  for each c in plan.phases[phase].exitCriteria:
    atRelease = c.text ends with ' — at release'   # /ship proves it after the deploy
    yield { text: c.text, done: c.done,
            parked:    c.text in parked,
            atRelease: atRelease,
            satisfied: c.done or (c.text in parked) or atRelease }
```

A criterion marked ` — at release` (see `/shape`'s phases reference) counts as satisfied here: no
amount of work before the release can meet it, so it must not make every advance look forced.
`/ship` checks it against the live release.

Parking a criterion is how a phase moves on without it. It is **never** a claim the criterion was
met: it is recorded, counted and displayed as set aside, so `done` keeps meaning done. Criteria are
keyed by `(phase, text)` because they have no ids and an index shifts when the roadmap is edited.

## Phase gate

```
function phaseGate(plan, board, taskIndex, phase) -> PhaseGate
  criteria      = criteriaOf(plan, board, phase)
  unmetCriteria = criteria where not satisfied
  tasks         = taskIndex values where phase matches

  parkedTasks      = tasks where parked
  outstandingTasks = tasks where not done and not parked
  inFlight         = tasks where status in ('blocked', 'in-progress')

  open = criteria is not empty
         and unmetCriteria is empty
         and outstandingTasks is empty
         and inFlight is empty

  tasksSettled = tasks is not empty
                 and outstandingTasks is empty
                 and inFlight is empty

  leftUnfinished = join(', ') of the non-empty parts:
     "{n} exit criteri{on|a} unmet"
     "{n} task{s} not done"
     "{n} blocked or in progress"
```

> [!important] `tasksSettled` moves the phase; `open` describes it
> **Tasks are the work.** A phase whose tasks are all done or parked is finished as far as anyone
> can act on it, so `tasksSettled` is what advances it. Outstanding *criteria* do not block — they
> are recorded on the advance, so the roadmap can say the phase moved on with them unmet rather
> than implying they were satisfied.
>
> Status renders this and the shell acts on it, from the same call. Two versions of "is this phase
> done" eventually disagree, and the one that moves the project is the one nobody is looking at.

## Automatic advance, and its cascade

A finished phase moves on by itself. Parking the last outstanding item **is** the decision; making
someone then hunt for a button to confirm what the page already knows is friction, not a safeguard.

```
whenever plan, board or the gate changes:
  if not gate.tasksSettled       -> stop
  if an advance is already in flight -> stop
  if currentPhase >= lastPhase   -> stop

  clean = gate.open
  requestAdvance(from = currentPhase, eligible = clean,
                 force = not clean, leftUnfinished = gate.leftUnfinished)
  reload plan and board
  announce { from: earliest from so far, to: from + 1, clean, left }
```

Three details that are easy to lose and change the behaviour completely:

- **The in-flight flag must be reactive state**, not a plain variable. The effect bails out while an
  advance is running and must re-run when that clears; if the flag is not tracked, a run of finished
  phases advances exactly once and stops.
- **One phase per pass, re-entered after reload.** That is what cascades a run of finished phases,
  stopping at the first with work left.
- **Keep the earliest `from`** across the run, so a cascade reads as one movement rather than
  flickering through each phase.

A refused advance is not worth interrupting the page for. Status already shows exactly what is
outstanding.

**Advance anyway** stays available while work is outstanding, behind a confirmation naming what will
be left, recorded as `forced` with that summary. A pending advance can be stepped back until
`/setup` consumes it.

## Live gates

Of the seven readiness gates, only two can be computed honestly in the browser:

```
LIVE_GATES = { 'Exit criteria', 'Tasks' }
```

Everything else — build, tests, secrets, dependencies, deploy — comes from `state.json`, written by
`/setup`, which actually ran the commands. Those are shown with their sync time and named as stale.

> [!warning] Do not widen this set on instinct
> Both live gates were wrong the first time. **Tasks** was computed more strictly than its own
> definition, and **Risks** was derived from blockers, which are not the risk rules. A gate that
> computes something adjacent to its name is worse than one that admits it is stale, because it
> looks fresh.

## Epic colours

```
function epicColours(plan) -> Map<epicTitle, {hue, shade}>
  seen = {}                                   # phase -> count
  for each epic in plan.epics sorted by (phase asc, title asc):
    n = seen[epic.phase] ?? 0
    out[epic.title] = epicColour(epic.phase, n)
    seen[epic.phase] = n + 1
```

Central and sorted, so every section agrees. The palette itself is in
[[Reference Implementation]].

## Attention references

Each attention item carries a stable reference so it can be acted on by name — `/epic ATT-3C81F0`
creates the epic that addresses it.

```
function attentionRef(title) -> string           # FNV-1a, 32-bit
  h = 0x811c9dc5
  for each char c in title:
    h = h XOR codeUnit(c)
    h = (h * 0x01000193) mod 2^32
  return "ATT-" + uppercase(hex(h)) padded to 8, first 6 characters
```

Derived from the title rather than a counter, so the same warning keeps the same reference across
`/setup` runs and a link to it does not rot. `/setup` writes `ref` explicitly where it can; the hash
is the fallback that keeps older data addressable.

## Durations

```
function humanDuration(minutes)
  null or undefined -> "—"
  < 60              -> "{m}m"
  < 24 hours        -> "{h}h"   integer if whole, else one decimal
  otherwise         -> "{d}d"   integer if whole, else one decimal
```

Durations are always human units in the UI, never raw minutes. Actual time is the **sum of its time
entries**, never a typed-in total.

## Sort orders

| List | Order |
|---|---|
| Board cards, within a column | priority rank, then phase, then epic title |
| Epics, for colour assignment | phase, then title |
| Phase groups, and phases on Status | roadmap order, every phase, never by completion |
| Attention items | **as `/setup` wrote them.** The page does not re-sort by severity — the writer decides the order, and a second opinion here would reorder the list every time a rule's severity changed |

```
PRIORITY_RANK = { high: 0, normal: 1, low: 2 }
```

A board that displays priority without ordering by it is decorating.

## Related

[[Data Sources]] · [[Database Schema]] · [[API Surface]] · [[Reference Implementation]] ·
[[Status]] · [[Board]] · [[Sprints]]
