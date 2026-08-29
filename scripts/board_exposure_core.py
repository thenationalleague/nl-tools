#!/usr/bin/env python3
"""
The detector. One copy, imported by every script in this spike.

Finds a sponsor's artwork inside a video frame using SIFT descriptors and a
RANSAC homography, then decides three separate things about each match:

  1. Is the shape plausible for a hoarding?          geometry_ok()
  2. Is it standing on a pitch, or is it a graphic?  on_the_perimeter()
  3. Where does the board end, given the logo?       grow_to_board()

and scores how readable it was, which is deliberately not the same number as
how sure the matcher is. See system/board-exposure/README.md.

Nothing here touches video or files beyond reading a reference image, so the
same functions serve the live runner, the per-frame detail pass and the tests.
"""
import os
import sys

import cv2
import numpy as np

# Bumped whenever a change here would move the numbers. Two matches are only
# comparable if they were measured the same way, and a roll-up that mixes
# versions is silently wrong rather than obviously wrong — so every export
# carries this, and anything aggregating them checks it.
# 1.1: verified gap-tracking. Blurred pans between two real detections are
# filled by template-tracking the board through them, so those seconds carry
# per-frame evidence instead of relying on the 1.5s bridge. Recall moves, so
# 1.1 numbers do not compare with 1.0 numbers — that is what this bump is for.
# 1.2: static-furniture filter. The DAZN corner watermark leaked past the
# grass check the first time a whole-board reference existed — a partial
# feature match can drop a wide quad over the overlay, and in a pitch-filled
# shot there IS grass below it. The tell furniture cannot hide is that it
# never moves: any position holding through a third of the match is an
# overlay, and its hits are removed. Seconds move, hence the bump.
# 1.3: size floor lowered, 18px -> 12px. Wide shots put far-side boards
# under the old floor, so a board that mustered nine agreeing features was
# thrown away purely for being small — the one case the floor punished
# unfairly, since MIN_INLIERS is untouched and still does the guarding.
# Clarity's size term already prices smallness: more seconds, tiny index.
# UNMEASURED against labelled truth as of 29/08/2026 — the first labels file
# should run the eval on a 1.3 export before these numbers reach a partner.
# 1.4: furniture filter re-keyed on the matched features. Adjudicating the
# first answer sheet showed the watermark still leaking past 1.2: a partial
# match anchors different parts of the wide board reference onto the fixed
# overlay, so the PROJECTED box's centre wanders hundreds of pixels while
# the MATCHED features never move — and it only matched in ~13% of samples,
# under 1.2's 30% line. Hits now carry the inlier centroid, and a fine rule
# strips any position it holds to 16px through 8%+ of samples spread across
# half the match — no operated camera returns to the same sixteen pixels
# across separate visits spanning an afternoon; a digital overlay does
# nothing else. Two thirds of all measured phantoms were this.
ENGINE_VERSION = "1.4"

