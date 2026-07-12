# NL Tools — Cloud Functions

One function today: **`makeProxy`** — generates the 360p preview proxy for
NL Cup Footage highlights. See the header of `index.js` for what it does.

This is the **only server-side code** in the repo; everything else is a static
site. It runs in the `nl-tools` Firebase project (Blaze), region `europe-west2`.

## Deploy — via GitHub Actions (no terminal)

Deployment is automated by `.github/workflows/deploy-footage-proxy.yml`, which
reuses the same Workload Identity Federation auth as the GA pipeline. It runs on
any push that changes `functions/**`, or on demand (**Actions → Deploy footage
proxy function → Run workflow**).

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
3. **Run it** — Actions tab → *Deploy footage proxy function* → **Run workflow**.

`ffmpeg` ships with the function via `ffmpeg-static`, so there's nothing else to
install. Logs: `firebase functions:log` — or the **Functions** page in the console.

### Alternative — Google Cloud Shell (browser terminal)
If you'd rather do a one-off: open **Cloud Shell** in the Firebase console (you're
already authed as owner), then `git clone` the repo and
`firebase deploy --only functions --project nl-tools` from the repo root.

## What it does once live

- Fires when a file lands under **`footage/incoming/`**.
- Only for **highlights / clips** (`…_HL_…`, `…_CLIPS…`); full matches are skipped
  (download-only).
- Writes a **360p ~500 kbps faststart MP4** to **`footage/proxies/<same-name>`**.
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
