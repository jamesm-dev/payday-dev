# Execution order

Verify as you go. Each step's output is evidence for the phase's exit criteria.

## 1. Scaffold

Prefer the ecosystem's official scaffolder over a hand-rolled tree: `create-*`, `cargo new`,
`uv init`, `dotnet new`, `rails new`. Check its *current* recommended invocation — flags churn, and
a remembered command line from an old version is the most common failure here.

**Scaffold into `app/`**, never the repository root — the root is the workflow's
(`.idea/`, `.management/`, `.claude/`). Most scaffolders take the target directory as an argument,
so pass `app`; where one insists on the current directory, scaffold into a temp dir and move the
result. Merge rather than overwrite if `app/` already has files worth keeping.

Watch the generated `.gitignore`. Several scaffolders ignore `.idea` for JetBrains, which in this
workflow is the **idea vault**. Inside `app/` that entry is merely wrong; at the root it would erase
the project's whole record from version control. Remove it and say why in a comment.

## 2. Dependencies

Install and pin what SPECS.md's stack table calls for, and nothing else. An unrequested dependency
is a decision the user did not make. If you believe one is missing, say so and ask.

## 3. Config

Typecheck config, linter, formatter, `.editorconfig`, and a `.gitignore` that actually matches the
stack. Prefer the tool's own `init` over a config block from memory.

## 4. Env

- `.env.example`: every key, documented, **empty values**.
- `.env`: only if the user asks. Confirm it is gitignored before it exists.
- Never invent a real credential, never commit one, never print one.

## 5. Database

Schema and migration scaffolding, plus a local dev story — Docker Compose or the managed provider's
local equivalent. Run the initial migration only against a local dev database, never a remote one.
Seed data if the phase needs something to look at.

## 6. Scripts

`dev`, `build`, `test`, `lint`, `format`, `typecheck` — named idiomatically for the ecosystem.
These are the commands `CLAUDE.md` and the README will promise, so they must actually work.

## 7. Tests

**Always, on the first run.** Not deferred to a later phase: a project that reaches Phase 2 untested
does not go back and add them, and every exit criterion after that rests on nothing.

Configure the runner and write at least one test that asserts something real. A test that asserts
`true === true` proves the runner starts and nothing else — say so if that is all you wrote.

Where the product has behaviour a unit test cannot reach — offline, persistence, a schema migration,
a real HTTP request — add the runner that can reach it and one test that does. The rule of thumb: if
getting it wrong would not be caught by any test you just wrote, that is the test to write first.

**Emit a machine-readable report** — JUnit XML or the runner's JSON reporter — so `/setup` can record
runs against tasks. A test trail nobody can parse is a test trail nobody keeps.

Name tests after the task they cover where it is natural (`TSK-7F3A21` in the title, or the file
path matching the epic), so runs link to work without a second mapping to maintain.

## 8. CI

Install → lint → typecheck → test → build, on the chosen provider. Pin the runner image and the
language version to match local.

## 9. Git hooks

**Always.** The three hooks already exist in `.githooks/` — `commit-msg` links commits to task ids,
`post-commit` records them, `pre-push` runs the checks. Wire them up per `git-hooks.md`:

```bash
git config core.hooksPath .githooks
```

Do it from the project's own install step so a fresh clone gets them without anyone remembering.
**Do not install Husky or another hook runner** — see `git-hooks.md` for why.

Write `.claude/team/checks.env` now, from the scripts step 6 created, in the format in
`.claude/skills/work-on/references/stack-profile.md` — `pre-push` runs nothing until it exists.
Phase 7 refreshes it from the commands Phase 5 verified.

Verify the hooks fire. Ask before the throwaway commit — "commit only if the user asks" holds here
too. With a yes, make one (`git commit --allow-empty -m "chore: verify hooks"`) and confirm a line
appears in `.management/commits.jsonl`; without one, run `sh .githooks/commit-msg` on a sample
message instead. Then confirm `sh .githooks/pre-push` blocks on a deliberately failing check. A hook nobody proved fires is a hook
that does not fire.

Hooks write data only — `commits.jsonl` — never Markdown in `.idea/` or `.management/`, and never
`board.db` (they may read it): a shell script with a database driver is a dependency bought for rows nothing
reads yet.

## 10. Docs

- `README.md`: what it is · prerequisites · setup · run · test · project structure.
- `CLAUDE.md`: stack, conventions, the real commands, and anything a future session would otherwise
  rediscover the hard way.

## 11. Verify

Run each in turn and show real output:

```
<install>  <lint>  <typecheck>  <test>  <build>  <dev — confirm it boots, then stop it>
```

Run these from `app/`. Any command promised in `CLAUDE.md` or a README must name the directory it
runs in, or the first person to try it from the root will conclude the project is broken.

Then check the phase's exit criteria one at a time, with evidence per criterion.

## 12. Git

Ensure the repo exists and `.gitignore` is right. Commit only if the user asks; if on the default
branch, branch first.

**On the first run, move tateru's own tags out of the project's way.** A plain `git clone` of tateru
brings its release tags (`v0.1.0`, …) along, and the project's first `/ship` would collide with
them, or mistake one for its own previous release. Move only the tags that **are** tateru's — the
same name pointing at the same object as on tateru — so a project's own release is never touched:

```bash
git ls-remote --tags https://github.com/jamesm-dev/tateru.dev.git 'v*' |
  while read -r sha ref; do
    t=${ref#refs/tags/}; case "$t" in *'^{}') continue ;; esac
    [ "$(git rev-parse -q --verify "refs/tags/$t")" = "$sha" ] || continue
    git tag "tateru/$t" "$t" && git tag -d "$t"
  done
```

Then, still on the first run:

- **Record where the project began**: `git rev-parse HEAD > .claude/TATERU_BASE`, before any
  project commit, and commit it with the first project commit. It is a file, not a tag, so every
  clone and teammate has it. Commit ingestion and the author check exclude everything up to it, so
  tateru's own history never reads as the project's work.
- **Rename the tateru remote** if a plain clone left it as `origin`: `git remote rename origin
  tateru`, then `git config remote.tateru.tagOpt --no-tags`, so a fetch never brings bare `v*` tags
  back. The project adds its own `origin` when it has a repository; `/upgrade` finds `tateru` by
  URL either way.

Say what was moved, renamed and recorded. The moved tags are local; `/upgrade` reads the same
`tateru/v*` names.

## Windows notes

This project runs on Windows. Prefer cross-platform scripts over shell-specific ones; avoid `&&`
chains inside npm scripts where a cross-platform runner is the idiom; watch for path separators and
CRLF settings in `.gitattributes`.
