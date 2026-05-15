#!/usr/bin/env bash
# system/lint-tools.sh — drift checker for NL Tools wiring.
#
# Walks every top-level tool directory that has an index.html using
# /tools/system/auth-guard.js, and verifies its head structure matches
# the canonical template at system/_template/index.html. Reports
# anything out of sync — cache-bust versions, missing globals, scripts
# at body-bottom, etc.
#
# Wired into .claude/settings.json as a SessionStart hook so drift
# surfaces at the top of every Claude Code session. Also runs cleanly
# from the CLI:
#
#   bash system/lint-tools.sh
#
# Exits 0 always (so the SessionStart hook never blocks a session) —
# drift is surfaced as text output, not exit codes.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$REPO_ROOT/system/_template/index.html"
SKIP_FILE="$REPO_ROOT/system/_template/.lint-skip"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "lint-tools: template not found at $TEMPLATE" >&2
  exit 0
fi

# Pull canonical versions from the template — single source of truth.
canonical_version() {
  grep -oE "$1\?v=[0-9]+" "$TEMPLATE" | head -1 | sed 's/.*v=//'
}
CANON_BRAND=$(canonical_version "nl-brand.css")
CANON_UTILS=$(canonical_version "nl-utils.js")
CANON_TOPBAR=$(canonical_version "nl-topbar.js")
CANON_GUARD=$(canonical_version "auth-guard.js")

# Read skip-list (slugs only, # comments stripped).
declare -A SKIP
if [[ -f "$SKIP_FILE" ]]; then
  while IFS= read -r line; do
    slug="${line%%#*}"
    slug="${slug// /}"
    [[ -z "$slug" ]] && continue
    SKIP["$slug"]=1
  done < "$SKIP_FILE"
fi

# check_asset <file> <slug> <index> <canonical> → echoes drift line if any.
# Distinguishes three cases:
#   (a) not loaded at all          → drift: missing
#   (b) loaded without ?v=         → drift: missing cache-bust
#   (c) loaded with stale ?v=N     → drift: version mismatch
check_asset() {
  local file="$1" slug="$2" index="$3" canon="$4"
  local loaded versioned actual
  loaded=$(grep -oE "/tools/system/$file" "$index" | head -1 || true)
  if [[ -z "$loaded" ]]; then
    echo "  $slug: missing $file"
    return
  fi
  versioned=$(grep -oE "$file\?v=[0-9]+" "$index" | head -1 || true)
  if [[ -z "$versioned" ]]; then
    echo "  $slug: $file loaded without ?v= cache-bust (canonical ?v=$canon)"
    return
  fi
  actual="${versioned##*v=}"
  if [[ "$actual" != "$canon" ]]; then
    echo "  $slug: $file?v=$actual (canonical ?v=$canon)"
  fi
}

# Find candidate tools: top-level dirs with index.html that references
# auth-guard.js. Public/no-auth tools are skipped automatically.
clean_count=0
warn_count=0
declare -a warnings

cd "$REPO_ROOT" || exit 0
for dir in */; do
  slug="${dir%/}"
  # Skip dirs starting with _ (e.g. system/_template — handled separately).
  [[ "$slug" == _* ]] && continue
  index="$slug/index.html"
  [[ ! -f "$index" ]] && continue
  grep -q '/tools/system/auth-guard\.js' "$index" || continue
  [[ -n "${SKIP[$slug]:-}" ]] && continue

  drift=()

  # System assets
  while IFS= read -r line; do
    [[ -n "$line" ]] && drift+=("$line")
  done < <(check_asset "nl-brand.css" "$slug" "$index" "$CANON_BRAND")
  while IFS= read -r line; do
    [[ -n "$line" ]] && drift+=("$line")
  done < <(check_asset "nl-utils.js"  "$slug" "$index" "$CANON_UTILS")
  while IFS= read -r line; do
    [[ -n "$line" ]] && drift+=("$line")
  done < <(check_asset "nl-topbar.js" "$slug" "$index" "$CANON_TOPBAR")
  while IFS= read -r line; do
    [[ -n "$line" ]] && drift+=("$line")
  done < <(check_asset "auth-guard.js" "$slug" "$index" "$CANON_GUARD")

  # Required globals
  grep -q "window\.NL_TOOL\s*=" "$index"     || drift+=("  $slug: missing window.NL_TOOL declaration")
  grep -q "NL_TOOL_KEY\s*=\s*['\"]" "$index" || drift+=("  $slug: missing NL_TOOL_KEY declaration")
  grep -q "window\.nlAuthReady\s*=" "$index" || drift+=("  $slug: missing window.nlAuthReady handler")
  grep -q 'id="pageWrap"' "$index"           || drift+=("  $slug: missing #pageWrap container")

  # Scripts must sit in <head>, not body-bottom.
  head_end=$(grep -n '</head>' "$index" | head -1 | cut -d: -f1)
  guard_line=$(grep -n 'auth-guard\.js' "$index" | head -1 | cut -d: -f1)
  if [[ -n "$head_end" && -n "$guard_line" && "$guard_line" -gt "$head_end" ]]; then
    drift+=("  $slug: auth-guard.js sits below </head> — should be in <head>")
  fi

  # Firebase SDK (10.12.0 compat). Only require -app + -auth + -database
  # if the tool calls firebase.initializeApp (some tools defer init).
  if grep -q "firebase\.initializeApp" "$index"; then
    grep -q "firebasejs/10\.12\.0/firebase-app-compat" "$index"      || drift+=("  $slug: missing firebase-app SDK")
    grep -q "firebasejs/10\.12\.0/firebase-auth-compat" "$index"     || drift+=("  $slug: missing firebase-auth SDK")
    grep -q "firebasejs/10\.12\.0/firebase-database-compat" "$index" || drift+=("  $slug: missing firebase-database SDK")
  fi

  if [[ ${#drift[@]} -eq 0 ]]; then
    clean_count=$((clean_count + 1))
  else
    warn_count=$((warn_count + 1))
    for d in "${drift[@]}"; do
      warnings+=("$d")
    done
  fi
done

echo "=== Tool wiring lint ==="
echo "Canonical: nl-brand.css?v=$CANON_BRAND  nl-utils.js?v=$CANON_UTILS  nl-topbar.js?v=$CANON_TOPBAR  auth-guard.js?v=$CANON_GUARD"
echo
if [[ ${#warnings[@]} -gt 0 ]]; then
  echo "Drift detected in $warn_count tool$( [[ $warn_count -ne 1 ]] && echo s ):"
  for w in "${warnings[@]}"; do
    echo "$w"
  done
  echo
fi
echo "$clean_count tool$( [[ $clean_count -ne 1 ]] && echo s ) clean."
exit 0