# --- tunables, all in one place so a run can be described in one line ---------
SAMPLE_FPS = 2.0            # samples per second of match
NFEATURES = 6000            # SIFT cap per frame; a football frame has far more
BAND_FRAC, BAND_STRIDE = 0.22, 0.055   # sliding horizontal search window
RATIO, MIN_INLIERS, MAX_PER_BAND = 0.80, 9, 6
ASPECT = (1.6, 7.0)         # a hoarding is wide
MAX_TILT = 28.0             # degrees off level
AREA_PCT = (0.02, 5.0)      # share of frame the logo may occupy
MIN_SIDE = 12               # pixels; 18 until engine 1.3 — see the version note
# In SECONDS, not samples. These were sample counts until 27/08/2026, which made
# them silently depend on --fps: at 2/s a gap of 1.5s stayed one appearance, at
# 5/s the same real gap became three, and the fragments fell under the minimum.
# Raising the sample rate then *lowered* a sponsor's seconds, which is nonsense.
# Runtime knobs must not change what is being measured.
MIN_RUN_SECS = 1.0          # shortest appearance that counts at all
BRIDGE_SECS = 1.5           # longest blocked gap still inside one appearance
MIN_RUN, BRIDGE = 2, 2      # the same thing in samples at the default 2/s
DEDUPE_PX = 45              # two hits closer than this are the same board
# Gap-tracking. SIFT needs sharp detail and a broadcast pan smears the whole
# frame, so a board that is plainly on screen goes undetected until the camera
# settles and its run fragments. When the SAME sponsor is detected on both
# sides of a short gap, the board's patch is template-tracked through the
# blurred frames instead — at quarter scale, where blur costs little — and the
# gap is filled only if EVERY frame in it is accounted for. Tracking never
# extends a run past its last real detection; it only closes bounded gaps.
TRACK_MAX_GAP_SECS = 4.0    # longest gap tracking may close (bridge stays 1.5)
TRACK_MIN_CORR = 0.60       # normalised correlation below this = not the board
TRACK_SCALE = 0.25          # match at quarter resolution: cheap and blur-tolerant
TRACK_Y_PAD = 2.0           # vertical search reach, in patch heights
# Visibility. A detected board is either fully credited or absent — nothing
# records that a steward stood across half of it. So each hit also measures
# how much of the board's face agrees with the reference: both are squeezed
# onto one small canvas, compared cell by cell, and the share of agreeing
# cells is the hit's visibility. Additive to the 1.1 numbers — seconds,
# clarity and detections do not move, which is why ENGINE_VERSION does not.
VIS_W, VIS_H = 160, 48      # the common canvas; distortion hits both sides alike
VIS_GRID = (4, 8)           # rows x cols of compared cells
VIS_MIN_STD = 0.12          # under this a cell is flat (solid colour), in norm units
VIS_CELL_CORR = 0.30        # a textured cell agrees at this correlation or better
VIS_FLAT_DIFF = 0.55        # a flat cell agrees if the brightness gap is under this
VIS_BLOCKED = 0.60          # a hit below this counts as obstructed in roll-ups
# Static furniture. A perimeter board's on-screen position changes every time
# the camera moves, and the camera at a football match never stops moving; a
# broadcast overlay is bolted to the frame. So a position (to the nearest
# cell, neighbours merged) that carries a sponsor's hits through more than
# STATIC_SHARE of ALL samples — not just detected ones — is an overlay, and
# every hit at it is removed before anything is counted.
STATIC_SHARE = 0.30         # share of the whole match one position may hold
STATIC_CELL_PX = 24         # position granularity; jitter smaller than this merges
# The fine rule, on the matched-feature centroid ("mc") rather than the
# projected box: an overlay's matched features are pixel-locked however much
# the projected quad wanders, and it may match only intermittently — so the
# bar is lower but TWO-part: a 16px cell holding 8%+ of all samples AND those
# samples spread across at least half the video. A real board can hold a
# spot for one spell; nothing physical holds sixteen pixels across separate
# camera visits spanning the whole match.
STATIC_FINE_CELL_PX = 16
STATIC_FINE_SHARE = 0.08
STATIC_FINE_SPAN = 0.50


def flatten(path):
    """Read a reference image to grey, compositing any alpha onto white."""
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        sys.exit(f"cannot read {path}")
    if img.ndim == 3 and img.shape[2] == 4:
        a = img[:, :, 3:4].astype(np.float32) / 255.0
        img = (img[:, :, :3].astype(np.float32) * a + 255 * (1 - a)).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img


def geometry_ok(q, shape, explain=False):
    """
    Reject matches that are the right pixels in an impossible shape.

    `explain` returns (ok, reason) instead of a bool. The reason is what makes
    the annotate diagnostic worth looking at — a rejected box drawn with
    "aspect 11.4" beside it says more about the check than any inlier count —
    so it lives here rather than in a second copy of this function.
    """
    def no(why):
        return (False, why) if explain else False

    p = q.astype(np.float32)
    if not cv2.isContourConvex(p):
        return no("not convex")
    s = lambda a, b: float(np.hypot(*(p[b] - p[a])))
    top, bot, left, right = s(0, 1), s(3, 2), s(0, 3), s(1, 2)
    if min(top, bot, left, right) < MIN_SIDE:
        return no("too small")
    h = (left + right) / 2.0
    if h <= 0:
        return no("degenerate")
    aspect = ((top + bot) / 2.0) / h
    if not (ASPECT[0] <= aspect <= ASPECT[1]):
        return no(f"aspect {aspect:.1f}")
    dx, dy = p[1] - p[0]
    tilt = abs(np.degrees(np.arctan2(dy, dx)))
    tilt = min(tilt, 180 - tilt)
    if tilt > MAX_TILT:
        return no(f"tilt {tilt:.0f}deg")
    pct = 100.0 * abs(cv2.contourArea(p)) / (shape[0] * shape[1])
    if not (AREA_PCT[0] <= pct <= AREA_PCT[1]):
        return no(f"area {pct:.2f}%")
    if min(top, bot) / max(top, bot) < 0.45:
        return no("skew")
    return (True, f"{aspect:.1f}:1") if explain else True


