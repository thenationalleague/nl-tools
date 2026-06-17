"""Commercial Benchmarking — build the RTDB payload from the cleaned dataset.

Reads the cleaned survey workbook (Data sheet) and produces ONE JSON file to
import into Firebase RTDB at  app-data/ops-commercial-benchmarking  :

    { "aggregates": {...},          # anonymised: stats + sorted `values`
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
import sys, json, secrets, csv, re
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Commercial_Benchmarking_Cleaned_v5.0.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'commercial-benchmarking-rtdb-import.json'
LINKS = sys.argv[3] if len(sys.argv) > 3 else 'commercial-benchmarking-links.csv'
BASE_URL = 'https://thenationalleague.github.io/tools/commercial-benchmarking/?t='
DIVS = ['National', 'North', 'South']

# Categorical profile chips: (key, label, column header)
CHIP_FIELDS = [
    ('progFormat', 'Programme format', 'Programme format'),
    ('rollingFront', 'Front Shirt — Rolling?', 'Front Shirt — Rolling?'),
    ('emailSupporters', 'Can email supporters?', 'Can email supporters?'),
    ('emailPartners', 'Can email on behalf of partners?', 'Can email on behalf of partners?'),
]


def num(v):
    return v if isinstance(v, (int, float)) else None


def parse_money_text(v):
    """Board-price columns are free text; accept a clean single number, else skip.
    Prose / ranges ('300-500', 'Same as above', 'From £600') -> None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(',', '')
    nums = re.findall(r'\d+(?:\.\d+)?', s)
    return float(nums[0]) if len(nums) == 1 else None


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

    # `values` is the full sorted, ANONYMISED list (one entry per responding
    # club, no names) — powers the graph view (one rising bar per club).
    return dict(count=n, min=vals[0], p25=round(q(.25), 2), median=round(q(.5), 2),
                p75=round(q(.75), 2), max=vals[-1], mean=round(sum(vals) / n, 2),
                values=[round(v, 2) for v in vals])


def pct_of(vals, x):
    vals = sorted(vals); n = len(vals)
    if not n or x is None:
        return None
    below = sum(1 for v in vals if v < x)
    eq = sum(1 for v in vals if v == x)
    return round(100 * (below + eq / 2) / n)


def build_metrics(H):
    """Each metric: dict(key,label,unit,desc,group, ext=fn(row)->number|None)."""
    def col(name):
        i = H[name]
        return lambda r: num(r[i])

    def board(name):
        i = H[name]
        return lambda r: parse_money_text(r[i])

    stand_i = [H['Stand %d — Income/season (£, ex-VAT)' % s] for s in (1, 2, 3, 4)]

    def stand_total(r):
        vs = [num(r[i]) for i in stand_i]
        vs = [x for x in vs if x is not None]
        return float(sum(vs)) if vs else None

    return [
        dict(key='msTicket', label='Matchday ticket', unit='£', group='Ticketing',
             desc='Highest-priced GA adult matchday ticket', ext=col('Top GA matchday ticket (£)')),
        dict(key='seasonTicket', label='Season ticket', unit='£', group='Ticketing',
             desc='Highest-priced GA adult season ticket', ext=col('Top GA season ticket (£)')),

        dict(key='frontShirt', label='Front-of-shirt income', unit='£', group='Shirt & kit sponsorship',
             desc='Per season, excluding VAT', ext=col('Front Shirt — Income/season (£, ex-VAT)')),
        dict(key='backShirt', label='Back-of-shirt income', unit='£', group='Shirt & kit sponsorship',
             desc='Per season, excluding VAT', ext=col('Back Shirt — Income/season (£, ex-VAT)')),
        dict(key='sleeve', label='Sleeve income', unit='£', group='Shirt & kit sponsorship',
             desc='Per season, excluding VAT', ext=col('Sleeve — Income/season (£, ex-VAT)')),
        dict(key='frontTerm', label='Front-shirt deal length', unit=' yrs', group='Shirt & kit sponsorship',
             desc='Contract length in years', ext=col('Front Shirt — Contract Length')),

        dict(key='standTotal', label='Stand sponsorship (total)', unit='£', group='Ground & stand advertising',
             desc='Combined income across all stand sponsors', ext=stand_total),
        dict(key='tvBoard', label='TV-facing board', unit='£', group='Ground & stand advertising',
             desc='Price per season (clean figures only)', ext=board('TV-facing board price/season (£)')),
        dict(key='nonTvBoard', label='Non-TV board', unit='£', group='Ground & stand advertising',
             desc='Price per season (clean figures only)', ext=board('Non-TV board price/season (£)')),

        dict(key='mdHosp', label='Matchday hospitality', unit='£', group='Hospitality',
             desc='Highest-priced matchday package', ext=col('Top matchday hospitality (£)')),
        dict(key='seasonHosp', label='Seasonal hospitality', unit='£', group='Hospitality',
             desc='Highest-priced seasonal package', ext=col('Top seasonal hospitality (£)')),

        dict(key='emailDb', label='Email database', unit='', group='Audience & reach',
             desc='Total contactable supporter emails', ext=col('Total email database size')),
        dict(key='optedIn', label='Opted-in to partner emails', unit='', group='Audience & reach',
             desc='Supporters opted in to partner emails', ext=col('Opted-in to partner emails')),
        dict(key='progAd', label='Programme advert', unit='£', group='Audience & reach',
             desc='Full-page seasonal advert', ext=col('Full-page programme advert/season (£)')),
    ]


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb['Data']
    rows = list(ws.iter_rows(values_only=True))
    hdr = rows[0]; data = rows[1:]
    H = {h: i for i, h in enumerate(hdr)}
    METRICS = build_metrics(H)

    # ---- anonymised aggregates (NO club names) ----
    agg = {}
    for m in METRICS:
        league = [v for v in (m['ext'](r) for r in data) if v is not None]
        entry = dict(label=m['label'], unit=m['unit'], desc=m['desc'], group=m['group'], scopes={})
        entry['scopes']['league'] = stats(league)
        for d in DIVS:
            dv = [v for v in (m['ext'](r) for r in data if r[1] == d) if v is not None]
            entry['scopes'][d] = stats(dv)
        agg[m['key']] = entry

    def dist(col):
        c = {}
        for r in data:
            v = r[H[col]]
            if v is None or str(v).strip() == '':
                continue
            key = str(v).strip()
            c[key] = c.get(key, 0) + 1
        return c

    chips = {ck: dist(col) for ck, _lbl, col in CHIP_FIELDS}
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
        for m in METRICS:
            v = m['ext'](r)
            league = [x for x in (m['ext'](rr) for rr in data) if x is not None]
            dv = [x for x in (m['ext'](rr) for rr in data if rr[1] == div) if x is not None]
            metrics[m['key']] = {'value': v, 'divPct': pct_of(dv, v), 'leaguePct': pct_of(league, v)}
        dash[token] = {
            'club': club,
            'division': div,
            'fsSponsor': r[H['Front Shirt — Sponsor Name']] or '',
            'metrics': metrics,
            'chips': {ck: (r[H[col]] or '') for ck, _lbl, col in CHIP_FIELDS},
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

    print('Wrote %s  (%d metrics, %d club nodes)' % (OUT, len(METRICS), len(dash)))
    print('Wrote %s' % LINKS)
    print('Import at RTDB node: app-data/ops-commercial-benchmarking')


if __name__ == '__main__':
    main()
