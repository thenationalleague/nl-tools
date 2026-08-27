#!/usr/bin/env python3
"""
Full match, one command, on your own machine. Nothing uploads, nothing downloads.

    python board-exposure-match.py --init --refs refs
    python board-exposure-match.py --video match.mp4 --refs refs ^
           --club "Sutton United" --match "Sutton United v Hartlepool"

Three stages, and the middle one is the only slow part:

  1. ffmpeg pulls two frames a second out of the video.
  2. every frame is searched for every sponsor's artwork, split across cores.
  3. the results become one HTML file you can open, email or publish.

Runtime is roughly (samples x seconds-per-sample / cores). A 90-minute match at
two samples a second with ten reference images is around half an hour on
sixteen cores, and it can be stopped and restarted without redoing stage 1.

Needs: ffmpeg on PATH, and `pip install opencv-python-headless numpy`.
"""
import argparse
import json
import multiprocessing as mp
import os
import re
import shutil
import subprocess
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import board_exposure_core as C            # noqa: E402
import board_exposure_report as R          # noqa: E402

# Frames are inlined as base64, which costs a third again on top of the JPEG, so
# the budget is what keeps a full match inside a page a browser will open. 240 at
# these settings lands around 10 MB with the detections on top.
REPORT_FRAME_W = 680
REPORT_FRAME_Q = 55
DEFAULT_FRAME_BUDGET = 240
SIZE_WARN_MB = 14

REFS_README = """Reference images — this folder is the configuration.

    partners/<Sponsor>/*.png     searched at EVERY ground
    clubs/<Club>/<Sponsor>/*.png searched only when that club is at home

One folder per sponsor. The folder name is the name that appears in the report,
so spell it the way you want it printed. Put as many images inside as you like —
a sponsor with two board designs gets two files, and both roll up under the one
name. More images means more chances to match and a slower run; that trade is
usually worth it.

What makes a good reference:

  · The artwork square-on and cropped tight to the printed area.
  · Nothing in front of it. A player's shoulder across the logo is the single
    most common reason a board is never found.
  · The brand's own logo file works — Enterprise was found at a ground with
    nothing cropped from that ground. Start there, and only crop from footage
    when a sponsor is not being found.
  · Greyscale detail is what matches, not colour. A flat two-colour wordmark
    has fewer features to work with than a detailed one, and will be harder.

--club must match a folder name under clubs/ exactly.
"""


def die(msg):
    sys.exit(f"\n  {msg}\n")


def probe(video, ffprobe):
    """Duration and dimensions. ffprobe if it is there, OpenCV if it is not."""
    if shutil.which(ffprobe):
        try:
            out = subprocess.run(
                [ffprobe, "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height,avg_frame_rate",
                 "-show_entries", "format=duration",
                 "-of", "json", video],
                capture_output=True, text=True, check=True).stdout
            d = json.loads(out)
            if d.get("streams"):
                s = d["streams"][0]
                num, _, den = s.get("avg_frame_rate", "0/1").partition("/")
                return {"w": int(s["width"]), "h": int(s["height"]),
                        "fps": float(num) / float(den) if float(den or 0) else 0.0,
                        "duration": float(d["format"]["duration"])}
        except (subprocess.CalledProcessError, ValueError, KeyError):
            pass                       # fall through to OpenCV rather than stop
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        die(f"could not open {video}. Is it a video file?")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    n = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    info = {"w": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "h": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": fps, "duration": (n / fps) if fps else 0.0}
    cap.release()
    if not info["duration"]:
        die(f"could not read a duration from {video}.")
    return info


def extract_ffmpeg(video, work, fps, ffmpeg, limit):
    """`fps=N` resamples to exactly N a second whatever the source does."""
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-stats", "-y",
           "-i", video, "-vf", f"fps={fps}", "-q:v", "3"]
    if limit:
        cmd += ["-frames:v", str(limit)]
    cmd.append(os.path.join(work, "f%06d.jpg"))
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        die(f"ffmpeg failed (exit {e.returncode}). The video may be a format it cannot read.")
    return 1.0 / fps


