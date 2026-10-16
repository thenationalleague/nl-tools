#!/usr/bin/env python3
"""
Content Plan importer – turns the legacy "Content plan" Google Sheet (.xlsx export)
into JSON for /app-data/media-content-plan/ in RTDB. Load the output through
the tool's Settings → Import (superadmin), not the Firebase console.

Version: v1.3 – 16/10/2026
Changelog
  v1.3 (16/10/2026) – Categories are the Content Plan's own list now, stored by key.
                      The sheet's National / North / South / NL Cup become
                      'football'; Awards, League, Statements, Trust, U19, 3UP map
                      to their own keys. Social items with no category become
                      'football' too (Richard: most social output is football).
  v1.2 (16/10/2026) – Website is a platform: every web item imports with
                      platforms {website: true}. Social platforms stay unset
                      (the sheet never recorded them).
  v1.1 (16/10/2026) – Kind model: social items carry format only (vid / gfx / ad / otd).
                      No platforms, originPlatform or campaigns. "YouTube …" cells
                      import as video; "Instagram …" cells have no video/graphic
                      marker, so they import unset and are flagged for review.
  v1.0 (16/10/2026) – First version. Reads every monthly tab, maps website cells
                      (M–R) to lane "web", social cells (S–V) to lane "social",
                      club obligations to lane "club", day context to days/{date}/notes,
                      FA Cup / FA Trophy counts to days/{date}/manualMatches.
                      Strikethrough = published. Writes import.json, two upload files
                      and import-review.csv.

Run once, locally, against the export. NEVER commit the outputs: they hold staff
initials and day notes, and this repo is public. Write them somewhere outside the
repo (the default --out is the current directory, so run it from elsewhere).

  python3 scripts/content-plan-import.py "Content plan.xlsx" --out ~/content-plan-import

Optional:
  --today 2026-10-16   Import day. Unstruck items before it are flagged for review.
  --authors SE,TS,RD   Initials treated as known authors (default below).

Needs openpyxl (pip install openpyxl).
"""

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip install openpyxl")

# CMS categories. Order matters for prefix matching: longest first, so "NL Cup"
# wins over a hypothetical "NL" and "National" is not taken from "National League Cup".
CATEGORIES = ["Statements", "National", "Awards", "League", "NL Cup", "North", "South",
              "Trust", "U19", "3UP"]
CATEGORY_KEYS = {c.lower(): re.sub(r"[^a-z0-9]", "", c.lower()) for c in CATEGORIES}
# CMS name in the sheet -> Content Plan category key
TOOL_CATEGORY = {"national": "football", "north": "football", "south": "football", "nl cup": "football",
                 "awards": "awards", "league": "league", "statements": "statements",
                 "trust": "trust", "u19": "u19", "3up": "3up"}


def tool_category(label):
    return TOOL_CATEGORY.get(label.lower()) if label else None

DEFAULT_AUTHORS = ["SE", "TS", "RD", "NM", "MW", "GLR", "BH", "JW"]

SOCIAL_FORMATS = {"gfx": "gfx", "vid": "vid", "ad": "ad", "otd": "otd"}
# Platform-prefixed cells: YouTube is always video; Instagram could be either.
SOCIAL_ORIGINS = {"youtube": "vid", "instagram": None}

ROUTINE_WORDS = ["preview", "round-up", "roundup", "how to watch", "totw", "nominations",
                 "monthly", "draw", "fixtures", "results", "tables", "rearrangements"]

WEB_COLS = "MNOPQR"
SOCIAL_COLS = "STUV"
FA_CUP_COL, FA_TROPHY_COL = "I", "J"
FIRST_DATA_ROW = 4

INITIALS_RE = re.compile(r"^[A-Za-z]{2,3}(/[A-Za-z]{2,3})*$")


def col_idx(letter):
    return openpyxl.utils.column_index_from_string(letter)


def is_struck(cell):
    return bool(cell.font is not None and cell.font.strike)


def match_category(text):
    """Return (categoryLabel, remainder) for a case-insensitive prefix match, else (None, text)."""
    low = text.lower()
    for c in sorted(CATEGORIES, key=len, reverse=True):
        cl = c.lower()
        if low == cl or low.startswith(cl + " ") or low.startswith(cl + ":"):
            return c, text[len(c):].lstrip(" :").strip()
    return None, text


