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

## Visibility — the blocked column (built 29/08/2026, additive to 1.1)

Watching the measured match showed boards part-blocked by players and
stewards, which had been a cliff: a half-hidden board either still matched
and got FULL credit — the homography projects the whole reference quad — or
dropped below the inlier floor and scored zero. Nothing recorded that a
detected board was half-covered.

Now every detection also measures coverage: the matched face is rectified
square-on (the warp the clarity score already paid for), both it and the
reference are squeezed onto one small canvas, and they are compared cell by
cell — textured cells by correlation, flat cells by brightness, because a
solid green panel has no texture to correlate and must not read as hidden.
The share of agreeing cells is the hit's `visibility`; per sponsor it rolls
up as mean visibility and a **Blocked** column — the share of detections with
visibility under 0.6. "On screen 2m 17s, part-blocked 38% of it" is placement
intelligence a sponsor and club can act on at renewal: a board regularly
obscured is a board worth moving.

Rulings that shipped with it: a SEPARATE column, never an index discount,
until real data has been looked at — what a half-blocked board is worth is a
commercial judgement, not a constant. Tracked hits have no homography, so
their visibility is null, never faked, and every surface renders absent as a
dash — a match measured before this existed shows "—", which is not the same
claim as 0% blocked. `ENGINE_VERSION` stays 1.1 deliberately: the bump exists
to guard comparability, and no number that existed before this moved.

Two more rulings from the same review, parked with it:

**The full match is the true metric, marked in halves.** Highlights are a
preview; the number a partner is ever shown comes from a full match. A match
should carry TWO measured windows — whistle to whistle, each half — with
half-time excluded entirely (that is ~15 minutes of the most polluted footage
in the broadcast, and a sixth of the scan bill), per-half and combined stats,
and in-play time as the denominator. ONE record and one stitched timeline,
with the half boundary marked: the runner grows a pair of window arguments
(the existing single start/end trim becomes the degenerate case), samples
carry their half, the proxy is built from the two windows joined, and the
tool draws the divider. The cloud timeout is 6h as of 29/08/2026, so either
route takes a full match; local overnight remains the free one.

**Stinger wipes, without leaning only on grass.** The branded transition
graphic is already caught three separate ways: the grass check (no pitch
below a full-screen graphic), the area cap (a stinger logo is far over the
5% ceiling), and the minimum run (a ~0.5s wipe dies under the 1.0s floor).
If a fourth is ever needed, the clean mechanism is EXCLUSION references —
`refs/exclude/` holding the broadcast furniture itself (the stinger frame,
the corner watermark), matched first and masked out of the frame before any
sponsor is searched. Folder-as-configuration again, deterministic, and it
never touches the three guards that already work.

*The corner watermark, meanwhile, actually got through* — the first scan
with a whole-board reference proved it (29/08/2026). A partial feature match
against the DAZN board crop can drop a WIDE quad over the square overlay,
which passes the aspect gate, and in a pitch-filled shot there is grass
below the top corner, which passes the grass check. Engine 1.2's answer is
the tell furniture cannot fake: a perimeter board's on-screen position moves
every time the camera does, and the camera at a football match never stops
moving — so any position (24px cell, neighbours merged) holding a sponsor's
hits through more than 30% of ALL samples is an overlay, and its hits are
stripped before furniture-bridging tracking or any counting happens. That
removes seconds, so ENGINE_VERSION bumped to 1.2 and 1.1 exports no longer
compare. Catches every future broadcaster's bug with zero configuration;
the exclusion-refs idea above stays parked for furniture that moves.

## The first sweep, recorded — 29/08/2026

Sutton v Altrincham highlights, 989 samples, 8 reference images, scored
against Richard's 73-span hand count. Eight sensitivity combos, 100 minutes,
about £1:

    ratio  inliers  side   recall  precision  phantom
    0.80      9      12      56%      84%       135     <- shipping settings
    0.80      7      12      60%      84%       147
    0.85      9      12      58%      83%       149
    0.85      7      12      64%      82%       180

(The side-floor 12 vs 9 rows were identical in every pair, so they are not
repeated: below 12px the far side fails on features, not the gate — which
also says the 1.3 floor drop bought little.) What the table settles: the
dials are exhausted — eight points of recall for two of precision is the
whole range on offer — and precision sits at ~84% at EVERY setting, so the
~135 disputed samples are confident detections, not marginal ones. The sweep
declined to pick a knee, correctly. Next: adjudicate the phantoms
(`board_exposure_eval.py --phantoms` prints the disputed timestamps) — each
one is either a board the conservative hand count skipped, or an engine
error to fix; nobody moves a threshold until those rulings are in.

**Adjudicated the same afternoon, mostly from the data.** Splitting the
eval by sponsor changed the story: Enterprise scored 98% precision and TIC
Health 99% — the engine barely invents boards, and the hand count was
excellent. The entire precision gap was DAZN at 57%, and the phantom hits'
positions convict the watermark: two thirds sit at the top of frame, some
with quads hanging off the edge, wide because a partial match stretches the
board reference over the fixed overlay — and the giant wide-shot boxes
Richard spotted in playback are TRACKED continuations of those watermark
matches (inliers 0, drifting to 800px). Why 1.2's filter missed it: partial
matches anchor different parts of the wide reference, so the projected box's
centre wanders hundreds of pixels while the matched features never move, and
it only matched in ~13% of samples — under the 30% line. Hence 1.4. Recall
by board, for the record: goal boards 77-86%, TIC 69%, DAZN board 53%,
far-side dugouts 24-36% — the resolution story, measured.

