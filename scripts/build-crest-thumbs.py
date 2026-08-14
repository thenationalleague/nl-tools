#!/usr/bin/env python3
"""Generate downscaled tiers of the image assets the graphics tools draw.

  assets/crests/thumbs/<name>.png    —  96px long edge  (lists, dropdowns, markers)
  assets/crests/medium/<name>.png    — 256px long edge  (graphics rows, panels)
  assets/divisions/medium/<name>.png — 256px long edge  (division/competition badge)

Filenames are identical to the source (load-bearing: every consumer resolves an
asset as `<base>/<encoded name>.png`, so a tier is just a folder prefix). Aspect
ratio + transparency preserved. Full-res originals are untouched — the two-crest
tools (match-graphic, single-fixture) still draw those at 300px+.

WHY: the graphics tools were pulling full-res art to draw it small. Crests
average 524KB (largest 5.4MB), so a 24-row table fetched ~12.6MB to render them
at 36px; division badges are ~100KB (NL Cup 264KB) to render at ~120px. On a
slow connection an asset that has not arrived is simply left out of the export,
which is how a table shipped with one crest out of 24. The medium tier is still
2-7x oversampled at the size these are drawn.

Idempotent + CI-safe: a tier file is only rewritten when its bytes would change,
so re-runs on a fresh checkout produce no spurious git diff. Orphan tier files
(source deleted) are pruned.

Usage:  python3 scripts/build-crest-thumbs.py [--check]
        --check : report what WOULD change, write nothing, exit 1 if stale
"""

import io
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# source folder → {tier folder: max long-edge px}
# Divisions get `medium` only: they are drawn at ~120px and never appear in a
# dropdown, so a 96px thumb would have no consumer and only add files to prune.
TARGETS = {
    ROOT / "assets" / "crests":    {"thumbs": 96, "medium": 256},
    ROOT / "assets" / "divisions": {"medium": 256},
}


def render(src: Path, px: int) -> bytes:
    """Optimized PNG bytes of `src` downscaled so its long edge is <= px."""
    with Image.open(src) as im:
        im = im.convert("RGBA")
        im.thumbnail((px, px), Image.LANCZOS)  # keeps aspect, caps long edge
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        return buf.getvalue()


def build(srcdir: Path, tiers: dict, check: bool) -> bool:
    """Build every tier for one source folder. Returns True if anything is stale."""
    sources = sorted(p for p in srcdir.glob("*.png"))
    if not sources:
        print(f"[{srcdir.name}] no PNGs — skipped")
        return False
    wanted = {p.name for p in sources}
    any_stale = False

    for tier, px in tiers.items():
        outdir = srcdir / tier
        outdir.mkdir(exist_ok=True)
        written = unchanged = removed = 0
        total = 0
        stale = []
        for src in sources:
            new_bytes = render(src, px)
            total += len(new_bytes)
            dst = outdir / src.name
            old = dst.read_bytes() if dst.exists() else None
            if old == new_bytes:
                unchanged += 1
                continue
            stale.append(src.name)
            if not check:
                dst.write_bytes(new_bytes)
                written += 1
        for t in sorted(outdir.glob("*.png")):
            if t.name not in wanted:
                stale.append("orphan:" + t.name)
                if not check:
                    t.unlink()
                    removed += 1
        avg_kb = round(total / len(sources) / 1024, 1) if sources else 0
        print(f"[{srcdir.name}/{tier} {px}px] {total/1024/1024:.2f}MB total (~{avg_kb}KB avg)")
        if check:
            if stale:
                any_stale = True
                print(f"  STALE: {len(stale)} would change: " + ", ".join(stale[:10]))
        else:
            print(f"  wrote={written} unchanged={unchanged} removed={removed}")
    return any_stale


def main() -> int:
    check = "--check" in sys.argv[1:]
    any_stale = False
    for srcdir, tiers in TARGETS.items():
        if not srcdir.is_dir():
            print(f"no source dir at {srcdir}", file=sys.stderr)
            return 1
        any_stale |= build(srcdir, tiers, check)

    if check:
        if any_stale:
            print("run: python3 scripts/build-crest-thumbs.py")
            return 1
        print("all tiers up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
