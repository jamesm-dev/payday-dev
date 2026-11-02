---
title: Navigation
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Navigation

The dashboard is **one page** with four sections behind a persistent sidebar. One section shown at a
time, one job each.

| Menu | Fragment | Job | Note |
|---|---|---|---|
| **Board** | `#board` | The task board. Work in flight, and where tasks are created | [[Board]] |
| **Specs** | `#specs` | The epics, and how much of each is done | [[Specs]] |
| **Team** | `#team` | Who is on what, and how much is left | [[Team]] |
| **Status** | `#status` | Attention, readiness, sprints, phases, and the advance gate | [[Status]] |

Board is the default. Someone opening the dashboard wants today's work, not a chart. An absent or
unrecognised fragment resolves to Board rather than erroring.

## Routing

**The fragment is the route.** Clicking a nav item sets `location.hash`; a `hashchange` listener
sets the section, so the browser's back and forward buttons move between sections.

> [!note] Why a fragment and not a router
> The app is deliberately framework-light, and the dashboard must not be the thing that adds a
> routing dependency to it. Four sections do not need one. A stack that already ships a router
> should use it — real paths (`/management/specs`) are strictly better — but **adding** one for this
> page is forbidden by the no-new-dependency rule in [[Design System]].

Three URL layers, and they do not collide:

| Layer | Holds | Written with |
|---|---|---|
| `#fragment` | Which section is showing | `location.hash`, a history entry |
| `?q= ?sq= ?tq= ?epic= ?assignee= ?sprint= ?origin=` | Filters and searches | `history.replaceState` — a filter is not a navigation |
| `?task=` | The open task drawer | `history.pushState` — the back button closes the drawer |

Any view someone is looking at can be pasted to a colleague.

## Sidebar

```
+---------------+
| Gastos        |  project name
| Phase 1 of 4  |  phase, always present
|  - Core loop  |
| roadmap pend. |  only while an advance is unwritten
| Sprint 4      |  only once a sprint exists
|               |
| > Board    12 |  active: background, weight, inset accent edge
|   Specs     6 |
|   Team      1 |
|   Status      |  no count
|               |
| 63% of Phase  |
| 1 tasks done  |
| [######....]  |
+---------------+
```

**248px**, sticky, full viewport height, its own scroll, raised background, 1px right border.

### The brand block

- **Project name** from `state.json`. `Loading…` until the first fetch returns.
- **The phase, always, and always first** — `Phase 1 of 4 — Core loop`. It is the one of the two that
  always exists, and what the plan is measured against.
- **`roadmap pending`** in `warn`, uppercase and small, whenever an advance made here has not yet
  been written to the roadmap by `/setup`. Its tooltip says so.
- **The sprint line only once at least one sprint exists**, reading the active sprint's name, or
  `no active sprint` when sprints exist but none contains today.

> [!warning] Never render "No sprint defined"
> A project with no sprints is the normal state, not a missing setting. Saying a thing is undefined
> implies it should have been defined and invites the reader to go and fix nothing. Show the phase,
> which is real, and stay silent about sprints until one exists.

### Items and counts

Each item is a button in a `<nav>`, carrying its label and a right-aligned muted count where one is
meaningful:

| Section | Count | Absent when |
|---|---|---|
| Board | Open tasks — neither done **nor parked** | Never; it reads `0` |
| Specs | Epics in the **current** phase | Never |
| Team | People added | Never; it reads `0` |
| Status | — | Always. A number there would imply a problem count that changes meaning as the rules change |

Parked work is not open work. A count that included it would make setting something aside look like
no progress at all.

### Phase footer

A 6px progress bar plus **its count as text**: `63% of Phase 1 tasks done`. The percentage excludes
parked tasks from its denominator — they are no longer required, so counting them would understate
progress forever.

## Behaviour

- The active item is marked by **background, weight, and a 2px inset accent edge** — never colour
  alone — and carries `aria-current="page"`.
- The sidebar never collapses on desktop, and is never a hamburger. Four items do not justify
  hiding navigation behind a tap.
- Below **820px** the shell becomes one column: the sidebar goes static at the top, its right border
  becomes a bottom border, and the nav wraps horizontally.

## Accessibility

- A `<nav>` containing the four controls; the active one carries `aria-current="page"`.
- Counts sit inside the control's accessible name, not as floating text read separately.
- Focus order is sidebar, then main content.
- The progress bar carries `role="progressbar"` with `aria-valuenow`, `aria-valuemin`,
  `aria-valuemax` and a label naming the phase — and its count in text regardless.

> [!warning] Buttons cost something, and the cost is real
> Because the nav items are buttons rather than `<a href>`, middle-click and open-in-new-tab do not
> work on them. That is the price of adding no router. Where a stack already has one, use real
> links and pay nothing.

## Search, per section

Board, Specs and Team each carry a search box. **Each owns its own URL key**, so switching sections
never silently applies one section's search to another's list — which reads as a bug rather than a
feature.

| Section | Key | Matches |
|---|---|---|
| Board | `?q=` | Task title, description, epic, reference id, assignee name |
| Specs | `?sq=` | Epic title, theme, source ideas, and every task id and text inside it |
| Team | `?tq=` | Name, handle, and the id, text and epic of anything assigned to them |

Matching is case-insensitive substring, across all fields joined — someone looking for a task knows
*something* about it and should not have to say which field that something is.

Each shows a **Clear** control with a count while a search is active. Specs and Team share one
`SearchBox` component; the Board keeps its own, because its box sits inside a row of four filters
whose Clear reports all of them together. Forcing one component to serve both would make it worse at
each.

## Related

[[Page Layout]] · [[Components]] · [[Board]] · [[Specs]] · [[Team]] · [[Status]] ·
[[Reference Implementation]]
