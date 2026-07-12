# NL Tools — Cloud Functions

One function today: **`makeProxy`** — generates the 360p preview proxy for
NL Cup Footage highlights. See the header of `index.js` for what it does.

This is the **only server-side code** in the repo; everything else is a static
site. It runs in the `nl-tools` Firebase project (Blaze), region `europe-west2`.

## Deploy

Prereqs: Node 20, the Firebase CLI (`npm i -g firebase-tools`), and access to the
`nl-tools` project. The project is already on the Blaze plan.

```bash
# from the repo root
cd functions && npm install && cd ..
firebase login          # once
firebase use nl-tools   # or rely on .firebaserc (default: nl-tools)
firebase deploy --only functions
```

The first deploy enables the required APIs (Cloud Functions, Cloud Build,
Artifact Registry, Eventarc) — accept the prompts. `ffmpeg` ships with the
function via `ffmpeg-static`, so nothing else to install.

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