The last ruling came by eye: at 4:10-4:27 the engine claimed DAZN mid-frame
for 17 straight seconds and Richard's scrub found nothing there — the board
reference's white-on-black lettering had matched a DIFFERENT black board
across the pitch. That is 1.4's second guard, the face check: judged on the
reference's textured cells only (visibility()'s flat fallback would let any
dark board vouch for any other — its first draft scored the impostor 0.47),
an impostor face agrees at ~0.15 where a genuine half-covered board still
holds ~0.6, and anything under VIS_REJECT is discarded at detection time.

## Engine 1.5 — permanence, and the tracker answers for identity (29/08/2026)

The 1.4 verification sweep (same labels, live pipeline, eight combos, 95
minutes, ~£1) landed at 87-89% precision — short of the mid-90s the offline
simulation promised — and flat 105 phantoms at the strict end:

    ratio  inliers  side   recall  precision  phantom
    0.80      9      12      55%      87%       105
    0.80      7      12      58%      87%       105
    0.85      9      12      56%      88%        93
    0.85      7      12      60%      89%        94

(Side 12 vs 9: four identical row-pairs — the dial is dead on real footage
and left the sweep grid in 1.5.) A fresh 1.4 scan plus `--phantoms` then
named every disputed second, and they were two mechanisms:

- **The watermark, back from the dead — ~60%.** Three ranges pixel-locked at
  the top-right corner across four and a half minutes. The 1.4 face check
  had thinned its detections to ~5% of samples — under the fine rule's 8%
  share floor — so the furniture strip stopped firing. 1.4's two fixes
  fought each other; it also explains why the looser 0.85 rows show FEWER
  phantoms (more watermark detections push it back over the floor).
- **A tracked impostor chain — ~35%.** 25 of the 33 samples at the ruled
  4:10-4:27 range were the tracker faithfully multiplying a few confident
  wrong-end seeds. Template correlation proves a patch matches the previous
  patch, never that it is the board.

Also found on the way: the shipped detections.json (compact q/b/c/a/n rows)
**dropped the tracked flag entirely**, so the eval's tracked column read
zero on every real export — recovered during adjudication only because
synthesised hits carry inliers 0.

1.5 is five changes, each with a test that fails without it:

1. **The permanence tier** — Richard's ruling stated as the concept, not a
   threshold: *anything permanently on screen is not a board.* A 16px
   feature-centroid cell with hits in 5 of the match's 8 equal stretches is
   furniture at ANY share (small absolute floor so flickers can't condemn a
   cell). One long spell at one spot still survives — that is a real board.
2. **The whole-face NCC floor** (`FACE_NCC_REJECT` 0.25) — the cell-based
   face check abstains when the reference offers no textured cells, and the
   abstention is exactly where the impostors lived. Global NCC always has an
   opinion: measured on representative fixtures, a different dark board's
   lettering scores ~0.11 while a genuine board holds 0.53 half-covered and
   0.84 blurred-and-small — 2x clear air both sides of the floor.
3. **The tracker face-checks every patch** before minting a hit, against the
   whole-face NCC only (cell agreement punishes blur, and blur is the reason
   tracking exists). A patch that stops resembling the sponsor's reference
   is treated as a lost patch: chain stops, gap stays open, all-or-nothing.
4. **The export carries `t` and `v`** (sparse keys) and the eval reads both
   dialects — the tracked column now works on real files, forever.
5. **Dials promoted from the sweep**: RATIO 0.80→0.85, MIN_INLIERS 9→7 —
   strictly dominant (recall +5, precision +2, phantoms −11) at the price of
   scan time. The sweep grid's third dimension is now the NCC floor with a
   0.0 ablation row, so the check's real cost stays measured.

Expected on the labelled match: DAZN's 98 phantoms mostly gone, pooled
precision ~97% at ~60% recall — **to be verified by rerunning the sweep and
a normal scan against the same labels before these numbers are quoted.**
Recall (Enterprise dugouts 24-36% in ultra-wide shots) is untouched by
design; that is the zoom-pass lever, a separate version.

## Engine 1.6 — the graphics corners, and Richard's frame-stack probe (29/08/2026)

The Horsham head-to-head (the Miggle reference match, scanned with 1.5)
exposed the permanence tier's structural limit: **a 4.5-minute clip cannot
prove permanence.** The stream's corner graphic matched in only 5 samples
across 2 of 8 windows — under every evidence floor — and Richard spotted it
in playback. Two of his rulings became the fix, both cheaper than what they
replace and both able to work on a 30-second clip:

1. **The graphics corners.** A hit whose matched features centre in the top
   18% AND outer 18% of the frame is refused. Grounded in measurement, not
   taste: across both grounds' real footage, zero of 643 genuine
   Enterprise/TIC hits ever put their features there; every watermark-class
   hit did. Run against the Sutton labels through the real strip:
   phantoms 105→51, precision 87%→93%, recall unchanged — and DAZN's
   apparent 3-point recall dip is the rule exposing watermark-credited
   seconds that had been scoring as true.
2. **The frame-stack furniture probe** — Richard's design, verbatim:
   "sample an even spread of ~20 frames and overlay them; a persistent item
   suggests permanence." ~24 evenly-spread frames (already on disk), judged
   on STRONG EDGES so translucent graphics keep their outlines and grass
   texture — edges everywhere, never twice at the same pixel — stays out.
   An edge-pixel persisting in 60% of the stack is furniture wherever it
   sits, learned per production with no geometry assumed. Two stand-downs,
   both logged and exported (`furniture_probe` in the head): a locked-off
   camera (global edge churn under the floor — permanence proves nothing
   when nothing moves, and a real board on a static camera is real
   exposure), and a mask claiming over 10% of the frame (distrusts itself
   rather than eating boards).

