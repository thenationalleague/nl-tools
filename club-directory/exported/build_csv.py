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

EMAIL_RE = re.compile(r"[\w.+'’\-]+@[\w.\-]+\.[A-Za-z]{2,}")
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

# ---------------- Person field normalisation ----------------
# Tokens treated as academic / professional qualifications — stripped from names
# and used to detect notes that are purely qualification noise.
QUAL_TOKENS = [
    'BSc', 'BSc(Hons)', 'BSc(hons)', 'B.Sc', 'BS',
    'MSc', 'M.Sc', 'MA', 'MBA', 'MEng',
    'MB', 'MBChB', 'MbChB', 'MBBS', 'BHSc', 'BHsc', 'B.HSc',
    'MRCGP', 'FRCGP', 'FRCEM', 'PGDip', 'PGdip', 'DipSEM', 'DipSem',
    'Dip', 'DipHE', 'DiPHE', 'DMFSEM', 'PHICIS', 'HCPC', 'CSP', 'ACPSEM',
    'ATMMiF', 'ATMMIF', 'ATTMiF', 'ATTMIF', 'ATMiFF', 'ATMIFF', 'ATMiF',
    'ITMMiF', 'ITMMIF', 'ITMIFF', 'ITTMIF',
    'EMMIAF', 'EMITF',
    'MBE', 'OBE', 'CBE',
    'IMMOFP', 'OPR', 'NHS',
    'MRCS',
    'qualified',  # trailing word in "Holly Vickers ITMIFF qualified"
]
QUAL_RE = re.compile(r'\b(' + '|'.join(re.escape(q) for q in QUAL_TOKENS) + r')\b\.?',
                     re.IGNORECASE)

# Phrases that indicate the field has bled into adjacent content. When found
# inside a "name", we truncate the name at the first occurrence and keep only
# what came before — provided it still looks like a real name.
ROLE_BLEED_PATTERNS = [
    r'Head of ', r'Sporting Director', r'Managing Director', r'Operations Director',
    r'Executive Director', r'Associate Directors?',
    r'Player Secretary', r'Fixture Secretary', r'Fixtures Secretary',
    r'Club disabled', r'Club Disabled',
    r'Welfare\s*/\s*Safeguarding', r'Primary Club', r'Welfare Officer',
    r'Marketing and Media', r'Sales (and|&) Ticketing', r'Sales (and|&) Marketing',
    r'Lead Sports Rehabilitator', r'Sales Manager', r'Programme Editor',
    r'Retail\s*/\s*Ticketing', r'Press Officer', r'Press officer',
    r'Kit Enquiries', r'Total Stadium', r'Finance Team',
    r'Player Liaison', r'Disabled Officer',
    r'as per ', r' as Press', r' as Club', r' as secretary',
    r'Correspondence ', r'Correspondence:',
    r'info as ',
    # qualification phrases that bleed into the name field
    r'Sports Therapy', r'Sports Rehabilitation', r'Sport Rehabilitation',
    r'Trauma Medical', r'Physiotherapist', r'Physiotherapy', r'Consultant',
    r'Paramedics?', r'\s+UK/USA',
]
ROLE_BLEED_RE = re.compile('(' + '|'.join(ROLE_BLEED_PATTERNS) + ')', re.IGNORECASE)

# Whole names that are pure role labels (PDF "ditto" / column-header bleed).
ROLE_LABEL_NAMES = {
    'finance manager', 'finance team', 'police liaison officer',
    'general manager', 'fixture secretary', 'fixtures secretary',
    'commercial manager', 'safety officer', 'welfare officer',
    'club doctor', 'club therapist', 'kit manager', 'community manager',
    'name as press officer', 'as press officer', 'name', 'name as',
    'mediskills', '100% fan owned', 'fan owned',
    'vacant', 'tbc', 'tba', 'darlington fc supporters group',
    'fc supporters group', 'supporters group',
}

