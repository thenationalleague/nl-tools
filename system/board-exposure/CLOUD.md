# Brand Exposure in the cloud

**Status: the job exists, the button does not.** A match can be measured on
Cloud Run today, by someone who can run one `gcloud` command in Cloud Shell.
The upload screen that would let anyone do it from a phone is not built — see
*What is missing* at the foot.

There are two routes to a measured match and they produce the same record:

| | Local | Cloud |
|---|---|---|
| Runs on | a laptop with Python, ffmpeg and OpenCV | Cloud Run Jobs |
| Costs | nothing but electricity and half an hour of the machine | ~7p for a highlights package; ~£1.20 for a full match |
| Started by | `board-exposure-match.py --upload` | `gcloud run jobs execute` (for now) |
| Good for | **full matches** | **highlights, and anyone without the tooling** |

**Full matches belong on a laptop.** Measured on the first real cloud run: an
8m14s package took about four minutes of scanning at 8 vCPU. Samples scale with
length and cost scales again with reference count, so a 95-minute match with ten
references is roughly 11× the samples and 2.5× the references — near two hours,
about £1.20, and past the 7200s task timeout set in the deploy workflow. The
same match on a laptop is free and half an hour of a machine nobody is using.

What the local route costs afterwards is almost nothing: uploading the proxy and
detections is ingress, which is free, and storing a ~150 MB proxy is under half
a penny a month. A season of full matches is pennies a month.

Playback egress is smaller than the file size suggests, because the player never
downloads the whole thing unless somebody sits and watches it. `preload` is
metadata-only and `+faststart` puts the index at the front, so opening a match
fetches a few hundred KB; jumping between appearances — which is what the player
is *for* — pulls only the seconds around each one. A typical look at a match is
10–30 MB, well under a penny. Watching all 95 minutes end to end is the 150 MB
worst case, about 2p, and the browser caches it for the next visit.

Both run **the same `scripts/board-exposure-match.py`**. The cloud container
does not reimplement the detector; it fetches the inputs, runs that script, and
lets it upload its own results. Two implementations would drift within a month
and the drift would surface as a number rather than an error.

---

## What the container is

`scan-job/` — a Dockerfile and `run_job.py`, which is plumbing only and must
never grow detection logic.

It holds **two identities on purpose**:

- **Reads** use the runtime service account through the metadata server, granted
  `objectViewer` and nothing else. It can fetch artwork and footage; it cannot
  write a byte.
- **Writes** use an ingest key from Secret Manager, exactly as a laptop does,
  which buys a token scoped to the one match named in the environment. A
  service-account key with write access would be a credential that could
  overwrite every match in the tool. This one can overwrite the match it was
  asked to measure, and nothing else.

The source video is not deleted by the job, for the same reason — it cannot
delete anything. Whoever starts a scan clears up after it.

## Where the references live

Not in the repo. `refs/` is gitignored, and sponsor artwork does not belong in a
public repository. The cloud job reads them from Storage:

```
brand-exposure/refs/partners/<Sponsor>/*      searched at EVERY ground
brand-exposure/refs/clubs/<Club>/<Sponsor>/*  that club's ground only
```

Folder-as-configuration, the same contract the local run uses — the job mirrors
the tree verbatim into the container, minus the prefix. **A missing reference is
not a zero.** If the tree is empty the job refuses rather than measuring nothing
and reporting every sponsor as absent, which would be a lie with a number
attached.

## Running one, today

Two commands in [Cloud Shell](https://console.cloud.google.com/?cloudshell=true&project=nl-tools&authuser=media%40thenationalleague.org.uk).
The first puts the video in the bucket; the second measures it.

```
gcloud storage cp match.mp4 gs://nl-tools.firebasestorage.app/uploads/match.mp4
```

```
gcloud run jobs execute brand-exposure-scan --region=europe-west2 --project=nl-tools --wait --update-env-vars=BE_VIDEO=uploads/match.mp4,BE_CLUB="Sutton United",BE_MATCH="Sutton United v Barnet",BE_DATE=2026-08-23,BE_REFERENCE_SET=complete,BE_START=18:30,BE_END=2:05:00
```

`BE_START` / `BE_END` are optional and trim to the match itself. Leave them off
and the whole file is measured, including the holding slate and the warm-up —
which are real boards on real grass and will inflate every share.

`BE_REFERENCE_SET` is `complete` or `partial` and cannot be guessed by anything.
Share of voice stays withheld unless it says `complete`, because five references
at a twenty-board ground make every sponsor's share look enormous.

When it finishes the match is in the tool, with its video and its boxes. Then
delete the source:

```
gcloud storage rm gs://nl-tools.firebasestorage.app/uploads/match.mp4
```

## Sizing, and why it costs what it costs

The task is 8 vCPU / 16 GiB with no retries.

Memory is sized for what `/tmp` has to hold, because Cloud Run's `/tmp` is
tmpfs and therefore RAM: a 90-minute match is roughly 6 GB of source video plus
4.5 GB of extracted frames. Highlights need a fraction of that, and the ceiling
costs nothing extra — Cloud Run bills what is used, not what is reserved.

Almost all of the money is SIFT burning CPU. That means:

- **Reference count is linear.** Ten sponsors cost roughly twice five.
- **Sample rate is linear.** 5 fps costs 2.3× what 2 fps costs and, measured
  over a real match, agreed within about 2%. 2 fps is the default for that
  reason.
- **Trimming pays twice** — less to scan, and a denominator that is the match
  rather than the broadcast.
- Parallelism makes it *faster*, not cheaper.

`--max-retries=0` is deliberate: a scan that failed halfway has already spent
the CPU, and retrying doubles the bill for a fault that is nearly always the
input.

## What is missing

1. **A trigger.** Starting a scan is a `gcloud` command, so it needs Cloud
   Shell. The intended shape is the estate's usual one — the tool writes a job
   record to RTDB, a trigger function starts the Cloud Run Job — because the org
   policy on this project blocks public invokers and rules that out as an
   endpoint. See `functions/brand-exposure.js` for the same pattern.
2. **An upload screen**, so a video can be chosen, trimmed and named without a
   terminal. Firebase Storage does resumable uploads natively, so a 6 GB full
   match is the same code as a 300 MB highlights package.
3. **A reference manager**, so sponsor artwork can be added without
   `gcloud storage cp` — specced in `system/board-exposure/REFERENCES.md`,
   which also carries the open question of whether share of voice is a metric
   anybody actually wants. If it is not, most of the completeness machinery in
   this system stops being needed.
4. **A real bill.** Everything above about cost is arithmetic from measured
   local runtime, not an invoice. Run one match and read the actual number
   before anyone plans around it.

## First run, before any of this works

Three things have to exist in the project, none of which this repo can create:

- the secret `brand-exposure-ingest-key`, holding a key minted in the tool
  under **Ingest keys**;
- a service account for the job with `objectViewer` on the bucket, named in the
  `GCP_SCAN_JOB_SA` repository secret;
- the reference tree under `brand-exposure/refs/`.

Then **Actions → Deploy scan job → type `publish`** builds the image and creates
the job.
