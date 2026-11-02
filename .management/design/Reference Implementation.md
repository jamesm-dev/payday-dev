---
title: Reference Implementation
created: 2026-08-31
updated: 2026-09-01
tags: [design, management, ui, reference]
status: active
---

# Reference Implementation

The measured fixed point. [[Design System]] says *use the project's own theme*; this note says
**what the result must measure**, so a rebuild on a different stack lands in the same place instead
of somewhere defensible but different.

> [!important] The app's theme wins on appearance. This note wins on layout and behaviour.
> These are not in competition, because they govern different things.
>
> | Owned by the app's theme and components | Owned by this note |
> |---|---|
> | Colour, palette, dark mode | Spacing, size, ratio, breakpoint |
> | Font family and weight | Type **scale** — how many steps and their relationship |
> | Component identity — its Card *is* the card | Component **anatomy** — what is inside it and in what order |
> | Border, shadow, motion style | Layout mechanics, and every behaviour |
>
> So: **use the project's `Card`, in the project's colours, with this note's padding and this note's
> contents.** A dashboard that looks like a second product bolted onto the app has failed, however
> exactly it matches these numbers.
>
> **Where the project has its own scale**, take its nearest step rather than a literal pixel value —
> `p-4` in Tailwind, `space.4` in Chakra. The ratios survive; the values bend to the host.
>
> **Where the project has nothing** — a bare Phase 0 skeleton with no tokens and no components —
> build the components and use these values as written. That is the case these numbers were
> measured for.
>
> Record any substitution in the build report. A silent one is how two builds drift apart.

## Module layout

One module per concern, and the names matter less than the split. What must survive a rebuild is
that **the derivations live apart from every view**, so no section can grow its own idea of what is
done.

The paths below are illustrative, not a location. Nothing here decides where your code lives —
there is no application at all until `/setup` builds one, and it builds into whatever structure the
project actually has. Mirror the split; name the files whatever the stack names files.

```
<wherever the dashboard lives>/
  main.ts             mounts the app into its own HTML entry; imports the app's css first
  Dashboard.svelte    the shell: sidebar, routing, one data load, the auto-advance effect
  management.css      layout primitives and two semantic aliases - no second design system
  api.ts              types, the two reads, every write, and EVERY derivation
  sections/           Board · Specs · Team · Status - one file each
  ui/                 Drawer · TaskCard · TaskDrawer · SearchBox - built once, reused
```

`api.ts` is the load-bearing one: the task index, effective phase, criteria, the phase gate, epic
colours, durations and the attention hash are all there, and every section imports them. See
[[Derivations]].

The dashboard gets **its own HTML entry** — `management.html` with `<meta name="robots"
content="noindex">` — so it is never part of the app's own bundle or its performance budget.

## Layout constants

| Constant | Value | Why it is this and not another |
|---|---|---|
| Sidebar width | `248px` | Fits the longest nav label plus its count without wrapping, at 14px base |
| Corner radius | `12px` | One radius everywhere except controls |
| Base font size | `14px` | A dashboard is scanned, not read. 16px pushes the fifth column off screen |
| Pill radius | `99px` | Full round; never a rounded rectangle, which reads as a button |
| Shell grid | `248px minmax(0, 1fr)` | **`minmax(0, 1fr)`, never `1fr`** — see the warning below |
| Content padding | `32px 32px 48px` | Extra at the bottom so the last row clears the fold |
| Prose max width | `78ch` | Applies to ledes and notes only. The page itself has **no** max width |

**Control radii**, smaller than cards so controls read as controls: `7px` on the base input rule,
`8px` inside the toolbar, search box and drawer, and `10px` on the create form's larger fields and
the primary buttons. Nothing in between, and nothing at 12px.

> [!danger] `minmax(0, 1fr)` is load-bearing
> A plain `1fr` track takes an automatic minimum of its content. The board's horizontal scroller
> then grows the track instead of scrolling inside it, and the last column is pushed off screen —
> looking like a board bug when it is a grid bug two levels up. Any grid or flex parent of the
> board needs an explicit zero minimum (`minmax(0, 1fr)`, or `min-width: 0`).

## The spacing scale

