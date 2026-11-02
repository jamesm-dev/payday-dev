---
title: Interaction And States
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Interaction And States

## Two categories, strictly separated

**Derived — never editable here.** Task text, descriptions, epics, phases, exit criteria, and
completion. A task is ticked by doing the work and re-running `/setup`. The page offers no control
that would edit `.idea/`, because that would make it a rival source of truth for the plan.

**Authored — editable here.** Statuses, priorities, assignees, points, estimates, time entries, PR
links, sprints, parked criteria, and phase advances. This is what `board.db` exists to hold, and
this page is its only editor.

If a control does not clearly belong to the second list, it does not ship.

## Mechanics

The dashboard is a **client-rendered single page** mounted into its own HTML entry, talking to a
small set of endpoints on the dev server. See [[API Surface]] for the operation set.

```
load          GET /state and GET /board in parallel
every write   POST → on success, re-fetch both → every section re-renders
```

- **There is no optimistic local model of derived state.** A write posts, and the page then reloads
  both stores and rebuilds the shared task index from them. It is one extra round trip on a local
  dev server, and it is what makes it impossible for two sections to disagree.
- **A failure never mutates anything.** The thrown message — the server's own sentence — renders
  inline where the action was taken, and nothing typed is lost.
- Data is fetched on load and after writes. **No polling, no timers.** PR and test data refresh when
  Claude syncs them into the database, never on a schedule the page controls.
- Phase and epic disclosures are native `<details>`, so their open state is the browser's, not the
  framework's.
- Refresh is a browser refresh.

> [!warning] The page needs JavaScript, and that is a real cost
> This build is a client-side app: with scripting off there is no page at all, not a degraded one.
> It is acceptable **only** because the dashboard is a development-only tool served by the dev
> server, and a stack that can render it server-side should. What must not change is the data flow:
> one derivation, re-read after every write.

## Exposure

The whole surface — page and endpoints — is **development-only by default**. In this build the Vite
plugin mounts with `apply: 'serve'`, so it is not a route that checks a flag; it is a route that was
never compiled into production.

Where a stack cannot express that, mount the router only when the environment is development, and
**fail closed** if the environment cannot be determined. Gate the whole route, not just the page
that renders: a dev-only dashboard with writable endpoints left open in production is worse than no
dashboard.

Validate on the server as well as in the form — a known task id, a sane duration, dates that parse,
a status and priority from the known sets — and reject with a sentence the UI can display, never a
bare 500.

## States to handle

Every one of these will happen. Design each rather than letting it render broken.

| State | What to show |
|---|---|
| Loading | `Loading…` in the content area; the sidebar shows `Loading…` as the project name |
| `state.json` missing | The load fails and the page shows `Could not load the dashboard: no state.json — run /setup`. Never a stack trace, never a blank page |
| `board.db` missing | It is created empty on first request. The page renders with no authored data — not an error |
| Empty board column | The column stays, with its heading, count, and a muted `Nothing here.` Layout must not collapse |
| Every filter excludes everything | Five empty columns plus the Clear control naming the filter count. Obviously filtered, not obviously broken |
| Task has no reference id | `/setup` writes `null` rather than inventing one. The card cannot be keyed, so authored data cannot attach to it — never guess an id, and never fall back to matching on text |
| Task unassigned | A dashed placeholder that is itself the assign control |
| No people added | The assign control errors with `No people yet — add someone on the Team page first.`; the drawer's select says `Add people on the Team page first.` |
| No points | The badge is omitted on the card; the input is empty in the drawer, never `0`. The gap is reported on [[Team]] |
| No estimate or actual | The pair is omitted from the card. Empty inputs in the drawer |
| No test runs linked | A visible `No test runs linked.` Do not hide the section |
| No PR linked | `None linked.` plus the URL field and **Attach** |
| PR never synced | The link, a `status unknown` pill, and `never synced` |
| GitHub MCP unavailable | `pullRequests` is `null`, which means *not configured* — never *no open pull requests*. The page says the status cannot refresh rather than showing an empty list |
| No sprints at all | The Sprint filter and the sidebar sprint line are **absent entirely**. Status invites creating one |
| Sprints exist, none contains today | `no active sprint` in the sidebar |
| Sprint holds tasks | It cannot be deleted: `that sprint holds 3 tasks — move them off it first` |
| A phase with no epics | `No epics in this phase.` |
| Phase advance refused | The gate lists the specific unmet criteria and the outstanding counts. **Never a bare disabled button** |
| Phase advanced here, roadmap behind | `roadmap pending` wherever the phase is shown, and Status names both numbers with a **Step back** |
| Last phase reached | The advance panel says so and names `/shape` as what adds more |
| A phase finishes on its own | The announcement banner at the top of the content area, with **Dismiss** |
| A write fails | The server's message inline, at the control that failed. Never silent, never a lost keystroke |
| Fewer than ten completed tasks | Estimate accuracy reads `not enough data`, never a number |
| No blockers | `No rules firing.` — the section keeps its heading rather than vanishing |

## Related

[[API Surface]] · [[Data Sources]] · [[Derivations]] · [[Board]] · [[Task Card And Drawer]] ·
[[Copy Deck]] · [[Requirements]]
