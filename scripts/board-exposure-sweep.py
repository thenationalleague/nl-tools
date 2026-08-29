#!/usr/bin/env python3
"""
Trial the engine at a grid of sensitivities against a hand-labelled match,
in one run — because run-look-tweak-run at one setting a time is how a
Saturday disappears.

    python board-exposure-sweep.py --video match.mp4 --refs refs \
           --labels system/board-exposure/labels/<match>.csv --club "Sutton United"

Frames are extracted once; every combination re-scans the same frames with
different thresholds (spawned workers re-import the engine, so overrides are
per-run and nothing leaks between combos). Each combo runs the SHIPPING
pipeline — detection, static-furniture strip, gap tracking — and is scored
against the labels, so the table compares what would actually ship:

    ratio  inliers  side   recall  precision   phantom
    0.80      9      12      58%      100%        0
    0.85      7       9      79%       91%       31    <- cheap seconds, but lies

Read it precision-first: a phantom second sold to a partner is worse than a
missed one. The knee is the highest recall whose precision holds ~97%+.

This script changes NOTHING. It measures candidate settings; promoting one
into board_exposure_core.py is a deliberate engine version, done by hand,
with this table in the commit message.
"""
import argparse
import importlib.util
import itertools
import multiprocessing as mp
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import board_exposure_core as C            # noqa: E402
import board_exposure_eval as E            # noqa: E402


def load_match_module():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "board-exposure-match.py")
    spec = importlib.util.spec_from_file_location("bem", p)
    bem = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bem)
    return bem


# Pool workers live HERE, not borrowed from the match script: spawned workers
# are pickled by module name, and a module loaded from a hyphenated file under
# a synthetic name cannot be re-imported inside the child — the borrowed pool
# dies on its first task. This script's own top level survives spawn because
# scripts get the __mp_main__ treatment. The serialiser matches _scan() in
# board-exposure-match.py field for field; the tracking test's shape check
# covers that contract.
_W = {}


def _init(entries, nfeatures, overrides):
    import cv2
    for k, v in (overrides or {}).items():
        setattr(C, k, v)
    cv2.setNumThreads(1)
    sift = cv2.SIFT_create(nfeatures=nfeatures)
    refs, _ = C.build_refs(entries, sift)
    _W["sift"], _W["refs"] = sift, refs
    _W["matcher"] = cv2.BFMatcher(cv2.NORM_L2)


def _scan(job):
    import cv2
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
            "mc": ([round(float(h["mc"][0]), 1), round(float(h["mc"][1]), 1)]
                   if h.get("mc") else None),
        } for h in hs]
    return i, out


# The grid. Small on purpose: eight combos is ~25 minutes and answers the
# question; a hundred combos is overfitting to one afternoon at one ground.
GRID = {
    "RATIO": [0.80, 0.85],          # Lowe ratio — looser admits more matches
    "MIN_INLIERS": [9, 7],          # agreeing features a match must muster
    "MIN_SIDE": [12, 9],            # smallest quad side worth believing
}