Order in the pipeline is cheapest-evidence-first: corners → mask → static
rules → tracking. 68 tests; the mask fixtures re-learned the old lesson —
raw per-pixel noise backgrounds carry chance edges everywhere and mask the
whole frame, so the fixture world is smoothed structure that moves, which is
what real footage is.

## Engine 1.6 verified — 30/08/2026, the cloud rerun against the labels

    sponsor        recall  precision  missed  phantom  tracked
    DAZN              40%      100%      191        0       20
    Enterprise        53%       99%      275        2       35
    TIC Health        69%       99%      106        2        0
    overall           54%       99%      572        4       55

**Phantoms 105 → 4** — and the 4 are three moments totalling 2.0 seconds
(2:53, 5:51, 1:59-2:00), at the labelling noise floor and adjudicable by
eye. When this engine claims a board was on screen, it is right 99% of the
time on the marked match. Three honest footnotes:

- **DAZN's recall reads 40% (was 50), and most of that drop is truth
  arriving**: the removed "recall" was watermark-credited — samples where
  the corner graphic scored while the real board went undetected. Some may
  also be the NCC floor pricing genuinely dark, soft corner-board hits; the
  sweep's ncc-0.0 ablation row exists to price exactly that.
- **The furniture probe stood down on this broadcast** — its edge mask
  claimed 10.7% of the frame, just over the 10% self-distrust line, so it
  refused to act. The guard worked as designed, and 99% was reached without
  it (corners + permanence + faces + tracker gate). Tuning note, not a bug:
  the probe matters most on single-cam club streams, and the edge threshold
  / dilation deserve a look before it is relied on there.
- Recall overall is 54% (60% at the same dials before 1.6) — part exposed
  fake recall, part the price of the floors. The trade is the right way
  round for a sponsor-facing number, and recall is engine 1.7's whole job.

## Engine 1.7 — verified 30/08/2026, shipped

Richard's diagnosis from the Horsham playback, verbatim: "big miss is
failing to initiate — short runs on persistently on-screen items." That
reorders the pair: initiation first.

- **The zoom pass** (`ZOOM_SCALE` 2.0): a frame where nothing was found is
  re-scanned upscaled — a far-side board in an ultra-wide sits under the
  feature floor at native size, and more pixels per letterform is more
  features. Only empty frames pay the 4x pixel cost; hits are built at the
  zoomed scale, every guard included (geometry, perimeter, both face
  checks), and mapped back to original-frame geometry. The test proves both
  halves: the fixture board is genuinely missed at 1x and found at 2x with
  coordinates at original scale.
- **Carry-forward** (`CARRY_MAX_SECS` 3.0): one-sided extension past a
  run's last real sighting — each step must template-match the previous
  frame (a cut fails here) AND keep passing the whole-face check (a drift
  onto the wrong thing fails here), capped, stopping at any run it meets.
  The 1.5 face gate is what makes this buildable; before it, similarity
  alone never knew when to stop.

Both carry 0-off switches; the sweep grid is now exactly their ablation
(zoom x carry, four combos), so what each lever buys stays measured. The
retired grid dials are listed in the sweep header with the dates they were
settled.

**Verified against the Sutton hand-labels, 30/08/2026 — the gate passed:**

| sponsor      | 1.6 recall | 1.7 recall | 1.7 precision | phantom samples |
|--------------|-----------:|-----------:|--------------:|----------------:|
| DAZN         |        40% |        49% |           99% |               1 |
| Enterprise   |        53% |        66% |           98% |               9 |
| TIC Health   |        69% |        74% |           99% |               2 |
| **overall**  |    **54%** |    **64%** |       **99%** |          **12** |

Recall +10 points with precision holding at 99% — comfortably above the
97% floor, so both levers ship at full strength (zoom 2.0, carry 3.0).
The stated target moved most: the far-side dugout boards went from 24-36%
to 53-60%, and Enterprise's goal-line boards now read 86-97%. The phantom
cost of the extra recall is 6.0s across a 494s window (up from 2.0s in
1.6), and the disputed ranges are carried extensions of the same three
sites 1.6 already disputed (2:53, 5:51, 1:59) rather than new inventions —
the carry-forward stretching borderline run-ends, exactly the failure mode
its cap exists to bound. The furniture probe correctly stood down on this
broadcast footage (coverage 10.7% > 10% — self-distrust), same as 1.6.
Remaining recall lives where it always did: the DAZN corner board in
ultra-wides (49%, and the largest miss pool) — that is the colour scout's
target, not a threshold's.

**The second ground — Horsham hand-labels, 30/08/2026.** Richard labelled
the Horsham v Hampton & Richmond YouTube rip (a 1080p club stream, 4½
min) from the ORIGINAL file — not the proxy (640px then, 1280px since
02/09/2026), which would have set a lower truth bar than the engine's own
input — against the engine-1.6 scan
of the same footage. 63 appearances across three sponsors, his standard
noted in the file: "very generous read of very zoomed out items".

| sponsor      | recall | precision | phantoms |
|--------------|-------:|----------:|---------:|
| DAZN         |     9% |      100% |        0 |
| Enterprise   |    26% |      100% |        0 |
| TIC Health   |     3% |      100% |        0 |
| **overall**  | **15%**|  **100%** |    **0** |

