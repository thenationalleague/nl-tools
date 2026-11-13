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

13/11/2026, 16:14, by the one-off `Button · Retire Attendance fixture copy`
(PR #1530; removed in the next PR after its run). 3,462 copied fixtures
(1.2 MB; the job only ever added, so several seasons' worth), none typed in
by hand, and no 2026-27 submissions depending on them. The node was saved
first to the private bucket at
`nl-tools-monthly-backups/retired/2026-11-13/attendance-fixture-copy.json`,
then deleted, checked gone, and an audit line written
(`attendance_fixture_copy_retired`).

`Button · Publish Apps Script` ran at 16:10 and removed `FixtureSync.js` from
the live project. It first needed the Apps Script sign-in the GitHub jobs use
(`CLASP_CREDENTIALS`) renewing: it had been refused since 30/10 with
`invalid_grant … invalid_rapt`, the Google Cloud session-control
reauthentication policy expiring the token, so the daily backup had failed
quietly for two weeks. Fixed by a fresh `clasp login` (copied from Cloud
Shell's editor, not the terminal, which wraps long lines into the token),
**Exempt Trusted Apps** ticked under Google Cloud session control, and clasp
(OAuth client `1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0`, public)
marked Trusted in API controls.
