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
- **`matchdayLiveAuth`** / **`matchdayLiveSync`** / **`matchdayLiveRetention`**
  (`matchday-live.js`) — Matchday Live. A contributor's link token → an `mdl`
  claim (RTDB trigger, europe-west1, same shape as `programmeAuth`); a minute
  job mirroring today's matches, goals and cards out of the ingester's
  `nl-widgets` data into `app-data/media-matchday-live/matchdays/`; and a
  nightly sweep deleting rejected clips' video after 7 days. The mirror only
  **reads** nl-widgets, with the grant the ingester already needs — nothing new
  to set up. See `matchday-live/README.md`.

- **`eflPlayersHourly`** (`efl-players.js`) — one row per player per finished
  EFL match (Championship, League One, League Two, Carabao Cup, EFL Trophy),
  written to `efl/` in **this** project's database. EFL data is licensed and
  **internal-only** — see the section below.

See the headers of `index.js` / `account.js` for details.

This is the **only server-side code** in the repo; everything else is a static
site. It runs in the `nl-tools` Firebase project (Blaze), region `europe-west2`.

## Deploy — via GitHub Actions (no terminal)

Deployment is automated by `.github/workflows/deploy-functions.yml`, which
reuses the same Workload Identity Federation auth as the GA pipeline. It runs on
any push that changes `functions/**`, or on demand (**Actions → Auto · Publish cloud jobs → Run workflow**).

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
4. **Run it** — Actions tab → *Auto · Publish cloud jobs* → **Run workflow**.

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

**Kick-off is synthesised, because NLS never emits it.** `anchors/<matchID>/<1H|2H>`
holds one KICK_OFF record per period: written at low confidence when the list
flips to FirstHalf (or arrives at SecondHalf — matches can skip HalfTime), then
corrected backwards by the wall-clock timestamps on goals, bookings and subs.
The gap between the two values is kept on the record as `ingestLagMs` — the
feed's kick-off ingest lag, measured per match. The derived clock hangs off the
anchor (`now − anchorUTC`, +45:00 in the second half, capped at 45'+n / 90'+n),
so it survives any client reload by construction. Method and edge cases are in
`nls/anchors.js`, covered by `tests/nls-anchors.test.mjs`.

Past matchdays are backfilled on the hourly run (bounded, resumable, ledger at
`meta/anchor-backfill/*`) — event-derived only, since the timestamps persist on
the detail response but a poll observation cannot be recovered after the fact.
A backfilled day therefore has kick-off times but no `ingestLagMs`: the lag
exhibit only ever comes from a witnessed flip.

Every other state change — HalfTime, FullTime, Abandoned, ExtraTime — has no
event timestamp to correct against, so each witnessed list transition is
appended to `anchors/<matchID>/transitions` as `{ from, to, observedUTC }`:
the full state history of a match, in one node, under the same read grant.

**Player rows** (v0.4.0) — one row per player per finished match, built on the
hourly run for **past matchdays only**, by the same bounded, resumable pattern
as the two backfills above (ledger at `meta/player-backfill/*`). Past days only
because North and South team sheets arrive after the whistle, if at all; a
match whose sheets are still incomplete is retried at most every six hours for
a week, then its day is closed. The first runs after deploy are the season
backfill — four matchdays per competition per hour, inside a 150-second budget.

| Path under `nls/players/<season>/` | Holds |
|---|---|
| `apps/<playerID>/<matchID>` | The row: team, opponent, home/away, result, `role` (`start` / `sub` / `unused` / `unlisted`), `on`, `off`, `minutes`, goals, penalties, own goals, cards, `sentOff`. A player's season is one read. |
| `squads/<teamID>/<playerID>` | Name. Every club a player has appeared for, so mid-season moves are visible. |
| `scorers/<compKey>/<playerID>` | The scorer table (v0.5.0): goals, penalties, own goals, apps and minutes in that competition, with goals split per club. Recomputed from the player's rows whenever a match's rows are written, so it is never short of a goal entered late — unlike the incremental `derived/scorers` tally. A one-off walk (`meta/player-scorers/<season>`) fills it for rows written before v0.5.0. |
| `matches/<matchID>` | The ledger: both sides and the score, `complete` (both XIs named), `attempts`, and the `pids` written, so a corrected sheet can remove a row. |

Minutes are on the regulation clock (90, or 120 with extra time) — stoppage
time is not counted, and `minutes` is null when the role makes it unknowable.
A missing row means the player was not involved; it never says why. Method
and edge cases are in `nls/players.js`, covered by `tests/nls-players.test.mjs`.
No rules entry exists for `players/` — the root is closed, so it is readable
only by server-side identities (the NL Data MCP) until a staff tool needs it.

