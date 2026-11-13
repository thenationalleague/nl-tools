# FixtureSync – retired 13/11/2026

Not a tool: the Apps Script job that kept a copy of the NLS fixture list for
Attendance, the copy itself, and Attendance's two tabs for editing it. Last
version in git with all of them: commit `7c4da1f`
(`git checkout 7c4da1f -- gas/FixtureSync.js attendance/index.html`).

## What went

- `gas/FixtureSync.js`: a time-driven Apps Script job (`fixtureSyncRun`, set
  up by hand in the Apps Script editor's Triggers) that read the fixture
  schedule for National (89), North (373), South (372) and the NL Cup (1275)
  from the NLS API four times a day and wrote each match to
  `app-data/ops-attendance/fixtures/<matchID>`. Additive, diff-before-write;
  it never deleted a game and believed whatever date NLS gave.
- `app-data/ops-attendance/fixtures`: the copied list. Cleared by a one-off
  workflow (below) after being saved to the backup bucket.
- Attendance's **Add cup fixture** tab (FA Cup and FA Trophy ties typed in
  by hand, `manual_<comp>_<date>_<home>_v_<away>`) and **Neutral venues**
  tab (tag a game as played at a neutral ground). Both wrote to the copied
  list, and both had been hidden since Attendance v2.12.0 (28/10/2026) for
  any season Fixture Management holds.

## Why

Fixture Management (`app-data/ops-fixture-management`) is the League's own
fixture record, and since 28/10/2026 Attendance has read its fixture list
from it (`seasons/<season>/public`). That left FixtureSync's copy as the
weakest of three fixture lists, and a second place for a cup tie or a
neutral venue to be entered. Richard, 13/11/2026: attendance should sync to
the Fixtures dataset, one fixture list. Planned in
`system/fixture-management-plan.md` (step 1) and
`system/gas-to-functions-migration.md` (Phase 5: retire, do not migrate).

## What replaced it

- **Fixtures:** Fixture Management, for the live season, and nothing else.
  Cup ties, play-offs and neutral venues are entered there.
- **Attendance figures** stay in Attendance
  (`app-data/ops-attendance/submissions`), filed under the record's key for
  each match: the Opta ID for league games and NL Cup ties that have one,
  Fixture Management's own key for a tie it minted. No 2026-27 figures had
  been submitted when this changed, so nothing needed moving.
- **Past seasons** still read Attendance's archive
  (`app-data/ops-attendance/archive/<season>`), which Fixture Management's
  "Bring in from Attendance" already imports from.

## Order it was done in

1. Richard deleted the `fixtureSyncRun` trigger in the Apps Script editor,
   13/11/2026.
2. The PR that removed the file, the tabs and the live-season fallback,
   with a one-off `Button · Retire Attendance fixture copy` workflow: report
   (count), then save to `nl-tools-monthly-backups/retired/<date>/` and
   clear on a typed confirm, check gone, one audit line
   (`attendance_fixture_copy_retired`).
3. `Button · Publish Apps Script` straight after the merge, so the live
   project loses the file too (otherwise the daily sync would copy it back).
4. The one-off workflow removed in the next PR.

## Cleared

To be filled in after the run: when, how many fixtures, and the bucket path.
