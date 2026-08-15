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

Empty. The directory stays because the convention above is worth keeping — it is
where a scratch page goes so it never has to be argued about later.

Cleared on 15/08/2026 after `/estate/` showed the four pages here had no inbound
link from anywhere in the repo and had not been touched since they were written:
`nl-scorer-import-tool-v1.0.0.html` (one-off CSV → vidiprinter RTDB backfill),
`po-sf-planner/` and `step2-final-trains/` (single-use planners moved here in the
July 2026 hygiene pass), and `club-picker.html` (a manual smoke page for
`NL.clubPicker`, from PR #368). All four are in git history if one is wanted back.
