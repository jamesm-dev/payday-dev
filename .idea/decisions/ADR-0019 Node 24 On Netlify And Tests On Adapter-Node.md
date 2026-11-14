---
title: ADR-0019 Node 24 On Netlify And Tests On Adapter-Node
created: 2026-11-15
updated: 2026-11-15
tags: [adr, decision, deploy]
status: accepted
decision: production on Node 24; browser tests build the same code with adapter-node
supersedes:
superseded_by:
---

# ADR-0019 Node 24 On Netlify And Tests On Adapter-Node

## Context

SPECS pins Node.js 26.13.0, the LTS line since 2026-10-28, for development. On Netlify
([[ADR-0013 Netlify As The Host]]) the functions run on AWS Lambda, which on 2026-11-15 offers
`nodejs26.x` only as a public preview that AWS says not to use in production; Netlify's own default
is Node 24. Netlify installs pnpm with Corepack, which Node 26 no longer bundles.

The browser tests start the production build as a Node server (`node build`, from adapter-node) and
rely on adapter-node's settings to give each test project its own client address and plain http. The
Netlify adapter's output cannot be started that way.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Node 24 in production and in CI's full checks; Node 26 for local development and a CI unit job** | Production runs a supported runtime; CI tests the version that runs live; development keeps the spec's version | Two versions to keep working; code must avoid Node-26-only APIs |
| Node 26 in production through Lambda's preview | One version everywhere | Not for production by AWS's own terms; no SLA |
| Node 24 everywhere | One version | Moves development off the spec's LTS line for no gain in production |
| **Browser tests build the same code with adapter-node; production builds with adapter-netlify** | The 523 browser tests keep testing the real server code unchanged | They do not exercise Netlify's wrapper; the first deploy and a check of the live site do |
| Browser tests on `vite preview` | No second adapter | Loses the per-project client address the sign-in tests need |

## Decision

Production builds and runs on Node 24 (`NODE_VERSION = "24"` in `netlify.toml`); `engines` allows
24 to 26. CI runs the full checks on Node 24 and the unit suite on Node 26. The browser tests build
with adapter-node, chosen by an environment variable, and production builds with
`@sveltejs/adapter-netlify`. Decided by `/setup` on 2026-11-15.

## Consequences

- What runs live is what CI's main job tests, apart from the adapter's thin wrapper.
- The Netlify wrapper is proven by the first deploy and a check of the live site at release.
- Revisit when Lambda's `nodejs26.x` is generally available: production can then follow the spec.

## Related

- Builds on: [[ADR-0013 Netlify As The Host]], [[ADR-0003 SvelteKit With TypeScript]]
- Epic: [[Deploy On Netlify]]
- Phase: [[ROADMAP]]
