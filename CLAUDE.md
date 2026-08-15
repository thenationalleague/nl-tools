# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Data handling — non-negotiable

This repository is PUBLIC. Everything committed here is world-readable,
permanently, including in git history after deletion.

- Never commit a file containing a person's name, email address, phone
  number, address, or any other personal data. No exceptions for "seed"
  files, "export" files, test fixtures, or temporary data.
- Personal and club-confidential data lives in Firebase RTDB and reaches the
  browser at runtime behind auth-guard, gated by rules. The repo holds code
  and assets only.
- If a task involves a data file — a CSV, a JSON export, a spreadsheet dump —
  stop and ask where it should live before writing it anywhere. Do not infer
  that being handed a file means it should be committed.
- If a tool needs a flat data file at runtime, generate it at deploy time from
  RTDB via an Action. Do not commit the generated output.

## Derive from the canon, never from a sibling tool

A new tool is built from `system/_template/` and the canon. It is **not** built
by copying the tool next door, and its comments do not describe it as "the same
pattern as /footage/club/" or "identical to X".

This is not style. Three tools were retired on 15/08/2026 and each one left
dangling references behind it in tools that survived — `programme/admin` and
`uw-promo/README` both explained themselves by pointing at `/footage/club/`,
which no longer exists. A tool defined by reference to another tool is only as
durable as that other tool, and the thing being pointed at is usually one
implementation of a canon idea rather than the idea itself.

So: say what a thing does, or name the canon it uses (`NL.codeGate`,
`.nl-idbar`, `auth-guard.js`). If two tools genuinely need the same behaviour,
that is the signal to promote it to canon — see the promotion rule below —
not to describe one in terms of the other.

Pointing at another tool as a **worked example** is fine, and useful. Defining
your tool as a copy of it is not.

## Reuse-first (read this before writing any code)

Every tool in this repo is built on a **shared canon**: `window.NL.*` helpers in
`system/nl-utils.js` and brand tokens/components in `system/nl-brand.css`. Tools
**reuse** the canon — they do **not** hand-roll their own versions of what it
already provides. Before you write a helper, a dialog, a picker, a date/time
format, a clipboard/download routine, or a colour, **stop and check the canon
first** — skim `system/nl-utils.js` and `system/nl-brand.css`, and read the
relevant sections below. If the canon already does it, use it; if it almost does
it, extend the canon (in lockstep — see the `?v=` rules), don't fork a local copy.

Concretely, do NOT hand-roll — the canon already has these:
- Club selection → `NL.clubPicker`; club data/crests → `NL.clubs.*`
- Dialogs → `NL.modal` / `NL.confirm` / `NL.prompt` / `NL.alert` (never native `confirm`/`alert`/`prompt`)
- Notifications → `NL.toast`; clipboard → `NL.copy`; downloads → `NL.download`; CSV → `NL.csv`
- Dates → `NL.parseDate` / `formatDate` / `formatDateShort` / `formatDateTime` / `timeAgo`
- Escaping → `NL.escHtml` / `NL.escJ`; roles → `NL.roles.*` / `NL.isClubUser`
- Auth/session → `NL.ensureAuth`, `nlAuthReady`; audit → `NL.writeAudit`
- **Colours/spacing/type → brand tokens (`var(--primary)`, `--navy`, `--text-*`, …), never raw hex**

New tools: scaffold with `/new-tool <slug>` (it copies the canonical template),
keep the canonical `?v=` wiring untouched, and run `bash system/lint-tools.sh`
before you're done. When in doubt, the Style Guide tool (`/style-guide/`)
is the living visual reference for what's already a token/component.

### The other half: grow the canon deliberately

Reuse-first has a corollary — **actively spot things that should become shared
standards, and propose promoting them.** If you're writing something a second
tool would plausibly want, or you notice the same pattern hand-rolled in 2+
tools, don't leave a one-off: flag it as a canon candidate and (with the user's
nod) promote it to the right layer, in lockstep:

