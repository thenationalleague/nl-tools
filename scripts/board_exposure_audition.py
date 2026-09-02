"""
Board-exposure audition — which references earn their place on THIS footage,
and what should the footage itself contribute?

The recall campaign's step 4, industrialising what the 30/08 hand-harvest
proved (Enterprise centre 14->29 from two crops, TIC 3->30 from one): the
biggest recall lever on club footage is references cut from the footage
being scanned. The audition runs BEFORE a full scan commits seven hours of
serial compute, on a few hundred deliberately chosen frames, and answers:

  · per reference — did it fire at all, how often, and what did its best
    match look like (a crop a human can eyeball in the tool)?
  · per sponsor — candidate crops harvested from the footage itself, for a
    human to tick into refs/ or leave. Two sources: the board face behind
    every REAL hit (refining a sponsor that already fires), and a
    relaxed-floor pass over frames where the sponsor found nothing (the
    starved case — TIC before Richard's screenshot). Relaxed matches are
    candidates ONLY: marked, capped, never billed, and the face gate still
    applies to every one.

Frame selection is sharpest-in-window: the timeline is cut into windows, a
few spread frames per window are scored by Laplacian variance at quarter
resolution, and the sharpest wins — the diagnostic showed broadcast misses
concentrate in soft frames, so auditioning on sharp ones shows each
reference at its best.

Matching runs the CANONICAL detector one reference at a time — the same
geometry, perimeter and face guards as a real scan, no forked logic. That
recomputes frame features per reference, which detect()'s own docstring
calls wasteful; at audition scale (hundreds of frames, not tens of
thousands) the waste is minutes and the non-drift is worth it.

Furniture (audition 1.1, 02/09/2026). The scan strips broadcast graphics by
four rules — the top corners, the frame-stack mask, the static position and
the permanent feature cell — and the audition ran none of them, so the DAZN
corner watermark, a perfect match for the DAZN logo, won three of the four
crop slots on Richard's screen; tick one and the scan inherits a picture of
the overlay. Now the same strip functions run here, in the scan's order:
the mask is built first from a spread of frames read straight off the
video, the corner rule and the mask run per frame as hits arrive (so
"fired" and "starved" are judged on real boards), and the static rules run
over the whole sample set once the loop is done. Everything stripped is
counted in audition.json — a rule that deletes never acts silently.

Run (inside the scan container via BE_MODE=audition):

  python3 scripts/board_exposure_audition.py \
      --video match.mp4 --refs refs/ --club Horsham \
      --match "Horsham v Hampton and Richmond" --date 2026-08-18 \
      --out-dir out/
"""
import argparse
import contextlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

AUDITION_VERSION = "1.1"
WINDOWS = 300          # sharpest-in-window count (clamped for short footage)
PER_WINDOW = 3         # spread frames scored per window
RELAXED_FLOOR = 4      # candidate-only inlier floor for starved sponsors
CROPS_PER_REF = 4      # best-hit crops kept per reference
CANDIDATES_PER_SPONSOR = 12
SPREAD_SECS = 10.0     # crops for one ref/sponsor must be this far apart


# ---------------------------------------------------------------- pure logic

