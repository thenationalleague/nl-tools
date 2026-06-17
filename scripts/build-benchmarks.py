"""Commercial Benchmarking — build the RTDB payload from the cleaned dataset.

Reads the cleaned survey workbook (Data sheet) and produces ONE JSON file to
import into Firebase RTDB at  app-data/ops-commercial-benchmarking  :

    { "aggregates": {...},          # anonymised: medians / ranges / histograms
      "dash":      { "<token>": {...} } }   # one node per club, capability-keyed

NOTHING here is committed to the repo. The repo is a PUBLIC GitHub Pages site,
so all survey-derived data (anonymised aggregates included) is served from RTDB
at runtime, never baked into a committed file. Personal data was already
stripped by clean_survey.py; this script additionally never emits a club name
into the `aggregates` block — only the club's own `dash/<token>` node names it.

Usage:
    python scripts/build-benchmarks.py <cleaned.xlsx> <out-rtdb-import.json> [links.csv]

The links CSV (club, division, url) is the list of per-club dashboard links to
send to clubs. Tokens are unguessable; treat the CSV as confidential.
"""
import sys, json, secrets, csv, statistics
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Commercial_Benchmarking_Cleaned_v5.0.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'commercial-benchmarking-rtdb-import.json'
LINKS = sys.argv[3] if len(sys.argv) > 3 else 'commercial-benchmarking-links.csv'
BASE_URL = 'https://thenationalleague.github.io/tools/commercial-benchmarking/?t='

# Numeric metrics surfaced on the dashboard: (key, label, unit, desc, group, column header)
METRICS = [
    ('msTicket', 'Matchday ticket', '£', 'Highest-priced GA adult matchday ticket', 'Ticketing', 'Top GA matchday ticket (£)'),
    ('seasonTicket', 'Season ticket', '£', 'Highest-priced GA adult season ticket', 'Ticketing', 'Top GA season ticket (£)'),
    ('frontShirt', 'Front-of-shirt income', '£', 'Per season, excluding VAT', 'Sponsorship & hospitality', 'Front Shirt — Income/season (£, ex-VAT)'),
    ('backShirt', 'Back-of-shirt income', '£', 'Per season, excluding VAT', 'Sponsorship & hospitality', 'Back Shirt — Income/season (£, ex-VAT)'),
    ('sleeve', 'Sleeve income', '£', 'Per season, excluding VAT', 'Sponsorship & hospitality', 'Sleeve — Income/season (£, ex-VAT)'),
    ('mdHosp', 'Matchday hospitality', '£', 'Highest-priced matchday package', 'Sponsorship & hospitality', 'Top matchday hospitality (£)'),
    ('seasonHosp', 'Seasonal hospitality', '£', 'Highest-priced seasonal package', 'Sponsorship & hospitality', 'Top seasonal hospitality (£)'),
    ('emailDb', 'Email database', '', 'Total contactable supporter emails', 'Audience & reach', 'Total email database size'),
    ('optedIn', 'Opted-in to partner emails', '', 'Supporters opted in to partner emails', 'Audience & reach', 'Opted-in to partner emails'),
    ('progAd', 'Programme advert', '£', 'Full-page seasonal advert', 'Audience & reach', 'Full-page programme advert/season (£)'),
]
DIVS = ['National', 'North', 'South']


def num(v):
    return v if isinstance(v, (int, float)) else None


def stats(vals):
    vals = sorted(vals)
    n = len(vals)
    if n == 0:
        return None

    def q(p):
        if n == 1:
            return vals[0]
        idx = p * (n - 1)
        lo = int(idx); hi = min(lo + 1, n - 1); frac = idx - lo
        return vals[lo] + (vals[hi] - vals[lo]) * frac

    mn, mx = vals[0], vals[-1]
    bins = min(12, max(5, n // 4))
    if mx == mn:
        edges = [mn, mn + 1]; counts = [n]
    else:
        width = (mx - mn) / bins
        edges = [mn + i * width for i in range(bins + 1)]
        counts = [0] * bins
        for v in vals:
            b = min(int((v - mn) / width), bins - 1)
            counts[b] += 1
    return dict(count=n, min=mn, p25=round(q(.25), 2), median=round(q(.5), 2),
                p75=round(q(.75), 2), max=mx, mean=round(sum(vals) / n, 2),
                edges=[round(e, 2) for e in edges], counts=counts)


def pct_of(vals, x):
    vals = sorted(vals); n = len(vals)
    if not n or x is None:
        return None
    below = sum(1 for v in vals if v < x)
    eq = sum(1 for v in vals if v == x)
    return round(100 * (below + eq / 2) / n)


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb['Data']
    rows = list(ws.iter_rows(values_only=True))
    hdr = rows[0]; data = rows[1:]
    H = {h: i for i, h in enumerate(hdr)}

    # ---- anonymised aggregates (NO club names) ----
    agg = {}
    for key, label, unit, desc, group, col in METRICS:
        ci = H[col]
        league = [v for v in (num(r[ci]) for r in data) if v is not None]
        entry = dict(label=label, unit=unit, desc=desc, group=group, scopes={})
        entry['scopes']['league'] = stats(league)
        for d in DIVS:
            dv = [v for v in (num(r[ci]) for r in data if r[1] == d) if v is not None]
            entry['scopes'][d] = stats(dv)
        agg[key] = entry

    def dist(col):
        c = {}
        for r in data:
            v = r[H[col]]
            if v is None or str(v).strip() == '':
                continue
            c[str(v).strip()] = c.get(str(v).strip(), 0) + 1
        return c

    chips = {
        'progFormat': dist('Programme format'),
        'rollingFront': dist('Front Shirt — Rolling?'),
        'emailPartners': dist('Can email on behalf of partners?'),
    }
    meta = {'leagueN': len(data),
            'divN': {d: sum(1 for r in data if r[1] == d) for d in DIVS}}
    aggregates = {'meta': meta, 'aggregates': agg, 'chips': chips}

    # ---- per-club dash nodes (capability-keyed) ----
    dash = {}
    links = []
    for r in data:
        club = r[0]; div = r[1]
        token = secrets.token_urlsafe(24)
        metrics = {}
        for key, label, unit, desc, group, col in METRICS:
            ci = H[col]
            v = num(r[ci])
            league = [x for x in (num(rr[ci]) for rr in data) if x is not None]
            dv = [x for x in (num(rr[ci]) for rr in data if rr[1] == div) if x is not None]
            metrics[key] = {'value': v,
                            'divPct': pct_of(dv, v),
                            'leaguePct': pct_of(league, v)}
        dash[token] = {
            'club': club,
            'division': div,
            'fsSponsor': r[H['Front Shirt — Sponsor Name']] or '',
            'metrics': metrics,
            'chips': {
                'progFormat': r[H['Programme format']] or '',
                'rollingFront': r[H['Front Shirt — Rolling?']] or '',
                'emailPartners': r[H['Can email on behalf of partners?']] or '',
            },
        }
        links.append((club, div, BASE_URL + token))

    payload = {'aggregates': aggregates, 'dash': dash}
    with open(OUT, 'w') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    with open(LINKS, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Club', 'Division', 'Dashboard link'])
        for row in sorted(links, key=lambda x: (DIVS.index(x[1]), x[0])):
            w.writerow(row)

    print(f'Wrote {OUT}  ({len(dash)} club nodes)')
    print(f'Wrote {LINKS}')
    print('Import {OUT} at RTDB node: app-data/ops-commercial-benchmarking'.format(OUT=OUT))


if __name__ == '__main__':
    main()
