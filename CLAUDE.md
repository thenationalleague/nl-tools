# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

NL Tools — a static GitHub Pages site (`thenationalleague/tools`, served under `/tools/`) that hosts the National League's internal staff/club portal plus a family of self-contained tools (vacancies, tasks, team-of-the-week, attendance, holiday-lieu, claudio, dazn-vip, etc.) and a separate family of fan-facing embed widgets that get pasted into the Urban Zoo CMS on `thenationalleague.org.uk`.

There is **no build step** for the site. HTML/CSS/JS is served as-is from the repo. The only Node code is in `scripts/` and `.github/workflows/` (article-index and GA pipelines).

## Common commands

```bash
# Drift checker — also runs automatically on every Claude Code SessionStart
bash system/lint-tools.sh

# Scaffold a new tool (preferred way — uses the canonical template)
# From Claude Code: /new-tool <slug>

# Node pipelines (run by GitHub Actions, but runnable locally too)
npm install
npm run rebuild-index       # node scripts/rebuild-index.js — builds assets/data/articles-index.json from NL CMS
npm run fetch-ga-metrics    # node scripts/fetch-ga-metrics.js — GA4 Data API, writes assets/data/ga-metrics.json
```

No test framework. No lint config beyond `system/lint-tools.sh`. Verification of UI changes is manual (open the page in a browser).

## Branching

Active dev branch for this session: `claude/add-claude-documentation-KmUOK`. PRs land on `main`; pushing to `main` directly is not done.

## The system/ canon and the wiring contract

Every gated tool's `index.html` has a near-identical `<head>`. The source of truth for that head is `system/_template/index.html`. Four files in `system/` are shared by every tool and **cache-busted with `?v=N`**:

| File                 | Current `?v=` | Role                                                              |
|----------------------|---------------|-------------------------------------------------------------------|
| `nl-brand.css`       | `?v=14`       | Brand tokens, components, layout. Tools must use tokens not hex.  |
| `nl-utils.js`        | `?v=7`        | `window.NL.*` helpers: `toast`, `ensureAuth`, `formatDate`, `escHtml`, `writeAudit`, `installAuditHook`, `icon`. |
| `nl-topbar.js`       | `?v=7`        | Renders `#nlTopbar` from `window.NL_TOOL`. Also injects PWA/favicon tags. |
| `auth-guard.js`      | `?v=8`        | Gates `#pageWrap`. Verifies live Firebase Auth, re-reads RTDB user + tool registry, then reveals page and fires `nlAuthReady(session)`. |

`_headers` (at repo root) sends `Cache-Control: no-cache, must-revalidate` for `/tools/system/*` so a new deploy of these files takes effect immediately — but the `?v=N` query is the **belt-and-braces** mechanism. The canonical versions live in `system/_template/index.html`; `lint-tools.sh` reads them from there and reports any tool whose head drifts (stale `?v=`, missing script, script below `</head>`, missing `window.NL_TOOL`/`NL_TOOL_KEY`/`#pageWrap`/`nlAuthReady`, or missing Firebase compat SDK when `firebase.initializeApp` is called).

**Do not bump a `?v=` in one tool only.** Bumping means "I changed the canonical file" — bump the template + every tool in lockstep, in one commit. Lint will catch a partial bump.

## The auth + RTDB contract every gated tool follows

Firebase project: `nl-tools` (RTDB `nl-tools-default-rtdb`, region `europe-west1`). All gated tools use compat SDK 10.12.0 (`firebase-app-compat`, `firebase-auth-compat`, `firebase-database-compat`).

Every tool page declares two globals before `auth-guard.js` runs:

```js
window.NL_TOOL = { title: 'Vacancies', toolKey: 'ops-vacancies' };
var NL_TOOL_KEY = 'ops-vacancies';
```

`toolKey` is `<category>-<slug>` where `<category>` is one of `staff`, `ops`, `media`. The same key indexes three things:

1. RTDB `tools/<toolKey>` — registration record (label, role defaults).
2. RTDB `app-data/<toolKey>/...` — that tool's owned data.
3. `system/auth-guard.js` access registry — which roles can open the page.

`auth-guard.js` runs on every page load (v6.0+ treats `sessionStorage` as cache only and always re-verifies Firebase Auth + re-reads `users/<uid>` and `tools/<toolKey>`). Per-user tool entries are strings (`"hidden"` | `"off"` | `"access"` | `"admin"`); legacy `{access:true, admin:true}` objects are still accepted. `superadmin` is always granted. With no per-user entry, it falls back to `tools/<toolKey>/defaults[<role>]` (bare role key preferred, compound `nl-<role>` accepted).

`nlAuthReady(session)` fires **after** the live auth token is confirmed. Do not read RTDB before this fires. The template wires a `window.TOOL.boot(session)` pattern that handles the case where `auth-guard` fired before the app script loaded (`_toolDeferredSession`).

For async flows that need a live auth token mid-flight, use `NL.ensureAuth().then(...)` — it waits for `firebase.auth().currentUser` to be populated.

