# Sponsor board exposure — spike, not a tool

Measures how long a perimeter advertising board was on screen in match video,
and how readable it was while it was there. Written 26/08/2026 to answer one
question: can the league measure this itself, cheaply, rather than buy it.

The answer is yes. What is here is a working detector and nothing else — no
gated page, no RTDB node, no registry record, no workflow. Read
`system/tool-status-and-access.md` before assuming otherwise.

## Run it

```bash
pip install opencv-python-headless numpy
python3 scripts/board-exposure.py --video match.mp4 --logos ./logos --out result.json
```

`--logos` is a directory holding one image per sponsor board, named for the
sponsor (`enterprise.png`, `ashmead-roofing.png`). Crop them square-on from
footage, or photograph the boards at the ground before kick-off — the second is
better, because it gives you the artwork under that ground's actual lighting.

No footage to hand? `scripts/board-exposure-testclip.py` renders a synthetic
match — panning camera, static boards, players crossing in front, focus drift —
so the pipeline can be exercised without waiting on a rights conversation.

## Clarity and confidence are different numbers

The one design decision worth defending. Two quantities get conflated in this
field, and the conflation is not harmless:

- **Confidence** — how sure the matcher is that this is that sponsor's board.
  A property of the software. It belongs on an error bar.
- **Clarity** — how readable the board actually was: size on screen, focus,
  contrast, viewing angle. A property of the exposure. It belongs in the value.

Multiplying value by confidence penalises a sponsor whose artwork the matcher
finds awkward. That is a software problem invoiced as a delivery problem. So
`exposure_index` is built from clarity alone; confidence is reported next to it
and decides only whether a detection counts at all.

## What the weights are, and what they are not

`clarity_score()` combines size, focus, contrast and skew at 40/25/20/15. Those
are a stated choice, not a measurement. They are written down so the score is
reproducible and arguable — not because they are right.

**Calibrate them against a hand-count before any figure from here goes to a
partner.** Watch one match, log one sponsor's board by hand, compare. Until
that has happened this produces numbers, not evidence.

## Cost, measured not guessed

Timed on a 4-core box, 3 reference logos, sampling twice a second:

| | |
|---|---|
| Video decode | 769 fps — negligible |
| Match, 720p | 106 ms per sample |
| Match, 1080p | 224 ms per sample |
| 90 minutes, 1080p, ~10 sponsors | roughly 60–70 min single-threaded |

The work is embarrassingly parallel — chunk the match across cores, and matches
across jobs. A full matchweek fits inside a few hours of wall clock on standard
runners, which are free on a public repository.

**Do not put the video in Firebase Storage.** Egress at $0.12/GB is the only
real cost in the whole design: a season of full matches pulled back out runs to
hundreds of dollars, against ~$0 for everything else. Stream the file from
wherever it already lives, extract, score, discard. Only the JSON persists, at a
few hundred KB per match.

## The constraint that actually decides this

Not the computer vision. The footage.

Highlights packages are cut by the club being measured, which makes the sample
editorially selected by the interested party — a club publishing 15-minute
packages out-scores one publishing 5-minute packages on identical board
delivery. Full matches remove that, and nothing else does. Whoever builds this,
it is only worth the input it is given.
