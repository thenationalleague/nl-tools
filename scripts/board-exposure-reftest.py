#!/usr/bin/env python3
"""
Two questions, answered against real Sutton frames:

  1. Does the reference have to be cropped from footage, or will the brand's own
     logo file do? The answer decides whether a reference library is 1,800 crops
     someone makes at 72 grounds, or 1,800 files the sponsors already own.
  2. Does multi-instance detection find every board, or only the best one?
"""
import glob
import os
import cv2
import numpy as np

FRAMES = sorted(glob.glob("sutton/Sutton pics/*.png"))
UPSCALE = 4.0          # small references need help
MIN_INLIERS = 8
RATIO = 0.78
MAX_INSTANCES = 12     # per sponsor per frame


def prep(img, upscale=UPSCALE):
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if upscale != 1.0:
        img = cv2.resize(img, None, fx=upscale, fy=upscale,
                         interpolation=cv2.INTER_CUBIC)
    return img


def find_all(frame_gray, ref_gray, sift, matcher):
    """Detect every instance: match, record, mask the winner, repeat."""
    kp_r, des_r = sift.detectAndCompute(ref_gray, None)
    if des_r is None:
        return [], 0
    h, w = ref_gray.shape[:2]
    corners = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)

    kp_f, des_f = sift.detectAndCompute(frame_gray, None)
    if des_f is None:
        return [], len(kp_r)

    # Work on a mutable copy of the frame keypoint set so found boards can be
    # struck out and the search run again for the next instance.
    alive = np.ones(len(kp_f), dtype=bool)
    found = []

    for _ in range(MAX_INSTANCES):
        idx = np.flatnonzero(alive)
        if len(idx) < MIN_INLIERS:
            break
        sub = des_f[idx]
        knn = matcher.knnMatch(des_r, sub, k=2)
        good = [m for m, n in (p for p in knn if len(p) == 2)
                if m.distance < RATIO * n.distance]
        if len(good) < MIN_INLIERS:
            break
        src = np.float32([kp_r[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([kp_f[idx[m.trainIdx]].pt for m in good]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 6.0)
        if H is None or mask is None or int(mask.sum()) < MIN_INLIERS:
            break
        inliers = int(mask.sum())
        quad = cv2.perspectiveTransform(corners, H).reshape(4, 2)
        area = abs(cv2.contourArea(quad.astype(np.float32)))
        fa = frame_gray.shape[0] * frame_gray.shape[1]
        ok = cv2.isContourConvex(quad.astype(np.float32)) and fa * 2e-5 < area < fa * 0.5
        if ok:
            found.append({
                "inliers": inliers,
                "confidence": inliers / len(good),
                "area_pct": 100 * area / fa,
                "quad": quad,
            })
        # Strike out the frame keypoints this match consumed, then look again.
        used = [idx[m.trainIdx] for m, keep in zip(good, mask.ravel()) if keep]
        alive[used] = False
        if not ok:
            break
    return found, len(kp_r)


def main():
    sift = cv2.SIFT_create(nfeatures=8000)
    matcher = cv2.BFMatcher(cv2.NORM_L2)

    refs = {}
    crop = cv2.imread("ref_enterprise_crop.png")
    if crop is not None:
        refs["footage-crop"] = prep(crop)
    brand = cv2.imread("/home/user/nl-tools/assets/partners/Enterprise.png",
                       cv2.IMREAD_UNCHANGED)
    if brand is not None:
        # Brand assets are transparent PNGs; flatten onto white or the alpha
        # fringe becomes the strongest edge in the image.
        if brand.ndim == 3 and brand.shape[2] == 4:
            a = brand[:, :, 3:4].astype(np.float32) / 255.0
            rgb = brand[:, :, :3].astype(np.float32)
            brand = (rgb * a + 255 * (1 - a)).astype(np.uint8)
        refs["brand-asset"] = prep(brand, upscale=1.0)

    for name, r in refs.items():
        k, _ = sift.detectAndCompute(r, None)
        print(f"reference {name:<14} {r.shape[1]}x{r.shape[0]}  "
              f"{len(k) if k else 0} SIFT features")
    print()

    for path in FRAMES:
        frame = cv2.imread(path)
        fg = prep(frame, upscale=1.0)
        label = os.path.basename(path).replace("Screenshot 2026-08-26 ", "")
        line = [f"{label:<12}"]
        for name, r in refs.items():
            hits, _ = find_all(fg, r, sift, matcher)
            if hits:
                areas = ",".join(f"{h['area_pct']:.2f}%" for h in hits)
                line.append(f"{name}: {len(hits)} hit(s) [{areas}]")
            else:
                line.append(f"{name}: —")
        print("  ".join(line))


if __name__ == "__main__":
    main()
