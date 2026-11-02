# `.management/` — the execution tracker

## The split — do not blur it

| Folder | Holds | Changes when |
|---|---|---|
| `.idea/` | **Intent.** What we are building and why. Ideas, spec, roadmap, epics, decisions. | The plan changes |
| `.management/` | **State.** How it is actually going. Progress, blockers, dates, shipped log. | Work happens |

`.idea/` is upstream. `.management/` is derived from it and adds what `.idea/` does not track:
status, dates, blockers, and what actually shipped.

**Sync rules**
- Regenerate `.management/` from `.idea/` on every `setup` run.
- Never edit `.idea/` from `.management/` silently. If reality contradicts the roadmap, say so and
  let `/shape` amend the plan.
- Never invent a task with no epic behind it. An epic with no acceptance criteria is a gap — report
  it rather than filling it in.
- Mark done only what was actually verified. Progress you cannot evidence is fiction.
- Hand-written notes in `BLOCKERS.md` and `CHANGELOG.md` are preserved across regeneration; the
  derived sections are rewritten.

## Layout

```
.management/
  README.md        what this folder is and how it syncs (ships with tateru)
  BOARD.md         every task by status, each linked to its epic
  PROGRESS.md      per-phase rollup with exit criteria
  BLOCKERS.md      what is stuck, since when, and the next action
  CHANGELOG.md     dated log of what actually shipped
  state.json       generated snapshot - the dashboard's data source
  DESIGN.md        index of the dashboard design
  design/          the design spec, one concern per note
  contract/        the machine-checkable half of that spec, and its fixtures
  board.db         the dashboard's own store: assignees, effort, links, test runs
  commits.jsonl    append-only commit log, written by the post-commit hook
```

`board.db` is not Markdown and is never opened as a note. It holds the data people author on the
dashboard, keyed on each task's reference id. Schema: `.management/design/Database Schema.md`.

Markdown files use the same conventions as `.idea/` (see `shared/vault-contract.md`), but the two
folders each open as their **own** Obsidian vault. Wikilinks do **not** cross between them: use a
relative Markdown link to reach `.idea/`.

## `state.json`

The single machine-readable snapshot. Regenerate wholesale; never hand-edit.

```json
{
  "generatedAt": "2026-08-30T12:00:00Z",
  "project": { "name": "", "description": "", "currentPhase": 0 },
  "_currentPhase": "the lowest phase that is neither verified nor done - the phase /setup builds next - or the last phase once every phase is",
  "phases": [
    {
      "n": 0,
      "name": "Walking skeleton",
      "goal": "",
      "demo": "",
      "status": "planned | in-progress | verified | done | cut",
      "exitCriteria": [{ "text": "", "done": false }],
      "nonGoals": [""]
    }
  ],
  "epics": [
    {
      "title": "",
      "phase": 0,
      "status": "planned | in-progress | done | cut",
      "theme": "",
      "sources": ["Idea A"],
      "tasks": [
        {
          "id": "TSK-7F3A21",
          "text": "",
          "description": "",
          "done": false,
          "priority": "high | normal | low",
          "points": 3
        }
      ]
    }
  ],
  "blockers": [
    {
      "title": "", "since": "2026-08-30", "epic": "", "nextAction": "",
      "ref": "ATT-3C81F0",
      "severity": "critical | warning"
    }
  ],
  "metrics": {
    "tasksTotal": 0, "tasksDone": 0,
    "epicsTotal": 0, "epicsDone": 0,
    "phasesTotal": 0, "phasesDone": 0
  },
  "readiness": [{ "name": "Exit criteria", "met": false, "why": "" }]
}
```

Four fields exist for the dashboard and must be written even though the Markdown files do not use
them. Omitting one does not break the page; it silently degrades it, which is worse:

| Field | Used for | If absent |
|---|---|---|
| `tasks[].priority` | Card ordering and the priority marker | Falls back to the phase, losing any per-task judgement |
| `tasks[].points` | Load, capacity, sprint totals | The badge disappears and every load figure is wrong by an unknown amount |
| `blockers[].ref` / `severity` | `/epic ATT-…` and the severity word | The reference is hashed from the title instead, and everything reads `warning` |
| `readiness` | Five of the seven gates | Only Exit criteria and Tasks render; the rest are missing, not stale |

