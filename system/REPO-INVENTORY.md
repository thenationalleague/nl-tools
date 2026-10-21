# Repo inventory — what is actually in here

*A whole-repo census taken 04/08/2026. Companion to
`system/tool-status-and-access.md` (which is the signed-off **status/access**
doc for the portal tools) — this one is wider: it covers everything with a page
in the repo, including the public forms, the one-offs, the embeds and the
assets, and says which bucket each thing sits in.*

**Read the two together:** `tool-status-and-access.md` answers *"who can use
this and how does it behave"* for the portal tools. This file answers *"what
exists at all, and is it still a thing"*.

---

## The headline numbers

| Bucket | Count | What it is |
|---|---|---|
| **Gated portal tools — registered & live** | **17** | Have a `tools/<toolKey>` record; appear on the portal |
| **Gated tools — parked** | **6 in repo** (+2 records with no code) | Code present, no registry record → superadmin-only, invisible |
| **Public / link-gated pages** | **~18** | No `auth-guard.js`. Club forms, passcode libraries, partner pages |
| **One-offs, stubs & sketchpads** | **7** | Done their job, or never meant to ship |
| **Fan-facing embeds** | **11 sources** (+3 hosted bundles) | Pasted into the Urban Zoo CMS |
| **Public site widgets** | **5** | `<script src>` widgets on thenationalleague.org.uk |
| **Assets** | **197 MB** | Crests, fonts, generated data — see the assets section |

34 pages load `auth-guard.js`; 17 of those are portal-registered, which is the
gap this document explains.

---

## 1. Gated portal tools — registered and live (17)

These have a record in `system/rtdb/tools-registry.snapshot.json`, so they get a
portal card and role-based access. `audience` decides whether clubs ever see them.

### Staff-audience — NL staff only (5)

| Tool | Path | toolKey | Notes |
|---|---|---|---|
| Graphics & Media | `/graphics/` | `staff-graphics` | Hub + 8 sub-tools (below) |
| Newsletter | `/newsletter/` | `staff-newsletter` | Monthly staff newsletter → print-to-PDF |
| Team of the Week | `/team-of-the-week/` | `staff-team-of-the-week` | ⚠️ see duplication finding |
| Travel Planner | `/travel-planner/` | `staff-travel-planner` | UI change pending (brand-v3 scale) |
| Website Archive | `/website-archive/` | `staff-website-archive` | Live & working |

### Club-audience — NL staff + clubs (12)

| Tool | Path | toolKey | Notes |
|---|---|---|---|
| Attendance | `/attendance/` | `ops-attendance` | Club edit-own, day-locked |
| Club Directory | `/club-directory/` | `ops-club-directory` | 17 MB dir — largest tool |
| Commercial Benchmarking | `/commercial-benchmarking/` | `ops-commercial-benchmarking` | Clubs see anonymised output only |
| Cup Footage | `/footage/` | `media-footage` | ~16 clubs per season |
| DAZN VIP | `/dazn-vip/` | `media-dazn-vip` | Live but flagged for rework |
| Fixtures | `/fixtures/` | `ops-fixtures` | v0.16 — not in the status doc |
| Handbook 2026-27 | `/handbook/` | `ops-handbook` | Was `/clause-editor/` |
| Judgements & Decisions | `/judgements/` | `ops-judgements` | Also has a public CMS embed |
| Programme Packs | `/programme-packs/` | `media-programme-packs` | ⚠️ superseded in flight — see findings |
| Programme Packs (admin) | `/programme/admin/` | `media-programme` | Console for the new passcode-era library |
| Vacancies | `/vacancies/` | `ops-vacancies` | Club submissions need NL approval |
| Wellbeing | `/wellbeing/` | `ops-wellbeing` | Card is a **signpost** — target page is public/ungated |

### Registered-but-hidden

