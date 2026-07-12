# NL Cup Footage — spec + MVP

A tool to deliver match footage to the 32 clubs of the NL × PL2 Cup
(16 National League + 16 Premier League 2). Clubs get their **own** games to
**preview + download**; NL sees everything.

> **This folder is the MVP prototype (dummy content, client-side).** The
> production architecture (all-Firebase — Storage + RTDB, no Cloudflare) is Phase 2,
> specced below. Nothing here touches live footage yet.

---

## Requirements (settled with the owner)

| Area | Decision |
|---|---|
| **Access matrix** | Graded (full table below): NL **admin** manages (upload/tag/edit) + sees all; NL **staff** view+download all but can't edit; **clubs** (NL + PL2) see only their own games; **producer** uploads only. |
| **Access method** | **Portal login = NL people** (admin/staff, and NL clubs eventually). **Passcode / direct link = outside** (PL2 clubs, and the producer). NL clubs can use either. |
| **Admin** | Superadmin/**admin** curate: tag files to matches, manage passcodes, toggle live/held, open knockout access. The management surface (today's standalone master) becomes the **admin portal view**. |
| **Ingest** | Producer is **external — treated like a PL2 club**: reaches a gated upload page by **passcode / direct link** (→ anon-auth with an upload scope), no NL portal account. Uploads direct to Firebase Storage — not a raw key dump |
| **File → game** | Auto-mapped by filename on upload; an unmatched file **forces the producer to map it** (pick game + type) before it counts as delivered — no orphans for NL to chase |
| **Naming** | `YYYY-MM-DD_<HOME>_<AWAY>_<TYPE>_<VARIANT>.mp4` — ISO date, underscore-delimited, uppercase (e.g. `2025-10-21_TRU_BHA_HL_CLEAN.mp4`). `TYPE` = `HL`\|`FMR` **and is extensible** (`CLIPS` etc. may follow); `VARIANT` = `CLEAN`\|`DIRTY` (clean = no gfx). Codes 2 & 3 are HOME/AWAY and route the game to *both* clubs; codes match `clubs-meta` `code`. Parser is case-insensitive and tolerant — an unknown `TYPE` still ingests into a "needs retag" state rather than being dropped |
| **Files/game** | A **flexible list** — usually the 4 standard (`fmr/clean`, `fmr/dirty`, `hl/clean`, `hl/dirty`) but tolerant of reality: missing fulls, extra `clips`, held/pending files. Data model is `game.files[]`, not a fixed 2×2 grid. |
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

### Who can do what

| Actor | Gets in via | Can do |
|---|---|---|
| NL **admin** / superadmin | Portal login | View + download **all**, **and upload, tag-to-match, manage/edit** |
| NL **staff** (non-admin) | Portal login | View + download **all** — **no editing** |
| NL **club** (eventually) | Portal login *(or passcode)* | View + download **own club's** games |
| **PL2 club** | Passcode / link | View + download **own** games |
| **Producer** | Passcode / link | **Upload** only |

Rule of thumb: **portal = NL people; passcode = outside**. One auth bridge (passcode → anon-auth + scoped claim) covers all the outside actors; portal roles (`superadmin`/`admin`/`staff`/`club-admin`) cover the NL side.

---

## Production architecture (Phase 2)

**All-Firebase stack** — one vendor, one auth model, no Cloudflare. Single-tier:
the supplier's delivered MP4 **is** the deliverable — no master/proxy, no transcode
(raw is off the table).

```
Supplier ──(scoped upload path)──▶ Firebase Storage "lake" bucket
                                        │  (naming convention)
                                   Master tool (you) ── curate / rename / reroute
                                        │  publishes catalogue → RTDB app-data/media-footage
Club ──direct link / passcode──▶ Club page
                                        │ portal session ─────────────┐
                                        │ passcode → anon-auth + claim ┤
                                        ▼                              ▼
                                   Storage Security Rules gate → getDownloadURL()
                                             Direct download / <video> preview
```

- **Storage: Firebase Storage** (a Google Cloud Storage bucket, served globally
  from `firebasestorage.googleapis.com` — this is the "CDN"). Standard class for
  current games; move archived seasons to Coldline/Archive class to cut cold-storage
  cost. Range-request resume works, so 6–10 GB fulls download resumably.
- **Auth: two paths, no Worker.** Firebase Storage **Security Rules** replace the
  presigning Worker entirely.
  - **NL people → portal session, graded by role:** `superadmin`/`admin` = read all
    + write/manage (upload, tag, live-toggle); `staff` = read all, no write;
    `club-admin` (NL club) = read its own games.
  - **Outside → passcode / direct link → anonymous auth + a scoped custom claim**
    (a small Cloud Function validates the passcode and mints the token). Scope by
    who: a **club** claim = *read* its own games; the **producer** claim = *write*
    to the upload path.

  Stays all-Firebase either way.
- **Catalogue/state: RTDB `app-data/media-footage/`** — clubs, passcodes, fixtures,
  asset availability. Token-gated public read for club direct-links; superadmin
  write. (Rules go in `system/rtdb/rules.snapshot.json` when built.) **Not
  Firestore** — RTDB is already the nl-tools canon, so adding Firestore would grow
  the stack, not shrink it.
- **Preview:** highlights `<video>`; no transcoding pipeline.
- **Ingest (producer upload page):** the producer is **external, gated like a PL2
  club** — a **passcode / direct link** (→ anonymous auth carrying an *upload*
  scope), not an NL portal account. They upload **direct to Firebase Storage**
  (resumable, with progress). Each file is auto-parsed by filename → linked to its
  game + type; an unmatched file lands in a **"needs mapping" tray and the producer
  must map it (game + type) before it's marked delivered** — mapping is forced, so
  NL never inherits orphan/mis-named files. NL (master) still has final rename/
  retag/reroute + the live/held toggle. _Legacy note:_ the master
  tool parses `YYYY-MM-DD_<HOME>_<AWAY>_<TYPE>_<VARIANT>.mp4` → game + assets, with
  manual override to rename/retag/reroute. Unknown `TYPE` tokens ingest into a
  "needs retag" state rather than being dropped.

**Cost trade vs R2:** Firebase Storage charges egress (~£0.095/GB) where R2 charged
none, so all-in lands ~£700–850/yr rather than ~£300 — a ~£400–550/yr premium bought
in exchange for deleting the entire Cloudflare Worker + presigning + second-vendor
layer. Accepted for a single-admin, modest-scale tool. Archived-season class
downgrades and the naturally bursty download pattern (2 clubs per game) pull the real
number toward the low end.

**Business case — one bucket, many uses (now concrete):** the same bucket + auth
model is set to host the **programme-packs** club-asset tool too, path-prefixed
(`footage/…` for footage, `programme-packs/<clubKey>/…` for club assets — small
files, negligible storage *and* egress cost). That tool exists today on Google
Drive via an Apps Script proxy and is being **rebuilt onto this Firebase stack** to
retire the scrappy GAS/Drive layer — see [`../programme-packs/REBUILD.md`](../programme-packs/REBUILD.md).
One bucket, one auth model, no Apps Script: a real reason to consolidate on Firebase
rather than stand up single-purpose silos.

**Open item — compression test:** the supplier suggested they *can* provide
uncompressed. We don't want it — uncompressed would be ~1–2 TB/game (≈100 TB total,
a 60× swing). Confirm delivery at 6–10 Mbps H.264. This matters *even more* on
Firebase than it would have on R2, because here you pay egress on every download,
not just storage.

---

## The MVP in this folder (Phase 1 — done)

Fully client-side, zero backend, **dummy content** — proves the whole flow today.

| File | What |
|---|---|
| `index.html` | **Landing** at `/tools/footage/` — the reserved home / future portal-card destination. Light placeholder that points clubs to the deeper login. |
| `club/index.html` | **Club-facing** login. `?c=<token>` auto-signs a club in; otherwise a passcode gate. Shows that club's games as **folders** (grouped by stage) — open a match to see its files listed like a file browser (label, filename, size, Play for video, Download). Flexible file counts. Deliberately one level deep (like `master/`) so the root stays free for the portal card. |
| `master/index.html` | **Master** control tool. The 32 clubs with copy-able direct links + passcodes (regenerate per club), and a fixtures tab to assign knockout teams + toggle which assets are live. Export/Import JSON, reset to dummy. |
| `data.js` | Dummy dataset: 32 clubs (16 real NL + 16 placeholder PL2 with monogram crests), 64 group games + 7 knockout placeholders, tokens + passcodes. |

**How the two connect today:** the master tool writes a `localStorage` overlay
(`nlFootageData`) that the club page reads, so edits preview live in the same
browser. Export/Import JSON to move data between machines. In Phase 2 this overlay
becomes RTDB and the two pages share live server state.

**Try it:**
- Master: `/tools/footage/master/` → copy any club's link or passcode.
- Club: open a copied `/tools/footage/club/?c=<token>` link, or hit `/tools/footage/club/`
  and enter a club passcode.

**Explicitly dummy:** every Download shows a "Phase 2" toast; Preview opens a
placeholder player; downloads are not wired to real files.

---

## Phase 2 checklist
- [x] Firebase Storage bucket (europe-west2) — download pipe proven end-to-end (Stage A)
- [x] Catalogue/state + passcodes in RTDB `app-data/media-footage`; rules deployed (Stage B)
- [x] Folder UI + flexible `files[]` model, tolerant of scrappy delivery (Stage C)
- [ ] **Producer upload page** — external, gated by **passcode/link like a PL2 club**
      (anon-auth + upload scope, no portal account). Uploads direct to Firebase
      Storage; files auto-map by filename
      (`YYYY-MM-DD_<HOME>_<AWAY>_<TYPE>_<VARIANT>.mp4`, extensible/tolerant), and an
      **unmatched file forces a manual map (game + type)** via a "needs mapping" tray
      before it counts as delivered
- [ ] Firebase Storage Security Rules — three scopes via passcode→anon-auth claim:
      **producer write** (upload path), **club read** (own games), NL portal full;
      passcode-bridge Cloud Function mints the scoped claim
- [ ] Real 16-club PL2 meta (names + crests + codes)
- [ ] Wire real downloads (`getDownloadURL()`) + highlights `<video>` preview
- [ ] Superadmin-gate the master tool
- [ ] (Optional) auto-notify the two clubs on publish
- [ ] Confirm supplier delivery format (compression test)
- [ ] (Future) generalise the bucket for club-asset sharing (headshots, docs, packs)