Two verdicts in one number. **Precision generalises perfectly**: not one
phantom second on hostile footage — corners, permanence, frame-stack and
face check all held, and the frame-stack probe (which stood down on the
Sutton broadcast) engaged correctly here. **Recall does not**: 54% on the
Sutton broadcast, 15% here, same engine — the detector is currently a
broadcast-calibrated instrument, and the generous-read caveat cannot
rescue that (halve the truth sheet and Horsham still sits nowhere near
Sutton). Cross-ground comparability, the thing the product sells, does
not yet hold on club footage. The footage-quality fingerprint matches:
Horsham's confirmed hits are bigger and clearer than Sutton's but carry
far fewer agreeing features (mean 16 vs 26; a third scrape under 12) —
compression starvation, not optics. This is the recall campaign's real
target: club streams, not broadcast wides. Labels: `labels/2026-08-18-horsham-v-hampton-and-richmond.csv`.

**The 1.7 rerun (same day).** Recall 15% → 21% (DAZN 9→17, Enterprise
26→34 with left-end 38→49; TIC flat at 3% — nothing to anchor, too
starved to initiate, the pure test case for harvested references). The
anchor census predicted a 44% ceiling if carry-forward converted
perfectly; it converted about a fifth of its room — the template and
face gates kill most steps on compression mush, as designed. And the
first phantoms on this footage arrived with a lesson attached: 6 samples
(3.0s), ALL tracked, both disputed ranges sitting 1-2s beyond the ends
of runs Richard himself marked (0:30 before his 0:32 start; 4:16 past
his 4:15 end) — carry-forward stretching into frames where the human
couldn't confirm the board either. DAZN precision 84%, overall 95% — the first sub-97% cell in
the ledger, and a warning shot for the carry-sweep idea: longer carry
buys recall at exactly this edge, so the sweep's precision gate is not a
formality on club footage. The club-stream wall stands: 21% here vs 64%
on broadcast, and the missing mass is initiation, not completion.

Diagnosed from the tool playback, Richard spotting it: the 4:15 chain's
box is sitting on a PLAYER'S BACK. The mechanism is a fast pan-out — at
2 samples a second the board moves most of a frame, or clean out of it,
between consecutive samples; the tracker hunts for last frame's patch in
a frame where the target no longer exists, and the best remaining
correlation wins (a dark torso, at night, on smear). The gates that
should say "gone" are too soft at that scale: correlation 0.6 and face
0.25 both clear on blur. Two consequences recorded: the tail of a run
can be temporally right and SPATIALLY wrong — and the eval scores time
and sponsor, not position, so 84% is optimistic about tail quality; and
a partner watching playback must never see the box on a person. The fix
is 1.7.1 (tighten): a higher identity floor for every minted step —
tracked fills carry no inlier evidence, so they pay a higher face bar
(the measured gap is wide: genuine-blurred 0.84 vs impostor 0.11) —
plus an exit rule stopping a one-sided carry step that teleports a large
fraction of the frame in one sample.

## Engine 1.7.1 — tighten (built and verified 30/08/2026 — the shipping engine)

Both walls sit on MINTED steps only; nothing detect() accepts changes.

- **`TRACK_FACE_FLOOR` 0.45** — every synthetic fill (gap-fill and
  carry-forward alike) must now clear 0.45 whole-face NCC, while real
  detections keep the 0.25 floor: a detection arrives with 7+ agreeing
  features, a mint arrives with correlation against its own previous
  frame — continuity, never identity. The raised floor sits inside the
  measured gap (genuine-blurred ~0.84, impostor ~0.11), so honest fills
  clear it with room and the Horsham player's-back chain dies at the
  step where it leaves the board.
- **`CARRY_MAX_STEP_FRAC` 0.25** — a one-sided carry step crossing more
  than a quarter of the frame width in one sample is a fast pan: the
  board is leaving shot, or the tracker has already jumped (the Horsham
  chain crossed x1284 to x236 in two steps). Gap-fill keeps its
  full-width search on purpose — it holds an anchor on both sides.

Tests: the teleport fixture walks a strolling board then jumps it 300px —
the walk must die at the jump and the same fixture must fill straight
across with the fraction sabotaged to 1.0, proving the rule and not the
chase stopped it; the old gate-liveness sabotage caught the floor moving
(it failed the moment synthetic paths stopped reading FACE_NCC_REJECT)
and now sabotages the floor the fills actually read. The gate as stated
before the rescans: Sutton must hold 99/64, Horsham's six tracked
phantoms should die, and whatever recall the walls cost is the price of
boxes that stay on boards — a partner watching playback must never see
ours on a person.

**The Sutton rescan, 30/08/2026 — precision holds, phantoms halve,
recall pays three points:**

| sponsor      | 1.7 recall | 1.7.1 recall | 1.7.1 precision | phantoms 1.7 → 1.7.1 |
|--------------|-----------:|-------------:|----------------:|---------------------:|
| DAZN         |        49% |          45% |            100% |                1 → 0 |
| Enterprise   |        66% |          63% |             99% |                9 → 3 |
| TIC Health   |        74% |          74% |             99% |                2 → 2 |
| **overall**  |    **64%** |      **61%** |         **99%** |           **12 → 5** |

Against the stated gate: precision held, recall gave back three of the
ten points 1.7 bought. The walls cost fell exactly where the mechanism
says it should — TIC, whose carries are static-camera fills, paid
nothing; DAZN and Enterprise, where the camera pans, paid the tail ends
of stretched runs. What remains disputed is 2.5s across the whole match:
the SAME three borderline sites 1.6 and 1.7 disputed (2:53, 5:51, 1:59),
now trimmed rather than stretched, and DAZN's phantom is gone outright.
Read: the three recall points bought back nothing a partner could trust —
they were the stretchy ends the player's-back screenshot came from. The
deciding half is Horsham, where all six phantoms — DAZN's, both disputed
ranges — were tracked and the walls should kill all six.

