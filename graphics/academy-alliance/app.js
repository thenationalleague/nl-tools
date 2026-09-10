/* ============================================================
   Academy & Alliance Graphic — app logic.
   No feed. Everything is pasted: a fixture list or a standings
   table, straight from wherever the competition publishes it.
   The one hard problem is names — the source prints team names
   like "Hartlepool United FC U19 Hartlepool Unit" (it truncates
   at ~40 chars) — so resolveTeam() below reduces each one to the
   club it belongs to, and the club record supplies the short name
   and the crest.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "nl-academy-alliance-gfx-v1";
  var MAX_FIXTURES = 14;

  /* ---------------- competitions ----------------
     Both roundels live in assets/divisions; the 256px tier is built by the
     image-tiers Action (crest-thumbs.yml) whenever a badge lands on main. */
  var COMP = {
    academy:  { badge: "/assets/divisions/medium/NL%20Football%20Academy.png", name: "National League Football Academy" },
    alliance: { badge: "/assets/divisions/medium/NL%20U19%20Alliance.png",     name: "National League U19 Alliance" }
  };
  /* The eleven divisions and their sides, from the Divisional Constitution
     2026-27 (the League's own document). Names print as the constitution has
     them, with three deliberate edits: a trailing "FC" is dropped (Bromley,
     Folkestone Invicta, Dorchester Town…) while a leading one stays (FC Halifax
     Town, FC United of Manchester); "and" becomes "&"; Brentford keeps CST.
     `label` is what the graphic prints after the competition name. `ft` is
     the division's ID on FA Full-Time (fulltime.thefa.com, ?selectedDivision=)
     for season 395289686 (2026-27), recorded 10/09/2026 for the feed
     follow-up; nothing reads it yet. */
  var FULLTIME_SEASON = "395289686";
  var DIVISIONS = [
    { key: "academy-north", ft: "355815748", comp: "academy",  label: "North Division", teams: [
      "AFC Fylde", "Altrincham", "Boston United", "Chester", "FC Halifax Town", "Gateshead", "Harrogate Town",
      "Hartlepool United", "Hednesford Town", "Morecambe", "Solihull Moors", "South Shields", "Southport" ] },
    { key: "academy-south", ft: "681316394", comp: "academy",  label: "South Division", teams: [
      "Aldershot Town", "Boreham Wood", "Dagenham & Redbridge", "Dorking Wanderers", "Eastleigh", "Forest Green Rovers",
      "Maidenhead United", "Maidstone United", "Oxford City", "Slough Town", "Southend United", "Sutton United", "Wealdstone", "Woking" ] },
    { key: "alliance-a", ft: "308197696", comp: "alliance", label: "Division A", teams: [
      "AFC Sudbury", "Aveley", "Barking", "Billericay Town", "Bishop's Stortford", "Chelmsford City", "Enfield Town",
      "Hertford Town", "King's Lynn Town", "Lowestoft Town", "Southend United", "Wroxham" ] },
    { key: "alliance-b", ft: "531392282", comp: "alliance", label: "Division B", teams: [
      "Dover Athletic", "Burgess Hill", "Dartford", "Eastbourne Borough", "Ebbsfleet United", "Folkestone Invicta",
      "Maidstone United", "Tonbridge Angels", "Whitstable Town" ] },
    { key: "alliance-c", ft: "484327210", comp: "alliance", label: "Division C", teams: [
      "Barnet", "Bedford Town", "Brentford CST", "Chesham United", "Flackwell Heath", "Hemel Hempstead", "Hertford Town",
      "Slough Town", "Wellingborough", "Wealdstone" ] },
    { key: "alliance-d", ft: "900324610", comp: "alliance", label: "Division D", teams: [
      "Bromley", "Cray Wanderers", "Dagenham & Redbridge", "Dartford", "Dover Athletic", "Faversham Town",
      "Folkestone Invicta", "Hollands & Blair", "Ramsgate" ] },
    { key: "alliance-e", ft: "996619526", comp: "alliance", label: "Division E", teams: [
      "Basingstoke Town", "Dorchester Town", "Eastleigh", "Havant & Waterlooville", "Torquay United", "Weston-super-Mare",
      "Wimborne Town", "Yeovil Town" ] },
    { key: "alliance-f", ft: "86586371", comp: "alliance", label: "Division F", teams: [
      "AFC Greenwich Borough", "Boreham Wood", "Bromley", "Carshalton Athletic", "Chatham Town", "Dartford",
      "Dorking Wanderers", "Eastleigh", "Metropolitan Police", "Sutton United", "Woking" ] },
    { key: "alliance-g", ft: "637572765", comp: "alliance", label: "Division G", teams: [
      "Alvechurch", "Boldmere St Michaels", "Boston United", "Hednesford Town", "Ilkeston Town", "Racing Club Warwick",
      "Redditch United", "Rugby Town", "Solihull Moors", "Stourbridge", "Stratford Town", "Tamworth" ] },
    { key: "alliance-h", ft: "272864635", comp: "alliance", label: "Division H", teams: [
      "Blyth Spartans", "Blyth Town", "Darlington", "Gateshead", "Guiseley", "Harrogate Town", "Hartlepool United",
      "Heaton Stannington", "Pontefract Collieries", "South Shields" ] },
    { key: "alliance-i", ft: "421309651", comp: "alliance", label: "Division I", teams: [
      "Alfreton Town", "AFC Fylde", "Buxton", "Chester", "Chesterfield", "Chorley", "FC Halifax Town",
      "FC United of Manchester", "Marine", "Oldham Athletic", "Rochdale", "Stockport County" ] }
  ];
  function divisionOf(key) {
    for (var i = 0; i < DIVISIONS.length; i++) if (DIVISIONS[i].key === key) return DIVISIONS[i];
    return DIVISIONS[0];
  }
  /* A constitution name whose club record on the roster is spelt differently.
     The record supplies the crest; the constitution supplies the printed name. */
  var ROSTER_ALIAS = { "Hemel Hempstead": "Hemel Hempstead Town", "Rochdale": "Rochdale", "Wellingborough": "Wellingborough Town" };

  var ROSE_WHITE = "/assets/crests/National%20League%20rose%20white.png";
  /* Crests are served same-origin on purpose: the PNG export draws every image
     into a canvas, and a cross-origin image taints it. Medium tier (256px) —
     drawn at row height, so comfortably oversampled and ~9x lighter than the
     originals. A club the roster does not carry looks for a crest under its
     cleaned name, so a badge dropped into assets/crests as "<Club Name>.png"
     is picked up with no code change. */
  var CREST_BASE = "/assets/crests/medium/";
  function crestUrl(name) { return name ? CREST_BASE + encodeURIComponent(name) + ".png" : ""; }

  /* ---------------- name resolution ----------------
     The source prints "Solihull Moors U19 Elite NLA Academy", "Woking (Youth
     & Academy) U19 Elite Devel", "Kings Lynn Town FC U19 Academy" and
     "Hartlepool United FC U19 Hartlepool Unit" (it truncates at ~40 chars).
     Reading the club out of that:
       1. fold: lower-case, "&" → "and", drop apostrophes and dots, every
          other run of non-word characters → one space
       2. the LONGEST constitution name found whole inside the string is the
          side — the current division's list first, then every division
          ("Chester" never matches "Chesterfield": whole words only)
       3. failing that, the longest clubs-meta roster name, printed as-is
       4. failing that, cut at the age-group token (U19, U18, U-19…), drop
          brackets and noise words, and what is left is the name
     Every row's printed name stays editable in the grid, so the odd one the
     rules get wrong is a two-second fix rather than a code change. */
  var NOISE = { fc: 1, afc: 1, u19: 1, u18: 1, u21: 1, u23: 1, academy: 1, youth: 1, juniors: 1, alliance: 1,
    national: 1, league: 1, elite: 1, development: 1, foundation: 1, community: 1, sports: 1, club: 1,
    ct: 1, pathway: 1, velocity: 1, the: 1 };

  function fold(s) {
    return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "")
      .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function titleCase(s) {
    return s.replace(/\b[a-z]/g, function (m) { return m.toUpperCase(); })
            .replace(/\bAfc\b/g, "AFC").replace(/\bFc\b/g, "FC").replace(/\bAnd\b/g, "&");
  }
  var _constIndex = null, _rosterIndex = null;
  function keyed(names) {
    return names.map(function (n) { return { name: n, key: " " + fold(n) + " " }; })
                .sort(function (a, b) { return b.key.length - a.key.length; });
  }
  function constIndex() {
    if (_constIndex) return _constIndex;
    var seen = {}, all = [];
    DIVISIONS.forEach(function (d) { d.teams.forEach(function (t) { if (!seen[t]) { seen[t] = 1; all.push(t); } }); });
    _constIndex = keyed(all);
    return _constIndex;
  }
  function rosterIndex() {
    if (_rosterIndex) return _rosterIndex;
    var meta = NL.clubs.meta();
    if (!meta) return [];
    _rosterIndex = keyed((meta.clubs || []).map(function (c) { return c.name; }));
    return _rosterIndex;
  }
  function findIn(index, padded) {
    for (var i = 0; i < index.length; i++) if (padded.indexOf(index[i].key) >= 0) return index[i].name;
    return null;
  }
  /* The roster record a printed name draws its crest from, or null. */
  function rosterClub(name) {
    var want = ROSTER_ALIAS[name] || name;
    var rec = NL.clubs.byName(want);
    if (rec) return rec.name;
    var f = " " + fold(want) + " ", idx = rosterIndex();
    for (var i = 0; i < idx.length; i++) if (idx[i].key === f) return idx[i].name;
    return null;
  }
  /* → { club (roster record name or null), name (crest filename stem),
         display (what the graphic prints) } */
  function resolveTeam(raw, divisionKey) {
    var f = fold(raw);
    if (!f) return { club: null, name: "", display: "" };
    /* a non-leading FC/AFC is never part of the name ("Brentford FC CST" is
       the constitution's "Brentford CST"; "Guiseley AFC" is Guiseley) */
    var padded = " " + f.replace(/ (fc|afc)(?= |$)/g, "") + " ";
    var dv = divisionKey ? divisionOf(divisionKey) : null;
    var hit = (dv && findIn(keyed(dv.teams), padded)) || findIn(constIndex(), padded);
    if (hit) {
      var club = rosterClub(hit);
      return { club: club, name: club || hit, display: hit };
    }
    var rhit = findIn(rosterIndex(), padded);
    if (rhit) return { club: rhit, name: rhit, display: rhit };
    /* nobody we know: cut at the age group, drop brackets and noise */
    var raw2 = String(raw || "").toLowerCase().replace(/\([^)]*\)/g, " ");
    var cut = fold(raw2).split(/\bu ?-?1[89]\b|\bu ?-?2[13]\b|\bunder 1[89]\b/)[0].trim();
    var words = cut.split(" ").filter(function (w, i) {
      if (!w) return false;
      if ((w === "fc" || w === "afc") && i === 0) return true;   /* AFC Sudbury, FC United — the prefix is the name */
      return !NOISE[w];
    });
    /* "Hertford Town Hertford Town" — the source repeats the name when the
       team has no other label; keep one copy */
    var half = words.length / 2;
    if (words.length >= 2 && words.length % 2 === 0 && words.slice(0, half).join(" ") === words.slice(half).join(" ")) words = words.slice(0, half);
    var name = titleCase(words.join(" "));
    return { club: null, name: name, display: name };
  }

  /* ---------------- state ---------------- */
  var state = {
    division: "academy-north",
    type: "fixtures",          /* fixtures | results | table */
    format: "1x1",
    crests: true,
    title: "",
    sub: "2026-27",
    footnote: "",
    fixtures: [],              /* {home, away, hs, as, ko} | {divider} */
    table: []                  /* {team, label, p, w, d, l, f, a, gd, pts, adj} */
  };
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (d && typeof d === "object") {
        ["division", "type", "format", "title", "sub", "footnote"].forEach(function (k) {
          if (typeof d[k] === "string") state[k] = d[k];
        });
        if (typeof d.crests === "boolean") state.crests = d.crests;
        if (Array.isArray(d.fixtures)) state.fixtures = d.fixtures;
        if (Array.isArray(d.table)) state.table = d.table;
      }
    } catch (e) {}
    if (!divisionOf(state.division) || DIVISIONS.map(function (x) { return x.key; }).indexOf(state.division) < 0) state.division = DIVISIONS[0].key;
    if (["fixtures", "results", "table"].indexOf(state.type) < 0) state.type = "fixtures";
  }

  function headline() {
    var t = (state.title || "").trim();
    if (t) return /^\d{1,2}$/.test(t) ? "MATCHDAY " + t : t;
    return state.type === "table" ? "CURRENT STANDINGS" : state.type === "results" ? "RESULTS" : "FIXTURES";
  }
  function subLine() {
    var dv = divisionOf(state.division);
    return (COMP[dv.comp].name + "  ·  " + dv.label).toUpperCase();
  }

  /* ---------------- elements ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var gfxHost, stageWrap, pasteEl, fxBody, tbBody;
  function esc(s) { return NL.escHtml(s); }

  /* ---------------- paste → fixtures ----------------
     home / [score or v] / away per line. A line with no opponent — a date, a
     round heading, anything on its own — becomes a divider, so a list copied
     day-by-day keeps its day headings. */
  function parseScore(s) {
    var m = String(s || "").match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
    return m ? { hs: m[1], as: m[2] } : null;
  }
  function splitFixture(line) {
    if (line.indexOf("\t") >= 0) return line.split("\t");
    var sm = line.match(/^(.*?)\s+(\d{1,2}\s*[-–:]\s*\d{1,2})\s+(.*)$/);
    if (sm) return [sm[1], sm[2], sm[3]];
    var vm = line.split(/\s+(?:v|vs)\.?\s+/i);
    if (vm.length === 2) return [vm[0], "", vm[1]];
    if (line.indexOf(",") >= 0) return line.split(",");
    return [line];
  }
  function parseFixtures(raw) {
    var lines = (raw || "").replace(/\r/g, "\n").split("\n")
      .map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
    var out = [], n = 0;
    lines.forEach(function (line) {
      var cells = splitFixture(line).map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
      if (!cells.length) return;
      if (cells.length === 1) { out.push({ divider: cells[0] }); return; }
      if (n >= MAX_FIXTURES) return;
      var home = cells[0], away = cells[cells.length - 1], hs = "", as = "", ko = "";
      for (var k = 1; k < cells.length - 1; k++) {
        var sc = parseScore(cells[k]);
        if (sc) { hs = sc.hs; as = sc.as; break; }
        if (/^\d{1,2}[:.]\d{2}$/.test(cells[k])) ko = cells[k].replace(".", ":");
      }
      out.push({ home: home, away: away, hs: hs, as: as, ko: ko }); n++;
    });
    return out;
  }

  /* ---------------- paste → table ----------------
     Pos Team P W D L F A GD Pts, tab- or space-separated, header optional.
     An asterisk anywhere on the row marks a points adjustment. */
  function splitTable(line) {
    if (line.indexOf("\t") >= 0) return line.split("\t");
    if (line.indexOf(",") >= 0) return line.split(",");
    /* space-separated: the team name has spaces in it, so peel numbers off
       the right and take the left as the name */
    var m = line.match(/^(\d+)?\s*(.*?)\s+((?:[-+]?\d+\s*\*?\s*){8,9})$/);
    if (m) return [m[1] || ""].concat([m[2]], m[3].trim().split(/\s+/));
    return [line];
  }
  function isHeader(cells) {
    var j = cells.join(" ").toLowerCase();
    return j.indexOf("team") >= 0 && (j.indexOf("pts") >= 0 || j.indexOf("points") >= 0);
  }
  function parseTable(raw) {
    var lines = (raw || "").replace(/\r/g, "\n").split("\n")
      .map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
    var out = [];
    lines.forEach(function (line) {
      var cells = splitTable(line).map(function (s) { return s.trim(); });
      if (isHeader(cells)) return;
      var adj = /\*/.test(line);
      cells = cells.map(function (s) { return s.replace(/\*/g, "").trim(); }).filter(function (s) { return s.length; });
      if (cells.length < 3) return;
      var ti = /^\d+$/.test(cells[0]) ? 1 : 0;
      var team = cells[ti];
      var nums = cells.slice(ti + 1).filter(function (s) { return /^[-+]?\d+$/.test(s); });
      if (!team || nums.length < 2) return;
      var r = { team: team, label: "", adj: adj, p: nums[0] || "", pts: nums[nums.length - 1] || "",
                gd: nums.length >= 3 ? nums[nums.length - 2] : "", w: "", d: "", l: "", f: "", a: "" };
      if (nums.length >= 8) { r.w = nums[1]; r.d = nums[2]; r.l = nums[3]; r.f = nums[4]; r.a = nums[5]; }
      out.push(r);
    });
    return out;
  }

  /* ---------------- render ---------------- */
  function headHtml() {
    var dv = divisionOf(state.division);
    return '<div class="logo-tile"><img class="div-logo" crossorigin="anonymous" src="' + COMP[dv.comp].badge +
        '" onerror="this.onerror=null;this.style.visibility=\'hidden\'"></div>' +
      '<div class="titles">' +
        '<span class="eyebrow">' + esc(state.sub || "") + '</span>' +
        '<h1 class="gfx-title">' + esc(headline()) + '</h1>' +
        '<p class="gfx-sub">' + esc(subLine()) + '</p>' +
      '</div>' +
      '<img class="rose-wm" crossorigin="anonymous" src="' + ROSE_WHITE + '">';
  }
  function crestImg(url) {
    return url ? '<img crossorigin="anonymous" src="' + url + '" onerror="this.classList.add(\'missing\')">' : "";
  }
  function displayFor(raw, label) {
    var l = String(label || "").trim();
    return (l || resolveTeam(raw, state.division).display || String(raw || "")).toUpperCase();
  }

  function render() {
    var gfx = document.createElement("div");
    gfx.className = "gfx";
    gfx.setAttribute("data-format", state.format);
    gfx.setAttribute("data-type", state.type);
    gfx.setAttribute("data-crests", state.crests ? "on" : "off");

    var head = document.createElement("div");
    head.className = "gfx-head";
    head.innerHTML = headHtml();
    gfx.appendChild(head);

    if (state.type === "table") renderTable(gfx); else renderFixtures(gfx);

    gfxHost.innerHTML = "";
    gfxHost.appendChild(gfx);
    requestAnimationFrame(function () { fitTitle(gfx); fitStage(); });
  }

  function renderFixtures(gfx) {
    var fc = 0;
    var rows = state.fixtures.filter(function (r) {
      if (r.divider != null) return true;
      if (!((r.home || "").trim() || (r.away || "").trim())) return false;
      fc++; return fc <= MAX_FIXTURES;
    });
    var body = document.createElement("div");
    body.className = "gfx-body";
    rows.forEach(function (r) {
      if (r.divider != null) {
        var dv = document.createElement("div");
        dv.className = "fx-divider";
        dv.innerHTML = '<span class="dv-text">' + esc(r.divider) + '</span>';
        body.appendChild(dv);
        return;
      }
      var h = resolveTeam(r.home, state.division), a = resolveTeam(r.away, state.division);
      var hasScore = state.type === "results" && r.hs !== "" && r.as !== "";
      var mid = hasScore
        ? '<span class="score">' + esc(r.hs) + '&nbsp;-&nbsp;' + esc(r.as) + '</span>'
        : '<span class="vs">v</span>' + (r.ko ? '<span class="ko">' + esc(r.ko) + '</span>' : "");
      var row = document.createElement("div");
      row.className = "fx";
      row.innerHTML =
        '<div class="crest home"><div class="tile">' + crestImg(crestUrl(h.name)) + '</div></div>' +
        '<div class="bar home"><span class="nm">' + esc(displayFor(r.home, r.hl)) + '</span></div>' +
        '<div class="mid">' + mid + '</div>' +
        '<div class="bar away"><span class="nm">' + esc(displayFor(r.away, r.al)) + '</span></div>' +
        '<div class="crest away"><div class="tile">' + crestImg(crestUrl(a.name)) + '</div></div>';
      body.appendChild(row);
    });
    gfx.appendChild(body);
    var foot = document.createElement("div");
    foot.className = "gfx-foot";
    gfx.appendChild(foot);

    requestAnimationFrame(function () {
      var avail = body.clientHeight, gap = 8;
      var fixtureCount = rows.filter(function (r) { return r.divider == null; }).length;
      var units = fixtureCount + (rows.length - fixtureCount) * 0.5 || 1;
      var rh = Math.floor((avail - gap * (rows.length - 1)) / units);
      rh = Math.max(44, Math.min(rh, 98));
      gfx.style.setProperty("--rh", rh + "px");
      gfx.style.setProperty("--row-gap", gap + "px");
      gfx.style.setProperty("--crest", rh + "px");
      gfx.style.setProperty("--mid", Math.max(86, Math.round(rh * 1.3)) + "px");
      fitNames(body);
    });
  }

  var COLS = [["P","p"],["W","w"],["D","d"],["L","l"],["F","f"],["A","a"],["GD","gd"],["PTS","pts"]];
  function renderTable(gfx) {
    var rows = state.table.filter(function (r) { return (r.team || "").trim(); });
    var colhead = document.createElement("div");
    colhead.className = "gfx-colhead";
    colhead.innerHTML =
      '<span class="ch-pos">Pos</span><span class="ch-crest"></span><span class="ch-team">Club</span>' +
      COLS.map(function (c) { return '<span class="ch-stat">' + c[0] + '</span>'; }).join("");
    var rowsEl = document.createElement("div");
    rowsEl.className = "gfx-rows";
    var anyAdj = false;
    rows.forEach(function (r, i) {
      var t = resolveTeam(r.team, state.division);
      var el = document.createElement("div");
      el.className = "row";
      if (r.adj) anyAdj = true;
      el.innerHTML =
        '<div class="pos">' + (i + 1) + '</div>' +
        '<div class="crest-tile">' + crestImg(crestUrl(t.name)) + '</div>' +
        '<div class="team">' + esc(displayFor(r.team, r.label)) + '</div>' +
        COLS.map(function (c) {
          var v = esc(r[c[1]] || "");
          if (c[1] === "pts" && r.adj) v += '<span class="adj">*</span>';
          return '<div class="stat' + (c[1] === "pts" ? " pts" : "") + '">' + v + '</div>';
        }).join("");
      rowsEl.appendChild(el);
    });
    gfx.appendChild(colhead);
    gfx.appendChild(rowsEl);
    var foot = document.createElement("div");
    foot.className = "gfx-foot";
    var note = (state.footnote || "").trim();
    if (note) foot.textContent = note;
    else if (anyAdj) foot.textContent = "* Points adjusted";
    gfx.appendChild(foot);

    requestAnimationFrame(function () {
      /* the rows are flex-sized by CSS; read the height they settled at so
         the type scales with it, then shrink the longest name to fit */
      var first = rowsEl.querySelector(".row");
      if (first) gfx.style.setProperty("--rh", Math.max(30, first.clientHeight) + "px");
      fitTeamColumn(rowsEl);
    });
  }

  function fitTitle(gfx) {
    var titleEl = gfx.querySelector(".gfx-title");
    if (!titleEl) return;
    titleEl.style.fontSize = "";
    var tsize = 66, g = 0;
    while (titleEl.scrollHeight > tsize * 0.9 * 2 + 6 && tsize > 34 && g < 40) {
      tsize -= 1.5; titleEl.style.fontSize = tsize + "px"; g++;
    }
  }

  /* One line is the goal: shrink the whole set a little so every name sits
     on one line; a name that still cannot fit wraps rather than dragging the
     others down with it. */
  var MIN_RATIO = 0.82;
  function barAvailWidth(nm) {
    var bar = nm.parentNode, cs = getComputedStyle(bar);
    return bar.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  }
  function oneLineSize(nm, base, floor) {
    var avail = barAvailWidth(nm);
    nm.style.whiteSpace = "nowrap";
    var size = base, g = 0;
    nm.style.fontSize = size + "px";
    while (nm.scrollWidth > avail + 1 && size > floor && g < 120) { size -= 0.5; nm.style.fontSize = size + "px"; g++; }
    return { size: size, fits: nm.scrollWidth <= avail + 1 };
  }
  function fitNames(body) {
    var nms = [].slice.call(body.querySelectorAll(".fx .nm"));
    if (!nms.length) return;
    nms.forEach(function (nm) { nm.style.fontSize = ""; nm.style.whiteSpace = ""; });
    var base = parseFloat(getComputedStyle(nms[0]).fontSize) || 20, floor = base * MIN_RATIO;
    var minSize = base;
    nms.forEach(function (nm) { var r = oneLineSize(nm, base, floor); if (r.fits && r.size < minSize) minSize = r.size; });
    nms.forEach(function (nm) {
      nm.style.fontSize = minSize + "px"; nm.style.whiteSpace = "nowrap";
      if (nm.scrollWidth <= barAvailWidth(nm) + 1) return;
      nm.style.whiteSpace = "normal";
      var row = nm.parentNode.parentNode, rowH = row ? row.clientHeight : 0, size = minSize, g = 0;
      while (rowH && nm.scrollHeight > rowH - 2 && size > base * 0.5 && g < 60) { size -= 0.5; nm.style.fontSize = size + "px"; g++; }
    });
  }

  /* Every team cell shares one size: the largest at which the longest name
     fits its column. FC HALIFAX TOWN and HARTLEPOOL UNITED should not clip
     while the rest sit at full size next to them. */
  function fitTeamColumn(rowsEl) {
    var cells = [].slice.call(rowsEl.querySelectorAll(".row .team"));
    if (!cells.length) return;
    cells.forEach(function (c) { c.style.fontSize = ""; });
    var base = parseFloat(getComputedStyle(cells[0]).fontSize) || 20;
    var size = base, g = 0;
    var overflows = function () { return cells.some(function (c) { return c.scrollWidth > c.clientWidth + 1; }); };
    while (overflows() && size > base * 0.6 && g < 80) {
      size -= 0.5; g++;
      cells.forEach(function (c) { c.style.fontSize = size + "px"; });
    }
  }

  function fitStage() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx) return;
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
    var availW = stageWrap.clientWidth - 24;
    /* The height budget is derived from the sticky offset plus the preview's
       own chrome, never from where the stage happens to sit — a pinned
       preview that measures itself grows a little on every redraw. */
    var preview = stageWrap.closest ? stageWrap.closest(".preview") : stageWrap.parentNode;
    var availH = window.innerHeight - 24;
    if (preview) {
      var pv = getComputedStyle(preview);
      var pinned = (pv.position === "sticky" || pv.position === "fixed") ? parseFloat(pv.top) : NaN;
      if (!isNaN(pinned)) {
        var chrome = stageWrap.getBoundingClientRect().top - preview.getBoundingClientRect().top;
        availH = window.innerHeight - pinned - chrome - 24;
      }
    }
    var scale = Math.min(1, availW / 1080);
    if (availH > 160) scale = Math.min(scale, availH / h);
    gfx.style.transformOrigin = "top left";
    gfx.style.transform = "scale(" + scale + ")";
    gfxHost.style.width = (1080 * scale) + "px";
    gfxHost.style.height = (h * scale) + "px";
  }

  /* ---------------- grid editors ---------------- */
  function resolvedHint(raw) {
    var t = resolveTeam(raw, state.division);
    if (!raw) return "";
    return t.club ? '<span class="hint ok" title="Crest: ' + esc(t.club) + '">' + esc(t.display) + '</span>'
                  : '<span class="hint" title="No crest on file — add assets/crests/' + esc(t.name) + '.png">' + esc(t.display) + '</span>';
  }
  function buildFixtureGrid() {
    fxBody.innerHTML = "";
    state.fixtures.forEach(function (r, i) {
      var tr = document.createElement("tr");
      var ins = '<td><button type="button" class="g-ins" data-i="' + i + '" title="Insert a heading above">＋</button></td>';
      var del = '<td><button type="button" class="g-del" data-i="' + i + '" title="Remove">&times;</button></td>';
      if (r.divider != null) {
        tr.className = "divider-row";
        tr.innerHTML = ins + '<td colspan="5"><input class="g-div" data-i="' + i + '" data-k="divider" placeholder="Heading e.g. SAT 13 SEP" value="' + esc(r.divider) + '"></td>' + del;
      } else {
        tr.innerHTML = ins +
          '<td><input class="g-team" list="teamList" data-i="' + i + '" data-k="home" value="' + esc(r.home) + '">' + resolvedHint(r.home) + '</td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="hs" value="' + esc(r.hs) + '"></td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="as" value="' + esc(r.as) + '"></td>' +
          '<td><input class="g-team" list="teamList" data-i="' + i + '" data-k="away" value="' + esc(r.away) + '">' + resolvedHint(r.away) + '</td>' +
          '<td class="col-ko"><input class="g-ko" data-i="' + i + '" data-k="ko" value="' + esc(r.ko || "") + '" placeholder="KO"></td>' +
          del;
      }
      fxBody.appendChild(tr);
    });
  }
  function buildTableGrid() {
    tbBody.innerHTML = "";
    state.table.forEach(function (r, i) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="g-idx">' + (i + 1) + '</td>' +
        '<td><input class="g-team" list="teamList" data-i="' + i + '" data-k="team" value="' + esc(r.team) + '">' + resolvedHint(r.team) + '</td>' +
        '<td><input class="g-label" data-i="' + i + '" data-k="label" value="' + esc(r.label || "") + '" placeholder="' + esc(resolveTeam(r.team, state.division).display) + '"></td>' +
        COLS.map(function (c) { return '<td><input class="g-num" data-i="' + i + '" data-k="' + c[1] + '" value="' + esc(r[c[1]] || "") + '"></td>'; }).join("") +
        '<td class="g-adj"><input type="checkbox" data-i="' + i + '" data-k="adj"' + (r.adj ? " checked" : "") + ' title="Points adjusted"></td>' +
        '<td><button type="button" class="g-del" data-i="' + i + '" title="Remove">&times;</button></td>';
      tbBody.appendChild(tr);
    });
  }
  function rowsOf() { return state.type === "table" ? state.table : state.fixtures; }
  function buildGrid() { if (state.type === "table") buildTableGrid(); else buildFixtureGrid(); }

  function gridChanged(e) {
    var t = e.target, rows = rowsOf();
    var i = parseInt(t.getAttribute("data-i"), 10);
    if (isNaN(i) || !rows[i]) return;
    var k = t.getAttribute("data-k");
    if (!k) return;
    rows[i][k] = t.type === "checkbox" ? t.checked : t.value;
    if (k === "home" || k === "away" || k === "team") {
      var hint = t.parentNode.querySelector(".hint");
      var fresh = resolvedHint(t.value);
      if (hint) hint.outerHTML = fresh; else t.insertAdjacentHTML("afterend", fresh);
      if (k === "team") { var lab = t.parentNode.nextElementSibling.querySelector(".g-label"); if (lab) lab.placeholder = resolveTeam(t.value, state.division).display; }
    }
    if (k !== "divider" && k !== "label") syncPasteFromRows();
    save(); render();
  }
  function gridClicked(e) {
    var t = e.target, rows = rowsOf();
    var i = parseInt(t.getAttribute("data-i"), 10);
    if (isNaN(i)) return;
    if (t.classList.contains("g-ins")) {
      rows.splice(i, 0, { divider: "" });
      buildGrid(); save(); render();
      var inp = fxBody.querySelector('tr:nth-child(' + (i + 1) + ') .g-div');
      if (inp) inp.focus();
      return;
    }
    if (t.classList.contains("g-del")) { rows.splice(i, 1); syncPasteFromRows(); buildGrid(); save(); render(); }
  }

  /* ---------------- paste sync ---------------- */
  function syncRowsFromPaste() {
    if (state.type === "table") {
      var prevT = state.table.slice();
      state.table = parseTable(pasteEl.value).map(function (r) {
        var m = prevT.find(function (p) { return p.team === r.team; });
        if (m && m.label) r.label = m.label;
        return r;
      });
    } else {
      var prev = state.fixtures.slice();
      var parsed = parseFixtures(pasteEl.value);
      parsed.forEach(function (r) {
        if (r.divider != null) return;
        var m = prev.find(function (p) { return p.divider == null && p.home === r.home && p.away === r.away; });
        if (m) { if (!r.hs && !r.as) { r.hs = m.hs; r.as = m.as; } if (!r.ko) r.ko = m.ko; r.hl = m.hl; r.al = m.al; }
      });
      state.fixtures = parsed;
    }
    buildGrid(); save(); render(); reportMatches();
  }
  function syncPasteFromRows() {
    if (state.type === "table") {
      pasteEl.value = state.table.map(function (r, i) {
        return [i + 1, r.team, r.p, r.w, r.d, r.l, r.f, r.a, r.gd, r.pts + (r.adj ? " *" : "")].join("\t");
      }).join("\n");
    } else {
      pasteEl.value = state.fixtures.map(function (r) {
        if (r.divider != null) return r.divider;
        var mid = (r.hs !== "" && r.as !== "") ? r.hs + "-" + r.as : (r.ko || "v");
        return [r.home, mid, r.away].join("\t");
      }).join("\n");
    }
  }
  function reportMatches() {
    var names = state.type === "table"
      ? state.table.map(function (r) { return r.team; })
      : state.fixtures.filter(function (r) { return r.divider == null; }).reduce(function (a, r) { return a.concat([r.home, r.away]); }, []);
    names = names.filter(Boolean);
    if (!names.length) return;
    var miss = names.filter(function (n) { return !resolveTeam(n, state.division).club; });
    setStatus(miss.length ? miss.length + " of " + names.length + " without a crest on file" : "All " + names.length + " matched", 4000);
  }

  /* ---------------- datalist ----------------
     The chosen division's sides come first, then the whole roster, so a
     typed fixture picks from the right eight-to-fourteen without hiding a
     cup opponent from elsewhere. */
  var _rosterNames = [];
  function buildTeamList() {
    var dl = $("teamList");
    if (!dl) return;
    var dv = divisionOf(state.division);
    var seen = {};
    var names = dv.teams.concat(_rosterNames).filter(function (n) { if (seen[n]) return false; seen[n] = 1; return true; });
    dl.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
  }

  /* ---------------- export ----------------
     Canon candidate (10/09/2026): downloadPNG / whenImageReady / inlineImages
     are now hand-rolled in three graphics tools (fixtures-graphic,
     table-graphic, here). Promote to NL.* when the next one needs them. */
  function fileName() {
    var d = new Date();
    var ds = String(d.getDate()).padStart(2, "0") + d.toLocaleString("en-GB", { month: "short" }) + String(d.getFullYear()).slice(2);
    var dv = divisionOf(state.division);
    var kind = state.type === "table" ? "Table" : state.type === "results" ? "Results" : "Fixtures";
    return kind + " " + (dv.comp === "academy" ? "Academy " : "Alliance ") + dv.label + " " + ds + " - " + state.format + ".png";
  }
  async function downloadPNG() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx || !window.htmlToImage) return;
    var prevT = gfx.style.transform, prevW = gfxHost.style.width, prevH = gfxHost.style.height;
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
    gfx.style.transform = "none";
    gfxHost.style.width = "1080px"; gfxHost.style.height = h + "px";
    setStatus("Rendering PNG…");
    var restore = function () {};
    try {
      await (document.fonts && document.fonts.ready);
      var pending = [].slice.call(gfx.querySelectorAll("img")).filter(function (img) { return !img.classList.contains("missing"); });
      var loaded = await Promise.all(pending.map(function (img) { return whenImageReady(img, 10000); }));
      var late = loaded.filter(function (ok) { return !ok; }).length;
      restore = await inlineImages(gfx);
      var blob = await window.htmlToImage.toBlob(gfx, {
        width: 1080, height: h, pixelRatio: 1, cacheBust: false,
        backgroundColor: getComputedStyle(gfx).backgroundColor
      });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      setStatus(late
        ? "Downloaded — but " + late + " image" + (late === 1 ? "" : "s") + " didn't load. Check your connection and export again."
        : "Downloaded " + state.format);
    } catch (err) {
      console.error(err);
      setStatus("Export blocked — use a screenshot.");
    } finally {
      try { restore(); } catch (e) {}
      gfx.style.transform = prevT; gfxHost.style.width = prevW; gfxHost.style.height = prevH;
    }
  }
  function whenImageReady(img, ms) {
    return new Promise(function (resolve) {
      if (img.complete && img.naturalWidth) return resolve(true);
      if (img.complete) return resolve(false);
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        img.removeEventListener("load", onLoad); img.removeEventListener("error", onError);
        resolve(ok);
      }
      function onLoad() { finish(!!img.naturalWidth); }
      function onError() { finish(false); }
      var timer = setTimeout(function () { finish(false); }, ms || 10000);
      img.addEventListener("load", onLoad); img.addEventListener("error", onError);
    });
  }
  async function inlineImages(root) {
    var BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    var imgs = [].slice.call(root.querySelectorAll("img")), restores = [];
    imgs.forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (!src || src.indexOf("data:") === 0) return;
      var done = false;
      try {
        if (img.complete && img.naturalWidth) {
          var c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          var url = c.toDataURL("image/png");
          restores.push([img, src]); img.setAttribute("src", url); done = true;
        }
      } catch (e) {}
      if (!done) { restores.push([img, src]); img.setAttribute("src", BLANK); }
    });
    return function () { restores.forEach(function (p) { p[0].setAttribute("src", p[1]); }); };
  }
  var statusT;
  function setStatus(m, ms) {
    var el = $("status"); if (!el) return;
    el.textContent = m; clearTimeout(statusT);
    statusT = setTimeout(function () { el.textContent = "Ready"; }, ms || 2200);
  }

  /* ---------------- toggles ---------------- */
  function setType(t) {
    state.type = t;
    document.querySelectorAll(".type-btn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-type") === t); });
    document.body.setAttribute("data-type", t);
    pasteEl.placeholder = t === "table"
      ? "Paste the table — one row per line:\nPos  Team  P  W  D  L  F  A  GD  Pts"
      : t === "results"
        ? "One match per line:\nHome  2-1  Away\nA line on its own becomes a heading."
        : "One match per line:\nHome  v  Away\nA line on its own becomes a heading.";
    $("titleInput").placeholder = t === "table" ? "Current Standings" : t === "results" ? "Results" : "Fixtures — or a matchday number";
    syncPasteFromRows(); buildGrid(); save(); render();
  }
  function syncSizeSeg() {
    document.querySelectorAll(".size-btn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-fmt") === state.format); });
  }

  /* ---------------- init ---------------- */
  function init() {
    gfxHost = $("gfxHost"); stageWrap = $("stageWrap");
    pasteEl = $("pasteIn"); fxBody = $("fxBody"); tbBody = $("tbBody");

    load();
    var sel = $("divisionSel");
    sel.innerHTML = DIVISIONS.map(function (d) {
      return '<option value="' + d.key + '">' + esc((d.comp === "academy" ? "Academy — " : "U19 Alliance — ") + d.label) + '</option>';
    }).join("");
    sel.value = state.division;
    $("titleInput").value = state.title;
    $("seasonInput").value = state.sub;
    $("footnoteInput").value = state.footnote;
    $("crestToggle").checked = state.crests;
    syncSizeSeg();
    setType(state.type);

    sel.addEventListener("change", function () { state.division = this.value; buildTeamList(); buildGrid(); save(); render(); reportMatches(); });
    $("titleInput").addEventListener("input", function () { state.title = this.value; save(); render(); });
    $("seasonInput").addEventListener("input", function () { state.sub = this.value; save(); render(); });
    $("footnoteInput").addEventListener("input", function () { state.footnote = this.value; save(); render(); });
    $("crestToggle").addEventListener("change", function () { state.crests = this.checked; save(); render(); });
    document.querySelectorAll(".type-btn").forEach(function (b) { b.addEventListener("click", function () { setType(b.getAttribute("data-type")); }); });
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.addEventListener("click", function () { state.format = b.getAttribute("data-fmt"); syncSizeSeg(); save(); render(); });
    });
    var pt;
    pasteEl.addEventListener("input", function () { clearTimeout(pt); pt = setTimeout(syncRowsFromPaste, 140); });
    [fxBody, tbBody].forEach(function (b) { b.addEventListener("input", gridChanged); b.addEventListener("click", gridClicked); });
    $("downloadBtn").addEventListener("click", downloadPNG);
    $("resetBtn").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state.fixtures = []; state.table = []; state.title = ""; state.footnote = ""; state.format = "1x1"; state.crests = true;
      $("titleInput").value = ""; $("footnoteInput").value = ""; $("crestToggle").checked = true; syncSizeSeg();
      setType(state.type); setStatus("Reset");
    });

    window.addEventListener("resize", fitStage);
    /* Names, short names and crests all read the roster, which is empty
       until clubs-meta lands — rebuild the index and redraw then. */
    NL.clubs.load().then(function (meta) {
      _rosterIndex = null;
      _rosterNames = (meta.clubs || []).map(function (c) { return c.name; }).sort();
      buildTeamList(); buildGrid(); render(); reportMatches();
    }).catch(function () {});
    buildTeamList();
    render();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    [80, 300, 700].forEach(function (t) { setTimeout(fitStage, t); });
    window.addEventListener("load", fitStage);
  }

  /* Boot from auth-guard's nlAuthReady: #pageWrap is hidden until the session
     is verified and the preview fit needs a visible container to measure.
     This tool reads only localStorage and public same-origin assets. */
  window.TOOL = window.TOOL || {};
  window.TOOL.boot = init;
  window.TOOL.resolveTeam = resolveTeam;   /* exposed for tests/academy-alliance-names.test.mjs */
  if (window._toolDeferredSession) { init(); delete window._toolDeferredSession; }
})();
