# gas/ — mirror of the live Apps Script project

**Do not edit anything in this directory.** Every `.js` file here is written by
`clasp pull` from the live Apps Script project, daily, by
[`.github/workflows/sync-gas.yml`](../.github/workflows/sync-gas.yml). An edit
made here is not deployed and is overwritten by the next sync.

The live project is the source of truth. This directory exists so the repo can
*see* it — so a change made in the Apps Script editor shows up as a commit, in
review, instead of being invisible.

## How this became a mirror (and what it was before)

Until 15/08/2026 this directory held six hand-pasted `.gs` files, each carrying
the line "In-repo mirror of the Apps Script file (keep in lockstep with the live
project)". Nothing enforced that, and the sync's first run showed what it had
cost:

- The live project had **15 files**; the repo mirrored **6**.
- Nine files — **9,162 lines** — had no repo record at all, including
  `ClaudioChat` (3,275), `ClaudioStats` (3,169) and `ProgrammePacks` (1,964).
- Three of the six mirrors differed from live: `Notifications` by 19 lines,
  `Code` by 8, `FixtureSync` by 4 — and they were **ahead** of live, not
  behind. See "Pending edits" below; the difference was an unshipped change,
  which is a worse failure than a stale copy, not a lesser one.

The `.gs` copies were deleted the same day. Keeping a hand-maintained second
copy of a file the sync already pulls is how the drift happened in the first
place. Git history has them if a diff is ever needed.

## What is in the project

| File | Lines | What it does |
|---|---:|---|
| `Code.js` | 218 | The `doGet`/`doPost` **router**. Dispatches on `action`. |
| `Utils.js` | 104 | Shared RTDB REST + the token verifiers `verifyIdentity_` / `verifyCaller_`. |
| `Invite.js` | 196 | `sendInvite`, `validateInvite`, `consumeInvite`. |
| `Notifications.js` | 159 | Request-flow email: `notifyAdmin`, `confirmRequest`, `sendApproval`, `sendRejection`. |
| `Emails.js` | 138 | HTML email templates used by the above. |
| `Vacancies.js` | 244 | Vacancy submission verification + notification email. |
| `FixtureSync.js` | 428 | Time-driven NLS → RTDB fixture sync (see below). |
| `ProgrammePacks.js` | 1,964 | The `pp_*` Drive-backed handlers (see below). |
| `Drive.js` | 114 | Shared Drive file browser (`getTree`, `getDownloadUrl`, `getThumbnail`). |
| `ClaudioChat.js` | 3,275 | Anthropic API proxy with tool-use, for Claudio. |
| `ClaudioStats.js` | 3,169 | Historical NL statistics engine behind Claudio's tools. |
| `MeetingNotes.js` | 121 | `generateMeetingMinutes` — Anthropic proxy for Meeting Notes. |
| `Tests.js` | 46 | Manual test functions, run from the editor. Never web-facing. |
| `ChaseHQ.js` | 91 | **Dead.** chase-hq was removed from the site at brand sweep v2.19; the router still dispatches `chaseEmail`. Retires in Phase 3 of the migration. |
| `appsscript.json` | — | The manifest. A change to scopes or runtime is exactly the drift worth seeing. |

Seven pages still call this backend through `NL.endpoints.gas`, including the
login page. It is a live backend, not a residue — see
[`../system/gas-to-functions-migration.md`](../system/gas-to-functions-migration.md)
for where it is going.

## Pending edits the live project has NOT had

Deleting the hand-pasted `.gs` copies (15/08/2026) turned up something the
commit message got backwards, and it is recorded here rather than lost with
the files. Three of those copies differed from live — but they were **ahead of
live, not behind it**. Someone had done the `thenationalleague.github.io/tools`
→ `nl.tools` migration in the repo copy and never pasted it into Apps Script.

So the live backend is still carrying old-domain URLs:

| Live file | Line | What it is |
|---|---|---|
| `Vacancies.js` | `vacNotify` | `https://thenationalleague.github.io/tools/vacancies/` — **hardcoded, no fallback.** Goes out in every vacancy-submission notification. |
| `Notifications.js` | `notifyAdmin` | `…/tools/portal/` as the `portalUrl` fallback |
| `Notifications.js` | `sendApproval` | `…/tools/` as the `config.continueUrl` fallback |
| `Code.js` | header comment | old domain in the `FIREBASE_CONTINUE_URL` example |

