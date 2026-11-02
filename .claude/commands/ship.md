---
description: Verify the readiness gates and take the current phase to production
argument-hint: [optional: "check" to verify without releasing]
allowed-tools: Skill, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

Invoke the `ship` skill and follow it in full. Hints: **$ARGUMENTS**

- `check`: walk the seven readiness gates and stop. Release nothing.
- Every outward-facing step — tag, deploy, publish — is confirmed separately. Approval for one is
  never approval for the next.
- An unmet gate does not silently pass. Name it, say what could go wrong, and record any waiver.
