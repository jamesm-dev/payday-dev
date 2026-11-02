#!/usr/bin/env bash
# Checks a built /management dashboard against the machine-readable contract in
# .management/contract/. Prose is not reproducible; this is.
#
#   bash .claude/scripts/dashboard-conformance.sh [path ...]
#
# With no argument it reads .management/contract/sources.txt, and guesses if that is
# absent. Exits 0 when everything conforms, 1 when anything does not, 2 when it could
# not run at all — including when no dashboard has been built yet.
#
# WHAT IT PROVES
#   Every required string is present verbatim, allowing for line wrapping and inline
#   markup. Every measurement is present, or its substitution is declared in tokens.map.
#   Every ordered sequence appears in the right order.
#
# WHAT IT CANNOT PROVE
#   That 248px was applied to the sidebar rather than to something else, or that the
#   page looks right. It is a contract check, not a screenshot. Behaviour is covered by
#   the derivation goldens in contract/fixtures/; appearance is covered by a reviewer.
#
# DEPENDENCIES
#   bash, find, xargs, cat, sed, tr, awk. Nothing else, on purpose: it has to run in any
#   project in any language, including one whose package manager is not installed yet.

set -u

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CONTRACT="$ROOT/.management/contract"
STRINGS="$CONTRACT/strings.txt"
LAYOUT="$CONTRACT/layout.txt"
ORDER="$CONTRACT/order.txt"
TOKENMAP="$CONTRACT/tokens.map"
SOURCELIST="$CONTRACT/sources.txt"

fail_run() { printf 'conformance: %s\n' "$1" >&2; exit 2; }

[ -f "$STRINGS" ] || fail_run "no contract at $CONTRACT - nothing to check against"

# --- locate the source ------------------------------------------------------------
# An array throughout: this repository's own path contains a space, and so will plenty
# of others. Word-splitting a path is the classic way a checker "passes" by checking
# nothing at all.
#
# sources.txt is the answer, and it is written by /setup against whatever structure the
# project actually has. This script assumes NO stack and NO directory layout: there is
# no app/, no src/, no framework and no language until a build creates one. The fallback
# below is a generic search for something called "management", not a list of framework
# conventions - guessing at Next.js and Vite paths would be this checker deciding where
# your code lives, which it does not get to decide.
SOURCES=()

if [ "$#" -gt 0 ]; then
  SOURCES=("$@")
