# NL × PL2 Footage Handoff — spec + MVP

A tool to deliver match footage to the 32 clubs of the NL × PL2 Cup
(16 National League + 16 Premier League 2). Clubs get their **own** games to
**preview + download**; NL sees everything.

> **This folder is the MVP prototype (dummy content, client-side).** The
> production architecture (RTDB + Cloudflare R2 + presigning Worker) is Phase 2,
> specced below. Nothing here touches live footage yet.

---

## Requirements (settled with the owner)

| Area | Decision |
|---|---|
| **Access matrix** | A club sees only its own games (home + away); NL staff see all |
| **Access method** | Per-club **direct link** (auto sign-in) **and** per-club **passcode** — works fully standalone. NL clubs can *also* reach it from the portal (convenience), PL2 clubs use the passcode/link |
| **Admin** | One superadmin (you) runs it: curate uploads, manage passcodes, open knockout access |
| **Ingest** | Supplier uploads direct into a raw "lake" (scoped S3/R2 keys) |
| **File → game** | Naming convention, auto-parsed; staff layer to rename/retag/reroute |
| **Naming** | `YYYY MMM DD` · two 3-letter club codes · `clean`\|`dirty` (clean = no gfx) · `fmr`\|`hl` (full-match-replay \| highlights). Codes match `clubs-meta` `code` field |
| **Assets/game** | 4: `fmr/clean`, `fmr/dirty`, `hl/clean`, `hl/dirty` |
| **Security** | Simple gating + short-lived links; no watermark/DRM |
| **Retention** | Hot recent + cold archive |
| **Preview** | Highlights (MP4) double as the in-browser preview; fulls are download-only |
| **Use** | Club media/comms + archive (social clips + records) — not analysis/broadcast |
| **Scope** | 64 group + 7 knockout = 71 games. Knockout teams TBD, unlock as clubs qualify |
| **Field** | 32 clubs (16 NL + 16 PL2) |
| **Format** | Program mix at 6–10 Mbps H.264, `clean` + `dirty`. **No raw / no raw-mix** (remote production) |
| **Downloads** | Direct browser download of ~6–10 GB fmr; link valid for hours, resumable |
| **Notifications** | Nice-to-have (auto-email the two clubs when a game publishes); shippable without |
| **Timeline** | Weeks away → phased build |

---

## Production architecture (Phase 2)

Single-tier: the supplier's delivered MP4 **is** the deliverable — no master/proxy,
no transcode (raw is off the table).

```
Supplier ──(S3 API, scoped key)──▶ Cloudflare R2 "lake" bucket
                                        │  (naming convention)
                                   Master tool (you) ── curate / rename / reroute
                                        │  publishes catalogue → RTDB app-data/handoff
Club ──direct link / passcode──▶ Club page ──▶ Cloudflare Worker
                                                  │ verify passcode/session
                                                  ▼ presigned R2 URL (hours TTL)
                                             Direct download / <video> preview
```

- **Storage/CDN: Cloudflare R2.** Zero egress fees — decisive at ~1.5 TB stored
  and multi-TB downloads. Standard class for current games, Infrequent-Access for
  archived seasons. **~£20/mo storage, £0 egress → ~£250–400/yr all-in.**
- **Auth: dual path.** Universal per-club passcode/token (all 32); NL clubs can
  also arrive via the existing Firebase portal session. A small **Worker**
  validates either and mints a short-lived **presigned R2 link** per download.
- **Catalogue/state: RTDB `app-data/handoff/`** — clubs, passcodes, fixtures,
  asset availability. Token-gated public read for the club direct-links;
  superadmin write. (Rules go in `system/rtdb/rules.snapshot.json` when built.)
- **Preview:** highlights `<video>`; no transcoding pipeline.
- **Ingest:** supplier writes to the R2 lake by naming convention; the master
  tool parses `YYYY MMM DD <HOME> <AWAY> <clean|dirty> <fmr|hl>` → game + assets,
  with manual override to rename/retag/reroute.

**Open item — compression test:** the supplier suggested they *can* provide
uncompressed. We don't want it — uncompressed would be ~1–2 TB/game (≈100 TB total,
a 60× cost swing). Confirm delivery at 6–10 Mbps H.264 so this stays a ~£300/yr tool.

---

## The MVP in this folder (Phase 1 — done)

Fully client-side, zero backend, **dummy content** — proves the whole flow today.

| File | What |
|---|---|
| `index.html` | **Club-facing** standalone page. `?c=<token>` auto-signs a club in; otherwise a passcode gate. Shows that club's games grouped by stage, each with the 4 assets (highlights preview + downloads). |
| `master/index.html` | **Master** control tool. The 32 clubs with copy-able direct links + passcodes (regenerate per club), and a fixtures tab to assign knockout teams + toggle which assets are live. Export/Import JSON, reset to dummy. |
| `data.js` | Dummy dataset: 32 clubs (16 real NL + 16 placeholder PL2 with monogram crests), 64 group games + 7 knockout placeholders, tokens + passcodes. |

**How the two connect today:** the master tool writes a `localStorage` overlay
(`nlHandoffData`) that the club page reads, so edits preview live in the same
browser. Export/Import JSON to move data between machines. In Phase 2 this overlay
becomes RTDB and the two pages share live server state.

**Try it:**
- Master: `/tools/handoff/master/` → copy any club's link or passcode.
- Club: open a copied `/tools/handoff/?c=<token>` link, or hit `/tools/handoff/`
  and enter a club passcode.

**Explicitly dummy:** every Download shows a "Phase 2" toast; Preview opens a
placeholder player; downloads are not wired to real files.

---

## Not yet built (Phase 2 checklist)
- [ ] R2 bucket + scoped supplier upload key + lake naming parser
- [ ] Cloudflare Worker: passcode/session → presigned R2 URL
- [ ] Move catalogue/state + passcodes to RTDB (`app-data/handoff`, rules snapshot)
- [ ] Real 16-club PL2 meta (names + crests + codes)
- [ ] Wire real downloads + highlights `<video>` preview
- [ ] Superadmin-gate the master tool
- [ ] (Optional) auto-notify the two clubs on publish
- [ ] Confirm supplier delivery format (compression test)
