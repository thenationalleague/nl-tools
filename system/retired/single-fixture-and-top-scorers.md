# Single Fixture and Top Scorers — retired 31/10/2026

Two canvas graphics tools under `/graphics/`, both on the shared
`staff-graphics` key, deleted together on Richard's say-so: "we don't need the
one that's called single fixture, or top scorers, anymore."

Recover either from git history (last version of each: v2.2, 15/08/2026) if a
need reappears.

## What they were

- **Single Fixture** (`graphics/single-fixture/`) — one game on a card: two
  crests, kick-off date and time, matchup text, exported 1:1 and 4:5. Picked
  clubs from `NL.clubs`. Superseded by **Match Graphic**
  (`graphics/match-graphic/`), which draws the same Team v Team card in all
  four delivery sizes with club colours and the Cup's guest sides.
- **Top Scorers** (`graphics/top-scorers/`) — eight scorers per division with
  crests, names and goal totals, plus an optional photo panel with pan and
  zoom. Every row was typed in by hand.

## The decision worth keeping

**A scorers graphic must not be built from the NLS per-match goal events.**
The same reasoning already sits in `gas/ClaudioChat.js`, where Claudio's
`getTopScorers` was deliberately left out: NLS has acknowledged gaps in
per-match goal entry, so any total summed from those events is unreliable. If
a scorers graphic comes back, take the totals from an authoritative list (the
hand-maintained `/history/top-scorers` page on the website, or a source the
League confirms), not from a sum of match events — or keep them typed in, as
this tool did.

## What was left behind on purpose

- `portal/index.html` still labels the `single-fixture_download` and
  `top-scorers_download` analytics events, so past downloads in the activity
  log read as words rather than raw keys.
- `assets/data/tools-inventory.json` is rebuilt by `build-inventory.yml`; it
  drops both tools on its next run and is not edited by hand.
