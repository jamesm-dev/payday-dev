<div align="center">

# Payday

**What is safe to spend until payday — and when the loans end.**

A personal budgeting app for someone paid every two weeks, planned and built end to end with
[tateru.dev](https://github.com/jamesm-dev/tateru.dev).

[![Built with tateru.dev](https://img.shields.io/badge/built%20with-tateru.dev-d97757)](https://github.com/jamesm-dev/tateru.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Buy me a coffee](https://img.shields.io/badge/buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/jamesm.dev)

</div>

---

## What it does

Payday answers one question: **how much can I spend until my next payday without missing a bill?**

- **Safe to spend** — one number, after every bill, loan payment and the money held back for yearly
  bills, counted conservatively: it errs low, never high.
- **Pay and bills** — enter each paycheck, bill and loan payment once, with how it repeats; skip or
  move a single payment without changing the rest.
- **Daily expenses** — log what you spend in a few seconds, and the number drops at once.
- **The payday check-in** — five minutes every payday: did the pay land, what is in the account,
  what went out, and what you logged against what the bank says.
- **Loans** — credit cards, instalments, buy-now-pay-later and informal loans, with the total owed
  and a debt-free date.
- **The paycheck list** — each paycheck as your own handwritten-style list, with optional and paid
  marks, downloadable as a text file, PDF or Word document.
- **Private** — one owner, a password with an optional device PIN, fingerprint or face (passkeys),
  recovery codes, and a strict content security policy.

It is an installable web app: it runs in the browser and can be added to a phone's home screen.

## Built with tateru.dev

[tateru](https://github.com/jamesm-dev/tateru.dev) (建てる, "to build") is a
[Claude Code](https://claude.com/claude-code) workflow that takes a project from an idea to a spec, a
risk-ordered roadmap, a tested build and a release. **This repository is a tateru project, kept whole**
so you can see how the app was made, not only what it is:

| Where | What you will find |
|---|---|
| [`.idea/`](.idea/) | The plan, as an Obsidian vault: the [spec](.idea/SPECS.md), the phased [roadmap](.idea/ROADMAP.md), every epic with its acceptance criteria, the brainstormed ideas, and the [decision records](.idea/decisions/) (ADRs) behind each choice |
| [`.management/`](.management/) | Execution state derived from the plan: the board, progress and blockers |
| [`.claude/`](.claude/) | The workflow itself: the slash commands, skills, agents and hooks that built the app |
| [`CLAUDE.md`](CLAUDE.md) | The project's instructions for Claude Code: the stack, the commands and the conventions |
| [`app/`](app/) | The app |

Payday went `/brainstorm` → `/shape` → `/setup` phase by phase, with `/work-on` for single tasks,
`/epic` for features added along the way, and `/decide` for decisions. Each phase was verified by
its tests before the next began.

## Stack

SvelteKit 3 with Svelte 5 and TypeScript; Drizzle ORM; Vitest and Playwright (iPhone, Android and
laptop sizes). Today the data lives in SQLite; it is moving to a free **Netlify + Supabase Postgres**
setup ([Phase 6](.idea/ROADMAP.md), [ADR-0013](.idea/decisions/ADR-0013%20Netlify%20As%20The%20Host.md),
[ADR-0014](.idea/decisions/ADR-0014%20Supabase%20Postgres%20As%20The%20Database.md)).

## Run it locally

You need Node.js 26.13.0 and pnpm 12.16.1 (`npm install -g pnpm@12.16.1`). Every command runs from
`app/`:

```bash
cd app
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests, then the browser tests (run `pnpm e2e:browsers` once first)
```

[`app/README.md`](app/README.md) covers the first sign-in, demo data, environment variables, every
command and the code's structure.

## Status

Built and tested locally, phase by phase. Not yet deployed: the move to Netlify and Supabase is in
progress. See the [roadmap](.idea/ROADMAP.md) for what is done and what is next.

## Author

Built by **James Malatabon** — [github.com/jamesm-dev](https://github.com/jamesm-dev).

If Payday or tateru helps you, a [coffee](https://buymeacoffee.com/jamesm.dev) is a lovely way to
say so. A star works too, and is free.

## License

[MIT](LICENSE)
