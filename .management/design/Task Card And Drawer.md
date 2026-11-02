---
title: Task Card And Drawer
created: 2026-08-30
updated: 2026-08-31
tags: [design, management, ui]
status: active
---

# Task Card And Drawer

The board's main unit, and the one place on the page where people type things in. Structure comes
from `state.json`; everything editable comes from `board.db` — see [[Data Sources]].

## Task card

Compact enough that a column of eight is readable, dense enough to answer "who, and how big"
without opening anything.

```
+--------------------------------------------+
| |TSK-8F31  HIGH ·  parked                   |  head: id, priority, marker
| |Persist documents across restart           |  title, max 2 lines
| |Write on save, restore on load             |  description, 1 line, truncated
| |(Expense Ledger)                           |  epic chip, always present
| |(JD)(AM)            3 pts   2h / 3.5h      |  assignees | points | est / actual
+--------------------------------------------+
 ^ 4px leading edge in the epic's colour
```

### Anatomy, in order

| Row | Contents |
|---|---|
| **Head** | Reference id in monospace · priority as an uppercase word · a muted dot when a person set that priority · then **one** status marker at most |
| **Title** | The task text. Two lines maximum, then ellipsis. Never reflows to three |
| **Description** | One muted line, truncated with an ellipsis. Omitted entirely when absent — never a blank row |
| **Epic chip** | The epic's name, tinted in its colour. Always present |
| **Foot** | Assignees · points · estimate over actual · the unverified marker |

### The one status marker

The head carries at most one, and in this precedence:

1. **`parked`** in `warn` — *Set aside; excluded from the phase requirement*. Parking removes work
   from a requirement, so it is never quiet.
2. **`moved`** — *Status set by a person, not the plan*. Only when a person overrode the derived
   status and the card is not parked.
3. Nothing.

**There is no `ad-hoc` pill.** The `ADH-` reference in the head already says so, and a second marker
for the same fact is clutter.

### Foot details

| Field | Behaviour |
|---|---|
| **Assignees** | Overlapping circular initials, at most three, then `+N`. The group carries an accessible label — `Assigned to Jamie Doe and Alex Mir` |
| **Unassigned** | A dashed circle that **is itself the assign control**, so assigning costs one click. See [[Board]] |
| **Points** | Pushed to the right of the row. `3 pts`, `1 pt`, `0 pts`. **Omitted entirely when unset** — a badge reading `no pts` is noise on a card that has enough of it. The gap surfaces on [[Team]], where it actually distorts a number |
| **Estimate / actual** | `2h / 3.5h`. Actual is emphasised in `warn` when it exceeds the estimate — that contrast is the whole reason to show both. `2h / —` when no time is logged. **The pair is omitted when neither is set** |
| **Unverified** | `done · unverified` in `warn`, on a derived card a person dropped into Done, or whose agent completion a person confirmed, with no verified criterion behind it |

Durations are always human units — `30m`, `2h`, `3.5h`, `2d`. Never raw minutes in the UI.

### Structure and interaction

The card is a **list item** containing a full-bleed `<button>` that covers it and opens the drawer.
The button sits *under* the content rather than wrapping it, because a button inside a button is
invalid — the assign control and the pills are real controls above it.

- The whole card is the click target, and it is keyboard-reachable: Space and Enter open the drawer.
- Focus is visible on the card itself, drawn from the inner button's `:focus-visible`.
- `draggable`, always. The cursor is `grab`, and `grabbing` while held. See [[Board]].
- `min-width: 0` so the description can actually truncate instead of setting a floor on how narrow
  the column may go.

## Task drawer

Opens from the right at full height above 768px; a bottom sheet below it. It is the shared `Drawer`
component — see [[Design System]] for what a hand-built one owes.

Its header is **sticky**, carries the title and a `×` close button, and keeps its top padding when
stuck. A heading that loses its spacing on scroll looks like a rendering fault.

Beneath the header sits a single polite live region that shows either an error in `fail` or a brief
confirmation in `ok`. **Every write funnels through it**, so a failed write is never silent and a
successful one always says so. The confirmation clears itself after about 1.6 seconds.

