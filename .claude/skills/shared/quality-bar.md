# The quality bar

How `shape` and `setup` resolve technology and structure decisions. `vault-contract.md` governs how
notes are written; this file governs what gets built. If it conflicts with a skill, this wins.

## The rule

> [!important] When convenience and quality conflict, resolve toward quality — and say what it cost.
> The default gravity in scaffolding is toward whatever stands up fastest. That gravity is what
> produces a project that is pleasant for a week and slow, brittle, or unchangeable by month three.
> Lean against it deliberately.

Applies to every choice in the `SPECS.md` stack table, every structural decision in `setup`, and
every "we could just..." that appears mid-build.

## What this is not

The rule is a tiebreaker, not a licence. It does **not** mean:

- **Picking the hardest tool.** Rust for a form with four fields is not quality, it is a hobby. The
  bar is the best result *for this product's actual demands*, which is often the boring option.
- **Optimising before measuring.** A budget is set up front; optimisation happens against a measured
  number, never a guessed one.
- **Adding layers for their own sake.** An abstraction with one implementation is a cost with no
  benefit. Structure earns its place by making a *known, named* future change cheaper.
- **Gold-plating scope.** Quality is about how the committed scope is built. It never justifies
  building more than the phase calls for.

A decision that cannot name what it buys is not a quality decision — it is a preference. Say so.

## Deciding the stack

Every row of the `SPECS.md` stack table carries a `Why`. That rationale must argue from the
product's demands, not from familiarity or popularity.

A rationale is sufficient when it names:

1. **The demand it serves** — drawn from a real idea note or constraint. "Phone-first on mobile data"
   is a demand; "modern" is not.
2. **What it costs** — setup effort, build complexity, operational burden, or learning curve. A
   choice with no stated cost has not been thought about.
3. **What was rejected and why** — the `Alternatives considered` column. The convenient option that
   lost belongs here by name, so the trade is visible rather than implied.

> [!warning] Familiarity is not a rationale
> "It is what I know" is a real and often correct reason — but record it as such, in the `Why`
> column, so a later reader can tell a considered choice from a defaulted one.

Where a choice is genuinely contested, it becomes an ADR. Where it is version-sensitive, pin it.

## Deciding the structure

Structure decisions are the ones nobody revisits, so they get the same scrutiny as the stack:

- **Module boundaries follow the product's seams**, not a framework tutorial's folder layout. If two
  parts change for different reasons, they are different modules.
- **The data layer is decided once, deliberately.** It is the hardest thing to change later and the
  most common source of end-state slowness.
- **Rendering and data-fetching strategy is a stated choice**, not whatever the scaffolder emitted.
- **The dependency count is a design decision.** Each one is a permanent cost. Prefer the platform
  where the platform is adequate.

## The performance budget

This is what stops the rule being an aspiration.

`shape` writes a **Performance budget** into `SPECS.md`: a small set of numbers the product must
hold, chosen from what the users actually do. Two to five entries, each measurable by someone else.

Good budget entries are specific and testable:

- Time to interactive on the target device and network — name both.
- The p95 latency of the single most frequent interaction.
- A payload or bundle ceiling, in kilobytes.
- A data-volume assumption: "still responsive at 5,000 records."

Then:

- **Phase 0 measures the budget** as part of its walking skeleton, and the measured numbers become
  exit criteria. A skeleton proves the stack works; measuring proves it works *fast enough*, while
  changing the stack still costs an afternoon.
- **Every later phase re-checks it** in `setup`'s verification step, with real output.
- **A missed budget is reported, never rounded.** It is either fixed, or recorded as an accepted
  regression with a reason — the same honesty rule that governs a failing test.

If the product genuinely has no meaningful performance surface — a small CLI, a library — say so
explicitly in `SPECS.md` rather than inventing numbers. An empty budget with a stated reason is
honest; a fabricated one is not.

## Reporting

When a quality decision costs something visible — a longer setup, an extra concept, a slower first
commit — say it plainly at the time, with the reason. The point is not to be quietly virtuous. It is
that the person reading the plan in March can see the trade that was made and disagree with it.
