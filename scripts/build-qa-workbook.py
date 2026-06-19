"""Commercial Benchmarking — build a QA workbook for the commercial team.

Reads a JSON export of the benchmarking club rows and writes a tidy .xlsx that
flags the things worth a manual look before following up with clubs:

  * 'All clubs'  — one row per club, every submitted field. Big-outlier cells
                   are highlighted amber; rows in a suspected duplicate set are
                   tinted red. Status / Outlier notes / Duplicate-group columns.
  * 'Outliers'   — one row per flagged value (club, field, value, league median,
                   how many times the median it is), largest first.
  * 'Duplicates' — suspected duplicate groups, every member repeated together so
                   the team can compare them side by side ("include again").

The input JSON can be any of:
  * the RTDB node  app-data/ops-commercial-benchmarking  (has a `clubs` child),
  * just its `clubs` child  { "<club>": {...}, ... },
  * the import file produced by build-benchmarks.py (also has `clubs`).
Export it from the Firebase console: open the node, ⋮ → Export JSON.

Usage:
    python scripts/build-qa-workbook.py <data.json> [out.xlsx]

NOTHING here is committed — the workbook contains club-identifiable figures.
Treat the output as confidential.
"""
import sys, json
import statistics as st
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SRC = sys.argv[1] if len(sys.argv) > 1 else 'commercial-benchmarking-rtdb-import.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'commercial-benchmarking-QA.xlsx'

# (metric key, column header, numeric?, flag-outliers?)
METRICS = [
    ('msTicket',     'Top GA matchday ticket (£)',   True,  True),
    ('seasonTicket', 'Top GA season ticket (£)',     True,  True),
    ('frontShirt',   'Front shirt income (£)',       True,  True),
    ('frontTerm',    'Front shirt term (yrs)',       True,  True),
    ('backShirt',    'Back shirt income (£)',        True,  True),
    ('backTerm',     'Back shirt term (yrs)',        True,  True),
    ('sleeve',       'Sleeve income (£)',            True,  True),
    ('sleeveTerm',   'Sleeve term (yrs)',            True,  True),
    ('standCount',   'Stand sponsors (n)',           True,  False),
    ('standTotal',   'Stand total (£)',              True,  True),
    ('standAvg',     'Stand avg per stand (£)',      True,  True),
    ('tvBoard',      'TV-facing board (£)',          True,  True),
    ('nonTvBoard',   'Non-TV board (£)',             True,  True),
    ('mdHosp',       'Matchday hospitality (£)',     True,  True),
    ('seasonHosp',   'Seasonal hospitality (£)',     True,  True),
    ('progAd',       'Programme advert (£)',         True,  True),
    ('emailDb',      'Email database (n)',           True,  True),
    ('optedIn',      'Opted-in partner emails (n)',  True,  True),
]
SPON = [
    ('fsSponsor', 'Front shirt sponsor'), ('fsSector', 'Front shirt sector'),
    ('bsSponsor', 'Back shirt sponsor'),  ('bsSector', 'Back shirt sector'),
    ('slSponsor', 'Sleeve sponsor'),      ('slSector', 'Sleeve sector'),
]
CHIPS = [
    ('progFormat', 'Programme format'), ('rollingFront', 'Front rolling?'),
    ('rollingBack', 'Back rolling?'),   ('rollingSleeve', 'Sleeve rolling?'),
    ('emailSupporters', 'Can email supporters?'), ('emailPartners', 'Can email partners?'),
]
# core figures used to detect copy/paste duplicate returns
DUP_FIELDS = ['frontShirt', 'backShirt', 'sleeve', 'msTicket', 'seasonTicket',
              'mdHosp', 'seasonHosp', 'progAd', 'emailDb']
HDR = dict((k, h) for k, h, _n, _f in METRICS)

AMBER = PatternFill('solid', fgColor='FFE9A8')
RED   = PatternFill('solid', fgColor='F8C9C4')
HEAD  = PatternFill('solid', fgColor='1B2A4A')
HEADF = Font(color='FFFFFF', bold=True)
THIN  = Border(*([Side(style='thin', color='DDDDDD')] * 4))


def load_clubs(path):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    if isinstance(d, dict) and isinstance(d.get('clubs'), dict):
        d = d['clubs']
    clubs = []
    for k, v in d.items():
        if isinstance(v, dict):
            v = dict(v)
            v.setdefault('club', k)
            clubs.append(v)
    return clubs


def mval(c, key):
    m = (c.get('metrics') or {}).get(key)
    return m.get('value') if isinstance(m, dict) else m


