# gas/ — mirror of the live Apps Script project

**This directory is the source of truth for the consolidated Apps Script
project.** Edit the `.js` files here, open a PR, and ship them with the
**Deploy Apps Script** workflow. Two workflows keep it honest:

| Workflow | Direction | Trigger |
|---|---|---|
| [`sync-gas.yml`](../.github/workflows/sync-gas.yml) | live → repo | daily 04:40, commits only on drift |
| [`deploy-gas.yml`](../.github/workflows/deploy-gas.yml) | repo → live | **manual only** — Actions → Run workflow → type `publish` |

Deploy refuses to run if **someone has edited the live project directly**. It
compares live against `gas/.deployed` — a fingerprint of what we last put there
or last saw there, written by both workflows — not against your branch, so the
repo being ahead is normal and expected.

If it stops you, run Sync Apps Script and **read its diff before merging**: it
restores anything the repo has deliberately deleted that live still has.

It also redeploys the **existing** Web App rather than minting a new one, using
the deployment ID read out of `NL.endpoints.gas` — so the `/exec` URL every page
calls never changes.

## How this became a mirror (and what it was before)

Until 15/08/2026 this directory held six hand-pasted `.gs` files, each carrying
the line "In-repo mirror of the Apps Script file (keep in lockstep with the live
project)". Nothing enforced that, and the sync's first run showed what it had
cost:

- The live project had **15 files**; the repo mirrored **6**.
- Nine files — **9,162 lines** — had no repo record at all, including
  `ClaudioChat` (3,275), `ClaudioStats` (3,169) and `ProgrammePacks` (1,964).
- Three of the six mirrors differed from live: `Notifications` by 19 lines,
  `Code` by 8, `FixtureSync` by 4 — and they were **ahead** of live, not behind.
  Someone had done the `thenationalleague.github.io/tools` → `nl.tools`
  migration in the repo copy in July and never pasted it into Apps Script, so
  the live backend spent a month emailing old-domain links while the repo
  looked correct.

The `.gs` copies were deleted the same day, and that last finding is why the
deploy workflow exists. A mirror you can only read is a mirror that quietly
disagrees: it makes the repo the place people edit and the editor the place
things actually run, which is the drift, not the cure. Git history has the six
files if a diff is ever needed.

## What is in the project

| File | Lines | What it does |
|---|---:|---|
| `Code.js` | 190 | The `doGet`/`doPost` **router**. Dispatches on `action`. |
| `Utils.js` | 104 | Shared RTDB REST + the token verifiers `verifyIdentity_` / `verifyCaller_`. |
| `Invite.js` | 196 | `sendInvite`, `validateInvite`, `consumeInvite`. |
| `Notifications.js` | 159 | Request-flow email: `notifyAdmin`, `confirmRequest`, `sendApproval`, `sendRejection`. |
| `Emails.js` | 138 | HTML email templates used by the above. |
| `Vacancies.js` | 244 | Vacancy submission verification + notification email. |
| `FixtureSync.js` | 428 | Time-driven NLS → RTDB fixture sync (see below). |
| `ClaudioChat.js` | 3,275 | Anthropic API proxy with tool-use, for Claudio. |
| `ClaudioStats.js` | 3,169 | Historical NL statistics engine behind Claudio's tools. |
| `Tests.js` | 46 | Manual test functions, run from the editor. Never web-facing. |
| `ChaseHQ.js` | 91 | **Dead.** chase-hq was removed at brand sweep v2.19. Its router line is commented out as of 15/08/2026; the file retires in Phase 3. |
| `appsscript.json` | — | The manifest. A change to scopes or runtime is exactly the drift worth seeing. |

