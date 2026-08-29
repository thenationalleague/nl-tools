#!/usr/bin/env python3
"""
Score a measured match against a hand-labelled stretch of the same video, so
tuning the engine becomes a measurement instead of an argument.

Why this exists: the first cloud-measured match visibly under-detected, and
every lever that would raise recall — looser thresholds, tracking, different
references — can also raise false positives, which inflate numbers a partner
might one day be shown. Nobody moves a threshold on vibes. Label a couple of
minutes once, and every engine change answers to the same clip.

    python board_exposure_eval.py match-detections.json labels.csv

The labels file is a CSV a person writes while watching the video:

    window,0:00,2:00
    Enterprise,0:12,0:31
    Enterprise,0:55,1:04
    DAZN,0:20,0:48

One row per continuous appearance; times are m:ss (or h:mm:ss) in VIDEO time,
the same clock the report and the player show. The `window` row bounds what was
actually watched — only samples inside it are scored, so an unlabelled rest of
the match is not counted as sponsor-free. Rules for the labeller:

  · List a sponsor's EVERY legible appearance inside the window; a sponsor you
    label is scored on the whole window, so a missed label reads as an engine
    false positive.
  · Sponsors you do not label are not scored at all.
  · "Legible" means you can tell whose board it is at a glance. If you have to
    squint, leave it out — the grace margin absorbs the edges.

This module is deliberately cv2-free: labelling and scoring happen on whatever
machine is nearest, and the scoring maths is unit-tested in CI where OpenCV is
not installed. It is also where parse_clock lives — the runner imports it from
here rather than keeping a second copy.
"""
import json
import sys


class LabelError(Exception):
    """A labels file problem, with a sentence a human can act on."""


def parse_clock(s):
    """'1:52:30', '18:30' or '1110' -> seconds. None passes through."""
    if s in (None, ""):
        return None
    parts = str(s).strip().split(":")
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        raise LabelError(
            f"cannot read '{s}' as a time. Use 1:52:30, 18:30 or a number of "
            f"seconds.") from None
    if len(vals) > 3:
        raise LabelError(f"cannot read '{s}' as a time.")
    secs = 0.0
    for v in vals:
        secs = secs * 60 + v
    return secs


