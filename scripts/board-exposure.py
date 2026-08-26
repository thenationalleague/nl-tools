#!/usr/bin/env python3
"""
board_exposure.py — perimeter advertising exposure measurement from match video.

Measures, per sponsor, how long a board was on screen and how readable it was.

Design note — clarity and confidence are NOT the same thing, and this script
keeps them apart on purpose:

  confidence  how sure the matcher is that this is that sponsor's board.
              A property of the software. Belongs on an error bar.
  clarity     how readable the board actually was — size, focus, contrast,
              viewing angle. A property of the exposure. Belongs in the value.

Collapsing the two penalises a sponsor whose artwork the matcher finds awkward,
which is a software problem being billed as a delivery problem. The exposure
index below is built from clarity only; confidence is reported alongside it and
gates whether a detection counts at all, never how much it is worth.

Usage:
  python3 board_exposure.py --video match.mp4 --logos ./logos --out result.json

  ./logos holds one image per sponsor board, named for the sponsor:
      enterprise.png, ashmead-roofing.png, ...
  Crop them square-on from footage or photograph the boards at the ground.

Output: JSON — per-sponsor totals, the run list, and a screen-position heatmap.
"""

import argparse
import json
import math
import os
import sys
from collections import defaultdict

import cv2
import numpy as np

# --- tunables ---------------------------------------------------------------
MIN_INLIERS = 12          # RANSAC inliers needed before a match is believed
RATIO_TEST = 0.75         # Lowe ratio for descriptor matching
MIN_CONFIDENCE = 0.30     # inlier ratio below this is discarded outright
MIN_RUN_FRAMES = 2        # a detection must survive this many samples to count
BRIDGE_GAP_FRAMES = 2     # tolerate this many missed samples inside one run
HEATMAP_GRID = (24, 42)   # rows, cols — screen-position accumulator


def build_detector(n_features=4000):
    """SIFT where available (better on small, low-texture logos), else ORB."""
    if hasattr(cv2, "SIFT_create"):
        return cv2.SIFT_create(nfeatures=n_features), "sift"
    return cv2.ORB_create(nfeatures=n_features), "orb"


def load_references(logo_dir, detector, upscale):
    """One reference per sponsor: keypoints, descriptors, and corner geometry."""
    refs = []
    for name in sorted(os.listdir(logo_dir)):
        if not name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue
        path = os.path.join(logo_dir, name)
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            print(f"  ! unreadable, skipped: {name}", file=sys.stderr)
            continue
        # Small references match poorly; give the detector something to work with.
        if upscale != 1.0:
            img = cv2.resize(img, None, fx=upscale, fy=upscale,
                             interpolation=cv2.INTER_CUBIC)
        kp, desc = detector.detectAndCompute(img, None)
        if desc is None or len(kp) < MIN_INLIERS:
            print(f"  ! too few features ({len(kp) if kp else 0}), skipped: {name}",
                  file=sys.stderr)
            continue
        h, w = img.shape[:2]
        refs.append({
            "sponsor": os.path.splitext(name)[0],
            "kp": kp,
            "desc": desc,
            "corners": np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2),
            "features": len(kp),
        })
        print(f"  · {os.path.splitext(name)[0]}: {len(kp)} features")
    return refs


def quad_metrics(quad, frame_shape):
    """Geometry of a detected board: area share, and how far off square it sits."""
    fh, fw = frame_shape[:2]
    pts = quad.reshape(4, 2)
    area = abs(cv2.contourArea(pts.astype(np.float32)))
    area_pct = 100.0 * area / float(fw * fh)

    # Skew: a fronto-parallel board has equal opposite sides. Compare the two
    # pairs; the further apart they are, the more oblique the viewing angle.
    def side(a, b):
        return math.hypot(*(pts[b] - pts[a]))
    top, bottom = side(0, 1), side(3, 2)
    left, right = side(0, 3), side(1, 2)
    skew = 0.0
    if max(top, bottom) > 1e-6 and max(left, right) > 1e-6:
        skew = 1.0 - 0.5 * (min(top, bottom) / max(top, bottom)
                            + min(left, right) / max(left, right))
    return area_pct, float(np.clip(skew, 0.0, 1.0)), area


def plausible(quad, area, frame_shape):
    """Reject homographies that fold, invert, or cover implausible screen area."""
    fh, fw = frame_shape[:2]
    pts = quad.reshape(4, 2).astype(np.float32)
    if not cv2.isContourConvex(pts):
        return False
    frame_area = float(fw * fh)
    if area < frame_area * 0.00005 or area > frame_area * 0.60:
        return False
    # Corners far outside the frame usually mean a degenerate fit.
    if np.any(pts < -fw) or np.any(pts[:, 0] > 2 * fw) or np.any(pts[:, 1] > 2 * fh):
        return False
    return True


