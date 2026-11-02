---
title: Page Layout
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Page Layout

The shell every section renders into, and the spacing that holds it together. Exact values live in
[[Reference Implementation]]; this note says what the page *is*.

> [!important] There is no page header and no page footer
> An earlier draft put the project name and description in a header across the top, and
> `generatedAt` in a footer. Neither shipped, and neither should be rebuilt: the **sidebar** carries
> the project name and phase in every section, and the timestamp belongs on [[Status]], next to the
> figures it qualifies. A header repeating what the sidebar already says is a wasted band across
> every page.

## Shell

Two columns, always, from a single grid:

```
grid-template-columns: 248px minmax(0, 1fr)
min-height: 100vh
```

- **Sidebar** — sticky to the top, full viewport height, its own scroll, raised background
  (`surface-2`), 1px right border. Contents in [[Navigation]].
- **Content** — `min-width: 0`, padding `32px 32px 48px`, and **no max width**. This is a dashboard,
  not an article: the board needs the whole width. Prose constrains *itself* instead — every lede
  and note is capped at `78ch`.

> [!danger] `minmax(0, 1fr)`, never `1fr`
> A plain `1fr` track takes an automatic minimum of its content, so the board's horizontal scroller
> grows the track instead of scrolling inside it and the last column is pushed off screen. It looks
> like a board bug; it is a grid bug two levels up. Any grid or flex ancestor of the board needs an
> explicit zero minimum.

## Information hierarchy

The page is four sections, not one scroll. Priority is expressed by *which section* something is in
and where it sits inside that section:

| Section | Answers | Order inside it |
|---|---|---|
| **Board** (default) | What is in flight, and what is next | lede → honesty note → toolbar → columns |
| **Specs** | What was agreed, and how much of it is done | lede → search → phase groups → epics |
| **Team** | Who is on what, and how much is left | lede → search → member cards → add person |
| **Status** | Are we stuck, and can we ship | tiles → **needs attention** → readiness → sprints → phases → advance |

**On Status, obstacles come before the score.** Readiness answers *can we ship yet*; the attention
list is *why not*. A reader who meets the gates first has to scroll back up to act on anything.

The task drawer sits above all of it when open — everything one task needs lives there, which is
what keeps the board scannable. See [[Task Card And Drawer]].

## Wireframe — the Board section

```
+---------------+--------------------------------------------------------------+
| Gastos        | Board                                                        |
| Phase 1 of 4  | 34 tasks across 10 epics. Drag a card to move it - that      |
|   - Core loop | records what you say is happening in board.db and never       |
| roadmap pend. | edits the plan.                                              |
| Sprint 4      |                                                              |
|               | | A commit is evidence that work happened; only a verified   |
| > Board    12 | | exit criterion makes a derived task done.                  |
|   Specs     6 |                                                              |
|   Team      1 | [Search......] Epic [All v] Assignee [Everyone v]             |
|   Status      | Sprint [All v] Origin [All v]  (Clear 2 filters - 12 of 34)  |
|               |                                        [ Create task ]       |
|               |                                                              |
|               | PARKED - 1   BLOCKED - 0   IN PROGRESS - 2   NEXT UP - 8  ... |
| 63% of Phase  | +----------+ +----------+ +------------+ +------------+      |
| 1 tasks done  | |TSK-8F31  | |Nothing   | |TSK-2C09    | |TSK-77B1    |      |
| [######....]  | |HIGH      | |here.     | |HIGH        | |NORMAL      |      |
+---------------+ |Persist   | +----------+ |Restore on  | |Load under  |      |
                  |documents |              |open        | |200ms       |      |
                  |Write on..|              |            | |            |      |
                  |(Ledger)  |              |(Ledger)    | |(Perf)      |      |
                  |(JD) 3 pts|              |(JD)  2 pts |              |      |
                  |  2h/3.5h |              |            | |            |      |
                  +----------+              +------------+ +------------+      |
                  +----------------------------------------------------------+
```

Each column keeps its heading and count when empty; the layout never collapses. Card anatomy is in
[[Task Card And Drawer]], the toolbar and columns in [[Board]].

## Responsive

Three breakpoints, deliberately **not** equal, because the board runs out of width before the shell
does:

| Width | What changes |
|---|---|
| `≤ 900px` | Board columns become `82vw` each — the board is swiped, not squeezed |
| `≤ 820px` | Shell collapses to one column; the sidebar becomes a static top bar with its nav wrapping horizontally, and its right border becomes a bottom border |
| `< 768px` | The drawer becomes a bottom sheet instead of a right-hand panel |

Nothing is hidden at small sizes. Truncation is fine; omission is not. Task cards keep every field —
a phone shows the same information, just taller.

## Spacing

One scale — **4 · 8 · 12 · 16 · 24 · 32 · 48** — and nothing between the steps. A gap that wants
14px means the layout is wrong, not the scale.

- **Cards breathe**: 16px internal padding, 12px between cards in a column.
- **Board columns** sit 16px apart; grids of cards use 24px.
- **Sections are 32px apart**, and a heading sits 12px above its own content. Proximity is what says
  which block a heading owns; without it the page is one wall.
- **The drawer is roomier than the board** — 24px padding, 24px between its sections — because it is
  where someone stops to read and type.

> [!warning] Density is not information
> Fitting more on screen does not communicate more. If a board needs compressing to fit, the answer
> is a filter, not smaller gaps.

## The board is the one exception to prose width

A column of cards is scanned, not read, so the 78ch rule does not apply to it. The board **fills the
available width** and shares it evenly between columns, with a floor of 220px each; it scrolls
horizontally only once that floor no longer fits.

Fixed-width columns are the trap: they leave the last column sliced by the viewport edge, which
reads as broken rather than scrollable. Geometry in [[Reference Implementation]].

## Related

[[Reference Implementation]] · [[Navigation]] · [[Components]] · [[Board]] ·
[[Task Card And Drawer]]