def on_the_perimeter(frame_bgr, quad):
    """
    A hoarding stands on the touchline, so there is always pitch below it. A
    sponsor ident card in the broadcast graphics does not have that, and without
    this check it is counted as board exposure — different inventory, wrongly
    priced, and the first thing a partner would catch.
    """
    pts = quad.astype(np.float32)
    H, W = frame_bgr.shape[:2]
    bottom = float(pts[:, 1].max())
    height = max(6.0, float(pts[:, 1].max() - pts[:, 1].min()))
    y0 = int(min(H - 1, bottom + height * 0.15))
    y1 = int(min(H, bottom + height * 1.30))
    x0 = int(max(0, pts[:, 0].min()))
    x1 = int(min(W, pts[:, 0].max()))
    if y1 - y0 < 3 or x1 - x0 < 3:
        return False
    strip = frame_bgr[y0:y1, x0:x1]
    if strip.size == 0:
        return False
    hsv = cv2.cvtColor(strip, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    grass = ((h >= 30) & (h <= 90) & (s >= 40) & (v >= 40))
    return float(grass.mean()) >= 0.45


def load_tree(root, club=None):
    """
    The folder IS the configuration. Everything under partners/ is checked at
    every ground; a club's own folder is checked only when they are at home.
    One folder per sponsor, any number of images inside it — a sponsor with
    several board designs just gets several files, and they roll up under the
    folder name.

    Returns [(sponsor, path, scope)] where scope is 'partner' or 'club', so a
    report can say which sponsors were league-wide and which were local.
    """
    out = []

    def scan(base, scope):
        if not os.path.isdir(base):
            return
        for sponsor in sorted(os.listdir(base)):
            d = os.path.join(base, sponsor)
            if not os.path.isdir(d):
                continue
            for f in sorted(os.listdir(d)):
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    out.append((sponsor, os.path.join(d, f), scope))

    scan(os.path.join(root, "partners"), "partner")
    if club:
        scan(os.path.join(root, "clubs", club), "club")
    return out


def grow_to_board(frame_bgr, quad):
    """
    The logo is not the advertisement — the board is. Enterprise's wordmark sits
    on a green panel roughly twice its width, and measuring the wordmark
    understates what the sponsor actually bought.

    So: sample the panel's own colour from inside the matched area, then walk
    outwards column by column for as long as that colour continues. Works for
    any board with a solid ground, whatever the hue.
    """
    pts = quad.astype(np.float32)
    H, W = frame_bgr.shape[:2]
    y0 = int(max(0, pts[:, 1].min()))
    y1 = int(min(H, pts[:, 1].max()))
    x0 = int(max(0, pts[:, 0].min()))
    x1 = int(min(W, pts[:, 0].max()))
    if y1 - y0 < 6 or x1 - x0 < 12:
        return None

    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    inside = hsv[y0:y1, x0:x1].reshape(-1, 3)
    if inside.size == 0:
        return None
    # The board's ground colour is the commonest thing inside the quad; the
    # lettering is the minority, so a median lands on the panel not the text.
    base = np.median(inside, axis=0)

    def same(x):
        col = hsv[y0:y1, x:x + 1].reshape(-1, 3)
        if col.size == 0:
            return False
        m = np.median(col, axis=0)
        dh = min(abs(float(m[0] - base[0])), 180 - abs(float(m[0] - base[0])))
        return dh < 14 and abs(float(m[1] - base[1])) < 70 and abs(float(m[2] - base[2])) < 70

    # A dark board against a dark stand has nothing to stop the walk, so cap it.
    # genie cloud's black hoarding grew to 21% of frame without this.
    span = x1 - x0
    limit = int(span * 3.0)
    L, Rr = x0, x1
    while L > 1 and (x0 - L) < limit and same(L - 1):
        L -= 1
    while Rr < W - 2 and (Rr - x1) < limit and same(Rr):
        Rr += 1
    if Rr - L <= span:
        return None
    if 100.0 * (Rr - L) * (y1 - y0) / (H * W) > 6.0:
        return None                      # implausible for a perimeter board
    return (L, y0, Rr, y1)


def rectify(gray, quad, ref_wh):
    """The board's face, warped back to square-on. None when degenerate."""
    w, h = max(int(ref_wh[0]), 32), max(int(ref_wh[1]), 32)
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
    try:
        M = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
        crop = cv2.warpPerspective(gray, M, (w, h))
    except cv2.error:
        return None
    return crop if crop.size else None


def focus_of(crop):
    """Focus and contrast of a rectified board face."""
    if crop is None:
        return 0.0, 0.0
    return float(cv2.Laplacian(crop, cv2.CV_64F).var()), float(crop.std())


def quality(gray, quad, ref_wh):
    """Focus and contrast, measured on the board rectified back to square-on."""
    return focus_of(rectify(gray, quad, ref_wh))


def visibility(vis_ref, crop):
    """
    How much of the board's face agrees with its reference, 0..1.

    Both sides are squeezed onto the same small canvas (identical distortion,
    so shape differences cancel), globally normalised (overall gain and
    lighting cancel), and compared cell by cell. A textured cell agrees by
    correlation; a flat cell — a solid panel has no texture to correlate — by
    brightness alone, which is what stops a plain green board scoring as
    half-hidden. Cells that disagree are the steward, the physio table, the
    player through whom the artwork cannot be seen.

    A judgement about coverage, not a measurement of anything physical: the
    thresholds are stated in settings() so two exports can refuse to compare
    if they were judged differently.
    """
    if vis_ref is None or crop is None:
        return None
    f = cv2.resize(crop, (VIS_W, VIS_H))

    def norm(a):
        a = a.astype(np.float32)
        s = float(a.std())
        return (a - float(a.mean())) / (s if s > 1e-6 else 1.0)

    r, f = norm(vis_ref), norm(f)
    rows, cols = VIS_GRID
    ch, cw = VIS_H // rows, VIS_W // cols
    ok, total = 0, rows * cols
    for gy in range(rows):
        for gx in range(cols):
            rc = r[gy * ch:(gy + 1) * ch, gx * cw:(gx + 1) * cw]
            fc = f[gy * ch:(gy + 1) * ch, gx * cw:(gx + 1) * cw]
            if float(rc.std()) < VIS_MIN_STD:
                ok += abs(float(rc.mean()) - float(fc.mean())) < VIS_FLAT_DIFF
            else:
                denom = float(rc.std()) * float(fc.std())
                ncc = (float(np.mean((rc - rc.mean()) * (fc - fc.mean()))) / denom
                       if denom > 1e-6 else 0.0)
                ok += ncc >= VIS_CELL_CORR
    return ok / total


def clarity(area_pct, sharp, contrast, skew):
    """
    How readable the exposure was — size, focus, contrast, angle at 40/25/20/15.

    A stated choice, not a measurement, and uncalibrated against a hand-count.
    Kept separate from matcher confidence on purpose: confidence is a property
    of the software and has no business inside a number sold as value.
    """
    # Calibrated on real footage: boards run 0.1-0.6% of frame here, not the 2%
    # the synthetic clip produced, so the size term saturates far sooner.
    return float(np.clip(0.40 * min(1.0, area_pct / 0.6)
                         + 0.25 * min(1.0, sharp / 300.0)
                         + 0.20 * min(1.0, contrast / 60.0)
                         + 0.15 * (1.0 - skew), 0.0, 1.0))


def build_refs(entries, sift):
    """
    Turn [(sponsor, path, scope)] into matchable references.

    Returns [(sponsor, scope, keypoints, descriptors, corners, (w, h),
    vis_ref)], one per image — several images for one sponsor stay separate
    here and roll up under the sponsor name at aggregation time. vis_ref is
    the reference squeezed onto the visibility canvas, kept because the
    keypoints alone cannot say what the board's face LOOKS like.
    """
    refs, skipped = [], []
    for sponsor, path, scope in entries:
        g = flatten(path)
        kp, des = sift.detectAndCompute(g, None)
        if des is None or len(kp) < MIN_INLIERS:
            skipped.append((path, 0 if des is None else len(kp)))
            continue
        h, w = g.shape[:2]
        refs.append((sponsor, scope, kp, des,
                     np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2),
                     (w, h), cv2.resize(g, (VIS_W, VIS_H))))
    return refs, skipped