One confound, caught by the export's own reference list: both
Horsham-harvested Enterprise crops were already in refs/partners when
this rescan ran, so the Enterprise row is engine PLUS two new
references, not engine alone — its true tighten cost is at least the
three points shown, possibly masked by harvest gain. DAZN and TIC ran
on unchanged references and are the pure engine read. This sharpens the
precision claim rather than weakening it: 99% held with two fresh crops
live in the most active sponsor, and the Horsham-harvested artwork fired
no phantoms on Sutton footage — first evidence that cross-ground
references pollute nothing.

**The Horsham half raced the container build and lost.** Its rescan
arrived stamped `engine_version: 1.7`: the pair was pasted while the
1.7.1 image was still building, and a Cloud Run execution snapshots the
job image at launch — Horsham ran first on the old image, Sutton ran
after the push landed. The engine stamp in every export exists for
exactly this; the file was refused at the ledger and the line re-pasted.
With the crops already uploaded, the re-run doubles as the Enterprise
harvest A/B: one scan, three answers — DAZN is the pure tighten read and
carries the phantom-kill check, Enterprise is tighten + harvest against
its 34% baseline, TIC (no new references) stays the pure starvation
control for the audition pass.

**The Horsham rescan (1.7.1, harvest references live) — zero phantoms:**

| sponsor      | 1.7 recall | 1.7.1 recall | 1.7.1 precision | phantoms 1.7 → 1.7.1 |
|--------------|-----------:|-------------:|----------------:|---------------------:|
| DAZN         |        17% |          11% |            100% |                6 → 0 |
| Enterprise   |        34% |          28% |            100% |                0 → 0 |
| TIC Health   |         3% |           3% |            100% |                0 → 0 |
| **overall**  |    **21%** |      **17%** |        **100%** |            **6 → 0** |

All six tracked phantoms died and the disputed-ranges list is EMPTY —
the first scan of either ground with nothing disputed at all. On the
footage that put a box on a player's back, the engine now claims
nothing the human didn't mark. The walls cost four points here against
three on Sutton: club-footage carries were doing more of the work, so
trimming them bites harder — priced and accepted, because recall on
this footage is an initiation problem (the campaign's target), not a
duration-padding problem.

The run's second answer reads cleanly per board despite the confound:
**the harvest worked exactly where the harvested artwork lives.**
Enterprise CENTRE — the double the two crops were cut from — went
14% → 29% while the tighten was simultaneously taking 19 points off
left-end carries (49% → 30%); net −6 for the sponsor, but the board
table separates the two effects. That is the audition-pass thesis
measured for the first time: two crops, cut from the match being
scanned, doubled recall on their own board. TIC, the starvation control,
sat flat at 3% on cue — and is therefore the next harvest target: same
trick, purest patient.

**The reference sweep — the standing acquisition method (agreed
30/08/2026).** Richard's derivation from the harvest results: the best
possible reference is a pre-match sweep shot from CAMERA 1'S MATCH
POSITION — zoom changes magnification, not viewpoint, so every fixed
occlusion the match footage carries (the goalpost through Horsham's TIC
board, the netting) rides along in the sweep automatically, sharp, while
everything that should never be in a reference (players) is absent
because the pitch is empty. The spec: camera 1's position, floodlights
in match state, boards final; slow pass along everything that camera can
see (far side, both ends), pausing ~1 second per board at a zoom where
the board fills a third to half the frame; delivered as its own short
clip, never inside the billed match window. The ask, ready to hand to a
camera operator: "Before KO, under floodlights: slow zoomed pass along
all the ad boards you can see — pause a second on each one, close enough
to fill half the frame. 60 seconds total, send as its own clip." The
audition pass ingests sweep clips and mints references from them; until
it exists, sweep frames are cropped by hand exactly like the 30/08
harvest.

Engine verdict: **1.7.1 confirmed as the shipping engine.** Precision
99–100 on both grounds, the partner-facing failure mode gone, recall
cost bounded (3–4 points of tail) and priced. A floor sweep (0.35/0.40)
stays available if those points ever matter; the campaign's answer to
club-footage recall is initiation, never looser walls.

**The TIC harvest (same evening) — one crop, tenfold.** Richard
screenshotted the TIC board from the original file, and the frame was
the engine's own diagnosis made flesh: a 160px panel with the goalpost
through the C and netting over the left third — the camera position is
fixed at this ground, so every sighting carries the same occlusions,
which is why clean-artwork references never cleared seven features. The
whole panel went in as a reference with the post and netting
deliberately baked in: at this ground, that IS what the board looks
like. Rescan: TIC 3% → **30%**, precision 100%, disputed list still
empty — the riskiest reference shape yet (a white panel with a pole
through it) invented nothing, and DAZN and Enterprise came back
byte-identical, so the isolation is total. Horsham overall now reads
**23%/100%** — above the 1.7 baseline with the phantoms gone. The
harvest ledger so far: Enterprise centre 14→29 (two crops), TIC 3→30
(one crop). Match-harvested references are the highest-yield lever yet
measured on club footage — exactly what the audition pass exists to
industrialise.

## The third clip — Harrogate Town v Gateshead, DAZN highlights, 02/09/2026

Richard hand-counted Enterprise over a 3:05 DAZN highlights clip (16 lines,
143 labelled seconds) and the 1.7.1 cloud scan of the same file was scored
against it, then run through the recall diagnostic on the playback proxy.
Labels: `labels/2026-08-31-harrogate-town-v-gateshead.csv`.

| | |
|---|---|
| Recall | 21% (51 of 251 labelled samples) |
| Precision | 98% (1 phantom) |
| Misses in frames where NO sponsor anchored | 199 of 199 (100%) |
| Missed frames' sharpness vs found | 1.04× — as sharp |
| Missed frames' blockiness vs found | 1.03× — as crunchy |

**The blur premise is dead.** The frames the engine missed are as sharp
and as cleanly encoded as the frames it found. Blur variants and
compression variants would mostly re-find what sharpness never lost; the
diagnostic's own reading is "starvation dominates — spend on references".

**Where the seconds went.** The tight opening shot, a big near board: 25
of 25 samples found. The two long wide-shot spans (1:34–2:16 and
2:19–2:59, 82 of the 143 labelled seconds): 15 samples found of 158, every
one a far board scraping the floor at 7–9 agreeing features. The engine
never initiates on the wide shot — and the three cutouts the audition had
harvested for this ground (3s, 14s, 35s) were all cut from the tight shot,
because the harvest ranks by strength and strength is a near board.

**Built from it (audition 1.2):** a wide-shot pick — one far-view cutout
per reference, the smallest board among its real hits, offered only when
the kept set is all near views and only if the crop carries enough
features for the scan to load; ticked by default on the audition screen,
labelled "far view". A far-looking reference is the one thing that reaches
the wide shot with this detector. The honest ceiling: feature matching
needs seven agreeing features, and a far board in a 1080p wide shot is
80–100 px across — it yields that only sometimes, zoom pass included.
Beyond references the next lever is a different detector for small boards
(template correlation seeded from the far-view reference, or a trained
small-object detector once the hand-counts amount to training data), and
that is a project, not a tune. Until then the numbers are a floor, and the
wide shot is where the floor sits lowest.

**The hour, measured (audition 1.3 → 1.4, 02/09/2026).** The audition of
this clip took ninety minutes on Cloud Run — 47 seconds a frame over 92
frames, 21 references — and then failed on its upload with an hour-old
token (CLOUD.md, "A run that outlives its token"). Audition 1.3 blamed the
frame's SIFT being recomputed per reference and shipped without a
measurement; profiled afterwards on a 1080p frame with the same 21
references, the split is:

| Where a detection's time goes | Share |
|---|---|
| `findHomography` — ~38 RANSAC fits per reference per frame, one per band pass whose ratio-test survivors clear the inlier floor | 72% |
| descriptor matching | 23% |
| the frame's SIFT features (what 1.3 saved) | under 5% |

RANSAC is single-threaded, so the sequential frame loop ran the 8-vCPU job
on one core. Audition 1.4 spreads the frames over a process pool, results
identical frame for frame. End to end on a 169 s 1080p clip with the same
21 references, three workers on a four-core machine:

| | |
|---|---|
| Real pass, 84 frames | 674 s — 8.0 s a frame of wall time, 24 s per frame per worker |
| Relaxed pass (one starved sponsor) | 60 s |
| Whole audition, scoring and cutouts included | 12.9 min |
| The same frames, one worker | 16.5 s a frame — the relaxed pass costs about as much again per reference it runs for |

Expect the Harrogate clip in 15–20 minutes on the job's eight vCPU (they
are hyperthreads, so seven workers are not seven cores), against ninety.
The full scan gains nothing from this: it has always pooled its frames.
Its lever is the homography cost itself — fewer fits per reference, or a
cheaper estimator — and that changes numbers, so it ships only against the
hand count.