`status` values match the vault contract exactly. Do not invent new ones.

Each task's `id` is the `^tsk-` block reference from its epic's acceptance criterion, uppercased.
It is the key every piece of authored data hangs off, so carry it through faithfully. A task with no
block reference gets `"id": null` — never a generated one, and never a fallback to matching on text.

## File templates

**`README.md`** — not generated. It ships with tateru and explains this folder; `/upgrade` keeps it
current, and `/setup` never writes it. Project-specific facts go in the generated files below.

**`BOARD.md`** — frontmatter `tags: [board, management]`. Four `##` sections: Blocked, In progress,
Next up, Done. Each task as `- [ ] Task text — [Epic Title](../.idea/epics/Epic%20Title.md) (Phase N)`
— a relative link, never a wikilink, since the epic lives in the other vault. Done tasks keep their
completion date. Sorted by phase, then epic.

**`PROGRESS.md`** — frontmatter `tags: [progress, management]`. Two status lines first — the
`pre-push` hook prints them at every push, so keep the exact shape:

```markdown
**Phase 1 - Core loop:** 12/19 tasks, 3 of 4 exit criteria met
**Readiness:** 5 of 7 gates met. Open: Tests, Deploy path
```

If a dashboard was built, add one line saying where (`Dashboard: /management, dev only`). Then a
summary table:

```markdown
| Phase | Goal | Tasks | Status |
|---|---|---|---|
| 0 | Walking skeleton | 5/7 | in-progress |
```

Then one `##` per phase with its exit criteria as `- [ ]` items, each marked only with evidence, and
a one-line note on what remains.

**`BLOCKERS.md`** — frontmatter `tags: [blockers, management]`. One `###` per blocker: what is
stuck, since when, which epic it holds up, and the next concrete action. A `> [!warning]` callout
for anything blocking the current phase. Empty is fine — say "None." rather than deleting the file.

**`CHANGELOG.md`** — frontmatter `tags: [changelog, management]`. Reverse-chronological `## YYYY-MM-DD`
entries listing what shipped, with the epic as a relative link to `../.idea/epics/`, never a
wikilink. Append only; never rewrite history.

## The `/management` dashboard

Build only if the user opts in, and only **after the app is built and verified**. It is the last
thing `/setup` produces, on purpose: the page is assembled from the app's own tokens, components,
dark mode, router and test runner, so building it earlier means inventing all of those and leaving
the app to contradict them later.

### Audit the app first

Before offering to build anything, find out what there is to inherit. One pass, and it decides
everything downstream — including whether the honest answer is *defer*.

| Look for | Where, typically | Used for |
|---|---|---|
| **Theme tokens** | a CSS custom-property block, `tailwind.config.*`, `theme.ts`, `tokens.json`, a Sass variables file | Every colour, radius, shadow and font |
| **Component library** | `components/ui/`, `components.json` (shadcn), an imported kit — Radix, Chakra, Vuetify, PrimeVue, Mantine | Card, Badge, Dialog, Sheet, Avatar, Select |
| **A drawer, sheet or dialog** | the same place | The one component the dashboard cannot do without |
| **Dark mode** | a `prefers-color-scheme` block, a `dark:` variant, a theme provider, a `data-theme` attribute | Never build a second mechanism |
| **Spacing and radius scale** | the token source | Snap to its nearest step instead of a literal pixel |
| **Router** | the framework's own, or an explicit dependency | Real links instead of a URL fragment |
| **Test runner** | the manifest's scripts | Where the derivation goldens go |
| **Where routes live** | the project's actual structure | What to write into `contract/sources.txt` |

**Report what you found in the question itself.** "The app has CSS custom properties and no component
library" is the sentence that lets the user decide well; "shall I build the dashboard?" is not.

### When there is nothing to inherit, offer to defer

On a first run the app is a walking skeleton — a handful of tokens, no components, possibly no dark
mode. Building the dashboard then means hand-rolling a card, a badge, a drawer and a scale, and the
phase that later introduces the app's real ones inherits a page matching none of them.

