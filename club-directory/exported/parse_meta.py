"""Parse per-club PDF text into structured fields for clubs-meta enrichment."""
import os, re, json

PAGE_DIR = '/tmp/club_pages'

def parse_club(text, club_name):
    out = {
        'address': None,
        'fa_membership': None,
        'kit': {'home': {}, 'away': {}, 'gk': {}},
        'pitch': {'dimensions': None, 'type': None},
        'capacity': {'total': None, 'seated': None},
        'sponsors': {'main_club': None, 'main_shirt': None, 'left_sleeve': None},
        'nearest_station': None,
        'distance_to_station': None,
    }
    lines = [l.rstrip() for l in text.split('\n')]

    # ----- Address -----
    # The address is the line(s) immediately preceding the club's main
    # contact line ("T 0…  E …  www.club.co.uk") at the bottom of the page.
    # That contact line is the only one that has BOTH @ and a www. domain.
    contact_idx = None
    for i, l in enumerate(lines):
        s = l.strip()
        if re.match(r'^[TM]\s+0', s) and 'www.' in s.lower() and '@' in s:
            contact_idx = i  # keep last match, but in practice only one line matches
    if contact_idx is not None:
        addr_lines = []
        # Walk back, collecting non-empty lines until we hit a CAPS-only header,
        # or one of the structured fields, or a person-row marker.
        STOP = {'CONTACTS','GOALKEEPER JERSEY','HOME KIT','AWAY KIT','CHAIRMAN',
                'MANAGER','DIRECTORS','FA MEMBERSHIP','PITCH DIMENSIONS','PITCH TYPE',
                'ENTERPRISE NATIONAL LEAGUE','ENTERPRISE NATIONAL LEAGUE NORTH',
                'ENTERPRISE NATIONAL LEAGUE SOUTH'}
        for j in range(contact_idx - 1, max(contact_idx - 6, -1), -1):
            s = lines[j].strip()
            if not s: continue
            if s in STOP or s.upper() in STOP: break
            if s.isupper() and len(s) > 4: break  # club-name heading
            # Stop at any line that's somebody else's contact info bleeding in
            if re.search(r'\b[TMB]\s+0\d', s) or '@' in s: break
            addr_lines.insert(0, s)
            # Address may span 2 lines — keep walking until we hit a heading.
        if addr_lines:
            addr = ' '.join(addr_lines).strip()
            for old, new in [('S050 9HT','SO50 9HT'),
                             ('COmmunity','Community'),
                             ('Stadum','Stadium')]:
                addr = addr.replace(old, new)
            m = re.search(r'\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d)\s*([A-Z]{2})\b', addr)
            if m:
                addr = addr[:m.start()] + f'{m.group(1)} {m.group(2)}{m.group(3)}' + addr[m.end():]
            out['address'] = addr

    # ----- Single-value labelled fields -----
    def grab(label, multiline=False):
        pat = re.compile(r'^\s*' + re.escape(label) + r'\s+(.+?)\s*$', re.IGNORECASE)
        for l in lines:
            m = pat.match(l)
            if m: return m.group(1).strip()
        return None

    cap = grab('Total Stadium Capacity')
    if cap and cap.isdigit(): out['capacity']['total'] = int(cap)
    seats = grab('Number of covered seats')
    if seats and seats.isdigit(): out['capacity']['seated'] = int(seats)
    out['sponsors']['main_club'] = grab('Main Club sponsor')
    out['sponsors']['main_shirt'] = grab('Main Shirt sponsor')
    out['sponsors']['left_sleeve'] = grab('Left Sleeve sponsor')
    out['nearest_station'] = grab('Nearest railway station')
    out['distance_to_station'] = grab('Distance from ground')

    # ----- FA membership -----
    # PyMuPDF reflow scatters this line; it isn't always next to the header.
    # Match any line that looks like a county-FA / football-association statement.
    fa_re = re.compile(
        r'(Member\s+of\b.*?(FA|Football Association)|'
        r'Associate\s+member\b.*|'
        r'Full\s+member\b.*|'
        r'Football Association of\b.*|'
        r'ENGLISH FA)',
        re.IGNORECASE)
    for l in lines:
        s = l.strip()
        if fa_re.search(s):
            # If the match runs onto next line ("...member of the\nLincolnshire FA"),
            # grab up to one continuation line.
            out['fa_membership'] = s.rstrip('.')
            break
    # Two-line form: "Associate member of the FA and member of the\nLincolnshire FA"
    if out['fa_membership'] and out['fa_membership'].rstrip().endswith(('the','and')):
        idx = next((i for i,l in enumerate(lines) if l.strip() == out['fa_membership']), None)
        if idx is not None and idx + 1 < len(lines):
            out['fa_membership'] = (out['fa_membership'] + ' ' + lines[idx+1].strip()).rstrip('.')

    # ----- Pitch dimensions / type -----
    for i, l in enumerate(lines):
        if l.strip() == 'PITCH DIMENSIONS' and i+1 < len(lines):
            out['pitch']['dimensions'] = lines[i+1].strip() or None
        if l.strip() == 'PITCH TYPE' and i+1 < len(lines):
            out['pitch']['type'] = lines[i+1].strip() or None

    # ----- Kit ----- The PDF prints this as alternating Shirts/<col>/Shorts/<col>/Socks/<col>
    # blocks: home block, then away block. There may also be a GK first/second choice line.
    kit_blocks = []
    cur = {}
    cur_label = None
    for l in lines:
        s = l.strip()
        if s in ('Shirts','Shorts','Socks'):
            cur_label = s.lower()
        elif cur_label and s and s != 'GOALKEEPER JERSEY' and not s.isupper():
            cur[cur_label] = s
            cur_label = None
            if len(cur) == 3:
                kit_blocks.append(cur); cur = {}
    if len(kit_blocks) >= 1: out['kit']['home'] = kit_blocks[0]
    if len(kit_blocks) >= 2: out['kit']['away'] = kit_blocks[1]

    # GK: usually "First choice: X. Second choice: Y" — but PDF reflow can drop the dot.
    for l in lines:
        s = l.strip()
        m = re.match(r'First choice[:\s]+(.+?)(?:[.\s]+Second choice[:\s]+(.+))?$',
                     s, re.IGNORECASE)
        if m:
            first = m.group(1).strip().rstrip('.')
            second = (m.group(2) or '').strip().rstrip('.')
            # Sometimes both end up in `first` joined by "  Second choice:"
            if not second and 'Second choice' in first:
                a, b = first.split('Second choice', 1)
                first = a.strip().rstrip(':.,')
                second = b.lstrip(':.,').strip()
            if first: out['kit']['gk']['first'] = first
            if second: out['kit']['gk']['second'] = second
            break

    # Drop empty inner dicts
    if not any(out['kit']['home'].values()): out['kit']['home'] = None
    if not any(out['kit']['away'].values()): out['kit']['away'] = None
    if not any(out['kit']['gk'].values()): out['kit']['gk'] = None
    if not any(v for v in out['pitch'].values()): out['pitch'] = None
    if not any(v for v in out['capacity'].values()): out['capacity'] = None
    if not any(v for v in out['sponsors'].values()): out['sponsors'] = None

    return out

if __name__ == '__main__':
    # Mapping from clubs-meta name → PDF-page filename safe-form
    NAME_TO_FILE = {}  # build below

    with open('/home/user/tools/assets/data/clubs-meta.json') as f:
        meta = json.load(f)

    out = {}
    for c in meta['clubs']:
        name = c['name']
        # Try direct, then aliases
        candidates = [name, name.replace("'", '’'), name.replace('-super-', '-Super-')]
        if name == 'Ebbsfleet United':
            candidates.append('Ebbsfleet United FC')
        text = None
        for cand in candidates:
            safe = re.sub(r'[^A-Za-z0-9]+', '_', cand)
            fp = f'{PAGE_DIR}/{safe}.txt'
            if os.path.exists(fp):
                text = open(fp).read()
                break
        if text is None:
            print(f'NO PDF for {name}')
            continue
        out[name] = parse_club(text, name)

    with open('/tmp/parsed_meta.json', 'w') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f'Parsed {len(out)} clubs')