## Roadmap — engine 1.7, the recall pair (agreed 30/08/2026, superseded by the build above)

Precision's ladder is built and verified; recall (55-60% pooled, far-side
dugouts 24-36%) is the remaining half. Two levers, shipped together and
gated the usual way — recall up, precision holds 97%+ on the labels or it
does not ship:

1. **The zoom pass.** 58% of all misses sit in four ultra-wide passages
   where boards fall under the detector's floor. Re-scan only the frames
   with few or no hits at 2x resolution — targeted, so the cost stays
   pennies, and the eval prices exactly what it buys.
2. **One-sided, face-checked extension** — Richard's carry-forward ruling:
   a detected board that stops clearing the 7-feature bar visibly stays on
   screen, but the tracker only bridges between TWO anchors, so runs die at
   the flicker edge. Extend past the last real sighting while the patch
   stays template-similar AND keeps passing the whole-face identity check,
   capped at a few seconds. Unsafe before 1.5 (the Sutton impostor chain
   proved similarity alone never knows when to stop); the face gate is the
   terminator that makes it buildable now.

Also parked, in rough order: the stinger/ident exclusion (the one known
precision leak left — brief full-screen sponsor graphics), a second
ground's hand-labels to prove generalisation, per-design attribution,
board print artwork as references.

**The halves marks — built 30/08/2026, same day as the ruling.** A full-90
broadcast file carries half-time, and half-time carries ad breaks: a
sponsor's OWN 30-second advert matches its reference perfectly and sails
past every guard — the corners don't catch it, the permanence tier doesn't
(too short), and the face check passes because it genuinely is the logo.
The fix as shipped: `--ht` + `--restart` on the match script (a validated
pair; `halves_windows()` dies in a sentence on a swapped order), carried
as `BE_HT`/`BE_RESTART` from the uploader's two new fields, and the break
between them is **never extracted** — half-time adverts cannot count, and
~14% of a full-90's frames go unbilled. The honest thing and the cheap
thing point the same way again.