| Tool | Path | toolKey | Notes |
|---|---|---|---|
| Style Guide | `/style-guide/` | `staff-style-guide` | **No registry record — deliberate.** Superadmin-only living reference for the canon |

### The Graphics sub-tools (8, all under `staff-graphics`)

`/graphics/` is one registry record covering a hub plus eight exporters that
share `graphics/` assets and are cache-controlled as a group in `_headers`:

`article-composer` · `fixtures-graphic` · `fixtures-results` · `league-tables` ·
`match-graphic` · `single-fixture` · `table-graphic` · `top-scorers` · `totw`

All 6 open lint waivers live in this folder (stale `clubs-data.js` mirror or
direct `clubs-meta` URLs instead of `NL.clubs`). There is meaningful overlap
between `fixtures-graphic` / `fixtures-results` / `single-fixture` and between
`league-tables` / `table-graphic` — a consolidation candidate, not a bug.

---

## 2. Gated tools — parked (code in repo, off the portal)

Records held in `system/rtdb/tools-registry.parked.json`. No registry record =
superadmin-only and invisible. No `app-data` is touched, so nothing is lost.

| Tool | Path | Code present? | Status per the audit |
|---|---|---|---|
| Claudio | `/claudio/` | ✅ | Park — advanced. AI helper, needs serious work |
| Holiday & Lieu | `/holiday-lieu/` | ✅ | Park — advanced. Org chart works today |
| Meeting Notes | `/meeting-notes/` | ✅ | Park — early |
| Tasks | `/tasks/` | ✅ | Park — early |
| Website Analysis | `/website-analysis/` | ✅ | Park — early, scope undecided |
| Website Insights | `/website-insights/` | ✅ | Park — early, scope undecided |
| Chase HQ | `/chase-hq/` | ❌ **no code** | Removed at brand sweep v2.19, pending rewrite |
| Transfer Centre | `/transfer-centre/` | ❌ **no code** | Prototype lives in `embeds/transfer-centre-*.html`, not at this URL |

---

## 3. Public / link-gated pages (no auth-guard)

Not portal tools. Reached by capability link, passcode, or straight public URL.

### Club data collection — three forms, one current

| Page | Status |
|---|---|
| `/club-contacts/` (v2.31) | ✅ **Current.** Unified club details + people wizard. `no-cache` in `_headers` |
| `/club-data/` (v1.2) | 🟠 **Superseded Jun 2026.** Shows a "being replaced" banner; still honours issued links. Retirement candidate |
| `/club-kits/` (v1.0) | ✅ Current. Kit-colour collection — fixes 571 free-text `kit` strings across 82 clubs |
| `/club-signoff/` (v0.1) | ✅ Current. Clubs confirm what we hold for them. `no-cache` in `_headers` |

### Other public pages

| Page | What it is |
|---|---|
| `/vacancies/submit/` (v3.2) | Public vacancy submission, 4-digit email-code flow |
| `/programme/` (v1.9) | Passcode-minted club programme library — the **new** Programme Packs |
| `/footage/club/` (v0.8) | Club-facing cup footage, named Firebase app to avoid clobbering a portal login |
| `/footage/producer/` | Producer upload, passcode / `?p=` token |
| `/uw-promo/` + `/admin/` + `/club/` (v2.x) | Utility Warehouse partner promo codes: partner page, NL master console, club POS redemption |
| `/wellbeing/` (v2.1) | Public wellbeing section. **Design contract: nothing is recorded** — no analytics, cookies, storage or third-party assets. `no-cache` |
| `/public/article-composer/` (v2.2) | Login-free edition of the graphics article composer |

---

## 4. One-offs, stubs and sketchpads

Built for a moment that has passed, or explicitly never meant to ship.

