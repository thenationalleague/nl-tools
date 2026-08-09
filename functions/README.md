# NL Tools — Cloud Functions

The functions in this directory:
- **`makeProxy`** — generates the 360p preview proxy for NL Cup Footage on upload.
- **`onFootageDeleted`** — when a footage file is deleted in Storage (console, gsutil,
  or the master ✕), it removes the file's RTDB record(s) and its proxy, so a
  direct-in-Storage delete self-heals (no orphan record or orphan proxy).
- **`consumeInvite`** / **`submitAccessRequest`** / **`withdrawAccessRequest`** —
  account-lifecycle callables (`account.js`). These mint the `users/<uid>`
  record **server-side** so a client can never write its own role — the durable
  fix for the self-grant hole in `system/rtdb/SECURITY-role-self-grant.md`.
  Called by the login page (`/index.html`) via the callable HTTPS protocol.
- **`programmeAuth`** (`programme.js`) — Programme Packs passcode → scoped
  `pClub` claim. An **RTDB trigger**, not a callable, and in **europe-west1**:
  the org policy blocks granting public invoker to new Cloud Run services, and
  Programme Packs clubs have no Google account. See the file header.
- **`nlsIngestTick`** / **`nlsIngestHourly`** (`nls-ingester.js`) — the NLS →
  RTDB live ingester. **Scheduled**, not triggered, and the only functions here
  that write to a **different project's** database (`nl-widgets`). See the
  section below — they need one extra IAM grant that nothing else does.

See the headers of `index.js` / `account.js` for details.

This is the **only server-side code** in the repo; everything else is a static
site. It runs in the `nl-tools` Firebase project (Blaze), region `europe-west2`.

## Deploy — via GitHub Actions (no terminal)

Deployment is automated by `.github/workflows/deploy-functions.yml`, which
reuses the same Workload Identity Federation auth as the GA pipeline. It runs on
any push that changes `functions/**`, or on demand (**Actions → Deploy Cloud Functions → Run workflow**).

**One-time setup** (Google Cloud console, no terminal), so the deploy identity is
allowed to deploy:

1. **Enable APIs** — console → *APIs & Services* (project `nl-tools`): enable
   **Cloud Functions**, **Cloud Build**, **Artifact Registry**, **Eventarc**,
   **Cloud Run**.
2. **Grant roles** — console → *IAM* → find the service account used by
   `GCP_SERVICE_ACCOUNT` → **Edit** → add:
   - Cloud Functions Admin (`roles/cloudfunctions.admin`)
   - Cloud Run Admin (`roles/run.admin`)
   - Cloud Build Editor (`roles/cloudbuild.builds.editor`)
   - Artifact Registry Administrator (`roles/artifactregistry.admin`)
   - Eventarc Admin (`roles/eventarc.admin`)
   - Service Account User (`roles/iam.serviceAccountUser`)
   - Firebase Admin (`roles/firebase.admin`)
   _(If that's fiddly, `roles/editor` + Service Account User gets it working; tighten later.)_
3. **Eventarc event receiver** — needed once, for `programmeAuth` (the first
   **RTDB-triggered** function in the project). Gen-2 RTDB triggers are delivered
   through Eventarc, and the trigger's *runtime* service account must be allowed
   to receive events. Without it the deploy fails with:

   > `403 Validation failed for trigger .../programmeauth-…: Permission
   > 'eventarc.events.receiveEvent' denied on resource`

   Console → *IAM* → `firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com`
   → **Edit** → add **Eventarc Event Receiver** (`roles/eventarc.eventReceiver`).
   Or in Cloud Shell:

   ```bash
   gcloud projects add-iam-policy-binding nl-tools \
     --member="serviceAccount:firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com" \
     --role="roles/eventarc.eventReceiver"
   ```

   That SA is pinned deliberately (see `account.js`): the gen-2 default compute
   SA holds no Firebase roles, so RTDB drops its connection and `createCustomToken`
   would fail. Note the function runs in **europe-west1** — an RTDB trigger must
   sit in the database's region, not the `europe-west2` default the rest use.
4. **Run it** — Actions tab → *Deploy Cloud Functions* → **Run workflow**.

### Required roles, by function

Facts the deploy depends on — not a walkthrough. If a deploy fails on
permissions, this is the list to check it against.

| Identity | Needs | Why |
|---|---|---|
| `GCP_SERVICE_ACCOUNT` (deploy) | the roles in step 2 | deploys everything |
| `firebase-adminsdk-fbsvc@` (runtime) | `roles/eventarc.eventReceiver` | `programmeAuth` is the project's only **RTDB-triggered** function; gen-2 RTDB triggers deliver via Eventarc and the runtime identity must be allowed to receive events. Without it: `403 … Permission 'eventarc.events.receiveEvent' denied`. |

`programmeAuth` pins that service account deliberately (see `account.js`): the
gen-2 default compute SA holds no Firebase roles, so RTDB drops its connection
and `createCustomToken` fails. It also runs in **europe-west1**, not the
`europe-west2` the others use — an RTDB trigger must sit in the database's
region.

`ffmpeg` ships with the function via `ffmpeg-static`, so there's nothing else to
install. Logs: `firebase functions:log` — or the **Functions** page in the console.

### Alternative — Google Cloud Shell (browser terminal)
If you'd rather do a one-off: open **Cloud Shell** in the Firebase console (you're
already authed as owner), then `git clone` the repo and
`firebase deploy --only functions --project nl-tools` from the repo root.

