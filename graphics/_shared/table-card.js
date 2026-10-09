/* ============================================================
   League Table Card — shared renderer
   File: /graphics/_shared/table-card.js
   Version: v1.1 (09/10/2026)

   Single source of truth for the league-table artwork. The League Table
   Graphic tool (/graphics/table-graphic/) and the scheduled batch
   (scripts/build-fixtures-graphics.js) both call render(), so a table made
   by hand and one made on the timer are drawn by the same code.

   DOM + CSS (table-graphic/styles.css + brand-graphic.css); render()
   resolves once rows are sized and the team column fitted.

   API (window.NL_TABLE_CARD)
     render(host, card, clubs)   → Promise<HTMLElement .gfx>
       card = { division, format, dir, matchday, season, rows }
       division  National | North | South | CupA | CupB | CupC | CupD
       matchday  "" → CURRENT STANDINGS, "final" → FINAL STANDINGS,
                 "13" → MATCHDAY 13
       rows      [{ team, flag, p, w, d, l, f, a, gd, pts }]
     buildRows(nlsLeagueTable, clubs) → rows (flags cleared: NLS has no zones)
     toPng(gfx, format)          → Promise<{ blob, late, missing[] }>
     title, FORMAT_H, COMPETITION_ID, CUP_ROUND, NLS_BASE

   CHANGELOG
     v1.1 09/10/2026  Cup guests print without PL2 / U21 / U23.
     v1.0 09/10/2026  Lifted out of table-graphic/app.js v1.10 unchanged, so
                      the batch can draw the same table.
   ============================================================ */
