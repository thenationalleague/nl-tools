# NL Tools — operations runbook

What this system is made of, where each part lives, how each part ships, and
what to do when one of them misbehaves.

This is the **operator's** document: written for whoever is running NL Tools
from a browser, not for whoever is writing code in it. If you are looking for
how to *build* something here, read `CLAUDE.md` at the repo root and the plans
it indexes.

---

## The one rule that shapes everything else

**Nothing here needs a terminal.** Richard has no CLI access, so every
deployment path is a GitHub Action he can run from a browser, and any plan that
ends "then run `firebase deploy`" is undeliverable. If you find yourself
writing an instruction that starts with a shell prompt, it is wrong or it needs
a workflow first.

The corollary: **nothing is ever pasted into the Firebase console.** Rules,
storage rules, the tools registry and the Apps Script project all deploy from
this repo. Pasting is how the three-disagreeing-copies problem started, twice.

---

## Where things live

| Thing | Where |
|---|---|
| Repo | `thenationalleague/nl-tools` — the **organisation**, not the personal account |
| Live site | `https://nl.tools/` — bound by the `CNAME` file at the repo root |
| Old URLs | `thenationalleague.github.io/tools/*` are **dead** (namespace retirement forced the rename during the org move, 16/08/2026) |
| Firebase project (staff) | `nl-tools` — RTDB `nl-tools-default-rtdb`, region `europe-west1` |
| Firebase project (fans) | `nl-widgets` — separate on purpose, see below |
| Storage bucket | `nl-tools.firebasestorage.app` |
| Apps Script | one private Web App; the `/exec` URL every page calls must not change |

**Two Firebase projects, deliberately.** Fan traffic is anonymous,
public-read and unbounded; staff data is real people and club-confidential
records. They do not share a blast radius. `nl-widgets` holds every fan vote,
prediction and registration; `nl-tools` holds everything behind auth-guard.

---

## What ships how

Three categories, and knowing which one you are in tells you what a merge does.

### 1. Ships on merge, no action needed

- **The static site** — every `.html`, `.css`, `.js` under the repo. GitHub
  Pages serves the repo as-is. **There is no build step.** Merge to `main` and
  it is live.
- **Cloud Functions** — `deploy-functions.yml` runs automatically on any push
  to `main` touching `functions/**` or `firebase.json`.

  ⚠️ It runs `firebase deploy --only functions`, which deploys **every**
  function in the directory, not just the one you changed. There are around a
  dozen: `consumeInvite`, `submitAccessRequest`, `withdrawAccessRequest`,
  `clubCodeAuth`, `clubDirectoryAuth`, `fanWidgetsAuth`, `handbookPdfOnPublish`,
  `nlsIngestTick`, `nlsIngestHourly`, `programmeAuth`, `uwPromoAuth`. A broken
  one takes the others with it.

### 2. Ships only when you press the button

These are **manual on purpose**. Rules govern every tool, and landing an
unrelated PR must not be able to lock 72 clubs out of their own data as a side
effect of a merge.

| What | Actions → workflow | You must type |
|---|---|---|
| RTDB rules (both databases) | **Deploy RTDB rules** | choose target (`both` / `nl-tools` / `nl-widgets`), type `publish` |
| Storage rules | **Deploy Storage rules** | `publish` |
| `tools/` registry | **Deploy tools registry** | `report` writes nothing; `publish` + type `publish` replaces the node |
| Apps Script | **Deploy Apps Script** | `publish` |
| Brand Exposure scan container | **Deploy scan job** | `publish` |

**Deploy scan job** is manual for a stronger reason than the rest. That
container **is** the measurement: a rebuild can move every number Brand Exposure
reports, not because anything in this repo changed but because a base image or a
pinned wheel moved underneath it. It must never happen as a side effect of
merging something unrelated. It also does not *run* a scan — building the tin
and opening it are separate acts. See `system/board-exposure/CLOUD.md`.

The file in git **is** the thing deployed:

- `system/rtdb/rules.snapshot.json` — the nl-tools rules, the full document
- `system/rtdb/nl-widgets.rules.snapshot.json` — the nl-widgets rules
- `system/storage/rules.snapshot.rules` — the Storage rules
- `system/rtdb/tools-registry.snapshot.json` — the `tools/` node

Because they are authoritative rather than a guess, you can trust them when
reading. **Live RTDB *data* is different — nobody can read it from the repo.
Check the snapshot, and if the answer matters, look in the console.**

**A PR that changes any of these files needs one button press after merge, and
the PR body should say so.** A PR that adds a function needs nothing.

### 3. Runs itself on a schedule

| Workflow | When | What it does |
|---|---|---|
| Rebuild article index | 03:00 daily | GA metrics + GA hourly + article index; pulls the four feeds out of Firebase Storage, rebuilds, puts them back. Commits nothing. |
| Sync Apps Script | 04:40 daily | Pulls the live Apps Script project; commits on drift |
| Daily table baseline | 01:00 daily | League table snapshot |
| Season rollover | 02:00, 1 July | New season |
| Build fixture feed cache | hourly, :17 | Fixture feed |
| Render handbook PDF | hourly, :25 | Re-renders if stale |
| Build predictor leaderboard | every 15 min | Fan predictor standings |

Plus the ones that run on push and keep generated artefacts current:
**Build embed bundles** (`embeds/**`), **Build estate inventory**, **Build
image asset tiers** (crest thumbnails), and **canon-checks** — the test suite
and lint that gate every PR.

---

## The Apps Script loop

`gas/` is two-way, and it matters which direction you are going.

- **Edit the `.js` files in `gas/`, not the Apps Script editor.**
- `sync-gas.yml` pulls live daily and commits if the editor has drifted.
- `deploy-gas.yml` pushes the repo back and redeploys the **existing** Web App,
  so the `/exec` URL every page calls does not change.