# Camel-case split: "JackTomlinson" -> "Jack Tomlinson"; protected prefixes like
# Mc/Mac/De/Di/O' stay glued.
CAMEL_PROTECTED = {'Mc', 'Mac', 'De', 'Di', 'Da', 'La', 'Le', 'Van', 'Von',
                   'Du', 'Al', 'El', 'St', "O'", "D'"}
def split_camel(name):
    out = []
    for word in name.split(' '):
        # find lowercase->uppercase boundaries; split unless the lead is a
        # protected prefix
        parts = re.split(r'(?<=[a-z])(?=[A-Z])', word)
        if len(parts) > 1:
            merged = [parts[0]]
            for nxt in parts[1:]:
                if merged[-1] in CAMEL_PROTECTED:
                    merged[-1] = merged[-1] + nxt
                else:
                    merged.append(nxt)
            out.append(' '.join(merged))
        else:
            out.append(word)
    return ' '.join(out)

# All-caps tokens that ARE legitimate within a person name (titles, suffixes)
NAME_ALLCAPS_OK = {'DR', 'PC', 'PCSO', 'PR', 'II', 'III', 'IV', 'JR', 'SR', 'OBE', 'MBE', 'CBE'}

def looks_like_person_name(s, strict=False):
    """Heuristic: ≥2 capitalised words, reasonable length. In non-strict mode
    one stray all-caps middle token is allowed (Saudi-style abbreviations).
    Strict mode rejects any non-whitelisted all-caps token — used when deciding
    whether to split on '/' or '&'."""
    s = s.strip()
    if not s: return False
    if not re.match(r'^[A-Z]', s): return False
    if len(s) > 50: return False
    words = [w for w in re.split(r'[\s.\-]+', s) if w]
    if not words: return False
    cap_words = [w for w in words if re.match(r"^[A-Z][a-zA-Z'’\-]+", w)]
    if len(cap_words) < 2: return False
    bad_caps = [w for w in words
                if w.isupper() and len(w) >= 2 and w not in NAME_ALLCAPS_OK]
    limit = 1 if strict else 2
    if len(bad_caps) >= limit: return False
    return True

def title_case_if_all_upper(s):
    """LEE MALYON -> Lee Malyon, but leave 'Tom McCabe' alone."""
    words = s.split()
    if not words: return s
    if all(w.isupper() for w in words if len(w) >= 2):
        return ' '.join(w[0] + w[1:].lower() if len(w) > 1 else w for w in words)
    return s

