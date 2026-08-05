# NL Tools — Cloud Functions

Eight functions:
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
- **`clubDirectoryAuth`** (`club-directory.js`) — the same shape and the same
  org-policy reason, for the Club Directory's per-person editor codes.
- **`handbookRenderOnPublish`** (`handbook.js`) — publishing a handbook edition
  dispatches `render-handbook-pdf.yml`, so the PDF renders in about two minutes
  instead of whenever the hourly poll next came round. **This is the only
  function holding a non-Google credential** — see *The GitHub token* below.

See the headers of `index.js` / `account.js` for details.

This is the **only server-side code** in the repo; everything else is a static
site. It runs in the `nl-tools` Firebase project (Blaze), region `europe-west2`.

## Deploy — via GitHub Actions (no terminal)

Deployment is automated by `.github/workflows/deploy-functions.yml`, which
reuses the same Workload Identity Federation auth as the GA pipeline. It runs on
any push that changes `functions/**`, or on demand (**Actions → Deploy Cloud
Functions → Run workflow**). Note that it deploys **every** function in this
directory, not the one it is named after — it was called `deploy-footage-proxy.yml`
until 04/08/2026 and had been doing that the whole time.

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
| `firebase-adminsdk-fbsvc@` (runtime) | `roles/eventarc.eventReceiver` | The **RTDB-triggered** functions (`programmeAuth`, `clubDirectoryAuth`, `handbookRenderOnPublish`) deliver via Eventarc, and the runtime identity must be allowed to receive events. Without it: `403 … Permission 'eventarc.events.receiveEvent' denied`. |
| `firebase-adminsdk-fbsvc@` (runtime) | `roles/secretmanager.secretAccessor` on `GITHUB_DISPATCH_TOKEN` | `handbookRenderOnPublish` reads that secret at run time. Granted on the secret itself, not project-wide — see *The GitHub token* below. |

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

## The GitHub token (`handbookRenderOnPublish` only)

Every other automation in this project authenticates to Google keylessly, through
Workload Identity Federation. Dispatching a GitHub workflow cannot work that way,
so this one function needs a stored credential — the only one in the project.

**Create it before the function first deploys.** `defineSecret` fails the deploy
when the secret is missing, which is the right way round, but it does mean
*Deploy Cloud Functions* will fail until this is done.

Both steps are browser-only. No terminal.

1. **Mint the token** — GitHub → *Settings* → *Developer settings* → **Fine-grained
   personal access tokens** → *Generate new token*.
   - Repository access: **Only select repositories** → `thenationalleague/tools`
   - Permissions → Repository permissions → **Actions: Read and write**. Nothing else.
   - Set an expiry you will actually notice. When it lapses the dispatch starts
     failing and the hourly poll silently takes over — the PDF still arrives, so
     nothing looks broken from the outside. The function logs
     `Handbook render dispatch failed: 401` when this happens, and that log line
     is the only symptom you get.
2. **Store it** — Google Cloud console → *Security* → **Secret Manager** (project
   `nl-tools`) → *Create secret*.
   - Name: **`GITHUB_DISPATCH_TOKEN`** (exact — `handbook.js` looks it up by name)
   - Secret value: paste the token
   - Then open the secret → *Permissions* → grant
     `firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com` the
     **Secret Manager Secret Accessor** role, so the running function can read it.

To rotate: add a **new version** to the same secret, then re-run *Deploy Cloud
Functions* so the function picks it up.

### Checking the doorbell works

Publish a handbook edition, then watch **Actions → Render handbook PDF**. A run
should appear within seconds, and its trigger should read `workflow_dispatch`
rather than `schedule`. If none appears, the function's logs say why — Firebase
console → *Functions* → `handbookRenderOnPublish`.

Until that has been seen to work at least once, the hourly schedule in
`render-handbook-pdf.yml` is what is actually keeping the PDF current. Leave it
alone until then; dropping it to daily is the follow-up, not part of this.

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
