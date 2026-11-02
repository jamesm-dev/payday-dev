#!/usr/bin/env bash
# SessionStart hook.
# One job: audit every existing note in .idea/ and .management/ against the vault
# contract. This catches drift from edits made outside Claude — by hand, by another
# tool, by a merge — which no PostToolUse hook can see.
#
# Notes are written with ordinary Write and Edit. Nothing gates that. What is
# enforced is the FORMAT: every note must stay Obsidian-compatible, per
# .claude/skills/shared/vault-contract.md. validate-vault-note.sh is the authority.
#
# The audit runs in parallel. Each validation is a separate bash process, which on
# Windows costs well over a second in spawn alone — serially, a vault of fifty notes
# blew past this hook's timeout and the audit silently never reported. Fan out across
# the available cores instead. If this hook ever creeps back toward its timeout, the
# real fix is a batch mode in the validator that checks every file in ONE process,
# not a longer timeout.
#
# Always exits 0. Emits only fixed strings, integers, and file paths.
set -u

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" 2>/dev/null || exit 0

VALIDATOR=".claude/hooks/validate-vault-note.sh"
lines=""
add() { lines="$lines$1\\n"; }

emit() {
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"},"suppressOutput":true}\n' "$lines"
  exit 0
}

# Once /setup has created app/, the git hooks are what keep .management/ honest.
# Unwired or non-executable hooks fail silently — it looks exactly like a project
# where nobody commits — so say so here, where someone will read it.
if [ -d app ] && [ -d .githooks ]; then
  hp=$(git config core.hooksPath 2>/dev/null)
  if [ "$hp" != ".githooks" ]; then
    add "[hooks] Git hooks are not wired: core.hooksPath is '${hp:-unset}'. Commits are not being tracked. Fix: git config core.hooksPath .githooks"
  else
    for h in .githooks/*; do
      [ -x "$h" ] || add "[hooks] $h is not executable, so git skips it. Fix: chmod +x $h, and git update-index --chmod=+x $h"
    done
  fi
fi

[ -f "$VALIDATOR" ] && [ -d .idea ] || emit

# Parallel width: one job per core, clamped to a sane range. nproc is absent on some
# minimal shells, so fall back to a conservative default rather than failing.
jobs=$(nproc 2>/dev/null || echo 4)
case "$jobs" in
  ''|*[!0-9]*) jobs=4 ;;
esac
[ "$jobs" -lt 2 ] && jobs=2
[ "$jobs" -gt 16 ] && jobs=16

total=$(find .idea .management -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
[ "${total:-0}" -eq 0 ] && emit

# Each worker prints only the path of a note that FAILS, so the collected output is
# the failure list. NUL-delimited throughout: note filenames are Title Case With
# Spaces, and a word-split would corrupt every one of them.
failed=$(find .idea .management -name '*.md' -print0 2>/dev/null \
  | xargs -0 -P "$jobs" -I{} bash -c \
      'bash "$0" --check "$1" >/dev/null 2>&1 || printf "%s\n" "$1"' \
      "$VALIDATOR" {} 2>/dev/null | sort)

if [ -n "$failed" ]; then
  n=$(printf '%s\n' "$failed" | wc -l | tr -d ' ')
  list=$(printf '%s\n' "$failed" | sed 's/^/ | /' | tr -d '\n')
  add "[vault] $n of $total existing notes FAIL the vault contract:$list"
  add "[vault] Run: bash .claude/hooks/validate-vault-note.sh --check <file> to see why, and offer to fix them."
else
  add "[vault] All $total notes in .idea/ and .management/ satisfy the vault contract."
fi

emit