def extract_opencv(video, work, fps, limit):
    """
    Fallback when ffmpeg is not installed. Single-threaded and slower, and it
    can only take every Nth frame rather than resample, so the true interval
    comes back from here instead of being assumed.
    """
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        die(f"OpenCV could not open {video}. Install ffmpeg and try again.")
    src = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(src / fps)))
    n = fno = 0
    t0 = time.time()
    while not limit or n < limit:
        ok, frame = cap.read()
        if not ok:
            break
        if fno % step == 0:
            cv2.imwrite(os.path.join(work, f"f{n:06d}.jpg"), frame,
                        [cv2.IMWRITE_JPEG_QUALITY, 92])
            n += 1
            if n % 500 == 0:
                print(f"    {n} frames, {time.time()-t0:.0f}s", flush=True)
        fno += 1
    cap.release()
    return step / src


def extract(video, work, fps, ffmpeg, expected, limit=0, prefer_ffmpeg=True):
    """
    Frames as JPEGs, at the sample rate. Restartable: if the folder already
    holds roughly the right number, it is reused rather than redone.

    Returns (files, interval) — interval in seconds between consecutive samples.
    """
    have = sorted(f for f in os.listdir(work) if f.endswith(".jpg")) if os.path.isdir(work) else []
    stamp = os.path.join(work, "interval.txt")
    want = limit or expected
    if len(have) >= want * 0.97 and os.path.exists(stamp):
        print(f"  reusing {len(have)} frames already in {work}")
        return [os.path.join(work, f) for f in have], float(open(stamp).read())

    os.makedirs(work, exist_ok=True)
    for f in have:
        os.remove(os.path.join(work, f))

    free = shutil.disk_usage(work).free
    need = want * 260_000
    use_ffmpeg = prefer_ffmpeg and shutil.which(ffmpeg) is not None
    how = "ffmpeg" if use_ffmpeg else "OpenCV (ffmpeg not on PATH — slower)"
    print(f"  extracting ~{want} frames with {how}")
    print(f"  about {need/1e9:.1f} GB needed, {free/1e9:.1f} GB free")
    if free < need * 1.15:
        die(f"not enough disk: needs about {need/1e9:.1f} GB, {free/1e9:.1f} GB free.\n"
            f"  Point --work at a drive with room, or drop --fps to 1.")

    t0 = time.time()
    interval = (extract_ffmpeg(video, work, fps, ffmpeg, limit) if use_ffmpeg
                else extract_opencv(video, work, fps, limit))
    files = sorted(f for f in os.listdir(work) if f.endswith(".jpg"))
    if not files:
        die("no frames were written.")
    with open(stamp, "w") as f:
        f.write(str(interval))
    print(f"  {len(files)} frames in {time.time()-t0:.0f}s")
    return [os.path.join(work, f) for f in files], interval


# --- worker ------------------------------------------------------------------
# Built once per process. cv2.KeyPoint cannot be pickled, so references are
# rebuilt inside each worker rather than handed across.
_W = {}


def _init_worker(entries, nfeatures):
    cv2.setNumThreads(1)          # OpenCV's own threads fight the process pool
    sift = cv2.SIFT_create(nfeatures=nfeatures)
    refs, _ = C.build_refs(entries, sift)
    _W["sift"], _W["refs"] = sift, refs
    _W["matcher"] = cv2.BFMatcher(cv2.NORM_L2)


def _scan(job):
    i, path = job
    frame = cv2.imread(path, cv2.IMREAD_COLOR)
    if frame is None:
        return i, {}
    hits = C.detect(frame, _W["refs"], _W["sift"], _W["matcher"])
    out = {}
    for name, hs in hits.items():
        out[name] = [{
            "scope": h["scope"],
            "quad": [[float(x), float(y)] for x, y in h["quad"]],
            "board": (list(map(int, h["board"])) if h["board"] else None),
            "logo_area": float(h["logo_area"]),
            "area": float(h["area"]),
            "inliers": int(h["inliers"]),
            "clarity": float(h["clarity"]),
        } for h in hs]
    return i, out


