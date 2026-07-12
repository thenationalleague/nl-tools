# Programme Packs — v2 rebuild spec (retire Apps Script + Drive)

> **Status: planned, not started.** The live tool (`index.html` + `gas/`) keeps
> running until v2 is ready. Build sequencing: **after** the NL Cup Footage tool's
> Stages C/D, which prove the exact Firebase Storage patterns this reuses.

## Why rebuild

The current tool proxies **Google Drive through a Google Apps Script web app**.
That proxy architecture is the root cause of the jank — all documented in
[`gas/README.md`](gas/README.md):

- manual redeploy dance on every backend change (Apps Script isn't deployed from the repo)
- GAS execution quotas / timeouts on larger operations
- Drive ↔ RTDB drift → "ghost files" that need a manual **↻ Sync with Drive** reconcile
- key-mismatch bugs (the `ops-` → `media-` recategorisation broke the server for a while)

It works, but it fights the platform. Owner decision: **replace it.**

## Decision

Rebuild on the **same clean stack as the NL Cup Footage tool**: Firebase Storage
for the bytes, RTDB for metadata, Firebase Storage Security Rules for access.
**Zero Apps Script.**

This makes the footage tool's "one bucket, many uses" business case concrete —
one bucket (`nl-tools.firebasestorage.app`), path-prefixed:

```
footage/…                        cup footage (one-way, passcode + portal)
programme-packs/<clubKey>/…      club assets (two-way, portal club-admin)
```

## v2 architecture

| Concern | Janky today | v2 |
|---|---|---|
| File bytes | Google Drive via Apps Script | **Firebase Storage** `programme-packs/<clubKey>/<folderId>/<fileId>-<name>` |
| Backend | GAS web app (`PP_GAS_URL`) | **none** — client Storage SDK + Security Rules |
| Metadata | RTDB `app-data/media-programme-packs` | **same node**; drop `driveId`, add `storagePath` |
| Access control | GAS logic + RTDB rules | **Storage Security Rules** keyed on the `<clubKey>` path |
| Uploads | proxied through GAS | direct, **resumable, with progress** |
| Delete / drift | reconcile hacks, ghosts | Storage is source of truth — no drift, no reconcile |

## Access model (Storage Rules sketch)

Mirror the existing RTDB rules for `media-programme-packs`:

- **Read:** authed portal users — their own club's folder + the NL shared/read-only asset folders.
- **Write under `programme-packs/<clubKey>/…`:** `club-admin` where `users/<uid>/club === clubKey`, or `admin` / `superadmin`.
- **NL shared asset folders:** write `superadmin` / `admin` only (clubs read-only).

## Migration (owner decision — depends on current Drive volume)

- **A — one-off script:** copy Drive → Firebase Storage, rewrite RTDB records (`driveId` → `storagePath`). Needs Drive credentials; owner runs.
- **B — start fresh:** clubs re-upload. Viable if volume is small / assets refresh each season.
- **C — transition:** leave Drive read-only, new uploads go to Firebase, migrate lazily.

_Recommendation pending: how much is in the Drive root today?_

## What gets deleted at cutover

- `programme-packs/gas/` (`ProgrammePacks.gs`, its README) and the shared Apps Script project's `pp_*` actions + `doPost` router entries.
- Drive-specific UI/fields: the "⤴ Open in Drive" button, `driveId`, `PP_GAS_URL`, the sync/reconcile flow.

## Cost

Small files (headshots, docs, graphics) — storage + egress are negligible next to
the footage tier, on the **same bucket and budget** (£50/mo cap already set).

## Sequencing

1. Footage: Stage B live test → Stage C (PL2 meta + parser) → Stage D (Storage Rules + passcode auth + real downloads).
2. **programme-packs v2** — reuse the Storage-Rules + upload/download + auth patterns proven in footage. The footage tool is the template.