**4 · 8 · 12 · 16 · 24 · 32 · 48.** Seven steps, nothing between them.

| Step | Value | Used for |
|---|---|---|
| 1 | `4px` | Icon-to-label, pill inner |
| 2 | `8px` | Inside a row of controls; column inner padding |
| 3 | `12px` | **Between cards in a column**; heading to its own content |
| 4 | `16px` | **Card inner padding**; gap between board columns |
| 5 | `24px` | Between grid cards; sidebar padding; drawer padding; default gap |
| 6 | `32px` | **Between sections**; content padding |
| 7 | `48px` | Bottom of page; bottom of the drawer |

A gap that wants 14px means the layout is wrong, not the scale.

**The proximity rule:** a heading sits nearer its own content (12px) than the block above it (32px).
Proximity is what says which block a heading owns; without it a page is one wall.

## Breakpoints

Three, each for a different reason:

| Width | What changes |
|---|---|
| `≤ 900px` | Board columns become `82vw` each and the board is swiped, not squeezed |
| `≤ 820px` | Shell collapses to one column; sidebar becomes a static top bar, its right border a bottom border, its nav wrapping in a row |
| `< 768px` | Drawer becomes a bottom sheet instead of a right-hand panel |

They are deliberately not equal. The board fails first because five columns need width before the
shell does.

## Board geometry

```
.board-columns   flex · gap 16px · overflow-x auto · scrollbar-gutter stable · padding-bottom 12px
  > .col         flex 1 1 0 · min-width 220px · padding 8px · radius 12px
    > h3         0.8rem uppercase · tracking 0.06em · muted · 12px below
    > ul.stack   flex column · gap 12px · min-height 3rem
```

`flex: 1 1 0` with a `220px` floor is what produces "15–20% of the viewport". Above the floor the
five columns share the width evenly; below it the board scrolls rather than compressing a card to
unreadable. **Do not** use `grid-template-columns: repeat(5, 1fr)` — it has no floor and squeezes.

A column under a dragged card tints to `accent` at 10% with a `2px` dashed accent outline inset by
`-2px`, transitioning over `120ms ease-out`. The `min-height: 3rem` on the stack is what keeps an
empty column a usable drop target.

Grid areas elsewhere use `repeat(auto-fit, minmax(N, 1fr))` with a `24px` gap: **230px** for card
grids (Team, epic columns), **190px** for the headline tiles.

## Card geometry

```
li.card    radius 12px · 1px border · surface background · overflow hidden
           padding 16px, with 16px + 5px on the left for the epic edge
           ::before  4px full-height leading edge in the epic colour
           :has(button:focus-visible)  2px accent outline, offset 2px
  .title   line-clamp 2
  .desc    nowrap + ellipsis · 0.82rem · muted
  .avatar  1.55rem circle · 1px border · surface-2 · overlapping by -0.45rem
```

The click surface is an absolutely positioned button covering the card, **beneath** the interactive
bits — a button inside a button is invalid markup. The pills and the assign control carry
`z-index: 1` so they stay clickable above it.

## Drawer geometry

```
backdrop   fixed inset 0 · rgb(0 0 0 / 0.4) · z-index 40 · fade 140ms ease-out
drawer     fixed right · z-index 50 · width min(30rem, 100vw) · full height
           surface background · 1px left border · shadow -12px 0 32px rgb(0 0 0 / 0.16)
           slide-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)
< 768px    bottom sheet · max-height 88vh · radius 16px 16px 0 0 · slide-up, same easing
reduced    prefers-reduced-motion: no animation on either
```

The panel itself takes `tabindex="-1"` and is focused on open, so a screen reader announces the
dialog's label before its first control. Focus wraps at both ends of the panel's focusable set;
Escape and the backdrop both close; `document.body` overflow is hidden while open and restored on
close, along with focus to the opener.

## Typography

Four steps, no more.

| Role | Size | Weight |
|---|---|---|
| Page title (`h2`) | `1.5rem`, tracking `-0.01em` | default |
| Tile value | `1.6rem`, tracking `-0.02em` | `600` |
| Body | `14px` base | default |
| Section label | `0.8rem`, uppercase, tracking `0.06em` | default, muted |
| Meta — ids, pills, counts | `0.70`–`0.72rem` | default, muted |

