# The uploader — built 30/08/2026, same day as the spec

Everything below shipped as written, in one PR: the Scan footage view in
the tool (v0.8), `brandExposureScanRequest` + `brandExposureScanPoll` in
functions/, the `load_tree` allow-list, `BE_SPONSORS` through `run_job.py`,
and both rules snapshots. Two one-time follow-ups after the merge, and one
standing fact:

- **Rules buttons**: `deploy-storage-rules.yml` and `deploy-rtdb-rules.yml`
  (nl-tools target), each Run workflow → type `publish`.
- **IAM, once, in Cloud Shell** — the functions' service account has to be
  allowed to fire the job and clean up after it (grants are idempotent):

      gcloud run jobs add-iam-policy-binding brand-exposure-scan \
        --region=europe-west2 --project=nl-tools \
        --member=serviceAccount:firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com \
        --role=roles/run.jobsExecutorWithOverrides
      gcloud projects add-iam-policy-binding nl-tools \
        --member=serviceAccount:firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com \
        --role=roles/run.viewer
      gcloud storage buckets add-iam-policy-binding gs://nl-tools.firebasestorage.app \
        --member=serviceAccount:firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com \
        --role=roles/storage.objectAdmin

- The poller trusts the Run API's documented Execution shape (doc URL in
  the source); on the first real scan through the tool, check the request
  flips to done and the source vanishes before trusting it unattended.

A "New match" view inside the Brand Exposure tool: pick the fixture, choose
what to scan for, eyeball the references, drop the video, watch it become a
measured match. No terminal anywhere. This is also the live-demo mechanism
and, later, the club-facing Phase 1 of the club-scan plan — so the auth gate
is designed to widen by a rules change, not a rebuild.

## The flow, screen by screen

**1. Fixture.** A results picker fed from NLS, not a blank form: choose the
season (current / 2025-26), pick the home club via `NL.clubPicker` (canon —
also decides which club reference folder joins the partners), tap the match.
Opponent, date, competition and venue fill themselves, and the NLS `matchID`
rides along on the record so scans can join league data later. Verified
30/08/2026: the NLS results feed serves both seasons — season 2025 returns
Sutton United v Altrincham, 18/04/2026, VBS Community Stadium, in one
filtered call. Free-text entry stays as the fallback for footage NLS has no
row for (friendlies, pre-season). Then: source type (highlights / full 90)
and optional kick-off and full-time trims (become `BE_START`/`BE_END` — the
warm-up rule from the README applies). **Built 30/08/2026: the trims are
four marks** — KO / half-time whistle / second-half restart / FT. The
half-time pair travels as `BE_HT`/`BE_RESTART` and the break between them
is never extracted, so half-time adverts cannot count as boards and the
skipped minutes come off the price. See "The halves marks" in the README
for the seam mechanics. scout-sid pins the exact
browser-side feed shape before any fetch code is written — several tools
already read NLS from the page, so the transport is proven.

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
a real progress bar (the SDK reports bytes), pause/resume, survives a
dropped line. Duration read client-side from video metadata before upload
starts, which prices the job up front: "~4 min of footage → ~10-18p, done
~15 min after upload" (1.7 cost model). Full 90 = ~10GB with the
hour-plus-on-broadband note. **No size cap** — GCS charges nothing for
ingress, and 10GB parked for two days is about a penny of storage, so a cap
would be protecting no cost. The only checks are `video/*` content type and
a warn-only "bigger than a typical full 90 — right file?" above ~20GB:
mistake-catching, not budget control.

**5. Start = a request record, not a command.** On upload completion the
tool writes `app-data/ops-brand-exposure/requests/<id>`:

    { video, club, match, date, sponsors: [...], start, end,
      status: "queued", by: <uid>, at: <ts> }

