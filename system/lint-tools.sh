#!/usr/bin/env bash
# system/lint-tools.sh — drift checker for NL Tools wiring.
#
# Walks every tool index.html that uses /system/auth-guard.js — both
# top-level (vacancies/, tasks/) and one level down (graphics/totw/) —
# and verifies its head structure matches the canonical template at
# system/_template/index.html. Reports anything out of sync — cache-bust
# versions, missing globals, scripts at body-bottom, etc.
#
# Nested pages were invisible here until 30/07/2026, which is how six
# graphics sub-pages came to be loading nl-brand.css and nl-topbar.js
# with no ?v= at all without anything saying so.
#
# Wired into .claude/settings.json as a SessionStart hook so drift
# surfaces at the top of every Claude Code session. Also runs from the CLI:
#
#   bash system/lint-tools.sh            # report, always exit 0
#   bash system/lint-tools.sh --strict   # exit 1 on drift, for CI
#
# Plain mode exits 0 so the SessionStart hook never blocks a session.
# --strict is what makes canon-checks.yml able to gate on it.

set -u

STRICT=0
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    *) echo "lint-tools: unknown argument '$arg'" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$REPO_ROOT/system/_template/index.html"
SKIP_FILE="$REPO_ROOT/system/_template/.lint-skip"
WAIVER_FILE="$REPO_ROOT/system/_template/.lint-waivers"

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

# Read skip-list (slugs only, # comments stripped). A skipped slug is
# exempt from EVERY check — a blunt instrument, for tools mid-rewrite.
declare -A SKIP
if [[ -f "$SKIP_FILE" ]]; then
  while IFS= read -r line; do
    slug="${line%%#*}"
    slug="${slug// /}"
    [[ -z "$slug" ]] && continue
    SKIP["$slug"]=1
  done < "$SKIP_FILE"
fi