def scan_once(bem, entries, files, interval, n_samples, overrides, jobs):
    hits, done = {}, 0
    with mp.get_context("spawn").Pool(
            jobs, initializer=_init,
            initargs=(entries, C.NFEATURES, overrides)) as pool:
        for i, hit in pool.imap_unordered(_scan, list(enumerate(files)),
                                          chunksize=4):
            if hit:
                hits[i] = hit
            done += 1
    # The full shipping pipeline, under the same overrides in THIS process.
    for k, v in overrides.items():
        setattr(C, k, v)
    C.strip_static(hits, n_samples)
    bem.close_blurred_gaps(hits, files, interval)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--refs", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--club", default=None)
    ap.add_argument("--fps", type=float, default=C.SAMPLE_FPS)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--jobs", type=int, default=0)
    ap.add_argument("--out-dir", default=".")
    a = ap.parse_args()

    bem = load_match_module()

    with open(a.labels, encoding="utf-8") as f:
        window, truth = E.load_labels(f)
    truth = E.rollup(truth)
    print(f"  labels: {sum(len(s) for s in truth.values())} spans across "
          f"{len(truth)} sponsor(s), window {window[0]:.0f}-{window[1]:.0f}s")

    entries = C.load_tree(a.refs, a.club)
    if not entries:
        sys.exit("no references found — check --refs and --club")

    info = bem.probe(a.video, "ffprobe")
    work = os.path.join(a.out_dir, "sweep-frames")
    expected = int(info["duration"] * a.fps)
    files, interval = bem.extract(a.video, work, a.fps, a.ffmpeg, expected, 0)
    n_samples = len(files)
    jobs = a.jobs or max(1, (os.cpu_count() or 2) - 1)
    print(f"  {n_samples} samples x {len(entries)} reference images, "
          f"{jobs} cores per combo\n")

    combos = [dict(zip(GRID, vals))
              for vals in itertools.product(*GRID.values())]
    print(f"  {'ratio':>6}{'inliers':>9}{'side':>6}{'recall':>9}"
          f"{'precision':>11}{'phantom':>9}{'mins':>6}")
    print("  " + "-" * 56)
    results = []
    for ov in combos:
        t0 = time.time()
        hits = scan_once(bem, entries, files, interval, n_samples, ov, jobs)
        per = E.score(truth, window, hits, interval)
        o = E.overall(per)
        results.append((ov, o, per))
        print(f"  {ov['RATIO']:>6.2f}{ov['MIN_INLIERS']:>9}{ov['MIN_SIDE']:>6}"
              f"{'' if o['recall'] is None else format(100 * o['recall'], '.0f') + '%':>9}"
              f"{'' if o['precision'] is None else format(100 * o['precision'], '.0f') + '%':>11}"
              f"{o['fp']:>9}{(time.time() - t0) / 60:>6.1f}", flush=True)

    # The knee: most recall among the combos that stay honest.
    honest = [r for r in results
              if r[1]["precision"] is not None and r[1]["precision"] >= 0.97]
    if honest:
        ov, o, per = max(honest, key=lambda r: r[1]["recall"] or 0)
        print(f"\n  knee: ratio {ov['RATIO']}, inliers {ov['MIN_INLIERS']}, "
              f"side {ov['MIN_SIDE']} — recall {100 * (o['recall'] or 0):.0f}% "
              f"at precision {100 * (o['precision'] or 0):.0f}%")
        for name in sorted(per):
            s = per[name]
            r = "" if s["recall"] is None else f"{100 * s['recall']:.0f}%"
            print(f"    {name:<24}{r:>6}  missed {s['fn']}  phantom {s['fp']}")
        print("\n  Promoting these numbers into board_exposure_core.py is a "
              "deliberate engine\n  version bump — this script never changes "
              "anything itself.")
    else:
        print("\n  no combo held 97% precision — loosening is manufacturing "
              "exposure on this\n  footage, and the honest answer is the "
              "reference set, not the thresholds.")
        # Still say WHERE the disagreement lives, from the strictest combo —
        # precision is flat across the grid, so the diagnosis is too.
        ov, o, per = results[0]
        print(f"\n  per sponsor at ratio {ov['RATIO']}, inliers "
              f"{ov['MIN_INLIERS']}, side {ov['MIN_SIDE']}:")
        for name in sorted(per):
            s = per[name]
            r = "—" if s["recall"] is None else f"{100 * s['recall']:.0f}%"
            p = "—" if s["precision"] is None else f"{100 * s['precision']:.0f}%"
            print(f"    {name:<24}recall {r:>5}  precision {p:>5}  "
                  f"missed {s['fn']}  phantom {s['fp']}")
        print("\n  Run board_exposure_eval.py --phantoms against this match's "
              "detections to get\n  the disputed timestamps for a human ruling.")


if __name__ == "__main__":
    mp.freeze_support()
    main()
