---
title: Board
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Board

The default section. Work in flight, as cards, plus the one place tasks are created.

Card and drawer anatomy live in [[Task Card And Drawer]]. This note covers the section around them:
the columns, the filters, dragging, and creation.

## Layout, top to bottom

1. **`h2` — Board.**
2. **Lede** — `{n} tasks across {m} epics.` then the one sentence that says what dragging means: it
   records what you say is happening in `board.db` and never edits the plan.
3. **The honesty note** — a commit is evidence that work happened; only a verified exit criterion
   makes a derived task done. A card dropped into Done without one shows `done · unverified` and is
   not counted in readiness. This sentence is not decoration and does not move below the fold.
4. **A visually hidden live region**, polite, for drop announcements, and an inline error line.
5. **The toolbar** — filters left, **Create task** right.
6. **The five columns.**

## Columns

Five, in this order, each header reading `{Label} — {count}`:

**Parked · Blocked · In progress · Next up · Done**

Parked comes first because it is the column you want out of the way — work set aside sits to the
left of work in flight, not between it and Done. **Done is a full column**, not a collapsed section:
it is where cards are dropped, so it has to be a drop target like any other.

Within a column, cards sort by **priority rank, then phase, then epic title**. A board that displays
priority without ordering by it is decorating rather than prioritising.

An empty column keeps its heading, its count and its width, and shows a muted `Nothing here.` The
layout never collapses — a search with no matches shows five empty columns, so it is obvious the
board is filtered rather than broken.

## Filters

One wrapping row, each control writing to the URL with `replaceState` so a narrowed board is
shareable and the back button is not filled with filter states:

| Control | Options | Default | URL |
|---|---|---|---|
| **Search** | free text over title, description, epic, reference id and assignee names | empty | `?q=` |
| **Epic** | `All`, then every epic title | `All` | `?epic=` |
| **Assignee** | `Everyone`, `Unassigned`, then each person | `Everyone` | `?assignee=` |
| **Sprint** | `All`, `No sprint`, then each sprint | `All` | `?sprint=` |
| **Origin** | `All`, `From the plan`, `Ad-hoc` | `All` | `?origin=` |

**The Sprint control is absent entirely until a sprint exists** — the same rule as the sidebar's
sprint line. An empty select is a question the reader cannot answer.

Filters narrow; they never reorder and never hide a column. While anything is narrowing the view, a
`warn`-outlined **Clear** control appears carrying the count:

```
Clear 2 filters · showing 12 of 34
```

A board silently filtered from a stale URL is the most confusing state it has.

## Creating a task

The board carries **one** control for this: a **Create task** button, pinned to the right of the
toolbar so a wrapping filter row never pushes it onto its own line. The form itself lives in a
drawer — the same component the task drawer uses.

A form parked permanently in a toolbar is three controls of visual noise on every visit, paid for by
the rare moment someone adds an ad-hoc task. Put it behind a button and the board stays a board.

The drawer opens with a hint saying what an ad-hoc task is — it lives in `board.db` only and stays
invisible to `/shape` and `/setup`, so it is never mistaken for the agreed plan — then five fields:

| Field | Required | Default | Refusal when missing |
|---|---|---|---|
| Title | **Yes** | empty | `A task needs a title.` |
| Epic | **Yes** | none chosen | `Pick the epic this belongs to.` |
| Points | **Yes** | `3` | `Give it points — capacity is the sum of points on open tasks.` |
| Priority | Yes | `normal` | — |
| Description | No | empty | — |

The epic select lists every epic as `Phase {n} — {title}`. It offers no free-text epic: associating a
task with an epic that does not exist would break the link back to the plan.

**Epic and points are both required, and for the same reason.** A task belonging to nothing cannot
be placed, counted, or coloured; a task with no points makes a member's load wrong by an unknown
amount. An ad-hoc task is still a task.

On save the task is written to `board.db` with an `ADH-` id, then its points are saved, then the
board reloads. Errors surface inline in the drawer and nothing typed is lost.

### Removing an ad-hoc task

An ad-hoc task can be deleted from its drawer — it was authored here and belongs to nobody else. A
**derived** task cannot: it comes from an acceptance criterion, and removing it would mean editing
`.idea/`. The control appears only on ad-hoc cards; a disabled one on every card would be noise.

## Two kinds of task

Tasks reach the board two ways, and they are **not** the same thing.

| | **Derived** | **Authored** |
|---|---|---|
| Comes from | An epic's acceptance criterion in `.idea/` | Created here, on the board |
| Id | `TSK-7F3A21` — the block reference | `ADH-3C81` |
| Text | Read-only. Editing it would edit the plan | Fixed at creation |
| Visible to `/shape` and `/setup` | Yes | **No** |
| Lives in | `state.json`, derived from Markdown | `board.db` only |
| Can be deleted here | No | Yes |

Both render as the same card and carry the same assignees, points, and time. An authored task is
identified by its `ADH-` reference, which is already on the card — **no second "ad-hoc" pill**. A
duplicate marker for a fact the id already carries is clutter.

> [!warning] Why the distinction is not cosmetic
> `.idea/` is the plan of record. A task invented on the board has not been through shaping — it has
> no acceptance criteria and no place in the roadmap. Showing it identically to a derived task would
> quietly turn the board into a second plan that nobody reviewed.

## Priority

