---
title: Copy Deck
created: 2026-08-31
updated: 2026-08-31
tags: [design, management, ui, reference]
status: active
---

# Copy Deck

The exact words. Copy is where an honest dashboard is won or lost — `done` and `done · unverified`
are the same six pixels apart and mean entirely different things.

A rebuild may translate these, but may not soften them. If a phrase here sounds blunter than a
product would normally ship, that is the point: it is the phrase that stops someone reading a guess
as a fact. `{n}` is a count, `{…}` a value.

## The separator

Qualifiers attach with a **middle dot surrounded by spaces** — ` · `. It reads as a qualifier rather
than a new sentence, which is what keeps the qualification attached to the word it weakens:
`done · unverified`, `Since 2026-08-28 · holds up Expense Ledger Store`.

## Shell and navigation

| Where | Exactly |
|---|---|
| Project name, before the first load | `Loading…` |
| Phase line | `Phase {n} of {m} — {name}` |
| Advance not yet in the roadmap | `roadmap pending`, tooltip `Advanced here; the roadmap catches up on the next /setup` |
| Sprints exist, none contains today | `no active sprint` |
| Phase footer | `{n}% of Phase {n} tasks done` (bar labelled `Phase {n} progress`) |
| Nav | `Board` · `Specs` · `Team` · `Status` |
| Content, still loading | `Loading…` |
| Load failed | `Could not load the dashboard: {message}` |

### The automatic advance banner

```
Phase {n} had no work left — now on Phase {n+1}.
Phases {a}–{b} had no work left — now on Phase {b+1}.
Every task was done or parked, so the project moved on by itself.
It moved past {what was left}, which is recorded rather than marked met.
.idea/ROADMAP.md catches up on the next /setup.
```

Dismissed with `Dismiss`. A cascade is announced **once**, from the earliest phase it started at —
not once per phase.

## Board

| Where | Exactly |
|---|---|
| Lede | `{n} tasks across {m} epics. Drag a card to move it — that records what you say is happening in board.db and never edits the plan.` |
| The honesty note | `A commit is evidence that work happened; only a verified exit criterion makes a derived task done. A card dropped into Done without one shows done · unverified and is not counted in readiness.` |
| Search | label `Search tasks`, placeholder `Search title, epic, assignee, TSK-…` |
| Filter labels | `Epic` · `Assignee` · `Sprint` · `Origin` |
| Filter options | `All` · `Everyone` · `Unassigned` · `No sprint` · `From the plan` · `Ad-hoc` |
| Clear | `Clear {n} filter{s} · showing {shown} of {total}` |
| Primary action | `Create task` |
| Column headings | `Parked — {n}` · `Blocked — {n}` · `In progress — {n}` · `Next up — {n}` · `Done — {n}` |
| Empty column | `Nothing here.` |
| Drop announcement | `{task title} moved to {column label}` |
| Assigning with nobody added | `No people yet — add someone on the Team page first.` |

### Creating a task

| Where | Exactly |
|---|---|
| Drawer hint | `This is an ad-hoc task. It lives in board.db only and stays invisible to /shape and /setup until promoted, so it is never mistaken for the agreed plan.` |
| Fields | `Title` · `Epic` · `Points` · `Priority` · `Description` |
| Placeholders | `What needs doing` · `Choose an epic…` · `Optional` |
| Epic options | `Phase {n} — {title}` |
| No title | `A task needs a title.` |
| No epic | `Pick the epic this belongs to.` |
| No points | `Give it points — capacity is the sum of points on open tasks.` |
| Buttons | `Create task` · `Cancel` |

> [!note] "until promoted" describes `/shape`, not a control
> Promotion is done by a person running `/shape`, which writes the criterion into `.idea/`. There is
> no promote button on this page and there should not be one — see [[Board]]. The word stays because
> it names the only route out of `board.db`, and removing it would imply an ad-hoc task can never
> become part of the plan.

