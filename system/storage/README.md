# Firebase Storage config

The live configuration for `nl-tools.firebasestorage.app`. The rules file **is**
what is deployed — same contract as `system/rtdb/rules.snapshot.json`, not a
snapshot someone remembered to update.

| File | What it is | How it gets live |
|---|---|---|
| `rules.snapshot.rules` | The full Storage security rules. Key idiom: `request.auth.token.email != null` separates real portal accounts from the anonymous capability sessions (programme, formerly footage), which carry no email claim. | Actions → **Deploy Storage rules** → type `publish` |
| `cors.json` | Bucket CORS. Needed whenever a page reads bytes into itself rather than handing the browser a link — the programme zip download, and the website-archive index fetch. A plain single-file download is unaffected. | Not settable in any console UI, and not deployable through the Firebase CLI either. Cloud Shell: `gcloud storage buckets update gs://nl-tools.firebasestorage.app --cors-file=system/storage/cors.json` |

The deploy checks what the rules *grant* before publishing, not just that they
parse: an unconditional `if true`, or a catch-all that permits write, fails the
run. A malformed file the API would reject anyway is the easy case; an open
bucket deploys cleanly and looks fine.

## Why this directory exists

Until 15/08/2026 there were three Storage rules files: `/storage.rules`,
`system/storage/rules.snapshot.rules` and `system/rtdb/storage.rules.snapshot`.
Each was headed "source of truth". The newest carried Programme Packs; the
oldest denied every read in the bucket and would have taken the tool offline if
anyone had pasted it. They were a month apart and nothing pointed at which was
which.

The live one is now the only one, and it is under `system/storage/` because
Storage is not RTDB — `system/rtdb/` was simply where the first one landed.

Three copies was a symptom, not the disease. The disease was that publishing
meant pasting into a console, so the repo held snapshots rather than sources and
nothing could tell you which snapshot was true. The deploy workflow is the fix;
deleting the other two was tidying up after it.

## What is in the bucket

| Prefix | Written by | Read by |
|---|---|---|
| `data/` | the Rebuild article index Action, through a service account | website-archive (`articles-index.json`) |
| `programme/<CODE>/` | clubs and NL admins, through the tool | the same tool, across all 73 folders |
| `newsletter/library/` | staff, through the newsletter tool | the same tool |
| `footage/national-league-cup/` | nothing — the tool was retired 15/08/2026 | nothing |

`footage/` still costs money and still has a rules block, deliberately: deleting
the block first would orphan the files rather than remove them. Rule and bytes
go together. See [`../retired/nl-cup-footage.md`](../retired/nl-cup-footage.md).

## `data/` — the nightly feeds

Three objects, all written by
[`rebuild-index.yml`](../../.github/workflows/rebuild-index.yml) at 03:00 UTC:
`articles-index.json` (29MB), `ga-hourly.json` (9MB) and
`ga-hourly-archive.json` (21MB). They were committed to git until 15/08/2026 —
roughly 370 commits between them, and most of the reason this repository is
489MB to clone.

The Action pulls them down at the start of the run and pushes them back at the
end, so the bucket, not git, is where state lives between runs. Two consequences
worth knowing:

- **The archive is irreplaceable.** GA4 will not serve hours that have fallen
  out of its retention window, so `ga-hourly-archive.json` is the only copy of
  anything older than that. The Action refuses to run if it is missing from the
  bucket rather than quietly rebuilding a 90-day file over the top of it.
- **The first run needs a seed.** [`seed-data-bucket.yml`](../../.github/workflows/seed-data-bucket.yml)
  restores all three from git history. It doubles as the recovery route if an
  object is ever deleted — but only while the history still holds them.

`articles-index.json` is uploaded with a fresh `firebaseStorageDownloadTokens`
value each night, because `getDownloadURL()` needs one and objects written by
`gcloud` do not have one by default. Fresh rather than fixed means a copied link
stops working within a day.