The engine's new word is the **seam**: the first sample index of a later
extraction window. Two index-adjacent samples across a seam are a whole
half-time apart, so every rule that treats index distance as time distance
refuses to reach across one — `runs_from` (a board up before AND after the
break is two appearances, not one sixteen-minute one), `gap_candidates`,
and the carry-forward's walk, which treats a seam as a wall in both
directions. The proxy is built per half and joined (stream-copy concat),
so playback and the sample clock stay one clock, in the tool's viewer and
the local report alike. The export head carries `windows` and `seams`;
the eval REFUSES a seamed export loudly rather than silently mis-mapping
its one-window index-to-time arithmetic — grading a halves scan means
labelling each half as its own run. (Every verified number — Sutton,
Horsham — predates seams: single continuous windows, 99%/64% untouched.)

This supersedes the old "halves runner" idea (two scans of one match
collide on the same matchId — the second upload replaces the first).

## The recall campaign — plan of record (30/08/2026)

Adopted from Richard's recall-workflow document (a working doc held
outside this repo), with four amendments agreed on review, after the
Horsham hand-labels settled the target: precision generalises (100% on a
club stream), recall does not (21% vs 64%), and the missing mass is
initiation on compressed, pan-blurred club footage — the footage most of
72 clubs actually produce.

**The shape — a layered scan.** Tiered references: permanent design refs
(CAD when agencies deliver it, face-on photographs meanwhile — nothing
blocks on CAD); accumulated per-ground refs behind hard promotion guards
(multi-match only, always validated against the design parent so no
harvest chains off a harvest, every promotion recorded and reversible);
and per-match harvests ticked by a human in the audition. Synthetic
variants generated from each design — horizontal pan-blur at several
magnitudes AND a compression variant, because the Horsham fingerprint is
detail starvation as much as smear — never uploaded, always attributed
to their parent design, logged when they fire so dead magnitudes get
retired. Escalation per empty frame: native match → zoom → blur gate
(cheap Laplacian sharpness) → blur-sized variants; a sharp frame that
found nothing stops, the board is not there. Verification unchanged at
every tier — the face check and the three furniture guards are exactly
why widening the reference set cannot threaten precision. Cost lives in
the frame, not the reference count: features extract once per frame, so
better references mean fewer escalations, plausibly faster scans. Every
stage is graded against both answer sheets before it ships.

**The four amendments to the source doc**: the 1.7 zoom pass did not
stall — it bought +10 and doubled the dugouts, so the diagnostic decides
how much of the REMAINDER is blur rather than assuming 70-80%; adaptive
sampling arrives as sharpest-frame-within-the-2fps-window first, keeping
the index-to-time contract intact (true pan-dense sampling only if the
cheap version leaves value on the table); colour is demoted as a
standalone build but kept as the targeting layer — per board cluster,
per scan, colour proposes and features confirm, never
attribution-bearing; and CAD is chased in parallel, never waited on.

**Build order and status:**

1. Blur/compression diagnostic, both grounds — DONE 30/08, built as
   `BE_MODE=diagnose` on the scan job (`board_exposure_diagnose.py`:
   found/tracked/missed classification against a finished export,
   frame sharpness, 8px blockiness, zoom proxy, starved-frame count)
   and run the same evening. The verdicts:
   - **Starvation dominates both grounds** — 80% of Horsham's misses
     and 71% of Sutton's sit in frames where NO sponsor hit anything.
     References and zoom before everything else, now by measurement.
   - **Compression is a non-factor on both** (missed/found blockiness
     0.98x and 1.01x) — compression variants are CUT from step 6.
   - **Blur splits by footage type**: Horsham's missed frames are not
     meaningfully softer than its found ones (0.86x) — club-rip misses
     are reference-shaped, not blur-shaped. Sutton's ARE (0.56x) —
     broadcast misses concentrate in soft moments, so blur handling is
     a broadcast lever, and sharpest-in-window (step 5) is its direct,
     cheap counter before any synthetic variant.
   - One number for the business file: Horsham's FOUND frames measure
     ~100 on the sharpness scale where Sutton's measure ~540 — club
     footage is ~5x softer wall-to-wall, which is the club-footage
     recall wall quantified for the first time.
   (Operational note: the first diagnose runs died twice — once on a
   Dockerfile COPY the image guard test now enforces, once because the
   job's service account had never needed bucket WRITE; scans upload
   through the ingest door, diagnose writes back directly. Fixed with a
   one-time `roles/storage.objectAdmin` grant, recorded in
   uploader-spec.md.)
2. Horsham hand-labels — DONE 30/08; the generalisation verdict above.
3. Engine 1.7.1 tighten — VERIFIED 30/08 on both grounds: Sutton 61/99
   (phantoms 12→5), Horsham 17/100 (phantoms 6→0, disputed list empty).
   The shipping engine. Not in the doc; forced by its own discipline:
   the labels caught the tracker drifting onto a player, and recall
   gains are worthless on a tracker that lies.
