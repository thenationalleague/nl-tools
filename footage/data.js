/* NL Cup Footage — seed data (roster + fixtures). No footage until real files are
   uploaded by the producer.

   ROSTER = 16 National League clubs + 16 PL2 sides. Fixtures/groups are TBC, so
   games[] is intentionally empty until the draw is made.

   SINGLE SOURCE OF IDENTITY: the National League clubs are stored THIN below
   (code + cup-specific fields only). Their name / short / crest are sourced from
   the master registry (assets/clubs-meta.json) at load via footageHydrateClubs(),
   so NL clubs live in ONE place. The 16 PL2 sides aren't in that registry (they
   play no other NL fixtures) so they carry their own identity here.

   Every page that shows clubs must, after loading FOOTAGE_DATA (seed) or the
   published RTDB catalogue, call footageLoadMeta().then(m => footageHydrateClubs(
   clubs, m)) then rebuild its code->club map and re-render. Hydrate is idempotent
   and degrades gracefully if the registry can't be fetched (NL club falls back to
   its code + the rose crest). */
window.FOOTAGE_DATA = {
  "competition": "National League Cup 2026-27",
  "updated": "2026-07-14",
  "producer": {
    "name": "Match footage supplier",
    "passcode": "PROD24",
    "token": "prod-9x2k"
  },
  "clubs": [
    {
      "code": "ALD",
      "tier": "NL",
      "token": "ald-qm3t",
      "passcode": "8GFFF8"
    },
    {
      "code": "BHW",
      "tier": "NL",
      "token": "bhw-rayq",
      "passcode": "ZER24Q"
    },
    {
      "code": "BOS",
      "tier": "NL",
      "token": "bos-4zks",
      "passcode": "HM3THG"
    },
    {
      "code": "BRA",
      "tier": "NL",
      "token": "bra-efsd",
      "passcode": "XL3DCJ"
    },
    {
      "code": "HAL",
      "tier": "NL",
      "token": "hal-4neu",
      "passcode": "ARMJTL"
    },
    {
      "code": "GAT",
      "tier": "NL",
      "token": "gat-qduz",
      "passcode": "3DTU3C"
    },
    {
      "code": "HAR",
      "tier": "NL",
      "token": "har-683t",
      "passcode": "GYWX8Q"
    },
    {
      "code": "HOR",
      "tier": "NL",
      "token": "hor-apxy",
      "passcode": "J3WE7Z"
    },
    {
      "code": "SCU",
      "tier": "NL",
      "token": "scu-4pet",
      "passcode": "8QFGGC"
    },
    {
      "code": "SOL",
      "tier": "NL",
      "token": "sol-gv8e",
      "passcode": "BLEM2L"
    },
    {
      "code": "SUT",
      "tier": "NL",
      "token": "sut-tj95",
      "passcode": "9P0WVH"
    },
    {
      "code": "TAM",
      "tier": "NL",
      "token": "tam-5rsr",
      "passcode": "TH4BYE"
    },
    {
      "code": "TRU",
      "tier": "NL",
      "token": "tru-egti",
      "passcode": "KEBJ7G"
    },
    {
      "code": "WEA",
      "tier": "NL",
      "token": "wea-8rt7",
      "passcode": "SKZJ3F"
    },
    {
      "code": "WOK",
      "tier": "NL",
      "token": "wok-r8sc",
      "passcode": "3GA3V7"
    },
    {
      "code": "WOR",
      "tier": "NL",
      "token": "wor-ml2b",
      "passcode": "5AWWLP"
    },
    {
      "code": "BIR",
      "name": "Birmingham City PL2",
      "short": "Birmingham",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Birmingham%20City.png",
      "mono": null,
      "token": "bir-x5un",
      "passcode": "Y5ZP4G"
    },
    {
      "code": "DER",
      "name": "Derby County PL2",
      "short": "Derby",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Derby%20County.png",
      "mono": null,
      "token": "der-xi4d",
      "passcode": "YEOPHP"
    },
    {
      "code": "EVE",
      "name": "Everton PL2",
      "short": "Everton",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Everton.png",
      "mono": null,
      "token": "eve-s2e6",
      "passcode": "NS7XT8"
    },
    {
      "code": "FUL",
      "name": "Fulham PL2",
      "short": "Fulham",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Fulham.png",
      "mono": null,
      "token": "ful-arq7",
      "passcode": "0GJC6X"
    },
    {
      "code": "IPS",
      "name": "Ipswich Town PL2",
      "short": "Ipswich",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Ipswich%20Town.png",
      "mono": null,
      "token": "ips-6x12",
      "passcode": "HFPASW"
    },
    {
      "code": "LEE",
      "name": "Leeds United PL2",
      "short": "Leeds",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Leeds%20United.png",
      "mono": null,
      "token": "lee-jlxl",
      "passcode": "QC81WJ"
    },
    {
      "code": "LEI",
      "name": "Leicester City PL2",
      "short": "Leicester",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Leicester%20City.png",
      "mono": null,
      "token": "lei-jgqt",
      "passcode": "WLNCJW"
    },
    {
      "code": "MID",
      "name": "Middlesbrough PL2",
      "short": "Boro",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Middlesbrough.png",
      "mono": null,
      "token": "mid-lw2h",
      "passcode": "KEH5RF"
    },
    {
      "code": "NEW",
      "name": "Newcastle United PL2",
      "short": "Newcastle",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Newcastle%20United.png",
      "mono": null,
      "token": "new-9fu2",
      "passcode": "AE2O25"
    },
    {
      "code": "NOR",
      "name": "Norwich City PL2",
      "short": "Norwich",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Norwich%20City.png",
      "mono": null,
      "token": "nor-90la",
      "passcode": "CPYNV3"
    },
    {
      "code": "NFO",
      "name": "Nottingham Forest PL2",
      "short": "Nottm Forest",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Nottingham%20Forest.png",
      "mono": null,
      "token": "nfo-n6u7",
      "passcode": "0R1H82"
    },
    {
      "code": "SOT",
      "name": "Southampton PL2",
      "short": "Southampton",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Southampton.png",
      "mono": null,
      "token": "sot-ehrz",
      "passcode": "KXFGGV"
    },
    {
      "code": "STO",
      "name": "Stoke City PL2",
      "short": "Stoke",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Stoke%20City.png",
      "mono": null,
      "token": "sto-u7u6",
      "passcode": "952MPC"
    },
    {
      "code": "WBA",
      "name": "West Bromwich Albion PL2",
      "short": "West Brom",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/West%20Bromwich%20Albion.png",
      "mono": null,
      "token": "wba-21uk",
      "passcode": "QTVZ2B"
    },
    {
      "code": "WHU",
      "name": "West Ham United PL2",
      "short": "West Ham",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/West%20Ham%20United.png",
      "mono": null,
      "token": "whu-62o0",
      "passcode": "68HE1X"
    },
    {
      "code": "WOL",
      "name": "Wolverhampton Wanderers PL2",
      "short": "Wolves",
      "tier": "PL2",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Wolverhampton%20Wanderers.png",
      "mono": null,
      "token": "wol-s4yn",
      "passcode": "EGM3MU"
    }
  ],
  "games": []
};


