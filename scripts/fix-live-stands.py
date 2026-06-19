"""Commercial Benchmarking — remove placeholder stands from the LIVE data.

The site used to count blank / "0" / "vacant" stand slots as real stands,
inflating each club's stand count and dragging down the average per stand.
The pipeline + editor are now fixed, but the figures already in RTDB need
correcting too. This script takes a JSON export of the live data and rewrites
the stand data the right way — placeholder stands are genuinely dropped, not
reinterpreted — then recomputes the three stand benchmarks and the stand
sector mix that depend on them.

Input may be the whole node  app-data/ops-commercial-benchmarking  (with
`clubs`, `aggregates`, optionally `links`) or just its `clubs` child.

Outputs:
  *-clubs.json       corrected `clubs` node (paste over clubs/)
  *-patch.json       RTDB merge-patch: every changed stand field + the
                     recomputed stand aggregates (apply with one update()).
  *-links.json       corrected `links` node (only if links were in the input)

Usage:
    python scripts/fix-live-stands.py <export.json> [out-prefix]

Nothing is committed; the files name clubs. Treat as confidential.
"""
import sys, json, re

SRC = sys.argv[1] if len(sys.argv) > 1 else 'clubs.json'
PREFIX = sys.argv[2] if len(sys.argv) > 2 else 'commercial-benchmarking-stand-fix'
DIVS = ['National', 'North', 'South']
JUNK = re.compile(r'^(0|-|–|—|n/?a|none|nil|tbc|tbd|n\.?a\.?|vacant)$', re.I)


def clean_name(v):
    s = str(v if v is not None else '').strip()
    return '' if JUNK.match(s) else s


def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def real_stands(stands):
    out = []
    for sd in stands or []:
        if not isinstance(sd, dict):
            continue
        nm = clean_name(sd.get('name'))
        inc = num(sd.get('income'))
        if nm or (inc is not None and inc > 0):
            out.append({'name': nm or '—', 'sector': str(sd.get('sector') or '').strip(), 'income': sd.get('income')})
    return out


def stats(vals):
    vals = sorted(vals)
    n = len(vals)
    if not n:
        return None

    def q(p):
        if n == 1:
            return vals[0]
        idx = p * (n - 1)
        lo = int(idx); hi = min(lo + 1, n - 1)
        return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo)
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


def main():
    with open(SRC, encoding='utf-8') as f:
        doc = json.load(f)
    full = isinstance(doc, dict) and 'clubs' in doc and isinstance(doc['clubs'], dict)
    clubs = doc['clubs'] if full else doc
    links = doc.get('links') if full else None
    agg = (doc.get('aggregates') or {}) if full else {}

    patch = {}
    changes = []
    for name, c in clubs.items():
        if not isinstance(c, dict):
            continue
        old_n = ((c.get('metrics') or {}).get('standCount') or {}).get('value')
        stands = real_stands(c.get('stands'))
        incomes = [num(s['income']) for s in stands if num(s['income']) is not None]
        total = float(sum(incomes)) if incomes else None
        count = float(len(stands))
        avg = (total / count) if (total is not None and count) else None
        secs = ' | '.join(s['sector'] for s in stands if s['sector'])

        c['stands'] = stands
        c['standSectors'] = secs
        m = c.setdefault('metrics', {})
        for k, v in (('standCount', count), ('standTotal', total), ('standAvg', avg)):
            m.setdefault(k, {})['value'] = v
        patch['clubs/%s/stands' % name] = stands
        patch['clubs/%s/standSectors' % name] = secs
        if old_n != count:
            changes.append((name, old_n, count))

    # recompute the three stand benchmarks (scopes + per-club percentiles)
    def by(div_filter):
        return lambda key: [c['metrics'][key]['value'] for c in clubs.values()
                            if isinstance(c, dict) and div_filter(c) and c.get('metrics', {}).get(key, {}).get('value') is not None]
    for key in ('standCount', 'standTotal', 'standAvg'):
        league = by(lambda c: True)(key)
        scopes = {'league': stats(league)}
        for d in DIVS:
            scopes[d] = stats(by(lambda c, d=d: c.get('division') == d)(key))
        scopes['Step2'] = stats(by(lambda c: c.get('division') in ('North', 'South'))(key))
        if agg.get('aggregates', {}).get(key):
            agg['aggregates'][key]['scopes'] = scopes
        patch['aggregates/aggregates/%s/scopes' % key] = scopes
        for name, c in clubs.items():
            if not isinstance(c, dict):
                continue
            m = c.get('metrics', {}).get(key)
            if not m:
                continue
            v = m.get('value')
            m['divPct'] = pct_of(scopes.get(c.get('division'), {}).get('values', []) if scopes.get(c.get('division')) else [], v)
            m['leaguePct'] = pct_of((scopes['league'] or {}).get('values', []), v)
            if c.get('division') in ('North', 'South'):
                m['step2Pct'] = pct_of((scopes['Step2'] or {}).get('values', []), v)
            patch['clubs/%s/metrics/%s' % (name, key)] = m

    # stand sector mix
    sd = {}
    for c in clubs.values():
        if not isinstance(c, dict):
            continue
        for p in (c.get('standSectors') or '').split('|'):
            p = p.strip()
            if p:
                sd[p] = sd.get(p, 0) + 1
    sector_stand = sorted([{'label': k, 'count': v} for k, v in sd.items()], key=lambda x: -x['count'])
    patch['aggregates/sectors/stand'] = sector_stand
    if agg.get('sectors') is not None:
        agg['sectors']['stand'] = sector_stand

    # mirror clubs corrections into links (matched by club name) if present
    if isinstance(links, dict):
        by_name = {c.get('club'): c for c in clubs.values() if isinstance(c, dict)}
        for tok, p in links.items():
            if isinstance(p, dict) and p.get('club') in by_name:
                src = by_name[p['club']]
                p['stands'] = src['stands']; p['standSectors'] = src['standSectors']
                for k in ('standCount', 'standTotal', 'standAvg'):
                    if src['metrics'].get(k):
                        p.setdefault('metrics', {})[k] = src['metrics'][k]
                patch['links/%s/stands' % tok] = src['stands']
                patch['links/%s/standSectors' % tok] = src['standSectors']
                for k in ('standCount', 'standTotal', 'standAvg'):
                    if src['metrics'].get(k):
                        patch['links/%s/metrics/%s' % (tok, k)] = src['metrics'][k]

    json.dump(clubs, open(PREFIX + '-clubs.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(patch, open(PREFIX + '-patch.json', 'w'), ensure_ascii=False, indent=1)
    if isinstance(links, dict):
        json.dump(links, open(PREFIX + '-links.json', 'w'), ensure_ascii=False, indent=1)

    print('Corrected %d clubs; %d had their stand count change:' % (len(clubs), len(changes)))
    for name, o, n in sorted(changes, key=lambda x: x[0]):
        print('  %-22s %s -> %d real stand(s)' % (name, int(o) if isinstance(o, (int, float)) else o, int(n)))
    print('\nWrote %s-clubs.json, %s-patch.json%s'
          % (PREFIX, PREFIX, (', %s-links.json' % PREFIX) if isinstance(links, dict) else ' (no links in input)'))


if __name__ == '__main__':
    main()