| Page | Verdict |
|---|---|
| `/lab/po-sf-planner/` (v18) | **Spent.** 2025-26 playoff semi-final planner, final standings locked in |
| `/lab/step2-final-trains/` (v3) | **Spent.** 2025-26 playoff finals travel planner |
| `/clause-editor/` | **Redirect stub.** Became Handbook; forwards deep links to `/handbook/` |
| `/wellbeing/concepts/` (v1.0) | Declared parking space for exploratory work. Not live, not indexed |
| `/wellbeing-map/` (v1.14) | Internal sketchpad so Martyn and Benny can restructure wellbeing copy without touching code |
| `/decks/partnerships/` | Single 5.5 MB bundled HTML deck. Not a tool |
| `/assets/crests/`, `/assets/divisions/` | Directory-listing browser pages for assets |

---

## 5. Fan-facing embeds (`embeds/`)

Pasted into the Urban Zoo CMS. **Different rules entirely** — the CMS strips
`<script src>` tags, so Firebase loads dynamically with `onload` chaining. Out
of scope for `lint-tools.sh`, deliberately excluded from the canon.
See `embeds/widget-handover.md` (the invariants) and `embeds/auth-hardening-plan.md`.

**Hosted-bundle model** (built by `scripts/build-embeds.js` + `build-embeds.yml`
— edit the `.html`, the `.js` is generated, no re-pasting):

- `score-predictor.html` → `score-predictor.js` — the reference implementation
- `motm.html` → `motm.js` — Man of the Match
- `club-directory.html` → `club-directory.js` — the static outlier

**Paste-in-full embeds:** `match-hub.html` (166 KB, the biggest file in the
repo outside assets) · `match-hub-grammar.html` · `match-centre.html` ·
`live-blog-page.html` · `live-blog-ticker.html` · `transfer-centre-page.html` ·
`transfer-centre-ticker.html` · `vidiprinter.html` · `results-ticker.html` (979 B
— a stub) · `handbook-flipbook.html`

Rules: `embeds/nl-widgets.rules.json`, plus root `score-predictor.rules.json`.

## 6. Public site widgets (`widgets/`)

Standalone `<script src="https://nl.tools/widgets/...">` widgets, configured by
`data-` attributes. Copy-paste snippets are in `widgets/widgets.txt`.

`news-ticker-widget.js` · `results-ticker-widget.js` · `transfers-ticker-widget.js` ·
`club-news-feed-widget.js` · `club-news-widget.js` · `test.js` *(scratch — not a widget)*

---

## 7. Assets (197 MB — the repo's real weight)

| Path | Size | Files | Notes |
|---|---|---|---|
| `assets/crests/` | **103 MB** | 526 | Full-size club badges. `thumbs/` holds 175 × 96px (2.9 MB) |
| `assets/data/` | **88 MB** | 13 | Almost all **generated and committed** — see below |
| `assets/fonts/` | 3.4 MB | 39 | Carbona family |
| `assets/divisions/` | 956 KB | 9 | Division marks |
| `assets/icons/` `partners/` `backgrounds/` `logos/` `images/` | ~1 MB | 37 | |
| `ecal/` | **20 MB** | 221 | Per-club calendar ad creatives (3 sizes × ~74 clubs). No page — a one-off delivery drop |
| `decks/` | 5.5 MB | 1 | The partnerships deck |

### `assets/data/` — generated vs authored

**Generated by Actions and committed** (86 MB of the 88 MB):

| File | Size | Built by |
|---|---|---|
| `ga-metrics.json` | 37 MB | `rebuild-index.yml` (daily 03:00) |
| `articles-index.json` | 30 MB | `rebuild-index.yml` |
| `ga-hourly-archive.json` | 19 MB | `rebuild-index.yml` / `backfill-ga-archive.yml` |
| `ga-hourly.json` | 5.7 MB | `rebuild-index.yml` |
| `club-news.json` + `-failures.json` | 52 KB | `build-club-news.yml` (:15 and :45) |
| `table-baselines.json` | 32 KB | `table-baseline.yml` |

