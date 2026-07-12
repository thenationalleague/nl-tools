#!/usr/bin/env python3
"""Generate low-res crest thumbnails for fast list/dropdown rendering.

Reads every  assets/crests/<name>.png  and writes a downscaled copy to
assets/crests/thumbs/<same name>.png  (max 96px on the long side, aspect +
transparency preserved). Identical filenames are load-bearing: every consumer
resolves a crest as `<base>/<encoded name>.png`, so a thumb at
`<base>/thumbs/<encoded name>.png` needs no per-call changes.

Idempotent + CI-safe: a thumb is only rewritten when its bytes would actually
change, so re-runs on a fresh checkout (where mtimes are meaningless) produce
no spurious git diff. Orphan thumbs (source crest deleted) are removed.

Full-res originals are untouched — graphics/canvas exporters keep using them.

Usage:  python3 scripts/build-crest-thumbs.py [--check]
        --check : report what WOULD change, write nothing, exit 1 if stale
"""

import io
import sys
from pathlib import Path
from PIL import Image

MAX_PX = 96
ROOT = Path(__file__).resolve().parent.parent
CRESTS = ROOT / "assets" / "crests"
THUMBS = CRESTS / "thumbs"


def render_thumb(src: Path) -> bytes:
    """Return the optimized PNG bytes of the thumbnail for one crest."""
    with Image.open(src) as im:
        im = im.convert("RGBA")
        im.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        return buf.getvalue()


def main() -> int:
    check = "--check" in sys.argv[1:]
    if not CRESTS.is_dir():
        print(f"no crests dir at {CRESTS}", file=sys.stderr)
        return 1
    THUMBS.mkdir(exist_ok=True)

    sources = sorted(p for p in CRESTS.glob("*.png"))
    written, unchanged, removed, total_bytes = 0, 0, 0, 0
    stale = []

    wanted = set()
    for src in sources:
        wanted.add(src.name)
        dst = THUMBS / src.name
        new_bytes = render_thumb(src)
        total_bytes += len(new_bytes)
        old_bytes = dst.read_bytes() if dst.exists() else None
        if old_bytes == new_bytes:
            unchanged += 1
            continue
        stale.append(src.name)
        if check:
            continue
        dst.write_bytes(new_bytes)
        written += 1

    # prune orphan thumbs whose source crest no longer exists
    for t in sorted(THUMBS.glob("*.png")):
        if t.name not in wanted:
            stale.append("orphan:" + t.name)
            if not check:
                t.unlink()
                removed += 1

    avg_kb = round(total_bytes / len(sources) / 1024, 1) if sources else 0
    print(
        f"crests={len(sources)}  thumbs={total_bytes/1024/1024:.2f}MB total "
        f"(~{avg_kb}KB avg, {MAX_PX}px)"
    )
    if check:
        if stale:
            print(f"STALE: {len(stale)} thumb(s) would change: " + ", ".join(stale[:12]))
            return 1
        print("thumbs up to date")
        return 0
    print(f"wrote={written}  unchanged={unchanged}  removed={removed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
