#!/usr/bin/env python3
"""
Bump the current football season in clubs-meta.json.

The National League season "YYYY" is identified by its FIRST year: the season
kicking off in August 2027 is "2027" (2027/28). This script sets
`seasons.current` to the target year and guarantees a matching
`seasons.list[year]` label entry, so anything that derives the season from the
file (widgets, skills) stays correct with no manual edit.

Design notes:
  * Target year defaults to the current UTC calendar year. Run on 1 July, the
    calendar year is exactly the first year of the season about to start, so no
    arithmetic on the existing value is needed. This makes the script
    idempotent and self-correcting rather than a blind "+1".
  * Only the top-level `seasons` block is touched. Per-club division data
    (each club's own `seasons` map) is a separate data concern and is left
    untouched.
  * Formatting is preserved (2-space indent, UTF-8, trailing newline) so the
    commit diff is limited to the lines that actually change.

Usage:
    python3 scripts/bump-season.py                 # target = current UTC year
    python3 scripts/bump-season.py --year 2027     # explicit target (testing)
    python3 scripts/bump-season.py --dry-run       # show what would change
    python3 scripts/bump-season.py --file path/to/clubs-meta.json
"""
import argparse
import datetime
import json
import os
import sys

DEFAULT_FILE = "assets/data/clubs-meta.json"


def season_label(year: int) -> str:
    """2027 -> '2027-28'."""
    return f"{year}-{(year + 1) % 100:02d}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Bump seasons.current in clubs-meta.json")
    ap.add_argument("--file", default=DEFAULT_FILE, help="path to clubs-meta.json")
    ap.add_argument("--year", type=int, default=None,
                    help="target season first-year (default: current UTC year)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the change but do not write")
    args = ap.parse_args()

    year = args.year if args.year is not None else datetime.datetime.now(datetime.timezone.utc).year
    year_s = str(year)

    with open(args.file, encoding="utf-8") as fh:
        original = fh.read()
    data = json.loads(original)

    seasons = data.setdefault("seasons", {})
    slist = seasons.setdefault("list", {})

    before_current = seasons.get("current")

    # 1) point current at the target year
    seasons["current"] = year_s
    # 2) guarantee a label entry exists for it (don't clobber an existing label)
    if year_s not in slist:
        slist[year_s] = {"label": season_label(year)}

    updated = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    if updated == original:
        print(f"NOCHANGE: seasons.current already '{before_current}' with a label entry")
        _emit_output(changed=False, current=year_s)
        return 0

    print(f"CHANGED: seasons.current {before_current!r} -> {year_s!r} "
          f"(label {slist[year_s]['label']})")
    if args.dry_run:
        print("--dry-run: not writing")
        _emit_output(changed=False, current=year_s)
        return 0

    with open(args.file, "w", encoding="utf-8") as fh:
        fh.write(updated)
    _emit_output(changed=True, current=year_s)
    return 0


def _emit_output(changed: bool, current: str) -> None:
    """Expose results to GitHub Actions via $GITHUB_OUTPUT when present."""
    gh = os.environ.get("GITHUB_OUTPUT")
    if not gh:
        return
    with open(gh, "a", encoding="utf-8") as fh:
        fh.write(f"changed={'true' if changed else 'false'}\n")
        fh.write(f"current={current}\n")


if __name__ == "__main__":
    sys.exit(main())