- **Reusable behaviour / helper / component** → `system/nl-utils.js` (`NL.*`),
  the versioned **code contract**. Bump `?v=` across the template + every head
  together; ship the helper with a test.
- **Colour / spacing / type / CSS component** → `system/nl-brand.css`, the
  **design system**. Same lockstep `?v=` rule; update the Style Guide so it
  stays the living reference. (nl-brand.css already carries the heuristic —
  "would another tool plausibly want this?" — at the top of the file.)
- **A shared data shape** (e.g. club fields) → the `clubs-meta.json` **data
  schema** + its validator/snapshot. Keep these three layers distinct: `NL.*`
  is an API contract, brand tokens are a design system, `clubs-meta` is a data
  schema — don't conflate them.

Rule of thumb: **first use stays tool-local; the second time you'd write it,
promote it.** Surface the opportunity even if you don't act on it — a one-line
"this looks like a canon candidate" in your summary is enough to get it tracked.
Genuine one-offs stay local (see the policy block atop `nl-brand.css`); the goal
is deliberate promotion, not hoarding every snippet into the canon.

## What this repo is

NL Tools — a static GitHub Pages site (`thenationalleague/tools`, served at the root of the custom domain `https://nl.tools/` — the `CNAME` file at repo root binds the domain, and the old `thenationalleague.github.io/tools/*` URLs 301-redirect there) that hosts the National League's internal staff/club portal plus a family of self-contained tools (vacancies, attendance, holiday-lieu, claudio, dazn-vip, style-guide, etc.) and a separate family of fan-facing embed widgets that get pasted into the Urban Zoo CMS on `thenationalleague.org.uk`. (chase-hq existed until v2.19 of the brand sweep and was removed pending a structural rewrite.)

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

```bash
npm test                    # node --test tests/*.test.mjs — 260 tests, gates every PR
bash system/lint-tools.sh --strict   # what CI runs; exit 1 on drift
```

There **is** a test suite: 17 files under `tests/`, run by `canon-checks.yml` on
every push and PR. (This section said "No test framework" until 15/08/2026,
which is the kind of wrong that stops someone adding a test.) `tests/canon.test.mjs`
covers the `NL.*` API thoroughly; `tests/brand-canon.test.mjs` covers the CSS
canon with four tests about one button variant, so the design system is
effectively untested — that gap is real and worth closing.

Verification of UI changes is still manual (open the page in a browser). There
is no page-render test, so a converted page that silently breaks will not be
caught by CI.

## Plans and decisions — read before proposing one

These exist and are **not** linked from anywhere a session would find them,
which is why work gets re-planned from scratch. Check here first.

| Document | What it decides |
|---|---|
| `system/CONSOLIDATION.md` | The master plan. Every tool draws from one shared place. Seven workstreams, safety rails, order of attack. Drafted 12/07/2026 from a five-way audit + external review. |
| `system/gas-to-functions-migration.md` | **Locked decision**: retire the public Apps Script web app entirely; Firebase for everything, one private GAS email shim. |
| `system/tool-status-and-access.md` | Which tools are live vs parked, and the per-role access model for each. |
| `system/staff-club-audience-plan.md` | The staff/club audience gate. |
| `system/roles-and-access-plan.md` | Role model. Nothing links to it. |
| `system/brand-v3-scale-plan.md` | Parked type/scale pass. |
| `system/rtdb/README.md` | The RTDB snapshot contract — which files are deployed vs reference. |
| `system/retired/README.md` | **Tools that have been deleted, and why.** One file each, recording the concept and the settled decisions so a rebuild starts from the answered questions. Read before proposing to build something that already existed once. |

## Branching

PRs land on `main`; pushing to `main` directly is not done. Each session works on
its own `claude/*` branch — the branch name is given in the session prompt, not
here. (A specific branch name lived in this section and was months stale.)