- The deploy **refuses to run** if live holds anything the repo has not seen,
  so it cannot silently overwrite someone's editor change. If it stops you,
  run the sync first, look at what it committed, then deploy.

---

## Branching and merging

- PRs land on `main`. Pushing to `main` directly is not done.
- Each Claude session works on its own `claude/*` branch.
- Branches are **squash-merged**.

That last point has a consequence worth knowing: `git branch --merged` is
worthless here, because a squashed branch's commits never become ancestors of
`main`. It reports essentially every branch as unmerged.

**Use Actions → Prune merged branches instead.** Run it in `report` mode
first, then `delete` with `prune` typed in. It runs three tests and spares
anything that fails all of them. The two hand-checked exception lists live
beside it: `.github/branch-prune-allow.txt` and `.github/branch-prune-keep.txt`.

---

## Adding a tool: the two things the scaffold does not do

`/new-tool <slug>` copies the template and swaps the placeholders. It does
**not** wire the tool into the system. Both remaining steps are RTDB config,
and both are files in this repo:

1. **`tools/<toolKey>` registry record** — label, url, icon, department, and
   `defaults` per role. One record drives **both** the portal card and
   auth-guard's access fallback; there is no separate registry in code. Without
   it the page is superadmin-only and invisible on the portal.
   Check `system/rtdb/tools-registry.snapshot.json` first — the record may
   already exist. Add it there, then run **Deploy tools registry**.

2. **RTDB rules for `app-data/<toolKey>/...`** — edit
   `system/rtdb/rules.snapshot.json`, then run **Deploy RTDB rules**.

`toolKey` is `<category>-<slug>` where category is `staff`, `ops` or `media`.
The same key indexes the registry record, the tool's data under
`app-data/<toolKey>/`, and its security rules.

---

## When something is wrong

Ordered by how often each one turns out to be the answer.

**A tool denies everyone, or silently redirects to the portal.**
Look at `tools/<toolKey>/defaults` in RTDB and the user's own
`tools/<toolKey>` entry. Per-user entries are strings: `"off"`, `"access"`,
`"admin"`. With no per-user entry it falls back to the role default; a role
absent from `defaults` resolves to `off`. `superadmin` is always granted.

**"It works locally but not on the deployed site."**
Almost always a stale `?v=` on one of the four shared `system/` files. Run
`bash system/lint-tools.sh` — it prints the canonical versions and names any
tool that drifted. Trust it over reading the file. (`_headers` sends
`no-cache` for `/system/*`, so the query string is belt-and-braces, not the
only mechanism.)

**`PERMISSION_DENIED` on an RTDB read while signed in.**
The read raced the auth token. Wrap it in `NL.ensureAuth().then(...)`, and
never read RTDB before `nlAuthReady` fires.

**The tools registry looks wrong in live.**
Run **Deploy tools registry** in `report` mode. It diffs live against the
snapshot and writes nothing. That beats exporting the node and comparing by
hand, and it is the right first move whenever drift is suspected.

Note what `publish` means: it replaces the **whole** node, so a record that
exists only in live is a deletion. It refuses unless `allow_deletions` is
ticked. This is the mechanism that let `tools/ops-estate` sit for weeks holding
a stale copy of the entire registry nested one level too deep, back when the
instruction was still "paste it into the console".

**The audit feed is missing entries.**
Either the path is on `NL.installAuditHook`'s skip list (`admin/audit*`,
`presence/`, `.info/`), or a manual `NL.writeAudit` suppressed the auto-hook
for its 500 ms window so one write did not log twice.

**A tool's head looks right but something is off.**
Run `bash system/lint-tools.sh` and believe it over visual inspection.

**The nightly pipeline failed on a missing bucket file.**
`ga-hourly-archive.json` is the one feed that **cannot be rebuilt** — GA4 will
not serve hours past its retention window — so the job fails rather than
proceeding if the bucket copy is missing. That refusal is deliberate; it is the
job protecting the archive, not a bug.

Recovery: **Actions → Seed the data bucket from git history**, type `seed`. It
restores the feeds from the last copy git ever held. That only works while the
history still carries the files, so a future history rewrite retires this
workflow with it. Details in `system/storage/README.md`.

---

## What is deliberately *not* deployable

Other RTDB data — seed records, everything under `app-data/*` — has no deploy
path and should not get one. It is live operational data written by the tools
themselves, not config that belongs in git.

And the standing rule that outranks convenience: **this repo is public.**
Nothing containing a person's name, email, phone number or address goes in it,
with no exception for seed files, exports, test fixtures or temporary data.
Personal and club-confidential data lives in RTDB and reaches the browser at
runtime behind auth-guard, gated by rules.

---

## Reading further

| Document | What it holds |
|---|---|
| `CLAUDE.md` | How to build in this repo: the canon, the wiring contract, conventions |
| `system/CONSOLIDATION.md` | The master plan — every tool draws from one shared place |
| `system/tool-status-and-access.md` | Which tools are live vs parked, and who can reach each |
| `system/roles-and-access-plan.md` | The role model; the settled launch model is the block at the top |
| `system/rtdb/README.md` | The snapshot contract — which files are deployed vs reference |
| `system/storage/README.md` | The four feeds in the bucket, and how to recover them |
| `system/deployer-migration.md` | Why every deploy runs as `nl-archive-ga-reader`, and the parked plan to replace it with something honestly named and minimally permitted |
| `system/retired/README.md` | Tools that were deleted and why. **Read before proposing to build something that existed once.** |
| `functions/README.md` | The Cloud Functions |
| `embeds/widget-handover.md` | The fan-facing embeds and their CMS invariants |
