# New season checklist

Written 13/11/2026 for the first real rollover on **1 July 2027** (the 2027-28
season). Read it in June, not on the day. The season job has never run for
real, so treat the first one as a test: check each line afterwards.

A season is named by its first year: `2027` is 2027-28.

## Before 1 July: the one thing that breaks everything if missed

**Every club in `assets/data/clubs-meta.json` needs its division for the new
season** (`"seasons": { …, "2027": "National" }`), and promoted or relegated
clubs need adding or ending. Tools ask "which clubs played this season?" by
reading that map (`NL.season.clubsFor`, `NL.clubs.forSeason`). The season job
only moves `seasons.current`. If it moves before the clubs have a 2027 entry,
every club picker, Attendance, Fixture Management's league count and every
club-code door sees **no clubs**.

- Add each club coming in (code, name, Opta ID, colours, crest name) and its
  2027 division. Its crest goes in `assets/crests/` (the crest thumbs job
  makes the smaller sizes on merge).
- Clubs going out keep their record and simply have no 2027 entry.
- Cup sides from outside the League go in `cup-clubs-meta.json`, not here.
- Merge it before 1 July. The tests check clubs-meta's shape on the PR.

## What runs by itself

| When | Job | What it does |
|---|---|---|
| 1 July, 02:00 UTC | **Timer · New season** (`season-rollover.yml`) | Sets `seasons.current` to the new year in clubs-meta and adds its label. Commits straight to main. Nothing else. |
| Every night | **Timer · League table snapshot** | Starts saving the new season's tables as soon as NLS has them, reading the season from clubs-meta. |
| From then on | Attendance | Files figures under `archive/<new season>/` from the first submission. No year-end step exists any more. |
| From then on | Every tool using `NL.season.current` | Defaults to the new season. The old one stays in each season dropdown. |

If 1 July passes and nothing happened: Actions → **Timer · New season** →
Run workflow (leave the year blank). It is safe to run twice.

## What has to be done by hand

**Fixtures**
- Fixture Management: when the new season's fixtures are published, add
  `assets/data/fixtures-2027-28.json` (the published schedule), and its
  `calendar-2027-28.json` and `rounds-2027-28.json`. **The page names the
  2026-27 files in code** (`fixtures/index.html` `SEED_URL`,
  `fixtures/_finder.js`), so those three paths change in the same PR. A
  canon candidate: read the file name from the season instead.
- Then import the season's workbook in Fixture Management → Manage → Import.
  Check Manage shows 552 league games in each division.

**Season numbers typed into code**
- Travel planner: `var SID=2026` (the NLS season ID) becomes 2027.
- Broadcast selections: `SEASON_KEY = "2026-27"` and its season button, plus
  the whole season's data block, which is pasted in.
- Better than remembering: turn each of these into a read of
  `NL.season.current` the next time the page is touched.

**Clubs and their access**
- Club codes: Access → Codes → **Issue any missing** gives each new club its
  code. Send it with the season's welcome.
- Club passes: people at a club that went out keep their account. Decide per
  club whether their pass is withdrawn (Access → the person → Edit pass).
- ECAL: the 72 club calendar widgets are set up in ECAL itself, outside this
  repo. New clubs need a widget, and leaving clubs' widgets switching off.

**Content**
- Handbook: make the season's changes in the Handbook tool and press
  **Publish** when they are signed off. The reader and the PDF follow.
- DAZN Viewership: import the first matches sheet under the new season
  (DAZN → Manage → Import). Past seasons stay.
- Programme Packs: nothing to do. Each club's library carries on.

## Check afterwards (yes / no)

1. clubs-meta's `seasons.current` is the new year.
2. A club picker lists 72 clubs, the new ones included.
3. Attendance opens on the new season with every club's fixtures once they
   are imported.
4. Fixture Management → Manage shows 552 in each division.
5. A new club's code opens its club pages.
6. The table snapshot for 2 July has the new season's (empty) tables.
