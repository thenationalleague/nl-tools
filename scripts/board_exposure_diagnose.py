"""
Board-exposure recall diagnostic — are the misses blur-shaped or starvation-shaped?

The recall campaign's premise check (plan of record, step 1). Takes a finished
scan's detections export, the hand-labelled answer sheet, and the original
video, and answers ONE question with numbers instead of instinct: what do the
frames the engine missed actually look like, compared with the frames it found?

Three measures per labelled sample, chosen because each one points at a
different lever:

  · sharpness   — full-frame Laplacian variance. Missed frames materially
                  softer than found frames = blur-shaped misses = the synthetic
                  blur-variant ladder is worth building at scale.
  · blockiness  — 8px-grid boundary energy against off-boundary energy, the
                  fingerprint of hard compression. High on missed frames =
                  compression variants justified.
  · starvation  — the share of missed samples whose frame produced no hits for
                  ANY sponsor. The engine had nothing to anchor anywhere: no
                  threshold, carry or variant fixes that — only references
                  (harvest/sweep) and the zoom pass reach it.

Honesty note: on a missed sample nobody knows where in the frame the board is
(that is what "missed" means), so board-level blur on misses is unknowable —
full-frame sharpness is the proxy, and it is stated as such in the output.
Hit-region sharpness is measured on found samples only.

Run (inside the scan container via BE_MODE=diagnose, or anywhere with cv2):

  python3 scripts/board_exposure_diagnose.py \
      --detections detections.json --labels labels.csv \
      --video match.mp4 --out diagnose.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import board_exposure_eval as E  # noqa: E402  (cv2-free by design)

DIAG_VERSION = "1.0"
GRACE = 0.75
# Verdict thresholds. Deliberately blunt round numbers — this is a triage
# instrument, not a measurement; the medians it prints are the measurement.
STARVED_DOMINANT = 0.60   # share of misses in hitless frames
BLUR_RATIO = 0.60         # missed/found sharpness at or under this = softer
BLOCK_RATIO = 1.15        # missed/found blockiness at or over this = crunchier


# ---------------------------------------------------------------- pure logic

def truth_sample_indices(truth, window, interval, n_samples, grace=GRACE):
    """{sponsor: sorted [sample index]} for samples squarely inside a labelled
    span — the grace zone at each edge is excluded, the same exclusion the
    eval scores by, so this diagnostic and the eval count the same misses."""
    w0, w1 = window
    out = {}
    for name, spans in truth.items():
        idx = []
        for i in range(n_samples):
            t = i * interval
            if t < w0 or t > w1:
                continue
            if any(s + grace <= t <= e - grace for s, e in spans):
                idx.append(i)
        out[name] = idx
    return out


def classify(truth_idx, hits_by_index):
    """{sponsor: {index: 'found' | 'tracked' | 'missed'}}.

    'found' = at least one real detection (feature inliers) at that sample;
    'tracked' = hits exist but every one is a synthetic fill — the engine
    completed a run through here but never saw the board itself; 'missed' =
    nothing at all. Tracked counts toward recall in the eval, but for
    diagnosing INITIATION it belongs on its own shelf."""
    out = {}
    for name, indices in truth_idx.items():
        row = {}
        for i in indices:
            hs = (hits_by_index.get(i) or {}).get(name) or []
            if any(not E._tracked(h) for h in hs):
                row[i] = "found"
            elif hs:
                row[i] = "tracked"
            else:
                row[i] = "missed"
        out[name] = row
    return out


def zoom_proxy(hits_by_index, i):
    """Median hit area (% of frame) across EVERY sponsor at sample i — a proxy
    for how zoomed the shot is, usable on samples where this sponsor missed
    but another anchored. None when the frame produced no hits at all."""
    areas = [h.get("a") for row in [hits_by_index.get(i) or {}]
             for hs in row.values() for h in hs if h.get("a") is not None]
    if not areas:
        return None
    areas.sort()
    return areas[len(areas) // 2]


def _median(vals):
    vals = sorted(v for v in vals if v is not None)
    return vals[len(vals) // 2] if vals else None


def aggregate(classes, measures, hits_by_index):
    """Fold per-sample classes + frame measures into per-sponsor stats."""
    out = {}
    for name, row in classes.items():
        found = [i for i, c in row.items() if c == "found"]
        tracked = [i for i, c in row.items() if c == "tracked"]
        missed = [i for i, c in row.items() if c == "missed"]
        starved = [i for i in missed if zoom_proxy(hits_by_index, i) is None]
        m = lambda idx, key: _median([measures.get(i, {}).get(key) for i in idx])  # noqa: E731
        out[name] = {
            "truth_samples": len(row),
            "found": len(found), "tracked_only": len(tracked),
            "missed": len(missed), "missed_starved": len(starved),
            "sharp_found": m(found, "sharp"), "sharp_missed": m(missed, "sharp"),
            "block_found": m(found, "block"), "block_missed": m(missed, "block"),
            "zoom_found": _median([zoom_proxy(hits_by_index, i) for i in found]),
            "zoom_missed_working": _median(
                [zoom_proxy(hits_by_index, i) for i in missed
                 if zoom_proxy(hits_by_index, i) is not None]),
        }
    return out


def overall(per_sponsor):
    tot = {k: sum(s[k] for s in per_sponsor.values())
           for k in ("truth_samples", "found", "tracked_only", "missed",
                     "missed_starved")}
    # Medians of medians would lie; pool the per-sponsor medians only as a
    # display convenience, flagged by the key name.
    for k in ("sharp_found", "sharp_missed", "block_found", "block_missed"):
        tot[k + "_pooled"] = _median([s[k] for s in per_sponsor.values()])
    return tot


def verdict(stats):
    """The numbers, then the reading. Every sentence carries its number so a
    reader can disagree with the reading without re-running anything."""
    lines = []
    missed = stats["missed"] or 1
    starved_share = stats["missed_starved"] / missed
    lines.append(
        f"{stats['missed_starved']} of {stats['missed']} missed samples "
        f"({100 * starved_share:.0f}%) sit in frames where NO sponsor "
        f"produced a hit — initiation starvation, unreachable by thresholds, "
        f"carries or variants; only references and zoom touch it.")
    sf, sm = stats.get("sharp_found_pooled"), stats.get("sharp_missed_pooled")
    if sf and sm:
        r = sm / sf
        lines.append(
            f"Missed frames are {r:.2f}x as sharp as found frames "
            f"(full-frame Laplacian, pooled medians "
            f"{sm:.0f} vs {sf:.0f})"
            + (" — materially softer, so blur variants have real work here."
               if r <= BLUR_RATIO else
               " — not meaningfully softer, so blur variants would mostly "
               "re-find what sharpness never lost."))
    bf, bm = stats.get("block_found_pooled"), stats.get("block_missed_pooled")
    if bf and bm:
        r = bm / bf
        lines.append(
            f"Missed frames are {r:.2f}x as blocky as found frames "
            f"(8px boundary energy {bm:.2f} vs {bf:.2f})"
            + (" — compression variants justified."
               if r >= BLOCK_RATIO else
               " — compression is not what separates found from missed."))
    if starved_share >= STARVED_DOMINANT:
        lines.append(
            "Reading: starvation dominates — spend on references (sweep, "
            "harvest, audition pass) before the variant ladder.")
    else:
        lines.append(
            "Reading: starvation does not dominate — the variant ladder and "
            "per-frame quality are worth their place alongside references.")
    return lines


# ---------------------------------------------------------------- cv2 side

def frame_measures(video, times, log=print):
    """{sample index: {'sharp': float, 'block': float}} for each (index, t).

    Seeks per needed sample rather than decoding the whole file — the labelled
    minutes are a fraction of a full match. A sample whose seek fails is
    omitted and counted; the caller reports it rather than papering over."""
    import cv2

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f"cannot open {video}")
    out, failed = {}, 0
    for n, (i, t) in enumerate(times):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            failed += 1
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        out[i] = {"sharp": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
                  "block": round(blockiness(gray), 3)}
        if n % 100 == 0:
            log(f"  frames measured: {n}/{len(times)}")
    cap.release()
    if failed:
        log(f"  ! {failed} sample(s) unreadable at seek — omitted from medians")
    return out


def blockiness(gray):
    """Energy at 8px block boundaries over energy off them. ~1.0 = smooth
    content or light compression; the further above 1, the harder the
    encoder crunched. Grid phase assumed at multiples of 8 from the frame
    edge, which holds for the h264/JPEG family this footage lives in."""
    import numpy as np

    g = gray.astype("float32")
    cd = abs(g[:, 1:] - g[:, :-1])          # vertical edges between columns
    rd = abs(g[1:, :] - g[:-1, :])
    eps = 1e-6
    col = (cd[:, 7::8].mean() + eps) / (max(_off_mean(cd, np), eps))
    row = (rd[7::8, :].mean() + eps) / (max(_off_mean(rd, np, rows=True), eps))
    return float((col + row) / 2.0)


def _off_mean(d, np, rows=False):
    mask = np.ones(d.shape[0] if rows else d.shape[1], dtype=bool)
    mask[7::8] = False
    return float((d[mask, :] if rows else d[:, mask]).mean())


# ---------------------------------------------------------------- CLI

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--detections", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)

    with open(a.detections, encoding="utf-8") as f:
        d = json.load(f)
    interval = d.get("interval") or 0.5
    n_samples = d.get("samples") or 0
    hits = {int(k): v for k, v in (d.get("hits") or {}).items()}
    if not n_samples or not hits:
        raise SystemExit("this export carries no samples/hits — scan first, "
                         "diagnose second.")
    with open(a.labels, encoding="utf-8") as f:
        window, truth = E.load_labels(f)
    truth = E.rollup(truth)

    truth_idx = truth_sample_indices(truth, window, interval, n_samples)
    classes = classify(truth_idx, hits)

    needed = sorted({i for idx in truth_idx.values() for i in idx})
    print(f"  measuring {len(needed)} labelled samples across "
          f"{len(truth_idx)} sponsors…")
    measures = frame_measures(a.video, [(i, i * interval) for i in needed])

    per_sponsor = aggregate(classes, measures, hits)
    stats = overall(per_sponsor)
    lines = verdict(stats)

    print(f"\n  {'sponsor':<22}{'truth':>7}{'found':>7}{'trackd':>7}"
          f"{'missed':>7}{'starved':>8}{'sharp f/m':>12}")
    for name, s in sorted(per_sponsor.items()):
        sf = s["sharp_found"], s["sharp_missed"]
        print(f"  {name:<22}{s['truth_samples']:>7}{s['found']:>7}"
              f"{s['tracked_only']:>7}{s['missed']:>7}{s['missed_starved']:>8}"
              f"{(f'{sf[0]:.0f}/{sf[1]:.0f}' if all(sf) else '—'):>12}")
    print()
    for ln in lines:
        print(f"  {ln}")

    out = {
        "diagnostic_version": DIAG_VERSION,
        "match": d.get("match"), "video": d.get("video"),
        "engine_version": (d.get("settings") or {}).get("engine_version"),
        "interval": interval, "grace": GRACE, "window": list(window),
        "sponsors": per_sponsor, "overall": stats, "verdict": lines,
        "samples": [
            {"i": i, "t": round(i * interval, 1), "class": c, "sponsor": name,
             **measures.get(i, {}), "zoom": zoom_proxy(hits, i)}
            for name, row in classes.items() for i, c in sorted(row.items())],
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"\n  wrote {a.out}")


if __name__ == "__main__":
    main()