**Authored / schema data:** `clubs-meta.json` (154 KB — the club data schema,
validated by `tests/validate-clubs-meta.mjs`) · `cup-clubs-meta.json` ·
`competitions-meta.json` · `fixtures-2026-27.json` · `stations.json` (285 KB,
travel planner) · `postponement-reasons.json`

---

## 8. Supporting infrastructure (not tools)

- **`system/`** — the canon. `nl-brand.css` · `nl-utils.js` · `nl-topbar.js` ·
  `auth-guard.js` · `_template/` · `lint-tools.sh` · `rtdb/` snapshots, plus the
  planning docs (`CONSOLIDATION.md`, `tool-status-and-access.md`,
  `staff-club-audience-plan.md`, `roles-and-access-plan.md`,
  `brand-v3-scale-plan.md`, `gas-to-functions-migration.md`).
- **`functions/`** — Cloud Functions: `account.js` (server-minted roles —
  consumeInvite / submitAccessRequest), `programme.js`, `index.js`.
- **`gas/`** — Google Apps Script: `Code.gs`, `Invite.gs`, `FixtureSync.gs`,
  `Notifications.gs`, `Utils.gs`. Being migrated to `functions/`.
- **`scripts/`** — 19 build/fetch scripts (GA fetchers, crest thumbs, embed
  bundler, handbook PDF, season rollover, match graphics, leaderboards).
- **`tests/`** — 11 test files + 2 validators. Canon tests, clubs-meta
  validation, per-tool tests (uw-promo, programme, match-graphic, leaderboards).
- **`.github/workflows/`** — 13 workflows + 2 Python scripts.
- **Root** — `index.html` is the **login page** (v5.0); `/portal/` is the
  dashboard (v5.95). `CNAME` binds `nl.tools`; `_headers` sets `no-cache` for
  `/system/*`, `/graphics/*`, `/club-contacts/*`, `/club-signoff/*`, `/wellbeing/*`.

---

## Findings worth a decision

Nothing here is broken today. These are the places where the repo has drifted
from the plan, or carries two of something.

1. **`tool-status-and-access.md` is stale.** It records 21 tools / 13 live. The
   registry now carries 17 live — Fixtures, Newsletter, Wellbeing and Programme
   Packs (admin) went live after it was signed off and are absent from it.

2. **Two parked records point at code that no longer exists** — `staff-chase-hq`
   → `/chase-hq/` and `media-transfer-centre` → `/transfer-centre/`. Harmless
   while parked, but the bring-back checklist would fail at step 1. Transfer
   Centre's prototype is actually in `embeds/`, not at that URL.

3. **Two Team of the Week tools.** `/team-of-the-week/` (own registry record)
   and `/graphics/totw/` (under `staff-graphics`) carry the same title. Same
   name, two doors, two access paths.

4. **Programme Packs is mid-migration with both halves live.**
   `/programme-packs/` (Drive-era, `media-programme-packs`) and `/programme/` +
   `/programme/admin/` (passcode-era, `media-programme`) are both registered
   and both reachable. Deliberate during the CDN move — worth an end date.

5. **Two Article Composers** — `/graphics/article-composer/` (gated) and
   `/public/article-composer/` (public, recovered from history). Fork risk.

6. **`/club-data/` is retirement-ready** — superseded by `/club-contacts/`,
   already showing a replacement banner, waiting on the last issued links.

7. **Crest thumbs cover part of the set** — 175 thumbs against 526 files in
   `assets/crests/`. The runtime fallback (thumb → full → rose) means this
   fails safe, so it shows up as slowness rather than breakage.

8. **86 MB of generated data is committed to git.** The GA and article-index
   files are rebuilt daily and committed each time, so the weight compounds in
   history rather than sitting still.

9. **`widgets/test.js`** (26 KB) sits alongside the five real widgets on a
   publicly served path.

10. **All 6 lint waivers are in `graphics/`** — the stale `clubs-data.js` mirror
    and direct `clubs-meta` URLs. One folder, one root cause, one fix.
