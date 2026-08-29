# Sponsor board exposure — spike, not a tool

Measures how long a perimeter advertising board was on screen in match video,
and how readable it was while it was there. Written 26/08/2026 to answer one
question: can the league measure this itself, cheaply, rather than buy it.

The answer is yes. What is here is a working detector and nothing else — no
gated page, no RTDB node, no registry record, no workflow. Read
`system/tool-status-and-access.md` before assuming otherwise.

## Run a full match

On your own machine. Nothing uploads, nothing downloads, so there is no
file-size limit and no egress bill — which is what killed every cloud-shaped
version of this design.

```
pip install opencv-python-headless numpy
python board-exposure-match.py --init --refs refs
```

Then put reference images in `refs/`, drop videos in `inbox/`, and run the batch:

```
python board-exposure-match.py --batch inbox --refs refs
```

It reads the fixture off each filename where it can, shows what it read, and
lets you correct it:

```
  2026-08-23 Sutton United v Hartlepool United.mp4
    Fixture : Sutton United v Hartlepool United
    Ground  : 5 local boards + the partner marks
    Enter to accept, a new fixture as 'Home v Away', '?' for grounds, or 's' to skip:
```

**Every question is asked up front, then it runs unattended** — a batch that
stops halfway through six matches to ask something is one you have to sit with.

### Trim to the match

It also asks for kick-off and full time, because **a stream is rarely just the
match**. A LIGR file opens on a holding slate and runs through the warm-up, and
that costs twice:

- The warm-up shows real boards on real grass, so it is counted as match
  exposure. It is exposure, but it is not what anyone means by "on screen
  during the match", and how much of it a stream carries varies by fixture.
- Every share is divided by the file's length. Half an hour of build-up in a
  two-and-a-half hour file understates every sponsor by about 20%.

Blank means measure the whole file. `--start 18:30 --end 2:05:00` does the same
non-interactively. Trimming also skips extracting and scanning the build-up, so
it is faster as well as more accurate. The holding slate itself was already
rejected — no grass beneath it, the same check that kills the ident card — but
nothing was catching the warm-up.

The home club is confirmed rather than assumed because it decides which club
folder joins the league partner marks, and **the wrong ground silently drops
every local board while still printing a table that looks entirely fine**. That
is the worst failure mode this has: nothing about the output looks wrong.
Naming a file after its fixture reduces the confirmation to pressing Enter; a
file with an unhelpful name is a question, not a lost cause. `-y` skips the
questions entirely for unattended runs.

On Windows `measure-matches.bat` does the same by being double-clicked, or by
having videos dragged onto it — no terminal, nothing to install beyond Python.

Out comes `<match>-report.html` — one self-contained page — plus
`<match>-data.json` (the summary, which is what the Brand Exposure tool takes)
and `<match>-detections.json` (every detection).

| File | |
|---|---|
| `scripts/board-exposure-match.py` | the command. Extract, scan, report. |
| `scripts/board_exposure_core.py` | the detector. One copy, imported by everything. |
| `scripts/board_exposure_report.py` | the page. |
| `scripts/measure-matches.bat` | Windows drop-target / double-click launcher. |

ffmpeg is used for frame extraction when it is on PATH and OpenCV decodes
directly when it is not, so ffmpeg is a nice-to-have rather than a requirement.
Verified against OpenCV 5.0.0 and numpy 2.5.2 on Windows, Python 3.12 from the
Microsoft Store — which matters, because that install needs no admin rights and
was the only route available on the machine this has to run on.

Useful flags: `--limit 200` scans the first hundred seconds so a ground can be
checked before committing to the full run; `--stills 40` writes full-size frames
spread across the match, each the sharpest of six nearby, to crop references
from; `--list` prints what it would search for and stops; `--jobs` overrides the
core count.

### The folder is the configuration

```
refs/partners/<Sponsor>/*.png        searched at EVERY ground
refs/clubs/<Club>/<Sponsor>/*.png    searched only when that club is at home
```

Folder name is the name printed on the report. Any number of images per
sponsor — several board designs roll up under the one name. `--club` picks
which club folder joins the partners for this match, so Sutton's hoardings are
never hunted at Harrogate.

