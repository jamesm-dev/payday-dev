---
name: ship
description: Take a completed phase to production - verify the readiness gates, then release. Use when the user wants to deploy, ship, release, cut a version, go live, or asks whether the project is ready to ship. Also use to check readiness without releasing.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

# Ship

The production step. Everything before this builds; this is what puts it in front of people.

**Plain language.** Everything you say to the person — questions, plans, summaries, reports —
follows `.claude/skills/shared/plain-language.md`: assume they are not a developer, use simple
words, recommend an option when you ask, and explain any technical word the first time it appears.
Notes in `.idea/` may stay technical; explain them, don't paste them.

**Nothing here is irreversible without an explicit yes.** Deploying, tagging, and publishing are
outward-facing acts, and approval for one is not approval for the next.

## What actually ships

> [!important] Shipping publishes the app's build output. It does not publish the repository.
> The deploy serves whatever `app/`'s build produces — `app/dist`, or the equivalent for the stack.
> `.idea/`, `.management/`, `.claude/` and the root `README.md` are **repository** content: they are
> cloned by the build, never served by it.
>
> Confirm this rather than assuming it. Name the output directory the host is configured to publish,
> list what is in it, and say so in the release notes. A host misconfigured to serve the repository
> root would publish the roadmap, the blockers and every ADR to the open internet, and it would look
> like a successful deploy.

Two different questions follow, and they are easy to conflate:

| | Reaches the public URL | Reaches the git remote |
|---|---|---|
| `app/` build output | Yes | Yes |
| `.idea/`, `.management/` | **No** | **Yes** |

The second column is what the pre-flight visibility check below is for.

## Phase 1 — Establish where things stand

Read `.idea/ROADMAP.md` for the phase to ship — the lowest-numbered one at `verified` — and its exit
criteria, `.management/PROGRESS.md` and
`BLOCKERS.md`, and the repo's deploy configuration — CI workflow, Dockerfile, host config, whatever
`SPECS.md` named as the target.

Say which phase is being shipped and what the release contains, before checking anything.

## Phase 2 — Walk the readiness gates

The seven gates in `.claude/skills/setup/references/git-hooks.md`. Check each **by running
something**, not by reading a status file — a file can be stale, a command cannot.

| Gate | How to actually check |
|---|---|
| Exit criteria | Each one, against evidence. Unverifiable means unmet. A parked criterion is reported as parked, never as met. Criteria marked ` — at release` count as satisfied for the gate, as everywhere else: this release proves them in Phase 4 after the deploy, and fails if they do not hold |
| Tasks | Nothing blocked or in flight in this phase |
| Tests | Run the suite now. Show the output. |
| Checks | Run lint, typecheck, build now |
| Pull requests | None open against this phase's epics, or all approved |
| Risks | No `critical` rule firing |
| Deploy path | Exercised — the skeleton reached the real target at least once. **On the first release this gate is met by the release itself**: Phase 0's skeleton is deployed by its first `/ship`, and step 5 below is the evidence. Say so, rather than waiving it |

Report `N of 7 gates met`, then each unmet gate with what is blocking it.

> [!warning] Do not ship on an unmet gate without saying so
> If the user wants to ship anyway, that is their call — but state which gate is unmet, what could
> go wrong, and record it in the release notes. Never let an unmet gate pass silently because the
> user seemed keen.

## Phase 3 — Pre-flight

Things that are cheap now and expensive at 2am:

- **Secrets** — every key the app needs exists in the target environment. `.env.example` lists them;
  check each is set there. Never print a value.
- **Repository visibility** — this workflow keeps the plan in the repo, so a public remote makes
  `SPECS.md`, `ROADMAP.md`, every ADR, and `.management/`'s blockers and progress public with it.
  That is often fine and sometimes the whole point; it should still be a decision.

  Check it before the **first** release, not the fifth:

  ```bash
  git remote -v
  gh repo view --json visibility -q .visibility   # PUBLIC or PRIVATE
  ```

  If the remote is public and the vault is tracked, say plainly what becomes readable — unshipped
  plans, open blockers, what was parked and why, and any decision recorded under a name a competitor
  or a customer would recognise. Then ask. Do not decide it for them, and do not skip it because the
  code itself is open source: the code being public says nothing about wanting the roadmap public.

  If they want it private, the options are a private remote, or removing `.idea/` and `.management/`
  from tracking — which costs the project its record, so name that cost rather than offering it as a
  tidy fix.
- **Migrations** — pending ones identified, reversible or explicitly not, and a note on ordering if
  the deploy is not atomic.
- **Rollback** — say concretely how to undo this. If the answer is "redeploy the previous tag",
  confirm the previous tag exists — the project's own `v*`, never a `tateru/v*` tag, which is the
  workflow's version, not a release of this app. If a bare `v*` tag still points at a tateru commit
  (a clone from before `/setup` moved them), move it first, as `/setup`'s Git step does.
- **Data** — anything destructive, called out by name.
- **Config drift** — the target's runtime version matches local and CI.

If there is no rollback path, say so before deploying, not after.

## Phase 4 — Release

Ask before each outward-facing step. Do not chain them.

1. **Version** — bump per the project's scheme. Ask if the scheme is unclear rather than guessing at
   semver intent.
2. **Changelog** — write the entry from `.management/CHANGELOG.md` and the epics in this phase.
   Real changes, in the user's language, not commit subjects.
3. **Tag** — annotated, matching the version.
4. **Deploy** — the project's own command or pipeline. Never a hand-rolled deploy invented here.
   Before running it, state the output directory being published and confirm it is the app's build
   output, not the repository root.
5. **Verify live** — hit the deployed thing and confirm it responds. A deploy that reported success
   is not a deploy that works.
6. **Measure the budget live** — each `SPECS.md` performance budget entry, against the deployed URL
   on the device and network it names. Record the real numbers beside the criterion. A missed
   budget is reported as missed: fix it, or record it as an accepted regression with a reason.
   Never round it, and never tick a budget criterion on a number nobody measured.

## Phase 5 — Record

- Append the release to `.management/CHANGELOG.md`: version, date, what shipped, any gate that was
  waived, and **what was published** — the output directory, so a later reader can tell at a glance
  that the vault was never part of the release.
- Mark the phase `done` in `ROADMAP.md` — only `/ship` does this — and tick the criteria only a live
  release could prove — the ` — at release` ones — with the step 5 and 6 evidence.
- Set its epics to `done`.
- Write an ADR for anything decided under pressure during the release — those are the decisions
  most likely to be forgotten and most expensive to rediscover.
- Refresh `.management/` the way `/setup` Phase 6 does — steps 1 to 4, 7 and 11, and `currentPhase`
  in `state.json` — so the dashboard stops showing the shipped phase as `verified · not shipped`.

Close with: what shipped, where it is live, what was waived, how to roll back, and the next phase.

## If it goes wrong

Say so immediately and plainly, with the error. Roll back first, diagnose second — a broken
production is not the place to be curious. Then record what happened in the changelog, because the
next release will want to know. Leave the phase at `verified`: it is not `done` until a release
actually lands.

**Re-running after a failed release.** Phase 4 may have bumped the version and created the tag
before the deploy failed. Check first (`git tag --points-at HEAD`, the version file) and never bump
twice. If the fix needed new commits, the old tag points at the wrong code: ask whether to move it
(only if it was never pushed) or release under the next version, and record the abandoned one in the
changelog.
