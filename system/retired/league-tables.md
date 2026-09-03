# League Tables (`/graphics/league-tables/`)

Retired 28/08/2026. Superseded by `/graphics/table-graphic/` (the "Broadsheet"
rebuild), which had covered everything this tool did for weeks. The two ran
alongside each other from the rebuild until now because the header said "do not
remove league-tables yet" and nobody revisited it.

## What it did

Turned a pasted league table into an on-brand social graphic. Paste TSV or CSV
(with or without a header row), pick a division, optionally pick a matchday,
download 1×1 or 4×5 PNG. Three divisions, no cup. Rendered to a `<canvas>` at
1347×1347.

## Why it went

`table-graphic` is a strict superset:

| | league-tables | table-graphic |
|---|---|---|
| Sizes | 1×1, 4×5 | 1:1, 4:5, 9:16 |
| Data in | paste only | NLS feed **or** paste |
| Editing | re-paste | per-row grid editor |
| Zones | positional only | positional rail **and** confirmed band |
| Designs | one | four directions |
| Render | `<canvas>` | DOM + html-to-image |

Nothing it did was lost, so there was no migration to do — only a link to
remove from `/graphics/`.

## The decisions worth keeping

1. **Export assets are same-origin, always.** Crests, backgrounds, division
   badges and partner logos are drawn into the export, and a cross-origin image
   taints the canvas — the asset is then dropped from the export silently, so
   the graphic ships with a gap and nobody is told. This tool learned it first;
   the note outlived it in `graphics/single-fixture/`, which pointed *at this
   tool* for the explanation rather than stating it. That pointer is now gone
   and the reason is written where it is needed. Same lesson, same fix, in
   `fixtures-graphic`: pre-inline every image before capture, and name any
   image that failed in the export warning.

2. **The font warmup span.** Canvas text measurement needs the webfont actually
   loaded, not merely declared — an off-screen span in the face being measured
   forces it. A canvas rebuild would hit this again on the first export from a
   cold cache. `table-graphic` avoids it entirely by rendering DOM instead of
   canvas, which is the better answer where it is available.

3. **The position-band palette was this tool's**, promoted to
   `NL.positionBands` in nl-utils v1.5 and described there as the single source
   for NL position bands. It never was: the Broadsheet rebuild shipped its own
   palette and read none of it, so canon held one set of blues
   (`#7F99DC` / `#3760C8` / `#2D4FA4` / `#192C5C`) while the only tool actually
   publishing a table graphic rendered another. Settled 28/08/2026 — Broadsheet
   is the right one, and `NL.positionBands` now carries it. If a future table
   graphic wants the old blues, they are in this file and in git.

4. **Matchday was a select that was always "N/A".** The options were never
   populated. `table-graphic` asks the same question as free text plus
   Current / Final Standings, which is what the graphic actually needed.

## What is NOT recorded here

The canvas rendering engine (~200 declarations of layout maths). It is in git
at the retirement commit if a canvas exporter is ever wanted again, but the
rebuild deliberately moved away from canvas, so it is a dead end rather than a
starting point.
