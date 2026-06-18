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
import sys, os, json, secrets, csv, re, hmac, hashlib, base64
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Commercial_Benchmarking_Cleaned_v5.0.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'commercial-benchmarking-rtdb-import.json'
LINKS = sys.argv[3] if len(sys.argv) > 3 else 'commercial-benchmarking-links.csv'
PATCH = sys.argv[4] if len(sys.argv) > 4 else 'commercial-benchmarking-sector-patch.json'
BASE_URL = 'https://thenationalleague.github.io/tools/commercial-benchmarking/link.html?t='
DIVS = ['National', 'North', 'South']

# Capability tokens are derived deterministically from the club name + a secret
# salt, so re-running this (e.g. after a data correction) yields the SAME tokens
# and never breaks links already sent to clubs. Keep CB_TOKEN_SALT secret and
# constant. With no salt set, tokens are random (NOT stable) — fine for a
# throwaway run, never for one whose links get distributed.
SALT = os.environ.get('CB_TOKEN_SALT', '').encode('utf-8')


def make_token(club):
    if not SALT:
        return secrets.token_urlsafe(24)
    dig = hmac.new(SALT, club.encode('utf-8'), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(dig).decode('ascii').rstrip('=')[:32]

# Categorical profile chips: (key, label, column header)
CHIP_FIELDS = [
    ('progFormat', 'Programme format', 'Programme format'),
    ('rollingFront', 'Front Shirt — Rolling?', 'Front Shirt — Rolling?'),
    ('rollingBack', 'Back Shirt — Rolling?', 'Back Shirt — Rolling?'),
    ('rollingSleeve', 'Sleeve — Rolling?', 'Sleeve — Rolling?'),
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
    stand_name_i = [H['Stand %d — Sponsor Name' % s] for s in (1, 2, 3, 4)]

    def stand_total(r):
        vs = [num(r[i]) for i in stand_i]
        vs = [x for x in vs if x is not None]
        return float(sum(vs)) if vs else None

    def stand_count(r):
        n = 0
        for ni, ii in zip(stand_name_i, stand_i):
            nm = r[ni]
            if (nm is not None and str(nm).strip() != '') or isinstance(r[ii], (int, float)):
                n += 1
        return float(n)

    return [
        dict(key='msTicket', label='Matchday ticket', unit='£', group='Ticketing',
             desc='Highest-priced GA adult matchday ticket', ext=col('Top GA matchday ticket (£)')),
        dict(key='seasonTicket', label='Season ticket', unit='£', group='Ticketing',
             desc='Highest-priced GA adult season ticket', ext=col('Top GA season ticket (£)')),

        dict(key='frontShirt', label='Front-of-shirt income', unit='£', group='Shirt & kit sponsorship',
             desc='Per season, excluding VAT', ext=col('Front Shirt — Income/season (£, ex-VAT)')),
        dict(key='frontTerm', label='Front-shirt deal length', unit=' yrs', group='Shirt & kit sponsorship',
             desc='Contract length in years', ext=col('Front Shirt — Contract Length')),
        dict(key='backShirt', label='Back-of-shirt income', unit='£', group='Shirt & kit sponsorship',
             desc='Per season, excluding VAT', ext=col('Back Shirt — Income/season (£, ex-VAT)')),
        dict(key='backTerm', label='Back-shirt deal length', unit=' yrs', group='Shirt & kit sponsorship',
             desc='Contract length in years', ext=col('Back Shirt — Contract Length')),
        dict(key='sleeve', label='Sleeve income', unit='£', group='Shirt & kit sponsorship',
             desc='Per season, excluding VAT', ext=col('Sleeve — Income/season (£, ex-VAT)')),
        dict(key='sleeveTerm', label='Sleeve deal length', unit=' yrs', group='Shirt & kit sponsorship',
             desc='Contract length in years', ext=col('Sleeve — Contract Length')),

        dict(key='standCount', label='Stand sponsors', unit='', group='Ground & stand advertising',
             desc='Number of stand/ground sponsors sold (0–4)', ext=stand_count),
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

        dict(key='emailDb', label='Email database', unit='', group='Email & audience',
             desc='Total contactable supporter emails', ext=col('Total email database size')),
        dict(key='optedIn', label='Opted-in to partner emails', unit='', group='Email & audience',
             desc='Supporters opted in to partner emails', ext=col('Opted-in to partner emails')),
        dict(key='progAd', label='Programme advert', unit='£', group='Programme',
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
        # Step 2 = National League North + South combined.
        s2 = [v for v in (m['ext'](r) for r in data if r[1] in ('North', 'South')) if v is not None]
        entry['scopes']['Step2'] = stats(s2)
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

    # Sponsor sector distributions (front/back/sleeve). Multi-valued fields are
    # " | "-split and counted per sector. Anonymised — counts only, no names.
    def sector_dist(col):
        # Returned as a sorted LIST of {label, count} — sector names are free
        # text (e.g. they can contain '.'), which is illegal in an RTDB key.
        d = {}
        for r in data:
            v = r[H[col]]
            if v is None or str(v).strip() == '':
                continue
            for p in str(v).split('|'):
                p = p.strip()
                if p:
                    d[p] = d.get(p, 0) + 1
        return sorted([{'label': k, 'count': v} for k, v in d.items()], key=lambda x: -x['count'])
    sectors = {
        'front': sector_dist('Front Shirt — Sector'),
        'back': sector_dist('Back Shirt — Sector'),
        'sleeve': sector_dist('Sleeve — Sector'),
    }

    meta = {'leagueN': len(data),
            'divN': {d: sum(1 for r in data if r[1] == d) for d in DIVS}}
    aggregates = {'meta': meta, 'aggregates': agg, 'chips': chips, 'sectors': sectors}

    # ---- per-club payloads, served two ways ----
    #   clubs/<club name>   read by logged-in staff (all) or the matching club
    #   links/<token>       public read at the known token path (no login)
    # Both carry the same payload so each access path is self-contained.
    clubs = {}
    links = {}
    link_rows = []
    # Additive merge-patch: only the NEW keys (sectors, standCount metric,
    # per-club sector fields + standCount). Applied with a single RTDB update()
    # it adds these without overwriting any figures corrected live in the tool.
    patch = {'aggregates/sectors': sectors, 'aggregates/aggregates/standCount': agg['standCount']}
    # Step 2 scope for every other metric (standCount's full object already carries it).
    for k in agg:
        if k != 'standCount':
            patch['aggregates/aggregates/' + k + '/scopes/Step2'] = agg[k]['scopes']['Step2']
    for r in data:
        club = r[0]; div = r[1]
        is_step2 = div in ('North', 'South')
        metrics = {}
        for m in METRICS:
            v = m['ext'](r)
            league = [x for x in (m['ext'](rr) for rr in data) if x is not None]
            dv = [x for x in (m['ext'](rr) for rr in data if rr[1] == div) if x is not None]
            entry = {'value': v, 'divPct': pct_of(dv, v), 'leaguePct': pct_of(league, v)}
            if is_step2:
                s2 = [x for x in (m['ext'](rr) for rr in data if rr[1] in ('North', 'South')) if x is not None]
                entry['step2Pct'] = pct_of(s2, v)
            metrics[m['key']] = entry
        # extra fields beyond the original payload (additive — included in patch)
        extra = {
            'bsSponsor': r[H['Back Shirt — Sponsor Name']] or '',
            'slSponsor': r[H['Sleeve — Sponsor Name']] or '',
            'fsSector': r[H['Front Shirt — Sector']] or '',
            'bsSector': r[H['Back Shirt — Sector']] or '',
            'slSector': r[H['Sleeve — Sector']] or '',
        }
        payload = dict({
            'club': club,
            'division': div,
            'fsSponsor': r[H['Front Shirt — Sponsor Name']] or '',
            'metrics': metrics,
            'chips': {ck: (r[H[col]] or '') for ck, _lbl, col in CHIP_FIELDS},
        }, **extra)
        clubs[club] = payload
        token = make_token(club)
        links[token] = payload
        link_rows.append((club, div, BASE_URL + token))
        for base in ('clubs/' + club, 'links/' + token):
            patch[base + '/metrics/standCount'] = metrics['standCount']
            for sk, sv in extra.items():
                patch[base + '/' + sk] = sv
            if is_step2:
                for mk in metrics:
                    if mk != 'standCount':
                        patch[base + '/metrics/' + mk + '/step2Pct'] = metrics[mk]['step2Pct']

    out = {'aggregates': aggregates, 'clubs': clubs, 'links': links}
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    with open(PATCH, 'w') as f:
        json.dump(patch, f, ensure_ascii=False, indent=1)
    with open(LINKS, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Club', 'Division', 'Dashboard link (no login)'])
        for row in sorted(link_rows, key=lambda x: (DIVS.index(x[1]), x[0])):
            w.writerow(row)

    print('Wrote %s  (%d metrics, %d clubs)' % (OUT, len(METRICS), len(clubs)))
    print('Wrote %s  (edit-safe additive patch, %d paths)' % (PATCH, len(patch)))
    print('Wrote %s' % LINKS)
    print('Tokens: %s' % ('STABLE (salted)' if SALT else 'RANDOM — set CB_TOKEN_SALT for stable links'))
    print('Import at RTDB node: app-data/ops-commercial-benchmarking')


if __name__ == '__main__':
    main()