Five pages still call this backend through `NL.endpoints.gas`, including the
login page. Programme Packs was the sixth until it was retired on 15/08/2026,
superseded by `/programme/` on Firebase Storage — which took the 17 `pp_*`
routes, the Drive browser and **the last Google Drive dependency in the
project** with it. Two dispatch lines are commented out rather than deleted —
`chaseEmail` and `claudio` — because both forward to Anthropic with a key from
Script Properties, from a web app that is public by construction. While the
tools in front of them are off the portal they are cost-abuse surface and
nothing else. It is a live backend, not a residue — see
[`../system/gas-to-functions-migration.md`](../system/gas-to-functions-migration.md)
for where it is going.

## Two other Apps Script backends — being retired, not synced

The sync covers the **consolidated** project only. The repo called two further
Apps Script web apps, both fan-facing, both with no repo copy of their code:

| Deployment ends | Was behind | Now |
|---|---|---|
| `…Eqlzcw/exec` | the live blog (read posts **and accept public submissions**) | unplugged — see [`../system/retired/live-blog-and-transfer-centre.md`](../system/retired/live-blog-and-transfer-centre.md) |
| `…5YtHOFzK/exec` | the transfer centre feed | unplugged — same |

Both sat in front of a **Google Sheet**. Rather than bring them under the sync,
both tools are parked for a rebuild on RTDB; their front-ends are kept and their
backends dropped. So this project stays one Apps Script project, not three.

**Neither is switched off yet.** Removing the repo's calls does not unpublish an
Apps Script deployment — until someone archives them in the editor they remain
public endpoints, and the live-blog one still accepts submissions. `system/retired/website-insights-and-analysis.md`
has the decommission order.

## Backend authz — `SECURITY-invite-authz.md`

[`SECURITY-invite-authz.md`](SECURITY-invite-authz.md) documents the Phase 7
authorization fix for the invite / approval actions: a shared `verifyCaller_` in
`Utils.js`, plus role gates on `sendInvite`, `sendApproval`, `sendRejection`.

## `FixtureSync.js` — NLS fixture sync (Attendance)

Time-driven. Pulls the fixture schedule from the **NLS API** and writes each
match to RTDB `app-data/ops-attendance/fixtures/<matchID>`. Four competitions by
id — NL Prem (89), North (373), South (372) and **NL Cup (1275)** — each record
tagged with `competitionKey` (`nl-cup` for the Cup), teams by name
(`homeTeamName`/`awayTeamName`), date in `kickoffUTC`. Additive +
diff-before-write; it never touches `/submissions/` and ignores NLS attendance
figures (attendance is 100% manual club submission).

Secrets (`RTDB_URL`, `RTDB_SECRET`, `ATT_SEASON_ID`) live in Script Properties,
not in the file. This node is the shared source both the **Attendance** tool and
the **Cup Footage** fixture importer read from.

## Changing the backend

1. Edit the `.js` file here and open a PR. It reviews like any other diff.
2. For a new action, add one `if (action === '…') return …(body);` line to
   `doPost` (or `doGet`) in `Code.js`.
3. Merge, then **Actions → Deploy Apps Script → Run workflow → type `publish`**.

That is the whole loop, and none of it needs a terminal or the Apps Script
editor. The run pushes every file in this directory and redeploys the existing
Web App; the next scheduled sync should then report no drift, which is the
confirmation that it took.

**If you edit in the Apps Script editor instead** — which is still fine for
something urgent — the daily sync commits it and the repo catches up on its own.
What you must not do is edit in both places and expect them to reconcile. The
deploy guard will stop you rather than pick a winner.

Two things the workflow protects that are easy to get wrong by hand:

- **The `/exec` URL.** Every tool page calls a fixed one (`NL.endpoints.gas`,
  — `PP_GAS_URL` in the retired Programme Packs was the other). Creating a *new*
  deployment
  in the editor mints a new URL, the pages keep hitting the old code, and the
  change appears to do nothing while reporting success. The workflow deploys to
  the ID read out of `NL.endpoints.gas`, so it can only target what the site
  actually calls, and it checks that ID exists before deploying.
- **Someone else's editor change.** `clasp push` overwrites everything. The
  workflow pulls and diffs first, and refuses rather than guessing.
