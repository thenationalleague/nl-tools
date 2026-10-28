# Fixture Management — plan (not built)

Settled 27–28/10/2026 in a grilling session with Richard. Every decision below
was argued out; the reasoning is kept so a build session does not re-open it.
Read `system/retired/fixtures.md` alongside — the tool it replaces, and why
that one went.

## What it is

One tool, two doors (the club-root + `/admin/` shape in
`system/tool-status-and-access.md`):

- **`/fixtures/`** — the forward-facing view. Every signed-in user, clubs
  included. Current fixtures only.
- **`/fixtures/admin/`** — staff console. Tabs (a closed set — the tool's jobs):
  1. **Fixtures** — the master record. Import, cup ties by hand, results of
     FA Cup / Trophy ties, Opta IDs.
  2. **Rearrangements** — the to-do list of games awaiting a date, the date
     finder, pencils.
  3. **Broadcast** — availability per game, Enhanced, Moved-by-DAZN, the
     "review broadcast" list. Division filter covers step 1 and step 2 picks.
  4. **AMI** — a tick box per UK-available game. Staff only, never public.

The toolKey is **`ops-fixture-management`**, not `ops-fixtures`: the retired
tool's data still sits under `app-data/ops-fixtures/`, and a new tool must not
inherit or collide with it.

Each tab ships as its own PR. The Fixtures tab (with the import) shipped
first, in `fixtures/admin/` with its data layer in `fixtures/_core.js`; the
Broadcast tab covers both step 1 and step 2 (North and South) picks.

## The record

**Our record is the master for everything the League decides.** NLS is a
downstream mirror of Opta and Urban Zoo; the two can and should differ, and
divergence is not a fault. There is no reconciliation queue.

- **One ingest, then frozen sheet.** Baseline = the original published
  schedule (`assets/data/fixtures-2026-27.json`, matched to Opta IDs on the
  ordered home/away pair by `scripts/build-fixture-seed.js`) plus the current
  working sheet (Richard's xlsx: Fixtures + Rearrangements tabs). Nothing is
  live yet, so this is a hard cut-over, no parallel running. The xlsx is
  imported through the admin screen into RTDB — **never committed**.
- **Results are held in the record** (changed 28/10/2026 — the first plan
  said NLS only). Richard wants every result logged and managed here: the
  workbook's goals, extra time and penalties import, a day's results fill
  from NLS (league and NL Cup) or a paste of rows, and any game can be edited
  by hand. A score held that differs from NLS is shown, never overwritten
  unless ticked. Official **tables** still come from NLS's own table
  endpoint with deductions inside it (`fetch-table-baseline`); the record
  does not build tables. FA ties also keep **who went through**, worked out
  from the score (penalties, then extra time, then 90 minutes) because the
  sheet's Result column records the 90 minutes only.
- **Fixture → attempts.** One fixture (clubs, competition, Opta ID, original
  date) holds a list of dated attempts: planned, postponed, abandoned, played.
  Opta keeps one ID and overwrites an abandoned attempt when it is replayed, so
  the attempt is what DAZN and Attendance figures attach to. Verify against a
  real abandoned-and-replayed 2025-26 game during the build.
- **Keys:** Opta ID for league and NL Cup. Cup ties we enter get a minted key;
  `optaID` is a separate nullable field, with a "missing Opta ID" list (all 64
  NL Cup rows lack one in the sheet; one National row too).
- **Entered by hand:** NL Cup knockouts, playoffs, FA Cup, FA Trophy.
- **Play-offs belong to their division** (changed 28/10/2026): a National,
  North or South record marked `playoff`, with its round (QF/SF/F) — the
  way NLS files them — not a competition of its own.
- **Outside clubs** (FA Cup/Trophy opponents): a plain name with suggestions of
  names already used, crest if one exists, no codes or colours. Name is the
  join, so a crest added later backfills every tie. Our side of a tie always
  comes from `NL.clubPicker`.
  **Never probe for a crest.** Pages are only asked for crests of clubs in
  `clubs-meta.json` / `cup-clubs-meta.json` (by `crestName`). Guessing a URL
  for an outside club 404'd twice per row per render, uncached, and hit
  GitHub Pages rate limits on 28/10/2026 (1,559 requests, 1,460 failures for
  one FA Cup list). An outside club's crest therefore needs listing, not just
  uploading — the lightest route is a name list beside the crests, decided
  when the first one is added.
- **Stored vs derived.** Of the sheet's 58 columns about 15 are data. Never
  store: Televised, Day, Midweek/Weekend, Match name/valid/type, score
  formats, goal totals, 3-letter codes, video filenames, the NLTV HTML.
  Attendance and DAZN figures belong to those tools. Distances belong to the
  pairings lookup.

## Who sees what

| Audience | Sees |
|---|---|
| Every signed-in user | Current fixtures: date, kick-off, competition, teams, state; broadcast label **Worldwide** or **Overseas** only — everything else shows no label. Games postponed/abandoned and not yet rescheduled are **absent**. |
| Staff | Previous dates, reasons, notice times, attempt history (not secret, not published), pencils, TBC / Not selected / Unavailable, AMI. |

Rules can only separate data stored separately — lay the nodes out by
audience. The NLS feed in nl-widgets is staff-claim only today.

## Broadcast

- Availability, six values: Worldwide, Overseas, Unavailable, TBC, Not
  selected, Cup (FA Cup / Trophy — not ours to broadcast).
- TBC → Worldwide (DAZN's 3–5 midweek picks) or Not selected. Unavailable is a
  League policy call for step 2 at Sat 3pm (Dagenham & Redbridge treated as
  step 1) and stays as is.
- **No rules engine.** Import brings every status in; all changes are manual.
  Exceptions are too many. NL Cup imports as Worldwide.
- **Enhanced** tick box (Standard otherwise). **Moved by DAZN** tick box with a
  running count against **120 a season** (all divisions; effectively
  National). **AMI** tick box, own tab.
- **Rescheduling a broadcast game** puts it on a "review broadcast" list with
  old and new dates; its status holds until confirmed.
- **The one calculated check — Article 48 blocked hours.** Every Saturday from
  22/08/2026 to 24/04/2027 inclusive, 14:45–17:15, except 26/09, 03/10, 14/11,
  26/12 and 27/03 (FA notice to steps 1–6, 12/08/2026). It is an external rule
  with published exemptions, not League policy. A UK-available game whose new
  slot *overlaps* that window gets a confirm step at pencil time. 12:30 and
  17:30 pass. (Extra time on a 12:30 NL Cup tie could overlap — noted, not
  built for.)
- DAZN Viewership then reads availability and moves from this record and stops
  inferring them (`dazn/_data.js` `checkPlayed`, the `round` code).

## Rearrangements and the date finder

States: **Postponed** (reason from `assets/data/postponement-reasons.json`,
notice time stamped) → **Pencilled** (staff only, soft-blocks both clubs'
other postponed games) → **Rescheduled** (decision time stamped; reappears
publicly). Latency comes free from the stamps.

**Calendar.** Season calendar = `assets/data/rounds-2026-27.json` (46
matchdays per division with windows: midweek Mon–Wed on Tue, weekend Fri–Sun
on Sat, Thu–Sat beside a Friday), extended with: FA Cup / Trophy / NL Cup KO /
playoff round dates, free-vs-used midweeks per division (the orange/yellow of
the League schedule PDF), and the blocked-hours window and exemptions. Data,
editable each season — the source dates are "subject to change".

**Candidate slots.** Saturday and Tuesday anchors where both clubs are free in
every competition. Thursdays behind an off-by-default "include Thursdays"
switch. Easter: Good Friday + Easter Monday, never Easter Saturday. **Last
usable slot is the midweek before the final matchday** — every league game
must be played before MD46 (Tue 20/04/2027, or Thu 22/04 with the switch).

**Cup awareness.**
- NL Cup entry is a club list (`competitions-meta.json` `entrants`), not a
  division — a couple of South clubs enter. Cup takes priority.
- Top two per group go to the QF (19/01). Work out qualification from group
  results; a club that has qualified has the QF date reserved before the draw.
- Two kinds of cup round: **blank Saturdays** (no league game — free for clubs
  already out, a top-tier slot, actively used) and **overlaid rounds** (league
  fixtures the same day — flag the club's league game "will be postponed if
  they win").
- FA Cup qualifying replays: the following Tuesday, qualifying rounds only — a
  soft block for clubs still in. FA Trophy: no replays.
- Richard enters FA Cup / Trophy results. Until a result is in, a possible cup
  date is a **soft flag**, and the past-dated tie sits at the top as a
  reminder.

**Flags, never blocks** (except dates actually taken):
- Possible cup date; replay Tuesday; Article 48 (above); Thursday.
- **Home/away runs**, all competitions counted (staffing and cost do not care
  which): 3+ in a row is a flag, rising in severity. Never hidden — sometimes
  unavoidable. Away games in the run show their figures, terse:
  `186 mi · 3h10`. No prose.
- **Club backlog** on the to-do list: badge when a club has more than one game
  awaiting a date; the finder shows the club's other outstanding games and a
  pencil soft-blocks them.

**Order.** To-do list oldest original date first. Slots: **cleanest first**
(fewest flags), date order within. 35-day window counts from the **original
fixture date**; slots beyond it show under a divider, not hidden.

**Display.** Dual month calendar, Mon–Sun: home club on top, away club below,
same columns; opponent crests, clear H/A; candidate, reserved, pencilled and
replay days each styled. No canon month calendar exists — build it as a
canon component (Content Plan's is the reference, not the template; improve
on it). The journey map is **out of scope** for now.

Not in scope: ground availability, police, pitches — admins judge those.
Automatic multi-game planning — ruled out.

## Distances

New shared lookup **`assets/data/club-distances.json`**, keyed by club-code
pair, from the xlsx Pairings tab: 72 clubs, names all match
`clubs-meta.json`, 5,111 of 5,112 directed pairs (missing: Yeovil Town home to
Worthing — fill from the reverse, marked). Directions differ — keep both; a few
differ by ~33 miles (Weston-super-Mare ↔ Eastleigh / Worthing) and stay as
given. A row (Home, Away) is the away club's journey to the home ground
(confirmed 28/10/2026). Cup
opponents have no coordinates — their legs show as unknown, not zero. Broadcast
Travel and Travel Planner are the other readers to move onto it.

## Build order

Done: the Fixtures tab (import, cup ties, postpone/abandon, results from the
workbook, NLS or a paste, Opta IDs filled from NLS).

Next, in order (re-ordered 28/10/2026):

1. **Attendance onto the record.** *(Built 28/10/2026: the season switcher,
   "Bring in from Attendance" for a past season, the crowd column, and
   Attendance reading `public/` for any season the record holds. Left: import
   the 2025-26 workbook (keyed to the Attendance archive by keyToAttendance;
   "Bring in from Attendance" is the fallback with no workbook), watch a matchday or two, then retire
   FixtureSync.)* Attendance figures are 100% club
   submissions, keyed by Opta match ID; only its fixture list comes from
   NLS, copied four times a day by `gas/FixtureSync.js` into
   `app-data/ops-attendance/fixtures`. That copy is now the weakest of
   three (FixtureSync, the NLS ingester, this record): it believes NLS
   dates, never deletes, and runs on Apps Script. No 2026-27 attendance has
   been submitted, so the switch is clean:
   - Fixture Management gains a season switcher and last season (2025-26),
     with its attendance joined by Opta ID — read, never copied, so a
     figure lives in one place.
   - Attendance reads its fixture list from this record (the `public/`
     projection, readable by every signed-in user, clubs included), ready
     for clubs to submit their own 2026-27 crowds.
   - Then FixtureSync's trigger is switched off, the file deleted and its
     copied fixture list cleared. Not before: switched off first, Attendance
     would stop seeing new ties and kick-off changes.
2. Season calendar file + club-distances file (data only).
3. Broadcast and AMI tabs; review-broadcast list.
4. Rearrangements tab with the date finder and the canon month calendar.
5. DAZN Viewership onto the record (availability and moves from Broadcast,
   not the workbook).
6. The public `/fixtures/` page for clubs.
