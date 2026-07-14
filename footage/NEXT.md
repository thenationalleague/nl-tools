# NL Cup Footage — project state & next steps

Last boxed off: 13/07/2026. This is the source of truth for where the tool stands
and what's left.

## What's live and working

- **Delivery:** cross-device. Producer uploads → clubs see them on any device.
- **Preview proxies:** `makeProxy` Cloud Function makes a 360p ~500 kbps faststart
  MP4 for any file ≤ 2 GiB (size-gated, not filename-gated). Full matches are
  download-only. Deployed, working.
- **Delete-sync:** `onFootageDeleted` Cloud Function — deleting a file in Storage
  (console/gsutil/master ✕) removes its RTDB record + its proxy. Self-healing.
- **Portal tool (`/tools/footage/`):** gated, role-aware. `toolKey =
  media-footage`. Club users see only their club's games (home OR away, matched on
  `users/<uid>/club` full name); staff see all read-only; admin/superadmin get the
  **full catalogue editor inline** (the former `/master/`, merged in v0.4 — Clubs +
  Fixtures tabs, publish/pull, chip live/held toggle, upload delete). On brand
  (canon head, topbar).
- **Standalone pages (passcode):** `/club/` (per-club link/passcode), `/producer/`
  (upload, passcode `PROD24`). These still work. (`/master/` retired — the admin
  editor now lives inline in the portal tool.)
- **Preview download-protection:** the `<video>` player hides its download control.

### Deployed Cloud Functions (project nl-tools, europe-west2)
`makeProxy` (storage finalize), `onFootageDeleted` (storage delete). Deploy is
automatic on merge via `.github/workflows/deploy-footage-proxy.yml`.
(The per-club signed-URL gate — first a `getFootageUrl` callable, then an
`onFootageUrlRequest` RTDB trigger — has been **removed**; see the security note.)

### One-time infra already done
Enabled APIs (Functions/Build/Artifact Registry/Run/Eventarc/Pub-Sub/IAM Credentials);
deploy SA `nl-archive-ga-reader@` granted Editor + Service Account User + Project IAM
Admin + Cloud Run Admin; runtime SA `801354670005-compute@` granted Cloud Build SA +
Service Account Token Creator.

## ⚠️ Current security posture (READ THIS)

- **Access rests on UI scoping.** Club users (portal or `/club` passcode) only ever
  *see* their own club's games; staff/admin see all. This is the enforced model.
- **Storage rules are OPEN** (`allow read: if request.auth != null` on `footage/**`).
  Any signed-in user can read any footage file **if they have its URL** — i.e. the
  download lock is not cryptographically enforced, only UI-scoped. Given the audience
  (32 known clubs + NL staff, all authenticated) this is an accepted trade-off.
