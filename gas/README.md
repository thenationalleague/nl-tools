# gas/ — shared Apps Script router

`Code.gs` is the **in-repo mirror** of the consolidated Apps Script project's
router (the `doGet`/`doPost` entry points). It dispatches each `action` to a
per-tool handler. The handler bodies live in their own `.gs` files inside the
Apps Script project; only **Programme Packs** is mirrored in this repo so far,
at [`../programme-packs/gas/ProgrammePacks.gs`](../programme-packs/gas/ProgrammePacks.gs).

This is a **mirror for version control and review** — the live source of truth
is the Apps Script project. When you change the router here, paste it into
Apps Script (and vice-versa) so the two stay in lockstep.

## `FixtureSync.gs` — NLS fixture sync (Attendance)

[`FixtureSync.gs`](FixtureSync.gs) is the in-repo mirror of the time-driven
Apps Script that pulls the fixture schedule from the **NLS API** and writes each
match to RTDB `app-data/ops-attendance/fixtures/<matchID>`. It syncs four
competitions by id — NL Prem (89), North (373), South (372) and **NL Cup
(1275)** — tagging each record with `competitionKey` (`nl-cup` for the Cup),
teams by name (`homeTeamName`/`awayTeamName`), date in `kickoffUTC`. It is
additive + diff-before-write; it never touches `/submissions/` and ignores NLS
attendance figures (attendance is 100% manual club submission).

Secrets (`RTDB_URL`, `RTDB_SECRET`, `ATT_SEASON_ID`) live in Script Properties,
not in the file. This node is the shared source both the **Attendance** tool and
the **Cup Footage** fixture importer read from.

## Deploying a change

The tool pages call a **fixed `/exec` URL** (e.g. `PP_GAS_URL` in
`programme-packs/index.html`). To keep that URL stable:

> **Deploy → Manage deployments → ✎ edit the existing Web App deployment →
> Version: _New version_ → Deploy.**

Do **not** create a brand-new deployment for an ordinary code change — that
mints a new `/exec` URL, the pages keep hitting the old code, and your change
appears to do nothing. Only create a new deployment if you also update the
hardcoded URL in every client that calls it.

## Adding a new action

1. Add the handler function to the relevant `.gs` file.
2. Add one `if (action === '…') return …(body);` line to `doPost` (or `doGet`).
3. Deploy a **new version** of the existing deployment (see above).
