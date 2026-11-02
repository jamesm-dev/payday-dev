---
description: Set up the dev environment and build the current roadmap phase, driven by .idea/SPECS.md
argument-hint: [optional hints, e.g. "use pnpm" or "phase 2"]
allowed-tools: Skill, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
---

Invoke the `setup` skill and follow it in full. Hints: **$ARGUMENTS**

- `.idea/` is read before anything else; the skill's Phase 1 table decides whether to build, to run
  the `shape` flow for a missing `SPECS.md`, or to send the user to `/brainstorm`.
- `$ARGUMENTS` naming a phase overrides the target phase, except that a first run always includes
  the Phase 0 walking skeleton.
- Hints are constraints on *how*, not permission to skip the plan-and-confirm step.
- The commit-tracking hooks ship in `.githooks/` and are wired with `core.hooksPath` — never Husky
  or another runner. Phase 6 ingests the commit history before regenerating progress.
- `/setup` marks a phase `verified`, never `done`: that is `/ship`'s, after a real release.
- Phase 6 tracks progress on every run, green or red. Once the phase is **verified green**, it
  installs the `project-manager` agent and only then asks whether to serve the dashboard at a
  `/management` route. Never build that route without an explicit yes.
- The dashboard is always last, and is built from the app's own theme and components — so the skill
  audits what the app actually has first, and offers to **defer** when there is nothing yet to
  inherit. Built, it must pass `.claude/scripts/dashboard-conformance.sh` and the derivation
  goldens before it is reported done.
