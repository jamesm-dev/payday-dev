#!/usr/bin/env bash
# Print the GitHub release for one tateru version, from .claude/CHANGELOG.md.
# The release workflow (.github/workflows/release.yml) publishes what this prints.
#
#   bash .claude/scripts/release-notes.sh <version>           the release description
#   bash .claude/scripts/release-notes.sh <version> --title   the release title
#
# The changelog heading is `## <version> — <date>`, optionally followed by
# ` — <short title>`. The title is `v<version>: <short title>`, or just
# `v<version>` without one. The description is everything under the heading up
# to the next `## `, plus a compare link to the previous release.
#
# Exit 2 when the changelog has no entry for that version.
set -u

ver="${1:-}"
[ -n "$ver" ] || { echo "usage: $0 <version> [--title]" >&2; exit 2; }

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=.
log="$root/.claude/CHANGELOG.md"
[ -f "$log" ] || { echo "release-notes: $log not found" >&2; exit 2; }

# Escape the dots so 0.3.1 cannot match 0x3y1.
pat=$(printf '%s' "$ver" | sed 's/\./\\./g')
heading=$(grep -m1 -E "^## $pat( |$)" "$log" | tr -d '\r')
[ -n "$heading" ] || { echo "release-notes: no '## $ver' entry in the changelog" >&2; exit 2; }

if [ "${2:-}" = "--title" ]; then
  # Third em-dash-separated field, if there is one.
  title=$(printf '%s' "$heading" | awk -F ' — ' 'NF >= 3 { sub(/^[^—]*— [^—]*— /, ""); print }')
  if [ -n "$title" ]; then printf 'v%s: %s\n' "$ver" "$title"; else printf 'v%s\n' "$ver"; fi
  exit 0
fi

body=$(awk -v h="$heading" '
  { sub(/\r$/, "") }
  $0 == h { on = 1; next }
  on && /^## / { exit }
  on { print }
' "$log" | sed -e '/./,$!d')
# Trim trailing blank lines.
body=$(printf '%s\n' "$body" | sed -e ':a' -e '/^\n*$/{$d;N;ba' -e '}')
printf '%s\n' "$body"

# The previous release is the next version heading below this one.
prev=$(awk -v h="$heading" '
  $0 == h { seen = 1; next }
  seen && /^## [0-9]/ { print $2; exit }
' "$log")
if [ -n "$prev" ]; then
  printf '\nFull list: `.claude/CHANGELOG.md`. Compare: https://github.com/jamesm-dev/tateru.dev/compare/v%s...v%s\n' "$prev" "$ver"
fi