def plan_windows(duration, windows=WINDOWS, per_window=PER_WINDOW):
    """[(window index, [t, ...]), ...] — spread sample times per window.

    Windows are clamped so short footage never samples the same instant
    twice: at least 2s of footage per window."""
    n = max(1, min(windows, int(duration // 2) or 1))
    w = duration / n
    out = []
    for i in range(n):
        t0 = i * w
        step = w / (per_window + 1)
        out.append((i, [round(t0 + step * (j + 1), 2)
                        for j in range(per_window)]))
    return out


def pick_sharpest(planned, scores):
    """One t per window — the sharpest scored candidate. A window whose every
    candidate failed to decode contributes nothing rather than a guess."""
    chosen = []
    for _, times in planned:
        best = None
        for t in times:
            s = scores.get(t)
            if s is not None and (best is None or s > best[1]):
                best = (t, s)
        if best:
            chosen.append(best[0])
    return chosen


def diverse_top(hits, keep, spread=SPREAD_SECS):
    """Strongest hits first, but never two within `spread` seconds — a burst
    of near-identical frames must not spend the whole crop budget on one
    moment of footage."""
    out = []
    for h in sorted(hits, key=lambda d: -d["inliers"]):
        if any(abs(h["t"] - k["t"]) < spread for k in out):
            continue
        out.append(h)
        if len(out) >= keep:
            break
    return sorted(out, key=lambda d: d["t"])


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def verdict_rows(ref_hits, entries):
    """Per-reference verdict, in load order: fired count, best hit, spread."""
    rows = []
    for sponsor, path, scope in entries:
        name = os.path.basename(path)
        hs = ref_hits.get((sponsor, name), [])
        best = max(hs, key=lambda d: d["inliers"]) if hs else None
        rows.append({
            "sponsor": sponsor, "file": name, "scope": scope,
            "fired": len(hs),
            "first_t": hs[0]["t"] if hs else None,
            "last_t": hs[-1]["t"] if hs else None,
            "best": ({k: best[k] for k in ("t", "inliers", "area", "clarity")}
                     | {"crop": best.get("crop")}) if best else None,
        })
    return rows


def furniture_row(core, n, row, frame_w, frame_h, mask):
    """
    The per-frame furniture rules on one frame's {sponsor: [hits]} — the
    graphics corners, then the frame-stack mask — through the scan's own
    strip functions, so what the audition refuses is exactly what a scan
    would. Returns (survivors, {"corner": {sponsor: n}, "mask": {sponsor: n}}).
    Pure apart from the mask lookup: a None mask (probe stood down) strips
    nothing, and the corner rule needs only the frame size.
    """
    hbi = {n: row}
    gone_corner = core.strip_corner(hbi, frame_w, frame_h)
    gone_mask = core.strip_masked(hbi, mask)
    return hbi.get(n, {}), {"corner": gone_corner, "mask": gone_mask}


def merge_counts(total, part):
    """{sponsor: n} += {sponsor: n}, in place; returns total."""
    for name, count in part.items():
        total[name] = total.get(name, 0) + count
    return total


# ---------------------------------------------------------------- cv2 side

def read_spread(video, duration, n_frames):
    """`n_frames` evenly spread grayscale frames straight from the video, for
    the furniture probe — the audition never extracts frame files, so the
    scan's file-based path does not apply. Seeks by time, like every other
    read in this pass."""
    import cv2

    cap = cv2.VideoCapture(video)
    grays = []
    for i in range(n_frames):
        t = (i + 0.5) * duration / n_frames
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if ok:
            grays.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
    cap.release()
    return grays


@contextlib.contextmanager
def relaxed_floor(core, floor):
    """Candidate harvesting only: drop the inlier floor for the duration of
    the with-block and GUARANTEE it comes back. The face gate, geometry and
    perimeter checks all still run — this widens who may audition, not who
    may pass. A core parameter is the promotion path if this pattern spreads
    beyond the audition (canon candidate, 30/08/2026)."""
    kept = core.MIN_INLIERS
    core.MIN_INLIERS = floor
    try:
        yield
    finally:
        core.MIN_INLIERS = kept


def score_sharpness(video, planned, log=print):
    """{t: Laplacian variance at quarter scale} for every planned candidate."""
    import cv2

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f"cannot open {video}")
    scores = {}
    todo = [t for _, ts in planned for t in ts]
    for n, t in enumerate(todo):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        g = cv2.resize(g, None, fx=0.25, fy=0.25)
        scores[t] = float(cv2.Laplacian(g, cv2.CV_64F).var())
        if n % 200 == 0:
            log(f"  sharpness scored: {n}/{len(todo)}")
    cap.release()
    return scores


def crop_board(frame, hit):
    """The whole board face behind a hit, from the FRAME — the same crop the
    30/08 hand-harvest made by eye. grow_to_board's box when it found one,
    the logo quad's bounds otherwise, clipped to the frame."""
    import numpy as np

    h, w = frame.shape[:2]
    if hit.get("board"):
        x0, y0, x1, y1 = hit["board"]
    else:
        q = np.asarray(hit["quad"], dtype=float)
        x0, y0 = q[:, 0].min(), q[:, 1].min()
        x1, y1 = q[:, 0].max(), q[:, 1].max()
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(w, int(x1)), min(h, int(y1))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    return frame[y0:y1, x0:x1]


def run(a):
    import cv2

    import board_exposure_core as C

    entries = C.load_tree(a.refs, a.club)
    if not entries:
        raise SystemExit(f"no references for {a.club} under {a.refs} — an "
                         f"audition with nothing to audition is a scan of "
                         f"nothing.")
    sift = cv2.SIFT_create(nfeatures=C.NFEATURES)
    matcher = cv2.BFMatcher()
    singles = []
    for e in entries:
        refs, skipped = C.build_refs([e], sift)
        if refs:
            singles.append((e, refs))
        else:
            print(f"  ! reference unusable (too few features): {e[1]}")

    cap = cv2.VideoCapture(a.video)
    duration = (cap.get(cv2.CAP_PROP_FRAME_COUNT) /
                (cap.get(cv2.CAP_PROP_FPS) or 25.0))
    cap.release()

    planned = plan_windows(duration, a.windows, PER_WINDOW)
    print(f"  auditioning {len(planned)} windows over {duration:.0f}s "
          f"with {len(singles)} references…")
    chosen = pick_sharpest(planned, score_sharpness(a.video, planned))

    # Furniture first (audition 1.1): the frame-stack mask needs no hits, so
    # it is built before the loop from a spread read straight off the video.
    furniture_mask, furn_info = C.furniture_mask_from_grays(
        read_spread(a.video, duration, C.FURN_FRAMES))
    if furniture_mask is None:
        print(f"  furniture mask stood down: {furn_info.get('why', '?')} "
              f"(motion {furn_info.get('motion', '—')})")
    else:
        print(f"  furniture mask: {100 * furn_info['coverage']:.1f}% of frame, "
              f"motion {furn_info['motion']}")
    furn = {"probe": furn_info, "corner": {}, "mask": {}, "static": {}}

    os.makedirs(a.out_dir, exist_ok=True)
    hits_by_index = {}               # sample -> {sponsor: [full hits]}
    relaxed_by_index = {}            # sample -> {sponsor: [full hits]}
    sponsor_frames = {}              # sponsor -> frames with any real hit
    starved = 0
    frame_w = frame_h = 0

    def trimmed(h, **extra):
        return dict({"t": h["t"], "inliers": h["inliers"],
                     "area": round(h["area"], 3),
                     "board": h.get("board"), "quad": h["quad"]}, **extra)

    cap = cv2.VideoCapture(a.video)
    for n, t in enumerate(chosen):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            continue
        frame_h, frame_w = frame.shape[:2]
        row = {}
        for (sponsor, path, scope), refs in singles:
            name = os.path.basename(path)
            for h in C.detect(frame, refs, sift, matcher).get(sponsor) or []:
                row.setdefault(sponsor, []).append(dict(h, t=t, ref=name))
        # The corner rule and the mask, per frame, before anything is
        # counted as fired — so a sponsor whose only "hits" are the
        # watermark is starved, and gets the candidate pass it deserves.
        row, gone = furniture_row(C, n, row, frame_w, frame_h, furniture_mask)
        merge_counts(furn["corner"], gone["corner"])
        merge_counts(furn["mask"], gone["mask"])
        if row:
            hits_by_index[n] = row
            for sponsor in row:
                sponsor_frames.setdefault(sponsor, set()).add(t)
        else:
            starved += 1
        if n % 50 == 0:
            print(f"  frames auditioned: {n}/{len(chosen)}")

        # Starved-sponsor candidate pass, relaxed floor, candidates only.
        # Bounded: once a sponsor has fired properly on a few frames it has
        # proven its references and stops paying for this second pass — the
        # relaxed floor exists for the TIC case, a sponsor with nothing.
        rrow = {}
        for (sponsor, path, scope), refs in singles:
            if len(sponsor_frames.get(sponsor, ())) >= 3:
                continue
            with relaxed_floor(C, a.relaxed_floor):
                hits = C.detect(frame, refs, sift, matcher).get(sponsor) or []
            for h in hits:
                if h["inliers"] >= C.MIN_INLIERS:
                    continue          # a full-strength hit belongs above
                rrow.setdefault(sponsor, []).append(
                    dict(h, t=t, ref=os.path.basename(path)))
        rrow, gone = furniture_row(C, n, rrow, frame_w, frame_h, furniture_mask)
        merge_counts(furn["corner"], gone["corner"])
        merge_counts(furn["mask"], gone["mask"])
        if rrow:
            relaxed_by_index[n] = rrow
    cap.release()

    # The static rules need the whole sample set: a position or a feature
    # cell that holds through the match is furniture whatever it matched.
    merge_counts(furn["static"], C.strip_static(hits_by_index, len(chosen)))
    merge_counts(furn["static"], C.strip_static(relaxed_by_index, len(chosen)))
    furn["stripped"] = sum(sum(d.values()) for d in
                           (furn["corner"], furn["mask"], furn["static"]))
    for rule in ("corner", "mask", "static"):
        for name, count in sorted(furn[rule].items()):
            print(f"  furniture stripped ({rule}): {name} x{count}")

    ref_hits = {}                    # (sponsor, ref file) -> [hit rows]
    for n in sorted(hits_by_index):
        for sponsor, hs in hits_by_index[n].items():
            for h in hs:
                ref_hits.setdefault((sponsor, h["ref"]), []).append(
                    trimmed(h, clarity=round(h["clarity"], 2)))
    relaxed_rows = {}                # sponsor -> [candidate rows]
    for n in sorted(relaxed_by_index):
        for sponsor, hs in relaxed_by_index[n].items():
            for h in hs:
                relaxed_rows.setdefault(sponsor, []).append(
                    trimmed(h, ref=h["ref"]))

    # Crops, second pass: pick the rows worth cropping first, then decode
    # each needed frame exactly once — caching frames through the audition
    # loop cost gigabytes on hit-rich footage, re-seeking costs seconds.
    keep_ref = {k: diverse_top(hs, CROPS_PER_REF)
                for k, hs in ref_hits.items()}
    keep_rel = {s: diverse_top(rs, CANDIDATES_PER_SPONSOR)
                for s, rs in relaxed_rows.items()}
    needed = sorted({r["t"] for rows in keep_ref.values() for r in rows} |
                    {r["t"] for rows in keep_rel.values() for r in rows})
    crops, crop_meta = [], []

    def save_crop(frame, prefix, sponsor, row, relaxed=False):
        img = crop_board(frame, row)
        if img is None:
            return None
        fn = (f"audition-{prefix}{slug(sponsor)}-{int(row['t'])}s-"
              f"{row['inliers']}i.png")
        cv2.imwrite(os.path.join(a.out_dir, fn), img)
        crops.append(fn)
        # The tool's tick/untick view joins on this — a crop without its
        # sponsor and provenance is just a picture.
        crop_meta.append({"crop": fn, "sponsor": sponsor,
                          "t": row["t"], "inliers": row["inliers"],
                          "relaxed": relaxed})
        return fn

    cap = cv2.VideoCapture(a.video)
    for t in needed:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            continue
        for (sponsor, _name), rows in keep_ref.items():
            for row in rows:
                if row["t"] == t:
                    row["crop"] = save_crop(frame, "", sponsor, row)
        for sponsor, rows in keep_rel.items():
            for row in rows:
                if row["t"] == t:
                    row["crop"] = save_crop(frame, "relaxed-", sponsor, row,
                                            relaxed=True)
    cap.release()

    candidates = [
        {"sponsor": sponsor, "t": row["t"], "inliers": row["inliers"],
         "area": row["area"], "ref": row["ref"], "relaxed": True,
         "crop": row.get("crop")}
        for sponsor, rows in keep_rel.items() for row in rows]

    rows = verdict_rows(ref_hits, [e for e, _ in singles])
    for r in rows:
        flag = "DEAD" if not r["fired"] else f"fired {r['fired']}x"
        print(f"  {r['sponsor']:<14} {r['file']:<44} {flag}")
    print(f"  starved frames: {starved}/{len(chosen)} | candidate crops: "
          f"{len(candidates)} | furniture stripped: {furn['stripped']}")

    out = {
        "audition_version": AUDITION_VERSION,
        "engine_version": C.ENGINE_VERSION,
        "match": a.match, "club": a.club, "date": a.date,
        "video": os.path.basename(a.video),
        "params": {"windows": len(planned), "per_window": PER_WINDOW,
                   "relaxed_floor": a.relaxed_floor,
                   "min_inliers": C.MIN_INLIERS},
        "duration": round(duration, 1),
        "frames_auditioned": len(chosen), "starved_frames": starved,
        "refs": rows, "candidates": candidates, "crops": crops,
        "crop_meta": crop_meta,
        "frame": {"w": frame_w, "h": frame_h},
        "furniture": furn,
    }
    path = os.path.join(a.out_dir, "audition.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), default=float)
    print(f"\n  wrote {path} + {len(crops)} crop(s)")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--video", required=True)
    ap.add_argument("--refs", required=True)
    ap.add_argument("--club", required=True)
    ap.add_argument("--match", default=None)
    ap.add_argument("--date", default=None)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--windows", type=int, default=WINDOWS)
    ap.add_argument("--relaxed-floor", type=int, default=RELAXED_FLOOR)
    run(ap.parse_args(argv))


if __name__ == "__main__":
    main()
