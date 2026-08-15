# The public-site tickers (widgets/)

Three Shadow-DOM ticker widgets embedded on thenationalleague.org.uk, each fed
by a published Google Sheet CSV, each hand-edited in the CMS. Deleted
15/08/2026, along with the `widgets/` directory itself and the
`embeds/results-ticker.html` wrapper.

## What they did

One `<div data-nl-…-ticker>` plus one `<script src="https://nl.tools/widgets/…">`
pasted into the CMS. The script booted on the data-attribute, fetched a Sheet
CSV and `clubs-meta.json`, and scrolled a broadcast-style strip — crests,
club-colour pills, seamless loop, drag scrub. Content was editorial: someone
typed headlines / transfers / fixtures into a Sheet and the site picked it up
inside two minutes.

## Why they went — the finding matters more than the code

All three were dead, differently, and had been since March:

- **News ticker** — the 2 March v1.8.2 edit deleted one closing brace. A script
  that fails to parse runs none of itself: no error, no ticker, for five and a
  half months.
- **Results ticker** — real widget through v1.72 (2 March). On **11 March**
  someone pasted the Transfers Ticker v2.0 over the file. Same filename, wrong
  widget: it boots on `[data-nl-transfers-ticker]`, every embed on the site
  creates `[data-nl-results-ticker]`, zero matches, renders nothing.
- **Transfers ticker** — its code survived only by squatting in the results
  ticker's file (above); its own file was gone, and its scratch copy
  (`widgets/test.js`) called the retired transfer-centre Apps Script.

Nobody reported any of it. Five months of a silent public surface is the
usefulness measurement for the whole family, and the measurement is zero.

## The settled decisions

- **A syntax error on a fan-facing file must fail CI**, because no human is
  watching. `tests/embeds-parse.test.mjs` now parses every `embeds/` script and
  inline block; it covered `widgets/` too until the directory went.
- **Sheet-fed editorial content needs an owner or it is a liability.** Every
  one of these would happily have scrolled March's content to fans in August.
  Any rebuild must answer "who edits the Sheet, and what happens when they
  stop" before it answers anything technical.
- The **CMS blocks outlive the code**. Wherever these were pasted, the strip
  has shown nothing since March; the blocks should be deleted from the CMS on
  the next edit of those pages. A dead embed is invisible in the CMS editor —
  there is no list of where a widget was pasted, which is itself a lesson.

## If a ticker comes back

The animation and layout work is finished and debugged — take it from git
(`f938950e:widgets/results-ticker-widget.js` is the transfers ticker v2.0, the
most polished of the family; `17b6e65c^:widgets/news-ticker-widget.js` is the
news ticker at v1.8.3, parsing). Feed it from RTDB or NLS, not a Sheet, unless
the Sheet has a named owner. The vidiprinter and match-centre embeds already
cover live scores; a rebuilt ticker earns its place only for *editorial*
content those cannot carry.

## What still exists

The two Google Sheets and their published-CSV URLs (in git history). Nothing
reads them; they cost nothing; delete at leisure.
