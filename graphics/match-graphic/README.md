# Match Graphic

Per-club fixture graphics for the whole season, laid out as folders ready to
upload to Google Drive. One graphic per fixture, delivered to both clubs.

```
Woking/
├── 2026-08-08 Sutton United (H)/
│   └── WOK-SUT.png
├── 2026-11-14 Forest Green Rovers (H)/
│   └── WOK-FGR.png
└── ...                              46 folders per club
```

Home club's code first, always — so `WOK-FGR.png` is the same file in Woking's
folder and in Forest Green's, byte for byte.

## Re-running it

Everything comes from `scripts/build-match-graphics.js`. Output goes to
`build/` which is git-ignored — **never commit it**, the full set is ~632MB.

```bash
# one club, after a crest or colour change
node scripts/build-match-graphics.js --clubs "Chester"

# the whole league, zipped by division
node scripts/build-match-graphics.js --split division --zip

# extra sizes alongside the standard 16:9
node scripts/build-match-graphics.js --clubs "Woking" --format 16x9,1x1,9x16
```

| Flag | Default | What it does |
|---|---|---|
| `--clubs` | all 72 | Comma-separated club names, exactly as in `clubs-meta.json`. Only fixtures involving these clubs are built. |
| `--format` | `16x9` | Comma-separated: `16x9`, `1x1`, `9x16`. |
| `--split` | `club` | How `--zip` groups the output: `club`, `division` or `none`. |
| `--zip` | off | Also produce zips under `build/.../zips/`. |
| `--out` | `build/match-graphics` | Output directory. |
| `--season` | `2026-27` | Picks `assets/data/fixtures-<season>.json`. |
| `--chrome` | auto-detected | Path to a Chromium binary, or set `CHROME_PATH`. |

Timings on a 4-core box: ~75 seconds for all 1,656 at 16:9; a single club is
about 5 seconds.

### Sending the output somewhere

There is no Drive integration — you download and upload by hand, deliberately.
If files are going through a chat or an email, note that **individual file
uploads cap at 30 MiB**. A club is roughly 9MB, so pack two or three per zip.
`--split club --zip` then grouping by hand is the simplest route.

A lossless re-encode saves a further ~20% (393MB → 316MB across the full set)
because the canvas PNG encoder does not optimise filtering. That needs an image
library, which this script deliberately does not depend on, so it is not built
in. If you want it:

```bash
python3 -c "
from PIL import Image; import glob
for f in glob.glob('build/match-graphics/_renders/*.png'):
    Image.open(f).convert('RGB').save(f,'PNG',optimize=True,compress_level=9)"
```
…then re-run the placement, or just re-copy from `_renders` using `manifest.json`.

## Formats

| Name | Pixels | Seam | Layout |
|---|---|---|---|
| `16x9` | 1920×1080 | leans off vertical | home left, away right |
| `1x1` | 1080×1080 | leans off vertical | home left, away right |
| `9x16` | 1080×1920 | leans off **horizontal** | home **top**, away bottom |

Portrait splits the other way on purpose: a near-vertical seam in a 9:16 frame
would leave two 540px slivers with nowhere for a crest to sit. Colours, band
order and the badge-on-the-seam all stay the same, so the three read as one
family.

**16:9 keeps the bare filename** (`WOK-SUT.png`); other formats get a suffix
(`WOK-SUT-1x1.png`). That way re-running with extra formats never invalidates
folders already uploaded to Drive.

To add a format, add an entry to `FORMATS` in
`graphics/_shared/match-graphic.js`. Each one carries its own explicit geometry
rather than being scaled from 16:9 — a single scale factor cannot serve both a
wider and a taller frame, and type sizes need judgement rather than arithmetic.
`tests/match-graphic.test.mjs` will check the new entry is complete.

## Design rules

Set with the brand owner on 30/07/2026. These are decisions, not defaults —
please don't "tidy" them without asking.

- **Panels are always the club `primary`, both sides.** Never `secondary`: a
  club may play in an away kit that isn't its secondary colour, so painting
  half the graphic in it asserts something untrue.
- **Bands run outward from the seam** — primary, then secondary, then tertiary.
  The primary band is the divider; the other two read as inset pinstriping, and
  primary meets primary at the seam.
- **Text is `secondary` when legible on the panel, otherwise `tertiary`.**
  Legible means contrast ≥ 2.5:1 *and* not a both-dark pair. Across the 72 that
  lands 66 secondary, 5 tertiary, 1 best-effort (Aldershot).
