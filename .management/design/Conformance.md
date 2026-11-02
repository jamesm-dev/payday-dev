---
title: Conformance
created: 2026-09-01
updated: 2026-09-01
tags: [design, management, reference, testing]
status: active
---

# Conformance

How the dashboard survives a rebuild. The other notes describe what to build; this one is
the part that **checks whether the rebuild actually did it**.

> [!danger] Prose is not reproducible. That is the whole problem.
> Every note in [design/](.) is read by a language model and turned into code. Read the
> same note twice and you get two pages that are both defensible and not the same: a
> paraphrased button, a column moved, a measurement rounded, a number derived slightly
> differently. Nothing complains, because nothing was checking.
>
> A contract that is only prose is a contract nobody enforces. So the checkable half of
> the design lives as **data**, and a rebuild has to prove it conforms.

## Three layers, and what each is worth

| Layer | Covers | Enforced by | Strength |
|---|---|---|---|
| **1. The contract** | Strings, measurements, order | `dashboard-conformance.sh` | Mechanical. Fails the build |
| **2. The goldens** | Every derived number | Tests the build writes from `fixtures/` | Mechanical. Fails the build |
| **3. Review** | Appearance, taste, whether it looks like the app | A person, or an agent that did not build it | Judgement |

Layers 1 and 2 are the reproducible part. Layer 3 is not, and pretending otherwise is
how a checklist becomes theatre — see *What this cannot prove*.

## Layer 1 — the contract

Four files in [../contract/](../contract/), all plain text so that any language, and a
shell script with no dependencies, can read them:

| File | Holds |
|---|---|
| `strings.txt` | Every user-facing string, keyed. **Authoritative** — [[Copy Deck]] is its readable narrative |
| `layout.txt` | Every measurement, with the reason it is that value |
| `order.txt` | Every sequence whose order is part of the design, with a maximum gap |
| `sources.txt` | Where the dashboard's code lives. **Ships empty** — written by `/setup` |
| `tokens.map` | Declared substitutions, where the project's own scale replaces a literal |

> [!important] Nothing here names a directory, a framework, or a language
> In a fresh clone there is no application at all. `sources.txt` therefore ships with no
> paths in it, and the checker hard-codes no framework conventions: its fallback is a
> generic search for something named for the dashboard, and its real answer is the list
> `/setup` writes against whatever structure the project turned out to have.
>
> With nothing built, the checker exits `2` saying so. That is the correct answer in a
> fresh clone, not a failure.
>
> The contract itself is portable by construction: strings are strings, order is order,
> measurements carry a substitution map, and the fixtures are JSON. None of it assumes a
> stack.

Run it from the repository root:

```bash
bash .claude/scripts/dashboard-conformance.sh
```

It exits `0` on conformance, `1` on drift, and `2` when it could not run — including
when nothing has been built yet, which is the correct answer in a fresh clone.

### How the matching works

Source is flattened into **one line per file, per view**, and a string passes if any one
view of any one file contains it:

- **raw** — tags intact, the only view where `placeholder`, `title` and `aria-label` text
  survives at all;
- **spaced** — tags replaced by a space, so a sentence broken across `<strong>` reads as
  a sentence;
- **joined** — tags removed, so `<code>.idea/</code>.` still reads as `.idea/.`

`{…}` in a string is a placeholder: the literal fragments around it must appear in order,
and fragments under five characters are skipped because they match anywhere and prove
nothing.

> [!danger] Tests are excluded from the source it reads
> An end-to-end spec asserts the same strings the page renders. Include it and the
> checker reads its own homework: reword the page, leave the spec alone, and the contract
> still passes. Test and spec files are filtered out, so the contract is satisfied by the
> implementation or not at all.

> [!warning] Per file, never across the concatenation
> Checking order across every file at once is worse than not checking. Swap two board
> columns and the check stays green, because a later file happens to mention one of the
> words. An order is a property of the file that declares it.
>
> The same trap one level down: a **comment** above a declaration, mentioning the same
> words in the old order, satisfies the check while the declaration itself is reordered.
> That is what `maxgap` in `order.txt` is for, and why the matcher backtracks over every
> starting occurrence rather than giving up on the first.

