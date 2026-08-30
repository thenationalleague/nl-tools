# The uploader — spec, not built (30/08/2026)

A "New match" view inside the Brand Exposure tool: pick the fixture, choose
what to scan for, eyeball the references, drop the video, watch it become a
measured match. No terminal anywhere. This is also the live-demo mechanism
and, later, the club-facing Phase 1 of the club-scan plan — so the auth gate
is designed to widen by a rules change, not a rebuild.

## The flow, screen by screen

**1. Fixture.** Home club via `NL.clubPicker` (canon — decides which club
reference folder joins the partners); opponent (clubs-meta list plus
`NL.clubs.guests` for cup sides, free text fallback); date; source type
(highlights / full 90); optional kick-off and full-time trims (become
`BE_START`/`BE_END` — the warm-up rule from the README applies).

**2. Scope — what to scan for.** Richard's switcher. Chips first, detail on
demand:

    [ League partners ]  [ Home club's boards ]  [ Both ]  [ Pick individually ]

"Pick individually" expands to per-sponsor checkboxes (partners and the
club's folders listed separately, select-all per group). Ships to the job as
`BE_SPONSORS` — a comma list of reference FOLDER names — with empty meaning
everything, exactly as today. Engine change required: `load_tree()` grows an
optional allow-list filter; `run_job.py` passes it through. **Choosing a
subset silently sets `reference_set_complete` to false** — share-of-voice is
meaningless against a partial set, and the tool already refuses to show it.

**3. References — the lightbox.** Before any upload, thumbnails of every
reference image the chosen scope will use, listed live from Storage
(`brand-exposure/refs/partners/…` + `clubs/<club>/…`). Tap → full-size
lightbox with sponsor and filename. Two jobs: catch the ground with no club
references before a wasted scan ("no local boards on file for this ground —
scanning partners only"), and catch the bad reference (the Skyline lesson: a
player across the crop means never found). v2 of this screen is the parked
reference manager — upload/replace/retire refs from here; v1 is read-only.

**4. Upload.** Browser → `uploads/` via the Storage SDK's resumable upload:
progress bar, pause/resume, survives a dropped line. Duration read
client-side from video metadata before upload starts, which prices the job
up front: "~4 min of footage → ~10-18p, done ~15 min after upload" (1.7
cost model). Full 90 = ~10GB warning with the hour-plus-on-broadband note.

**5. Start = a request record, not a command.** On upload completion the
tool writes `app-data/ops-brand-exposure/requests/<id>`:

    { video, club, match, date, sponsors: [...], start, end,
      status: "queued", by: <uid>, at: <ts> }

A Cloud Function on request-create validates the author's tool role, fires
the Cloud Run job with the env overrides (Run Admin API — the same
per-execution overrides the CLI uses), stamps `status: "running"` and the
execution name. The job's existing upload step writes the match record as
today; the function flips `status: "done"` (or `"failed"` with the log
link) and **deletes the source video on success** — the "whoever started it
clears up" rule, finally automated. Failures keep the source for one retry
without a re-upload.

**6. Watching.** The tool subscribes to the request record: queued →
scanning → done-with-a-link-to-the-match. No progress percentage in v1 (the
job doesn't publish one); phases and honest timestamps only.

## What it touches beyond the tool page

- `scripts/board_exposure_core.py` — `load_tree` allow-list. Small, tested.
- `scan-job/run_job.py` — `BE_SPONSORS` env pass-through.
- **Cloud Function** (new) — request-create trigger, job launch, status,
  cleanup. Ships via `deploy-functions.yml` (automatic on merge).
- **Storage rules** — staff-admin write to `uploads/*` (size/type capped),
  authed read of `refs/*` for the lightbox. One button:
  `deploy-storage-rules.yml`.
- **RTDB rules** — `requests/` writable by tool admins, readable by tool
  users. One button: `deploy-rtdb-rules.yml`. Edit the full snapshot.
- Registry: no new toolKey — this is a view of `ops-brand-exposure`.

## Passing means (smoke test, layperson)

1. Phone, no terminal: pick Sutton v X, partners-only, see the reference
   thumbnails, upload a 90-second clip, watch queued → scanning → done, open
   the match, boxes drawn. Under five minutes end to end.
2. Pick two individual sponsors → the finished match scans ONLY those, and
   share-of-voice shows the "reference set incomplete" refusal.
3. Kill the wifi mid-upload, reconnect → upload resumes, not restarts.
4. A non-admin user sees no New match view and cannot write a request
   (rules-tested, not just hidden).
5. The source video is gone from `uploads/` after success; still there
   after a forced failure.

## Open questions (answer before build)

1. **Who uploads in v1?** Richard-only (superadmin), or all staff-admins of
   the tool? Decides the storage rule and how carefully the cost estimate
   needs to nag.
2. **Size cap** on `uploads/*` — 12GB covers a full 90 with headroom; hard
   cap or warn-only?
3. **Failure retention** — keep failed sources 48h then a scheduled sweep,
   or keep until manually cleared?
4. **Competition field** — worth capturing now (league/cup shapes future
   roll-ups) or YAGNI until a second competition is actually scanned?
5. **Concurrency** — two requests at once: queue them in the function
   (serial), or let Cloud Run run both (it can)? Serial is simpler to watch
   and the honest default for a one-club pilot.
