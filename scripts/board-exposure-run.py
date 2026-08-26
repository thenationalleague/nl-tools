#!/usr/bin/env python3
"""
Run the board detector over a real clip, for the two National League partners.

Keeps the band-restricted search and geometry validation that made the still
frames work, but detects SIFT features on each frame ONCE and slices the
keypoints by band afterwards — re-running the detector per band was costing
thirteen times more than it needed to.
"""
import json
import sys
import time

import cv2
import numpy as np

VIDEO = "match.mp4"
SAMPLE_FPS = 2.0
REFS = {
    "Enterprise": "/home/user/nl-tools/assets/partners/Enterprise.png",
    "TIC Health": "/home/user/nl-tools/assets/partners/TIC Health.png",
}

BAND_FRAC, BAND_STRIDE = 0.22, 0.055
RATIO, MIN_INLIERS, MAX_PER_BAND = 0.80, 9, 6
ASPECT = (1.6, 7.0)
MAX_TILT = 28.0
AREA_PCT = (0.02, 5.0)
MIN_SIDE = 18
MIN_RUN, BRIDGE = 2, 2
GRID = (18, 32)


def flatten(path):
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        sys.exit(f"cannot read {path}")
    if img.ndim == 3 and img.shape[2] == 4:
        a = img[:, :, 3:4].astype(np.float32) / 255.0
        img = (img[:, :, :3].astype(np.float32) * a + 255 * (1 - a)).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img


def geometry_ok(q, shape):
    p = q.astype(np.float32)
    if not cv2.isContourConvex(p):
        return False
    s = lambda a, b: float(np.hypot(*(p[b] - p[a])))
    top, bot, left, right = s(0, 1), s(3, 2), s(0, 3), s(1, 2)
    if min(top, bot, left, right) < MIN_SIDE:
        return False
    h = (left + right) / 2.0
    if h <= 0 or not (ASPECT[0] <= ((top + bot) / 2.0) / h <= ASPECT[1]):
        return False
    dx, dy = p[1] - p[0]
    tilt = abs(np.degrees(np.arctan2(dy, dx)))
    if min(tilt, 180 - tilt) > MAX_TILT:
        return False
    pct = 100.0 * abs(cv2.contourArea(p)) / (shape[0] * shape[1])
    if not (AREA_PCT[0] <= pct <= AREA_PCT[1]):
        return False
    return min(top, bot) / max(top, bot) >= 0.45


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


def quality(gray, quad, ref_wh):
    w, h = max(int(ref_wh[0]), 32), max(int(ref_wh[1]), 32)
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
    try:
        M = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
        crop = cv2.warpPerspective(gray, M, (w, h))
    except cv2.error:
        return 0.0, 0.0
    if crop.size == 0:
        return 0.0, 0.0
    return float(cv2.Laplacian(crop, cv2.CV_64F).var()), float(crop.std())


def clarity(area_pct, sharp, contrast, skew):
    # Recalibrated for real footage: boards run 0.1-0.6% of frame here, not the
    # 2% the synthetic clip produced, so the size term saturates far sooner.
    return float(np.clip(0.40 * min(1.0, area_pct / 0.6)
                         + 0.25 * min(1.0, sharp / 300.0)
                         + 0.20 * min(1.0, contrast / 60.0)
                         + 0.15 * (1.0 - skew), 0.0, 1.0))