Only the first one actually fires. The login page sends `portalUrl` from
`window.location.origin`, and `FIREBASE_CONTINUE_URL` must be set as a Script
Property or `sendInvite` refuses outright — so both fallbacks are dead paths.
The old URLs 301-redirect to `nl.tools` besides, so nothing is broken; the
links are just a redirect away from correct, and the redirect is a dependency
nobody chose.

**To fix, in the Apps Script editor** (`Vacancies.gs`, function `vacNotify`):

```javascript
var portalUrl   = 'https://nl.tools/vacancies/';
```

then Deploy → Manage deployments → ✎ the existing Web App deployment → New
version → Deploy. The next sync commits it and this section can go.

**Do not fix it by editing `gas/Vacancies.js`.** That file is written by
`clasp pull`; an edit there deploys nothing and is overwritten on the next run.
Editing the mirror instead of the project is the exact habit that produced the
drift above.

## Two other Apps Script backends, still unmirrored

The sync covers the **consolidated** project only — the one behind
`NL.endpoints.gas`. The repo calls two further Apps Script web apps that nothing
here mirrors and nothing here syncs:

| Deployment ends | Called by | Serves |
|---|---|---|
| `…Eqlzcw/exec` | `embeds/live-blog-page.html`, `embeds/live-blog-ticker.html` | Live blog: reads posts **and accepts submissions** |
| `…5YtHOFzK/exec` | `embeds/transfer-centre-page.html`, `embeds/transfer-centre-ticker.html` | Transfer centre feed |

Both are fan-facing, on the public site, with no repo copy of their code. To
bring them under the same sync, each needs its **script ID** (from the editor
URL, not the `/exec` URL) added as a second and third entry in
`sync-gas.yml`. Until then, "the Apps Script layer is mirrored" is true of one
project out of three.

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

## `ProgrammePacks.js` — the `pp_*` handlers

Data lives under **`app-data/media-programme-packs`**. Three places must agree
on that key, and once did not:

| Where | What references it |
|-------|--------------------|
| `programme-packs/index.html` | `NL_TOOL.toolKey`, `NL_TOOL_KEY`, `TOOL_DATA_PATH` |
| `system/rtdb/rules.snapshot.json` + `tools-registry.snapshot.json` | rules + portal card |
| `gas/ProgrammePacks.js` | the `PP_DATA` constant (single source) |

The tool was recategorised `ops → media`; everything moved **except** the GAS
file, which stayed on `ops-programme-packs`. The server then read and wrote a
different (empty) subtree than the page rendered, so files removed from Drive
were never pruned ("ghost" files) and `pp_delete` / `pp_reconcile_folder` errored
against the dead key. v0.9 repointed to `media-` via `PP_DATA`. To clear ghosts
already recorded, an admin opens each affected folder and clicks **↻ Sync with
Drive**.

Required Script Properties: `RTDB_URL`, `RTDB_SECRET` (shared),
`FIREBASE_API_KEY` (ID-token verification), `PROGRAMME_PACKS_DRIVE_ROOT_ID`.

This whole file retires when Programme Packs moves to Firebase Storage — see
[`../programme-packs/REBUILD.md`](../programme-packs/REBUILD.md).

## Changing the backend

Editing happens in the Apps Script editor, and deploying is a human action —
`sync-gas.yml` deliberately pulls only. Making it two-way would mean a bad merge
could rewrite a running backend, and nothing here could catch that.

1. Add or change the handler in the Apps Script editor.
2. For a new action, add one `if (action === '…') return …(body);` line to
   `doPost` (or `doGet`) in `Code.js`.
3. **Deploy → Manage deployments → ✎ edit the EXISTING Web App deployment →
   Version: _New version_ → Deploy.**

Step 3 matters. The tool pages call a **fixed `/exec` URL** (`NL.endpoints.gas`,
`PP_GAS_URL` in `programme-packs/index.html`). Creating a *new* deployment mints
a new `/exec` URL, the pages keep hitting the old code, and the change appears to
do nothing.

The next sync run commits whatever you deployed, so the repo catches up on its
own.