### Contents, in order

**Identity** — a definition list, no controls but one:

1. **Reference** — the id in monospace, as a **click-to-copy** button reading ` copy`, then
   ` copied` for about 1.4 seconds.
2. **Epic** — the epic name, `· Phase {n}`, and the repository path to its note on the line beneath.

   > [!warning] The epic path is `code`, not a link
   > `.idea/` sits outside what the dev server serves, so an `<a href>` to it would be a dead link
   > in the browser. Render `../.idea/epics/{Epic}.md` as monospace text to be copied or opened in
   > the editor. A stack that *does* serve the vault may link it — and must never use a wikilink,
   > which cannot cross between the two vaults.
3. **Note from `/setup`** — only when the task carries one. It is `/setup`'s note about the task —
   the evidence that closed it, or what it is waiting on — **not** a description of the task, and
   the label says so.

**Then one `<section>` per concern**, each separated by a 1px rule, each with a small uppercase
heading:

| Section | Controls | Notes |
|---|---|---|
| **Status** | A select of the five statuses; **Clear override** when a person set it | The help line says either `Set by a person on {date}` or that it is derived from the plan and moving it never edits the roadmap. When the card is unverified, a `warn` line explains what that means |
| **Priority** | A select of `high`/`normal`/`low`; **Clear override** when overridden | Help says whether it is derived from the phase or set by a person, and that cards sort by it |
| **Assignee** | A select: `Unassigned`, then every person | With nobody added: `Add people on the Team page first.` |
| **Effort** | **Points** and **Estimate (min)** number inputs, saving **on blur**; the entry list; and a row to log minutes with an optional note | Two help lines: points come from the acceptance criterion and an edit here is an override in `board.db`; actual is the **sum of logged entries**, never a typed total that can disagree with its parts |
| **Sprint** | A select: `No sprint`, then every sprint | With none: `No sprints yet — create one on Status.` |
| **Test trail** | Read-only list: status, name, when it ran | Empty reads `No test runs linked.` — visible, never a hidden section |
| **Remove** | **Delete this task**, in `fail` | **Only on ad-hoc tasks.** The help says why a derived one cannot be deleted |
| **Pull request** | The linked PRs, then a URL field and **Attach** | Each row: number or URL, a state pill, and either `synced {date}` or `never synced`. Empty reads `None linked.` Help says state cannot refresh without the GitHub MCP, so an attached link reads `status unknown` rather than inventing one |

### Editing rules

Every editable field:

- saves on blur or on change — never behind a Save button that can be forgotten,
- shows a brief confirmation in the live region,
- **surfaces a failure inline with the server's own message**, and never loses what was typed,
- never triggers a page reload; the shared data is re-fetched and every section re-renders.

Only fields backed by `board.db` are editable. **Task text, epic, phase, and completion are derived
and read-only here** — the drawer offers no control that would edit `.idea/`.

### URL and focus

The drawer sets `?task=TSK-7F3A21` with a **pushState**, so a task is linkable and the back button
closes it. It is a modal dialog: focus moves in on open, is trapped while open, returns to the
originating card on close, Escape closes it, the backdrop closes it, and the page behind does not
scroll.

## Not built, and deliberately

| Absent | Why |
|---|---|
| PR badge and test glyph on the card | The card already carries seven fields. Both live in the drawer, where there is room to say what they mean |
| The agent-provenance block | Who confirmed what, and when, is `/setup`'s conversation, not the card's. The card shows the `done · unconfirmed` status label (Copy Deck) for an agent completion no person has confirmed yet; `/setup` Phase 6 is where a person confirms or rejects it |
| An assignee **list** on a task | One assignee is set from the drawer's select. The card renders several because the schema allows them, and a rebuild must keep that read path |
| A rendered-Markdown description | Descriptions are one line of plain text |
| Created and updated timestamps | Nothing on the page acts on them |

## Related

[[Board]] · [[Components]] · [[Design System]] · [[Interaction And States]] · [[API Surface]] ·
[[Copy Deck]] · [[Accessibility And Anti-Patterns]]