(function (root) {
  "use strict";

  var FORMAT_H = { "1x1": 1080, "4x5": 1350, "9x16": 1920 };

  var DIVISION_LOGO = {
    National: "/assets/divisions/medium/National.png",
    North:    "/assets/divisions/medium/North.png",
    South:    "/assets/divisions/medium/South.png",
    CupA: "/assets/divisions/medium/NL%20Cup.png",
    CupB: "/assets/divisions/medium/NL%20Cup.png",
    CupC: "/assets/divisions/medium/NL%20Cup.png",
    CupD: "/assets/divisions/medium/NL%20Cup.png"
  };
  /* No logo fallback: a badge that fails renders blank rather than branding
     the graphic as the wrong competition. */
  var SPONSOR_URL = "/assets/partners/TIC%20Health.png";

  /* National League Services — the authoritative standings. competitionID
     values are firm NLS codes; never derive them from a division name. */
  var NLS_BASE = "https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2";
  var COMPETITION_ID = { National: 89, North: 373, South: 372, CupA: 1275, CupB: 1275, CupC: 1275, CupD: 1275 };
  /* The Cup's league-tables endpoint serves one group per call, chosen by
     roundID (A–D; A when omitted) — confirmed against the live feed 11/09/2026. */
  var CUP_ROUND = { CupA: "A", CupB: "B", CupC: "C", CupD: "D" };
  /* Top two in each group go through. No relegation, no play-off ladder. */
  var CUP_QUALIFY = 2;

  var ROSE_WHITE = "/assets/crests/National%20League%20rose%20white.png";

  /* Division name shown beneath the title */
  var DIV_NAME = {
    National: "Enterprise National League",
    North: "Enterprise National League North",
    South: "Enterprise National League South",
    CupA: "National League Cup · Group A",
    CupB: "National League Cup · Group B",
    CupC: "National League Cup · Group C",
    CupD: "National League Cup · Group D"
  };

  /* Long names that need shortening to fit the team column */
  var SHORTEN = {
    "hampton & richmond borough": "Hampton & Richmond",
    "kidderminster harriers": "Kidderminster Harriers"
  };

  function safeText(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function title(matchday) {
    var m = String(matchday == null ? "" : matchday).trim();
    if (m === "final") return "FINAL STANDINGS";
    if (!m) return "CURRENT STANDINGS";
    return "MATCHDAY " + m;
  }

  /* A guest side is a PL2 side whatever NLS calls it: "<club> U21" and
     "<club> U23" normalise to "<club> PL2" the moment a name comes in, so
     every later step — crest, short name, the grid — sees one spelling. */
  function pl2Name(name) {
    return String(name || "").trim().replace(/\s+U2[13]$/i, " PL2");
  }
  /* The Cup's guest sides. cup-clubs-meta lists them as "<club> PL2" with a
     crestName pointing at the parent club's badge. */
  function guestOf(clubs, name) {
    var n = pl2Name(name);
    if (!/\sPL2$/i.test(n) || !clubs.guestByName) return null;
    var g = clubs.guestByName(n);
    return g ? { guest: g } : null;
  }
  /* Cup guests print without their PL2 / U21 / U23 tag: the graphic already
     says National League Cup, the crest is the parent club's, and the tag was
     what forced long names onto two lines. Decided 09/10/2026. The tagged
     name is still what crests and club records are looked up by. */
  function printName(name) {
    return String(name || "").replace(/\s+(PL2|U21|U23)$/i, "");
  }
  /* Full names for everyone, guests included (decided 09/10/2026): a table
     printing WOLVES above FC HALIFAX TOWN mixed two naming schemes. The
     guests' `short` field was written for tight spaces (SOTON, BORO) and is
     not used here. */
  function teamDisplay(clubs, name) {
    var k = String(name || "").toLowerCase().trim();
    if (SHORTEN[k]) return SHORTEN[k].toUpperCase();
    return printName(pl2Name(name)).toUpperCase();
  }
  /* Crest file for a printed name: a guest draws its parent club's badge. */
  function crestFor(clubs, name) {
    var g = guestOf(clubs, name);
    return clubs.crestUrl(g ? g.guest.crestName : name, 'medium');
  }

  /* ---------------- render ---------------- */
  function render(host, card, clubs) {
    var rows = (card.rows || []).filter(function (r) { return safeText(r.team); });
    var n = rows.length || 1;
    var div = card.division;
    var cup = !!CUP_ROUND[div];

    var gfx = document.createElement("div");
    gfx.className = "gfx";
    gfx.setAttribute("data-dir", card.dir || "1");
    gfx.setAttribute("data-format", card.format);

    /* header */
    var head = document.createElement("div");
    head.className = "gfx-head";
    head.innerHTML =
      '<div class="logo-tile"><img class="div-logo" crossorigin="anonymous" src="' + DIVISION_LOGO[div] +
        '" onerror="this.onerror=null;this.style.visibility=\'hidden\'"></div>' +
      '<div class="titles">' +
        '<span class="eyebrow">' + escapeHtml(card.season || "") + '</span>' +
        '<h1 class="gfx-title">' + escapeHtml(title(card.matchday)) + '</h1>' +
        '<p class="gfx-sub">' + (DIV_NAME[div] || "National League").toUpperCase() + '</p>' +
      '</div>' +
      '<img class="rose-wm" crossorigin="anonymous" src="' + ROSE_WHITE + '">';

    /* column set: square = full stats, portrait/story = minimal */
    var COLS_FULL = [["P","p"],["W","w"],["D","d"],["L","l"],["F","f"],["A","a"],["GD","gd"],["PTS","pts"]];
    var COLS_MIN  = [["P","p"],["GD","gd"],["PTS","pts"]];
    var cols = card.format === "1x1" ? COLS_FULL : COLS_MIN;
    gfx.setAttribute("data-cols", card.format === "1x1" ? "full" : "min");
    gfx.setAttribute("data-rows", n <= 12 ? "short" : "long");

    /* column header */
    var colhead = document.createElement("div");
    colhead.className = "gfx-colhead";
    colhead.innerHTML =
      '<span class="ch-pos">Pos</span><span></span>' +
      '<span class="ch-team">Club</span>' +
      cols.map(function (c) { return '<span class="ch-stat">' + c[0] + '</span>'; }).join("");

    /* rows */
    var rowsEl = document.createElement("div");
    rowsEl.className = "gfx-rows";

    /* TWO INDEPENDENT LAYERS:
       • RAIL  = positional, fixed for the season (z-*) — always shows the
         champion / SF / QF / relegation cut-offs by league position.
       • BAND  = confirmed to date, driven by the CSV flag (is-*) — a club
         lights up only once its tally guarantees the zone. */
    function posZone(pos) {
      /* Cup group: the two qualifying places, nothing else. They wear the
         play-off treatment — same idea, a cut-off for going through. */
      if (cup) return pos <= CUP_QUALIFY ? "po-sf" : "mid";
      if (pos === 1) return "champ";
      if (pos <= 3) return "po-sf";
      if (pos <= 7) return "po-qf";
      if (n > 11 && pos > n - 4) return "releg";
      return "mid";
    }
    rows.forEach(function (r, i) {
      var flag = (r.flag || "-").toUpperCase();
      var rowEl = document.createElement("div");
      var cls = "row z-" + posZone(i + 1);
      if (flag === "C") cls += " is-champ";
      else if (flag === "Q") cls += " is-po-sf";      /* qualified (cup) — same band as a confirmed semi-final place */
      else if (flag === "SF") cls += " is-po-sf";
      else if (flag === "QF") cls += " is-po-qf";
      else if (flag === "R") cls += " is-releg";
      rowEl.className = cls;

      /* medium tier on purpose: 24 crests render at row height in a
         1080-wide canvas, so 256px is comfortably oversampled and ~9x lighter
         than the full-res originals — the difference between ~12.6MB and
         ~1.4MB, which decides whether they all arrive on a slow connection. */
      var crest = r.team ? crestFor(clubs, r.team) : null;
      var statCells = cols.map(function (c) {
        var cls = c[1] === "pts" ? "stat pts" : "stat";
        return '<div class="' + cls + '">' + escapeHtml(r[c[1]] || "") + '</div>';
      }).join("");
      rowEl.innerHTML =
        '<div class="rail"></div>' +
        '<div class="pos">' + (i + 1) + '</div>' +
        '<div class="crest-tile">' +
          (crest ? '<img crossorigin="anonymous" src="' + crest + '" onerror="this.style.display=\'none\'">' : "") +
        '</div>' +
        '<div class="team">' + escapeHtml(teamDisplay(clubs, r.team)) + '</div>' +
        statCells;
      rowsEl.appendChild(rowEl);
    });

    /* footer — sponsor logo, centred */
    var legend = document.createElement("div");
    legend.className = "gfx-foot";
    legend.innerHTML =
      '<div class="sponsor">' +
        '<img class="sponsor-logo" crossorigin="anonymous" src="' + SPONSOR_URL + '" onerror="this.style.display=\'none\'">' +
      '</div>';

    /* column header + rows travel together, so a short table can sit
       centred in the space a full division would fill */
    var table = document.createElement("div");
    table.className = "gfx-table";
    table.appendChild(colhead);
    table.appendChild(rowsEl);

    /* assemble — dirs 3 & 4 wrap the table in a framed card on a navy field */
    if (card.dir === "3" || card.dir === "4") {
      var frame = document.createElement("div");
      frame.className = "frame";
      frame.appendChild(head);
      frame.appendChild(table);
      frame.appendChild(legend);
      gfx.appendChild(frame);
    } else {
      gfx.appendChild(head);
      gfx.appendChild(table);
      gfx.appendChild(legend);
    }

    host.innerHTML = "";
    host.appendChild(gfx);

    /* size rows after layout */
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        /* rows are flex-sized (and capped for short tables), so read the
           height they settled at rather than dividing the block by n */
        var first = rowsEl.querySelector(".row");
        var h = first ? first.clientHeight : (n ? rowsEl.clientHeight / n : 0);
        if (h) gfx.style.setProperty("--rh", h + "px");
        fitTeamColumn(rowsEl);
        resolve(gfx);
      });
    });
  }

  function fitTeamColumn(rowsEl) {
    var cells = [].slice.call(rowsEl.querySelectorAll(".row .team"));
    if (!cells.length) return;
    cells.forEach(function (c) { c.style.fontSize = ""; });
    var base = parseFloat(getComputedStyle(cells[0]).fontSize) || 20;
    var size = base, g = 0;
    var overflows = function () { return cells.some(function (c) { return c.scrollWidth > c.clientWidth + 1; }); };
    while (overflows() && size > base * 0.5 && g < 80) {
      size -= 0.5; g++;
      cells.forEach(function (c) { c.style.fontSize = size + "px"; });
    }
  }

  /* ---------------- export ---------------- */
  function toPng(gfx, format) {
    return root.NL_GFX_EXPORT.toPng(gfx, 1080, FORMAT_H[format]);
  }

  /* ---------------- National League Services ----------------
     NLS carries NO qualification zones — no champion, play-off or relegation
     marker anywhere in the response — so every flag arrives cleared. The
     positional rail down the left edge already shows the cut-offs. */

  /* clubs-meta optaID IS the NLS teamID, so a club resolves on its code. */
  function nlsTeamName(clubs, row) {
    var a = row.attributes || {};
    var club = row.id && clubs.byOpta && clubs.byOpta(row.id);
    return (club && club.name) || pl2Name(a.teamName || a.teamShortName || "");
  }
  /* The graphic prints GD with its sign, the way a table does. */
  function gdText(v) {
    var n = Number(v);
    if (v == null || v === "" || isNaN(n)) return "";
    return n > 0 ? "+" + n : String(n);
  }
  function numText(v) { return (v == null || v === "") ? "" : String(v); }

  function buildRows(data, clubs) {
    return (data || []).filter(function (r) {
      var a = (r && r.attributes) || {};
      return r && r.id && (a.teamName || a.teamShortName) && a.position != null;
    }).sort(function (x, y) {
      return (x.attributes.position || 999) - (y.attributes.position || 999);
    }).map(function (r) {
      var a = r.attributes || {};
      return {
        team: nlsTeamName(clubs, r),
        flag: "-",
        p: numText(a.played), w: numText(a.won), d: numText(a.drawn), l: numText(a.lost),
        f: numText(a.goalsFor), a: numText(a.goalsAgainst),
        gd: gdText(a.goalDifference), pts: numText(a.points)
      };
    });
  }

  root.NL_TABLE_CARD = {
    VERSION: "v1.0",
    FORMAT_H: FORMAT_H,
    NLS_BASE: NLS_BASE,
    COMPETITION_ID: COMPETITION_ID,
    CUP_ROUND: CUP_ROUND,
    CUP_QUALIFY: CUP_QUALIFY,
    DIV_NAME: DIV_NAME,
    render: render,
    toPng: toPng,
    buildRows: buildRows,
    title: title,
    pl2Name: pl2Name,
    teamDisplay: teamDisplay,
    nlsTeamName: nlsTeamName,
    gdText: gdText,
    numText: numText
  };
})(typeof window !== "undefined" ? window : this);
