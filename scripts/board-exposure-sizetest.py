#!/usr/bin/env python3
"""
Is the detector failing because the boards are SMALL, or because the footage is
SOFT? Those have opposite remedies — a better camera position versus a better
encode — so it is worth separating them rather than guessing.

Method: take the Enterprise brand asset, render it at exactly the pixel size the
real board occupies, and measure it three ways — pristine, then degraded to
imitate a low-bitrate encode, then the genuine crop from the match. If the
pristine render at that size matches fine, size is not the problem and the
footage is. If it fails too, no encode will save it.
"""
import cv2
import numpy as np

BRAND = "/home/user/nl-tools/assets/partners/Enterprise.png"
REAL = "ref_enterprise_crop.png"
BOARD_W, BOARD_H = 129, 44          # measured off the match frame


def flatten(path):
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img.ndim == 3 and img.shape[2] == 4:
        a = img[:, :, 3:4].astype(np.float32) / 255.0
        img = (img[:, :, :3].astype(np.float32) * a + 255 * (1 - a)).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def measure(img, label, sift):
    kp, _ = sift.detectAndCompute(img, None)
    lap = cv2.Laplacian(img, cv2.CV_64F).var()
    print(f"  {label:<38} {img.shape[1]:>5}x{img.shape[0]:<4} "
          f"feat={len(kp) if kp else 0:>4}  sharpness={lap:>8.1f}  "
          f"contrast={img.std():>5.1f}")
    return len(kp) if kp else 0


def jpeg(img, q):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)


def match(ref, target, sift, matcher, ratio=0.8, min_inl=8):
    """Can the full-size reference find this rendition of the same logo?"""
    k1, d1 = sift.detectAndCompute(ref, None)
    k2, d2 = sift.detectAndCompute(target, None)
    if d1 is None or d2 is None or len(k2) < min_inl:
        return 0, 0
    knn = matcher.knnMatch(d1, d2, k=2)
    good = [m for m, n in (p for p in knn if len(p) == 2)
            if m.distance < ratio * n.distance]
    if len(good) < min_inl:
        return len(good), 0
    src = np.float32([k1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    return len(good), (int(mask.sum()) if mask is not None else 0)


def main():
    sift = cv2.SIFT_create(nfeatures=20000)
    matcher = cv2.BFMatcher(cv2.NORM_L2)

    brand = flatten(BRAND)
    real = cv2.imread(REAL, cv2.IMREAD_GRAYSCALE)

    print("\nWhat the detector actually has to work with")
    measure(brand, "brand asset, native", sift)
    measure(real, "real board, cropped from the match", sift)

    print("\nSame logo, rendered at the real board's pixel size")
    small = cv2.resize(brand, (BOARD_W, BOARD_H), interpolation=cv2.INTER_AREA)
    measure(small, "pristine render", sift)
    for q in (70, 45, 25):
        measure(jpeg(small, q), f"then JPEG q={q} (imitating low bitrate)", sift)
    blurred = cv2.GaussianBlur(small, (3, 3), 0.8)
    measure(blurred, "then softened (camera/encode blur)", sift)

    print("\nCan the full-size brand asset find each of those?")
    for label, target in (
        ("pristine render at board size", small),
        ("JPEG q=45 at board size", jpeg(small, 45)),
        ("softened at board size", blurred),
        ("the real board from the match", real),
    ):
        good, inl = match(brand, target, sift, matcher)
        verdict = "MATCH" if inl >= 8 else "fail"
        print(f"  {label:<38} good={good:>4}  inliers={inl:>3}   {verdict}")

    print("\nHow big would the board need to be?")
    for scale in (1, 2, 3, 4, 6, 8):
        w, h = BOARD_W * scale, BOARD_H * scale
        t = cv2.resize(brand, (w, h), interpolation=cv2.INTER_AREA)
        t = jpeg(t, 45)
        good, inl = match(brand, t, sift, matcher)
        pct = 100.0 * (w * h) / (1920 * 1080)
        verdict = "MATCH" if inl >= 8 else "fail"
        print(f"  {scale}x → {w:>4}x{h:<4} ({pct:>5.2f}% of a 1080p frame)  "
              f"good={good:>4} inliers={inl:>3}   {verdict}")


if __name__ == "__main__":
    main()
