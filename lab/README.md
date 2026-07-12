# lab/ — standalone & disposable pages

This directory is intentionally **outside** the NL Tools portal contract.

- **Not gated** by `auth-guard.js`, **not** in the tools registry, **not** shown on
  the portal.
- **Not** covered by `system/lint-tools.sh` — nothing here has to follow the
  canonical template or the shared `?v=` versions.
- One-off utilities, experiments, and disposable scratch pages live here.
- **Anything in `lab/` is safe to delete.** Do not build production tools here — if
  something graduates into a real tool, move it out and wire it into the portal
  (`/new-tool`, registry record, RTDB rules) properly.

## Current contents

| Page | What it is |
|---|---|
| `nl-scorer-import-tool-v1.0.0.html` | One-off CSV → Firebase goal-data backfill. Uploads a completed scorer CSV, matches names to player IDs, writes to the **vidiprinter** RTDB (`nl-vidiprinter-default-rtdb`) — not the `nl-tools` project. |
| `po-sf-planner/` | Play-off semi-final planner. Single-use one-shot, doesn't follow the tool template. |
| `step2-final-trains/` | Standalone travel one-off. |

Moved here from the repo root in the July 2026 hygiene pass to keep the portal
tool surface clean. None of these were linked from the portal or any live tool.