## The system/ canon and the wiring contract

Every gated tool's `index.html` has a near-identical `<head>`. The source of truth for that head is `system/_template/index.html`. Four files in `system/` are shared by every tool and **cache-busted with `?v=N`**:

**Do not write the current `?v=` numbers here.** They lived in this table until
15/08/2026 and had already rotted — it said `nl-brand.css ?v=32` while the real
canonical was `?v=36`, four versions behind, in the one file every session is
guaranteed to read. The live numbers are in `system/_template/index.html`;
`lint-tools.sh` reads them from there and prints them at the top of every run,
which is also the top of every Claude session. Read them there, never from here.

| File                 | Role                                                              |
|----------------------|-------------------------------------------------------------------|
| `nl-brand.css`       | Brand tokens, components, layout. Tools must use tokens not hex.  |
| `nl-utils.js`        | `window.NL.*` helpers: `toast`, `ensureAuth`, `formatDate`/`formatDateShort`/`formatDateTime`/`timeAgo`, `parseDate` (string/Date/epoch), `escHtml`, `writeAudit`, `installAuditHook`, `icon`, `endpoints`, `clubs` (incl. `crestUrl(name[,'thumb'\|'medium'])`, `wireCrestImg`, `byOpta`, `guests`/`guestByName` for non-member cup sides), `clubPicker` (incl. `extraClubs`/`setExtraClubs`, `crestName`), `roles` (incl. `norm`, `label`, `realm`), `isClubUser`, `canClubEdit`, plus identity-data exports `mapStyle.drive`, `positionBands`, `projColours` (canvas/data callers). |
| `nl-topbar.js`       | Renders `#nlTopbar` from `window.NL_TOOL`. Also injects PWA/favicon tags. |
| `auth-guard.js`      | Gates `#pageWrap`. Verifies live Firebase Auth, re-reads RTDB user + tool registry, then reveals page and fires `nlAuthReady(session)`. |

`_headers` (at repo root) sends `Cache-Control: no-cache, must-revalidate` for `/system/*` so a new deploy of these files takes effect immediately — but the `?v=N` query is the **belt-and-braces** mechanism. The canonical versions live in `system/_template/index.html`; `lint-tools.sh` reads them from there and reports any tool whose head drifts (stale `?v=`, missing script, script below `</head>`, missing `window.NL_TOOL`/`NL_TOOL_KEY`/`#pageWrap`/`nlAuthReady`, or missing Firebase compat SDK when `firebase.initializeApp` is called).

`lint-tools.sh` covers tool pages at **both depths** — top-level (`vacancies/`) and one level down (`graphics/totw/`). It runs plain for the SessionStart hook (always exit 0) and `--strict` in CI (exit 1 on drift). Known, accepted drift lives in `system/_template/.lint-waivers` as `<slug>|<message substring> # why`; entries are printed on every run so they can't be quietly forgotten. A waiver is a promise to come back, not a fix.

**Do not bump a `?v=` in one tool only.** Bumping means "I changed the canonical file" — bump the template + every tool in lockstep, in one commit. Lint will catch a partial bump.

## The auth + RTDB contract every gated tool follows

Firebase project: `nl-tools` (RTDB `nl-tools-default-rtdb`, region `europe-west1`). All gated tools use compat SDK 10.12.0 (`firebase-app-compat`, `firebase-auth-compat`, `firebase-database-compat`).

Every tool page declares two globals before `auth-guard.js` runs:

```js
window.NL_TOOL = { title: 'Vacancies', toolKey: 'ops-vacancies' };
var NL_TOOL_KEY = 'ops-vacancies';
```

`toolKey` is `<category>-<slug>` where `<category>` is one of `staff`, `ops`, `media`. The same key indexes three things:

