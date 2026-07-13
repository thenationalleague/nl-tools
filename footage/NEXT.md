# NL Cup Footage — next build (portal integration + canon)

Status at end of first build: **live and working** — cross-device delivery, size-based
360p preview proxies (Cloud Function), consistent preview UX, download-protected
previews, and two-way Storage⇄catalogue delete sync. Access is currently the
standalone passcode/direct-link model. This doc is the plan to fold it into the portal
proper and put every surface on the shared canon.

## Build order

1. **Admin page → portal tool.** Today's `/footage/master/` becomes a gated portal tool
   (`auth-guard`, `window.NL_TOOL` + `NL_TOOL_KEY = 'media-footage'`, `#pageWrap`,
   `nlAuthReady`). All 32 teams, full edit/upload/remap. Add a `tools/media-footage`
   registry record (portal card + access) and the rules. Superadmin/admin only.

2. **Re-skin all three surfaces on the canon.** Admin, `/club`, and `/producer` adopt the
   portal design tokens (`nl-brand.css`), shared helpers (`nl-utils.js` — `NL.toast`,
   `NL.escHtml`, `NL.ensureAuth`, `NL.clubs`, `NL.icon`, `NL.installAuditHook`, season
   helpers), and club identity from `assets/data/clubs-meta.json` (Opta IDs) instead of
   the bespoke club list in `data.js`. Club + producer keep passcode access, just rebuilt
   from shared parts.

3. **Passcode hardening.** Move club/producer codes out of the public-read blob into an
   admin-only node with server-side verification (passcode → anon-auth bridge). This is
   the one genuine security item before real outside clubs get links. Optionally add
   signed/expiring download URLs if footage leakage matters.

4. **Fixtures from the NLS feed** (needs the feed traced — see open items). Replace the
   hand-seeded fixtures with a scheduled pull of the National League Cup competition, so
   games (incl. knockout draws) appear automatically. GitHub Actions pipeline like
   club-news / GA.

5. **Quick wins.** Real club names fall out of `clubs-meta.json` once on it; Node 20→22
   in `functions/`; an "orphan check" reconcile button in the admin page.

## Access model (agreed)

| Who | Route in | Sees | Can do |
|---|---|---|---|
| NL superadmin / admin | Portal | All 32 teams | Everything (upload, edit, remap, delete, preview, download) |
| NL staff | Portal | All 32 teams | Preview + download |
| NL club (club-admin / club-staff) | **Portal OR `/club` passcode** | Own team only | Preview + download |
| PL2 / U21 club | `/club` passcode | Own team only | Preview + download |
| Producer | Passcode page | Upload view | Upload + 24h self-correct |

- Club view is built **once**, reached two ways — "which club" resolves from the passcode
  token OR the portal user's assigned club (`users/<uid>/club`, the pattern already used
  across ops-club-directory / ops-club-data etc.).
- A game has two clubs → "own team" means **home OR away**, and the lock must be real on
  the data + the download, not just hidden in the UI.
- Dual route future-proofs: `/club` passcode works today; portal route lights up whenever
  portal rollout is ready.

## Open items (need from Richard / to trace)

- **NLS feed for the Cup**: endpoint URL, whether it needs a key/token, and the numeric
  competition ID (Richard guesses **1275**; NL Cup competition token in attendance is
  `nlc`). Traceable from the attendance tool's NLS sync — do this at build time.
- **2026-27 season is currently blank** — fixtures + clubs not yet confirmed by NLS. The
  tool must show a graceful "fixtures to be confirmed" empty state until they publish;
  it then auto-populates. Don't hard-seed.

## Recommended day

**1 → 2 → 3** is the core (real portal tool, house style, properly locked). Then **4**
once the feed is traced, then **5**. Passcode hardening (3) is the only item that's a
real risk once outside clubs have links.