## Task card and drawer

| Where | Exactly |
|---|---|
| Card click target | `Open {title}` (visually hidden) |
| Assign placeholder | `Assign {title}` (visually hidden) |
| Avatar group | `Assigned to {A} and {B}` |
| Person set the status | `moved`, tooltip `Status set by a person, not the plan` |
| Set aside | `parked`, tooltip `Set aside; excluded from the phase requirement` |
| Person set the priority | a muted dot, tooltip `Priority set by a person` |
| Points | `{n} pts` · `1 pt` · `0 pts` |
| Effort | `{estimate} / {actual}`, and `—` for either when unset |
| Unverified completion | `done · unverified` |

### Drawer sections

| Where | Exactly |
|---|---|
| Headings | `Reference` · `Epic` · `Note from /setup` · `Status` · `Priority` · `Assignee` · `Effort` · `Sprint` · `Test trail` · `Remove` · `Pull request` |
| Copy control | ` copy`, then ` copied`; on failure `Could not copy to the clipboard.` |
| Status, human-set | `Set by a person on {date}.` |
| Status, derived | `Derived from the plan. Moving it here records what you say is happening; it never edits the roadmap.` |
| Unverified explainer | `Done was claimed here, but no exit criterion verifies it yet. It stays unverified and is not counted in readiness until /setup checks it.` |
| Priority, human-set | `Set by a person, overriding what the phase implies.` |
| Priority, derived | `Derived from the phase this task sits in. Cards sort by it.` |
| Reverting | `Clear override` |
| Assignee | `Unassigned`; with nobody added, `Add people on the Team page first.` |
| Effort help | `Points come from the acceptance criterion in .idea/. Editing here records an override in board.db; the plan's estimate is never rewritten.` |
| Actual help | `Actual is the sum of logged entries — {duration} — never a typed total that can disagree with its parts.` |
| Time row | `Minutes to log` · `min` · `Note (optional)` · `Log time` |
| Sprint | `No sprint`; with none, `No sprints yet — create one on Status.` |
| Test trail, empty | `No test runs linked.` |
| Remove help | `This is an ad-hoc task, so it can be deleted. A derived task cannot — it comes from the plan, and removing it would mean editing .idea/.` |
| Remove button | `Delete this task` |
| Pull request, empty | `None linked.` |
| PR never synced | `status unknown` · `never synced` · `synced {date}` |
| PR help | `State cannot refresh without the GitHub MCP, which is not configured — so an attached link reads status unknown rather than inventing one.` |
| Attach | placeholder `https://github.com/…/pull/12`, button `Attach` |

**Save confirmations**, shown for about 1.6 seconds in the drawer's live region: `Moved` ·
`Following the plan again` · `Priority set` · `Back to the derived priority` · `Assigned` ·
`Points saved` · `Estimate saved` · `Time logged` · `Sprint set` · `Pull request attached` ·
`Deleted`.

## Specs

| Where | Exactly |
|---|---|
| Lede | `Every epic, derived from .idea/epics/. Structure is never editable here — changing the plan is /shape. Counts read done / still required: parked work leaves the denominator, and is shown separately rather than vanishing.` |
| Search | placeholder `Search epics, tasks, themes, TSK-…`, noun `epics` |
| No search matches | `Nothing matches that search.` |
| Epic body | `Theme: {theme} · From: {sources}` |
| Phase with none | `No epics in this phase.` |

## Team

| Where | Exactly |
|---|---|
| Lede | `Who is on what. Names live in board.db, never in .idea/.` |
| Nobody added | `No one has been added yet. This is a single-person project by design — SPECS.md names one user and rules out accounts entirely — so this section may stay empty, and that is a correct result rather than missing data.` |
| Search | placeholder `Search people, tasks, epics, TSK-…`, noun `people` |
| Load | `{n} pts` · `across {n} open task{s}` |
| Contribution | `{n} pts completed · {n} task{s} assigned` |
| Unpointed gap | `{n} open task{s} unpointed — the load above is short by an unknown amount` |
| Nothing assigned | `Nothing assigned.` |
| Add form | `Name` · `GitHub handle (optional)` · `Add person` |

