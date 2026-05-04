"""Reorder clubs-meta keys logically, clean address strings, and split the
stadium field into proper-name + sponsor-name."""
import json, re

with open('/home/user/tools/assets/data/clubs-meta.json') as f:
    meta = json.load(f)

# Manual mapping of {club -> (proper_stadium_name, sponsor_name_or_None)}.
# Sponsor name covers the current commercially-branded title where it differs
# from the historic / non-sponsor name. These were derived from the existing
# meta `stadium` values (which mixed both forms), the PDF address line, and
# common knowledge of each club's ground.
STADIUM = {
    'Aldershot Town': ('Recreation Ground', 'EBB Stadium'),
    'Altrincham': ('The J Davidson Stadium', None),
    'Boreham Wood': ('Meadow Park', 'The Mangata Developments Stadium'),
    'Boston United': ('York Street', 'Jakemans Community Stadium'),
    'Brackley Town': ('St. James Park', None),
    'Braintree Town': ('Cressing Road', 'Rare Breed Meat Co. Stadium'),
    'Carlisle United': ('Brunton Park', None),
    'Eastleigh': ('Ten Acres', 'Silverlake Stadium'),
    'FC Halifax Town': ('The Shay', None),
    'Forest Green Rovers': ('The New Lawn', 'The Bolt New Lawn'),
    'Gateshead': ('Gateshead International Stadium', None),
    'Hartlepool United': ('Victoria Park', 'The Prestige Group Stadium'),
    'Morecambe': ('Globe Arena', 'Mazuma Mobile Stadium'),
    'Rochdale': ('Spotland', 'Crown Oil Arena'),
    'Scunthorpe United': ('Glanford Park', 'Attis Arena'),
    'Solihull Moors': ('Damson Park', None),
    'Southend United': ('Roots Hall', None),
    'Sutton United': ('Gander Green Lane', 'VBS Community Stadium'),
    'Tamworth': ('The Lamb Ground', None),
    'Truro City': ('Truro City Stadium', None),
    'Wealdstone': ('Grosvenor Vale', None),
    'Woking': ('Kingfield', 'The Laithwaite Community Stadium'),
    'Yeovil Town': ('Huish Park', None),
    'York City': ('York Community Stadium', 'LNER Community Stadium'),
    'AFC Fylde': ('Mill Farm', None),
    'AFC Telford United': ('New Bucks Head', 'SEAH Stadium'),
    'Alfreton Town': ('North Street', 'Impact Arena'),
    'Bedford Town': ('The Eyrie', None),
    'Buxton': ('The Silverlands', 'The Tarmac Silverlands'),
    'Chester': ('Deva Stadium', None),
    'Chorley': ('Victory Park', 'The Grant Store Victory Park Stadium'),
    'Curzon Ashton': ('Tameside Stadium', None),
    'Darlington': ('Blackwell Meadows', None),
    'Hereford': ('Edgar Street', 'M&M Edgar Street Stadium'),
    'Kidderminster Harriers': ('Aggborough', None),
    "King's Lynn Town": ('The Walks', 'Docherty Walks Stadium'),
    'Leamington': ('The New Windmill Ground', 'Your Co-Op Community Stadium'),
    'Macclesfield': ('Moss Rose', 'Leasing.com Stadium'),
    'Marine': ('Rossett Park', 'Marine Travel Arena'),
    'Merthyr Town': ('Penydarren Park', None),
    'Oxford City': ('Court Place Farm', 'RAW Charging Stadium'),
    'Peterborough Sports': ('Lincoln Road', None),
    'Radcliffe': ('Stainton Park', 'Neuven Stadium'),
    'Scarborough Athletic': ('Queensgate', 'Flamingo Land Stadium'),
    'South Shields': ('Mariners Park', '1st Cloud Arena'),
    'Southport': ('Haig Avenue', None),
    'Spennymoor Town': ('The Brewery Field', None),
    'Worksop Town': ('Sandy Lane', 'The Windsor Foodservice Stadium'),
    'AFC Totton': ('Testwood Park', 'The Snows Stadium'),
    'Bath City': ('Twerton Park', None),
    'Chelmsford City': ('New Writtle Street', 'Dunmow Group Community Stadium'),
    'Chesham United': ('The Meadow', None),
    'Chippenham Town': ('Hardenhuish Park', 'Thornbury Surfacing Ltd Stadium'),
    'Dagenham & Redbridge': ('Victoria Road', 'Chigwell Construction Stadium'),
    'Dorking Wanderers': ('Meadowbank Stadium', None),
    'Dover Athletic': ('Crabble Athletic Ground', 'Megger Community Stadium'),
    'Eastbourne Borough': ('Priory Lane', 'The Connect Management Stadium'),
    'Ebbsfleet United': ('Stonebridge Road', 'Kuflink Stadium'),
    'Enfield Town': ('Donkey Lane', 'Queen Elizabeth II Stadium'),
    'Farnborough': ('Cherrywood Road', 'Saunders Transport Community Stadium'),
    'Hampton & Richmond Borough': ('Beveree Stadium', None),
    'Hemel Hempstead Town': ('Vauxhall Road', 'The Focus Community Arena'),
    'Hornchurch': ('Hornchurch Stadium', None),
    'Horsham': ('Horsham FC Community Stadium', 'Fusion Aviation Community Stadium'),
    'Maidenhead United': ('York Road', None),
    'Maidstone United': ('Gallagher Stadium', None),
    'Salisbury': ('Raymond McEnhill Stadium', None),
    'Slough Town': ('Arbour Park', None),
    'Tonbridge Angels': ('Longmead', 'Yeomans Community Stadium'),
    'Torquay United': ('Plainmoor', None),
    'Weston-super-Mare': ('Woodspring Stadium', 'The Optima Stadium'),
    'Worthing': ('Woodside Road', 'The Sussex Transport Community Stadium'),
}