That distinction is the whole point of the split: league partners are sold
once and delivered at 72 grounds, club boards are sold by the club and
delivered at one. A tool that cannot tell them apart cannot report either.

### What makes a reference work

- The brand's own logo file is a fine starting point — Enterprise was found at
  a ground with nothing cropped from that ground.
- Crop square-on and tight to the printed area.
- **Nothing in front of it.** Skyline Roofing was never found at Sutton because
  the only crop taken of it had a player across the board.
- Greyscale detail is what matches. A flat two-colour wordmark has less to work
  with than a busy one and will be harder to find.

No footage to hand? `scripts/board-exposure-testclip.py` renders a synthetic
match — panning camera, static boards, players crossing in front, focus drift —
so the pipeline can be exercised without waiting on a rights conversation.

### Runtime

The scan is embarrassingly parallel and the runner splits it across cores. A
90-minute match at two samples a second against ten references is roughly half
an hour on sixteen cores, against about eight hours on one. Frame extraction is
restartable — a killed run picks up from the frames already on disk rather than
decoding again.

One optimisation is deliberately **not** taken: batching every reference's
descriptors into a single `knnMatch` per band would cut call overhead
tenfold, but it changes which matches survive the iterative inlier-removal
loop, and that would make a full-match run incomparable with the clip numbers
already published below. Worth doing once there is a hand-count to re-validate
against.

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

## Engine 1.1 — tracked gap fill, and the eval that gates every tune

Watching the first cloud-measured match back (29/08/2026) showed boards
plainly on screen with no boxes. Two causes, two remedies, and a rule.

**Cause one is the references** — logo lockups instead of board crops — and
that is artwork, not engine: see REFERENCES.md.

**Cause two is pan blur.** SIFT matches fine detail, and every time the camera
pans with play the whole frame smears; the board is still there, but its run
fragments and the seconds leak. Engine 1.1 answers with tracking: when the
same sponsor is detected on both sides of a gap of up to 4s, the board's patch
is template-chased through the blurred frames at quarter scale (where blur
costs little), forward from one anchor and backward from the other so the
most-smeared middle frame is reached from its least-smeared neighbour. The
fill is all-or-nothing — a frame neither chain can account for, which is what
a cut to the crowd looks like, abandons the whole gap. Tracked hits are
honest: `tracked: true`, `inliers: 0`, correlation recorded, clarity measured
on the actual blurred frame, and a run is never extended past its last real
detection. Cost is ~10–20% of scan CPU, pennies.

Numbers moved, so this is **engine 1.1** and does not compare with 1.0 —
which cuts both ways usefully: the Sutton match measured on 1.0 is the natural
before/after once it is re-scanned.

**The rule that comes with it:** no threshold, weight or tracking parameter
moves again without `scripts/board_exposure_eval.py` saying what it did.
Label a couple of minutes of a real match while watching it —

```
window,0:00,2:00
Enterprise,0:12,0:31
DAZN,0:20,0:48
```

— one row per legible appearance, and run it against the detections export:

```
python scripts/board_exposure_eval.py match-detections.json labels.csv
```

It prints recall and precision per sponsor, what tracking contributed, and
shouts if precision drops under 95% — because a phantom second sold to a
partner is worse than a missed one, and every recall lever can also
manufacture phantoms. The scoring maths is unit-tested in CI
(`tests/test_board_exposure_*.py`); the OpenCV-dependent tracker cases run
wherever a scan runs, and were proven against synthetic pans, cuts and
motion blur — including watching each test fail under sabotage first.

## Next: engine 1.2, a visibility metric (decided 29/08/2026, not built)

Watching the measured match showed boards part-blocked by players and
stewards, which today is a cliff: a half-hidden board either still matches
and gets FULL credit — the homography projects the whole reference quad — or
drops below the inlier floor and scores zero for that sample. Nothing records
that a detected board was half-covered.

