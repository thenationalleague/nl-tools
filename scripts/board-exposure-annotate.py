#!/usr/bin/env python3
"""
Draw what the detector thinks it found, so a person can judge it in two seconds.

    python board-exposure-annotate.py "frames/*.png" ref-a.png ref-b.png

Green passed the geometry check, red was found and rejected — and the red boxes
are the ones worth looking at, because they show what the check is doing for its
living. Each carries the reason it failed.

This is the diagnostic that produced the recall-by-eye figure in
system/board-exposure/README.md. It is deliberately *not* the measuring run:
there is no perimeter test and no board growth here, only the raw match and the
geometry, because the point is to see the matcher's unfiltered opinion.
"""
import glob
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import board_exposure_core as C          # noqa: E402

OUT = "annotated"
COLOURS = [(80, 220, 80), (255, 190, 60), (200, 120, 255), (60, 220, 220)]


def search_band(band, y0, ref_kp, ref_des, ref_corners, sift, matcher, shape):
    kp, des = sift.detectAndCompute(band, None)
    if des is None or len(kp) < C.MIN_INLIERS:
        return []
    alive = np.ones(len(kp), dtype=bool)
    out = []
    for _ in range(C.MAX_PER_BAND):
        idx = np.flatnonzero(alive)
        if len(idx) < C.MIN_INLIERS:
            break
        knn = matcher.knnMatch(ref_des, des[idx], k=2)
        good = [m for m, n in (p for p in knn if len(p) == 2)
                if m.distance < C.RATIO * n.distance]
        if len(good) < C.MIN_INLIERS:
            break
        src = np.float32([ref_kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([kp[idx[m.trainIdx]].pt for m in good]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if H is None or mask is None or int(mask.sum()) < C.MIN_INLIERS:
            break
        quad = cv2.perspectiveTransform(ref_corners, H).reshape(4, 2)
        quad[:, 1] += y0                                  # back to frame coords
        ok, why = C.geometry_ok(quad, shape, explain=True)
        out.append({"quad": quad, "inliers": int(mask.sum()), "ok": ok, "why": why})
        used = [idx[m.trainIdx] for m, keep in zip(good, mask.ravel()) if keep]
        alive[used] = False
    return out


def dedupe(hits, tol=40):
    """The sliding bands overlap, so the same board is found more than once."""
    kept = []
    for h in sorted(hits, key=lambda d: -d["inliers"]):
        c = h["quad"].mean(axis=0)
        if any(np.hypot(*(c - k["quad"].mean(axis=0))) < tol for k in kept):
            continue
        kept.append(h)
    return kept


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__.strip())
    frames = sorted(glob.glob(sys.argv[1]))
    if not frames:
        sys.exit(f"no frames matched {sys.argv[1]}")

    os.makedirs(OUT, exist_ok=True)
    sift = cv2.SIFT_create(nfeatures=C.NFEATURES)
    matcher = cv2.BFMatcher(cv2.NORM_L2)

    prepped = {}
    for path in sys.argv[2:]:
        r = C.flatten(path)
        kp, des = sift.detectAndCompute(r, None)
        if des is None or len(kp) < C.MIN_INLIERS:
            print(f"! too few features, skipped: {path}")
            continue
        h, w = r.shape[:2]
        name = os.path.splitext(os.path.basename(path))[0]
        prepped[name] = (kp, des,
                         np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2))
        print(f"reference: {name} — {w}x{h}, {len(kp)} features")
    if not prepped:
        sys.exit("no usable references")
    print()

    for path in frames:
        frame = cv2.imread(path)
        if frame is None:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        H, W = gray.shape
        canvas = frame.copy()
        label = os.path.basename(path)

        summary = []
        for i, (name, (rkp, rdes, rcorn)) in enumerate(prepped.items()):
            colour = COLOURS[i % len(COLOURS)]
            raw = []
            bh = int(H * C.BAND_FRAC)
            for y0 in range(0, max(1, H - bh), max(1, int(H * C.BAND_STRIDE))):
                raw += search_band(gray[y0:y0 + bh, :], y0, rkp, rdes, rcorn,
                                   sift, matcher, (H, W))
            passed = dedupe([h for h in raw if h["ok"]])
            failed = dedupe([h for h in raw if not h["ok"]])

            for h in failed:
                q = h["quad"].astype(np.int32)
                cv2.polylines(canvas, [q], True, (60, 60, 235), 2)
                cv2.putText(canvas, h["why"], (q[:, 0].min(), max(14, q[:, 1].min() - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (60, 60, 235), 1, cv2.LINE_AA)
            for h in passed:
                q = h["quad"].astype(np.int32)
                cv2.polylines(canvas, [q], True, colour, 3)
                cv2.putText(canvas, f"{name} {h['inliers']}",
                            (q[:, 0].min(), max(14, q[:, 1].min() - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2, cv2.LINE_AA)
            summary.append(f"{name}: {len(passed)} kept, {len(failed)} rejected")

        cv2.putText(canvas, label, (14, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (255, 255, 255), 2, cv2.LINE_AA)
        cv2.imwrite(os.path.join(OUT, f"annotated_{label}"), canvas)
        print(f"{label:<28} " + " | ".join(summary))


if __name__ == "__main__":
    main()