So when the audit finds no component library and no meaningful token set, **lead with deferring it**
to the phase that introduces the app's own components. Deferring costs nothing: `.management/`
still gets its Markdown and `state.json`, so progress is tracked from the first run; only the page
waits.

Record the deferral as a dated line in `CHANGELOG.md` — that file's hand-written entries survive
regeneration, so it is the one place a later run will still see it — naming the phase to revisit.
**On every later run, check for that line and re-offer** once the app has what was missing. A
deferral nobody returns to is just a quiet no.

If the user wants it now regardless, build it, keep it plain rather than inventing a design system,
and say in the report that it needs revisiting once a theme exists.

**Read `.management/DESIGN.md` and the notes in `.management/design/` first — they are the spec.**
Start with `design/Requirements.md` and `design/Data Sources.md`: they carry the decisions everything
else depends on. Do not design the page from scratch here.

> The notes describe the dashboard **as it was built and refined**, down to the words on the buttons.
> Every run must land on the same page: same sections in the same order, same component anatomy,
> same spacing, same behaviour, same copy. Only the *appearance* bends to the host project's theme.
> Where a note and an existing page disagree, say so and stop — do not build the third thing.

Then read the four reference notes before writing markup. They exist because the same build has been
got wrong in the same ways more than once:

- `design/Reference Implementation.md` — measurements, breakpoints, board geometry, epic palette
- `design/Derivations.md` — every derived number, as pseudocode
- `design/API Surface.md` — the operation set and the meaning of `null`
- `design/Copy Deck.md` — the exact strings

Appearance comes from the app — its theme, tokens, components and dark mode. These notes fix layout,
behaviour and wording. Where the project has a component, use it; where it has none, build it once
in `ui/` from the project's tokens. Never add a UI kit for this page.

Then read the section and craft notes for whatever you are about to write — `Navigation`, `Board`,
`Specs`, `Team`, `Status`, `Page Layout`, `Components`, `Task Card And Drawer`,
`Interaction And States`, `Design System`, `Accessibility And Anti-Patterns`. Each carries a *do not
rebuild these* list of things deliberately dropped; adding one back is a regression, not an
improvement.

## Proving the rebuild matches

Reading the notes is not enough and never was: prose read by a model is not reproducible, and the
same spec twice gives two pages that are both defensible and not the same. The checkable half of
the design therefore exists as data in `.management/contract/`, and the build has to prove it
conforms. Full explanation in `.management/design/Conformance.md`.

**Six steps, none optional:**

1. Build the dashboard from the notes.
2. Write `.management/contract/sources.txt` with the real paths to the code — **including the
   server side**. A list naming only the UI passes while every server error message has been
   reworded, and a third of the contract's strings are server messages.

   It ships empty, and that is deliberate: before this run there is no application, so nothing in
   this repository may assert where your code lives. Write the paths the structure you just built
   actually has — `src/management`, `app/controllers/management.rb`, `internal/management/`,
   whatever is true. The checker hard-codes no framework conventions and neither should this.
3. Write `.management/contract/tokens.map` for every measurement the project expresses its own way
   (`w-[248px]` for `248px`, `p-4` for `16px`). Declare it, never skip it: a declared substitution
   can be read by a person in ten seconds, a silent one cannot be read at all.
4. Write the derivation goldens as tests in the project's own runner. `contract/fixtures/plan.json`
   and `board.json` go in, `expected.json` comes out; the derivations are pure functions, so there
   is nothing to port in any language. Cover the task index, `effectivePhase`, `criteriaOf`,
   `phaseGate` including its `leftUnfinished` wording, `epicColours`, `humanDuration`,
   `attentionRef`, the column contents in order, the live gates, the sidebar counts, and phase
   progress.
5. Run both, from the repository root:

   ```bash
   bash .claude/scripts/dashboard-conformance.sh
   ```

6. **Report both, and do not report the dashboard built while either fails.** A failure is a place
   the build drifted from the design. Fix the build; or if the contract is genuinely wrong, change
   `.management/contract/` and the note that explains it in the same commit, and say why. Never
   silence a check by deleting its line.

