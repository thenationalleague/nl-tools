# Give the deployer an honest name, and only the roles it uses

**Status: parked. Decided in principle, not scheduled.** Nothing is broken;
this is a tidy-up with a real payoff and a real failure mode.

## The problem

Every deploy in this repo authenticates as:

```
nl-archive-ga-reader@nl-tools.iam.gserviceaccount.com
```

It is named for the GA archive pipeline, which is what it was created for. It
has since become the deployer for **everything** — RTDB rules, Storage rules,
Cloud Functions, the tools registry, Apps Script, and as of 28/08/2026 the
Brand Exposure scan container.

Working that out took twenty minutes on the night it mattered. The name says
"reads Google Analytics"; the account can rewrite the rules that govern 72
clubs' data. Nobody reading an audit line or an IAM list would guess that.

Two things are wrong, and the second is the one that matters:

1. **The name is a lie.** Cosmetic, but it costs somebody twenty minutes every
   time it comes up.
2. **Nobody knows what roles it holds, or why.** They have accumulated since it
   was a GA reader, one incident at a time. Four were added on 28/08/2026 for
   the scan job — Cloud Build Editor, Artifact Registry Administrator, Cloud
   Run Admin, Storage Admin — of which Storage Admin is the broadest thing on
   the account and exists only so Cloud Build can stage a source tarball.

A service account nobody can describe is one nobody can safely reduce.

## Why a rename alone will not do

The display name is editable. **The email is permanent** — service account IDs
cannot be changed. So an honest name means a new account, and a new account is
the natural moment to grant only what is actually used. The audit is the prize;
the name is the excuse to do it.

## The migration, in the order that keeps it safe

The whole thing turns on there being an **overlap window where both accounts
work**. Nothing is removed until the replacement is proven.

1. **Create** `nl-tools-deployer@nl-tools.iam.gserviceaccount.com`.
2. **Grant it roles** — deliberately, from the list below, not by copying the
   old account wholesale. Copying it forward is how the mess got here.
3. **Bind it to the GitHub identity pool.** `roles/iam.workloadIdentityUser`
   for the same principalSet, on pool `github-actions` in project number
   `801354670005`. **From this moment both accounts work.**
4. **Change the `GCP_SERVICE_ACCOUNT` repository secret** to the new email.
5. **Prove it with a run that cannot do damage:**
   **Actions → Deploy tools registry → `report` mode.** That exercises the full
   authentication path and writes nothing at all. If it passes, the new
   identity works.
6. **Then** exercise each real deploy once, watching for a permission error —
   each one names precisely what is missing, which is how the true role list
   gets found rather than guessed.
7. **Only then** strip the old account's roles, leave it a day, and delete it.

Reversing at any point before 7 is one secret change back.

## What to grant, and what to question

Start from what each workflow actually does rather than from the old account:

| Needed by | Role | Notes |
|---|---|---|
| `deploy-rtdb-rules`, `deploy-storage-rules`, `deploy-functions` | Firebase deploy roles | via `firebase-tools`; confirm the minimum rather than assuming Editor |
| `deploy-tools-registry` | RTDB write | it replaces one node |
| `rebuild-index` | GA read + the data bucket | the original purpose |
| `deploy-scan-job` | Cloud Build Editor, Artifact Registry Administrator, Cloud Run Admin | |
| `deploy-scan-job` | Storage Admin | **question this one.** It exists so `gcloud builds submit` can create and write the `nl-tools_cloudbuild` staging bucket. If that bucket is pre-created by hand, `objectAdmin` scoped to it would do instead of project-wide Storage Admin. |
| `deploy-scan-job` | Service Account User on `brand-exposure-scan` | to run the job as it |

The Storage Admin line is the single biggest reduction available and the
obvious first thing to try narrowing.

## Cost and risk, honestly

An hour, most of it waiting for workflow runs. The failure mode is that every
deploy in the repo stops until the secret is changed back — loud, immediate,
and one step to undo. That is a good failure mode, which is why this is worth
doing at all rather than living with the name.

**Do it on a quiet afternoon, not on the evening of a release.** It was
deliberately not done on 28/08/2026 for exactly that reason, with four merges
already in flight.

## While it is parked

`nl-archive-ga-reader` **is** the deployer. That fact is recorded here, in
`system/RUNBOOK.md`, and nowhere in the account's own name.
