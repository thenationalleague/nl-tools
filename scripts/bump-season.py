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
  * It refuses to move the season until the clubs are ready (13/11/2026).
    Every tool asks "which clubs play this season?" from each club's own
    `seasons` map, so moving `current` before each club has an entry for the
    new year would leave every club list empty. Ready means each division
    (National, North, South) has CLUBS_PER_DIVISION clubs for the new year.
    A short division stops the run, writes nothing, and fails the job, so it
    shows red in Actions and in Estate. --allow-short overrides it, for a
    season that genuinely starts a club short.
  * --check reports readiness only and fails if not ready. The workflow runs
    it on Mondays in June, so a missing club shows up weeks before 1 July.

Usage:
    python3 scripts/bump-season.py                 # target = current UTC year
    python3 scripts/bump-season.py --year 2027     # explicit target (testing)
    python3 scripts/bump-season.py --dry-run       # show what would change
    python3 scripts/bump-season.py --check         # is the new season ready?
    python3 scripts/bump-season.py --allow-short   # move it anyway
    python3 scripts/bump-season.py --file path/to/clubs-meta.json
"""
import argparse
import datetime
import json
import os
import sys

DEFAULT_FILE = "assets/data/clubs-meta.json"
DIVISIONS = ("National", "North", "South")
CLUBS_PER_DIVISION = 24


def season_label(year: int) -> str:
    """2027 -> '2027-28'."""
    return f"{year}-{(year + 1) % 100:02d}"


def readiness(data: dict, year_s: str) -> dict:
    """Clubs per division for the season, from each club's own seasons map."""
    counts = {d: 0 for d in DIVISIONS}
    for club in data.get("clubs", []):
        div = (club.get("seasons") or {}).get(year_s) if isinstance(club.get("seasons"), dict) else None
        if div in counts:
            counts[div] += 1
    return counts


def report(counts: dict, year: int) -> bool:
    """Print the counts in plain words; True when every division is full."""
    ok = all(n == CLUBS_PER_DIVISION for n in counts.values())
    line = ", ".join(f"{d} {n}" for d, n in counts.items())
    print(f"Clubs for {season_label(year)} in clubs-meta: {line} "
          f"(each needs {CLUBS_PER_DIVISION}).")
    return ok


def main() -> int:
    ap = argparse.ArgumentParser(description="Bump seasons.current in clubs-meta.json")
    ap.add_argument("--file", default=DEFAULT_FILE, help="path to clubs-meta.json")
    ap.add_argument("--year", type=int, default=None,
                    help="target season first-year (default: current UTC year)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the change but do not write")
    ap.add_argument("--check", action="store_true",
                    help="report whether the season's clubs are in; fail if not")
    ap.add_argument("--allow-short", action="store_true",
                    help="move the season even if a division is short")
    args = ap.parse_args()

    year = args.year if args.year is not None else datetime.datetime.now(datetime.timezone.utc).year
    year_s = str(year)

    with open(args.file, encoding="utf-8") as fh:
        original = fh.read()
    data = json.loads(original)

    ready = report(readiness(data, year_s), year)
    if args.check:
        if ready:
            print("Ready: the season can move on 1 July.")
            return 0
        print("::error::Not ready. Add every club's division for the new season "
              "to clubs-meta before 1 July (system/new-season-checklist.md).")
        return 1
    if not ready and not args.allow_short:
        print("::error::Season not moved: a division is short of clubs for the "
              "new season, and moving it would empty every club list. Add the "
              "clubs to clubs-meta, then run this job again (or tick allow "
              "short if the season really starts a club short).")
        _emit_output(changed=False, current=data.get("seasons", {}).get("current", ""))
        return 1

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
