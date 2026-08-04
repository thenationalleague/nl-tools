# RTDB config snapshots

Reference copies of the **live Firebase RTDB configuration** for the
`nl-tools` project. Claude Code (and humans) have no read access to the
live database from a repo checkout — these files are the canonical
in-repo answer to "what's deployed right now?".

| File | Mirrors | Live home |
|---|---|---|
| `rules.snapshot.json` | The full database security rules. **Deployed from here** — see the contract below. | Firebase console → Realtime Database → Rules (read-only reference; edits made there are overwritten by the next deploy) |
| `storage.rules.snapshot` | The full Storage security rules. Key idiom: `request.auth.token.email != null` distinguishes real portal accounts from the anonymous-auth capability pages (footage, uw-promo) — anonymous tokens carry no email claim. | Firebase console → Storage → Rules |
| `storage.cors.json` | Bucket CORS. Needed **only** for bulk (zip) download, which reads file bytes into the page — a browser will not do that cross-origin unless the bucket allows the origin. Single-file downloads are unaffected: the browser saves those directly and the page never sees the bytes. | Not settable in any console UI — Cloud Shell: `gcloud storage buckets update gs://nl-tools.firebasestorage.app --cors-file=system/rtdb/storage.cors.json` |
| `tools-registry.snapshot.json` | The `tools/` node (tool registry: labels, urls, role defaults) | RTDB `tools/` (drives the portal cards **and** auth-guard access defaults) |
| `tools-registry.parked.json` | Holding pen for tools pulled off the portal (back in planning). **NOT deployed** — records live here instead of in `tools/`, so those tools are superadmin-only + invisible while their code stays in the repo. See `system/tool-status-and-access.md`. | — (never pasted) |

## The contract

1. **`rules.snapshot.json` is deployed from this repo. It is not a snapshot
   any more — it is the rules.** `firebase.json` points at it and the
   **Deploy RTDB rules** workflow publishes it (Actions tab → Run workflow →
   type `publish`). No terminal, no console paste, and the repo cannot drift
   from live because the repo *is* live.

   Deliberately manual, never on push: rules govern every tool in the project,
   and landing an unrelated PR should not be able to lock 72 clubs out of
   their data as a side effect. Read the diff, then press the button.

   The other files here remain reference only — nothing applies them
   automatically, and the live console is authoritative for those.
2. **Any PR that needs a rules change edits `rules.snapshot.json`** (the full
   document). It ships when someone runs the workflow, so say in the PR body
   that it needs one. No partial rule files — `dazn-vip/dazn-vip.rules.json`
   is a historical subset and should not be extended.
3. **Any PR that adds/changes a tool registry entry edits
   `tools-registry.snapshot.json`** the same way (paste target: RTDB `tools/`
   node, or edit the single tool's record in the portal admin).
4. **After changing config directly in the console**, re-export and commit
   the snapshot so the repo catches up. (Console → ⋮ → Export JSON for the
   node, or copy the rules text.)
5. **Before telling anyone a registry record or rule is missing, check
   here first.**

## Intentionally public reads — do NOT "fix" these

Several `app-data/*` paths are `".read": true` (readable without login) **on
purpose** — they feed no-login capability pages and external site widgets.
Tightening them to `auth != null` would break a live feature. Leave them:

| Path | Why it's public |
|---|---|
| `ops-judgements/records` | An **external widget on thenationalleague.org.uk** reads published disciplinary decisions anonymously. |
| `ops-commercial-benchmarking/aggregates` + `.../links/$token` | `commercial-benchmarking/link.html` — a no-login capability page for clubs without an account (anonymised data, unguessable token). |
| `media-footage/data` + `.../uploads` | `footage/club` (`?c=` token + passcode) and `footage/producer` (`?p=` token) — external capability pages, no NL account. (Footage's per-club scoping is being reworked; handle there.) Accepted by Richard 25/07/2026 (footage-only data). |
| `uw-promo` (whole node) | UW partner page, club till page and master console are standalone (no auth-guard), gated by client-side passcodes over **anonymous Firebase auth** — reads public + writes `auth != null` is the working model. No personal data. Known accepted trade-off (25/07/2026): writes are spoofable by anonymous users; proper hardening (server-side passcode check via a callable, App Check) only if UW abuse ever matters. |
| `ops-handbook/editions` + `publishedEditionId` | Published handbook is **public by intent** (confirmed by Richard 25/07/2026). Drafts and audit stay gated. |
| `ops-vacancies/listings` + `analytics` | Jobs-board widget embedded on thenationalleague.org.uk reads listings and writes click analytics anonymously. |
| `ops-club-data/*/submissions/$token`, `ops-club-contacts/*/submissions/$token` | Invite-token submission flows — access is gated by *token existence*, not login. |
| `ops-vacancies/analytics` | Public **write** for anonymous click tracking (by design). |

Rule of thumb: a broad `".read": true` here is usually load-bearing for a
capability page or a public widget — **confirm the consumer before locking**.
Staff-audience tools are the opposite: their `app-data` is league-only (locked
in the audience-gating work); see `system/staff-club-audience-plan.md`.

## Known divergence risk

`rules.snapshot.json` cannot drift any more: it is what gets deployed. The
inverse risk replaces it — a console edit made in a hurry is silently reverted
by the next workflow run, so console edits to rules should be treated as
temporary and mirrored back into this file the same day.

The remaining files here are still manual snapshots and can drift if someone
edits the console and forgets step 4. When a tool misbehaves in a way that smells like
rules/registry (denied for everyone, PERMISSION_DENIED on a path the
snapshot says is writable), trust the console over this folder, then
re-sync the snapshot.

Snapshots last verified against live: **14 Jul 2026** (tools registry + rules).