def isnum(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def money(v):
    if not isnum(v):
        return v if v not in (None, '') else ''
    return round(v, 2) if v % 1 else int(v)


def main():
    clubs = load_clubs(SRC)
    if not clubs:
        print('No clubs found in %s' % SRC); sys.exit(1)
    DIV = {'National': 0, 'North': 1, 'South': 2}
    clubs.sort(key=lambda c: (DIV.get(c.get('division'), 9), str(c.get('club', ''))))

    # ---- outlier fences per numeric metric (robust: IQR*3 and 6x median) ----
    fences = {}
    for key, _h, num, flag in METRICS:
        if not (num and flag):
            continue
        vals = sorted(v for v in (mval(c, key) for c in clubs) if isnum(v))
        if len(vals) < 4:
            continue
        n = len(vals)
        q1 = vals[int(round(0.25 * (n - 1)))]
        q3 = vals[int(round(0.75 * (n - 1)))]
        iqr = q3 - q1
        med = st.median(vals)
        hi = max(q3 + 3 * iqr, med * 6) if med > 0 else q3 + 3 * iqr
        lo = q1 - 3 * iqr
        fences[key] = (lo, hi, med)

    def outliers_for(c):
        out = []
        for key, _h, _num, _flag in METRICS:
            if key not in fences:
                continue
            v = mval(c, key)
            if not isnum(v):
                continue
            lo, hi, med = fences[key]
            if v > hi or v < lo:
                out.append((key, v, med, (v / med) if med else None))
        return out

    # ---- duplicate detection (clubs sharing the same core figures) ----
    sig_map = {}
    for c in clubs:
        sig = tuple(mval(c, k) for k in DUP_FIELDS)
        if sum(1 for x in sig if isnum(x)) >= 2:
            sig_map.setdefault(sig, []).append(c['club'])
    club_dup, dup_groups, gid = {}, [], 0
    for sig, members in sig_map.items():
        if len(members) > 1:
            gid += 1
            label = 'D%d' % gid
            dup_groups.append((label, members))
            for m in members:
                club_dup[m] = label

    def has_data(c):
        return any(k != 'standCount' and isnum(mval(c, k)) for k, *_ in METRICS)

    wb = Workbook()

    # ================= sheet 1: All clubs =================
    ws = wb.active
    ws.title = 'All clubs'
    cols = ['Club', 'Division', 'Status']
    metric_cols = {}
    for key, h, _n, _f in METRICS:
        metric_cols[key] = len(cols)  # 0-based index into the row list
        cols.append(h)
    for _k, h in SPON:
        cols.append(h)
    for i in (1, 2, 3, 4):
        cols += ['Stand %d name' % i, 'Stand %d sector' % i, 'Stand %d income (£)' % i]
    for _k, h in CHIPS:
        cols.append(h)
    cols += ['Outlier flags', 'Duplicate group']
    ws.append(cols)

    for c in clubs:
        club = c.get('club', '')
        row = [club, c.get('division', ''), 'OK' if has_data(c) else 'NO DATA SUBMITTED']
        for key, _h, _n, _f in METRICS:
            row.append(money(mval(c, key)))
        for k, _h in SPON:
            row.append(c.get(k, '') or '')
        stands = c.get('stands') or []
        for i in range(4):
            sd = stands[i] if i < len(stands) else {}
            nm = sd.get('name', '') if isinstance(sd, dict) else ''
            row += [('' if nm == '—' else nm), sd.get('sector', '') if isinstance(sd, dict) else '',
                    money(sd.get('income')) if isinstance(sd, dict) else '']
        ch = c.get('chips') or {}
        for k, _h in CHIPS:
            row.append(ch.get(k, '') or '')
        outs = outliers_for(c)
        notes = '; '.join('%s %s (%s× median)' % (HDR[k], money(v), round(r, 1) if r else '?')
                          for k, v, _med, r in outs)
        row.append(notes)
        row.append(club_dup.get(club, ''))
        ws.append(row)

        r = ws.max_row
        if club in club_dup:
            for ci in range(1, len(cols) + 1):
                ws.cell(r, ci).fill = RED
        for k, _v, _med, _ratio in outs:
            ws.cell(r, metric_cols[k] + 1).fill = AMBER

    # ================= sheet 2: Outliers =================
    wo = wb.create_sheet('Outliers')
    wo.append(['Club', 'Division', 'Field', 'Value', 'League median', '× median'])
    flat = []
    for c in clubs:
        for k, v, med, ratio in outliers_for(c):
            flat.append([c.get('club', ''), c.get('division', ''), HDR[k], money(v),
                         money(med), round(ratio, 1) if ratio else None])
    flat.sort(key=lambda x: (x[5] is None, -(x[5] or 0)))
    for f in flat:
        wo.append(f)

    # ================= sheet 3: Duplicates =================
    wd = wb.create_sheet('Duplicates')
    wd.append(['Group', 'Club', 'Division'] + [HDR[k] for k in DUP_FIELDS])
    by_club = {c.get('club', ''): c for c in clubs}
    for label, members in dup_groups:
        for m in members:
            c = by_club.get(m, {})
            wd.append([label, m, c.get('division', '')] + [money(mval(c, k)) for k in DUP_FIELDS])
        wd.append([])  # blank line between groups

    # ---- styling pass: header row, borders, widths, freeze ----
    for sheet in wb.worksheets:
        for ci in range(1, sheet.max_column + 1):
            cell = sheet.cell(1, ci)
            cell.fill = HEAD; cell.font = HEADF
            cell.alignment = Alignment(vertical='top', wrap_text=True)
        sheet.freeze_panes = 'A2'
        for ci in range(1, sheet.max_column + 1):
            width = 12
            for ri in range(1, min(sheet.max_row, 80) + 1):
                v = sheet.cell(ri, ci).value
                if v is not None:
                    width = max(width, min(40, len(str(v)) + 2))
            sheet.column_dimensions[get_column_letter(ci)].width = width
    ws.column_dimensions['A'].width = 24
    ws.column_dimensions[get_column_letter(len(cols) - 1)].width = 40  # Outlier flags

    wb.save(OUT)
    nd = sum(1 for c in clubs if not has_data(c))
    print('Wrote %s' % OUT)
    print('  %d clubs (%d with data, %d no data submitted)' % (len(clubs), len(clubs) - nd, nd))
    print('  %d outlier values flagged across %d clubs'
          % (len(flat), len(set(f[0] for f in flat))))
    print('  %d suspected duplicate group(s): %s'
          % (len(dup_groups), ', '.join('%s=%s' % (l, '/'.join(m)) for l, m in dup_groups) or 'none'))


if __name__ == '__main__':
    main()
