---
title: Components
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Components

The complete inventory of what the page is built from, and what each piece must communicate. Every
one maps to an existing project component wherever one exists — [[Design System]] governs that
mapping. Where none exists, compose from what does.

Task cards and the drawer have their own note: [[Task Card And Drawer]]. Measurements are in
[[Reference Implementation]]; the exact strings are in [[Copy Deck]].

> [!note] Class names are this build's, not the requirement
> They are given because a rebuild on the same stack should not have to invent them, and because
> the compliance checklist refers to them. What is fixed is the **anatomy** — what each piece
> contains, in what order, and how it behaves.

## Shared, on every section

| Piece | Is | Carries |
|---|---|---|
| `.shell` | The two-column grid | Sidebar, then main content |
| `.sidebar` | Sticky full-height rail | Brand block, nav, phase footer — see [[Navigation]] |
| `.content` | The main region | One `h2`, one `.lede`, then the section |
| `h2` | The section title | `Board` · `Specs` · `Team` · `Status`. One per section |
| `.lede` | The sentence under the title | What this section is, and what it may not do |
| `.card` | The surface | 1px border, 12px radius, 16px padding, `surface` background |
| `.note` | An inline caveat | 3px leading edge in `warn`, muted text, 78ch |
| `.pill` | A small round label | Fully round, bordered, muted by default |
| `.empty` | An empty state | Muted text in place, never a hidden section |

**Pill variants**, each recolouring border and text only — never a filled background:

| Variant | Colour | Means |
|---|---|---|
| default | `line` / `muted` | A neutral count or label |
| `.done` / `.okpill` | `ok` | Met, done, advanced past |
| `.parked` / `.parkpill` / `.unverified` / `.adhoc` | `warn` | Set aside, or claimed without evidence |
| `.current` / `.nowpill` | `accent` | The phase the project is on, weight 600 |

**Buttons**, three kinds and no more:

| Kind | Looks like | Used for |
|---|---|---|
| `.action` | Bordered, raised (`surface-2`), accent border on hover | Any ordinary write: create sprint, add person |
| `.create` | Bordered in `accent`, accent text, weight 600 | The one primary action on a section |
| `.linkish` | Underlined text, no border, `fail` on hover | Destructive or reversing: Remove, Unpark, Step back |

A destructive variant adds `.danger` — `fail` border and text. `.clear` is a `warn`-bordered pill
button, used only to clear filters.

## Sidebar

Project name, then the current phase, then the sprint line — in that order, and the phase is never
omitted. Nav below it, phase progress pinned at the foot. Full anatomy and rules in [[Navigation]].

The **phase progress bar** is a 6px fully-rounded track with an accent fill, carrying
`role="progressbar"` and its `aria-valuenow`/`min`/`max`, and **its count as text beneath it** —
`63% of Phase 1 tasks done`. A bar alone is decoration.

## Board

| Piece | Anatomy |
|---|---|
| `.toolbar` | Two areas: `.filters` (wraps freely) and the **Create task** button pinned right. Never one wrapping row — a third filter used to push the button onto its own line |
| `.filters` | Search box, then Epic, Assignee, Sprint (only when sprints exist), Origin. Each a `<label>` wrapping its control, muted 0.85rem |
| `.clear` | Appears only while something narrows the view: `Clear 2 filters · showing 12 of 34` |
| `.board-columns` | Flex row, 16px gap, `overflow-x: auto`, `scrollbar-gutter: stable` |
| `.col` | One status column: `h3` reading `{Label} — {count}`, then a `ul.stack` of cards. Highlights with a dashed accent outline while a card is dragged over it |
| `li.empty` | `Nothing here.` The column keeps its heading and its width |

Columns and their order are fixed: **Parked, Blocked, In progress, Next up, Done**. See [[Board]].

## Specs

`details.epic` is the unit — a **native** disclosure, so its open state belongs to the browser
rather than to component state, and it keeps its keyboard and screen-reader behaviour for free.

- **Summary**: epic title in its epic colour, a `{done}/{required}` pill, a `{n} parked` pill when
  any is parked, and the epic's own status pill. 4px leading edge in the epic colour.
- **Body**: theme and source ideas on one muted line, then `ul.crit` — one row per task with its
  glyph (`✓` done, `⏸` parked, `·` open), text, monospace id, and a points pill where set.
- Open by default **only for the current phase**. Later phases stay closed.

Phase groups above them are `h3` headings carrying the phase status pill.

## Team

One `article.card` per member in a `.columns` grid (`auto-fit`, 230px floor):

```
Jamie Doe  @jamiedoe
13 pts   across 5 open tasks
47 pts completed · 8 tasks assigned
2 open tasks unpointed - the load above is short by an unknown amount
TSK-8F31  Persist documents across restart          (Ledger)
```

Load is the large tabular figure; the unpointed warning is `warn` and only rendered when there is
one. Each assigned task row carries an `.epicchip` in the epic's colour. The add-person form is a
single `.card` row: name, handle, **Add person**.

## Status

In order down the page:

| Piece | Anatomy |
|---|---|
| `.tiles` | Four `article.card.tile`, each a value (`.v`, 1.6rem, tabular), a label (`.l`), and one muted detail line (`.d`). Never a chart |
| `.card.attention` | 4px leading edge in `warn`, or `fail` when critical. Head: severity word, title, and the reference as a copy button. Then `Since {date} · holds up {epic}`, the next action, and the `/epic {ref}` command |
| `ul.gates` | Monospace checklist. `[x]`/`[ ]` marker in `ok`/`fail`, the gate name, and the reason right-aligned and muted |
| `.sprints` | A table: Sprint, Dates, Status, Tasks, Points, and a `Remove` link |
| `.card.sprintform` | Name, Starts, Ends on one row; Goal and **Create sprint** on the next |
| `details.phase` | One per phase, **closed by default**. Summary carries name, status pill, `{done}/{required}` and any parked count. Body groups delivered work by epic in the epic's colour |
| `.card.advance` | The gate panel: what is parked, what is outstanding, and the advance controls |
| `.note.advanced` | The automatic-advance announcement, with **Dismiss**. `warn` edge when it moved past outstanding work, `ok` when clean |

A tile value turns `warn` only when the number is a problem — the blocked count above zero. No tile
ever holds a sparkline; there are not enough points behind any of them.

## What is deliberately absent

Rebuilding any of these is a regression, not an improvement:

| Not built | Why |
|---|---|
| Page header and footer | The sidebar carries identity; `generatedAt` sits on Status |
| A separate **Delivered** log | It repeated the phase list, grouped the same way, and grew without bound. Delivered work lives inside each phase's disclosure |
| Charts of any kind | Four phases and a handful of completed tasks cannot support one. See the forecast rule in [[Status]] |
| An epic drawer | Specs is a disclosure list; a drawer would be a second place to read the same thing |
| A member drawer | The card already carries every figure Team has |
| Promotion of ad-hoc tasks | Writing to `.idea/` is `/shape`'s job, and the flag had no consumer |

## Related

[[Page Layout]] · [[Navigation]] · [[Board]] · [[Specs]] · [[Team]] · [[Status]] ·
[[Task Card And Drawer]] · [[Copy Deck]]