### Goal corrections (since v0.6.0)

When a score has goals the feed names no scorer for — find them with the NL
Data connector, `get_results(missingScorers: true)` — name the scorer with
**Actions → Button · Fix a missing goalscorer → Run workflow**. One line per goal:
`<matchID> <playerID> <teamID of the scorer's club> <minute> <goal|penalty|og>`.
IDs only, never names: run inputs on this public repo are visible. The same
Action fixes a team sheet (v0.6.1): `<matchID> <playerID> <teamID> start|bench`
for a missing player, `<matchID> <onID> <teamID> <minute> sub <offID>` for a
missing substitution.

The Action writes nl-tools RTDB `nls-corrections/<matchID>/<minute>-<playerID>`;
the next hourly run rebuilds the match's rows and its scorers' entries.
Corrections only ever fill the gap between the score and the goals the feed
names, so when Stats Perform fix a match at source the correction stops
applying by itself. Run the Action with `remove` to take one back out.

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
3. **RTDB rules on nl-widgets.** `system/rtdb/nl-widgets.rules.snapshot.json` carries the
   `nls/` block and ships through **Actions → Button · Publish database rules** (choose
   target `nl-widgets` or `both`, type `publish`) — the file in git IS the
   rules, exactly as on nl-tools. (This item said "no rules deploy workflow —
   paste into the console by hand" until 19/08/2026, long after the workflow
   gained its nl-widgets target, and the stale line duly sent a session back
   to the console. The workflow's own header is the authority on how rules
   ship; this note is just the pointer.)
   Reads are granted per slice (`live/index/<comp>/<ymd>`, `live/matches/<id>`,
   `events/<ymd>`, `anchors/<matchID>`, …) and never at `nls/` itself, so a
   consumer has to subscribe to a scoped path rather than the namespace. That is the bandwidth design and
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

## EFL player rows (`efl-players.js`)

**EFL data is the EFL's, licensed, and internal-only.** It is written to the
nl-tools (staff) database under `efl/`, never to nl-widgets, and `efl/` has no
rules entry: the closed root denies every client, so the only reader is a
server-side identity with an IAM role on this project — today the EFL MCP's
Cloud Run service account (Firebase Realtime Database Viewer). Never add a
client read rule for `efl/` and never feed these rows to an embed or widget.

`eflPlayersHourly` runs every hour (europe-west2, the shared runtime service
account, which already holds Firebase Admin here — no new grant to write). It
reads each competition's season list (one request each; the EFL host 404s the
`includePopulatedDates` query the NLS backfill uses), groups finished matches
by UTC day, and builds past matchdays oldest first across all five
competitions — up to 150 detail fetches inside a 200-second budget per run, so
a season's ~1,900 matches rebuild in about fourteen runs. Closing and retries use
the same helpers as the NLS backfill (`nls/players.js` `isDue`,
`failureLedger`, `dayClosed`): a failed fetch writes a ledger entry with
`lastError`, so it is retried at most every six hours rather than hourly; a day
closes when every team sheet is complete, or once a week old when every match
has had its look (a failed fetch three times). A fresh day with a result still
not entered stays open.

| Path under `efl/` | Holds |
|---|---|
| `players/<season>/apps/<playerID>/<matchID>` | The row — the NLS row's shape exactly (`nls/players.js`), with `source: 'efl'` and the EFL MCP's competition keys (`championship`, `league_one`, `league_two`, `carabao`, `trophy`). |
| `players/<season>/squads/<teamID>/<playerID>` | Name. |
| `players/<season>/teams/<teamID>` | Club name. The EFL has no clubs-meta and its list rows carry no teamID, so this is how a reader resolves a club. |
| `players/<season>/matches/<matchID>` | The ledger, as for NLS. |
| `meta/player-backfill/<compKey>/{days,pending}` | Progress. |
| `meta/players` | Last run: `lastRun`, `lastSuccess`, `matchesWritten`, `errorCount`, `pending`, `caughtUp`, `version`. |

Player IDs are shared with the NLS feed — the same person has the same
`playerID` in both (probed 26/10/2026: 95 of 97 shared names matched; the two
that did not were different people), so `efl/` and `nls/` rows for one ID are
one career. Extra time is read from the evidence the feed carries — `extraScore` set
(0 included), an extra-time event period, or an extra resultType — so a cup
tie settled by a shootout straight after 90 minutes counts as 90, and one that
went to extra time counts as 120 (`efl/backfill.js`, probed 26/10/2026). Shaping goes through
`nls/transform.js` with the EFL competition map passed in; NLS shaping is
unchanged. Covered by `tests/efl-players.test.mjs`.

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