def crop_quality(frame_gray, quad, ref_shape):
    """Warp the detected board flat, then measure how readable it actually is."""
    w = int(max(ref_shape[0], 32))
    h = int(max(ref_shape[1], 32))
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
    try:
        M = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
        crop = cv2.warpPerspective(frame_gray, M, (w, h))
    except cv2.error:
        return 0.0, 0.0
    if crop.size == 0:
        return 0.0, 0.0
    # Focus: high-frequency energy. Motion blur and soft focus flatten this.
    sharpness = float(cv2.Laplacian(crop, cv2.CV_64F).var())
    # Contrast: RMS about the mean. Floodlight glare and shadow both cut it.
    contrast = float(crop.std())
    return sharpness, contrast


def clarity_score(area_pct, sharpness, contrast, skew):
    """
    Combine the optical measurements into one 0-1 readability figure.

    The weights are a stated choice, not a measurement — calibrate them against
    a hand-count before any number from here goes in front of a partner. They
    are here so the score is reproducible and arguable, not so it is correct.
    """
    size_t = min(1.0, area_pct / 2.0)               # 2% of frame reads as full marks
    focus_t = min(1.0, sharpness / 300.0)           # Laplacian variance, empirical
    contrast_t = min(1.0, contrast / 60.0)          # 8-bit std dev
    angle_t = 1.0 - skew
    return float(np.clip(
        0.40 * size_t + 0.25 * focus_t + 0.20 * contrast_t + 0.15 * angle_t,
        0.0, 1.0))


