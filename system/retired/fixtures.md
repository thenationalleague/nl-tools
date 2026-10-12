# Fixtures (`/fixtures/`, `ops-fixtures`) — retired 12/10/2026

## What it did

Held every fixture in every National League competition, with the
scheduling history behind it: postponements, rearrangements and the reason
each date was lost. Staff imported the fixture list by pasting a spreadsheet,
then kept the history, broadcast picks and notes. Clubs saw their own games,
read-only.

## Why it went

The fixture list was a pasted copy of something the League already receives
as a feed. Since August the NLS ingester (`functions/nls-ingester.js`) has
written every fixture to `nls/fixtures/<comp>/<ymd>` on its own schedule,
so the hand-imported copy could only drift from it. Most of the tool's
changelog was about the import going wrong: `#N/A` Opta IDs taking down a
whole paste, 552 South fixtures filed as North, and a bulk delete added to
undo a bad import. Nothing else in the repo read its data.

The judgement on retiring it: the scheduling layer was worth having, the
copied list under it was not. A rebuild should put that layer on top of the
synced feed rather than on a paste.

## Decisions worth keeping

- **Postponed and rearranged are separate events.** A game called off with
  no new date is `postponed` (a from-date, no to-date). A game moved straight
  to a new date is `rescheduled` (both dates). Merging them makes "postponed,
  awaiting a new date" impossible to record, and that is the League's normal
  state for most of the winter. It also makes "how long did the club wait"
  impossible to calculate.
- **One line per move, each date paired with the reason it was lost.** For
  example: Sat 8 Aug (3pm) / Weather: Waterlogged, then Tue 13 Oct (7.45pm) /
  Police. The reasons list was `assets/data/postponement-reasons.json`, kept
  in the repo.
- **A mis-keyed reason is corrected in place, not logged as an event.** It
  was stamped `reasonWas` rather than adding a timeline entry for a typo.
- **The record key never changes.** League fixtures were keyed on the Opta
  ID, which Attendance also uses. Cup ties had a key minted for them because
  Opta issues nothing when a tie is drawn. `optaID` was a separate nullable
  field, so filling it in later could not orphan the history.
- **Broadcast was a stored code with a display label** (Broadcast,
  Production, AMI, moved-by-DAZN). It sat in its own staff-only node because
  fixtures were readable by any signed-in user. Renaming a broadcast label
  cost one line, not 1,656 records.
- **Data split by who may read it:** `fixtures` (any signed-in user),
  `history` (signed in), `notes` (staff only). Rules can only separate data
  that is stored separately.
- **Travel table:** distance and drive time keyed on the club pair, pasted
  as its own lookup.

## What was not deleted

The RTDB data under `app-data/ops-fixtures/` is still there. Its rules have
been removed from `rules.snapshot.json`, so once the rules workflow runs, only
the console and the Admin SDK can read it. Export it from the console before
clearing it, if the history or travel table is wanted.