- **The per-club cryptographic download-lock was DROPPED (decision, 13/07/2026).**
  Two invocation paths were built and both rejected:
  - A `getFootageUrl` **callable** — but callables must be publicly invokable, and the
    org's **Domain Restricted Sharing** policy forbids that (`allUsers` invoker → 403).
  - An **RTDB-triggered** signer (`onFootageUrlRequest`, org-policy-proof) — but RTDB
    Eventarc delivery added **~15-20s** per preview (structural, not a cold start;
    `minInstances:1` didn't help). Direct `getDownloadURL` is sub-1s.
  Loosening the org policy was rejected. So both the gate function and the client-side
  gate calls have been removed; previews/downloads use `getDownloadURL` directly.

## If the download lock is ever wanted again

The gate LOGIC (club-vs-game check + v4 signing) is preserved in git history
(`functions/index.js` `signFootageUrl`/`onFootageUrlRequest`, removed here) and the
**locked** ruleset is still at repo root `storage.rules` (reads denied → gate only).
To revive it you'd need a faster invocation path than RTDB Eventarc — e.g. an
org-policy exception permitting a public callable (fast, ~sub-1s), or an HTTPS
function fronted so it doesn't need `allUsers`. Not worth it unless the threat model
changes (the current audience is all authenticated + known).

## Other remaining work

- **Canon re-skin (option B, agreed):** the admin editor is now a gated portal
  surface (merged inline into `/tools/footage/`, v0.4 — `/master/` retired).
  `/producer/` re-skinned (13/07) + mapping-row layout fixed (14/07). Still to do:
  a house-style once-over of `/club/`.
- ~~**Producer reads published fixtures.**~~ **Done (14/07).** `/producer/` now
  listens to `LIVE_REF` (`app-data/media-footage/data`), so drawn fixtures reach it
  — the "pick match" list fills from what the admin published and correctly-named
  files auto-map. Was previously seed-only (couldn't map anything once the seed's
  fixtures went empty).
- ~~**Real club names:**~~ **Done (14/07).** Roster is the real 2026-27 field —
  16 NL clubs + 16 PL2 sides (`"<Club> PL2"`). NL club identity (name/short/crest)
  is sourced from the master `assets/data/clubs-meta.json` at load via
  `footageHydrateClubs()` — NL clubs live in one place, no duplication. The 16 PL2
  sides aren't in that registry (no other NL fixtures) so they carry local identity
  in `data.js`. Fixtures/groups TBC — `games[]` empty until the draw.
- ~~**Fixtures from the NLS feed:**~~ **Done (14/07).** The "NLS feed" is the
  attendance tool's RTDB node `app-data/ops-attendance/fixtures` (public-read),
  populated by the **NLS fixture-sync GAS** (`gas/FixtureSync.gs`, now mirrored in
  repo): it pulls the NLS API for four comps incl. **NL Cup (competitionID 1275)**
  and writes each match with `competitionKey: 'nl-cup'`, teams by NAME
  (`homeTeamName`/`awayTeamName` from NLS `home.name`), date in `kickoffUTC`, keyed
  by `matchID`. The footage editor now has **Import NL Cup fixtures from the
  attendance feed** (admin, Fixtures tab): reads that node, filters `nl-cup`,
  tolerant name-match to the roster (`normTeam()` strips U21/U23/Under-21s/PL2/
  Development/Academy/accents/punctuation), previews matched vs unmatched, merges
  keyed on `matchID` (re-import updates, never duplicates). Empty feed → "fixtures
  TBC" (games stay empty). Superadmin still Publishes.
  **PL2 naming — confirmed (14/07):** NLS returns the PL2 sides in the `name` field
  as `"<Club> PL2"` (e.g. `"West Ham United PL2"`, `officialName` `"… Under 21"`) —
  byte-identical to our roster naming, so it's an EXACT match; the tolerant matcher
  is now just insurance. Verified against real competitionID-1275 data.
  **Open sub-item:** all imported games default to `stage: 'Group Stage'` — the feed
  carries no round/stage, so knockout ties need a manual stage edit (or a heuristic
  later; NLS does expose `matchPeriod`/scores if we ever want richer round logic).
- **Node runtime:** functions on Node 20 (deprecated Oct 2026) → bump to 22.
- **Passcode data:** club tokens live in `data.js` (public) for the UI + in the
  admin-only `app-data/media-footage/access/clubTokens` node (the gate's trusted
  copy). Full hardening (remove from data.js, redeem-via-function) only matters
  once the gate is active.

## Access model (agreed)

| Who | Route | Sees | Can do |
|---|---|---|---|
| NL superadmin / admin | Portal | All 32 | Everything (inline editor) |
| NL staff | Portal | All 32 | Preview + download |
| NL club (club-admin/club-viewer) | Portal OR `/club` passcode | Own team | Preview + download |
| PL2 / U21 club | `/club` passcode | Own team | Preview + download |
| Producer | `/producer` passcode | Upload view | Upload + 24h self-correct |

## Key facts

- Firebase project `nl-tools`; bucket `nl-tools.firebasestorage.app` (europe-west2);
  RTDB `app-data/media-footage/{data,uploads,access}`; registry `tools/media-footage`.
- Storage path: `footage/national-league-cup/<file>`; proxies at `.../proxies/<file>`.
- Producer passcode `PROD24` / token `prod-9x2k`; club tokens/passcodes in `data.js`.
