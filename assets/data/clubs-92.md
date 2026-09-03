# clubs-92.json

Premier League and EFL clubs (the 92) with ground, town, capacity, postcode and lat/lng. Companion to `clubs-meta.json` for travel planning and broadcast selection – anything that needs to know where a non-NL club plays.

**Version 4.0 – 03/09/2026 – season 2026-27**

## Location

```
thenationalleague/nl-tools
└── assets/data/
    ├── clubs-meta.json     ← NL clubs (82 records, canon)
    ├── clubs-92.json      ← this file
    └── clubs-92.md        ← this note
```

URLs once merged (site first – `nl.tools` is the stable address; raw for external consumers):

```
https://nl.tools/assets/data/clubs-92.json
https://raw.githubusercontent.com/thenationalleague/nl-tools/refs/heads/main/assets/data/clubs-92.json
```

## Why a separate file

`clubs-meta.json` is the canon for NL membership, crests, colours, kits and ECAL – tools read it to build club pickers, tables and relegation bands. Adding 92 non-members would break the "filter by division and expect 24" rule and pull EFL clubs into every picker. Keeping them in a sibling file means a tool opts in by loading both, and the NL file stays authoritative.

Field names match `clubs-meta.json` where they overlap – `name`, `stadium_name`, `capacity`, `lat`, `lng` – so a travel tool can concatenate the two lists and treat every ground the same way.

## Shape

```json
{
  "meta": { "version", "generated", "season", "scope", "notes" },
  "clubs": [
    {
      "name": "Wrexham",
      "league": "Championship",
      "tier": 2,
      "town": "Wrexham",
      "stadium_name": "Racecourse Ground",
      "capacity": 10771,
      "postcode": "LL11 2AH",
      "postcode_source": "wikipedia",
      "lat": 53.05194,
      "lng": -3.00361,
      "source": "https://en.wikipedia.org/wiki/Racecourse_Ground"
    }
  ]
}
```

`league` is the 2026/27 division; `tier` is 1–4 for sorting and colour-coding. `source` is the ground's Wikipedia page, kept so a record can be re-checked without re-scraping.

## Data quality

- Membership, ground names and capacities: Wikipedia 2026–27 season pages for each division.
- Coordinates: each ground's Wikipedia geo tag. Complete for all 92.
- Postcodes: 62 from Wikipedia infoboxes (`postcode_source: "wikipedia"`); 29 filled manually and marked `"manual-unverified"` – check before routing on them. Everton's Hill Dickinson Stadium has no postcode yet.

## Maintenance

Re-run each summer after play-offs. Membership changes (three up, three down between each pair of tiers, plus two swapping with the National League) mean roughly 10 records change `league`/`tier` and 2 are added/removed. Bump `meta.version` and `meta.season`. When a club is promoted from the NL it should be removed from this file and left in `clubs-meta.json` with `division: null` and its `seasons` map intact, as that file already handles departed clubs.

## Changelog

- **4.0 – 03/09/2026** – initial build, 92 clubs, 2026/27 season.
