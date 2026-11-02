#!/usr/bin/env bash
# PostToolUse hook on Write|Edit.
# Validates that any Markdown written into .idea/ or .management/ obeys the vault
# contract in .claude/skills/shared/vault-contract.md, so notes written by any
# command or skill stay Obsidian-compatible.
#
# Exits 0 silently for every file outside those folders.
# On failure it emits decision:block with a reason, which is fed back to Claude
# so it fixes the note; the turn continues.
#
# Two modes:
#   (no args)          hook mode - reads the hook JSON on stdin, emits block JSON
#   --check <file>     plain mode - validates one file, prints failures, exits 1
set -u

mode=hook
if [ "${1:-}" = "--check" ]; then
  mode=text
  fp="${2:-}"
  [ -n "$fp" ] || { echo "usage: $0 --check <file.md>" >&2; exit 2; }
fi

input=""
[ "$mode" = "hook" ] && input=$(cat 2>/dev/null || true)

# Extract the written path. Prefer tool_response.filePath, fall back to tool_input.file_path.
if [ "$mode" = "hook" ]; then
fp=$(printf '%s' "$input" | sed -n 's/.*"filePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[ -z "$fp" ] && fp=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

# Obsidian MCP tools carry vault + a vault-relative path instead. Resolve the
# vault id to its root so notes written through the MCP are checked too.
if [ -z "$fp" ]; then
  vid=$(printf '%s' "$input" | sed -n 's/.*"vault"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  vpath=$(printf '%s' "$input" | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  if [ -n "$vid" ] && [ -n "$vpath" ] && command -v node >/dev/null 2>&1; then
    vroot=$(node -e '
      const fs=require("fs"),p=require("path");
      const want=process.argv[1];
      let root="";
      const check=(cfg)=>{ if(!cfg||!cfg.mcpServers) return;
        for(const [k,v] of Object.entries(cfg.mcpServers)){
          if(!/obsidian/i.test(k)) continue;
          for(const a of (v.args||[])){
            const m=/^(?:--vault[= ])?([^=]+)=(.+)$/.exec(a);
            if(m && m[1]===want) root=m[2];
          }
        }};
      for(const f of [p.join(process.argv[2],".mcp.json"),p.join(process.argv[3],".claude.json")]){
        try{ const c=JSON.parse(fs.readFileSync(f,"utf8")); check(c);
          if(c.projects) for(const v of Object.values(c.projects)) check(v);
        }catch(e){}
      }
      process.stdout.write(root);
    ' "$vid" "${CLAUDE_PROJECT_DIR:-$(pwd)}" "$HOME" 2>/dev/null)
    [ -n "$vroot" ] && fp="$vroot/$vpath"
  fi
fi
fi

[ -z "$fp" ] && exit 0

# JSON-escaped Windows separators to forward slashes.
fp=$(printf '%s' "$fp" | sed 's#\\\\#/#g; s#\\#/#g')

# Only Markdown, only inside the two vaults.
case "$fp" in
  *.md|*.MD) ;;
  *) exit 0 ;;
esac
case "$fp" in
  */.idea/*|*/.management/*|.idea/*|.management/*) ;;
  *) exit 0 ;;
esac

[ -f "$fp" ] || exit 0

base=$(basename "$fp" .md)
fails=""
# Strip backslashes and turn double quotes into single ones, so the message is
# always safe to embed in the JSON string below.
add() {
  s=$(printf '%s' "$1" | tr -d '\\' | tr '"' "'")
  fails="$fails\\n  - $s"
}

# --- filename ---------------------------------------------------------------
case "$base" in
  *'#'*|*'^'*|*'['*|*']'*|*'|'*|*':'*|*'*'*|*'?'*|*'"'*|*'<'*|*'>'*)
    add "Filename contains a character Obsidian or Windows rejects. Remove any of these: hash caret square-brackets pipe colon asterisk question-mark double-quote angle-brackets" ;;
esac
[ ${#base} -gt 60 ] && add "Filename is longer than 60 characters. Shorten it."

# --- frontmatter ------------------------------------------------------------
if [ "$(head -1 "$fp")" != "---" ]; then
  add "No YAML frontmatter. Line 1 must be exactly three dashes."
else
  close=$(awk 'NR>1 && /^---[[:space:]]*$/ {print NR; exit}' "$fp")
  if [ -z "$close" ]; then
    add "Frontmatter is never closed. Add a line of three dashes after the final key."
  else
    fm=$(sed -n "2,$((close-1))p" "$fp")

    for k in title created updated tags status; do
      printf '%s' "$fm" | grep -q "^$k:" || add "Frontmatter is missing the required key: $k"
    done

    t=$(printf '%s' "$fm" | sed -n 's/^title:[[:space:]]*//p' | head -1 | sed 's/[[:space:]]*$//')
    if [ -n "$t" ] && [ "$t" != "$base" ]; then
      add "Frontmatter title ($t) does not match the filename ($base). Wikilinks resolve by filename, so they must be identical."
    fi

    for k in created updated; do
      v=$(printf '%s' "$fm" | sed -n "s/^$k:[[:space:]]*//p" | head -1 | sed 's/[[:space:]]*$//')
      if [ -n "$v" ]; then
        case "$v" in
          [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
          *) add "Frontmatter $k must be an unquoted YYYY-MM-DD date, got: $v" ;;
        esac
      fi
    done

    st=$(printf '%s' "$fm" | sed -n 's/^status:[[:space:]]*//p' | head -1 | sed 's/[[:space:]]*$//')
    case "$st" in
      ""|seed|exploring|promising|committed|parked|superseded|active|dormant|suggested|planned|in-progress|done|cut|draft|proposed|accepted|rejected) ;;
      *) add "status: $st is not in the vault contract vocabulary. Do not invent new status values." ;;
    esac

    printf '%s' "$fm" | grep -q '^[[:space:]]*-\{0,1\}[[:space:]]*#' && \
      add "Frontmatter tags must not carry a # prefix."
    printf '%s' "$fm" | sed -n '/^tags:/,/^[a-z_]*:/p' | grep -qE '[A-Z]' && \
      add "Frontmatter tags must be lowercase kebab-case."
  fi