1. RTDB `tools/<toolKey>` — registration record (label, url, icon, role `defaults`). This single record drives BOTH the portal card AND auth-guard's access fallback — there is no separate registry in code. In-repo snapshot: `system/rtdb/tools-registry.snapshot.json`.
2. RTDB `app-data/<toolKey>/...` — that tool's owned data.
3. RTDB security rules — the full deployed document is snapshotted at `system/rtdb/rules.snapshot.json`.

`auth-guard.js` runs on every page load (v6.0+ treats `sessionStorage` as cache only and always re-verifies Firebase Auth + re-reads `users/<uid>` and `tools/<toolKey>`). Per-user tool entries are strings (`"off"` | `"access"` | `"admin"`); legacy `{access:true, admin:true}` objects and the retired `"hidden"` value are still accepted and read as `"off"`. As of auth-guard v6.1 the level model is **three states** — `off` (no access, invisible, silent redirect), `access`, `admin`; the old `hidden`/`off` split and the per-tool request-access flow are gone (admins grant access directly in the portal). `superadmin` is always granted. With no per-user entry, it falls back to `tools/<toolKey>/defaults[<role>]` (bare role key preferred, compound `nl-<role>` accepted); a role absent from `defaults` (e.g. `third-party`) resolves to `off`.

`nlAuthReady(session)` fires **after** the live auth token is confirmed. Do not read RTDB before this fires. The template wires a `window.TOOL.boot(session)` pattern that handles the case where `auth-guard` fired before the app script loaded (`_toolDeferredSession`).

For async flows that need a live auth token mid-flight, use `NL.ensureAuth().then(...)` — it waits for `firebase.auth().currentUser` to be populated.

`NL.installAuditHook()` proxies `firebase.database().ref(...).set/update/push/remove/transaction` so every write is recorded under `admin/audit/<key>`. Paths under `admin/audit*`, `presence/`, and `.info/` are skipped to avoid loops. Auth-guard auto-installs this; `NL.writeAudit('action', detail)` is the manual entry point and suppresses the auto-hook for 500ms so the same write only logs once.

## When you add a new tool

Use the `/new-tool <slug>` skill. It copies `system/_template/`, swaps the five placeholders, and runs the lint. The skill **does not** wire the tool into the system — two follow-ups remain, both RTDB config:

1. **RTDB `tools/<toolKey>` record** (label, url, icon, department, `defaults` per role). One record = portal card + auth-guard access. Without it the page is superadmin-only and invisible on the portal. **Check `system/rtdb/tools-registry.snapshot.json` first — the record may already exist.** When adding one, update that snapshot in the same PR and tell the user to paste it into RTDB `tools/`.
2. **RTDB rules** for `app-data/<toolKey>/...`. Edit the full document at `system/rtdb/rules.snapshot.json` in the PR. That file **is** the deployed rules — see Deployment below; it ships when someone runs the workflow, so say so in the PR body. Do not extend the historical partial file `dazn-vip/dazn-vip.rules.json`.

**Never assert that live RTDB *data* or the tools registry is missing or wrong based only on repo code — sessions cannot read the live database. Check the `system/rtdb/` snapshots, and if the answer matters, ask the user to verify in the console.** Rules are the exception: `rules.snapshot.json` is deployed from this repo, so it is authoritative rather than a guess. (See `system/rtdb/README.md` for the contract.)

The new tool's `index.html` must keep the canonical `?v=N` values from the template — don't invent new ones.

## Two families of frontend, do not confuse them

- **Gated staff/club tools** — dirs with `index.html` referencing `/system/auth-guard.js`, either top-level (`vacancies/`) or one level down (`graphics/totw/`). Behind Firebase Auth, use the shared canon. Listed by `lint-tools.sh`.
- **Fan-facing embeds** — `embeds/*.html` (score-predictor, MOTM, vidiprinter, results-ticker, match-centre; plus transfer-centre and live-blog, **parked** — front-ends kept, Google Sheet backends dropped, see `system/retired/live-blog-and-transfer-centre.md`). Pasted into the Urban Zoo CMS. The CMS strips `<script src=...>` tags, so Firebase has to be loaded dynamically via `document.createElement('script')` with `.onload` chaining. Inline `<style>`, `<link>`, inline `<script>` survive. See `embeds/widget-handover.md` for the invariants — copy `score-predictor.html` as the starting point for any new embed. These do **not** use `auth-guard.js` and are out of scope for `lint-tools.sh`.

