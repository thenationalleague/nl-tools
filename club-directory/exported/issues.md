# Club Directory — issues report

Source: inline `window.CLUBS` (in `index.html`) compared against the 2025/26 PDF and `clubs-meta.json`.

- Auto-corrected (already applied to `clubs.csv` / `clubs.json`): **18**
- Flagged for manual review: **11**

## Auto-corrections applied

### CLUB_NAME (3)

- **King’s Lynn Town**
  - was: `King’s Lynn Town`
  - now: `King's Lynn Town`
- **Ebbsfleet United FC**
  - was: `Ebbsfleet United FC`
  - now: `Ebbsfleet United`
- **Weston-Super-Mare**
  - was: `Weston-Super-Mare`
  - now: `Weston-super-Mare`

### ADDR_TYPO (3)

- **Eastleigh**
  - was: `Silverlake Stadium, Stoneham Lane, Eastleigh, S050 9HT`
  - now: `Silverlake Stadium, Stoneham Lane, Eastleigh, SO50 9HT`
- **Scarborough Athletic**
  - was: `c/o Bridlington Town AFC, The Mounting Systems Stadum, Queensgate, Bridlington, East`
  - now: `c/o Bridlington Town AFC, The Mounting Systems Stadium, Queensgate, Bridlington, East`
- **Dover Athletic**
  - was: `The Megger COmmunity Stadium, Crabble Athletic Ground, Lewisham Road,`
  - now: `The Megger Community Stadium, Crabble Athletic Ground, Lewisham Road,`

### ADDR_TRUNCATED (5)

- **Boreham Wood**
  - was: `Boreham Wood FC, The Mangata Developments Stadium, Meadow Park, Broughinge Road,`
  - now: `Boreham Wood FC, The Mangata Developments Stadium, Meadow Park, Broughinge Road, Borehamwood, Hertfordshire, WD6 5AL`
- **Scarborough Athletic**
  - was: `c/o Bridlington Town AFC, The Mounting Systems Stadium, Queensgate, Bridlington, East`
  - now: `c/o Bridlington Town AFC, The Mounting Systems Stadium, Queensgate, Bridlington, East Yorkshire YO16 7LN`
- **Dagenham & Redbridge**
  - was: `Dagenham & Redbridge Football Club, The Chigwell Construction Stadium, Victoria Road,`
  - now: `Dagenham & Redbridge Football Club, The Chigwell Construction Stadium, Victoria Road, Dagenham, Essex, RM10 7XL`
- **Dover Athletic**
  - was: `The Megger Community Stadium, Crabble Athletic Ground, Lewisham Road,`
  - now: `The Megger Community Stadium, Crabble Athletic Ground, Lewisham Road, Dover, Kent: CT17 0JB`
- **Eastbourne Borough**
  - was: `Eastbourne Borough Football Club, The Connect Management Stadium, Priory Lane,`
  - now: `Eastbourne Borough Football Club, The Connect Management Stadium, Priory Lane, Eastbourne, East Sussex, BN23 7QH`

### POSTCODE_FORMAT (6)

- **Tamworth**
  - was: `B771AA`
  - now: `B77 1AA`
- **Kidderminster Harriers**
  - was: `DY101NB`
  - now: `DY10 1NB`
- **South Shields**
  - was: `NE32 3 UP`
  - now: `NE32 3UP`
- **Hemel Hempstead Town**
  - was: `HP24HW`
  - now: `HP2 4HW`
- **Horsham**
  - was: `RH130AD`
  - now: `RH13 0AD`
- **Torquay United**
  - was: `TQ1 3 PS`
  - now: `TQ1 3PS`

### WEBSITE_CASE (1)

- **Braintree Town**
  - was: `Www.braintreetownfc.org.uk`
  - now: `www.braintreetownfc.org.uk`

## Flagged for manual review

### POSTCODE_VS_META (10)

- **Gateshead**
  - directory: `directory=NE10 8EF`
  - note: meta stadium=NE10 0EF
- **Alfreton Town**
  - directory: `directory=DE55 7FZ`
  - note: meta stadium=DE75 7XB
- **King's Lynn Town**
  - directory: `directory=PE30 5PB`
  - note: meta stadium=PE30 3PX
- **Leamington**
  - directory: `directory=CV33 9QB`
  - note: meta stadium=CV33 9SA
- **Scarborough Athletic**
  - directory: `directory=YO16 7LN`
  - note: meta stadium=YO11 2JW
- **Bath City**
  - directory: `directory=BA2 1DB`
  - note: meta stadium=BA2 3RT
- **Chelmsford City**
  - directory: `directory=CM1 2EH`
  - note: meta stadium=CM2 8XJ
- **Eastbourne Borough**
  - directory: `directory=BN23 7QH`
  - note: meta stadium=BN23 7AQ
- **Hemel Hempstead Town**
  - directory: `directory=HP2 4HW`
  - note: meta stadium=HP2 4LN
- **Slough Town**
  - directory: `directory=SL2 5AY`
  - note: meta stadium=SL1 5QF

### PERSON_EMAIL_MISMATCH (1)

- **Rochdale / Rebecca O'Loughlin**
  - directory: `rebecca.o'loughlin@rochdaleafc.co.uk`
  - note: PDF same-domain emails: ['andy.duff@rochdaleafc.co.uk', 'chris.garland@rochdaleafc.co.uk', 'george.delves@rochdaleafc.co.uk', 'greg.jones@rochdaleafc.co.uk', 'jamie.stoddart@rochdaleafc.co.uk']

