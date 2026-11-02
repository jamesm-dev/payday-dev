---
description: Record an architecture decision as a numbered ADR in .idea/decisions/
argument-hint: [the decision, e.g. "use Postgres over SQLite"]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

Record a decision as an ADR. Decision: **$ARGUMENTS**

**Plain language.** Everything you say to the person — questions, plans, summaries, reports —
follows `.claude/skills/shared/plain-language.md`: assume they are not a developer, use simple
words, recommend an option when you ask, and explain any technical word the first time it appears.
Notes in `.idea/` may stay technical; explain them, don't paste them.

Read `.claude/skills/shared/vault-contract.md` before writing. ADRs are the one filename exception:
`ADR-0007 Use Postgres Over SQLite.md`. Number by scanning `.idea/decisions/` for the highest.

1. **Understand it first.** Read `SPECS.md`, the relevant epics, and existing ADRs. If this
   contradicts or replaces an earlier decision, find it — you will need to mark it superseded.
2. **Ask only what you cannot infer**, batched: the options genuinely considered, and what would
   make us revisit this. Never invent an alternative nobody weighed.
3. **Write it** per `.claude/skills/shape/references/templates.md`: context, options with real
   trade-offs, the decision, and consequences — what it makes easy, what it makes hard.
4. **Close the loop.** Set `superseded_by` on anything this replaces, link the ADR from the epics it
   affects, and regenerate `INDEX.md`.

A decision with one option is not a decision — it is a note. Say so and write it as one.