## Layer 2 — the goldens

[../contract/fixtures/](../contract/fixtures/) holds a deterministic `plan.json` and
`board.json`, shaped to hit every branch the derivations have — a done task, an open one,
a parked one, an ad-hoc one, a task in a later phase, a points override, a priority
override, a met criterion and a parked one — and `expected.json`, which is what every
derivation in [[Derivations]] must return for them. A second set in `fixtures/lifecycle/` pins the
rules the first cannot reach: unconfirmed and unverified completions, rejected rows, a consumed
advance, an at-release criterion and the readiness phase.

**A rebuild writes these as tests in the host project's own runner.** There is nothing to
port: the derivations are pure functions, the fixtures are JSON, and the expectations are
JSON. Whatever the language, the test is *load two files, call the function, compare*.

Cover at least: the task index, `effectivePhase`, `criteriaOf`, `phaseGate` (including
`leftUnfinished`, whose wording is a claim about honesty), `epicColours`, `humanDuration`,
`attentionRef`, the column contents in order, the live gates, the sidebar counts, and
phase progress.

> [!important] The goldens are the strongest guarantee here
> A string can be paraphrased and a measurement rounded, and both are cosmetic. A
> derivation that disagrees produces a **different number on screen** — a phase that
> advances when it should not, a load figure that silently excludes something, a gate
> that reads met. Those are the failures that hide longest and cost most.

## Layer 3 — review

Appearance cannot be checked by grep, and it is not supposed to be identical anyway:
colour, font, shadow and component identity come from the host project. What review is
for is the one test no file can carry — *someone opening the page cannot tell it was
generated*.

Have it reviewed by an agent that **did not build the page**. A builder walking its own
compliance checklist is self-assessment, and self-assessment passes.

## What this cannot prove

Say this out loud rather than letting a green check imply more than it earned:

- **That a measurement was applied where it belongs.** `248px` appearing in the source
  does not prove the sidebar is 248px wide. It proves nobody quietly changed it to 240,
  which is the failure that actually happens.
- **That a substitution is equivalent.** Nothing can check that `w-62` is 248px. A
  declared substitution can be *read*; that is the whole gain over a silent one.
- **That the page looks right, or looks like the app.** Layer 3.
- **That an order entry with no `maxgap` is really in order.** Those are smoke tests and
  are marked as such in the file.
- **Anything about a stack that renders the page from a template the checker was not
  pointed at.** `sources.txt` is load-bearing: a list naming only the UI passes while
  every server message has been reworded.

## What `/setup` must do

1. Build the dashboard from the notes in [design/](.).
2. Write `contract/sources.txt` with the real paths, **including the server side**.
3. Write `contract/tokens.map` for every measurement it expressed differently.
4. Write the derivation tests from `contract/fixtures/` into the project's test runner — both sets:
   the main `plan.json`/`board.json`/`expected.json`, and `fixtures/lifecycle/`, which pins the
   confirm, unverified, rejected, consumed-advance, at-release and readiness-phase rules.
5. Run the checker and the tests, and **report both**.
6. Not report the dashboard built while either fails.

## Changing the contract

The contract is not sacred; it is just explicit. When the design genuinely changes:

1. Change the note that explains *why*.
2. Change the contract file in the **same commit**.
3. Say in the commit message what changed and what it replaced.

> [!danger] Never silence a check by deleting its line
> A failing check is information. Deleting the line converts it into a silent change,
> which is precisely the failure this whole apparatus exists to prevent. If a string
> genuinely should read differently, change `strings.txt` and [[Copy Deck]] together and
> say so.

## Related

[[Copy Deck]] · [[Derivations]] · [[Reference Implementation]] · [[DESIGN]] ·
[[Interaction And States]]