def detect(frame_bgr, refs, sift, matcher):
    """
    Every board of every sponsor in one frame.

    Detects SIFT once for the frame and slices the keypoints by band afterwards
    — re-running the detector per band cost thirteen times more than it needed
    to. Searching the whole frame at once does not work at all: a football frame
    carries tens of thousands of keypoints, so nearly every reference descriptor
    finds a spurious near-neighbour somewhere in shot and Lowe's ratio test
    throws the true correspondence away with the false one.

    Returns {sponsor: [hit, ...]}.
    """
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    shape = gray.shape
    H, W = shape
    kp_f, des_f = sift.detectAndCompute(gray, None)
    if des_f is None or len(kp_f) < MIN_INLIERS:
        return {}

    ys = np.array([k.pt[1] for k in kp_f])
    bh = H * BAND_FRAC
    by_sponsor = {}

    for name, scope, kp_r, des_r, corners, ref_wh, vis_ref in refs:
        hits = by_sponsor.setdefault(name, [])
        for y0 in np.arange(0, H - bh, H * BAND_STRIDE):
            sel = np.flatnonzero((ys >= y0) & (ys < y0 + bh))
            if len(sel) < MIN_INLIERS:
                continue
            alive = np.ones(len(sel), bool)
            for _ in range(MAX_PER_BAND):
                idx = sel[alive]
                if len(idx) < MIN_INLIERS:
                    break
                knn = matcher.knnMatch(des_r, des_f[idx], k=2)
                good = [m for m, n2 in (p for p in knn if len(p) == 2)
                        if m.distance < RATIO * n2.distance]
                if len(good) < MIN_INLIERS:
                    break
                src = np.float32([kp_r[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
                dst = np.float32([kp_f[idx[m.trainIdx]].pt for m in good]).reshape(-1, 1, 2)
                Hm, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
                if Hm is None or mask is None or int(mask.sum()) < MIN_INLIERS:
                    break
                quad = cv2.perspectiveTransform(corners, Hm).reshape(4, 2)
                if geometry_ok(quad, shape) and on_the_perimeter(frame_bgr, quad):
                    # Where the AGREEING features actually sit — not where the
                    # projected box says the board is. An overlay's features
                    # are pixel-locked while its projected box wanders, which
                    # is what the fine furniture rule keys on.
                    used = dst.reshape(-1, 2)[mask.ravel().astype(bool)]
                    mc = [float(used[:, 0].mean()), float(used[:, 1].mean())]
                    crop = rectify(gray, quad, ref_wh)
                    sh, ct = focus_of(crop)
                    logo_pct = 100.0 * abs(cv2.contourArea(
                        quad.astype(np.float32))) / (H * W)
                    board = grow_to_board(frame_bgr, quad)
                    board_pct = logo_pct
                    if board:
                        bx0, by0, bx1, by1 = board
                        board_pct = 100.0 * (bx1 - bx0) * (by1 - by0) / (H * W)
                    hits.append({
                        "scope": scope,
                        "quad": quad,
                        "board": board,
                        "logo_area": logo_pct,
                        "area": board_pct,
                        "inliers": int(mask.sum()),
                        "clarity": clarity(board_pct, sh, ct, 0.1),
                        "visibility": visibility(vis_ref, crop),
                        "mc": mc,
                    })
                used = [np.flatnonzero(sel == idx[m.trainIdx])[0]
                        for m, k in zip(good, mask.ravel()) if k]
                alive[used] = False

    # Bands overlap, and a sponsor with several reference images matches several
    # times, so the same physical board turns up more than once. Keep the
    # strongest of each cluster.
    out = {}
    for name, hits in by_sponsor.items():
        kept = []
        for h_ in sorted(hits, key=lambda d: -d["inliers"]):
            c = h_["quad"].mean(axis=0)
            if any(np.hypot(*(c - k["quad"].mean(axis=0))) < DEDUPE_PX for k in kept):
                continue
            kept.append(h_)
        if kept:
            out[name] = kept
    return out


def settings():
    """
    Everything that decides what a number comes out as, for the export.

    Clarity weights are a stated choice rather than a measurement, so a roll-up
    that quietly mixes two versions of them is comparing nothing. Recording them
    beside the results is what lets anything downstream refuse to.
    """
    return {
        "engine_version": ENGINE_VERSION,
        "sample_fps": SAMPLE_FPS,
        "nfeatures": NFEATURES,
        "band_frac": BAND_FRAC, "band_stride": BAND_STRIDE,
        "ratio": RATIO, "min_inliers": MIN_INLIERS, "max_per_band": MAX_PER_BAND,
        "aspect": list(ASPECT), "max_tilt": MAX_TILT, "area_pct": list(AREA_PCT),
        "min_side": MIN_SIDE,
        "min_run_secs": MIN_RUN_SECS, "bridge_secs": BRIDGE_SECS,
        "track_max_gap_secs": TRACK_MAX_GAP_SECS, "track_min_corr": TRACK_MIN_CORR,
        "track_scale": TRACK_SCALE,
        "visibility": {"grid": list(VIS_GRID), "cell_corr": VIS_CELL_CORR,
                       "flat_diff": VIS_FLAT_DIFF, "blocked_under": VIS_BLOCKED},
        "static_share": STATIC_SHARE, "static_cell_px": STATIC_CELL_PX,
        "static_fine": {"cell_px": STATIC_FINE_CELL_PX,
                        "share": STATIC_FINE_SHARE, "span": STATIC_FINE_SPAN},
        "clarity_weights": {"size": 0.40, "focus": 0.25,
                            "contrast": 0.20, "angle": 0.15},
        "clarity_saturation": {"area_pct": 0.6, "sharp": 300.0, "contrast": 60.0},
    }


def run_limits(interval):
    """
    The appearance thresholds in samples, for a given seconds-per-sample.

    One place, so the runner, the report builder and the page cannot drift into
    three different answers about what counts as one appearance.
    """
    return (max(1, int(round(MIN_RUN_SECS / interval))),
            max(0, int(round(BRIDGE_SECS / interval)) - 1))


def runs_from(indices, bridge=BRIDGE, min_run=MIN_RUN, interval=None):
    """Group sample indices into continuous appearances, bridging short gaps."""
    if not indices:
        return []
    if interval:
        min_run, bridge = run_limits(interval)
    idxs = sorted(indices)
    runs, cur = [], [idxs[0]]
    for i in idxs[1:]:
        if i - cur[-1] <= bridge + 1:
            cur.append(i)
        else:
            runs.append(cur)
            cur = [i]          # a fresh list — clearing the stored one empties it too
    runs.append(cur)
    return [r for r in runs if len(r) >= min_run]


def _hit_cell(h, cell, prefer_mc=False):
    if prefer_mc and h.get("mc"):
        return int(float(h["mc"][0]) // cell), int(float(h["mc"][1]) // cell)
    q = h["quad"]
    cx = sum(float(p[0]) for p in q) / 4.0
    cy = sum(float(p[1]) for p in q) / 4.0
    return int(cx // cell), int(cy // cell)


def static_positions(hits_by_index, n_samples, cell=STATIC_CELL_PX,
                     share=STATIC_SHARE):
    """
    {sponsor: set of grid cells that are broadcast furniture}. Pure — plain
    dicts and lists in, so the rule that deletes measurements is testable in
    CI without OpenCV anywhere near it.

    Per sponsor, count the DISTINCT samples whose hits centre in each cell;
    a cell whose 3x3 neighbourhood covers more than `share` of every sample
    in the match is a position no real board can occupy, because holding one
    screen position for a third of a football match means the camera never
    moved. The denominator is all samples, deliberately: an overlay matched
    in only half its appearances still trips this, while a real board would
    need the impossible framing streak either way.
    """
    from collections import defaultdict
    out = {}
    if not n_samples:
        return out
    per = defaultdict(lambda: defaultdict(set))
    for i, row in hits_by_index.items():
        for name, hs in row.items():
            for h in hs:
                per[name][_hit_cell(h, cell)].add(i)
    for name, cells in per.items():
        bad = set()
        for gx, gy in cells:
            seen = set()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    seen |= cells.get((gx + dx, gy + dy), set())
            if len(seen) > share * n_samples:
                bad.add((gx, gy))
        if bad:
            out[name] = bad
    return out


def static_fine_positions(hits_by_index, n_samples, cell=STATIC_FINE_CELL_PX,
                          share=STATIC_FINE_SHARE, span=STATIC_FINE_SPAN):
    """
    {sponsor: set of fine cells that are overlays}, judged on the matched
    features. Pure, like static_positions. Hits without an "mc" (older
    exports, tracked fills) never contribute and are never condemned by this
    rule — a rule this aggressive only runs on the evidence it was designed
    for.
    """
    from collections import defaultdict
    out = {}
    if not n_samples:
        return out
    per = defaultdict(lambda: defaultdict(set))
    for i, row in hits_by_index.items():
        for name, hs in row.items():
            for h in hs:
                if h.get("mc"):
                    per[name][_hit_cell(h, cell, prefer_mc=True)].add(i)
    for name, cells in per.items():
        bad = set()
        for c, samples in cells.items():
            if (len(samples) >= share * n_samples
                    and max(samples) - min(samples) >= span * n_samples):
                bad.add(c)
        if bad:
            out[name] = bad
    return out


def strip_static(hits_by_index, n_samples, cell=STATIC_CELL_PX,
                 share=STATIC_SHARE):
    """Remove furniture hits in place. Returns {sponsor: hits removed}."""
    bad = static_positions(hits_by_index, n_samples, cell, share)
    fine = static_fine_positions(hits_by_index, n_samples)
    removed = {}
    if not bad and not fine:
        return removed
    for i in list(hits_by_index):
        row = hits_by_index[i]
        for name in list(row):
            if name not in bad and name not in fine:
                continue
            keep = [h for h in row[name]
                    if _hit_cell(h, cell) not in bad.get(name, ())
                    and (not h.get("mc")
                         or _hit_cell(h, STATIC_FINE_CELL_PX, prefer_mc=True)
                         not in fine.get(name, ()))]
            gone = len(row[name]) - len(keep)
            if gone:
                removed[name] = removed.get(name, 0) + gone
            if keep:
                row[name] = keep
            else:
                del row[name]
        if not row:
            del hits_by_index[i]
    return removed


def gap_candidates(indices, max_gap):
    """
    Pairs (a, b) of detected sample indices with a fillable gap between them:
    at least one missing sample, at most max_gap. Pure, so the selection rule
    is testable without a frame in sight — the rule IS the precision guard.
    Only bounded gaps qualify: a run's ends are never extended, because past
    the last real detection there is no second anchor to verify against.
    """
    idxs = sorted(set(indices))
    return [(a, b) for a, b in zip(idxs, idxs[1:]) if 1 <= b - a - 1 <= max_gap]


def find_patch(prev_bgr, bbox, cur_bgr):
    """
    Locate the content of prev's bbox inside cur. Returns ((x0,y0,x1,y1), corr)
    or None when the search is impossible (patch at the frame edge, degenerate
    box). corr is TM_CCOEFF_NORMED in [-1, 1]; the caller compares it against
    TRACK_MIN_CORR and treats anything below as "the board is not there".

    Both sides are matched at TRACK_SCALE with a slight blur, which is what
    makes this work on the pan-blurred frames SIFT gives up on: motion blur is
    a low-pass filter, and at quarter scale a sharp template and a smeared
    frame look alike again. The search is the full frame width — half a frame
    of travel between samples is an ordinary pan — but only TRACK_Y_PAD patch
    heights vertically, because perimeter boards live in a horizontal band and
    a match found far above one is a graphic, not the board.
    """
    H, W = prev_bgr.shape[:2]
    x0, y0 = max(0, int(bbox[0])), max(0, int(bbox[1]))
    x1, y1 = min(W, int(bbox[2])), min(H, int(bbox[3]))
    ph, pw = y1 - y0, x1 - x0
    if ph < 8 or pw < 16:
        return None

    def prep(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        g = cv2.resize(g, (max(4, int(g.shape[1] * TRACK_SCALE)),
                           max(4, int(g.shape[0] * TRACK_SCALE))))
        return cv2.GaussianBlur(g, (3, 3), 0)

    tmpl = prep(prev_bgr[y0:y1, x0:x1])
    sy0 = max(0, int(y0 - TRACK_Y_PAD * ph))
    sy1 = min(cur_bgr.shape[0], int(y1 + TRACK_Y_PAD * ph))
    search = prep(cur_bgr[sy0:sy1, :])
    if search.shape[0] < tmpl.shape[0] or search.shape[1] < tmpl.shape[1]:
        return None

    res = cv2.matchTemplate(search, tmpl, cv2.TM_CCOEFF_NORMED)
    _, corr, _, loc = cv2.minMaxLoc(res)
    bx0 = loc[0] / TRACK_SCALE
    by0 = sy0 + loc[1] / TRACK_SCALE
    return (bx0, by0, bx0 + pw, by0 + ph), float(corr)
