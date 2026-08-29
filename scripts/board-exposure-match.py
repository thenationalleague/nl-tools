#!/usr/bin/env python3
"""
Full match, on your own machine. Nothing uploads, nothing downloads.

    python board-exposure-match.py --init --refs refs

Then drop videos in inbox/ and:

    python board-exposure-match.py --batch inbox --refs refs

It reads the fixture off each filename if it can, shows you what it read, and
lets you correct it — every file up front, so the measuring itself runs
unattended. Naming a file after its fixture just means pressing Enter:

    2026-08-23 Sutton United v Hartlepool United.mp4

The home club decides which reference folder joins the league partner marks,
which is why it is confirmed rather than assumed: the wrong ground silently
drops every local board and still prints a table that looks fine.

`-y` skips the questions and takes the filename as read, for unattended runs.

On Windows, measure-matches.bat does the same thing by being double-clicked, or
by having videos dragged onto it. One match at a time still works:

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
from board_exposure_eval import parse_clock as _parse_clock  # noqa: E402

# Frames are inlined as base64, which costs a third again on top of the JPEG, so
# the budget is what keeps a full match inside a page a browser will open. 240 at
# these settings lands around 10 MB with the detections on top.
REPORT_FRAME_W = 680
REPORT_FRAME_Q = 55
DEFAULT_FRAME_BUDGET = 240
SIZE_WARN_MB = 14
PROGRESS_EVERY = 3.0        # seconds between progress updates
# Playback only, never measurement. 640px wide keeps a 105-minute match around
# 150 MB, which uploads in under a minute and streams without buffering.
PROXY_W = 640
PROXY_CRF = 30
_ARGS = None                # parsed args, for the non-interactive confirm path
# Counted rather than raised, so a batch measures every video it was given and
# still exits non-zero. "The job succeeded" must not mean "some of the matches
# arrived" — the first cloud run exited clean having uploaded nothing.
_UPLOAD_FAILURES = 0

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


def make_proxy(video, out, ffmpeg, start=None, end=None):
    """
    A small, seekable copy of the match for playing back inside the tool.

    Not for measuring — at this size a hoarding is about thirty pixels wide and
    the detector would find nothing. The boxes come from the full-resolution
    scan and are drawn over the top, so the proxy only has to be good enough to
    recognise a board when one is outlined for you.

    +faststart is the load-bearing flag: it moves the index to the front of the
    file so a browser can seek without downloading all of it first.
    """
    # -stats only on a terminal. It writes a progress line a second, which is a
    # progress bar locally and a thousand log entries in Cloud Run — enough to
    # bury the one line that says whether the upload worked.
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    if sys.stdout.isatty():
        cmd.insert(-1, "-stats")
    if start:
        cmd += ["-ss", str(start)]
    if end:
        cmd += ["-to", str(end)] if not start else ["-t", str(end - start)]
    cmd += ["-i", video,
            "-vf", f"scale={PROXY_W}:-2",
            "-c:v", "libx264", "-crf", str(PROXY_CRF), "-preset", "veryfast",
            "-an",                       # nobody needs the commentary to see a board
            "-movflags", "+faststart",
            out]
    t0 = time.time()
    try:
        subprocess.run(cmd, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  ! could not build the proxy video ({e}). The match is still "
              f"measured; the tool will fall back to stills.")
        return None
    mb = os.path.getsize(out) / 1e6 if os.path.exists(out) else 0
    print(f"  proxy: {os.path.basename(out)}  {mb:.0f} MB in {time.time()-t0:.0f}s")
    return out


def push_to_tool(a, base, head, stats, club, title, date, proxy, duration, complete):
    """
    Put the finished match into NL Tools, so nobody has to open a browser and
    upload three files that this machine is already holding.

    Never raises, but DOES report: returns True on success, False otherwise.
    The scan is the expensive part and it is done, so a network blip here must
    leave the files on disk and say so rather than throw away half an hour of
    CPU. But "the job exited zero" and "the match arrived" have to stop being
    the same thing — the first cloud run reported success while uploading
    nothing, and it took four log queries to find out otherwise.
    """
    import board_exposure_upload as U

    opponent = ""
    m = re.match(r"^(.+?)\s+vs?\.?\s+(.+)$", str(title or ""), re.I)
    if m:
        opponent = m.group(2).strip()

    if not (date and club and opponent):
        print("\n  ! NOT UPLOADED: needs a date, a home club and an opponent, and "
              "this run has "
              + ", ".join(n for n, v in (("no date", not date), ("no club", not club),
                                         ("no opponent", not opponent)) if v) + ".")
        return False

    match_id = U.match_id_for(date, club, opponent)
    # The tool guesses the same way from the same field, so the two agree
    # without either asking. Anyone who disagrees can change it in the tool.
    source_type = "full" if (duration or 0) > 45 * 60 else "highlights"

    files = [(f"{base}-detections.json", "detections.json")]
    if proxy and os.path.exists(proxy):
        files.append((proxy, "proxy.mp4"))

    print(f"\n  Uploading to nl.tools as {match_id} …")
    try:
        key = U.read_key(a.refs)
        uid, token = U.sign_in_anonymously()
        grant = U.request_grant(
            uid, token, key, match_id,
            on_wait=lambda s: print(f"    still waiting on the ingest function ({int(s)}s)…"))
        token = U.sign_in_with_custom_token(grant["customToken"])

        for path, name in files:
            mb = os.path.getsize(path) / 1e6
            print(f"    {name} ({mb:.0f} MB)…")
            U.put_file(path, f"brand-exposure/{match_id}/{name}", token,
                       on_progress=lambda d, sz, secs: print(
                           f"      done in {secs:.0f}s ({sz/1e6/max(secs, .1):.0f} MB/s)"))

        rec = U.build_record(
            dict(head, sponsors=stats), club, opponent, date, source_type,
            complete, has_proxy=any(n == "proxy.mp4" for _, n in files),
            has_detections=True)
        U.write_record(match_id, rec, token)

        print(f"  UPLOADED: {match_id} -> https://nl.tools/brand-exposure/")
        if complete is None:
            print("    note: reference-set completeness was not recorded, so share "
                  "of voice stays withheld until someone sets it in the tool.")
        return True
    except U.UploadError as e:
        print(f"\n  ! NOT UPLOADED: {e}")
        print("    The measurement is fine and the files are listed below — "
              "upload them by hand at https://nl.tools/brand-exposure/.")
        return False
    except Exception as e:                                   # noqa: BLE001
        # Traceback, not just the message. The one that actually happened was a
        # KeyError whose name meant nothing without the line it came from.
        import traceback
        print(f"\n  ! NOT UPLOADED: unexpected {e.__class__.__name__}: {e}")
        traceback.print_exc()
        print("    The files are listed below — upload them by hand.")
        return False


def parse_clock(s):
    """'1:52:30', '18:30' or '1110' -> seconds. None passes through.

    The parsing itself lives in board_exposure_eval (the one cv2-free module,
    so the eval can run anywhere) — this wrapper only keeps the CLI habit of
    dying with a sentence instead of raising.
    """
    import board_exposure_eval as E
    try:
        return _parse_clock(s)
    except E.LabelError as e:
        die(str(e))


def extract_ffmpeg(video, work, fps, ffmpeg, limit, start=None, end=None):
    """`fps=N` resamples to exactly N a second whatever the source does."""
    # -stats only on a terminal. It writes a progress line a second, which is a
    # progress bar locally and a thousand log entries in Cloud Run — enough to
    # bury the one line that says whether the upload worked.
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    if sys.stdout.isatty():
        cmd.insert(-1, "-stats")
    # -ss before -i is the fast seek: it jumps by keyframe rather than decoding
    # everything it is skipping. A second or two of imprecision at kick-off is
    # irrelevant here and it saves decoding the entire build-up.
    if start:
        cmd += ["-ss", str(start)]
    if end:
        cmd += ["-to", str(end)] if not start else ["-t", str(end - start)]
    cmd += ["-i", video, "-vf", f"fps={fps}", "-q:v", "3"]
    if limit:
        cmd += ["-frames:v", str(limit)]
    cmd.append(os.path.join(work, "f%06d.jpg"))
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        die(f"ffmpeg failed (exit {e.returncode}). The video may be a format it cannot read.")
    return 1.0 / fps


def extract_opencv(video, work, fps, limit, start=None, end=None):
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
    if start:
        cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000.0)
    span = (end - (start or 0)) if end else None
    n = fno = 0
    t0 = time.time()
    while not limit or n < limit:
        if span is not None and (fno / src) >= span:
            break
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


def extract(video, work, fps, ffmpeg, expected, limit=0, prefer_ffmpeg=True,
            start=None, end=None):
    """
    Frames as JPEGs, at the sample rate. Restartable: if the folder already
    holds roughly the right number, it is reused rather than redone.

    Returns (files, interval) — interval in seconds between consecutive samples.
    """
    have = sorted(f for f in os.listdir(work) if f.endswith(".jpg")) if os.path.isdir(work) else []
    stamp = os.path.join(work, "interval.txt")
    want = limit or expected
    key = f"{1.0 / fps}|{start or 0}|{end or 0}"
    if len(have) >= want * 0.97 and os.path.exists(stamp):
        prev = open(stamp).read().strip()
        if prev.split("|")[0] == key.split("|")[0] and prev == key:
            print(f"  reusing {len(have)} frames already in {work}")
            return [os.path.join(work, f) for f in have], 1.0 / fps
        print("  frames on disk cover a different window — re-extracting")

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
    interval = (extract_ffmpeg(video, work, fps, ffmpeg, limit, start, end) if use_ffmpeg
                else extract_opencv(video, work, fps, limit, start, end))
    files = sorted(f for f in os.listdir(work) if f.endswith(".jpg"))
    if not files:
        die("no frames were written.")
    with open(stamp, "w") as f:
        f.write(f"{interval}|{start or 0}|{end or 0}")
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
            "visibility": (None if h.get("visibility") is None
                           else round(float(h["visibility"]), 3)),
        } for h in hs]
    return i, out


def _synth_hit(scope, bbox, gray, corr):
    """A hit shaped exactly like _scan's, minted from a tracked box.

    Honest about what it is: inliers 0 (SIFT found nothing here), tracked True,
    the correlation recorded, and clarity measured on the actual blurred frame —
    so a board tracked through a pan counts its seconds while its low sharpness
    keeps the exposure index truthful about how readable it was.
    """
    x0, y0, x1, y1 = bbox
    quad = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    H, W = gray.shape[:2]
    logo_pct = 100.0 * max(0.0, x1 - x0) * max(0.0, y1 - y0) / (H * W)
    sh, ct = C.quality(gray, quad, (x1 - x0, y1 - y0))
    return {
        "scope": scope,
        "quad": [[float(x), float(y)] for x, y in quad],
        "board": None,
        "logo_area": float(logo_pct),
        "area": float(logo_pct),
        "inliers": 0,
        "clarity": float(C.clarity(logo_pct, sh, ct, 0.1)),
        "tracked": True,
        "corr": round(float(corr), 3),
        # No homography, no rectified face — a tracked hit cannot measure how
        # covered the board was, and null must never become a faked number.
        "visibility": None,
    }


def _track_gap(name, a, b, hits_by_index, files):
    """
    Chain the board's patch across the gap between detections at a and b —
    forward from a and backward from b, so the most-blurred frame in the middle
    only has to be reached from its less-blurred neighbour. All or nothing: if
    any frame in the gap cannot be accounted for from either side, nothing is
    filled, because a frame no chain reaches is exactly what a cut to the crowd
    looks like.
    """
    def anchor(i):
        h = max(hits_by_index[i][name], key=lambda h: h["inliers"])
        xs = [p[0] for p in h["quad"]]
        ys = [p[1] for p in h["quad"]]
        return h["scope"], (min(xs), min(ys), max(xs), max(ys))

    cache = {}

    def frame(i):
        if i not in cache:
            cache[i] = cv2.imread(files[i], cv2.IMREAD_COLOR)
        return cache[i]

    found = {}
    for start, step in ((a, 1), (b, -1)):
        scope, bbox = anchor(start)
        prev = frame(start)
        if prev is None:
            return None
        i = start + step
        while a < i < b and i not in found:
            cur = frame(i)
            if cur is None:
                break
            r = C.find_patch(prev, bbox, cur)
            if not r or r[1] < C.TRACK_MIN_CORR:
                break
            bbox, corr = r
            found[i] = _synth_hit(scope, bbox,
                                  cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY), corr)
            prev = cur
            i += step
    if len(found) != b - a - 1:
        return None
    return sorted(found.items())


def close_blurred_gaps(hits_by_index, files, interval):
    """
    Engine 1.1's recall pass. SIFT loses boards for the length of a camera pan
    because motion blur erases the detail it matches on; the board is still on
    screen, and until now those seconds either leant on the blind 1.5s bridge
    or fragmented the run entirely. This fills a gap of up to
    TRACK_MAX_GAP_SECS between two REAL detections of the same sponsor with
    per-frame tracked evidence — and never extends a run past its last real
    detection, which is what keeps a recall pass from becoming an imagination.
    """
    max_gap = max(1, int(round(C.TRACK_MAX_GAP_SECS / interval)))
    filled, gained = 0, set()
    t0 = time.time()
    for name in sorted({n for h in hits_by_index.values() for n in h}):
        idxs = [i for i, h in hits_by_index.items() if h.get(name)]
        for a, b in C.gap_candidates(idxs, max_gap):
            chain = _track_gap(name, a, b, hits_by_index, files)
            if chain:
                for i, hit in chain:
                    hits_by_index.setdefault(i, {}).setdefault(name, []).append(hit)
                filled += len(chain)
                gained.add(name)
    if filled:
        print(f"  tracking closed blurred gaps: +{filled} samples "
              f"({filled * interval:.1f}s) across {len(gained)} sponsor(s) "
              f"in {time.time() - t0:.0f}s")
    return filled


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


VIDEO_EXT = (".mp4", ".mov", ".mkv", ".m4v", ".ts", ".avi")
FIXTURE_RE = re.compile(
    r"^(?:(\d{4}-\d{2}-\d{2})[ _]+)?(.+?)[ _]+vs?\.?[ _]+(.+)$", re.I)


def parse_fixture(path):
    """
    Read the fixture off the filename, so a batch needs no typing at all.

        2026-08-23 Sutton United v Hartlepool United.mp4
        Sutton United v Hartlepool United.mp4          (no date)

    Returns (date|None, home, away) or None if the name does not say. Guessing
    is not an option here: the home club decides which reference folder joins
    the partner marks, so the wrong name silently drops every local board and
    the run still looks like it worked.
    """
    stem = os.path.splitext(os.path.basename(path))[0]
    m = FIXTURE_RE.match(stem.strip())
    if not m:
        return None
    date, home, away = m.group(1), m.group(2).strip(), m.group(3).strip()
    return (date, home, away) if home and away else None


def ask(prompt):
    """
    input(), but Ctrl-C and a closed stdin end the run with a sentence rather
    than a traceback. Both are ordinary — changing your mind halfway through
    confirming six matches is not an error condition.
    """
    try:
        return input(prompt).strip()
    except EOFError:
        die("stopped: no more input. Nothing was measured.")
    except KeyboardInterrupt:
        die("stopped. Nothing was measured.")


def confirm_fixture(path, clubs, refs_root, assume_yes=False, upload=False):
    """
    Show what was read off the filename and let it be corrected.

    The filename is a good guess, not a contract. Getting the home club wrong
    silently drops every local board and still prints a plausible table, so the
    guess gets shown and accepted rather than trusted — and a name that says
    nothing is a question, not a reason to skip the file.

    Returns {"club", "home", "away", "date"} or None to skip.
    """
    fx = parse_fixture(path)
    date, home, away = fx if fx else (None, "", "")

    def club_note(name):
        if name and name in clubs:
            d = os.path.join(refs_root, "clubs", name)
            n = len([x for x in os.listdir(d) if os.path.isdir(os.path.join(d, x))])
            return f"{n} local board{'s' if n != 1 else ''} + the partner marks"
        if name:
            return "no reference folder — partner marks only"
        return "partner marks only"

    print(f"\n  {os.path.basename(path)}")
    if assume_yes or not sys.stdin.isatty():
        if not fx:
            print("    ! filename does not say the fixture, and there is no one to ask.")
            return None
        print(f"    {home} v {away}   ({date or 'no date'}) — {club_note(home)}")
        return {"club": home if home in clubs else None,
                "home": home, "away": away, "date": date or "",
                "start": parse_clock(getattr(_ARGS, "start", None)),
                "end": parse_clock(getattr(_ARGS, "end", None))}

    while True:
        if home:
            print(f"    Fixture : {home} v {away}")
            print(f"    Ground  : {club_note(home)}")
        else:
            print("    Fixture : not in the filename")
        ans = ask("    Enter to accept, a new fixture as 'Home v Away', "
                  "'?' for grounds, or 's' to skip: ")

        if ans.lower() == "s":
            return None
        if ans == "?":
            print("    Grounds with reference folders:")
            for c in clubs:
                print(f"      · {c}")
            if not clubs:
                print("      (none yet — every match runs on partner marks only)")
            continue
        if ans:
            m = re.match(r"^(.+?)\s+vs?\.?\s+(.+)$", ans, re.I)
            if not m:
                print("    ! write it as 'Sutton United v Hartlepool United'.")
                continue
            home, away = m.group(1).strip(), m.group(2).strip()
            continue
        if not home:
            print("    ! no fixture yet — type one, or 's' to skip this file.")
            continue

        if home not in clubs:
            print(f"    ! no refs/clubs/{home}/ — this match will be measured on the "
                  f"league partner marks only.")
            if ask("      Enter to accept that, or 'n' to correct the name: ").lower() == "n":
                continue

        while not re.match(r"^\d{4}-\d{2}-\d{2}$", date or ""):
            date = ask(f"    Date (YYYY-MM-DD)"
                       f"{' [' + date + ']' if date else ''}: ") or date
            if not date:
                print("    ! needed — it is how the match is filed and deduped.")

        # A stream is rarely just the match. Build-up and warm-up show real
        # boards on real grass, so they are counted as match exposure unless
        # trimmed — and they inflate the denominator every share is divided by.
        print("    Kick-off and full time, if the file has build-up either side.")
        print("    Blank measures the whole file.")
        start = parse_clock(ask("    Kick-off at (e.g. 18:30, blank for none): "))
        end = parse_clock(ask("    Ends at (e.g. 2:05:00, blank for end of file): "))

        # Asked here rather than after the scan so a batch can be set going and
        # left. It is the one fact about the measurement that no amount of
        # looking at the video can establish, and share of voice is a lie
        # without it: five references at a twenty-board ground make every
        # sponsor's share look enormous. The tool asks the same question of
        # anyone uploading by hand, and suppresses the column when the answer
        # is no.
        complete = None
        if upload:
            print("    Did the references cover EVERY board at this ground?")
            complete = ask("    'y' if the set was complete, anything else for partial: "
                           ).strip().lower() in ("y", "yes")

        return {"club": home if home in clubs else None,
                "home": home, "away": away, "date": date,
                "start": start, "end": end, "complete": complete}


def scaffold(root):
    for p in [root, os.path.join(root, "partners"), os.path.join(root, "clubs")]:
        os.makedirs(p, exist_ok=True)
    os.makedirs("inbox", exist_ok=True)
    readme = os.path.join(root, "READ-ME-FIRST.txt")
    with open(readme, "w", encoding="utf-8") as f:
        f.write(REFS_README)
    print(f"\n  Created {root}/ and inbox/\n")
    print(f"    {root}/partners/<Sponsor>/     league-wide, every ground")
    print(f"    {root}/clubs/<Club>/<Sponsor>/ that club's ground only")
    print("    inbox/                        drop match videos here")
    print(f"\n  Reference rules are in {readme}.")
    print("\n  Name each video after the fixture and nothing needs typing:")
    print("    2026-08-23 Sutton United v Hartlepool United.mp4")
    print("\n  Then double-click measure-matches.bat, or drag videos onto it.\n")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--video")
    ap.add_argument("--batch", metavar="FOLDER",
                    help="measure every video in a folder, then move each aside")
    ap.add_argument("--out-dir", default=None,
                    help="where reports land (default: alongside; 'reports' in batch)")
    ap.add_argument("--refs", default="refs")
    ap.add_argument("--club", default=None, help="folder name under refs/clubs/")
    ap.add_argument("--match", default=None, help="how the fixture is titled on the report")
    ap.add_argument("--out", default=None, help="output basename (default: from --match)")
    ap.add_argument("--work", default=None, help="frame scratch dir (default: <out>-frames)")
    ap.add_argument("--fps", type=float, default=C.SAMPLE_FPS)
    ap.add_argument("--start", default=None, metavar="TIME",
                    help="skip to kick-off, e.g. 18:30 — build-up is not match exposure")
    ap.add_argument("--end", default=None, metavar="TIME",
                    help="stop at the final whistle, e.g. 2:05:00")
    ap.add_argument("--date", default=None, metavar="YYYY-MM-DD",
                    help="match date — required with --club/--match for an upload, "
                         "since it is half the match id")
    ap.add_argument("--reference-set", choices=["complete", "partial"], default=None,
                    help="did the references cover EVERY board at this ground? "
                         "Share of voice stays withheld unless this says complete")
    ap.add_argument("--jobs", type=int, default=0, help="0 = all cores but one")
    ap.add_argument("--limit", type=int, default=0, help="stop after N samples — for a quick test")
    ap.add_argument("--frame-budget", type=int, default=DEFAULT_FRAME_BUDGET)
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--no-proxy", action="store_true",
                    help="skip the small playback video the tool uses")
    ap.add_argument("--upload", action="store_true",
                    help="put the match into NL Tools when the scan finishes "
                         "(needs refs/ingest-key.txt)")
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--ffprobe", default="ffprobe")
    ap.add_argument("--init", action="store_true", help="create the refs folder tree and exit")
    ap.add_argument("--list", action="store_true", help="show references and exit")
    ap.add_argument("-y", "--yes", action="store_true",
                    help="take the fixture from the filename without asking")
    ap.add_argument("--stills", type=int, default=0, metavar="N",
                    help="write N full-size frames spread across the match, to crop boards from")
    a = ap.parse_args()
    global _ARGS
    _ARGS = a
    if a.batch and a.out_dir is None:
        a.out_dir = "reports"

    if a.init:
        scaffold(a.refs)
        return

    if a.stills:
        if not a.video or not os.path.isfile(a.video):
            die("give me a video: --video match.mp4 --stills 40")
        stills(a.video, a.stills, a.out or "stills")
        return

    clubs = known_clubs(a.refs)

    if a.list:
        describe_refs(a.refs, a.club)
        return

    if a.batch:
        return run_batch(a, clubs)

    if not a.video:
        die("give me a video: --video match.mp4   (or a folder: --batch inbox)")
    if not os.path.isfile(a.video):
        die(f"no file at {a.video}")

    # Fully scriptable path: everything named on the command line, nothing asked.
    # This is what the cloud job runs, and what an unattended local run wants —
    # before, it silently dropped the date, the trim and the reference-set answer,
    # so a --club run uploaded a match with no date and share of voice withheld.
    if a.club or a.match:
        run_one(a, a.video, a.club, a.match or os.path.basename(a.video),
                a.date or "", parse_clock(a.start), parse_clock(a.end),
                {"complete": True, "partial": False}.get(a.reference_set))
        return
    fx = confirm_fixture(a.video, clubs, a.refs, a.yes, a.upload)
    if not fx:
        die("nothing to measure.")
    run_one(a, a.video, fx["club"], fx["home"] + " v " + fx["away"], fx["date"],
            fx.get("start"), fx.get("end"), fx.get("complete"))


def known_clubs(refs_root):
    if not os.path.isdir(refs_root):
        die(f"no reference folder at {refs_root}. Run with --init first.")
    d = os.path.join(refs_root, "clubs")
    return sorted(os.listdir(d)) if os.path.isdir(d) else []


def describe_refs(refs_root, club, quiet=False):
    """Load the references for this ground and report what is usable."""
    entries = C.load_tree(refs_root, club)
    if not entries:
        die(f"no reference images under {refs_root}. "
            f"See {refs_root}/READ-ME-FIRST.txt")
    scope = {}
    for name, _, sc in entries:
        scope.setdefault(name, sc)

    sift = cv2.SIFT_create(nfeatures=C.NFEATURES)
    usable = 0
    if not quiet:
        print(f"\n  {len(entries)} reference images, {len(scope)} sponsors")
    for name, path, sc in entries:
        g = C.flatten(path)
        kp, des = sift.detectAndCompute(g, None)
        n = 0 if des is None else len(kp)
        if n < C.MIN_INLIERS:
            print(f"    {name:<24} {os.path.basename(path):<28} "
                  f"! only {n} features, skipped")
            continue
        usable += 1
        if not quiet:
            h, w = g.shape[:2]
            mark = "partner" if sc == "partner" else (club or "club")
            print(f"    {name:<24} {mark:<16} {os.path.basename(path):<24} "
                  f"{w}x{h}  {n} features")
    if not usable:
        die("every reference was too plain to match. Use images with more detail.")
    return entries, scope, usable


def run_batch(a, clubs):
    """
    Every video in a folder, one after another, then move each one aside.

    Named for the walk-away case: start it on six matches and come back. So a
    file that cannot be identified is skipped and reported at the end rather
    than stopping the run — but it is never guessed at, because the home club
    picks the reference set and a wrong guess produces numbers that look fine.
    """
    folder = a.batch
    if not os.path.isdir(folder):
        die(f"no folder at {folder}")
    vids = sorted(f for f in os.listdir(folder)
                  if f.lower().endswith(VIDEO_EXT)
                  and os.path.isfile(os.path.join(folder, f)))
    if not vids:
        die(f"no video files in {folder}/\n"
            f"  Drop matches in named like: 2026-08-23 Sutton United v Hartlepool United.mp4")

    done_dir = os.path.join(folder, "done")
    print(f"\n  {len(vids)} video{'s' if len(vids) != 1 else ''} in {folder}/")

    # Every question first, then walk away. Stopping halfway through six matches
    # to ask something is the difference between a batch you can leave running
    # overnight and one you have to sit with.
    print("\n  --- confirm the fixtures ---")
    plan = []
    for name in vids:
        fx = confirm_fixture(os.path.join(folder, name), clubs, a.refs, a.yes, a.upload)
        if fx:
            plan.append((name, fx))
    if not plan:
        die("nothing to measure.")

    print(f"\n  Measuring {len(plan)} of {len(vids)}. Nothing else to answer.\n")
    ok, skipped = [], [(n, "skipped") for n in vids
                       if n not in [p[0] for p in plan]]

    for i, (name, fx) in enumerate(plan, 1):
        path = os.path.join(folder, name)
        print("\n" + "=" * 72)
        print(f"  [{i}/{len(plan)}] {fx['home']} v {fx['away']} — {fx['date'] or 'no date'}")
        print("=" * 72)
        try:
            run_one(a, path, fx["club"], fx["home"] + " v " + fx["away"], fx["date"],
                    fx.get("start"), fx.get("end"), fx.get("complete"))
            ok.append(name)
            os.makedirs(done_dir, exist_ok=True)
            shutil.move(path, os.path.join(done_dir, name))
        except SystemExit as e:
            print(f"  ! {e}")
            skipped.append((name, "failed"))

    print("\n" + "=" * 72)
    print(f"  {len(ok)} measured, {len(skipped)} not")
    for name, why in skipped:
        print(f"    {why}: {name}")
    if ok:
        print(f"  Measured videos moved to {done_dir}/")
    print()


def run_one(a, video, club, title, date="", start=None, end=None, complete=None):
    entries, scope, usable = describe_refs(a.refs, club)

    match = title or os.path.splitext(os.path.basename(video))[0]
    base = re.sub(r"[^a-z0-9]+", "-", match.lower()).strip("-") or "match"
    if a.out and not a.batch:
        base = a.out
    if a.out_dir:
        os.makedirs(a.out_dir, exist_ok=True)
        base = os.path.join(a.out_dir, base)
    work = a.work or f"{base}-frames"

    info = probe(video, a.ffprobe)
    start = parse_clock(a.start) if start is None else start
    end = parse_clock(a.end) if end is None else end
    if end and end > info["duration"]:
        end = None
    span = (end or info["duration"]) - (start or 0)
    if span <= 0:
        die("the start and end times leave nothing to measure.")
    print(f"\n  {video}: {info['w']}x{info['h']}, {info['fps']:.0f}fps, "
          f"{R.hhmm(info['duration'])}")
    if start or end:
        print(f"  measuring {R.hhmm(start or 0)} to {R.hhmm(end or info['duration'])}"
              f" — {R.hhmm(span)} of match, {R.hhmm(info['duration'] - span)} skipped")

    expected = int(span * a.fps)
    files, interval = extract(video, work, a.fps, a.ffmpeg, expected, a.limit,
                              start=start, end=end)
    if a.limit:
        files = files[:a.limit]
    n_samples = len(files)
    duration = n_samples * interval if a.limit else span

    jobs = a.jobs or max(1, (os.cpu_count() or 2) - 1)
    print(f"\n  scanning {n_samples} samples across {jobs} cores")
    print(f"  {usable} references x {n_samples} frames — this is the slow part\n")

    # "spawn", not the default fork. OpenCV starts its own thread pool the first
    # time it is used, and this process has already used it to list the
    # references. Forking after that hands each child the thread pool's locks
    # without the threads holding them, and every worker deadlocks on its first
    # OpenCV call — silently, at 0% CPU, forever. Windows only ever spawns, so
    # this also makes the two platforms run the same code path.
    # Overwrite one line in a terminal; plain lines when redirected to a log,
    # where carriage returns would make an unreadable mess.
    line_end = "\r" if sys.stdout.isatty() else "\n"
    hits_by_index, t0, done, last = {}, time.time(), 0, 0.0
    with mp.get_context("spawn").Pool(jobs, initializer=_init_worker,
                                      initargs=(entries, C.NFEATURES)) as pool:
        for i, hit in pool.imap_unordered(_scan, list(enumerate(files)), chunksize=4):
            if hit:
                hits_by_index[i] = hit
            done += 1
            # On a timer, not every Nth sample. Forty lines spread across a run
            # means one a minute on a full match, and a minute of silence reads
            # as a hung process — which is exactly how the first real run felt.
            # A fixed cadence looks alive whatever the length of the file.
            now = time.time()
            if now - last >= PROGRESS_EVERY or done == n_samples:
                last = now
                el = now - t0
                rate = done / el if el else 0
                eta = (n_samples - done) / rate if rate else 0
                fill = int(round(24 * done / n_samples))
                # ASCII, deliberately: this is usually launched from a .bat, and
                # cmd.exe on a non-UTF-8 codepage turns block characters to mush.
                print(f"  [{'#' * fill}{'.' * (24 - fill)}] {100 * done / n_samples:3.0f}%  "
                      f"{done}/{n_samples}  {rate:.1f}/s  left {R.hhmm(eta)}  "
                      f"found {len(hits_by_index)}   ", end=line_end, flush=True)
    if line_end == "\r":
        print()

    scan_secs = time.time() - t0
    print(f"\n  scanned in {R.hhmm(scan_secs)} — {len(hits_by_index)} samples with a detection")

    # After the scan, before anything reads the results: fill pan-blur gaps
    # with tracked evidence, so the stats, the report and the tool all see one
    # consistent set of hits. Needs the extracted frames, so it must run before
    # the cleanup below.
    close_blurred_gaps(hits_by_index, files, interval)

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
              f"apply at {club}. " if clubbits else ". ")
           + "Pick a sponsor, then scrub the timeline to see what the detector saw.")
    foot = (
        "Measured by this repository&rsquo;s own detector, run on a laptop from a local copy of the "
        "match &mdash; no upload, no third party, no per-match fee. League partner marks came from "
        "each brand&rsquo;s own logo file with nothing cropped from this ground, which is the part "
        "that matters for running it across 72 clubs"
        + (f"; {club}&rsquo;s own boards were cropped at their ground and are searched for only "
           f"when they are at home. " if clubbits else ". ")
        + "The numbers are the detector&rsquo;s own and have <strong>not</strong> been checked "
        "against a hand-count, so treat this as the shape of the report rather than as evidence "
        "for a partner. Calibrating it is one afternoon with a stopwatch and one match.")

    meta = {"match": match, "club": club, "duration": round(duration, 1),
            "interval": interval, "n_samples": n_samples,
            "video_w": info["w"], "video_h": info["h"],
            "sub": sub, "foot": foot}
    html = f"{base}-report.html"
    payload, size = R.build(html, meta, hits_by_index, frame_files, scope)

    head = {"match": match, "club": club, "date": date,
            "video": os.path.basename(video),
            "duration": duration, "interval": interval, "samples": n_samples,
            "video_w": info["w"], "video_h": info["h"],
            "scan_seconds": round(scan_secs, 1),
            "settings": C.settings(),
            "source_duration": round(info["duration"], 1),
            "window": {"start": start or 0, "end": end or round(info["duration"], 1)},
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

    proxy = None
    if not a.no_proxy:
        proxy = make_proxy(video, f"{base}-proxy.mp4", a.ffmpeg, start, end)

    if not a.keep_frames:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(small_dir, ignore_errors=True)

    uploaded = None
    if a.upload:
        # After the files are written and before the summary, so a failure here
        # is reported next to the files that still exist and can be uploaded by
        # hand.
        uploaded = push_to_tool(a, base, head, payload["stats"], club, title,
                                date, proxy, duration, complete)
        if not uploaded:
            global _UPLOAD_FAILURES
            _UPLOAD_FAILURES += 1

    print(f"\n  {html}  ({size/1e6:.1f} MB) — open this in a browser")
    print(f"  {base}-data.json — the numbers on their own")
    print(f"  {base}-detections.json — every detection, for anything else you want to do")
    if proxy:
        print(f"  {base}-proxy.mp4 — playback for the tool")
    if size / 1e6 > SIZE_WARN_MB:
        print(f"\n  That page is large enough to be slow to open or email."
              f"\n  Re-run with --frame-budget {int(a.frame_budget * SIZE_WARN_MB / (size/1e6))}"
              f" for a smaller one — it drops embedded frames, not measurements.")
    print()


if __name__ == "__main__":
    mp.freeze_support()
    main()
    if _UPLOAD_FAILURES:
        # Non-zero, so whatever started this knows. The measurements are on disk
        # either way and the message above says what went wrong.
        sys.exit(f"\n  {_UPLOAD_FAILURES} match(es) measured but NOT uploaded. "
                 f"See the reason above.\n")
