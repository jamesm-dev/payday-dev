#!/usr/bin/env bash
# UserPromptSubmit hook.
# Injects a compact snapshot of the .idea/ vault and CLAUDE.md into context on
# every prompt, so Claude always works from the project's recorded intent.
# Emits only fixed strings and integers, so no JSON escaping is needed.
# Always exits 0 - a failure here must never block a prompt.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

ex() { if [ -f "$1" ]; then echo present; else echo missing; fi; }
ct() {
  if [ -d "$1" ]; then
    find "$1" -maxdepth 1 -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' '
  else
    echo 0
  fi
}

if [ -d .idea ]; then
  a="[project context] .idea/ SPECS.md: $(ex .idea/SPECS.md), ROADMAP.md: $(ex .idea/ROADMAP.md), INDEX.md: $(ex .idea/INDEX.md)"
  b="notes: $(ct .idea/notes), themes: $(ct .idea/themes), epics: $(ct .idea/epics), decisions: $(ct .idea/decisions), sessions: $(ct .idea/sessions)"
else
  a="[project context] .idea/ is not present"
  b="Offer /brainstorm if the user is starting something new."
fi
c="CLAUDE.md: $(ex CLAUDE.md)"
d="Before acting, read the .idea/ files relevant to this prompt (and CLAUDE.md if present). Skip only if the prompt is clearly unrelated to this project."

msg="$a\n$b\n$c\n$d"

printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"},"suppressOutput":true}\n' "$msg"
exit 0
