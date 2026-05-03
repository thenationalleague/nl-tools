"""
Build corrected CSVs from the inline window.CLUBS data + PDF, and produce an
issues report flagging discrepancies for manual review.

Outputs:
  /home/user/tools/club-directory/exported/clubs.csv
  /home/user/tools/club-directory/exported/people.csv
  /home/user/tools/club-directory/exported/issues.md
  /home/user/tools/club-directory/exported/clubs.json   (CSV-equivalent JSON)
"""
import json, re, os, csv, copy

with open('/tmp/clubs_raw.txt') as f:
    line = f.read()
m = re.search(r'window\.CLUBS\s*=\s*(\[.*\]);?\s*$', line)
clubs = json.loads(m.group(1))

with open('/home/user/tools/assets/data/clubs-meta.json') as f:
    meta_data = json.load(f)
meta = {c['name']: c for c in meta_data['clubs']}

NAME_MAP = {
    'Ebbsfleet United FC': 'Ebbsfleet United',
    'Weston-Super-Mare': 'Weston-super-Mare',
    'King’s Lynn Town': "King's Lynn Town",
}
def safe(c): return re.sub(r'[^A-Za-z0-9]+', '_', c)
def get_pdf(name):
    n = NAME_MAP.get(name, name)
    fp = f'/tmp/club_pages/{safe(n)}.txt'
    return open(fp).read() if os.path.exists(fp) else None

def get_meta(name):
    return meta.get(NAME_MAP.get(name, name))

EMAIL_RE = re.compile(r'[\w.+\-]+@[\w.\-]+\.[A-Za-z]{2,}')
def extract_phones(text):
    found = set()
    pats = [
        re.compile(r'\b0\d{10}\b'),
        re.compile(r'\b0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b'),
        re.compile(r'\b\d{4,5}\s+\d{5,7}\b'),
        re.compile(r'\b\d{3,5}\s+\d{3,4}\s+\d{3,4}\b'),
    ]
    for p in pats:
        for m in p.finditer(text):
            d = re.sub(r'\D','', m.group(0))
            if 10 <= len(d) <= 11:
                found.add(d)
    return found

# Re-extract address from PDF for cases where JSON address looks truncated
# or for sanity
def pdf_extract_address(pdf_text, club_name):
    """Returns address string or None."""
    if not pdf_text: return None
    lines = pdf_text.split('\n')
    heading_caps = club_name.upper()
    # Replace smart quote with straight in heading match
    heading_norm = heading_caps.replace("’", "'")
    for i, l in enumerate(lines):
        s = l.strip()
        if re.match(r'^T 0\d', s) and ('www' in s.lower() or '@' in s):
            # Walk back to address lines (until we hit a CAPS-only line)
            addr_lines = []
            j = i - 1
            while j >= 0 and (i - j) < 8:
                line = lines[j].strip()
                if line.isupper() and len(line) > 4 and not line.startswith('T '):
                    break
                if line:
                    addr_lines.insert(0, line)
                j -= 1
            if addr_lines:
                return ' '.join(addr_lines).strip()
    return None

# ------- Apply corrections -------
issues = []   # list of dicts {club, category, person, current, suggested, applied}

def add_issue(club, category, current, suggested, applied=False, person=''):
    issues.append({
        'club': club, 'category': category, 'person': person,
        'current': current, 'suggested': suggested, 'applied': applied,
    })

# Normalise club names with smart quotes
for c in clubs:
    if "’" in c['name']:
        new = c['name'].replace("’", "'")
        add_issue(c['name'], 'CLUB_NAME', c['name'], new, applied=True)
        c['name'] = new

# Normalize the special Ebbsfleet "FC" suffix
for c in clubs:
    if c['name'] == 'Ebbsfleet United FC':
        add_issue(c['name'], 'CLUB_NAME', 'Ebbsfleet United FC',
                  'Ebbsfleet United', applied=True)
        c['name'] = 'Ebbsfleet United'
    if c['name'] == 'Weston-Super-Mare':
        add_issue(c['name'], 'CLUB_NAME', 'Weston-Super-Mare',
                  'Weston-super-Mare', applied=True)
        c['name'] = 'Weston-super-Mare'

# Postcode format auto-fix and meta cross-check
def normalise_postcode(pc):
    """Insert space if missing. Return (normalized, was_fixed)."""
    pc = pc.strip()
    # collapse multiple spaces, also fold spaces inside the inward part
    pc = re.sub(r'\s+', ' ', pc)
    # Try with or without internal space in inward part: "3 UP" -> "3UP"
    m = re.match(r'^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d)\s*([A-Z]{2})$', pc.upper())
    if m:
        out = f'{m.group(1)} {m.group(2)}{m.group(3)}'
        return out, out != pc
    return pc, False