def normalise_name(raw, club, person_id):
    """Return (clean_name, review_flag_or_empty). Empty clean_name + flag means
    'this row should probably be deleted'."""
    if not raw: return '', ''
    original = raw
    n = raw

    # 1. Strip parenthetical asides and trailing role-suffix dashes
    n = re.sub(r'\s*\([^)]*\)\s*', ' ', n)
    # "Richard Hopwood - COO" → "Richard Hopwood"
    n = re.sub(r'\s*[\-–—]\s*[A-Z]{2,}\s*$', '', n)

    # 2. Strip standalone digit runs (phone numbers leaked into name)
    n = re.sub(r'\s+\d[\d\s]{4,}', '', n)

    # 3. Strip qualification tokens (and concatenated forms like PGdipSEM)
    n = QUAL_RE.sub('', n)
    # Catch concatenated qualification suffixes (no boundary between tokens)
    n = re.sub(r'\b(PGdip|PGDip|MBChB|MbChB|MBA|BSc|MSc)[A-Z]+\b', '', n,
               flags=re.IGNORECASE)
    # Strip "Level N <text>" / "L1 Introduction to First Aid" qualification phrases
    n = re.sub(r'\s+L\d\b.*$', '', n)
    n = re.sub(r'\s+Level\s+\d.*$', '', n, flags=re.IGNORECASE)
    n = re.sub(r'\s+First Aid.*$', '', n, flags=re.IGNORECASE)

    # 4. Truncate at role-bleed phrase. If the head segment doesn't look like a
    # person but the tail does, prefer the tail (handles e.g.
    # "Madora Health Lead Sports Rehabilitator Rosie Margetson" → "Rosie Margetson").
    m = ROLE_BLEED_RE.search(n)
    if m:
        head = n[:m.start()].rstrip(' ,./&-')
        # Find the next role-bleed phrase after this one (if any), to bound the tail
        rest = n[m.end():]
        m2 = ROLE_BLEED_RE.search(rest)
        tail = (rest if not m2 else rest[:m2.start()]).strip(' ,./&-')
        if not looks_like_person_name(head) and looks_like_person_name(tail):
            n = tail
        else:
            n = head

    # 5. "<role-or-junk>, <Real Name>" — keep the part after the comma if it
    # looks like a name. e.g. "nterim Chairman, Kevin Hebenton",
    # "General Manager, Tim Herbert".
    if ',' in n:
        before, after = [s.strip(' ,./&-') for s in n.split(',', 1)]
        if looks_like_person_name(after) and not looks_like_person_name(before):
            n = after

    # 6. Tidy whitespace + leading junk + leftover punctuation islands
    # (e.g. "Sam Mannings , and" after stripping qualifications)
    n = re.sub(r'\s+,\s+', ' ', n)
    n = re.sub(r'\b(and|&|or)\b\s*$', '', n, flags=re.IGNORECASE)
    n = re.sub(r'\s*\([^)]*$', '', n)            # unclosed trailing paren
    n = re.sub(r'^[\s,./&\\-]+', '', n)
    n = re.sub(r'[\s,./&\\-]+$', '', n)
    n = re.sub(r'\s+', ' ', n).strip()

    # 7. Camel-case split, then title-case all-caps names
    n = split_camel(n)
    n = title_case_if_all_upper(n)

    # 8. Final checks
    if not n:
        return '', 'name was empty after normalisation'
    if n.lower() in ROLE_LABEL_NAMES:
        return '', f'name is a role label, not a person: {original!r}'
    # Also catch "starts-with-lowercase" leftovers like "nterim Chairman" — these
    # are PDF text-flow artefacts and we can't reliably reconstruct them.
    if not re.match(r'^[A-Z]', n):
        return '', f'name starts with non-capital, likely PDF artefact: {original!r}'
    if not looks_like_person_name(n):
        return '', f'name not recoverable: {original!r} -> {n!r}'
    return n, ''

def normalise_email(e):
    if not e: return e, ''
    e = e.strip()
    flags = []
    # Strip apostrophes (smart and straight) — emails don't carry them in
    # practice; this catches PDF rendering artefacts e.g. rebecca.o'loughlin
    if "'" in e or "’" in e:
        e_new = e.replace("'", '').replace("’", '')
        flags.append(f"stripped apostrophe (was {e!r})")
        e = e_new
    if '@' in e:
        local, dom = e.split('@', 1)
        if local != local.lower():
            flags.append('lowercased local part')
            e = local.lower() + '@' + dom
    return e, '; '.join(flags)

def normalise_phone(p):
    if not p: return p, ''
    p = re.sub(r'\s+', ' ', p).strip()
    return p, ''

def normalise_note(note):
    """Drop notes that are purely qualifications. Keep correspondence info."""
    if not note: return note
    s = note.strip()
    # If it starts with Correspondence, keep (but trim trailing role-bleed)
    if s.lower().startswith('correspondence'):
        # Cut at common bleed-trailers
        s = re.split(r'\s+(Fixtures? Secretary|Player Secretary|Executive Director|'
                     r'Commercial and Operations|Head of Football|Commercial Sales Manager|'
                     r'Programme Editor)\b', s)[0]
        return s.strip(' ,.;')
    # Pure qualification text? Drop. Anything that starts with a known
    # qualification token is treated as qualification noise.
    if QUAL_RE.match(s):
        return ''
    qual_indicators = re.compile(
        r'^(BSc|Bsc|MSc|MA|MB |MBChB|MbChB|BHSc|MBBS|Level\s+\d|PGDip|PGdip|'
        r'Bachelor|Master|Hons|HCPC|Dip|Diploma|Sports Therapy|First Aid|'
        r'L\d Introduction|MRCS|FRCEM|Sport Rehabilitation|Sports Rehabilitation|'
        r'Degree\b|Chartered\b|Sports Therapist|Physiotherapist)',
        re.IGNORECASE,
    )
    if qual_indicators.match(s):
        return ''
    # If contains a comma-separated list of qualification tokens and not much
    # else, drop.
    bare = re.sub(QUAL_RE, '', s)
    bare = re.sub(r'[,\s\-/.]', '', bare)
    if len(bare) < max(8, len(s) * 0.3):
        return ''
    return s

