# Note templates

Formatting rules live in `.claude/skills/shared/vault-contract.md`. These are the shapes.

## `.idea/notes/<Idea Title>.md`

```markdown
---
title: <Idea Title>
created: 2026-08-30
updated: 2026-08-30
tags: [idea, <theme-tag>]
status: seed
theme: <Theme Title>
horizon: next
impact: 4
effort: 2
confidence: 3
epic:
---

# <Idea Title>

## Pitch

One or two sentences a stranger could repeat back.

## Why it might work

- ...

## Why it might not

- ...

> [!warning] Riskiest assumption
> The one thing that, if false, kills this.

## What would raise confidence

- [ ] The cheapest test that would move `confidence` up a point.

## Related

- Theme: [[<Theme Title>]]
- Builds on: [[Other Idea]]
- Tension with: [[Competing Idea]]
- Session: [[2026-08-30 Brainstorm - <Topic>]]
```

## `.idea/themes/<Theme Title>.md`

```markdown
---
title: <Theme Title>
created: 2026-08-30
updated: 2026-08-30
tags: [moc, theme]
status: active
---

# <Theme Title>

## Thesis

The problem this theme solves, in two sentences. Not the technology — the problem.

## Ideas

| Idea | Horizon | I / E / C | Status |
|---|---|---|---|
| [[Idea A]] | now | 5 / 2 / 4 | promising |
| [[Idea B]] | later | 3 / 4 / 2 | seed |

## Open questions

> [!question]
> - ...

## Related themes

- [[Other Theme]] — how they interact.
```

## `.idea/sessions/<YYYY-MM-DD> Brainstorm - <Topic>.md`

```markdown
---
title: 2026-08-30 Brainstorm - <Topic>
created: 2026-08-30
updated: 2026-08-30
tags: [session, brainstorm]
status: active
---

# 2026-08-30 Brainstorm - <Topic>

## Intent ledger

- **Real goal:** ...
- **Success in 6 months:** ...
- **Binding constraint:** ...
- **Explicitly not:** ...
- **Corrections from the user:** ...

## Ideas produced

Grouped by theme, as wikilinks with a one-line hook each.

## Decisions

- ...

## Next steps

- [ ] ...
```

## `.idea/INDEX.md`

```markdown
---
title: INDEX
created: 2026-08-30
updated: 2026-08-30
tags: [moc]
status: active
---

# Idea Vault

> [!abstract] State
> **Spec:** [[SPECS]] · **Roadmap:** [[ROADMAP]] · N ideas across M themes.

## Themes

- [[Theme A]] — one-line thesis. *(4 ideas, 1 committed)*

## Committed

Ideas that made it into the roadmap, with their epic and phase.

## Promising, unshaped

The queue for the next `/shape` run.

## Parked & superseded

Collapsed list. Kept for the record.

## Sessions

- [[2026-08-30 Brainstorm - <Topic>]]

---

> [!note]- Dataview (optional plugin)
> ```dataview
> TABLE horizon, impact, effort, confidence, status
> FROM "notes"
> WHERE status != "superseded"
> SORT impact DESC, effort ASC
> ```
```