POSTCODE_RE = re.compile(r'\s*[,.]?\s*\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b\s*[/.]?\s*$')

def clean_address(addr, club_name, postcode):
    if not addr: return addr
    s = addr
    # Strip trailing postcode (and any junk after it like "/")
    s = POSTCODE_RE.sub('', s).rstrip(' ,.;:')
    # Punctuation tidy: smart-quote -> comma; missing space after comma;
    # collapse internal whitespace; replace ". " with ", " mid-sentence
    s = s.replace('’', ',')          # rare PDF artefact
    s = re.sub(r',(?=\S)', ', ', s)  # add space after commas
    s = re.sub(r'\s+,', ',', s)      # remove space before commas
    s = re.sub(r'\.\s+(?=[A-Z])', ', ', s)  # ". Hertfordshire" -> ", Hertfordshire"
    s = re.sub(r'\s+', ' ', s).strip(' ,.;:')
    # Strip leading "ClubName Football Club, " / "ClubName FC, " / "ClubName, "
    # — longest variant first, otherwise the short one matches and leaves "FC, "
    name_variants = [
        club_name + ' Football Club',
        club_name.replace("'", '’') + ' Football Club',
        club_name + ' FC',
        club_name,
    ]
    for v in name_variants:
        pat = re.compile(r'^' + re.escape(v) + r'\s*,?\s*', re.IGNORECASE)
        new = pat.sub('', s)
        if new != s:
            s = new
            break  # only strip one prefix
    # Tidy stray whitespace and trailing punctuation again
    s = re.sub(r'\s+', ' ', s).strip(' ,.;')
    return s

# Logical key order for every club record
KEY_ORDER = [
    'name', 'code', 'short',
    'division',
    'domain', 'optaID',
    'colors',
    'stadium_name', 'stadium_sponsor_name',
    'capacity', 'capacity_seated',
    'pitch',
    'address', 'postcode',
    'station', 'distance_to_station',
    'fa_membership',
    'kit',
    'sponsors',
]

new_clubs = []
flagged = []
for c in meta['clubs']:
    name = c['name']
    proper, sponsor = STADIUM.get(name, (c.get('stadium'), None))

    # Clean address: strip postcode and club name prefix
    cleaned_addr = clean_address(c.get('address',''), name, c.get('postcode',''))

    # Build re-ordered record
    rec = {}
    rec['name'] = c['name']
    rec['code'] = c.get('code')
    rec['short'] = c.get('short')
    rec['division'] = c.get('division')
    rec['domain'] = c.get('domain')
    rec['optaID'] = c.get('optaID')
    rec['colors'] = c.get('colors')
    rec['stadium_name'] = proper
    rec['stadium_sponsor_name'] = sponsor
    rec['capacity'] = c.get('capacity')
    if c.get('capacity_seated') is not None:
        rec['capacity_seated'] = c['capacity_seated']
    rec['pitch'] = c.get('pitch')
    rec['address'] = cleaned_addr
    rec['postcode'] = c.get('postcode')
    rec['station'] = c.get('station')
    if c.get('distance_to_station') is not None:
        rec['distance_to_station'] = c['distance_to_station']
    if c.get('fa_membership') is not None:
        rec['fa_membership'] = c['fa_membership']
    if c.get('kit') is not None:
        rec['kit'] = c['kit']
    if c.get('sponsors') is not None:
        rec['sponsors'] = c['sponsors']

    new_clubs.append(rec)

meta['clubs'] = new_clubs
meta['version'] = 'v1.7'

with open('/home/user/tools/assets/data/clubs-meta.json', 'w') as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)

print(f'Wrote v1.7 — {len(new_clubs)} clubs')
print('\nSample addresses (before/after):')
for sample_name in ['Aldershot Town', 'Boreham Wood', 'AFC Fylde', 'Scarborough Athletic']:
    rec = next(c for c in new_clubs if c['name'] == sample_name)
    print(f'  {sample_name:25s} -> {rec["address"]!r}')
print('\nSample stadium splits:')
for sample_name in ['Scunthorpe United', 'Aldershot Town', 'Glanford Park'.replace('Glanford Park','Tamworth'), 'FC Halifax Town']:
    rec = next(c for c in new_clubs if c['name'] == sample_name)
    spons = rec.get('stadium_sponsor_name')
    print(f'  {sample_name:25s} {rec["stadium_name"]:30s} / {spons or "(no sponsor)"}')
