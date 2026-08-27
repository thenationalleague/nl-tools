#!/usr/bin/env python3
"""
Second pass over the clip: same detection, but keep everything the report needs
— per-sample timestamps, the quad corners of every board found, and a JPEG of
each sampled frame small enough to embed in a page.
"""
import base64
import io
import json
import os
import time

import cv2
import numpy as np

import run_match as R

VIDEO = "match.mp4"
FRAME_DIR = "report_frames"
FRAME_W = 760
JPEG_Q = 62
SAMPLE_EVERY = 2          # keep every Nth sample as a frame, plus all detections
REF_ROOT = "refs"
CLUB = "Sutton United"     # whose home ground this is — decides the club folder


def main():
    os.makedirs(FRAME_DIR, exist_ok=True)
    sift = cv2.SIFT_create(nfeatures=6000)
    matcher = cv2.BFMatcher(cv2.NORM_L2)

    entries = R.load_tree(REF_ROOT, CLUB)
    refs = []                       # (sponsor, kp, des, corners, wh) — many per sponsor
    for sponsor, path in entries:
        g = R.flatten(path)
        kp, des = sift.detectAndCompute(g, None)
        if des is None or len(kp) < R.MIN_INLIERS:
            print(f"  ! too few features, skipped: {path}")
            continue
        h, w = g.shape[:2]
        refs.append((sponsor, kp, des,
                     np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2),
                     (w, h)))
        print(f"  · {sponsor:<24} {os.path.basename(path):<34} {len(kp):>4} features")
    sponsors = sorted({s for s, _ in entries})

    cap = cv2.VideoCapture(VIDEO)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(src_fps / R.SAMPLE_FPS)))
    interval = step / src_fps

    samples = []
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
            found = {}
            if des_f is not None and len(kp_f) >= R.MIN_INLIERS:
                ys = np.array([k.pt[1] for k in kp_f])
                bh = H * R.BAND_FRAC
                found_by = {}
                for name, kp_r, des_r, corners, ref_wh in refs:
                    hits = found_by.setdefault(name, [])
                    for y0 in np.arange(0, H - bh, H * R.BAND_STRIDE):
                        sel = np.flatnonzero((ys >= y0) & (ys < y0 + bh))
                        if len(sel) < R.MIN_INLIERS:
                            continue
                        alive = np.ones(len(sel), bool)
                        for _ in range(R.MAX_PER_BAND):
                            idx = sel[alive]
                            if len(idx) < R.MIN_INLIERS:
                                break
                            knn = matcher.knnMatch(des_r, des_f[idx], k=2)
                            good = [m for m, n2 in (p for p in knn if len(p) == 2)
                                    if m.distance < R.RATIO * n2.distance]
                            if len(good) < R.MIN_INLIERS:
                                break
                            src = np.float32([kp_r[m.queryIdx].pt
                                              for m in good]).reshape(-1, 1, 2)
                            dst = np.float32([kp_f[idx[m.trainIdx]].pt
                                              for m in good]).reshape(-1, 1, 2)
                            Hm, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
                            if Hm is None or mask is None or int(mask.sum()) < R.MIN_INLIERS:
                                break
                            quad = cv2.perspectiveTransform(corners, Hm).reshape(4, 2)
                            if R.geometry_ok(quad, shape) and R.on_the_perimeter(frame, quad):
                                sh, ct = R.quality(gray, quad, ref_wh)
                                a = 100.0 * abs(cv2.contourArea(
                                    quad.astype(np.float32))) / (H * W)
                                board = R.grow_to_board(frame, quad)
                                ba = a
                                if board:
                                    bx0, by0, bx1, by1 = board
                                    ba = 100.0 * (bx1 - bx0) * (by1 - by0) / (H * W)
                                hits.append({"quad": quad, "area": a, "board": board,
                                             "board_area": ba, "inl": int(mask.sum()),
                                             "clarity": R.clarity(ba, sh, ct, 0.1),
                                             "sharp": sh, "contrast": ct})
                            used = [np.flatnonzero(sel == idx[m.trainIdx])[0]
                                    for m, k in zip(good, mask.ravel()) if k]
                            alive[used] = False
                for name, hits in found_by.items():
                    kept = []
                    for h_ in sorted(hits, key=lambda d: -d["inl"]):
                        c = h_["quad"].mean(axis=0)
                        if any(np.hypot(*(c - k["quad"].mean(axis=0))) < 45 for k in kept):
                            continue
                        kept.append(h_)
                    if kept:
                        found[name] = kept

            keep_frame = bool(found) or (sno % SAMPLE_EVERY == 0)
            fname = None
            if keep_frame:
                small = cv2.resize(frame, (FRAME_W, int(FRAME_W * H / W)))
                fname = f"f{sno:05d}.jpg"
                cv2.imwrite(os.path.join(FRAME_DIR, fname), small,
                            [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])

            samples.append({
                "i": sno,
                "t": round(sno * interval, 2),
                "frame": fname,
                "hits": {n: [{"quad": [[round(float(x), 1), round(float(y), 1)]
                                       for x, y in k["quad"]],
                              "clarity": round(k["clarity"], 3),
                              "area": round(k["board_area"], 3),
                              "logo_area": round(k["area"], 3),
                              "board": k["board"],
                              "inliers": k["inl"]} for k in v]
                         for n, v in found.items()},
            })
            sno += 1
            if sno % 50 == 0:
                print(f"  … {sno} samples, {time.time()-t0:.0f}s", flush=True)
        fno += 1
    cap.release()

    json.dump({"video_w": shape[1], "video_h": shape[0], "frame_w": FRAME_W,
               "interval": interval, "duration": round(fno / src_fps, 2),
               "samples": samples,
               "sponsors": sponsors},
              open("report_data.json", "w"))
    kept = sum(1 for s in samples if s["frame"])
    det = sum(1 for s in samples if s["hits"])
    print(f"\n{sno} samples, {det} with detections, {kept} frames written")
    print(f"frames dir: {sum(os.path.getsize(os.path.join(FRAME_DIR,f)) for f in os.listdir(FRAME_DIR))/1e6:.1f} MB")


if __name__ == "__main__":
    main()
