#!/usr/bin/env python3
"""Generate downscaled crest tiers for fast rendering.

For every  assets/crests/<name>.png  it writes:
  assets/crests/thumbs/<name>.png   — 96px  long edge  (lists, dropdowns, markers)
  assets/crests/medium/<name>.png   — 512px long edge  (on-page hero/detail badges)
Filenames are identical to the source (load-bearing: every consumer resolves a
crest as `<base>/<encoded name>.png`, so a tier is just a folder prefix).
Aspect ratio + transparency preserved. Full-res originals are untouched
(graphics/canvas exports + downloads keep using them).

Idempotent + CI-safe: a tier file is only rewritten when its bytes would change,
so re-runs on a fresh checkout produce no spurious git diff. Orphan tier files
(source crest deleted) are pruned.

Usage:  python3 scripts/build-crest-thumbs.py [--check]
        --check : report what WOULD change, write nothing, exit 1 if stale
"""

import io
import sys
from pathlib import Path
from PIL import Image

# tier folder → max long-edge px
TIERS = {"thumbs": 96, "medium": 512}

ROOT = Path(__file__).resolve().parent.parent
CRESTS = ROOT / "assets" / "crests"


def render(src: Path, px: int) -> bytes:
    """Optimized PNG bytes of `src` downscaled so its long edge is <= px."""
    with Image.open(src) as im:
        im = im.convert("RGBA")
        im.thumbnail((px, px), Image.LANCZOS)  # keeps aspect, caps long edge
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        return buf.getvalue()


def main() -> int:
    check = "--check" in sys.argv[1:]
    if not CRESTS.is_dir():
        print(f"no crests dir at {CRESTS}", file=sys.stderr)
        return 1

    sources = sorted(p for p in CRESTS.glob("*.png"))
    wanted = {p.name for p in sources}
    any_stale = False

    for tier, px in TIERS.items():
        outdir = CRESTS / tier
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
        print(f"[{tier} {px}px] {total/1024/1024:.2f}MB total (~{avg_kb}KB avg)")
        if check:
            if stale:
                any_stale = True
                print(f"  STALE: {len(stale)} would change: " + ", ".join(stale[:10]))
        else:
            print(f"  wrote={written} unchanged={unchanged} removed={removed}")

    if check:
        if any_stale:
            print("run: python3 scripts/build-crest-thumbs.py")
            return 1
        print("all tiers up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
