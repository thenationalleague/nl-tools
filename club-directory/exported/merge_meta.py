"""Merge PDF-parsed fields into clubs-meta.json. Preserve existing fields;
flag any disagreements with the parsed values."""
import json, re

with open('/home/user/tools/assets/data/clubs-meta.json') as f:
    meta = json.load(f)
with open('/tmp/parsed_meta.json') as f:
    parsed = json.load(f)

NAME_MAP = {'Weston-super-Mare': 'Weston-super-Mare'}  # placeholder

flags = []

for c in meta['clubs']:
    name = c['name']
    p = parsed.get(name)
    if not p:
        flags.append((name, 'NO_PDF_DATA', '', ''))
        continue

    # ----- Address -----
    if p.get('address'):
        # Compare postcode in parsed address vs existing meta postcode
        m = re.search(r'\b([A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2})\b', p['address'])
        parsed_pc = (m.group(1) if m else '').replace(' ','').upper()
        existing_pc = (c.get('postcode','') or '').replace(' ','').upper()
        if parsed_pc and existing_pc and parsed_pc != existing_pc:
            flags.append((name, 'POSTCODE_DISAGREES',
                          f'meta postcode={c.get("postcode")}',
                          f'PDF address postcode={m.group(1)} ({p["address"]!r})'))
        c['address'] = p['address']

    # ----- FA membership -----
    if p.get('fa_membership'):
        c['fa_membership'] = p['fa_membership']

    # ----- Kit -----
    if p.get('kit'):
        c['kit'] = p['kit']

    # ----- Pitch -----
    if p.get('pitch'):
        c['pitch'] = p['pitch']

    # ----- Capacity -----
    # Keep existing 'capacity' int as-is. Add 'capacity_seated' from PDF.
    cap = p.get('capacity') or {}
    if cap.get('seated'):
        c['capacity_seated'] = cap['seated']
    if cap.get('total') and c.get('capacity') and abs(cap['total'] - c['capacity']) > 0:
        flags.append((name, 'CAPACITY_DISAGREES',
                      f'meta capacity={c["capacity"]}',
                      f'PDF total={cap["total"]}'))

    # ----- Sponsors (free-text strings) -----
    if p.get('sponsors'):
        sp = {k: v for k, v in p['sponsors'].items() if v}
        if sp: c['sponsors'] = sp

    # ----- Station -----
    if p.get('nearest_station'):
        ns = p['nearest_station']
        existing_stations = c.get('station') or []
        # Lowercase compare; if PDF station is a member of existing list, no diff
        if not any(ns.lower().startswith(s.lower()) or s.lower() in ns.lower()
                   for s in existing_stations):
            flags.append((name, 'STATION_DISAGREES',
                          f'meta stations={existing_stations}',
                          f'PDF nearest={ns!r}'))
    if p.get('distance_to_station'):
        c['distance_to_station'] = p['distance_to_station']

# Bump version
meta['version'] = 'v1.6'

with open('/home/user/tools/assets/data/clubs-meta.json', 'w') as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)

print(f'Updated clubs-meta.json. {len(flags)} disagreements flagged.')
for f_ in flags:
    print(' |'.join(str(x) for x in f_))