`widgets/*.js` are a third bucket: standalone JS widgets (news ticker, transfers ticker, results ticker) embedded on the public site.

## Deployment — nothing needs a terminal

**Richard has no CLI access.** Any plan that ends "then run `firebase deploy`"
is undeliverable, and this was nearly a blocker for the Club Directory
passcode gate before anyone checked. Everything ships through GitHub Actions,
which he can run from a browser:

| What | Workflow | Trigger |
|---|---|---|
| **Static site** (HTML/CSS/JS) | none — GitHub Pages | merge to `main`. There is no build step. |
| **Cloud Functions** | `deploy-functions.yml` | **automatic** on any push to `main` touching `functions/**`, or Run workflow |
| **RTDB rules** | `deploy-rtdb-rules.yml` | **manual only.** Actions → Run workflow → type `publish` |
| **Apps Script** (`gas/`) | `deploy-gas.yml` | **manual only.** Actions → Run workflow → type `publish` |

Two things worth knowing, because both have already caught someone out:

- `deploy-functions.yml` runs `firebase deploy --only functions`, which deploys
  **every** function in the directory, not the one the workflow is named after.
  It was called `deploy-footage-proxy.yml` until 04/08/2026 and had been
  deploying all four functions the whole time.
- The rules workflow is deliberately **not** on push. Rules govern every tool,
  and landing an unrelated PR must not be able to lock 72 clubs out of their
  own data as a side effect of a merge.

So: a PR that adds a function needs no follow-up, a PR that changes rules needs
one button press, and neither needs a machine. Say which in the PR body.

`gas/` became two-way on 15/08/2026. `sync-gas.yml` pulls the live Apps Script
project daily and commits on drift; `deploy-gas.yml` pushes the repo back and
redeploys the **existing** Web App, so the `/exec` URL every page calls does not
change. Edit the `.js` files in `gas/`, not the Apps Script editor. The deploy
refuses to run if live holds anything the repo has not seen, so it cannot
overwrite someone's editor change — if it stops you, run the sync first.

RTDB *data* (the `tools/` registry, seed records) still has no deploy path and
is pasted into the console by hand.

## Data pipelines (GitHub Actions)

- `.github/workflows/rebuild-index.yml` — daily 03:00 UTC. Runs `fetch-ga-metrics.js` + `fetch-ga-hourly.js` + `rebuild-index.js`. Commits to `assets/data/articles-index.json`, `ga-metrics.json`, `ga-hourly.json`, `ga-hourly-archive.json`. Authenticates to GCP via Workload Identity Federation (no JSON key).

The index-rebuild job handles concurrent runs by `git fetch origin main` + rebase before retrying push (up to 3 attempts).

The club-news pipeline (`build-club-news.yml`, its debug twin, the two
`widgets/club-news-*.js` consumers and `assets/data/club-news.json`) was
removed on 05/08/2026. The workflow had been disabled since 20/04/2026, so the
committed JSON — and therefore anything embedding those widgets — had been
serving April's headlines ever since. Deleted rather than revived: nothing was
asking for it back in three and a half months. Same date, `backfill-ga-archive.yml`
and `scripts/backfill-ga-hourly-archive.js` went too, having run once in May
2026 to seed the archive. Recover either from git history if a need reappears.

## Conventions worth knowing