## The NLS ingester (`nls-ingester.js`)

Polls the NLS API on a fixture-derived schedule, shapes the response and writes
it to `nls/` in the **nl-widgets** database. Widgets will read RTDB rather than
calling NLS directly — nineteen call sites do today, and Fan Widgets alone makes
up to sixty paginated requests on load.

Two Cloud Scheduler jobs, created by the deploy:

| Function | Schedule | What it does |
|---|---|---|
| `nlsIngestTick` | every 1 minutes | Derives today's state and returns immediately unless something is due. The no-op path costs one small RTDB read and **no NLS request**. |
| `nlsIngestHourly` | every 1 hours | Full pass: official league tables, the season fixture node, the scorer coverage flag. |

Cadence is derived from today's fixtures and is never hardcoded — 60s while
anything is in play, 2 minutes in the pre-match window while team news is still
arriving, 5 minutes once a lineup is complete, hourly otherwise, plus a 20-minute
tail after the last whistle because officials keep entering cards. The rules are
in `nls/schedule.js` and are covered by `tests/nls-ingester.test.mjs`.

### One-time setup, in addition to the list above

1. **Cross-project database access.** These are the only functions here that
   write to another project. Console → *IAM* on the **`nl-widgets`** project →
   **Grant access** → principal
   `firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com` → role **Firebase
   Realtime Database Admin** (`roles/firebasedatabase.admin`).
   Without it every write fails with `PERMISSION_DENIED` and `meta/ingest`
   never appears.
2. **Cloud Scheduler API** must be enabled on `nl-tools` (console → *APIs &
   Services*). The deploy creates the two jobs; it cannot enable the API.
3. **RTDB rules on nl-widgets.** `embeds/nl-widgets.rules.json` carries the
   `nls/` block. That project has **no rules deploy workflow** — the file is a
   snapshot and has to be pasted into the nl-widgets console by hand.
   Reads are granted per slice (`live/index/<comp>/<ymd>`, `live/matches/<id>`,
   `events/<ymd>`, …) and never at `nls/` itself, so a consumer has to subscribe
   to a scoped path rather than the namespace. That is the bandwidth design and
   the licensing posture in the same rule. `seen/` is granted to nobody — it is
   an internal dedup guard. Public read is a later decision and is deliberately
   not made here.

### Watching it

`nls/meta/ingest` carries `lastRun`, `lastSuccess`, `mode`, `liveCount`,
`errorCount` and `failedCompetitions` after every run.

The real risk is not an error, it is silence: an ingester that has stopped
produces no errors at all. The run emits a structured `NLS_INGEST_STALE` error
log when no successful ingest has landed for over five minutes during a live
window. **Attach a log-based alert to it** — console → *Logging* → *Logs-based
metrics*, filter `jsonPayload.message="NLS_INGEST_STALE"`, then an alert policy
on that metric. The code cannot create that policy; someone has to.

### Cost

Cloud Run: pennies. The minute job is a no-op outside match windows, and real
work runs perhaps six hours a week. RTDB: low single figures monthly, provided
write-on-change and scoped slices hold — both exist to protect that number.

## What the footage proxy does once live

- Fires when a file lands under **`footage/national-league-cup/`**.
- Proxies **any file up to 2 GiB** (`MAX_PROXY_BYTES`); larger files (full matches,
  6–10 GB) are skipped and stay **download-only**. The gate is **file size, not the
  filename** — a producer can misname a highlights file and it still gets a preview.
- Writes a **360p ~500 kbps faststart MP4** to **`footage/national-league-cup/proxies/<same-name>`**.
- Idempotent (skips if the proxy already exists).

The club page derives the proxy path from the original and streams it for
preview, falling back to the full file if the proxy isn't there yet — so nothing
breaks before the function is deployed.

## Tuning

Change the rung in `index.js` (`-vf scale=-2:360`, `-b:v 500k`): e.g. `-2:480`
`-b:v 800k` for sharper, or `-2:240` `-b:v 250k` for ultra-light.

## Cost

Only the small highlights files are processed — seconds of CPU each, ~71 games a
season → negligible compute, and each proxy is ~10–40 MB. This is a *proxy*, not
a re-encode of the 6–10 GB deliverables, so it does not affect the storage/egress
cost model.
