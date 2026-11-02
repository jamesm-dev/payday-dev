---
title: Design System
created: 2026-08-30
updated: 2026-09-01
tags: [design, management, ui]
status: active
---

# Design System

**This page introduces no new design.** It is assembled from the project's existing theme and
component library. Before writing any markup, read what already exists and use it.

This note governs *where the design comes from*; [[Reference Implementation]] governs *what it must
measure and how it must behave*. Read them together, in that order.

**The order matters.** Reach for the project's token or component first, every time. These
measurements describe the shape of the result, not a licence to bypass the theme to hit a number —
a page that matches every value here while looking nothing like the app it lives in has failed the
only test that counts. Where the project offers a scale, snap to its nearest step. Where it offers
nothing at all, build the component and use the values as written.

| Look for | Use it for |
|---|---|
| Theme tokens — CSS variables, a Tailwind config, a `theme.ts`, design tokens | Every colour, spacing step, radius, shadow, and font |
| An existing component library — the project's own `components/ui`, shadcn, Radix, Chakra, Vuetify, PrimeVue, Mantine | Card, Badge, Progress, Table, Collapsible, Alert, Separator, Avatar, Drawer |
| Existing layout primitives — a `Container`, `Stack`, `PageHeader`, `Section` | The page shell and its spacing |
| Existing form controls — Input, Select, Combobox | Every editable field in the task drawer |
| Existing dark-mode mechanism | Dark mode. Never a second one |

Rules, in order of precedence:

1. **Use the existing component.** If the project has a `Card`, the task card is that `Card`. If it
   has a `Badge`, the status pill is that `Badge`. If it has a `Drawer` or `Sheet`, the task drawer
   is that.

   **Prefer shadcn wherever the project already has it** — shadcn/ui in React, shadcn-svelte in
   Svelte, or whatever the project's ecosystem equivalent is. Its components are copied into the
   repository rather than installed, so using them adds no dependency and inherits the project's own
   theme. If a shadcn `Sheet`, `Dialog`, `Badge`, `Avatar` or `Select` is present, that is the
   component, and no hand-rolled substitute ships beside it.

   > [!warning] Prefer it where it exists; never install it for this page
   > "Prefer shadcn" is not licence to add a UI kit to a project that does not use one. Adding
   > components, a class-variance library and a Tailwind config to build one dashboard is exactly
   > the dependency the no-new-dependency rule exists to prevent. Where shadcn is absent, build from
   > the project's own tokens instead.
2. **Compose before creating.** If no exact component exists, build it from ones that do.
3. **Only then write something new** — with the project's tokens, matching the conventions of its
   neighbours, so it looks like it was always there.

   **The drawer is the case where this usually applies.** Most projects have no drawer or sheet, and
   the board is unusable without one, so building it is expected rather than a last resort. A
   hand-built drawer still owes everything a library one would give:

   - a real modal dialog — `<dialog>` or `role="dialog"` with `aria-modal="true"` and a label,
   - focus moved in on open, trapped while open, and returned to the originating card on close,
   - Escape closes; a click on the backdrop closes; the page behind does not scroll,
   - it sets `?task=` so a task is linkable and the back button closes it,
   - full height from the right above 768px, a bottom sheet below it,
   - it animates from the edge, and respects `prefers-reduced-motion`.

   Build it once, in the project's `ui/` directory, and reuse it. A drawer that only works for one
   caller is a modal in disguise.
4. **Never add a dependency** for this page. Not a chart library, not an icon pack, not a UI kit.
   If the project ships an icon set, use it; otherwise use text and Unicode glyphs. The single
   sanctioned exception is one database driver — see [[Requirements]].

> [!warning] The test
> Someone opening this page should not be able to tell it was generated. If it looks like a
> different product bolted onto the app, it is wrong — however good it looks on its own.

> [!important] With nothing to inherit, the right answer is usually to wait
> If the project genuinely has no theme and no components yet — a bare Phase 0 skeleton — then
> building this page means hand-rolling a card, a badge, a drawer and a scale, and the phase that
> later introduces the app's real ones inherits a dashboard matching none of them.
>
> So `/setup` builds the dashboard **after** the app is built and verified, and where the app still
> has nothing to offer it **offers to defer** to the phase that introduces those components.
> Tracking continues either way: `.management/` gets its Markdown and `state.json` from the first
> run, and only the page waits.
>
> Built anyway, it stays plain and unstyled rather than inventing a design system — and the report
> says it needs revisiting once a theme exists.

## Visual language

Everything maps onto the project's own theme. **Do not introduce a second palette, type scale, or
spacing system.**

Four semantic states, each mapped to a role the project's palette already defines. If it has
`success` / `primary` / `muted` / `warning` tokens, use those names; if it names them differently,
use its names. Never hardcode a hex value:

| State | Role | Glyph |
|---|---|---|
| `done` | Success / positive | filled circle, check for criteria |
| `in-progress` | Accent / primary | half-filled circle |
| `planned` | Muted / neutral | open circle |
| `blocked` | Warning / danger | warning triangle |

PR state and test state reuse the same four roles: merged and approved read as success, changes
requested and failing as warning, draft and pending as muted, open as accent.

**Never encode status by colour alone.** Every state carries a glyph *and* a text label, so the page
works in greyscale and for colour-blind readers.

Typography: the project's existing scale. Page title, section heading, body, and one muted secondary
size — four steps, no more. Counts, points, durations, and dates in tabular or monospace figures so
columns line up.

Spacing: one scale — 4 / 8 / 12 / 16 / 24 / 32 / 48 — mapped onto the project's own steps. Generous
vertical rhythm between sections (32px), tight within a card (16px padding, 12px between cards), and
a heading always nearer its own content than the block above it. The page should read as five or six
distinct blocks, not one continuous wall. Exact values in [[Reference Implementation]].

Dark mode: inherit the project's, if it has one. Do not build a separate toggle for this page.
