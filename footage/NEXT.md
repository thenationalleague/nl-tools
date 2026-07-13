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
`makeProxy` (storage finalize), `onFootageDeleted` (storage delete), `getFootageUrl`
(callable — the per-club signed-URL gate; **currently org-blocked, see below**).
Deploy is automatic on merge via `.github/workflows/deploy-footage-proxy.yml`.

### One-time infra already done
Enabled APIs (Functions/Build/Artifact Registry/Run/Eventarc/Pub-Sub/IAM Credentials);
deploy SA `nl-archive-ga-reader@` granted Editor + Service Account User + Project IAM
Admin + Cloud Run Admin; runtime SA `801354670005-compute@` granted Cloud Build SA +
Service Account Token Creator.

## ⚠️ Current security posture (READ THIS)

- **Storage rules are OPEN** (`allow read: if request.auth != null` on `footage/**`).
  Any signed-in user can read any footage file **if they have its URL**. In the
  portal, club users only *see* their own games (UI scoping), but the *download
  lock* is not enforced.
- **Layer 2 (the per-club download lock) is built but NOT active.** The gate
  `getFootageUrl` checks club-vs-game and mints 15-min signed URLs, but it's a
  **callable function, which must be publicly invokable** — and the org's **Domain
  Restricted Sharing** policy forbids that (`allUsers` invoker → 403). So the
  clients currently fall back to direct `getDownloadURL` (hence the open rules).
- The **locked** ruleset that finishes the job is saved at repo root `storage.rules`
  (reads denied → gate only). Swap to it the moment the gate is reachable.

## To activate the per-club download lock (pick one)

1. **Org-policy exception.** As org owner, override "Domain restricted sharing"
   (`constraints/iam.allowedPolicyMemberDomains`) for the `nl-tools` project to
   permit the callable's public invoker. Then: `gcloud run services
   add-iam-policy-binding getfootageurl --region=europe-west2 --member=allUsers
   --role=roles/run.invoker`, switch clients back to gate-only (remove the
   getDownloadURL fallback), and publish the locked `storage.rules`.
2. **Re-architect the gate to avoid a public function** (recommended if the org
   policy can't/shouldn't change). Make it **RTDB-triggered**: client writes a
   request to `app-data/media-footage/urlRequests/<id>` (RTDB rule enforces
   `uid === auth.uid`); an event-driven function (no public invoker needed, like
   makeProxy) checks club access, signs, writes the URL back; client listens.
   Then publish the locked `storage.rules`.

Either way the gate LOGIC is done — it's purely an invocation-path problem.

## Other remaining work

- **Canon re-skin (option B, agreed):** the admin editor is now a gated portal
  surface (merged inline into `/tools/footage/`, v0.4 — `/master/` retired). Still
  to do: bring `/club/` and `/producer/` onto the house style (shared `NL.*`,
  `clubs-meta.json` for club identity). Those two still wear bespoke chrome.
- **Real club names:** the 16 PL2/U21 sides in `footage/data.js` are placeholders.
  Best fixed by sourcing clubs from `clubs-meta.json` during the re-skin.
- **Fixtures from the NLS feed:** derive games for the National League Cup
  (competition id — Richard guesses **1275**, token `nlc`; trace via the attendance
  tool's NLS sync). 2026-27 is blank until NLS publishes — show a "fixtures to be
  confirmed" empty state. Turns hand-seeding into an auto-updating pipeline.
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