**Every task carries a priority**, assigned when it is generated rather than left blank for someone
to fill in later. A field that starts empty on 34 tasks stays empty.

| Priority | Assigned to |
|---|---|
| `high` | Tasks in the **current** phase — the work actually in front of you |
| `normal` | Tasks in the **next** phase |
| `low` | Everything further out |

The derived priority follows the phase the project is **effectively** on, so advancing a phase
re-prioritises the whole board at once rather than at the next `/setup`. `/setup` also writes a
priority onto each task in `state.json`; a person's override in `board.db` beats both.

It renders as a small uppercase marker carrying **its word**, never colour alone — `high` reads as a
word for anyone who cannot separate the hues — with a muted dot beside it when a person set it.

## Epic colour

**Every epic is colour-coded, always**, and that colour is carried on every card belonging to it, so
a column can be read for "which epic is this" without reading a line of text.

The colour is **not** one hue per epic — a real project outgrows eight categorical hues, and a
generated ninth is the anti-pattern [[Accessibility And Anti-Patterns]] forbids:

- **Hue comes from the phase**, from four families cycled by phase number.
- **Shade varies by the epic's position within its phase**, capped so it never washes out.

Epics in the same phase therefore look related, which they are, and the scheme stays legible at
forty epics because it never needs a fifth hue. The exact palette and the central sort that assigns
the index are in [[Reference Implementation]] and [[Derivations]].

> [!warning] Colour is an aid, never the identifier
> The epic **name** appears on the card regardless, as a tinted chip. The colour makes a column
> scannable; it does not carry meaning on its own. Anyone who cannot distinguish the hues loses
> nothing.

It is applied as a 4px leading edge on the card and a tinted chip — never as a full card background,
which would fight the status palette and make the text unreadable. Contrast at least 3:1 against the
card background in both themes.

## Dragging

**Every task card is draggable, always.** A board whose cards cannot be moved is a report, not a
board.

The obvious objection is that a derived task's status comes from `state.json`, so dropping it
elsewhere would either snap back or require editing `.idea/`. Neither happens, because a drop does
not touch the plan — it writes an **explicit status** to `board.db`:

```
task_status: task_id, status, source = human, set_at
```

A task's status is then its explicit status if one exists, otherwise the derived one. That is
authored data about execution, which is exactly what this page is allowed to own. Dragging records
what a person says is happening; it never claims the plan changed.

The column under the pointer highlights with a tinted background and a dashed accent outline, so the
drop target is never ambiguous.

### Reverting

Dragging a derived task **back to its derived column clears the override** rather than writing the
opposite status, so the card follows the plan again. A rebuild that writes the status instead leaves
a permanent override that looks identical and behaves differently the next time `/setup` runs.

### Parking

**Parked** means *deliberately not doing this, for now*. It is the honest alternative to leaving a
task in Next up forever, or quietly ticking it to make a column look finished.

A parked task:

- **does not count toward its phase's task requirement**, so a phase can advance without it,
- keeps its points, its assignee and its history — parking is not deletion,
- is counted and shown wherever progress is reported, never subtracted silently,
- leaves every denominator that excluded it labelled with how many were parked.

> [!danger] Parking a task does not park an exit criterion
> Exit criteria are the definition of a phase; tasks are the means. Parking every task in a phase
> does **not** make its criteria met.
>
> A criterion can be parked too — deliberately, on [[Status]], one at a time, and it is never
> rendered as met. A criterion that should never have been required is a mistake in the plan, and
> the plan is fixed with `/shape`.

### Dropping into Done

Completion is the one status that carries a claim about evidence, so it is treated differently.

- Dropping a **derived** task into Done records the human status and renders the card as
  `done · unverified` until `/setup` verifies the underlying exit criterion.
- Dropping an **ad-hoc** task into Done is simply done: it has no exit criterion to verify against.
- The unverified marker is never hidden and never counted as done in readiness. Progress you cannot
  evidence stays fiction, whichever column the card sits in.

### Keyboard and screen reader

Drag is a pointer convenience, never the only path.

- Every card carries a **Move** select in its drawer that sets the same status, so every drag is
  achievable by keyboard.
- Cards stay list items containing a `<button>`; the drag handlers are added to the card, not
  substituted for its activation. Space and Enter still open the drawer.
- A drop announces through the polite live region: `Persist documents moved to In progress`.
- `aria-grabbed` is not used — it is deprecated and unsupported. The live region carries the meaning.

## Quick assign

An unassigned card shows a dashed circular placeholder that **is itself the assign control**:
clicking it assigns the first person on the team, so assigning costs one click. With nobody added
yet it fails loudly rather than silently: `No people yet — add someone on the Team page first.`

Assigning to anyone specific is the drawer's select.

## What the board deliberately does not do

| Not built | Why |
|---|---|
| Inline editing of task text on a card | The drawer is the editor, and derived text is not editable anywhere |
| A per-column "new task" button | One creation path, one drawer. Five buttons for one action is noise |
| Promotion of an ad-hoc task into its epic | Writing an acceptance criterion into `.idea/` is `/shape`'s job. A flag nothing consumes is worse than no flag |
| Deleting a derived task | Its criterion lives in the plan; it disappears when the criterion does |

## Related

[[Task Card And Drawer]] · [[Components]] · [[Navigation]] · [[Derivations]] · [[API Surface]] ·
[[Copy Deck]] · [[Sprints]]
