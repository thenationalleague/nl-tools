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

## Tested on real footage, 26/08/2026

Eight frames from a full Sutton United match (LIGR, 2:00:50), hunting the
Enterprise board. An earlier version of this section reported 0 of 8 using the
brand asset and concluded that neither brand assets nor feature matching work at
National League camera distances. **Both conclusions were wrong**, and the
correction matters more than the original claim, so it is recorded here rather
than quietly edited away.

The test matched reference descriptors against the *entire* 1913×1115 frame. A
football frame carries tens of thousands of SIFT keypoints — crowd, grass,
trees, houses behind the stand — so for almost every reference descriptor there
is a spurious near-neighbour somewhere in shot, and Lowe's ratio test throws the
true correspondence away with the false one. The boards were findable the whole
time. The search was pointed at the wrong thing.

`scripts/board-exposure-sizetest.py` isolates the variables, and two results are
solid:

| Rendition of the same logo at 129×44 — the real board size | SIFT features | Matched? |
|---|---|---|
| Pristine | 83 | 27 inliers |
| JPEG q=45 | 78 | 27 inliers |
| JPEG q=25 | 99 | — |
| Softened (camera/encode blur) | 106 | 24 inliers |
| **The genuine board, cropped from the match** | **112** | **19 inliers** |

**Footage quality is not the constraint.** Compressing to JPEG q=25 barely moved
the feature count, and a deliberately softened render still matched with 24
inliers. Low bitrate is a red herring here.

**Board size is not the constraint either.** At the real 129×44 — 0.27% of a
1080p frame — the brand asset matched with 27 inliers, and matched the actual
photographed board with 19. So `assets/partners/*.png` *are* usable references,
and a library need not be hand-cropped at 72 grounds.

## Recall, measured by eye — 2 of 3, no false positives

`scripts/board-exposure-annotate.py` closes the loop: search a sliding
horizontal band instead of the whole frame, require every match to pass a
geometry check (roughly 3:1, near level, plausible area, convex, opposite sides
in proportion), then draw the survivors so a person can judge them rather than
trust an inlier count.

Scored against the eight frames by looking at every one:

| | |
|---|---|
| Frames with a visible Enterprise board | 3 |
| Found, boxes sitting exactly on the board | 2 |
| Missed | 1 — clipped by the right frame edge |
| False positives across all 8 frames | 0 |

The second hit is the one that matters: a different camera position, a different
zoom, lighting an hour apart, and `assets/partners/Enterprise.png` — a file
nobody cropped from this match — landed on the board with 19 inliers. Brand
assets work as references. The geometry check is doing real work, rejecting
matches sprawled across rooftops and pitch that inlier counts alone had waved
through.

Three of eight frames, one sponsor, one match, one ground. That is a signal, not
an accuracy figure, and nothing here should reach a partner as evidence.

A caution recorded because this session walked into it: TIC Health is plainly
visible on two of these frames, and an earlier pass through five of them
concluded it was absent from the ground. Five frames of not-looking-hard-enough
produced a confident wrong answer about a league partner's delivery. That is the
false-negative trap this tool exists to avoid, and it caught its own author.

## The ident trap — a false positive worth knowing about

A highlights package opens with a sponsor ident card: the Enterprise mark and
the National League roundel, held full-screen on black. The detector matched it
happily, and counted it as perimeter exposure. It is not — it is a different
piece of inventory, priced differently, and the first thing a partner would
challenge.

`on_the_perimeter()` in `board-exposure-run.py` rejects it on context rather
than appearance: a hoarding stands on the touchline, so there is always pitch
below it. Sample the strip under the detected quad and require it to be mostly
grass by hue and saturation. An ident on black fails; a real board passes.

The correction is large enough to be the point. On the Harrogate clip it took
Enterprise from 74 detections to 36, and from a reported 38.6 seconds to 16.5 —
over half the original figure was the ident card. On Sutton it took 67.2s to
60.2s and halved the mean board size, because the ident is far larger than any
hoarding and was dragging the average up.

Anything reporting exposure from a highlights package needs this check or an
equivalent. Without it the number is inflated in a way that looks plausible.

## First full clip — Sutton United v Crystal Palace highlights

`scripts/board-exposure-run.py` over a real 3m28s LIGR highlights package
(1920×1080, 50fps), sampling twice a second, matching the two National League
partners straight from `assets/partners/`:

| | Enterprise | TIC Health |
|---|---|---|
| Samples with a detection | 74 of 415 | 0 |
| Seconds on screen | 38.6 of 207.9 (19%) | — |
| Separate runs | 7 | — |
| Exposure index | 22.0 | — |
| Mean clarity | 0.571 | — |
| Mean board size | 0.462% of frame | — |
| Most boards at once | 2 | — |

Runtime was 216s for 208s of video on four cores — roughly real time, so a
90-minute match is about 90 minutes single-threaded, and it parallelises across
cores and jobs.

**Read TIC Health's zero as unverified, not as absence.** It is exactly the
shape of answer this tool must never be trusted on without a hand-count, and
the paragraph above records this session getting that call wrong once already.
The clip is goal-focused highlights, so a board on the far side may genuinely
never appear — or the detector may be missing it. Nothing distinguishes those
two from the output alone.

The clarity weights were recalibrated here: real boards run 0.1–0.6% of frame,
so the size term now saturates at 0.6% rather than the 2% the synthetic clip
suggested. Still a stated choice, still uncalibrated against a hand-count.

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