`NL.installAuditHook()` proxies `firebase.database().ref(...).set/update/push/remove/transaction` so every write is recorded under `admin/audit/<key>`. Paths under `admin/audit*`, `presence/`, and `.info/` are skipped to avoid loops. Auth-guard auto-installs this; `NL.writeAudit('action', detail)` is the manual entry point and suppresses the auto-hook for 500ms so the same write only logs once.

## When you add a new tool

Use the `/new-tool <slug>` skill. It copies `system/_template/`, swaps the five placeholders, and runs the lint. The skill **does not** wire the tool into the system — three follow-ups remain and the user owns the decisions:

1. **Portal card** in `portal/index.html` so the tool is discoverable.
2. **`system/auth-guard.js` registry** — add the toolKey or the role defaults. Without this, the page denies for everyone.
3. **RTDB rules** for `app-data/<toolKey>/...` (and any tool-specific paths). Some tools keep their own `<slug>.rules.json` (see `dazn-vip/dazn-vip.rules.json`), some live in the central rules.

The new tool's `index.html` must keep the canonical `?v=N` values from the template — don't invent new ones.

## Two families of frontend, do not confuse them

- **Gated staff/club tools** — top-level dirs with `index.html` referencing `/tools/system/auth-guard.js`. Behind Firebase Auth, use the shared canon. Listed by `lint-tools.sh`.
- **Fan-facing embeds** — `embeds/*.html` (score-predictor, MOTM, vidiprinter, transfer-centre, live-blog, results-ticker, match-centre). Pasted into the Urban Zoo CMS. The CMS strips `<script src=...>` tags, so Firebase has to be loaded dynamically via `document.createElement('script')` with `.onload` chaining. Inline `<style>`, `<link>`, inline `<script>` survive. See `embeds/widget-handover.md` for the invariants — copy `score-predictor.html` as the starting point for any new embed. These do **not** use `auth-guard.js` and are out of scope for `lint-tools.sh`.

`widgets/*.js` are a third bucket: standalone JS widgets (news ticker, club-news feed, transfers ticker, results ticker) embedded on the public site.

## Data pipelines (GitHub Actions)

- `.github/workflows/rebuild-index.yml` — daily 03:00 UTC. Runs `fetch-ga-metrics.js` + `fetch-ga-hourly.js` + `rebuild-index.js`. Commits to `assets/data/articles-index.json`, `ga-metrics.json`, `ga-hourly.json`, `ga-hourly-archive.json`. Authenticates to GCP via Workload Identity Federation (no JSON key).
- `.github/workflows/build-club-news.yml` — every :15 and :45 of the hour. Python script (`build-club-news.py`) scrapes club news; commits `assets/data/club-news.json` and `club-news-failures.json`. Concurrency-guarded with `cancel-in-progress`.
- `.github/workflows/backfill-ga-archive.yml` — one-shot/manual backfill into `ga-hourly-archive.json`.

Both index-rebuild and club-news jobs handle concurrent runs by `git fetch origin main` + rebase before retrying push (up to 3 attempts).

## Conventions worth knowing

- **Brand tokens, not hex.** `var(--primary)` (`#9e0000`), `var(--navy)`, `var(--red)`/`--green`/`--amber`/`--info`, `var(--text-muted)`. Tool-internal identity palettes (e.g. claudio personas, tasks projects, attendance tiers) are the deliberate exception — comment them as such. The brand CSS preamble (top of `nl-brand.css`) lists where this exception applies.
- **Scripts in `<head>`.** `auth-guard.js` must sit above `</head>`. Body-bottom placement breaks the gate timing and lint flags it.
- **`#pageWrap` is hidden by default** (rule in `nl-brand.css`). Auth-guard sets `style.display = 'block'` to reveal — never clear with `''`, that re-triggers the brand rule.
- **`window.NL_TOOL` and `var NL_TOOL_KEY` must stay in sync.** Topbar reads the former, auth-guard reads the latter.
- **Each tool keeps its own `NL_CHANGELOG`** array near the top of `index.html`, plus a date-stamped block-comment changelog in the file header. Bump version + add entry when you edit a tool.
- **Don't `git add -A`.** Per session policy, stage files by name.

## Files to look at first when something is mysterious

- A tool denies for everyone or silently redirects to the portal → `system/auth-guard.js` (`checkAccess`) + the user's `tools/<toolKey>` entry + `tools/<toolKey>/defaults` in RTDB.
- `PERMISSION_DENIED` on RTDB read despite being signed in → wrap the read in `NL.ensureAuth().then(...)` (the v6.0 guard fix handles the common case, but async boot flows can still race).
- "It works locally but not on the deployed site" → `_headers` should be sending no-cache for `/tools/system/*`; if a stale `?v=` is loading, `lint-tools.sh` will say which tool drifted.
- Audit feed missing entries → `NL.installAuditHook` skip list, or a manual `NL.writeAudit` is suppressing the auto-hook for 500ms.
- Tool head looks "right" but something's off → run `bash system/lint-tools.sh` and trust it over visual inspection.