def split_author(text):
    """Strip a trailing initials token. Returns (title, [initials]) – initials upper-cased."""
    parts = text.rsplit(" ", 1)
    if len(parts) == 2 and INITIALS_RE.match(parts[1]) and parts[1].upper() == parts[1]:
        return parts[0].strip(), parts[1].split("/")
    return text, []


ROUTINE_RE = re.compile(r"\b(" + "|".join(re.escape(w) for w in ROUTINE_WORDS) + r")\b", re.I)
JOINT_RE = re.compile(r"^north\s*[-/]\s*south\b", re.I)


def is_routine(title):
    # Word boundaries so "draw" doesn't catch "withdrawn"
    return bool(ROUTINE_RE.search(title))


def header_for(ws, letter):
    """Column meaning comes from row 1 (or row 2) of each tab – never assumed."""
    i = col_idx(letter)
    return str(ws.cell(1, i).value or ws.cell(2, i).value or "").strip()


def as_count(v):
    try:
        n = int(float(v))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx")
    ap.add_argument("--out", default=".")
    ap.add_argument("--today", default=dt.date.today().isoformat())
    ap.add_argument("--authors", default=",".join(DEFAULT_AUTHORS))
    args = ap.parse_args()

    today = dt.date.fromisoformat(args.today)
    known = set(a.strip().upper() for a in args.authors.split(",") if a.strip())
    now_ms = int(dt.datetime.now().timestamp() * 1000)

    wb = openpyxl.load_workbook(args.xlsx)  # formatting needed for strikethrough, so not read_only
    items, days, review = {}, {}, []
    counts = {"web": 0, "social": 0, "club": 0, "dayNotes": 0, "manualMatchDays": 0}
    per_tab = []
    seen_initials = {}

    for ws in wb.worksheets:
        tab = ws.title
        k_head, l_head = header_for(ws, "K"), header_for(ws, "L")
        tab_counts = {"web": 0, "social": 0, "club": 0}

        for r in range(FIRST_DATA_ROW, ws.max_row + 1):
            dval = ws.cell(r, 1).value
            if isinstance(dval, dt.datetime):
                day = dval.date()
            elif isinstance(dval, dt.date):
                day = dval
            else:
                continue
            date = day.isoformat()
            in_past = day < today

            def add_item(cell, lane, title, extra, uncertain_reasons):
                status = "published" if is_struck(cell) else "planned"
                reasons = list(uncertain_reasons)
                if status == "planned" and in_past:
                    reasons.append("not struck through but dated in the past")
                item = {
                    "date": date, "time": None, "lane": lane, "title": title,
                    "category": None, "type": None, "author": None, "authorOther": None,
                    "coAuthors": None, "format": None, "linkedItemId": None,
                    "platforms": {"website": lane == "web"},
                    "status": status, "notes": "",
                    "source": {"tab": tab, "cell": cell.coordinate, "raw": str(cell.value)},
                    "needsReview": bool(reasons),
                    "createdBy": "import", "createdAt": now_ms,
                    "updatedBy": "import", "updatedAt": now_ms,
                }
                if status == "published":
                    item["publishedBy"] = "import"
                item.update(extra)
                if item["type"] is None and is_routine(item["title"]):
                    item["type"] = "routine"
                # RTDB keys can't hold . # $ [ ] / – date + cell is unique and stable on re-run
                key = "imp-" + date.replace("-", "") + "-" + cell.coordinate
                items[key] = item
                counts[lane] += 1
                tab_counts[lane] += 1
                if reasons:
                    review.append({"id": key, "tab": tab, "cell": cell.coordinate, "date": date,
                                   "lane": lane, "raw": str(cell.value), "reason": "; ".join(reasons)})

            def resolve_authors(initials):
                """Known initials → author/coAuthors; unknown → authorOther text + review."""
                extra, reasons = {}, []
                if not initials:
                    reasons.append("no author initials")
                    return extra, reasons
                for i in initials:
                    seen_initials[i.upper()] = seen_initials.get(i.upper(), 0) + 1
                lead, rest = initials[0].upper(), [i.upper() for i in initials[1:]]
                if lead in known:
                    extra["author"] = lead
                else:
                    extra["authorOther"] = lead
                    reasons.append("unknown initials " + lead)
                if rest:
                    extra["coAuthors"] = rest
                    unknown = [i for i in rest if i not in known]
                    if unknown:
                        reasons.append("unknown co-author initials " + "/".join(unknown))
                return extra, reasons

            # Website items
            for letter in WEB_COLS:
                cell = ws.cell(r, col_idx(letter))
                if cell.value is None or not str(cell.value).strip():
                    continue
                raw = " ".join(str(cell.value).split())
                reasons = []
                category, rest = match_category(raw)
                if category is None:
                    reasons.append("joint North-South item: pick a category" if JOINT_RE.match(raw)
                                   else "no category prefix")
                title, initials = split_author(rest)
                extra, a_reasons = resolve_authors(initials)
                reasons += a_reasons
                extra.update({"category": tool_category(category), "title": title or raw})
                add_item(cell, "web", title or raw, extra, reasons)

            # Social items
            for letter in SOCIAL_COLS:
                cell = ws.cell(r, col_idx(letter))
                if cell.value is None or not str(cell.value).strip():
                    continue
                raw = " ".join(str(cell.value).split())
                first, _, rest = raw.partition(" ")
                extra, reasons = {}, []
                fl = first.lower().rstrip(":")
                if fl in SOCIAL_FORMATS:
                    extra["format"] = SOCIAL_FORMATS[fl]
                    body = rest.strip()
                elif fl in SOCIAL_ORIGINS:
                    extra["format"] = SOCIAL_ORIGINS[fl]
                    if extra["format"] is None:
                        reasons.append("social: pick video or graphic")
                    body = rest.strip()
                else:
                    body = raw
                    reasons.append("no format or platform prefix")
                category, body2 = match_category(body)
                if category:
                    extra["category"] = tool_category(category)
                    body = body2 or body
                extra.setdefault("category", "football")
                add_item(cell, "social", body or raw, extra, reasons)

            # K / L – meaning read from each tab's header
            notes = []
            for letter, head in (("K", k_head), ("L", l_head)):
                cell = ws.cell(r, col_idx(letter))
                if cell.value is None or not str(cell.value).strip():
                    continue
                text = str(cell.value).strip()
                if head.lower().startswith("club"):
                    title = text.split(":", 1)[1].strip() if ":" in text else text
                    add_item(cell, "club", title, {}, [])
                else:
                    notes.append(" / ".join(line.strip() for line in text.splitlines() if line.strip()))

            manual = {}
            fa_cup = as_count(ws.cell(r, col_idx(FA_CUP_COL)).value)
            fa_trophy = as_count(ws.cell(r, col_idx(FA_TROPHY_COL)).value)
            if fa_cup:
                manual["faCup"] = fa_cup
            if fa_trophy:
                manual["faTrophy"] = fa_trophy

            if notes or manual:
                d = days.setdefault(date, {})
                if notes:
                    d["notes"] = " / ".join(notes)
                    counts["dayNotes"] += 1
                if manual:
                    d["manualMatches"] = manual
                    counts["manualMatchDays"] += 1

        per_tab.append((tab, k_head, l_head, tab_counts))

    os.makedirs(args.out, exist_ok=True)

    def dump(name, obj):
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)

    dump("import.json", {"items": items, "days": days})
    dump("upload-items.json", items)
    dump("upload-days.json", days)
    with open(os.path.join(args.out, "import-review.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["tab", "cell", "date", "lane", "raw", "reason", "id"])
        w.writeheader()
        for row in sorted(review, key=lambda x: (x["date"], x["cell"])):
            w.writerow(row)

    typed = sum(1 for i in items.values() if i["type"] == "routine")
    web_typed = sum(1 for i in items.values() if i["type"] == "routine" and i["lane"] == "web")
    print("Per tab (K / L headers, web, social, club):")
    for tab, k, l, c in per_tab:
        print("  %-7s  K=%-10s L=%-17s web=%3d social=%3d club=%d" % (tab, k, l, c["web"], c["social"], c["club"]))
    print()
    print("Web items:      %d" % counts["web"])
    print("Social items:   %d" % counts["social"])
    print("Club items:     %d" % counts["club"])
    print("Days with notes:          %d" % counts["dayNotes"])
    print("Days with FA Cup/Trophy:  %d" % counts["manualMatchDays"])
    print("Pre-tagged routine:       %d (web %d of %d)" % (typed, web_typed, counts["web"]))
    print("Needs review:             %d  -> import-review.csv" % len(review))
    print("Initials seen:            %s" % ", ".join("%s×%d" % kv for kv in sorted(seen_initials.items())))
    print()
    print("Wrote import.json, upload-items.json, upload-days.json, import-review.csv to %s" % os.path.abspath(args.out))


if __name__ == "__main__":
    main()
