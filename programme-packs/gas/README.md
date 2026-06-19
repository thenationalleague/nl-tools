# Programme Packs — server (Google Apps Script)

`ProgrammePacks.gs` is the backend for the Programme Packs tool. It lives in the
shared, consolidated Apps Script project (the one whose Web App deployment URL
matches `PP_GAS_URL` in `programme-packs/index.html`), alongside `Code.gs` (the
`doPost` router) and `Utils.gs` (shared `respond` / `rtdbRead` / `rtdbWrite`).

This copy is the **source of truth** — edit here, then paste into the Apps Script
editor and redeploy. (Apps Script is not auto-deployed from this repo.)

## The RTDB key — keep all three in lockstep

This tool's data lives under **`app-data/media-programme-packs`**. Three places
must agree on that key:

| Where | What references it |
|-------|--------------------|
| `programme-packs/index.html` | `NL_TOOL.toolKey`, `NL_TOOL_KEY`, `TOOL_DATA_PATH` |
| `system/rtdb/rules.snapshot.json` + `tools-registry.snapshot.json` | rules + portal card |
| `gas/ProgrammePacks.gs` | the `PP_DATA` constant (single source) |

The tool was recategorised `ops → media`; everything moved **except** this GAS
file, which stayed on `ops-programme-packs`. Because the server then read/wrote a
different (empty) subtree than the page rendered, files removed from Drive were
never pruned ("ghost" files), and `pp_delete` / `pp_reconcile_folder` errored
against the dead key. v0.9 repoints to `media-` via the `PP_DATA` constant.

## Deploy (after editing this file)

1. Open the consolidated Apps Script project (Web App URL matches `PP_GAS_URL`).
2. Replace the contents of `ProgrammePacks.gs` with this file.
3. Confirm `Code.gs`'s `doPost` router dispatches the `pp_*` actions (see the
   header comment in this file for the list).
4. **Deploy → Manage deployments → edit the active Web App deployment → Deploy.**
   Do not create a new deployment — the URL in `index.html` must stay the same.

## Clearing the existing ghosts (one-off, after redeploy)

The repoint stops *new* ghosts and makes the in-app **↻ Sync with Drive** button
work again. To clear ghosts already in `media-programme-packs/files`, an admin
opens each affected folder and clicks **↻ Sync with Drive** (reconcile marks
records whose Drive file is gone as `isDeleted`, hiding them).

## Required Script Properties

- `RTDB_URL`, `RTDB_SECRET` — Firebase RTDB (shared with the rest of the project)
- `FIREBASE_API_KEY` — for ID-token verification
- `PROGRAMME_PACKS_DRIVE_ROOT_ID` — Drive folder that holds the tool's tree