The checker proves strings, measurements and order. It cannot prove a measurement was applied where
it belongs, that a substitution is equivalent, or that the page looks like the app. Have that last
part reviewed by an agent that did not build the page — a builder walking its own checklist is
self-assessment, and self-assessment passes.

Finish by walking the compliance checklist in `.management/DESIGN.md` and reporting it as met over
total, naming what is not.

The dashboard is four sections behind a sidebar: **Board** (five columns, filters, dragging, task
creation), **Specs** (the read-only epic list), **Team** (load and contribution), and **Status**
(tiles, attention, readiness, sprints, phases, and the phase advance gate). It needs a standalone
database; pull request status needs the **GitHub MCP**. If either is missing, say so and build the
part that works — never fake a status.

**No charts are built, and none should be.** `design/Status.md` says why, and what would bind one if
it were ever added.

Mirror this module split, whatever the stack calls the files. The derivations living apart from
every view is what stops two sections disagreeing about the same number:

```
management/
  entry            mounts the page; loads the app's own stylesheet first
  Dashboard        the shell: sidebar, routing, one data load, the auto-advance effect
  management.css   layout primitives and two semantic aliases - no second design system
  api              types, the two reads, every write, and EVERY derivation
  sections/        Board, Specs, Team, Status - one file each
  ui/              Drawer, TaskCard, TaskDrawer, SearchBox - built once, reused
```

**Rules**
- Read `state.json`. Do not re-parse Markdown at runtime.
- **Build it from the project's own theme and existing components.** Read the theme tokens and the
  component library that already exist, and use them: the project's `Card`, `Badge`, `Progress`,
  `Table`, `Collapsible`. Compose from existing pieces before writing anything new, and never
  hardcode a colour the project has a token for.
- Add no new dependencies — no chart library, no icon pack, no UI kit. The one exception is a single
  database driver for `board.db`.
- The page never calls an MCP server; it cannot. Claude syncs PR and test data into the database, and
  the page shows the sync time alongside it.
- **Server-render it where the stack can.** The data flow is what matters, not the rendering model:
  read both stores on load, re-read both after **every** successful write, and derive everything from
  what came back. Nothing optimistic, nothing polled, no timers. A client-rendered page is
  acceptable only because this is a development-only tool.
- Show: phase progress, the board by status, open blockers, and `generatedAt` so a stale snapshot is
  obvious.
- Give the dashboard **its own entry point**, marked `noindex`, so it never lands in the app's own
  bundle or its performance budget.
- If the project has no theme or components yet, keep the page plain rather than inventing a design
  system, and say so.

**Gating** — pick per the user's answer.

| Choice | How |
|---|---|
| Dev-only *(recommended)* | Return a 404 when the environment is production. One guard at the top of the route. |
| Auth-gated | Reuse the project's existing auth. If there is none yet, say so and fall back to dev-only rather than inventing one. |
| Public | Build it, and state once that the roadmap and unshipped plans become publicly readable. |

**Route location by framework** — every path is relative to the project's own root, which is
`app/` in this repository, so Next.js's `app/management/page.tsx` lands at
`app/app/management/page.tsx` (or `app/src/app/...` when the project uses `src/`). Verify against
the project's actual structure before writing:

| Framework | Route |
|---|---|
| Next.js (app router) | `app/management/page.tsx` |
| Next.js (pages router) | `pages/management.tsx` |
| Nuxt | `pages/management.vue` |
| SvelteKit | `src/routes/management/+page.svelte` |
| Remix / React Router | `app/routes/management.tsx` |
| Astro | `src/pages/management.astro` |
| Vite SPA | A route in the existing router, importing `state.json` |
| Express / Fastify / Hono | A `GET /management` handler rendering server-side |
| Django / Rails / Laravel | A route plus template, following the project's own conventions |

Import `state.json` directly where the bundler allows it; read it from disk at request time in a
server framework.

**No web surface?** For a CLI, a library, or anything without routes, do not invent a server.
Offer instead: a single self-contained `.management/dashboard.html` that inlines the data, plus a
`board` script in the project's task runner that prints progress to the terminal.