## Status

| Where | Exactly |
|---|---|
| Lede | `Derived from state.json, generated {timestamp}.` |
| Tiles | `Tasks done` / `across {n} epics`, `, {n} parked` · `Blocked` / `waiting on the user` or `nothing stuck` · `Phase {n} of {m}` / `{n} of {m} exit criteria met` · `Estimate accuracy` / `not enough data` / `needs ten completed tasks; {n} so far` |
| Attention lede | `What is in the way, first — before how ready the project is, because these are what decide it. Each carries a reference: run /epic ATT-… to turn one into an epic with tasks.` |
| No attention items | `No rules firing.` |
| Attention meta | `Since {date} · holds up {epic}` |
| Attention command | `/epic {ref}` and `creates the epic and tasks that address this`; the reference button is titled `Copy the reference` and reads ` copied` |
| Readiness | `{n} of {m} gates met.` |
| Gate freshness | `Exit criteria and tasks are computed live, so parking something updates them at once. {stale gates} come from the last /setup run ({date}) — a browser cannot see a test run, a pull request, or whether a deploy happened, and guessing would be worse than deferring. A gate with no evidence stays unmet, never assumed green.` |
| No sprints | `No sprints yet. A project without them is perfectly normal — create one below when a dated window is useful.` |
| Sprint table | `Sprint` · `Dates` · `Status` · `Tasks` · `Points` · `Remove` |
| Sprint footnote | `Completed over committed points. A task with no points still counts as a task — points alone would hide the unestimated work.` |
| Sprint form | `New sprint` · `Name` · `Starts` · `Ends` · `Goal` · `Create sprint`, placeholders `Sprint 1` and `Optional`, success `Sprint created.` |
| Phases lede | `Phases come from the roadmap and are read-only here — /shape adds them. What this page can do is request an advance once the current phase is genuinely finished.` |
| Closing note | `No burndown, no velocity, no projected completion date. Four phases and {n} completed tasks cannot support a forecast, and a projection drawn in the same style as a measurement is not honest.` |

### The advance panel

| State | Exactly |
|---|---|
| Advanced here, clean | `Now on Phase {n}, advanced here.` |
| Advanced here, forced | `Now on Phase {n}, advanced with work outstanding` — `Phase {m} was left with {what}. It is not recorded as finished.` |
| Both, then | `.idea/ROADMAP.md still says Phase {m} — the roadmap is written by /setup, which applies this on its next run. One writer for the plan.` |
| Undo | `Step back to Phase {n}` |
| Something parked | `{n} task{s} and {n} criteri{on/a} parked ({n} pts) — set aside, so this phase can move on without them. Parked is never counted as met: it records that you chose to skip something, which is a different claim from having done it.` |
| Parked criteria | summary `{n} exit criteri{on/a} parked`, each with `Unpark` |
| Last phase | `This is the last phase in the roadmap. /shape adds more.` |
| Gate open | `Phase {n} is finished: every exit criterion met or parked, every task done or parked, nothing in flight.` then `Advance to Phase {n} — {name}` |
| Gate closed | `Cannot advance yet.` `Phase {n} is not finished:` |
| Unmet criteria | `{a} of {b} exit criteria satisfied. Outstanding — park one to move on without it:` each with `Park` |
| Outstanding | `{n} task{s} outstanding.` · `{n} task{s} blocked or in progress.` · `{n} task{s} parked and not counted.` |
| The rule | `Exit criteria are the definition of a phase; tasks are the means. Parking a criterion moves the phase on without it, and records that you did — it never marks it met.` |
| Force, closed | `Advance to Phase {n} anyway` |
| Force, confirming | `Advance to Phase {n} anyway?` `Phase {m} will be recorded as advanced with {what}. It is not marked finished, and what was left is written into the roadmap by /setup rather than quietly dropped.` then `Yes, advance with work outstanding` · `Cancel` |