def main():
    sift = cv2.SIFT_create(nfeatures=6000)
    matcher = cv2.BFMatcher(cv2.NORM_L2)

    refs = {}
    for name, path in REFS.items():
        g = flatten(path)
        kp, des = sift.detectAndCompute(g, None)
        h, w = g.shape[:2]
        refs[name] = (kp, des,
                      np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2),
                      (w, h))
        print(f"reference {name:<12} {w}x{h}  {len(kp)} features")

    cap = cv2.VideoCapture(VIDEO)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(src_fps / SAMPLE_FPS)))
    interval = step / src_fps
    print(f"\nsampling every {step} frames ({SAMPLE_FPS}/s)\n")

    hits = {n: {} for n in refs}
    heat = {n: np.zeros(GRID) for n in refs}
    fno = sno = 0
    t0 = time.time()
    shape = None

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if fno % step == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            shape = gray.shape
            H, W = shape
            kp_f, des_f = sift.detectAndCompute(gray, None)
            if des_f is not None and len(kp_f) >= MIN_INLIERS:
                ys = np.array([k.pt[1] for k in kp_f])
                bh = H * BAND_FRAC
                for name, (kp_r, des_r, corners, ref_wh) in refs.items():
                    found = []
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
                            src = np.float32([kp_r[m.queryIdx].pt
                                              for m in good]).reshape(-1, 1, 2)
                            dst = np.float32([kp_f[idx[m.trainIdx]].pt
                                              for m in good]).reshape(-1, 1, 2)
                            Hm, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
                            if Hm is None or mask is None or int(mask.sum()) < MIN_INLIERS:
                                break
                            quad = cv2.perspectiveTransform(corners, Hm).reshape(4, 2)
                            if geometry_ok(quad, shape) and on_the_perimeter(frame, quad):
                                sh, ct = quality(gray, quad, ref_wh)
                                a = 100.0 * abs(cv2.contourArea(
                                    quad.astype(np.float32))) / (H * W)
                                found.append({"area": a, "clarity": clarity(a, sh, ct, 0.1),
                                              "inl": int(mask.sum()),
                                              "c": quad.mean(axis=0)})
                            used = [np.flatnonzero(sel == idx[m.trainIdx])[0]
                                    for m, k in zip(good, mask.ravel()) if k]
                            alive[used] = False
                    # bands overlap, so the same board turns up more than once
                    kept = []
                    for h_ in sorted(found, key=lambda d: -d["inl"]):
                        if any(np.hypot(*(h_["c"] - k["c"])) < 45 for k in kept):
                            continue
                        kept.append(h_)
                    if kept:
                        hits[name][sno] = kept
                        for k in kept:
                            r = int(np.clip(k["c"][1] / H * GRID[0], 0, GRID[0] - 1))
                            c = int(np.clip(k["c"][0] / W * GRID[1], 0, GRID[1] - 1))
                            heat[name][r, c] += k["clarity"]
            sno += 1
            if sno % 50 == 0:
                print(f"  … {sno} samples, {time.time()-t0:.0f}s")
        fno += 1
    cap.release()

    out = {"video": VIDEO, "samples": sno, "seconds": round(fno / src_fps, 1),
           "sampled_fps": SAMPLE_FPS, "sponsors": {}}
    print(f"\n{'sponsor':<14}{'samples':>9}{'secs':>8}{'index':>9}"
          f"{'clarity':>9}{'area%':>8}{'boards':>8}")
    print("-" * 65)
    for name in refs:
        s = hits[name]
        if not s:
            print(f"{name:<14}{'—':>9}")
            out["sponsors"][name] = {"detected_samples": 0}
            continue
        idxs = sorted(s)
        runs, cur = [], [idxs[0]]
        for i in idxs[1:]:
            if i - cur[-1] <= BRIDGE + 1:
                cur.append(i)
            else:
                runs.append(cur)
                cur = [i]          # a fresh list — clearing the stored one empties it too
        runs.append(cur)
        runs = [r for r in runs if len(r) >= MIN_RUN]
        flat = [k for i in idxs for k in s[i]]
        secs = sum((r[-1] - r[0] + 1) * interval for r in runs)
        idx_score = sum((r[-1] - r[0] + 1) * interval
                        * np.mean([k["clarity"] for i in r for k in s[i]]) for r in runs)
        out["sponsors"][name] = {
            "detected_samples": len(s), "runs": len(runs),
            "seconds_on_screen": round(secs, 1),
            "exposure_index": round(float(idx_score), 1),
            "mean_clarity": round(float(np.mean([k["clarity"] for k in flat])), 3),
            "mean_area_pct": round(float(np.mean([k["area"] for k in flat])), 3),
            "max_boards_in_one_frame": max(len(v) for v in s.values()),
            "heatmap": np.round(heat[name], 2).tolist(),
        }
        r = out["sponsors"][name]
        print(f"{name:<14}{len(s):>9}{r['seconds_on_screen']:>8.1f}"
              f"{r['exposure_index']:>9.1f}{r['mean_clarity']:>9.3f}"
              f"{r['mean_area_pct']:>8.3f}{r['max_boards_in_one_frame']:>8}")

    json.dump(out, open("match_result.json", "w"), indent=2)
    print(f"\n{sno} samples over {out['seconds']}s in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