def load_labels(lines):
    """
    Parse label rows into (window, {sponsor: [(start, end), ...]}).

    Takes an iterable of lines rather than a path so tests feed it strings.
    Blank lines and #-comments are skipped. Without a `window` row the window
    is 0 to the last labelled end — printed by the CLI so the assumption is
    never silent.
    """
    window, truth = None, {}
    for n, raw in enumerate(lines, 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 3:
            raise LabelError(f"line {n}: expected 'name,start,end', got '{line}'")
        name, s, e = parts
        s, e = parse_clock(s), parse_clock(e)
        if s is None or e is None or e <= s:
            raise LabelError(f"line {n}: '{line}' does not run forwards")
        if name.lower() == "window":
            window = (s, e)
        else:
            truth.setdefault(name, []).append((s, e))
    if not truth:
        raise LabelError("no sponsor rows. One 'Sponsor,start,end' per appearance.")
    if window is None:
        window = (0.0, max(e for spans in truth.values() for _, e in spans))
    return window, truth


def sponsor_of(name):
    """'Enterprise/goal-left' -> 'Enterprise'. Labels may name individual
    boards after a slash; detections only know sponsors, so scoring rolls up."""
    return name.split("/", 1)[0].strip()


def merge_spans(spans):
    """Union of intervals. Kills the interior edges where a labeller split a
    continuous appearance at a shot cut — without this, the grace zone would
    punch scoring holes into the middle of unbroken presence."""
    out = []
    for s, e in sorted(spans):
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def rollup(truth):
    """Per-board truth -> per-sponsor truth, spans merged."""
    by = {}
    for name, spans in truth.items():
        by.setdefault(sponsor_of(name), []).extend(spans)
    return {n: merge_spans(spans) for n, spans in by.items()}


def score(truth, window, hits_by_index, interval, grace=0.75):
    """
    Sample-level precision and recall per sponsor, inside the window.

    Each sampled instant either falls inside a labelled span (should be
    detected), outside every span (should not be), or within `grace` seconds
    of a span edge — where it is not scored at all, because a human writing
    0:12 off a scrubbing thumb is not wrong by being 0.4s out, and scoring the
    ambiguity would bury the signal in labelling noise.

    hits_by_index is the detections export: {sample index: {sponsor: [hit,..]}}
    with integer or string keys. A hit carrying "tracked": True is counted
    separately so a run of this after an engine change shows what tracking
    bought as well as what detection found.
    """
    hits = {int(k): v for k, v in hits_by_index.items()}
    w0, w1 = window
    out = {}
    for name, spans in truth.items():
        tp = fp = fn = tracked_tp = 0
        i = int(w0 // interval)
        while (t := i * interval) <= w1:
            if t >= w0:
                inside = any(s <= t <= e for s, e in spans)
                # Strictly less than: grace=0 must mean NO ambiguity zone, and
                # a span's own boundary sample is a legitimate call either way.
                near_edge = any(abs(t - x) < grace
                                for s, e in spans for x in (s, e))
                hs = (hits.get(i) or {}).get(name) or []
                detected = bool(hs)
                if not near_edge:
                    if inside and detected:
                        tp += 1
                        if all(h.get("tracked") for h in hs):
                            tracked_tp += 1
                    elif inside:
                        fn += 1
                    elif detected:
                        fp += 1
            i += 1
        out[name] = {
            "tp": tp, "fp": fp, "fn": fn, "tracked_tp": tracked_tp,
            "recall": tp / (tp + fn) if tp + fn else None,
            "precision": tp / (tp + fp) if tp + fp else None,
        }
    return out


def overall(per_sponsor):
    """Pooled totals — every scored sample counted once, no averaging of rates."""
    tp = sum(s["tp"] for s in per_sponsor.values())
    fp = sum(s["fp"] for s in per_sponsor.values())
    fn = sum(s["fn"] for s in per_sponsor.values())
    tracked = sum(s["tracked_tp"] for s in per_sponsor.values())
    return {
        "tp": tp, "fp": fp, "fn": fn, "tracked_tp": tracked,
        "recall": tp / (tp + fn) if tp + fn else None,
        "precision": tp / (tp + fp) if tp + fp else None,
    }


def _pct(v):
    return "    —" if v is None else f"{100 * v:4.0f}%"


def main(argv):
    if len(argv) < 3:
        sys.exit("usage: board_exposure_eval.py <detections.json> <labels.csv> "
                 "[--grace 0.75]")
    grace = 0.75
    if "--grace" in argv:
        grace = float(argv[argv.index("--grace") + 1])

    with open(argv[1], encoding="utf-8") as f:
        data = json.load(f)
    interval = data.get("interval")
    hits = data.get("hits")
    if not interval or hits is None:
        sys.exit(f"{argv[1]} does not look like a -detections.json export "
                 "(needs 'interval' and 'hits').")
    try:
        with open(argv[2], encoding="utf-8") as f:
            window, truth = load_labels(f)
    except LabelError as e:
        sys.exit(f"labels: {e}")

    boards = {n: spans for n, spans in truth.items() if "/" in n}
    truth = rollup(truth)

    known = {n for h in hits.values() for n in h}
    for name in truth:
        if name not in known and name not in (data.get("sponsors") or {}):
            print(f"  ! '{name}' is labelled but was never scanned for — "
                  f"check it against the reference folder names.")

    per = score(truth, window, hits, interval, grace=grace)
    o = overall(per)
    print(f"\n  scored {window[0]:.0f}s to {window[1]:.0f}s"
          f" at one sample per {interval:.2f}s, grace {grace}s\n")
    print(f"  {'sponsor':<26}{'recall':>8}{'precision':>11}{'missed':>8}"
          f"{'phantom':>9}{'tracked':>9}")
    print("  " + "-" * 71)
    for name in sorted(per):
        s = per[name]
        print(f"  {name:<26}{_pct(s['recall']):>8}{_pct(s['precision']):>11}"
              f"{s['fn']:>8}{s['fp']:>9}{s['tracked_tp']:>9}")
    print("  " + "-" * 71)
    print(f"  {'overall':<26}{_pct(o['recall']):>8}{_pct(o['precision']):>11}"
          f"{o['fn']:>8}{o['fp']:>9}{o['tracked_tp']:>9}\n")

    if boards:
        # Recall only: a detection says which SPONSOR it found, not which of
        # their boards, so a per-board row credits any of the sponsor's
        # detections during that board's spans. When two boards of one sponsor
        # share the screen this over-credits both — read it as "was anything
        # of theirs found while this board was up", which is still exactly
        # what locates the miss.
        print(f"  {'board':<30}{'recall':>8}{'missed':>8}")
        print("  " + "-" * 46)
        for name in sorted(boards):
            spans = {sponsor_of(name): merge_spans(boards[name])}
            s = score(spans, window, hits, interval, grace=grace)[sponsor_of(name)]
            print(f"  {name:<30}{_pct(s['recall']):>8}{s['fn']:>8}")
        print()
    if o["precision"] is not None and o["precision"] < 0.95:
        print("  ! precision under 95%: the engine is claiming exposure that "
              "was not there.\n    That is worse than missing some — check the "
              "phantom samples before\n    trusting any recall gain.\n")


if __name__ == "__main__":
    main(sys.argv)