elif [ -f "$SOURCELIST" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    [ -e "$ROOT/$line" ] && SOURCES+=("$ROOT/$line")
  done < "$SOURCELIST"
fi

# Fallback: anything named for the dashboard, anywhere, excluding this workflow's own
# folders. A convenience for a first run before sources.txt is written - never the
# contract, and never a list of framework conventions.
if [ "${#SOURCES[@]}" -eq 0 ]; then
  SKIP=(
    -not -path '*/node_modules/*' -not -path '*/.git/*'
    -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.svelte-kit/*'
    -not -path "$ROOT/.management/*" -not -path "$ROOT/.claude/*" -not -name '.management'
  )
  while IFS= read -r found; do
    [ -n "$found" ] && SOURCES+=("$found")
  done < <(find "$ROOT" \( -type d -o -type f \) -name '*management*' "${SKIP[@]}" 2>/dev/null | sort)
fi
if [ "${#SOURCES[@]}" -eq 0 ]; then
  echo "conformance: no dashboard found - nothing has been built yet, so there is" >&2
  echo "conformance: nothing to check. When /setup builds one, it writes the paths" >&2
  echo "conformance: into .management/contract/sources.txt" >&2
  exit 2
fi

for s in "${SOURCES[@]}"; do
  [ -e "$s" ] || fail_run "no such path: $s"
done

# --- build the haystack -----------------------------------------------------------
# One line per (file, view). Three views of each file, because no one normalisation
# matches everything:
#
#   raw      tags intact - the only view where attribute text survives, so placeholder,
#            title and aria-label strings are checkable at all
#   spaced   tags replaced with a space - prose broken across <strong> reads as prose
#   joined   tags removed entirely - keeps punctuation tight, so "<code>.idea/</code>."
#            still reads as ".idea/." rather than ".idea/ ."
#
# PER FILE, not one concatenation, and this matters. An ordered sequence checked across
# every file at once passes when a later file happens to contain the next word: swap two
# board columns and the check still goes green because another section mentions one of
# them. A sequence is a property of the file that declares it, so it must be satisfied
# inside a single file, in a single view.
HAY=$(mktemp) || fail_run "could not create a temporary file"
trap 'rm -f "$HAY"' EXIT

flatten() { tr '\n\r\t' '   ' | tr -s ' '; }

EXCLUDE=(
  ! -path '*/node_modules/*'
  ! -name '*.png' ! -name '*.jpg' ! -name '*.jpeg' ! -name '*.gif'
  ! -name '*.svg' ! -name '*.ico' ! -name '*.woff' ! -name '*.woff2'
  # Tests are excluded on purpose. A spec that asserts the same string would satisfy
  # the contract while the implementation had lost it - the checker would be reading
  # its own homework. The contract is satisfied by the page or not at all.
  ! -name '*.test.*' ! -name '*.spec.*'
  ! -path '*/e2e/*' ! -path '*/__tests__/*' ! -path '*/tests/*'
)

FILES=0
while IFS= read -r -d '' f; do
  FILES=$((FILES + 1))
  {
    flatten < "$f";                     printf '\n'
    sed 's/<[^>]*>/ /g' "$f" | flatten; printf '\n'
    sed 's/<[^>]*>//g' "$f" | flatten;  printf '\n'
  } >> "$HAY"
done < <(find "${SOURCES[@]}" -type f "${EXCLUDE[@]}" -print0 2>/dev/null)

[ -s "$HAY" ] || fail_run "read no source from: ${SOURCES[*]}"

# --- the checker ------------------------------------------------------------------
# mode=strings   the literal fragments between {…} must appear, in order
# mode=layout    the value must appear, unless tokens.map declares a substitution
# mode=order     the items must appear in the given relative order
TOTAL=0
BAD=0
SUBS=0

check() {
  mode=$1
  file=$2
  label=$3

  if [ ! -f "$file" ]; then
    printf '  %-12s (missing %s - skipped)\n' "$label" "$file"
    return 0
  fi

  out=$(awk -v mode="$mode" -v mapfile="$TOKENMAP" '
    function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }

    BEGIN {
      FS = "\t"
      view = 0
      while ((getline line < mapfile) > 0) {
        if (line ~ /^[ \t]*#/ || line == "") continue
        split(line, m, "\t")
        swap[trim(m[1])] = trim(m[2])
      }
      close(mapfile)
    }

    # The haystack comes first: one line per file per view.
    NR == FNR { L[++lines] = $0; next }

    /^[ \t]*#/ { next }
    NF == 0 || $1 == "" { next }

    {
      key = trim($1)
      val = trim($2)
      if (val == "") next
      total = total + 1

      if (mode == "layout" && (key in swap)) { val = swap[key]; subs = subs + 1 }

      if (mode == "strings")    n = split(val, part, /\{[^}]*\}/)
      else if (mode == "order") n = split(val, part, /\|/)
      else                    { n = 1; part[1] = val }

      # Satisfied inside ONE line - one file, one view - or not at all.
      #
      # ORDER entries take an optional maximum gap, in characters, between one item and
      # the next. Without it the check is a smoke test: a comment above a declaration
      # that happens to mention the same words in the old order satisfies it, and a
      # genuinely reordered array goes green. With a tight gap, only the declaration
      # itself can satisfy it, so the search backtracks over every starting occurrence
      # rather than giving up after the first.
      maxgap = (mode == "order" && $3 != "" && $3 + 0 > 0) ? $3 + 0 : 0
      missing = "@"

      for (v = 1; v <= lines && missing != ""; v++) {
        from = 1
        while (missing != "") {
          # Anchor on the next occurrence of the first checkable fragment.
          first = 0
          for (i = 1; i <= n; i++) {
            frag = trim(part[i])
            if (mode == "strings" && length(frag) < 5) continue
            if (frag == "") continue
            first = i
            break
          }
          if (first == 0) { missing = ""; break }

          f1 = trim(part[first])
          p = index(substr(L[v], from), f1)
          if (p == 0) { missing = f1; break }
          anchor = from + p - 1
          cur = anchor + length(f1)
          missing = ""

          for (i = first + 1; i <= n; i++) {
            frag = trim(part[i])
            if (mode == "strings" && length(frag) < 5) continue
            if (frag == "") continue
            p = index(substr(L[v], cur), frag)
            if (p == 0) { missing = frag; break }
            if (maxgap > 0 && p - 1 > maxgap) { missing = frag; break }
            cur = cur + p - 1 + length(frag)
          }

          if (missing == "") break
          from = anchor + 1
        }
      }

      if (missing != "") {
        bad = bad + 1
        printf "  FAIL  %-32s %s\"%s\"\n", key, \
          (mode == "order" ? "out of order or absent: " : "not found: "), missing
      }
    }

    END { printf "@@ %d %d %d\n", total, bad, subs }
  ' "$HAY" "$file")

  printf '%s\n' "$out" | grep -v '^@@ ' || true
  summary=$(printf '%s\n' "$out" | grep '^@@ ' | tail -1)

  # shellcheck disable=SC2086
  set -- $summary
  t=${2:-0}
  b=${3:-0}
  s=${4:-0}

  TOTAL=$((TOTAL + t))
  BAD=$((BAD + b))
  SUBS=$((SUBS + s))
  printf '  %-12s %d/%d\n' "$label" $((t - b)) "$t"
}

echo "dashboard conformance"
echo "  source       ${SOURCES[*]}"
echo "  files        $FILES"
echo
check strings "$STRINGS" "strings"
check layout  "$LAYOUT"  "measurements"
check order   "$ORDER"   "order"
echo

if [ "$SUBS" -gt 0 ]; then
  echo "  $SUBS measurement(s) satisfied by a declared substitution in tokens.map"
  echo
fi

if [ "$BAD" -eq 0 ]; then
  echo "PASS  $TOTAL/$TOTAL"
  echo
  echo "Behaviour is not covered here. Run the derivation tests built from"
  echo ".management/contract/fixtures/ too - see .management/design/Conformance.md."
  exit 0
fi

echo "FAIL  $((TOTAL - BAD))/$TOTAL - $BAD did not conform"
echo
echo "Each failure is a place the build drifted from the design. Fix the build; or if"
echo "the contract is genuinely wrong, change .management/contract/ and say why in the"
echo "same commit. Never silence a check by deleting its line."
exit 1