The build, when it happens: after a detection locks a homography, rectify the
frame patch back to reference space (the warp `quality()` already does) and
compare it to the reference on a coarse grid; disagreeing cells are occluded.
Per-hit `visibility` 0..1, rolled up as mean visibility and an obstruction
rate ("on screen 2m 17s, part-blocked 38% of it") — which is placement
intelligence a sponsor and club can act on at renewal: a board regularly
obscured is a board worth moving. Kept a SEPARATE column, never an index
discount, until real data has been looked at — what a half-blocked board is
worth is a commercial judgement, not a constant. Tracked hits have no
homography, so their visibility is null, never faked. Depends on whole-board
references, which exist as of the same date. Goes through the eval like
everything else.

## The ident trap — a false positive worth knowing about

A highlights package opens with a sponsor ident card: the Enterprise mark and
the National League roundel, held full-screen on black. The detector matched it
happily, and counted it as perimeter exposure. It is not — it is a different
piece of inventory, priced differently, and the first thing a partner would
challenge.

`on_the_perimeter()` in `board_exposure_core.py` rejects it on context rather
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

## Two clips, after the ident filter

The detector now in `board_exposure_core.py`, over two real LIGR highlights
packages, both 1920×1080 at 50fps, sampled twice a second, matched against
`assets/partners/` with nothing cropped from either ground:

| | Harrogate v Barnet (3m28s) | Sutton v Hartlepool (2m49s) |
|---|---|---|
| **Enterprise** — seconds | 16.5 (8%) | 60.2 (36%) |
| Separate runs | 2 | 9 |
| Exposure index | 10.4 | 24.0 |
| Mean clarity | 0.63 | 0.40 |
| Mean board size | 0.56% of frame | 0.15% of frame |
| **TIC Health** — seconds | not detected | 29.6 (17%) |
| Separate runs | — | 5 |
| Exposure index | — | 16.6 |
| Mean clarity | — | 0.57 |

Runtime is roughly real time on four cores, so a 90-minute match is about 90
minutes single-threaded, and it parallelises across cores and jobs.

The two clips differ in a way worth reading: Sutton is shot on a wide static
gantry that holds most of the perimeter, so Enterprise is on screen for over a
third of the package but small and soft (0.15% of frame, clarity 0.40).
Harrogate cuts tighter and closer, so the board appears far less but reads much
better when it does (0.56%, clarity 0.63). Seconds alone would rank these two
grounds wrongly — which is the entire argument for weighting by clarity.

**TIC Health appears at Sutton and not at Harrogate.** That is the answer the
first clip could not give, and it is why its zero was recorded as unverified
rather than absent. A zero from one package still means only that: not found in
this edit, not proof it was not there.

The clarity weights were recalibrated for real footage: boards run 0.1–0.6% of
frame, so the size term saturates at 0.6% rather than the 2% the synthetic clip
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

**Egress is the only real cost, and it depends entirely on where the scan runs.**
An earlier version of this section said flatly "do not put the video in Firebase
Storage", which is half right and was misleading enough to rule out an
architecture that works.

The $0.12/GB is *internet* egress — the bill for pulling a match back out of the
bucket to a laptop or a GitHub Actions runner. Reading the same object from a
Google Cloud service in the same region as the bucket is not billed as network
egress. So:

| Where the scan runs | Video in Firebase Storage |
|---|---|
| A laptop, or a GitHub Actions runner | Costs $0.12/GB every run. Don't. |
| Cloud Run / Cloud Run Jobs, same region as the bucket | No egress charge. Fine. |

Which means the cheap designs are the two ends: keep the file local and scan it
locally, or put it in the bucket and scan it next to the bucket. The expensive
design is the middle — storing it in one place and computing in another.

**Check the bucket's location before relying on this.** `nl-tools.firebasestorage.app`
has to be in the same region as the job; the RTDB is `europe-west1`, but Storage
location is set separately at project creation and is not readable from this
repository. It is on the Firebase Storage page in the console.

Either way only the JSON persists, at a few hundred KB per match for the summary
and a few MB for every detection.

## The constraint that actually decides this

Not the computer vision. The footage.

Highlights packages are cut by the club being measured, which makes the sample
editorially selected by the interested party — a club publishing 15-minute
packages out-scores one publishing 5-minute packages on identical board
delivery. Full matches remove that, and nothing else does. Whoever builds this,
it is only worth the input it is given.