## The gate, in general

Counts, never percentages, and parked work always visible beside the denominator it was excluded
from:

```
{met} of {total} met                        # nothing parked
{met} of {total} met, {parked} parked       # something parked
```

Outstanding work, assembled from the non-empty parts and joined with `, `:

```
{n} exit criterion unmet   /  {n} exit criteria unmet
{n} task not done          /  {n} tasks not done
{n} blocked or in progress
none blocked or in progress, {n} parked
```

Singular and plural are both written out. `1 tasks not done` undermines every other number on the
page.

> [!warning] Parked is never rendered as met
> The gate reads `4 of 7 met, 3 parked` — not `7 of 7`. Parking is a decision to proceed without
> something, recorded as such. The moment parked work counts as met, the number stops meaning
> anything and the dashboard is decoration.

## Server messages

Written to be read by a person, because the UI renders them verbatim:

| Cause | Exactly |
|---|---|
| No snapshot | `no state.json — run /setup` |
| Missing identifier | `taskId required` · `sprintId required` · `name required` |
| Sprint without a name | `a sprint needs a name` |
| Malformed dates | `dates look like 2026-08-31` |
| End before start | `the end date must follow the start date` |
| Duplicate name | `there is already a sprint with that name` |
| Overlapping dates | `those dates overlap {name}` |
| Sprint still holds work | `that sprint holds {n} task{s} — move them off it first` |

## Empty states, as a rule

Every empty state is **visible text**, never a hidden section. A section that disappears when empty
teaches the reader it does not exist.

> [!danger] Never the words "No sprint defined"
> The sidebar shows the **current phase** instead, and the sprint line is absent entirely until a
> sprint exists. "No sprint defined" reads as a misconfiguration when it is a legitimate state — and
> it wastes the one line that could have said something useful.
>
> `No sprint` as a *select option* is fine and unrelated. It is a choice, not a diagnosis.

There is one deliberate exception to "never hide a section": **a control for something that does not
exist yet is absent, not empty.** The Sprint filter and the sidebar's sprint line do not render
until a sprint exists.

## Status and provenance

| Meaning | Exactly |
|---|---|
| A person dropped a derived task into Done, or confirmed the agent's completion, unverified by an exit criterion | `done · unverified` |
| The agent marked a task done from commit evidence | `done · unconfirmed` |
| An advance was made here, not yet written to the roadmap by `/setup` | `roadmap pending` |
| A phase the project has moved beyond | `advanced past` |
| A phase moved beyond with an advance still pending | `advanced past, roadmap pending` |
| A phase `/setup` verified that `/ship` has not released | `verified · not shipped` |

## Sync and honesty

Nothing synced is shown without the time it was synced. Anything the page cannot verify says so
rather than assuming green.

- Gates the browser cannot compute are shown with their sync time and named as stale. Only
  **Exit criteria** and **Tasks** are live — see [[Derivations]].
- A commit is **evidence that work happened**; only a verified exit criterion makes it done. That
  sentence appears at the top of the Board.
- No burndown, no velocity, no forecast date, and no wording that implies one. `Committed` and
  `completed` points are both shown because someone entered them.

## Tone

Short sentences. The strongest word first. No exclamation marks, no encouragement, no congratulation
on progress — a dashboard that cheers is a dashboard that will eventually cheer at the wrong moment.

Where something is uncertain, say what is missing rather than hedging. `No test runs linked.` beats
`No data available`, because the first tells you what to go and do.

## Related

[[Reference Implementation]] · [[Derivations]] · [[Status]] · [[Board]] · [[Specs]] · [[Team]] ·
[[Task Card And Drawer]] · [[Accessibility And Anti-Patterns]]