for c in clubs:
    addr = c.get('address_raw','') or ''
    # Common typo fixes in address text
    fixes = [
        ('S050 9HT', 'SO50 9HT'),
        ('COmmunity', 'Community'),
        ('Stadum', 'Stadium'),
        ('Frankc', 'Frank'),
    ]
    for old, new in fixes:
        if old in addr:
            addr2 = addr.replace(old, new)
            add_issue(c['name'], 'ADDR_TYPO', addr, addr2, applied=True)
            addr = addr2

    # Find any postcode in address (allow stray space inside inward) and normalize
    m = re.search(r'\b([A-Z]{1,2}\d[A-Z\d]?\s*\d\s*[A-Z]{2})\b', addr)
    if m:
        raw_pc = m.group(1)
        norm, fixed = normalise_postcode(raw_pc)
        if fixed:
            addr = addr[:m.start(1)] + norm + addr[m.end(1):]
            add_issue(c['name'], 'POSTCODE_FORMAT', raw_pc, norm, applied=True)

    # If address looks truncated (trailing comma or missing postcode), re-extract from PDF
    pdf_text = get_pdf(c['name'])
    has_pc = bool(re.search(r'\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b', addr))
    if addr.rstrip().endswith(',') or not has_pc:
        re_addr = pdf_extract_address(pdf_text, c['name'])
        if re_addr:
            # Apply small typo fixes too
            for old, new in fixes:
                re_addr = re_addr.replace(old, new)
            # Normalize postcode in re-extracted addr
            mm = re.search(r'\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b', re_addr)
            if mm:
                norm, fixed = normalise_postcode(mm.group(1))
                if fixed:
                    re_addr = re_addr[:mm.start(1)] + norm + re_addr[mm.end(1):]
            add_issue(c['name'], 'ADDR_TRUNCATED', addr, re_addr, applied=True)
            addr = re_addr

    c['address_raw'] = addr

    # Cross-check postcode with meta — flag, don't auto-fix
    m_pc = re.search(r'\b([A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2})\b', c['address_raw'])
    json_pc = m_pc.group(1) if m_pc else ''
    meta_obj = get_meta(c['name'])
    meta_pc = (meta_obj or {}).get('postcode','')
    if meta_pc and json_pc and json_pc.replace(' ','').upper() != meta_pc.replace(' ','').upper():
        # This is the address postcode in PDF differing from meta stadium postcode.
        # Could be groundshare/correspondence vs stadium — flag for review.
        add_issue(c['name'], 'POSTCODE_VS_META',
                  f'directory={json_pc}', f'meta stadium={meta_pc}',
                  applied=False)
    if not json_pc and meta_pc:
        add_issue(c['name'], 'NO_POSTCODE',
                  f'address: {addr!r}', f'meta stadium postcode: {meta_pc}',
                  applied=False)

    # Website Www. -> www.
    web = c.get('website') or ''
    if web.startswith('Www.'):
        new_web = 'www.' + web[4:]
        add_issue(c['name'], 'WEBSITE_CASE', web, new_web, applied=True)
        c['website'] = new_web

# Phone format normalization in club phone (collapse extra spaces)
for c in clubs:
    if c.get('phone'):
        new_p = re.sub(r'\s+', ' ', c['phone']).strip()
        if new_p != c['phone']:
            add_issue(c['name'], 'PHONE_FORMAT', c['phone'], new_p, applied=True)
            c['phone'] = new_p

# Per-club PDF cross-checks (flag, don't auto-fix)
for c in clubs:
    pdf_text = get_pdf(c['name'])
    if not pdf_text:
        add_issue(c['name'], 'NO_PDF_PAGE', '', 'PDF page not found', applied=False)
        continue
    pdf_emails = set(e.lower() for e in EMAIL_RE.findall(pdf_text))
    pdf_phones = extract_phones(pdf_text)

    cemail = (c.get('email') or '').lower()
    if cemail and cemail not in pdf_emails:
        same_dom = sorted(e for e in pdf_emails if e.split('@')[-1] == cemail.split('@')[-1])
        add_issue(c['name'], 'CLUB_EMAIL_MISMATCH', c.get('email',''),
                  f'PDF same-domain emails: {same_dom[:5]}', applied=False)

    cph_d = re.sub(r'\D','', c.get('phone') or '')
    if cph_d and cph_d not in pdf_phones:
        add_issue(c['name'], 'CLUB_PHONE_NOT_IN_PDF', c.get('phone',''),
                  f'PDF phones do not include this number — verify externally',
                  applied=False)

    for p in c.get('people', []):
        pe = (p.get('email') or '').lower()
        if pe and pe not in pdf_emails:
            same_dom = sorted(e for e in pdf_emails if e.split('@')[-1] == pe.split('@')[-1])
            add_issue(c['name'], 'PERSON_EMAIL_MISMATCH', p.get('email',''),
                      f'PDF same-domain emails: {same_dom[:5]}',
                      applied=False, person=p['name'])
        pp = re.sub(r'\D','', p.get('phone') or '')
        if pp and pp not in pdf_phones:
            add_issue(c['name'], 'PERSON_PHONE_MISMATCH', p.get('phone',''),
                      'PDF phones do not include this number',
                      applied=False, person=p['name'])

