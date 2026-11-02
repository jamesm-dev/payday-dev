---
name: maintain
description: Keep a shipped project healthy - dependency drift, failing or silent tests, stale decisions, and work that never lands. Use when the project is in production and the user asks for a health check, maintenance pass, dependency update, or what has rotted since launch. Also use on a returning project nobody has touched in months.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
---

# Maintain

The stage after shipping, and the one every workflow forgets. A project does not fail loudly in
maintenance; it decays quietly until someone needs a change and finds they cannot make one safely.

**Plain language.** Everything you say to the person — questions, plans, summaries, reports —
follows `.claude/skills/shared/plain-language.md`: assume they are not a developer, use simple
words, recommend an option when you ask, and explain any technical word the first time it appears.
Notes in `.idea/` may stay technical; explain them, don't paste them.

## Phase 1 — Take the pulse

Gather before judging. Run things; do not trust status files.

| Check | How |
|---|---|
| Tests | Run them. Note failures **and** how long since they last ran in CI. |
| Build | Run it. A project that no longer builds is the most urgent finding there is. |
| Dependencies | The ecosystem's outdated and audit commands. Separate security from merely behind. |
| Runtime | Is the language or runtime version still supported? |
| CI | Green? When did it last run? A pipeline nobody triggers is not a pipeline. |
| Deploy | When was the last release? Does the deploy path still work? |
| Activity | Commits since the last release, and what they touched. |
| Stack profile | `.claude/team/stack.md` against reality: versions against the lockfile, commands that no longer run, lanes whose paths are gone, `checks.env` disagreeing with the `## Commands` table. A stale profile makes every `/work-on` specialist confidently wrong. |
| Dashboard | If one was built: `bash .claude/scripts/dashboard-conformance.sh`, plus the derivation goldens. Drift here is silent by nature — nobody notices a reworded button or a reordered column until two builds disagree. |

## Phase 2 — Read the record against reality

This is what makes this skill different from running `npm outdated`.

- **`.idea/decisions/`** — has reality overtaken any ADR? A library abandoned, a service retired, a
  constraint gone. Say which, and that the decision now deserves revisiting.
- **`.idea/ROADMAP.md`** — phases marked done whose exit criteria no longer hold.
- **`.management/BLOCKERS.md`** — blockers that were never resolved, only forgotten.
- **`.management/board.db`** — tasks carried across many sprints, epics with no test runs, work
  marked done by the agent that no person ever confirmed.
- **The gap** — code with no epic behind it. Some is fine; a lot means the plan stopped describing
  the project, which is worth naming.
- **`.management/design/` against the running dashboard** — a note describing a page that no longer
  exists is worse than no note, because the next `/setup` rebuilds from it. If the conformance check
  passes but a note contradicts the page, the note is the finding.

## Phase 3 — Report, ranked by cost of delay

Not by ease of fixing. Lead with what gets worse the longer it waits.

```
Health: <one sentence>

Urgent      — broken now, or a security advisory
Degrading   — still works, getting harder to change
Watch       — worth knowing, no action yet
Fine        — checked, healthy, named so nobody rechecks
```

Each entry: what, the evidence, and the smallest thing that fixes it. Include the "Fine" list — a
health check that only reports problems makes people think everything unlisted is broken.

## Phase 4 — Fix, with permission

Ask before changing anything. Batch by risk, smallest first, and **verify after each batch** rather
than at the end.

1. **Security patches** — usually safe, always first.
2. **Patch and minor bumps** — as one batch, then run the tests.
3. **Major bumps** — one at a time, each with its changelog read and breaking changes named. Never
   batch a major upgrade with anything else.
4. **Failing tests** — fix the cause. Never delete or skip a test to make a suite green; if a test
   is genuinely obsolete, say why and remove it deliberately.

If a fix needs real work, it is an epic, not a maintenance edit — say so and offer `/epic`.

## Phase 5 — Record

- Append a dated maintenance entry to `.management/CHANGELOG.md`: checked, changed, deferred.
- Write an ADR for any decision that changed, and mark the superseded one.
- Note anything deliberately deferred, so the next pass does not rediscover it from scratch.
- Refresh `.management/` the way `/setup` Phase 6 does (steps 1 to 4, 7 and 11).

Close with health in one sentence, what changed, what was deferred and why, and when to look again.