A Cloud Function on request-create validates the author is a superadmin
(re-checked server-side — the RTDB rule alone is not the last line), then
fires the Cloud Run job with the env overrides (Run Admin API — the same
per-execution overrides the CLI uses), stamps `status: "running"` and the
execution name. **Requests are a serial queue**: if a scan is already
running, the new record simply stays `"queued"`, and the completion handler
launches the oldest queued request next — one job at a time is simpler to
watch and the honest default for a one-club pilot. The job's existing
upload step writes the match record as today; the function flips
`status: "done"` (or `"failed"` with the log link) and **deletes the source
video on success** — the "whoever started it clears up" rule, finally
automated. Failures keep the source for 48h — one retry without a
re-upload — then a scheduled sweep deletes it, so the bucket never
accumulates dead footage.

**6. Watching.** The tool subscribes to the request record: queued (with
place in the queue) → scanning → done-with-a-link-to-the-match. The upload
bar is real; the scan bar in v1 is elapsed-against-estimate — duration is
known so the estimate is decent, and it is labelled as an estimate, because
the job publishes no true percentage yet. The upgrade is small and known:
`run_job` already counts frames, so stamping a coarse % onto the request
record every half-minute makes the bar honest. v1.1, if the estimate
grates.

## What it touches beyond the tool page

- `scripts/board_exposure_core.py` — `load_tree` allow-list. Small, tested.
- `scan-job/run_job.py` — `BE_SPONSORS` env pass-through.
- **Cloud Function** (new) — request-create trigger, job launch, status,
  cleanup. Ships via `deploy-functions.yml` (automatic on merge).
- **Storage rules** — new `uploads/{file}` block: email-claim write,
  `video/*` type check, **no size cap** (ingress is free; the type check is
  mistake protection). Storage rules cannot read RTDB roles, so the
  superadmin gate does NOT live here — it lives on the request record and
  in the function, per the bucket's own documented pattern: an upload
  nobody can point at is inert, and the sweep clears it. (A hard file-level
  lock would be a `superadmin` custom claim synced by a small function —
  noted, not built.) Plus authed read of `refs/*` for the lightbox. One
  button: `deploy-storage-rules.yml`.
- **RTDB rules** — `requests/` creatable by superadmins only (RTDB rules
  CAN read `users/<uid>/role`, so this is the rules-tested gate), readable
  by tool users. One button: `deploy-rtdb-rules.yml`. Edit the full
  snapshot.
- Registry: no new toolKey — this is a view of `ops-brand-exposure`.

## Passing means (smoke test, layperson)

1. Phone, no terminal: pick Sutton v X, partners-only, see the reference
   thumbnails, upload a 90-second clip, watch queued → scanning → done, open
   the match, boxes drawn. Under five minutes end to end.
2. Pick two individual sponsors → the finished match scans ONLY those, and
   share-of-voice shows the "reference set incomplete" refusal.
3. Kill the wifi mid-upload, reconnect → upload resumes, not restarts.
4. A non-superadmin sees no New match view and cannot write a request
   (rules-tested, not just hidden).
5. The source video is gone from `uploads/` after success; still there
   after a forced failure.

## Decisions (30/08/2026)

The five open questions, answered same day. Folded into the sections above;
recorded here so the reasoning survives.

1. **Who uploads** — all superadmins. Not Richard-only, not staff-admins:
   the request-create rule checks `role == 'superadmin'`, and widening
   later is a one-line rules change, not a rebuild.
2. **Size cap** — none. The question back was "do we really get charged for
   ingress?", and the answer is no: GCS ingress is free, transient storage
   is ~2p/GB/month pro-rata, and the scan itself — priced up front — is the
   only real cost. A cap defends nothing, so the rule checks type only and
   the UI warns (never blocks) on implausible sizes.
3. **Failure retention** — 48h, then the scheduled sweep. One retry window
   without a re-upload; no dead footage accumulating.
4. **Fixture data** — from NLS, current season + 2025/26, verified live
   (the Sutton v Altrincham row returns with date, venue and competition).
   The competition field therefore costs nothing to capture and is
   captured, along with `matchID`. scout-sid pins the exact feed shape at
   build time.
5. **Concurrency** — serial queue in the function, with progress bars: real
   for upload, elapsed-vs-estimate for the scan (a true scan % is a small
   `run_job` change, queued as v1.1).