# Pre-pass: slash- or ampersand-joined director names → split into separate
# person entries
SPLIT_RE = re.compile(r'\s*(?:/|\s&\s|\s+and\s+)\s*')
def _looks_listy(name, sep_pattern):
    # Refuse splits when the original contains a role-bleed phrase — usually
    # means the "and"/"/" is part of a junk substring like "Retail/Ticketing"
    # or "Sales and Ticketing", not a real separator between two people.
    if ROLE_BLEED_RE.search(name): return None
    if not sep_pattern.search(name): return None
    parts = [s.strip() for s in sep_pattern.split(name) if s.strip()]
    if len(parts) < 2: return None
    if all(looks_like_person_name(p, strict=True) for p in parts):
        return parts
    return None

for c in clubs:
    expanded = []
    for p in c.get('people', []):
        nm = p.get('name', '') or ''
        if 'http' in nm.lower():
            expanded.append(p); continue
        # Strip parenthetical role hints first so "Tony Allan (Secretary) & Robert Ham (Director)"
        # becomes "Tony Allan & Robert Ham" before split
        nm_stripped = re.sub(r'\s*\([^)]*\)\s*', ' ', nm).strip()
        parts = _looks_listy(nm_stripped, SPLIT_RE)
        if parts and len(nm) > 20:
            add_issue(c['name'], 'PERSON_NAME_SPLIT', nm,
                      ' | '.join(parts), applied=True, person=nm)
            for s in parts:
                expanded.append({**p, 'name': s})
            continue
        expanded.append(p)
    c['people'] = expanded

# Apply to every person
for c in clubs:
    new_people = []
    for p in c.get('people', []):
        person_key = p.get('name', '')
        clean_name, name_flag = normalise_name(p.get('name', ''), c['name'], person_key)
        clean_email, email_flag = normalise_email(p.get('email'))
        clean_phone, phone_flag = normalise_phone(p.get('phone'))
        clean_note = normalise_note(p.get('note') or '')

        review = []
        if name_flag: review.append(name_flag)

        # Log changes
        if clean_name != (p.get('name') or ''):
            add_issue(c['name'], 'PERSON_NAME', p.get('name',''), clean_name,
                      applied=True, person=p.get('name',''))
        if email_flag:
            add_issue(c['name'], 'PERSON_EMAIL_CASE', p.get('email',''), clean_email,
                      applied=True, person=clean_name or p.get('name',''))
        if (p.get('note') or '') and clean_note != p.get('note'):
            add_issue(c['name'], 'PERSON_NOTE', p.get('note',''), clean_note or '(dropped)',
                      applied=True, person=clean_name or p.get('name',''))
        if review:
            add_issue(c['name'], 'PERSON_NAME_REVIEW', p.get('name',''),
                      '; '.join(review), applied=False,
                      person=clean_name or p.get('name',''))

        p['name'] = clean_name
        p['email'] = clean_email
        p['phone'] = clean_phone
        p['note'] = clean_note or None
        p['_review'] = '; '.join(review) if review else ''
        new_people.append(p)

    c['people'] = new_people

# ---------- end normalisation ----------



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
    pdf_emails = set(e.lower().replace("'", '').replace('’', '')
                     for e in EMAIL_RE.findall(pdf_text))
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
    w.writerow(['club','person_name','role_title','section','main','dept_head','email','phone','note','review'])
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
                    p.get('_review','') or '',
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
