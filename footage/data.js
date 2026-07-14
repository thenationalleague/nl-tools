/* NL Cup Footage — seed data (clubs + fixtures). No footage until real files
   are uploaded by the producer. 16 National League clubs + 16 PL2 sides.
   Fixtures/groups TBC — games[] is intentionally empty until the draw is made. */
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
      "name": "Aldershot Town",
      "short": "Aldershot",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Aldershot%20Town.png",
      "mono": null,
      "token": "ald-qm3t",
      "passcode": "8GFFF8"
    },
    {
      "code": "BHW",
      "name": "Boreham Wood",
      "short": "Boreham Wood",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Boreham%20Wood.png",
      "mono": null,
      "token": "bhw-rayq",
      "passcode": "ZER24Q"
    },
    {
      "code": "BOS",
      "name": "Boston United",
      "short": "Boston",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Boston%20United.png",
      "mono": null,
      "token": "bos-4zks",
      "passcode": "HM3THG"
    },
    {
      "code": "BRA",
      "name": "Braintree Town",
      "short": "Braintree",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Braintree%20Town.png",
      "mono": null,
      "token": "bra-efsd",
      "passcode": "XL3DCJ"
    },
    {
      "code": "HAL",
      "name": "FC Halifax Town",
      "short": "Halifax",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/FC%20Halifax%20Town.png",
      "mono": null,
      "token": "hal-4neu",
      "passcode": "ARMJTL"
    },
    {
      "code": "GAT",
      "name": "Gateshead",
      "short": "Gateshead",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Gateshead.png",
      "mono": null,
      "token": "gat-qduz",
      "passcode": "3DTU3C"
    },
    {
      "code": "HAR",
      "name": "Hartlepool United",
      "short": "Hartlepool",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Hartlepool%20United.png",
      "mono": null,
      "token": "har-683t",
      "passcode": "GYWX8Q"
    },
    {
      "code": "HOR",
      "name": "Hornchurch",
      "short": "Hornchurch",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Hornchurch.png",
      "mono": null,
      "token": "hor-apxy",
      "passcode": "J3WE7Z"
    },
    {
      "code": "SCU",
      "name": "Scunthorpe United",
      "short": "Scunthorpe",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Scunthorpe%20United.png",
      "mono": null,
      "token": "scu-4pet",
      "passcode": "8QFGGC"
    },
    {
      "code": "SOL",
      "name": "Solihull Moors",
      "short": "Solihull",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Solihull%20Moors.png",
      "mono": null,
      "token": "sol-gv8e",
      "passcode": "BLEM2L"
    },
    {
      "code": "SUT",
      "name": "Sutton United",
      "short": "Sutton",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Sutton%20United.png",
      "mono": null,
      "token": "sut-tj95",
      "passcode": "9P0WVH"
    },
    {
      "code": "TAM",
      "name": "Tamworth",
      "short": "Tamworth",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Tamworth.png",
      "mono": null,
      "token": "tam-5rsr",
      "passcode": "TH4BYE"
    },
    {
      "code": "TRU",
      "name": "Truro City",
      "short": "Truro",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Truro%20City.png",
      "mono": null,
      "token": "tru-egti",
      "passcode": "KEBJ7G"
    },
    {
      "code": "WEA",
      "name": "Wealdstone",
      "short": "Wealdstone",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Wealdstone.png",
      "mono": null,
      "token": "wea-8rt7",
      "passcode": "SKZJ3F"
    },
    {
      "code": "WOK",
      "name": "Woking",
      "short": "Woking",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Woking.png",
      "mono": null,
      "token": "wok-r8sc",
      "passcode": "3GA3V7"
    },
    {
      "code": "WOR",
      "name": "Worthing",
      "short": "Worthing",
      "tier": "NL",
      "crest": "https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/Worthing.png",
      "mono": null,
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
  "games": [],
  "fileKinds": [
    {
      "type": "hl",
      "label": "Highlights",
      "preview": true
    },
    {
      "type": "fmr",
      "label": "Full match",
      "preview": false
    },
    {
      "type": "clips",
      "label": "Social clips",
      "preview": true
    }
  ]
};