fi

# --- body -------------------------------------------------------------------
# Headings are counted outside the frontmatter and outside fenced code blocks:
# a "# install" comment in a bash sample is code, not a second H1.
body=$(awk '
  NR == 1 && /^---[[:space:]]*$/ { infm = 1; next }
  infm { if (/^---[[:space:]]*$/) infm = 0; next }
  /^[[:space:]]*(```|~~~)/ { infence = !infence; next }
  !infence { print }
' "$fp")
h1=$(printf '%s\n' "$body" | grep -c '^# ' || true)
[ "$h1" -eq 1 ] || add "A note needs exactly one H1 heading matching its title, found $h1."
# A fixed-name system file (README, INDEX, DESIGN...) may give its H1 a
# description, because its filename is a role, not a subject.
case "$base" in *[!A-Z_]*) system=0 ;; *) system=1 ;; esac
if [ "$h1" -eq 1 ] && [ -n "${t:-}" ] && [ "$system" -eq 0 ]; then
  heading=$(printf '%s\n' "$body" | sed -n 's/^# //p' | head -1 | sed 's/[[:space:]]*$//')
  [ "$heading" = "$t" ] || add "The H1 ($heading) does not match the frontmatter title ($t). Make them identical."
fi

printf '%s\n' "$body" | grep -q '^#[A-Za-z]' && \
  add "A line starts with an inline tag. Obsidian parses that as a heading. Indent it or put it after text."

grep -q "$(printf '\t')" "$fp" && add "File contains tab characters. Use spaces."

bad_callouts=$(grep -o '^>[[:space:]]*\[![a-zA-Z-]*\]' "$fp" \
  | sed 's/.*\[!//; s/\]//' \
  | grep -vxE 'note|tip|question|warning|danger|example|abstract|todo|success|info|failure|bug|quote|caution|error|important|hint|check|done|attention|cite|summary|tldr|faq|help|missing|fail' \
  | sort -u | tr '\n' ' ')
[ -n "$bad_callouts" ] && add "Unknown callout type(s): $bad_callouts"

# --- epics: every acceptance criterion carries points ------------------------
# Assignee capacity is the sum of points on open tasks, so one unpointed task
# makes every capacity figure wrong by an unknown amount. /shape writes them.
case "$fp" in
  */epics/*)
    while IFS= read -r line; do
      case "$line" in
        *'^tsk-'*)
          # Points must sit before the block ref, which has to end the line.
          if ! printf '%s' "$line" | grep -qE '\([0-9]+ pts?\) \^tsk-[0-9a-f]{6}[[:space:]]*$'; then
            if printf '%s' "$line" | grep -qE '\^tsk-[0-9a-f]{6}[[:space:]]*[^[:space:]]'; then
              add "The ^tsk- block reference must end the line. Put evidence before the points: $line"
            else
              add "Acceptance criterion has no points. Write '(N pts) ^tsk-xxxxxx' - see shape/SKILL.md: $line"
            fi
          fi
          ;;
      esac
    done < "$fp"
    ;;
esac

# Cross-vault wikilinks: .idea and .management are separate Obsidian vaults, so a
# wikilink cannot reach from one into the other.
other=""
case "$fp" in
  */.management/*|.management/*) other=".idea" ;;
  */.idea/*|.idea/*)             other=".management" ;;
esac
# Match only inside the link target, so prose mentioning the other folder near a
# wikilink does not trip this.
if [ -n "$other" ] && grep -q "\[\[[^]]*$other" "$fp"; then
  add "A wikilink appears to point at $other. These are two separate vaults, so it cannot resolve. Use a relative Markdown link instead."
fi

# --- report -----------------------------------------------------------------
if [ "$mode" = "text" ]; then
  if [ -n "$fails" ]; then
    printf '%b\n' "$fails" | sed '/^$/d'
    exit 1
  fi
  exit 0
fi

if [ -n "$fails" ]; then
  printf '{"decision":"block","reason":"%s does not satisfy the Obsidian vault contract:%s\\n\\nFix it, then continue. The contract is .claude/skills/shared/vault-contract.md","systemMessage":"Vault note failed Obsidian checks: %s"}\n' \
    "$fp" "$fails" "$base.md"
  exit 0
fi

exit 0