4. The audition pass — ENGINE HALF BUILT 30/08 as `BE_MODE=audition`
   (`board_exposure_audition.py`): sharpest-in-window frame selection
   (which also stands up step 5's machinery), the CANONICAL detector
   run one reference at a time (same guards, no forked logic — the
   per-reference feature recompute is minutes at audition scale and
   drift-free), per-reference verdicts with best-hit crops, whole-board
   candidate crops behind every real hit, and a bounded relaxed-floor
   pass (candidates only, face gate still live, floor restored by
   context manager) for starved sponsors — the TIC case. Outputs
   audition.json + audition-*.png flat into BE_DEST. Proven on
   synthetic footage end to end: fired counts, first/last times,
   starved counts and time-diverse whole-face crops all correct. The
   TOOL HALF is BUILT the same night (tool v0.12; rebuilt as the
   Upload pipeline in v0.14 the next morning, on Richard's live-use
   verdict — stepper, inline Review with a scan-readiness warning,
   club-scoped promotion only by ruling, stacked player, reference
   library under Partners): a superadmin
   Audition tab reads audition.json + crops from the match folder,
   shows each reference's verdict, and promotes ticked crops into
   refs/partners/<Sponsor>/ by browser re-upload, audited. Needs one
   storage-rules deploy (the refs block) before first promotion. And
   LAUNCHED FROM THE TOOL, on Richard's ruling the same night: "Audition
   first" on the upload form queues mode=audition through the same
   serial queue (the poller leaves the source video in place), the tab
   lists finished auditions, and "Run the full scan" clones the request
   into a normal scan of the same upload — Cloud Shell is out of the
   audition loop entirely. Yield
   already measured twice by hand: Enterprise centre 14% → 29% (two
   crops), TIC 3% → 30% (one). First real audition run is the next
   milestone; a camera-1 sweep clip is its ideal input.
5. Sharpest-in-window sampling — promoted by the diagnostic: Sutton's
   misses concentrate in soft frames (0.56x found sharpness), and
   picking the sharpest frame per window attacks exactly that pool at
   zero new references.
6. Rescoped by the diagnostic: BLUR variants + the blur gate + the
   escalation ladder, targeted at broadcast footage (where soft misses
   live). Compression variants are cut — measured a non-factor on both
   grounds — and club-footage recall is reference work, not variant
   work.
7. Tier-2 ground-reference accumulation behind the promotion guards.
8. The layered demo — every detection tagged with the pass that found
   it, toggleable over playback. After grading, so the layers are real
   gains; doubles as the diagnostic for retiring passes that never fire.
9. Colour, as targeting, if the ledger still wants it.

This supersedes the ordering of "Roadmap after 1.7" below where the two
differ — the colour scout's demotion and the audition's promotion.

## Roadmap after 1.7 — agreed 30/08/2026

**Engine 1.8 — the colour scout.** Richard's ruling, and the reason colour
was banned no longer applies to it: a REFERENCE's colour lies across
broadcasts (floodlights, white balance, grading), but the colour of THIS
scan's own confirmed detections does not. Once a sponsor has enough
confirmed hits (say 10+, across 2+ spells), learn that board's colour
signature as this footage renders it, then use cheap colour back-projection
to NOMINATE regions in empty frames and aim the zoom pass there — instead
of zooming every empty frame blanket. The iron rule: **colour proposes,
features confirm** — no second is ever counted on colour alone, precision
floors untouched. Learned per sponsor per scan, never stored across
matches. Helps most where recall hurts most (distinctive boards in wides);
does little for black-on-black. Also the answer to the zoom pass's cost if
the 1.7 ablation says the blanket version is worth keeping but expensive.

Refined 30/08/2026, from Richard's Enterprise observation (four physical
boards per ground, different positions, different light): the signature is
learned **per board cluster, not per sponsor** — confirmed sightings
cluster by screen position and scale (the eval already tells them apart:
dugout-left, goal-right…), and each cluster gets its own colour as this
footage renders it, so the shaded dugout and the floodlit goal-line never
average into a colour that matches neither. Light change inside a match is
absorbed by recency-weighting the running signature; light change across
matches is why nothing is ever stored. Note the risk shape stays one-sided
either way: colour only nominates, so bad light can waste a nomination —
it can never mint a phantom second. (References themselves are colour-blind
— flatten() greys everything before SIFT — which is why light has never
broken detection; colour exists only in this scout.)

**The audition pass — Richard's idea, recorded 30/08/2026.** Before paying
for a full scan, a cheap interim verdict on the references against THIS
footage: sample two dozen spread frames (the furniture probe already picks
exactly this kind of spread), run detection over just those, and show the
result per reference FILE — found n times, best clarity, a crop of its
best hit, or "never found". Tick or untick each reference, then the real
scan runs with the approved set. Pennies and about a minute, and it
catches the two expensive mistakes before the spend instead of after: the
Skyline-style bad crop (a player across the reference means never found),
and the missing board design (Enterprise runs several per ground). Wants
two small pieces when built: a `preview` mode on the job beside scan/sweep
that writes a tiny result JSON instead of a match, and a per-FILE
allow-list (BE_SPONSORS filters folders today; the audition's verdict is
per file). The tick/untick surface is the same muscle the adjudication
queue below wants — build one, get the habit for both.

**Tool + engine, after that — the adjudication queue.** Everything the
engine barely-passed or barely-failed goes to a Review strip in the tool:
frame shown, box drawn, tick = count it, untick = bin it. Short by
construction (the sweeps proved most decisions are not marginal — 4
phantoms survive 1.6), so ~5 phone-minutes a match. Three things it buys:
a "human-adjudicated" line on the report (the Certified tier made real);
rulings as labels that re-price the floors continuously (the Sutton loop as
a by-product of use instead of a labelling session); and the long game —
every ruling and confirmed box accumulates into the training set for a
learned verdict layer over the hand-set floors, and eventually for a
learned detector to succeed SIFT. The judge never changes: anything taught
must beat the current engine on held-out hand-labels or it does not ship.

**The demo kit.** Richard wants to run this live in a room. Three parts,
two of which are already parked builds: the upload page (browser drag-drop,
resumable); an auto-trigger so a file landing in uploads/ starts the scan
itself — no terminal in the room; and a pre-staged 60-90 second clip so the
audience watches upload -> scan -> match-in-the-tool inside two minutes,
with the same clip on a laptop for the local-route demo.

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
