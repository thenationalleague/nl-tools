#!/usr/bin/env python3
"""Build clubs-meta v1.9 — multi-season model.

Phase 1 of the season-switch work:
  * Reinstates the 10 clubs that left after 2025-26 (pulled from the v1.7
    record in git, commit 64280ee) so last season's data is queryable again.
  * Adds a per-club `seasons` tag (season-key -> division that season) to all
    clubs, because clubs move between divisions year to year.
  * Adds a top-level `seasons` registry (current season + labels).

Back-compat: the top-level `division` field stays = the CURRENT season's
division, and is null for clubs not in the current league. Equality/scope
filters in the ~25 consumers therefore auto-exclude departed clubs with no
code changes.

Run from repo root:  python3 club-directory/exported/build_meta_v19.py
"""
import json
import subprocess
from collections import OrderedDict

META = "assets/data/clubs-meta.json"
PREV_REF = "64280ee:assets/data/clubs-meta.json"  # v1.7, last season's roster

CURRENT_SEASON = "2026"
PREV_SEASON = "2025"
SEASON_LABELS = {"2025": "2025-26", "2026": "2026-27"}

# Canonical key order for a club record (current v1.8 schema).
KEY_ORDER = [
    "name", "code", "short", "nickname", "division", "seasons", "domain",
    "optaID", "colors", "stadium_name", "stadium_sponsor_name", "capacity",
    "capacity_seated", "pitch", "address", "postcode", "lat", "lng",
    "station", "fa_membership", "kit", "sponsors",
]


def ordered(club):
    """Return club dict in canonical key order; missing keys -> null."""
    return OrderedDict((k, club.get(k, None)) for k in KEY_ORDER)


def main():
    cur = json.load(open(META, encoding="utf-8"))
    prev = json.loads(subprocess.check_output(["git", "show", PREV_REF]))

    prev_div = {c["name"]: c["division"] for c in prev["clubs"]}
    prev_by_name = {c["name"]: c for c in prev["clubs"]}
    cur_names = {c["name"] for c in cur["clubs"]}

    out_clubs = []

    # 1) Current clubs in their existing (division-grouped) order, with a
    #    seasons tag injected. division stays = this season's division.
    for c in cur["clubs"]:
        seasons = OrderedDict()
        if c["name"] in prev_div:
            seasons[PREV_SEASON] = prev_div[c["name"]]
        seasons[CURRENT_SEASON] = c["division"]
        rec = ordered(c)
        rec["seasons"] = seasons
        out_clubs.append(rec)

    # 2) Departed clubs (in v1.7, not in v1.8): reinstate from prev, division
    #    null (not in current league), seasons = {2025: their last division}.
    departed = sorted(n for n in prev_by_name if n not in cur_names)
    for name in departed:
        src = prev_by_name[name]
        rec = ordered(src)
        rec["division"] = None
        rec["seasons"] = OrderedDict([(PREV_SEASON, prev_div[name])])
        out_clubs.append(rec)

    result = OrderedDict()
    result["version"] = "v1.9"
    result["seasons"] = OrderedDict([
        ("current", CURRENT_SEASON),
        ("list", OrderedDict(
            (k, {"label": SEASON_LABELS[k]}) for k in sorted(SEASON_LABELS))),
    ])
    result["clubs"] = out_clubs

    with open(META, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"v1.9 written: {len(out_clubs)} clubs "
          f"({len(cur['clubs'])} current + {len(departed)} reinstated)")
    print("Reinstated:", ", ".join(departed))


if __name__ == "__main__":
    main()