- **Brand tokens, not hex.** `var(--primary)` (`#9e0000`), `var(--navy)`, `var(--red)`/`--green`/`--amber`/`--blue`/`--purple`, `var(--text-muted)`. Solid shade ladders `--primary-50/100/.../900` and `--navy-50/.../900` for hover states, idle borders, and anywhere you would have reached for an rgba() overlay — **the brand intentionally has no rgba-overlay tokens**, use the ladder. (As of v2.21 the retired aliases `--info`, `--info-light`, `--primary-dim`, `--navy-mid`, `--navy-light` no longer resolve — use `--blue` / `--blue-light` / `--primary-600` / `--navy-600` / `--navy-300` directly.) Identity palettes that a second tool might plausibly want now live in canon too: `--proj-1…--proj-8` (project identity — 1–6 alias `--navy`/`--primary`/`--green`/`--amber`/`--purple`/`--blue` directly, 7–8 are distinct slate shades; mirrored as `NL.projColours`), `--cal-*` (calendar event types), `--road-sign-*` (UK road signs), `--pos-*` (NL competition position bands, mirrored as `NL.positionBands` for canvas exports). The Style Guide tool (`/style-guide/`, superadmin only) is the canonical visual reference — open it when wondering "is X already a token?". Genuine one-off identity palettes still stay tool-local (claudio personas, attendance comp tiers, GA channel palette, club crest LUT) — see the policy block at the top of `nl-brand.css`.
- **Never repeat the tool title in the page.** `nl-topbar.js` already renders `window.NL_TOOL.title`, so a page-level `<h1>` of the tool's own name duplicates it — and a description paragraph under it describes something the user is already looking at. The template shipped both until 30/07/2026, which is why it spread to several tools; lint now fails any `<h1>` whose text equals the tool title. A heading above a group of controls belongs in `.section-head` as an `<h2>`.
- **No waffle.** The default failure of generated copy is explaining rather than asking. A line of user-facing text earns its place only if it **changes what the user does**, **warns of a consequence**, or **answers a question they would otherwise have to ask**. Cut it if it: restates a label, placeholder, heading or control already on screen; explains the product before asking the question; justifies or sells the ask ("it genuinely shapes what we cover"); reassures about something nobody was worried about ("No problem", "Nothing else to do for now"); is defensive boilerplate nobody requested (unasked-for privacy and data notices); or is a second sentence doing the first one's job. Two instructions for one action read as two actions. When in doubt, delete it and see whether the page still works — it usually does. `/dewaffle <path>` audits a page against this and proposes the cuts.
- **`#pageWrap` is hidden by default** (rule in `nl-brand.css`). Auth-guard sets `style.display = 'block'` to reveal — never clear with `''`, that re-triggers the brand rule.
- **`window.NL_TOOL` and `var NL_TOOL_KEY` must stay in sync.** Topbar reads the former, auth-guard reads the latter.
- **Each tool keeps its own `NL_CHANGELOG`** array near the top of `index.html`, plus a date-stamped block-comment changelog in the file header. Bump version + add entry when you edit a tool.
- **Don't `git add -A`.** Per session policy, stage files by name.

## Files to look at first when something is mysterious

- A tool denies for everyone or silently redirects to the portal → `system/auth-guard.js` (`checkAccess`) + the user's `tools/<toolKey>` entry + `tools/<toolKey>/defaults` in RTDB.
- `PERMISSION_DENIED` on RTDB read despite being signed in → wrap the read in `NL.ensureAuth().then(...)` (the v6.0 guard fix handles the common case, but async boot flows can still race).
- "It works locally but not on the deployed site" → `_headers` should be sending no-cache for `/system/*`; if a stale `?v=` is loading, `lint-tools.sh` will say which tool drifted.
- Audit feed missing entries → `NL.installAuditHook` skip list, or a manual `NL.writeAudit` is suppressing the auto-hook for 500ms.
- Tool head looks "right" but something's off → run `bash system/lint-tools.sh` and trust it over visual inspection.