# ----- Write outputs -----
out_dir = '/home/user/tools/club-directory/exported'
os.makedirs(out_dir, exist_ok=True)

# clubs.csv (one row per club)
with open(f'{out_dir}/clubs.csv', 'w', newline='') as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL)
    w.writerow(['name','division','address_raw','phone','email','website'])
    for c in clubs:
        w.writerow([
            c['name'], c['division'], c.get('address_raw',''),
            c.get('phone','') or '', c.get('email','') or '', c.get('website','') or ''
        ])

# people.csv (one row per role per person — denormalised so multi-role people get multiple rows)
with open(f'{out_dir}/people.csv', 'w', newline='') as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL)
    w.writerow(['club','person_name','role_title','section','main','dept_head','email','phone','note'])
    for c in clubs:
        for p in c.get('people', []):
            for r in p.get('roles', []):
                w.writerow([
                    c['name'], p.get('name',''),
                    r.get('title',''), r.get('section',''),
                    'true' if r.get('main') else 'false',
                    'true' if r.get('deptHead') else 'false',
                    p.get('email','') or '',
                    p.get('phone','') or '',
                    p.get('note','') or '',
                ])

# clubs.json — corrected, ready for RTDB
with open(f'{out_dir}/clubs.json', 'w') as f:
    json.dump(clubs, f, indent=2, ensure_ascii=False)

# issues.md grouped by category
applied = [i for i in issues if i['applied']]
flags = [i for i in issues if not i['applied']]

def group_by(items, key):
    out = {}
    for i in items: out.setdefault(i[key], []).append(i)
    return out

with open(f'{out_dir}/issues.md', 'w') as f:
    f.write('# Club Directory — issues report\n\n')
    f.write(f'Source: inline `window.CLUBS` (in `index.html`) compared against the 2025/26 PDF and `clubs-meta.json`.\n\n')
    f.write(f'- Auto-corrected (already applied to `clubs.csv` / `clubs.json`): **{len(applied)}**\n')
    f.write(f'- Flagged for manual review: **{len(flags)}**\n\n')

    f.write('## Auto-corrections applied\n\n')
    by_cat = group_by(applied, 'category')
    order = ['CLUB_NAME','ADDR_TYPO','ADDR_TRUNCATED','POSTCODE_FORMAT','WEBSITE_CASE','PHONE_FORMAT']
    for cat in order + [c for c in by_cat if c not in order]:
        if cat not in by_cat: continue
        f.write(f'### {cat} ({len(by_cat[cat])})\n\n')
        for i in by_cat[cat]:
            f.write(f'- **{i["club"]}**\n')
            f.write(f'  - was: `{i["current"]}`\n')
            f.write(f'  - now: `{i["suggested"]}`\n')
        f.write('\n')

    f.write('## Flagged for manual review\n\n')
    by_cat = group_by(flags, 'category')
    order = ['POSTCODE_VS_META','NO_POSTCODE','CLUB_EMAIL_MISMATCH','CLUB_PHONE_NOT_IN_PDF',
            'PERSON_EMAIL_MISMATCH','PERSON_PHONE_MISMATCH','NO_PDF_PAGE']
    for cat in order + [c for c in by_cat if c not in order]:
        if cat not in by_cat: continue
        f.write(f'### {cat} ({len(by_cat[cat])})\n\n')
        for i in by_cat[cat]:
            who = f' / {i["person"]}' if i['person'] else ''
            f.write(f'- **{i["club"]}{who}**\n')
            f.write(f'  - directory: `{i["current"]}`\n')
            f.write(f'  - note: {i["suggested"]}\n')
        f.write('\n')

print(f'Wrote {out_dir}/clubs.csv, people.csv, clubs.json, issues.md')
print(f'Auto-corrected: {len(applied)}, flagged: {len(flags)}')
