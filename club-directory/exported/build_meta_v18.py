"""Rebuild assets/data/clubs-meta.json v1.7 -> v1.8 for the 2026/27 roster.

Authoritative input: 2026-roster.psv (supplied by NL, 72 clubs).

Merge rules (conservative — see club-directory chat 2026-06-09):
  - ALL 72 clubs: set/refresh `division`, `nickname` (NEW), `lat`/`lng` (NEW)
    from the roster file.
  - Retained clubs (in both old meta and new roster): keep every existing
    field (code, short, domain, optaID, colors, stadium_*, capacity*, pitch,
    address, postcode, station, fa_membership, kit, sponsors). Do NOT
    overwrite them from the roster — only report divergences.
  - New clubs (in roster, not in old meta): build a fresh record from the
    roster fields only (name, code, short, nickname, division, domain,
    address, postcode, lat, lng). Rich fields are omitted — clubs/NL fill
    them in later.
  - Leavers (in old meta, not in roster): dropped.
Output preserves 2-space indent, ASCII (smart quotes normalised).
"""
import json, collections, os

ROOT = '/home/user/tools'
SRC  = os.path.join(ROOT, 'assets/data/clubs-meta.json')
PSV  = os.path.join(ROOT, 'club-directory/exported/2026-roster.psv')

def norm(s):
    return (s.replace('’', "'").replace('‘', "'")
             .replace('“', '"').replace('”', '"').strip())

wrap = json.load(open(SRC, encoding='utf-8'))
existing = {c['name']: c for c in wrap['clubs']}

rows = []
for line in open(PSV, encoding='utf-8'):
    line = line.rstrip('\n')
    if not line or line.startswith('#'):
        continue
    f = [norm(x) for x in line.split('|')]
    name, division, lat, lng, code, domain, nickname, short, address, postcode = f
    rows.append(dict(name=name, division=division, lat=float(lat), lng=float(lng),
                     code=code, domain=domain, nickname=nickname, short=short,
                     address=address, postcode=postcode))

roster_names  = {r['name'] for r in rows}
existing_names = set(existing)
joiners = [r['name'] for r in rows if r['name'] not in existing_names]
leavers = sorted(n for n in existing_names if n not in roster_names)

KEY_ORDER = ['name', 'code', 'short', 'nickname', 'division', 'domain', 'optaID',
             'colors', 'stadium_name', 'stadium_sponsor_name', 'capacity',
             'capacity_seated', 'pitch', 'address', 'postcode', 'lat', 'lng',
             'station', 'fa_membership', 'kit', 'sponsors']

def ordered(d):
    o = collections.OrderedDict()
    for k in KEY_ORDER:
        if k in d:
            o[k] = d[k]
    for k in d:  # any unforeseen extras keep, appended
        if k not in o:
            o[k] = d[k]
    return o

DIV_FIELDS = ['code', 'short', 'domain', 'address', 'postcode']
out, moves, divergences = [], [], []

for r in rows:
    name = r['name']
    if name in existing:
        rec = dict(existing[name])                 # keep all existing fields
        if rec.get('division') != r['division']:
            moves.append((name, rec.get('division'), r['division']))
        rec['division'] = r['division']
        rec['nickname'] = r['nickname']
        rec['lat'] = r['lat']
        rec['lng'] = r['lng']
        for fld in DIV_FIELDS:                      # report, don't overwrite
            ev, tv = rec.get(fld), r[fld]
            if ev not in (None, '') and tv != ev:
                divergences.append((name, fld, ev, tv))
        out.append(ordered(rec))
    else:
        out.append(ordered(dict(
            name=name, code=r['code'], short=r['short'], nickname=r['nickname'],
            division=r['division'], domain=r['domain'],
            address=r['address'], postcode=r['postcode'], lat=r['lat'], lng=r['lng'])))

wrap['version'] = 'v1.8'
wrap['clubs'] = out

txt = json.dumps(wrap, ensure_ascii=False, indent=2) + '\n'
assert all(ord(ch) < 128 for ch in txt), 'non-ASCII leaked into output'
open(SRC, 'w', encoding='utf-8').write(txt)

# ---- report ----
print('clubs written :', len(out), '(was', len(existing), ')')
print('joiners (%d)   : %s' % (len(joiners), ', '.join(sorted(joiners))))
print('leavers (%d)   : %s' % (len(leavers), ', '.join(leavers)))
print('division moves (%d):' % len(moves))
for n, a, b in sorted(moves):
    print('   %-26s %s -> %s' % (n, a, b))
print('field divergences roster-vs-existing on retained clubs (%d) — NOT applied:' % len(divergences))
for n, fld, ev, tv in divergences:
    print('   %-26s %-9s existing=%r  roster=%r' % (n, fld, ev, tv))
