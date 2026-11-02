#!/usr/bin/env bash
# The project's own commit history: git log, minus everything tateru's history
# reaches. /setup, the project-manager agent and selftest all read commits
# through this, so the edge cases live in one place.
#
#   bash .claude/scripts/project-log.sh [git log options...]
#   bash .claude/scripts/project-log.sh --format='%H %an %s'
#
# Excludes, whatever the remote is called:
#   - everything up to .claude/TATERU_BASE, the commit the project began from
#   - tateru's release tags (refs/tags/tateru/*), which /upgrade fetches
#   - the tateru remote's branches - found by URL, so an older project whose
#     tateru remote is still "origin" is covered too
#
# Works from any directory in the repo. Exit 2 when TATERU_BASE is missing:
# /setup writes it, from git merge-base with the tateru remote for a project
# set up before it existed.
set -u

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "project-log: not in a git repository" >&2; exit 1; }
cd "$root" || exit 1

if [ ! -f .claude/TATERU_BASE ]; then
  echo "project-log: .claude/TATERU_BASE is missing; /setup writes it" >&2
  exit 2
fi
# Strip CR and LF: a Windows checkout may add a carriage return.
base=$(tr -d '\r\n' < .claude/TATERU_BASE)
git cat-file -e "$base^{commit}" 2>/dev/null || { echo "project-log: TATERU_BASE ($base) is not a commit here" >&2; exit 2; }

up=$(git remote -v | awk '/jamesm-dev\/tateru\.dev/ { print $1; exit }')

if [ -n "$up" ]; then
  git log "$@" --all --not "$base" --glob='refs/tags/tateru/*' --glob="refs/remotes/$up/*" --
else
  git log "$@" --all --not "$base" --glob='refs/tags/tateru/*' --
fi
