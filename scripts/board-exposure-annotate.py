#!/usr/bin/env python3
"""
Draw what the detector thinks it found, so a person can judge it in two seconds.

Three changes from the failed run: the search is restricted to a sliding
horizontal band rather than the whole frame (a football frame has tens of
thousands of keypoints and the ratio test drowns in them), every match must
survive a geometry check before it counts, and each band is searched repeatedly
so a sponsor with six boards is credited with six.

Output: the frames with boxes drawn on them. Green passed geometry, red was
found but rejected — the red ones matter, because they show what the geometry
check is doing for its living.
"""
import glob
import os

import cv2
import numpy as np

FRAMES = sorted(glob.glob("sutton/Sutton pics/*.png"))
OUT = "annotated"

BAND_FRAC = 0.22          # height of each search band, as a share of the frame
BAND_STRIDE = 0.05
RATIO = 0.80
MIN_INLIERS = 9
MAX_PER_BAND = 8

# A perimeter hoarding, described geometrically.
ASPECT_MIN, ASPECT_MAX = 1.6, 7.0
MAX_TILT_DEG = 28.0
AREA_MIN_PCT, AREA_MAX_PCT = 0.02, 5.0
MIN_SIDE_PX = 18


def flatten(path):
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return None
    if img.ndim == 3 and img.shape[2] == 4:
        a = img[:, :, 3:4].astype(np.float32) / 255.0
        img = (img[:, :, :3].astype(np.float32) * a + 255 * (1 - a)).astype(np.uint8)
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img


def geometry_ok(quad, frame_shape):
    """Is this shape a advertising board, or did RANSAC find a pattern in a crowd?"""
    pts = quad.astype(np.float32)
    if not cv2.isContourConvex(pts):
        return False, "not convex"

    def side(a, b):
        return float(np.hypot(*(pts[b] - pts[a])))

    top, bottom = side(0, 1), side(3, 2)
    left, right = side(0, 3), side(1, 2)
    if min(top, bottom, left, right) < MIN_SIDE_PX:
        return False, "too small"

    width = (top + bottom) / 2.0
    height = (left + right) / 2.0
    if height <= 0:
        return False, "degenerate"
    aspect = width / height
    if not (ASPECT_MIN <= aspect <= ASPECT_MAX):
        return False, f"aspect {aspect:.1f}"

    # Boards sit level. A wildly tilted quad is a coincidence, not a hoarding.
    dx, dy = pts[1] - pts[0]
    tilt = abs(np.degrees(np.arctan2(dy, dx)))
    tilt = min(tilt, 180 - tilt)
    if tilt > MAX_TILT_DEG:
        return False, f"tilt {tilt:.0f}deg"

    area = abs(cv2.contourArea(pts))
    pct = 100.0 * area / (frame_shape[0] * frame_shape[1])
    if not (AREA_MIN_PCT <= pct <= AREA_MAX_PCT):
        return False, f"area {pct:.2f}%"

    # Opposite sides of a real board stay in proportion under perspective.
    if min(top, bottom) / max(top, bottom) < 0.45:
        return False, "skew"
    return True, f"{aspect:.1f}:1"


def search_band(band, y0, ref_kp, ref_des, ref_corners, sift, matcher, frame_shape):
    kp, des = sift.detectAndCompute(band, None)
    if des is None or len(kp) < MIN_INLIERS:
        return []
    alive = np.ones(len(kp), dtype=bool)
    out = []
    for _ in range(MAX_PER_BAND):
        idx = np.flatnonzero(alive)
        if len(idx) < MIN_INLIERS:
            break
        knn = matcher.knnMatch(ref_des, des[idx], k=2)
        good = [m for m, n in (p for p in knn if len(p) == 2)
                if m.distance < RATIO * n.distance]
        if len(good) < MIN_INLIERS:
            break
        src = np.float32([ref_kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([kp[idx[m.trainIdx]].pt for m in good]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if H is None or mask is None:
            break
        inliers = int(mask.sum())
        if inliers < MIN_INLIERS:
            break
        quad = cv2.perspectiveTransform(ref_corners, H).reshape(4, 2)
        quad[:, 1] += y0                                  # back to frame coords
        ok, why = geometry_ok(quad, frame_shape)
        out.append({"quad": quad, "inliers": inliers, "ok": ok, "why": why})
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
    os.makedirs(OUT, exist_ok=True)
    sift = cv2.SIFT_create(nfeatures=6000)
    matcher = cv2.BFMatcher(cv2.NORM_L2)

    refs = {}
    brand = flatten("/home/user/nl-tools/assets/partners/Enterprise.png")
    if brand is not None:
        refs["Enterprise (brand asset)"] = brand
    crop = flatten("ref_enterprise_crop.png")
    if crop is not None:
        refs["Enterprise (footage crop)"] = cv2.resize(
            crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)

    prepped = {}
    for name, r in refs.items():
        kp, des = sift.detectAndCompute(r, None)
        h, w = r.shape[:2]
        prepped[name] = (kp, des,
                         np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2))
        print(f"reference: {name} — {w}x{h}, {len(kp)} features")
    print()

    colours = {"Enterprise (brand asset)": (80, 220, 80),
               "Enterprise (footage crop)": (255, 190, 60)}

    for path in FRAMES:
        frame = cv2.imread(path)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        H, W = gray.shape
        canvas = frame.copy()
        label = os.path.basename(path).replace("Screenshot 2026-08-26 ", "")

        summary = []
        for name, (rkp, rdes, rcorn) in prepped.items():
            raw = []
            bh = int(H * BAND_FRAC)
            for y0 in range(0, max(1, H - bh), max(1, int(H * BAND_STRIDE))):
                raw += search_band(gray[y0:y0 + bh, :], y0, rkp, rdes, rcorn,
                                   sift, matcher, (H, W))
            passed = dedupe([h for h in raw if h["ok"]])
            failed = dedupe([h for h in raw if not h["ok"]])

            for h in failed:
                cv2.polylines(canvas, [h["quad"].astype(np.int32)], True,
                              (60, 60, 235), 2)
            for h in passed:
                q = h["quad"].astype(np.int32)
                cv2.polylines(canvas, [q], True, colours[name], 3)
                x, y = q[:, 0].min(), q[:, 1].min()
                cv2.putText(canvas, f"{name.split('(')[1][:-1]} {h['inliers']}",
                            (x, max(14, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                            colours[name], 2, cv2.LINE_AA)
            summary.append(f"{name.split('(')[1][:-1]}: {len(passed)} kept, "
                           f"{len(failed)} rejected")

        cv2.putText(canvas, label, (14, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (255, 255, 255), 2, cv2.LINE_AA)
        cv2.imwrite(os.path.join(OUT, f"annotated_{label}"), canvas)
        print(f"{label:<12} " + " | ".join(summary))


if __name__ == "__main__":
    main()
