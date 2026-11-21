# Match Centre and Vidiprinter

**Retired 15/11/2026.** Two website embeds, both out of use. The other fan
widgets (Score Predictor, Team of the Week nominations and the Fan Widgets
page) stay live.

Last commit holding both: **`fa3678a`**. Get either back with
`git show fa3678a:embeds/match-centre.html` or
`git show fa3678a:embeds/vidiprinter.html`.

| Thing | What it did |
|---|---|
| Match Centre (`embeds/match-centre.html`) | Live scores and a match centre for the website, read straight from NLS in the browser. No data of its own. |
| Vidiprinter (`embeds/vidiprinter.html`) | A scrolling goals feed, read from the `nl-vidiprinter` Firebase project. |

## What stayed, on purpose

- **The `nl-vidiprinter` Firebase project.** The estate list said to remove the
  Vidiprinter "data and all", but the NL Data MCP uses that project as its
  scorer cache. Only the page went. Check with the MCP before anyone deletes
  the project or its data.

## Worth keeping

The Match Centre's live-status rules (when a game counts as kicked off,
half-time, full time, and how the score is read) are the part a rebuild would
want. `embeds/nl-cup-live.html` reads the same feed today and is the place to
start.

The CMS blocks that embedded these on thenationalleague.org.uk show nothing
now and should be removed from those pages.