- **Crests are drawn untreated** — no outline, box or shadow.

### Why the both-dark guard exists

WCAG's contrast ratio is unreliable at the dark end. It scores Chorley's
red-on-black at **5.26:1** but Worthing's white-on-red at only **3.89:1** —
exactly backwards from how they read at 200pt. The ratio alone therefore cannot
express the rule, so `isLegible()` also rejects any pair where both colours are
dark. That is what sends Chorley to its tertiary and keeps Worthing on its
secondary.

The 2.5:1 floor is likewise deliberate: it admits Scunthorpe's maroon at 2.85:1,
matching the original hand-made graphic, plus Braintree at 2.61 and King's Lynn
at 2.76.

### Two antialiasing traps

Both were real, visible bugs. If you refactor the drawing code, keep them fixed.

1. **Same-coloured neighbouring bands must merge into one fill.** Two abutting
   paths each antialias their shared edge and the coverage doesn't sum to 1, so
   the panel colour bleeds through the join as a thin line — measured at
   `(237,195,199)` for white bands over Woking red, on 115 of 115 sampled rows.
   47 of the 72 clubs have `secondary === tertiary`, so this is the common case.
   Handled by `bandRuns()`.
2. **The panels must not abut either.** Same cause, and it left the seam partly
   transparent (alpha down to 192). Invisible on a dark background but a pale
   line down the middle on white. `fillPanels()` paints the away colour across
   the whole canvas and clips the home wedge over it.

Take the canvas context with `{ alpha: false }`. The artwork is full-bleed and
opaque, so an alpha channel is ~27% of every file for nothing.

## Data

| File | Used for |
|---|---|
| `assets/data/clubs-meta.json` | club `code` and `colors` — the **only** colour source |
| `assets/data/fixtures-<season>.json` | the fixture list |
| `assets/data/competitions-meta.json` | `logo` path per competition |
| `assets/crests/<exact club name>.png` | crests |
| `assets/data/cup-clubs-meta.json` | NL Cup opponents — optional, see below |

**Do not read `graphics/_shared/clubs-data.js`.** That mirror is stale (v1.2
against clubs-meta v1.10) and 29 of its 72 primaries have drifted — Scunthorpe
and its own secondary are swapped, Solihull renders navy when it's yellow, and
every white-primary club comes out grey `#444444`. It also lacks
`code`/`secondary`/`tertiary`. `fixtures-graphic` and `table-graphic` still use
it and are affected.

### Adding the NL Cup

The renderer and the build already handle it. Two things are needed:

1. **`assets/data/cup-clubs-meta.json`** — the Premier League and Championship
   representative sides. Same record shape as `clubs-meta.json`:

   ```json
   {
     "version": "v1.0",
     "clubs": [
       { "name": "Birmingham City", "code": "BIR",
         "colors": { "primary": "#0000FF", "secondary": "#FFFFFF",
                     "tertiary": "#FFFFFF" } }
     ]
   }
   ```

   Crests already exist for the whole EFL and Premier League — 93 of them —
   keyed by exact club name, so only `code` and `colors` are missing. The file
   is kept separate from `clubs-meta.json` on purpose: at least six graphics
   tools read that file and filter on `division`, and `division: null` there
   already means "former NL club" (Rochdale, York and eight others). Adding
   non-members with no division would make them indistinguishable.

2. **NL Cup fixtures in the fixtures file**, with `competition` set to
   `NL Cup` — the string must match `competitions-meta.json`.

Placement needs no change. The rule is *"one copy per side that is an NL member
club"*, so a cup tie against a representative side is delivered **once**, to the
NL club, because the visiting club has no folder. A league fixture gets two.

Any fixture whose clubs or competition logo can't be resolved is **skipped and
listed in `manifest.json`** rather than failing the run, so adding cup fixtures
before the club data won't break a league build.

## manifest.json

Written next to the output. Records `renderVersion`, the formats built, the
text-colour basis per club, every fixture skipped and why, and the folders each
graphic was placed into. `panelsMerge` lists fixtures whose two primaries are
close enough to read as one field — 226 of 1,656, mostly the 13 white-primary
clubs meeting each other. That is a "worth a look" list, not a defect list; the
seam bands separate them adequately.

Bump `RENDER_VERSION` in the renderer whenever a change alters output pixels,
so a delivered folder can always be traced back to the code that drew it.