def detect_frame(frame_gray, refs, detector, matcher, norm_is_binary):
    """Every sponsor board visible in this one frame."""
    kp, desc = detector.detectAndCompute(frame_gray, None)
    if desc is None or len(kp) < MIN_INLIERS:
        return []

    hits = []
    for ref in refs:
        try:
            knn = matcher.knnMatch(ref["desc"], desc, k=2)
        except cv2.error:
            continue
        good = [m for m, n in (p for p in knn if len(p) == 2)
                if m.distance < RATIO_TEST * n.distance]
        if len(good) < MIN_INLIERS:
            continue

        src = np.float32([ref["kp"][m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dstp = np.float32([kp[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src, dstp, cv2.RANSAC, 5.0)
        if H is None or mask is None:
            continue
        inliers = int(mask.sum())
        if inliers < MIN_INLIERS:
            continue
        confidence = inliers / float(len(good))
        if confidence < MIN_CONFIDENCE:
            continue

        quad = cv2.perspectiveTransform(ref["corners"], H)
        area_pct, skew, area = quad_metrics(quad, frame_gray.shape)
        if not plausible(quad, area, frame_gray.shape):
            continue

        ref_w = ref["corners"][2][0][0]
        ref_h = ref["corners"][2][0][1]
        sharpness, contrast = crop_quality(frame_gray, quad, (ref_w, ref_h))
        centre = quad.reshape(4, 2).mean(axis=0)

        hits.append({
            "sponsor": ref["sponsor"],
            "confidence": round(confidence, 4),
            "inliers": inliers,
            "area_pct": round(area_pct, 4),
            "sharpness": round(sharpness, 2),
            "contrast": round(contrast, 2),
            "skew": round(skew, 4),
            "clarity": round(clarity_score(area_pct, sharpness, contrast, skew), 4),
            "cx": float(centre[0]),
            "cy": float(centre[1]),
        })
    return hits


def to_runs(samples, sponsor, sample_interval_s):
    """
    Collapse per-sample hits into continuous exposure runs.

    A single isolated sample is noise, and a one-sample dropout mid-run is a
    player walking past, not the board leaving. Both are handled here rather
    than by discounting short appearances after the fact.
    """
    idxs = sorted(samples.keys())
    runs, current = [], []
    for i, idx in enumerate(idxs):
        if not current:
            current = [idx]
            continue
        if idx - current[-1] <= BRIDGE_GAP_FRAMES + 1:
            current.append(idx)
        else:
            runs.append(current)
            current = [idx]
    if current:
        runs.append(current)

    out = []
    for run in runs:
        if len(run) < MIN_RUN_FRAMES:
            continue
        vals = [samples[i] for i in run]
        span = (run[-1] - run[0] + 1) * sample_interval_s
        out.append({
            "start_s": round(run[0] * sample_interval_s, 2),
            "end_s": round((run[-1] + 1) * sample_interval_s, 2),
            "duration_s": round(span, 2),
            "mean_clarity": round(float(np.mean([v["clarity"] for v in vals])), 4),
            "mean_confidence": round(float(np.mean([v["confidence"] for v in vals])), 4),
            "peak_area_pct": round(max(v["area_pct"] for v in vals), 4),
        })
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--logos", required=True, help="directory of reference board images")
    ap.add_argument("--out", default="result.json")
    ap.add_argument("--fps", type=float, default=2.0, help="samples per second")
    ap.add_argument("--upscale", type=float, default=1.0,
                    help="scale reference logos before matching; helps small boards")
    ap.add_argument("--max-seconds", type=float, default=0.0,
                    help="stop early — useful for a quick check on a long file")
    args = ap.parse_args()

    detector, kind = build_detector()
    norm_is_binary = (kind == "orb")
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING if norm_is_binary else cv2.NORM_L2)

    print(f"detector: {kind}")
    print("references:")
    refs = load_references(args.logos, detector, args.upscale)
    if not refs:
        sys.exit("no usable reference logos")

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        sys.exit(f"cannot open video: {args.video}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(src_fps / args.fps)))
    sample_interval_s = step / src_fps
    limit = int(args.max_seconds * src_fps) if args.max_seconds else total

    print(f"video: {src_fps:.2f} fps, {total} frames, sampling every {step} "
          f"({args.fps:.1f}/s)")

    per_sponsor = defaultdict(dict)
    heat = defaultdict(lambda: np.zeros(HEATMAP_GRID, dtype=np.float64))
    frame_no = sample_no = 0
    frame_shape = None

    while True:
        ok, frame = cap.read()
        if not ok or (limit and frame_no >= limit):
            break
        if frame_no % step == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frame_shape = gray.shape
            for hit in detect_frame(gray, refs, detector, matcher, norm_is_binary):
                per_sponsor[hit["sponsor"]][sample_no] = hit
                r = int(np.clip(hit["cy"] / gray.shape[0] * HEATMAP_GRID[0],
                                0, HEATMAP_GRID[0] - 1))
                c = int(np.clip(hit["cx"] / gray.shape[1] * HEATMAP_GRID[1],
                                0, HEATMAP_GRID[1] - 1))
                heat[hit["sponsor"]][r, c] += hit["clarity"]
            sample_no += 1
            if sample_no % 200 == 0:
                print(f"  … {frame_no} frames, {sample_no} samples")
        frame_no += 1
    cap.release()

    sponsors = {}
    for sponsor, samples in per_sponsor.items():
        runs = to_runs(samples, sponsor, sample_interval_s)
        if not runs:
            continue
        vals = list(samples.values())
        total_s = sum(r["duration_s"] for r in runs)
        # Exposure index: seconds weighted by how readable the board was.
        # Confidence is deliberately absent — see the note at the top.
        index = sum(r["duration_s"] * r["mean_clarity"] for r in runs)
        sponsors[sponsor] = {
            "total_seconds": round(total_s, 2),
            "exposure_index": round(index, 2),
            "runs": len(runs),
            "longest_run_s": round(max(r["duration_s"] for r in runs), 2),
            "mean_clarity": round(float(np.mean([v["clarity"] for v in vals])), 4),
            "mean_confidence": round(float(np.mean([v["confidence"] for v in vals])), 4),
            "mean_area_pct": round(float(np.mean([v["area_pct"] for v in vals])), 4),
            "peak_area_pct": round(max(v["area_pct"] for v in vals), 4),
            "detections": len(vals),
            "timeline": runs,
            "heatmap": np.round(heat[sponsor], 3).tolist(),
        }

    result = {
        "video": os.path.basename(args.video),
        "sampled_at_fps": args.fps,
        "samples": sample_no,
        "video_seconds": round(frame_no / src_fps, 2),
        "frame_size": [frame_shape[1], frame_shape[0]] if frame_shape is not None else None,
        "heatmap_grid": list(HEATMAP_GRID),
        "detector": kind,
        "sponsors": sponsors,
    }
    with open(args.out, "w") as fh:
        json.dump(result, fh, indent=2)

    print(f"\n{'sponsor':<28}{'secs':>8}{'index':>9}{'clarity':>9}{'conf':>7}{'area%':>8}")
    print("-" * 69)
    for name, s in sorted(sponsors.items(),
                          key=lambda kv: -kv[1]["exposure_index"]):
        print(f"{name:<28}{s['total_seconds']:>8.1f}{s['exposure_index']:>9.1f}"
              f"{s['mean_clarity']:>9.3f}{s['mean_confidence']:>7.2f}"
              f"{s['mean_area_pct']:>8.2f}")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
