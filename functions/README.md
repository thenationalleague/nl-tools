# NL Tools — Cloud Functions

Six functions:
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

See the headers of `index.js` / `account.js` for details.

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

## What it does once live

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