# Read waivers: one known-and-accepted drift per line, as
#   <slug>|<substring of the drift message>   # why
# Narrower than SKIP — the tool stays checked for everything else. Exists so
# --strict can gate on NEW drift while a tracked backlog is worked through.
# A waiver is a promise to come back, not a fix; keep the reason honest.
# =() not `declare -a`, and the difference is the whole bug. `declare -a X`
# sets the ARRAY ATTRIBUTE and creates nothing, so under `set -u` the very
# guard below — `${#WAIVE_SLUG[@]} == 0`, written to handle an empty waiver
# list — was itself an unbound-variable error.
#
# It had never fired because is_waived() is only called when a page drifts,
# and nothing had drifted since the check was written. The first drift found
# it: lint stopped after three tools and STILL EXITED 0, so --strict would
# have waved real drift through CI while reporting "clean". Found 22/08/2026
# by moving four admin consoles into directories, which brought them under
# the lint for the first time and turned up four stale auth-guard pins.
WAIVE_SLUG=(); WAIVE_MATCH=()
if [[ -f "$WAIVER_FILE" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    [[ -z "${line// /}" ]] && continue
    WAIVE_SLUG+=("$(echo "${line%%|*}" | tr -d ' ')")
    WAIVE_MATCH+=("$(echo "${line#*|}" | sed 's/^ *//; s/ *$//')")
  done < "$WAIVER_FILE"
fi

# is_waived <slug> <drift message> → 0 if an accepted exception covers it.
is_waived() {
  local slug="$1" msg="$2" i
  (( ${#WAIVE_SLUG[@]} == 0 )) && return 1
  for i in "${!WAIVE_SLUG[@]}"; do
    [[ "${WAIVE_SLUG[$i]}" == "$slug" ]] || continue
    [[ "$msg" == *"${WAIVE_MATCH[$i]}"* ]] && return 0
  done
  return 1
}

# loads_asset <file-regex> <page> → 0 if the page really LOADS the asset.
#
# Matches an href=/src= attribute, not a bare mention of the filename. Every
# page in the repo carries a boilerplate comment reading "nl-topbar.js adds
# these too, but a standalone page never loads it" — so a filename-only test
# says yes on pages that demonstrably do not load the file. That is not
# hypothetical: it is exactly what switched the standalone check off below.
loads_asset() {
  grep -qE "(href|src)=\"/system/$1" "$2"
}

# check_asset <file> <slug> <index> <canonical> → echoes drift line if any.
# Distinguishes three cases:
#   (a) not loaded at all          → drift: missing
#   (b) loaded without ?v=         → drift: missing cache-bust
#   (c) loaded with stale ?v=N     → drift: version mismatch
check_asset() {
  local file="$1" slug="$2" index="$3" canon="$4"
  local loaded versioned actual
  loaded=$(grep -oE "/system/$file" "$index" | head -1 || true)
  if [[ -z "$loaded" ]]; then
    echo "  $slug: missing $file"
    return
  fi
  # Anchor to the /system/ path so a version mentioned in a changelog
  # comment (e.g. "nl-utils.js?v=15") isn't mistaken for the live script tag.
  versioned=$(grep -oE "/system/$file\?v=[0-9]+" "$index" | head -1 || true)
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
waived_count=0
declare -a warnings
declare -a waived

cd "$REPO_ROOT" || exit 0

# Tool pages live at two depths: top-level (vacancies/index.html) and one
# level down (graphics/totw/index.html). Anything without auth-guard.js —
# embeds, asset index stubs — is skipped automatically by the grep below.
# Any path segment starting with _ is skipped (system/_template, _shared).
mapfile -t CANDIDATES < <(
  find . -mindepth 2 -maxdepth 3 -name index.html -not -path './.git/*' \
    -not -path './node_modules/*' -printf '%P\n' 2>/dev/null | sort
)

for index in "${CANDIDATES[@]}"; do
  slug="${index%/index.html}"
  case "/$slug/" in */_*) continue ;; esac
  [[ ! -f "$index" ]] && continue
  grep -q '/system/auth-guard\.js' "$index" || continue
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

  # No inline Apps Script URL — those belong in NL.endpoints (system/nl-utils.js),
  # so a deployment rotation is a one-line change, not a repo-wide hunt.
  if grep -q "script\.google\.com/macros" "$index"; then
    drift+=("  $slug: inline Apps Script URL — use NL.endpoints.gas")
  fi

  # No private fetch of the tools clubs-meta — gated tools read clubs via
  # NL.clubs.load()/NL.season (one shared, memoised fetch). The site-repo
  # clubs-meta (thenationalleague/site) is a different dataset and allowed.
  # dazn-vip is skipped: WIP overhaul, rejoins canon in its rebuild.
  if [[ "$slug" != "dazn-vip" ]]; then
    cm=$(grep -E "=[[:space:]]*['\"][^'\"]*clubs-meta\.json" "$index" | grep -v "thenationalleague/site" || true)
    [[ -n "$cm" ]] && drift+=("  $slug: direct clubs-meta URL — use NL.clubs.load()")
  fi

  # No <h1> in the page body REPEATING the tool title. nl-topbar.js already
  # renders that title from window.NL_TOOL.title, so such an <h1> duplicates
  # it — and the description paragraph that used to accompany it described
  # something the user was already looking at. The canonical template shipped
  # both until 30/07/2026, which is why this spread. A heading above a group
  # of controls belongs in the canon .section-head as an <h2>.
  #
  # Matched on the TITLE, not on <h1> as such, so a page that legitimately
  # shows a heading specimen (style-guide) or names something other than
  # itself is not flagged.
  wrap_line=$(grep -n 'id="pageWrap"' "$index" | head -1 | cut -d: -f1)
  tool_title=$(sed -n "s/.*title:[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" "$index" | head -1)
  if [[ -n "$wrap_line" && -n "$tool_title" ]]; then
    dup=$(awk -v start="$wrap_line" -v t="$tool_title" '
      NR <= start { next }
      /<h1/ { grab = 1 }
      grab {
        line = line " " $0
        if (line ~ /<\/h1>/) {
          txt = line
          sub(/.*<h1[^>]*>/, "", txt)
          sub(/<\/h1>.*/, "", txt)
          gsub(/<[^>]*>/, "", txt)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", txt)
          if (txt == t) { print NR; exit }
          grab = 0; line = ""
        }
      }' "$index")
    if [[ -n "$dup" ]]; then
      drift+=("  $slug: <h1> near line $dup repeats the tool title '$tool_title' — the topbar already shows it")
    fi
  fi

  # The stale colour mirror. 29 of its 72 primaries have drifted from
  # clubs-meta, so anything reading it renders wrong club colours.
  if grep -q 'graphics/_shared/clubs-data\.js' "$index"; then
    drift+=("  $slug: loads the stale clubs-data.js mirror — use NL.clubs / clubs-meta.json")
  fi

  # Split drift into live findings and accepted exceptions.
  live=()
  for d in "${drift[@]:-}"; do
    [[ -z "$d" ]] && continue
    if is_waived "$slug" "$d"; then
      waived_count=$((waived_count + 1))
      waived+=("$d")
    else
      live+=("$d")
    fi
  done

  if [[ ${#live[@]} -eq 0 ]]; then
    clean_count=$((clean_count + 1))
  else
    warn_count=$((warn_count + 1))
    for d in "${live[@]}"; do
      warnings+=("$d")
    done
  fi
done

# ── Standalone pages ────────────────────────────────────────────────────────
# Everything above walks pages that load auth-guard.js. That leaves the whole
# standalone family unchecked — the passcode tools, the club capability pages,
# the portal root — which is exactly the set an outside person sees. They carry
# no auth-guard and no topbar by design, but they DO load nl-brand.css, and a
# stale or missing ?v= there drifts as silently as it ever did in a tool. Found
# on 04/08/2026: club-directory/meta-reference.html had been loading the brand
# sheet with no ?v= at all, and nothing had ever said so.
#
# Embeds are deliberately out of scope. They are pasted into the Urban Zoo CMS
# on thenationalleague.org.uk, where the page belongs to that site's design.
standalone_warn=0
standalone_clean=0
standalone=()

while IFS= read -r page; do
  case "$page" in
    ./node_modules/*|./system/_template/*|./embeds/*|./lab/*|./decks/*|\
    ./system/brand-v3-mockups/*) continue ;;
  esac
  grep -q '<head' "$page" || continue
  # A page that really loads auth-guard is a tool and was checked above. This
  # used to test for the string "nl-topbar.js" anywhere in the file, which the
  # boilerplate favicon comment puts on every standalone page — so all 17 of
  # them skipped BOTH loops and were checked by nothing at all. The comment
  # saying "a standalone page never loads it" was switching off the check for
  # the page carrying it.
  loads_asset 'auth-guard\.js' "$page" && continue
  loads_asset 'nl-brand\.css' "$page" || continue   # no brand sheet, nothing to version

  short="${page#./}"
  page_drift=()

  # Check every canon file the page actually loads. Absence is fine and
  # expected — a standalone page has no topbar and no guard by design — but a
  # file that IS loaded has to carry the canonical ?v=. Only nl-brand.css was
  # checked before, so a public page on a stale nl-utils.js went unreported.
  for pair in "nl-brand.css:$CANON_BRAND" "nl-utils.js:$CANON_UTILS" \
              "nl-topbar.js:$CANON_TOPBAR" "auth-guard.js:$CANON_GUARD"; do
    f="${pair%%:*}"; canon="${pair##*:}"
    loads_asset "${f/./\\.}" "$page" || continue
    if grep -q "$f?v=$canon" "$page"; then
      continue
    elif grep -qE "$f\?v=[0-9]+" "$page"; then
      got=$(grep -oE "$f\?v=[0-9]+" "$page" | head -1 | sed 's/.*v=//')
      page_drift+=("  $short: $f?v=$got — canonical is ?v=$canon")
    else
      page_drift+=("  $short: loads $f with no ?v= — add ?v=$canon")
    fi
  done

  if [[ ${#page_drift[@]} -eq 0 ]]; then
    standalone_clean=$((standalone_clean + 1))
  else
    standalone_warn=$((standalone_warn + 1))
    for d in "${page_drift[@]}"; do standalone+=("$d"); done
  fi
done < <(find . -name '*.html' -not -path '*/node_modules/*' | sort)

echo "=== Tool wiring lint ==="
echo "Canonical: nl-brand.css?v=$CANON_BRAND  nl-utils.js?v=$CANON_UTILS  nl-topbar.js?v=$CANON_TOPBAR  auth-guard.js?v=$CANON_GUARD"
echo
if [[ "${warnings+x}" == "x" && ${#warnings[@]} -gt 0 ]]; then
  echo "Drift detected in $warn_count tool$( [[ $warn_count -ne 1 ]] && echo s ):"
  for w in "${warnings[@]}"; do
    echo "$w"
  done
  echo
fi
if [[ $waived_count -gt 0 ]]; then
  echo "Accepted exceptions ($waived_count) — tracked in system/_template/.lint-waivers:"
  for w in "${waived[@]}"; do
    echo "$w"
  done
  echo
fi
if [[ $standalone_warn -gt 0 ]]; then
  echo "Standalone pages out of sync ($standalone_warn):"
  for w in "${standalone[@]}"; do
    echo "$w"
  done
  echo
fi
echo "$clean_count tool$( [[ $clean_count -ne 1 ]] && echo s ) clean, \
$standalone_clean standalone page$( [[ $standalone_clean -ne 1 ]] && echo s ) clean."

# Canon class overrides — the rule CONSOLIDATION.md's "Future-proofing" section
# listed in July and which was never built. Everything above checks WIRING (does
# the page load canon, at the right version). This checks whether the page then
# quietly overrides what it just loaded, which is the larger source of drift:
# 153 instances across 42 pages when it was first run.
# Runs as a separate script so the same check is callable from CI and tests.
override_rc=0
if [[ -f "$REPO_ROOT/scripts/check-canon-overrides.js" ]] && command -v node >/dev/null 2>&1; then
  echo
  if [[ $STRICT -eq 1 ]]; then
    node "$REPO_ROOT/scripts/check-canon-overrides.js" --strict || override_rc=1
  else
    node "$REPO_ROOT/scripts/check-canon-overrides.js"
  fi
fi

if [[ $STRICT -eq 1 && $override_rc -ne 0 ]]; then
  exit 1
fi

if [[ $STRICT -eq 1 && $((warn_count + standalone_warn)) -gt 0 ]]; then
  echo
  echo "lint-tools: --strict, so failing on $warn_count drifted tool$( [[ $warn_count -ne 1 ]] && echo s )" >&2
  echo "            and $standalone_warn drifted standalone page$( [[ $standalone_warn -ne 1 ]] && echo s )." >&2
  exit 1
fi
exit 0