The drawer's own title is `1.05rem` and its section headings `0.78rem` uppercase — the panel is
narrower than the page, so its scale steps down with it.

**Every number is tabular.** Counts, points, durations and dates use `font-variant-numeric:
tabular-nums`, and reference ids use the monospace stack. A column of figures that shifts as it
updates cannot be scanned.

The gate checklist is monospace at `0.82rem`, and its marker column is `flex: 0 0 2.2rem` — wide
enough for the three characters of `[x]`. At `1.2rem` the bracket wrapped.

## Epic colour

Four hue families, **not** one hue per epic. A real project outgrows eight categorical colours, and
a generated ninth is the anti-pattern [[Accessibility And Anti-Patterns]] forbids.

```
PHASE_HUES = [152, 210, 32, 285]          # green, blue, amber, violet

hue   = PHASE_HUES[phase mod 4]
shade = min(indexInPhase, 3) * 9          # capped: never washes out
colour = hsl(hue, 58%, L + shade)
  where L = 34% in light mode, 58% in dark
```

`indexInPhase` comes from epics sorted by **phase, then title** — computed once, centrally, so Board,
Specs, Team and Status colour the same epic identically. Deriving the index per section drifts the
moment one of them sorts differently. See `epicColours` in [[Derivations]].

It is applied three ways and no others: a **4px leading edge** on a card or disclosure, a **3px
edge** on a delivered-work group, and a **chip** — the same colour at `0.14` alpha behind it and
`0.35` on its border. Never a full card background.

Consequences worth keeping: epics in the same phase look related, because they are. Advancing a
phase never recolours anything. The colour is always accompanied by the epic's name — colour is an
aid, never the identifier.

## Semantic colours

Two are defined here because no app theme reliably has them; everything else comes from the project.

| Token | Light | Dark | Role |
|---|---|---|---|
| `surface-2` | `#f3f1ec` | `#242429` | Sidebar, raised controls, avatars |
| `warn` | `#a8620a` | `#d9a05b` | Parked, ad-hoc, pending, attention, over-estimate |

Both are contrast-checked against their own backgrounds in both schemes. `done` / `in-progress` /
`planned` / `blocked` map to the project's existing success, accent, muted and danger roles.

## Timings

| Interaction | Duration |
|---|---|
| Drawer slide, backdrop fade | `180ms` / `140ms`, both suppressed under reduced motion |
| Column drop-target tint | `120ms ease-out` |
| "Saved" confirmation in the drawer | `1600ms`, then it clears itself |
| "Copied" on a reference | `1400ms` |

No spinner anywhere. A load shows the word `Loading…`; a write shows its result.

## Component anatomy

**Sidebar** — sticky, full height, own scroll, `surface-2`, 1px right border, `24px 16px` padding,
`24px` between blocks. Project name, then current phase, then the sprint line (absent entirely when
no sprint exists — never the words "No sprint defined"). Nav items are buttons in a `<nav>`, `12px`
padding, `0.15rem` apart; the active one carries `aria-current="page"`, weight `600`, and a `2px`
inset accent bar on its leading edge. Counts sit right-aligned, muted, tabular, `0.8rem`. Phase
progress sits in the footer as a `6px` fully-rounded bar **plus its count as text**.

**Task card** — a list item containing a button. See the geometry above and the anatomy in
[[Task Card And Drawer]]. Never a plain container with a click handler.

**Drawer** — right-hand panel above 768px, bottom sheet below. Modal: focus moves in, is trapped,
returns to the originating card on close. Escape closes, backdrop closes, the page behind does not
scroll, `?task=` makes it linkable and the back button closes it. **Built once in `ui/` and reused**
— a drawer serving one caller is a modal in disguise.

The sticky drawer title keeps its top padding when it sticks: the padding lives on the header, not
on the body. A heading that loses its spacing on scroll looks like a rendering fault.

## Related

[[Design System]] · [[Page Layout]] · [[Components]] · [[Derivations]] · [[API Surface]] ·
[[Copy Deck]] · [[Task Card And Drawer]] · [[Accessibility And Anti-Patterns]]