def stills(video, n, out):
    """
    Full-size frames spread across the match, to crop reference boards from.

    Scrubbing a two-hour file for a clean, unobstructed look at each hoarding is
    the slowest part of setting a ground up, so take the sharpest frame from
    each of N windows instead — sharp because a board mid-pan is unusable as a
    reference however well it is cropped.
    """
    os.makedirs(out, exist_ok=True)
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        die(f"could not open {video}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    if total < n:
        die(f"{video} has only {total} frames")
    window = total // n
    written = 0
    for w in range(n):
        best, best_var = None, -1.0
        for k in range(6):                    # sample six, keep the sharpest
            cap.set(cv2.CAP_PROP_POS_FRAMES, w * window + k * (window // 7))
            ok, frame = cap.read()
            if not ok:
                continue
            v = cv2.Laplacian(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY),
                              cv2.CV_64F).var()
            if v > best_var:
                best, best_var = frame, v
        if best is None:
            continue
        t = w * window / fps
        cv2.imwrite(os.path.join(out, f"t{int(t//60):03d}m{int(t%60):02d}s.jpg"),
                    best, [cv2.IMWRITE_JPEG_QUALITY, 96])
        written += 1
    cap.release()
    print(f"\n  {written} stills in {out}/, named by their time in the match.\n")
    print("  Crop each board square-on and tight to the printed area, then save into")
    print("  refs/clubs/<Club>/<Sponsor>/. Nothing in front of the artwork — a player")
    print("  across the logo is the commonest reason a board is never found.\n")


def scaffold(root):
    for p in [root, os.path.join(root, "partners"), os.path.join(root, "clubs")]:
        os.makedirs(p, exist_ok=True)
    readme = os.path.join(root, "READ-ME-FIRST.txt")
    with open(readme, "w", encoding="utf-8") as f:
        f.write(REFS_README)
    print(f"\n  Created {root}/\n")
    print("    partners/<Sponsor>/           league-wide, every ground")
    print("    clubs/<Club>/<Sponsor>/       that club's ground only")
    print(f"\n  Rules are in {readme}. Drop images in, then run without --init.\n")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--video")
    ap.add_argument("--refs", default="refs")
    ap.add_argument("--club", default=None, help="folder name under refs/clubs/")
    ap.add_argument("--match", default=None, help="how the fixture is titled on the report")
    ap.add_argument("--out", default=None, help="output basename (default: from --match)")
    ap.add_argument("--work", default=None, help="frame scratch dir (default: <out>-frames)")
    ap.add_argument("--fps", type=float, default=C.SAMPLE_FPS)
    ap.add_argument("--jobs", type=int, default=0, help="0 = all cores but one")
    ap.add_argument("--limit", type=int, default=0, help="stop after N samples — for a quick test")
    ap.add_argument("--frame-budget", type=int, default=DEFAULT_FRAME_BUDGET)
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--ffprobe", default="ffprobe")
    ap.add_argument("--init", action="store_true", help="create the refs folder tree and exit")
    ap.add_argument("--list", action="store_true", help="show references and exit")
    ap.add_argument("--stills", type=int, default=0, metavar="N",
                    help="write N full-size frames spread across the match, to crop boards from")
    a = ap.parse_args()

    if a.init:
        scaffold(a.refs)
        return

    if a.stills:
        if not a.video or not os.path.isfile(a.video):
            die("give me a video: --video match.mp4 --stills 40")
        stills(a.video, a.stills, a.out or "stills")
        return

    if not os.path.isdir(a.refs):
        die(f"no reference folder at {a.refs}. Run with --init first.")

    clubs_dir = os.path.join(a.refs, "clubs")
    known = sorted(os.listdir(clubs_dir)) if os.path.isdir(clubs_dir) else []
    if a.club and a.club not in known:
        die(f"no club folder '{a.club}'.\n  Found: {', '.join(known) or 'none'}")

    entries = C.load_tree(a.refs, a.club)
    if not entries:
        die(f"no reference images under {a.refs}. See {a.refs}/READ-ME-FIRST.txt")

    scope = {}
    for name, _, sc in entries:
        scope.setdefault(name, sc)
    print(f"\n  {len(entries)} reference images, {len(scope)} sponsors")
    sift0 = cv2.SIFT_create(nfeatures=C.NFEATURES)
    usable = 0
    for name, path, sc in entries:
        g = C.flatten(path)
        kp, des = sift0.detectAndCompute(g, None)
        n = 0 if des is None else len(kp)
        mark = "partner" if sc == "partner" else (a.club or "club")
        h, w = g.shape[:2]
        if n < C.MIN_INLIERS:
            print(f"    {name:<24} {mark:<16} {os.path.basename(path):<28} "
                  f"! only {n} features, skipped")
            continue
        usable += 1
        print(f"    {name:<24} {mark:<16} {os.path.basename(path):<28} "
              f"{w}x{h}  {n} features")
    if not usable:
        die("every reference was too plain to match. Use images with more detail.")
    if a.list:
        return

    if not a.video:
        die("give me a video: --video match.mp4")
    if not os.path.isfile(a.video):
        die(f"no file at {a.video}")

    match = a.match or os.path.splitext(os.path.basename(a.video))[0]
    base = a.out or re.sub(r"[^a-z0-9]+", "-", match.lower()).strip("-") or "match"
    work = a.work or f"{base}-frames"

    info = probe(a.video, a.ffprobe)
    print(f"\n  {a.video}: {info['w']}x{info['h']}, {info['fps']:.0f}fps, "
          f"{R.hhmm(info['duration'])}")

    expected = int(info["duration"] * a.fps)
    files, interval = extract(a.video, work, a.fps, a.ffmpeg, expected, a.limit)
    if a.limit:
        files = files[:a.limit]
    n_samples = len(files)
    duration = n_samples * interval if a.limit else info["duration"]

    jobs = a.jobs or max(1, (os.cpu_count() or 2) - 1)
    print(f"\n  scanning {n_samples} samples across {jobs} cores")
    print(f"  {usable} references x {n_samples} frames — this is the slow part\n")
    del sift0

    # "spawn", not the default fork. OpenCV starts its own thread pool the first
    # time it is used, and this process has already used it to list the
    # references. Forking after that hands each child the thread pool's locks
    # without the threads holding them, and every worker deadlocks on its first
    # OpenCV call — silently, at 0% CPU, forever. Windows only ever spawns, so
    # this also makes the two platforms run the same code path.
    hits_by_index, t0, done = {}, time.time(), 0
    with mp.get_context("spawn").Pool(jobs, initializer=_init_worker,
                                      initargs=(entries, C.NFEATURES)) as pool:
        for i, hit in pool.imap_unordered(_scan, list(enumerate(files)), chunksize=4):
            if hit:
                hits_by_index[i] = hit
            done += 1
            # About forty progress lines whatever the length of the run, so a
            # 200-sample test is as legible as a 10,000-sample match.
            if done % max(10, n_samples // 40) == 0 or done == n_samples:
                el = time.time() - t0
                rate = done / el
                eta = (n_samples - done) / rate if rate else 0
                print(f"  {done:>6}/{n_samples}  {rate:5.1f} samples/s  "
                      f"elapsed {R.hhmm(el)}  left {R.hhmm(eta)}  "
                      f"found {len(hits_by_index)}", flush=True)

    scan_secs = time.time() - t0
    print(f"\n  scanned in {R.hhmm(scan_secs)} — {len(hits_by_index)} samples with a detection")

    # Report frames: a spread across the match plus the clearest shot of each
    # sponsor, shrunk to something a page can hold.
    print("  building report")
    small_dir = f"{base}-report-frames"
    os.makedirs(small_dir, exist_ok=True)
    frame_files = {}
    for i in R.choose_frames(hits_by_index, n_samples, a.frame_budget):
        if i >= len(files):
            continue
        img = cv2.imread(files[i], cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        small = cv2.resize(img, (REPORT_FRAME_W, int(REPORT_FRAME_W * h / w)))
        p = os.path.join(small_dir, f"f{i:06d}.jpg")
        cv2.imwrite(p, small, [cv2.IMWRITE_JPEG_QUALITY, REPORT_FRAME_Q])
        frame_files[i] = p

    partners = sorted(n for n, s in scope.items() if s == "partner")
    clubbits = sorted(n for n, s in scope.items() if s == "club")
    sub = (f"Full match, {R.hhmm(duration)}, sampled {a.fps:g} times a second. "
           f"{len(partners)} National League partner mark"
           f"{'s' if len(partners) != 1 else ''} searched for at every camera angle"
           + (f", plus {len(clubbits)} board{'s' if len(clubbits) != 1 else ''} that only "
              f"apply at {a.club}. " if clubbits else ". ")
           + "Pick a sponsor, then scrub the timeline to see what the detector saw.")
    foot = (
        "Measured by this repository&rsquo;s own detector, run on a laptop from a local copy of the "
        "match &mdash; no upload, no third party, no per-match fee. League partner marks came from "
        "each brand&rsquo;s own logo file with nothing cropped from this ground, which is the part "
        "that matters for running it across 72 clubs"
        + (f"; {a.club}&rsquo;s own boards were cropped at their ground and are searched for only "
           f"when they are at home. " if clubbits else ". ")
        + "The numbers are the detector&rsquo;s own and have <strong>not</strong> been checked "
        "against a hand-count, so treat this as the shape of the report rather than as evidence "
        "for a partner. Calibrating it is one afternoon with a stopwatch and one match.")

    meta = {"match": match, "club": a.club, "duration": round(duration, 1),
            "interval": interval, "n_samples": n_samples,
            "video_w": info["w"], "video_h": info["h"],
            "sub": sub, "foot": foot}
    html = f"{base}-report.html"
    payload, size = R.build(html, meta, hits_by_index, frame_files, scope)

    head = {"match": match, "club": a.club, "video": os.path.basename(a.video),
            "duration": duration, "interval": interval, "samples": n_samples,
            "video_w": info["w"], "video_h": info["h"],
            "scan_seconds": round(scan_secs, 1),
            "settings": C.settings(),
            "references": [{"sponsor": n, "scope": s, "file": os.path.basename(p)}
                           for n, p, s in entries],
            "scope": scope,
            # Whether the reference set covered every board at this ground, which
            # only a person can know. Share of voice is meaningless without it —
            # five references at a twenty-board ground make any sponsor's share
            # look enormous. Left null here; the tool asks on upload.
            "reference_set_complete": None}
    with open(f"{base}-data.json", "w", encoding="utf-8") as f:
        json.dump(dict(head, sponsors=payload["stats"]), f, indent=2)

    # Every detection, on its own. The summary above is one reading of this; a
    # partner arguing with a number needs the thing the number came from, and
    # owning it is most of the case for measuring this in-house rather than
    # renting a dashboard that shows a total and nothing under it.
    with open(f"{base}-detections.json", "w", encoding="utf-8") as f:
        json.dump(dict(head, sponsors=payload["stats"], hits=payload["hits"]),
                  f, separators=(",", ":"))

    print(f"\n  {'sponsor':<26}{'on screen':>11}{'share':>8}{'index':>8}"
          f"{'clarity':>9}{'board%':>9}")
    print("  " + "-" * 71)
    for n in sorted(scope, key=lambda n: -(payload["stats"][n]["index"]
                                           if payload["stats"][n] else -1)):
        s = payload["stats"][n]
        if not s:
            print(f"  {n:<26}{'not detected':>11}")
            continue
        print(f"  {n:<26}{R.hhmm(s['seconds']):>11}{s['pct']:>7.1f}%{s['index']:>8.1f}"
              f"{s['clarity']:>9.2f}{s['area']:>8.2f}%")

    if not a.keep_frames:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(small_dir, ignore_errors=True)

    print(f"\n  {html}  ({size/1e6:.1f} MB) — open this in a browser")
    print(f"  {base}-data.json — the numbers on their own")
    print(f"  {base}-detections.json — every detection, for anything else you want to do")
    if size / 1e6 > SIZE_WARN_MB:
        print(f"\n  That page is large enough to be slow to open or email."
              f"\n  Re-run with --frame-budget {int(a.frame_budget * SIZE_WARN_MB / (size/1e6))}"
              f" for a smaller one — it drops embedded frames, not measurements.")
    print()


if __name__ == "__main__":
    mp.freeze_support()
    main()