/* ---- club identity hydration (see header) ------------------------------------ */
window.FOOTAGE_META_URL   = '/assets/data/clubs-meta.json';
window.FOOTAGE_CREST_BASE = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/';

/* Fill NL clubs' identity (name/short/crest) from the master registry, in place.
   Idempotent. PL2 clubs are left untouched. A registry miss leaves the club as-is
   (never blanked). Returns the same array for chaining. */
window.footageHydrateClubs = function(clubs, meta){
  var byCode = {};
  ((meta && meta.clubs) || []).forEach(function(m){ if (m && m.code) byCode[m.code] = m; });
  (clubs || []).forEach(function(c){
    if (!c || c.tier !== 'NL') return;                 /* PL2 keep local identity */
    var m = byCode[c.code];
    if (!m){ if (!c.name) c.name = c.code; return; }    /* registry miss → don't blank */
    c.name  = m.name;
    c.short = m.short || m.name;
    c.crest = window.FOOTAGE_CREST_BASE + encodeURIComponent(m.name) + '.png';
  });
  return clubs;
};

/* Fetch the master registry once; result cached on window. Resolves to the meta
   object or null (offline / not found). Never rejects. */
window.footageLoadMeta = function(){
  if (window._footageMeta !== undefined) return Promise.resolve(window._footageMeta);
  if (window._footageMetaP) return window._footageMetaP;
  window._footageMetaP = fetch(window.FOOTAGE_META_URL, { cache: 'no-cache' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ window._footageMeta = j; return j; })
    .catch(function(){ window._footageMeta = null; return null; });
  return window._footageMetaP;
};
