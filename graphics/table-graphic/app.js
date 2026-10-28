/* ============================================================
   League Table Graphic — the tool
   File: /graphics/table-graphic/app.js
   Version: v2.0 (28/10/2026)

   The table itself is drawn by /graphics/_shared/table-card.js, the same
   renderer the scheduled batch uses; PNG export is
   /graphics/_shared/png-export.js; the preview is sized by
   /graphics/_shared/preview-fit.js; titles come from the season's round
   dates via /graphics/_shared/rounds.js.

   HOW IT IS USED
     Pick a competition and the live table loads. The title fills in from
     the last day games finished: inside a round's window that is its number
     (MATCHDAY 15), a Cup group-stage day reads GROUP STAGE – MATCHDAY 3, and
     anything else reads CURRENT STANDINGS. Type over it to change it.
     Download all three sizes, or one.

     "Table at an earlier date" (the three leagues) works the table out from
     the results up to a chosen day, because the feed only serves today's.
     Points deductions are the one thing results can't carry: any the live
     table shows are found by comparing it with the results, and each can be
     changed or added there.

     "Edit by hand" holds the season line, zone marks, the row editor and the
     paste box.

   CHANGELOG
     v2.0 28/10/2026  Rebuilt around the feed: the live table loads on its own
                      and the title fills in from the round dates. Table at an
                      earlier date, with deductions. Download one size or all
                      three. Choices persist; the table itself never does.
     v1.12 10/10/2026 A table with an image that didn't load is not downloaded:
                      a pop-up names the missing image instead.
     v1.11 09/10/2026 Drawing, NLS row-building and export moved to the
                      shared files. No change to the graphic.
   ============================================================ */
(function () {
  "use strict";

  var E = window.NLEngine;
  var R = window.NL_ROUNDS;
  var STORAGE_KEY = "nl-table-gfx-v2";
  var FORMATS = ["1x1", "4x5", "9x16"];

  /* Artwork, names and NLS codes live in /graphics/_shared/table-card.js —
     the renderer shared with the scheduled batch. */
  var T = window.NL_TABLE_CARD;
  var NLS_BASE = T.NLS_BASE;
  var COMPETITION_ID = T.COMPETITION_ID;
  var CUP_ROUND = T.CUP_ROUND;
  var CUP_QUALIFY = T.CUP_QUALIFY;
  function isCup(div) { return !!CUP_ROUND[div || state.division]; }

  /* ---------------- state ---------------- */
  var state = {
    dir: "1",
    division: "National",
    format: "1x1",           /* the size previewed */
    matchday: "",            /* the title: "15", "", "final", or text as typed */
    sub: "",                 /* the season line; filled from the season */
    asAt: "",                /* "" = the live table, or YYYY-MM-DD rebuilt */
    rows: []
  };
  var live = [];             /* the last live table from the feed, as NLS sent it */
  var deduct = {};           /* teamID → points deducted, for an earlier table */
  var _rounds = null;        /* rounds-<season>.json, once */
  var _days = {};            /* division → the season's match days */

  /* ---------------- elements ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var gfxHost = $("gfxHost");
  var stageWrap = $("stageWrap");
  var pasteEl = $("pasteIn");
  var gridBody = $("gridBody");

  /* ---------------- helpers ---------------- */
  /* Only the choices persist. The table is always fetched fresh — a graphic
     drawn from last week's saved copy is how a stale table ships. */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ division: state.division, format: state.format }));
    } catch (e) {}
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (d && typeof d === "object") {
        if (COMPETITION_ID[d.division]) state.division = d.division;
        if (FORMATS.indexOf(d.format) >= 0) state.format = d.format;
      }
    } catch (e) {}
  }
  function escapeHtml(s) { return NL.escHtml(s); }
  function ymdUK(d) { return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); }
  /* NLS kick-offs are UTC as "YYYY-MM-DD HH:MM:SS"; the match day is the
     UK date of the kick-off. */
  function koDay(s) {
    var d = new Date(String(s || "").replace(" ", "T") + "Z");
    return isNaN(d) ? "" : ymdUK(d);
  }
  function dateLabel(ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/,/g, "");
  }
  function seasonLabel(y) {
    y = parseInt(y, 10);
    return y ? y + "-" + String((y + 1) % 100).padStart(2, "0") : "";
  }

  /* ---------------- render graphic ---------------- */
  function render() {
    return T.render(gfxHost, {
      division: state.division, format: state.format, dir: state.dir,
      matchday: state.matchday, season: state.sub, rows: state.rows
    }, NL.clubs).then(fitStage);
  }

  /* Sizing the preview is shared with the other graphics tools:
     /graphics/_shared/preview-fit.js. */
  function fitStage() {
    window.NL_GFX_FIT.fit(stageWrap, gfxHost, 1080, T.FORMAT_H[state.format]);
  }

  /* ---------------- grid editor ---------------- */
  function buildGrid() {
    gridBody.innerHTML = "";
    state.rows.forEach(function (r, i) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="g-pos">' + (i + 1) + '</td>' +
        '<td><select class="nl-select g-flag" data-i="' + i + '">' +
          flagOpt("-", r.flag) + flagOpt("C", r.flag) + flagOpt("SF", r.flag) +
          flagOpt("QF", r.flag) + flagOpt("R", r.flag) + flagOpt("Q", r.flag) + '</select></td>' +
        '<td>' + teamSelect(i, r.team) + '</td>' +
        '<td><input class="g-num" data-i="' + i + '" data-k="p" value="' + escapeHtml(r.p) + '"></td>' +
        '<td><input class="g-num" data-i="' + i + '" data-k="gd" value="' + escapeHtml(r.gd) + '"></td>' +
        '<td><input class="g-num" data-i="' + i + '" data-k="pts" value="' + escapeHtml(r.pts) + '"></td>';
      gridBody.appendChild(tr);
    });
    /* Set the selection as a property, not a `selected` attribute — the value
       round-trips exactly, whatever punctuation the club name carries. */
    state.rows.forEach(function (r, i) {
      var sel = gridBody.querySelector('select.g-team[data-i="' + i + '"]');
      if (sel) sel.value = r.team || "";
    });
  }
  function flagOpt(v, cur) {
    return '<option value="' + v + '"' + (String(cur).toUpperCase() === v ? " selected" : "") + '>' + v + '</option>';
  }

  function gridChanged(e) {
    var t = e.target;
    var i = parseInt(t.getAttribute("data-i"), 10);
    if (isNaN(i) || !state.rows[i]) return;
    if (t.classList.contains("g-flag")) state.rows[i].flag = t.value;
    else if (t.classList.contains("g-team")) state.rows[i].team = t.value;
    else if (t.classList.contains("g-num")) state.rows[i][t.getAttribute("data-k")] = t.value.trim();
    syncPasteFromRows();
    render();
  }

  /* ---------------- paste <-> rows ---------------- */
  function syncRowsFromPaste() {
    var rows = E.parse(pasteEl.value);
    if (!rows.length) return;
    state.rows = rows;
    buildGrid();
    render();
    setStatus("Table typed in", 3000);
  }
  function syncPasteFromRows() {
    var lines = state.rows.map(function (r, i) {
      var f = (r.flag && r.flag !== "-") ? r.flag : String(i + 1);
      return [f, r.team, r.p, r.w, r.d, r.l, r.f, r.a, r.gd, r.pts].join("\t");
    });
    pasteEl.value = lines.join("\n");
  }

  /* ---------------- export ----------------
     Named the way the automatic tables are: "National Table 28Oct26 - 4x5.png",
     "Cup Group A Table 28Oct26 - 1x1.png". An earlier table carries its date. */
  function fileName(fmt) {
    var d = new Date((state.asAt || ymdUK(new Date())) + "T12:00:00Z");
    var ds = String(d.getUTCDate()).padStart(2, "0") +
      d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).slice(0, 3) + String(d.getUTCFullYear()).slice(2);
    var label = isCup() ? "Cup Group " + CUP_ROUND[state.division] : state.division;
    return label + " Table " + ds + " - " + fmt + ".png";
  }
  async function exportOne(fmt) {
    state.format = fmt;
    await render();
    var gfx = gfxHost.querySelector(".gfx");
    var prevT = gfx.style.transform, prevW = gfxHost.style.width, prevH = gfxHost.style.height;
    gfx.style.transform = "none";
    gfxHost.style.width = "1080px"; gfxHost.style.height = T.FORMAT_H[fmt] + "px";
    try {
      var out = await T.toPng(gfx, fmt);
      /* A table missing its sponsor or a crest never leaves. Saying so in the
         status line was not enough: on 10/10/2026 tables went out without
         the TIC Health logo and nobody saw the line. */
      if (out.late) return out.missing.length ? out.missing : ["an image"];
      NL.download(fileName(fmt), out.blob);
      return [];
    } finally {
      gfx.style.transform = prevT; gfxHost.style.width = prevW; gfxHost.style.height = prevH;
    }
  }
  /* One size or all three. Every download button is disabled while a run is
     going, so two runs can't interleave their renders. */
  async function downloadSizes(list) {
    if (!window.htmlToImage) {
      NL.toast("The download didn't start – part of the page didn't load. Reload and try again.", "error");
      return;
    }
    if (!state.rows.length) return;

    var btns = document.querySelectorAll("#downloadBtn, .dl-btn"), keep = state.format, missing = [];
    btns.forEach(function (b) { b.disabled = true; });
    var words = list.map(function (f) { return f.replace("x", ":"); });
    setStatus(list.length > 1 ? "Making " + list.length + " PNGs…" : "Making the " + words[0] + "…", 30000);
    try {
      for (var i = 0; i < list.length; i++) {
        var m = await exportOne(list[i]);
        m.forEach(function (x) { if (missing.indexOf(x) < 0) missing.push(x); });
      }
      if (missing.length) {
        var msg = "Not downloaded – " + missing.join(", ") +
                  " didn't load. Check your connection and press Download again.";
        NL.toast(msg, "error"); setStatus(msg, 15000);
      } else setStatus("Downloaded " + words.join(", ").replace(/, ([^,]*)$/, " and $1"), 4000);
    } catch (err) {
      console.error(err);
      setStatus("Export blocked — use a screenshot. (" + (err && err.message) + ")", 8000);
    } finally {
      state.format = keep; syncSizeSeg(); render();
      btns.forEach(function (b) { b.disabled = false; });
    }
  }

  var statusT;
  function setStatus(m, ms) {
    var el = $("status"); if (!el) return;
    el.textContent = m;
    clearTimeout(statusT);
    statusT = setTimeout(function () { el.textContent = "Ready"; }, ms || 2200);
  }

  function syncSizeSeg() {
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-fmt") === state.format);
    });
  }

  /* ---------------- National League Services ----------------
     The feed serves the table as it stands and nothing else: league-tables
     ignores every date parameter (checked against the live API 28/10/2026).
     An earlier table is worked out from the results — see below.

     NLS carries NO qualification zones — no champion, play-off or relegation
     marker anywhere in the response. That stays the operator's call, which is
     why a loaded table arrives with every mark cleared: mid-season nothing is
     confirmed, and the positional bands down the left edge already show the
     cut-offs without claiming anything. Mark by position fills them when the
     season has actually decided. */

  function nlsSeason() {
    var meta = NL.clubs.meta();
    return String((NL.season && NL.season.current(meta)) || NL.season.fromDate(new Date()));
  }

  function loadFromNLS() {
    var comp = COMPETITION_ID[state.division];
    if (!comp) { setStatus("No table for that competition."); return; }
    var div = state.division;
    setStatus("Loading from National League Services…", 20000);

    return NL.clubs.load()
      .catch(function () { /* fall back to the clock-derived season */ })
      .then(function () {
        return fetch(NLS_BASE + "/league-tables/?competitionID=" + comp +
                     "&seasonID=" + encodeURIComponent(nlsSeason()) +
                     (CUP_ROUND[state.division] ? "&roundID=" + CUP_ROUND[state.division] : ""));
      })
      .then(function (r) {
        if (!r.ok) throw new Error("NLS " + r.status);
        return r.json();
      })
      .then(function (j) {
        if (div !== state.division) return;          /* the competition changed while this loaded */
        live = (j && j.data) || [];
        applyTable(live);
        return autoTitle();
      })
      .catch(function (err) {
        console.error(err);
        setStatus("Couldn't reach National League Services.", 5000);
      });
  }

  function applyTable(data) {
    var rows = T.buildRows(data, NL.clubs);   /* the feed has no zones — see above */

    if (!rows.length) { setStatus("No table published yet.", 5000); return; }

    state.rows = rows;
    syncPasteFromRows(); buildGrid(); save(); render();
    setStatus("Loaded " + rows.length + " clubs · marks are yours to set", 8000);
  }

  /* ---------------- zone marks ----------------
     The graphic draws two independent layers: a positional rail that is always
     on, and a confirmed band driven by these flags. Filling by position turns
     the second into the first, which is what a final table wants and what a
     January one does not — so it is a press, never automatic. */
  function fillZonesByPosition() {
    var n = state.rows.length;
    state.rows.forEach(function (r, i) {
      var pos = i + 1;
      if (isCup()) { r.flag = pos <= CUP_QUALIFY ? "Q" : E.FLAG_NONE; return; }
      if (pos === 1) r.flag = "C";
      else if (pos <= 3) r.flag = "SF";
      else if (pos <= 7) r.flag = "QF";
      else if (n > 11 && pos > n - 4) r.flag = "R";
      else r.flag = E.FLAG_NONE;
    });
    syncPasteFromRows(); buildGrid(); save(); render();
    setStatus("Marked from the standings");
  }
  function clearZones() {
    state.rows.forEach(function (r) { r.flag = E.FLAG_NONE; });
    syncPasteFromRows(); buildGrid(); save(); render();
    setStatus("Marks cleared");
  }

  /* ---------------- matchday options ----------------
     The title. The feed doesn't say which matchday a table follows, so it
     comes from the season's round dates (the same rule as the fixtures
     cards and the automatic tables): the last day a game finished, looked up
     in the rounds file. A date inside a round's window gives its number; a
     Cup group-stage date gives GROUP STAGE – MATCHDAY n; anything else is
     left blank, which prints CURRENT STANDINGS. */

  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (r.status === 404) return null;      /* an empty window is a 404 */
      if (!r.ok) throw new Error(r.status + " " + url);
      return r.json();
    });
  }
  /* Results up to a past day don't change, so a rebuild after editing a
     deduction reuses them rather than fetching the season again. Only past
     days are kept: today's games may still be going. */
  var _past = {};
  function getMatches(from, to) {
    var url = matchesUrl(from, to);
    if (_past[url]) return Promise.resolve(_past[url]);
    return getJSON(url).then(function (j) {
      if (to < ymdUK(new Date())) _past[url] = j;
      return j;
    });
  }
  function matchesUrl(from, to) {
    return NLS_BASE + "/matches/?seasonID=" + encodeURIComponent(nlsSeason()) +
      "&competitionID=" + COMPETITION_ID[state.division] +
      "&from=" + encodeURIComponent(from + " 00:00:00Z") +
      "&to=" + encodeURIComponent(to + " 23:59:59Z") +
      "&sort=kickOffDateUTC&page.number=1&page.size=1000";
  }
  function loadRounds() {
    if (_rounds) return Promise.resolve(_rounds);
    return getJSON("/assets/data/rounds-" + seasonLabel(nlsSeason()) + ".json")
      .then(function (j) { _rounds = j || {}; return _rounds; })
      .catch(function () { _rounds = {}; return _rounds; });
  }
  function roundsKey() { return isCup() ? "Cup" : state.division; }
  function isFinished(m) {
    var p = String(((m && m.attributes) || {}).matchPeriod || "").toLowerCase();
    return p === "fulltime" || p === "postmatch";
  }

  /* The last day a game in this competition finished, looking back five
     weeks — further than any break in the season. */
  function lastPlayedDay() {
    var to = ymdUK(new Date());
    var from = ymdUK(new Date(Date.now() - 35 * 864e5));
    return getJSON(matchesUrl(from, to)).then(function (j) {
      var days = ((j && j.data) || []).filter(isFinished)
        .map(function (m) { return koDay(m.attributes.kickOffDateUTC); }).sort();
      return days.length ? days[days.length - 1] : "";
    });
  }
  function setTitle(t) {
    state.matchday = t;
    $("matchdayInput").value = t;
    render();
  }
  function titleFor(ymd) { return ymd ? R.cardTitle(_rounds, roundsKey(), ymd) : ""; }
  function autoTitle() {
    var div = state.division;
    return Promise.all([loadRounds(), lastPlayedDay()]).then(function (res) {
      if (div !== state.division || state.asAt) return;
      setTitle(titleFor(res[1]));
    }).catch(function () { setTitle(""); });
  }

  /* ---------------- a table at an earlier date ----------------
     Worked out from every finished result up to the chosen day, by
     table-card.js (rowsFromMatches). Checked against the live tables on
     28/10/2026: all 72 clubs matched row for row.

     Deductions: the live table already has them taken off, the results
     don't, so any club whose results earn more points than the live table
     gives it has had points deducted. Those are filled in the first time the
     earlier-date box opens. The tool can't know WHEN a deduction was made,
     so each one is taken off every date until it is changed here. */

  function loadDays() {
    var div = state.division;
    if (_days[div]) return Promise.resolve(_days[div]);
    var y = nlsSeason();
    return getJSON(NLS_BASE + "/matches/?seasonID=" + encodeURIComponent(y) +
      "&competitionID=" + COMPETITION_ID[div] + "&includePopulatedDates=true" +
      "&from=" + encodeURIComponent(y + "-07-01 00:00:00Z") +
      "&to=" + encodeURIComponent((+y + 1) + "-06-30 23:59:59Z") +
      "&page.number=1&page.size=1").then(function (j) {
      return (_days[div] = Object.keys((j && j.meta && j.meta.populatedDates) || {}).sort());
    });
  }

  function fillAsAtDates() {
    var sel = $("asAtSel"), today = ymdUK(new Date());
    sel.innerHTML = '<option value="">Loading dates…</option>';
    return loadDays().then(function (days) {
      var past = days.filter(function (d) { return d <= today; }).reverse();
      sel.innerHTML = '<option value="">Live table (as it stands)</option>' + past.map(function (d) {
        return '<option value="' + d + '">' + escapeHtml(dateLabel(d)) + '</option>';
      }).join("");
      sel.value = state.asAt;
    }).catch(function () { sel.innerHTML = '<option value="">Dates unavailable</option>'; });
  }

  var _deductFor = null;   /* the division the deductions were worked out for */
  function findDeductions() {
    var div = state.division;
    /* Needs the live table to compare with; the earlier-date box can be
       opened before it has loaded. */
    if (_deductFor === div || !live.length) return Promise.resolve();
    var y = nlsSeason();
    return getJSON(matchesUrl(y + "-07-01", ymdUK(new Date()))).then(function (j) {
      if (div !== state.division) return;
      var earned = T.pointsFromMatches((j && j.data) || []);
      deduct = {};
      live.forEach(function (r) {
        var got = Number((r.attributes || {}).points);
        var gap = (earned[r.id] || 0) - got;
        if (r.id && !isNaN(got) && gap > 0) deduct[r.id] = gap;
      });
      _deductFor = div;
      showDeductions();
    });
  }

  function clubName(id) {
    var c = NL.clubs.byOpta && NL.clubs.byOpta(id);
    if (c) return c.name;
    var r = live.filter(function (x) { return x.id === id; })[0];
    return r ? T.pl2Name((r.attributes || {}).teamName) : id;
  }
  function showDeductions() {
    var ids = Object.keys(deduct);
    $("dedList").innerHTML = ids.length ? ids.map(function (id) {
      return '<div class="ded"><span>' + escapeHtml(clubName(id)) + '</span>' +
        '<input type="number" min="0" max="99" class="ded-pts" data-id="' + escapeHtml(id) + '" value="' + deduct[id] + '" aria-label="Points deducted">' +
        '<button type="button" class="ded-del" data-id="' + escapeHtml(id) + '" aria-label="Remove">&times;</button></div>';
    }).join("") : '<div class="ded-none">No deductions</div>';
    var add = $("dedAdd");
    add.innerHTML = '<option value="">Add a deduction…</option>' + live.filter(function (r) {
      return r.id && !(r.id in deduct);
    }).map(function (r) { return { id: r.id, name: clubName(r.id) }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (c) {
        return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
      }).join("");
  }

  function rebuildAt(ymd) {
    state.asAt = ymd;
    document.body.classList.toggle("as-at", !!ymd);
    if (!ymd) { applyTable(live); autoTitle(); return Promise.resolve(); }
    var div = state.division;
    setStatus("Working out the table at " + dateLabel(ymd) + "…", 20000);
    return Promise.all([loadRounds(), findDeductions(),
      getMatches(nlsSeason() + "-07-01", ymd)]).then(function (res) {
      if (div !== state.division || state.asAt !== ymd) return;
      var matches = (res[2] && res[2].data) || [];
      var rows = T.rowsFromMatches(matches, NL.clubs, deduct);
      if (!rows.length) { setStatus("No results by " + dateLabel(ymd) + ".", 6000); return; }
      state.rows = rows;
      syncPasteFromRows(); buildGrid(); render();
      setTitle(titleFor(ymd));
      setStatus("Table at " + dateLabel(ymd) + " · from " + matches.filter(isFinished).length + " results", 8000);
    }).catch(function (err) {
      console.error(err);
      setStatus("Couldn't reach National League Services.", 6000);
    });
  }

  /* ---------------- club roster ----------------
     Clubs are chosen from a list rather than typed. A table row's club name is
     also its crest lookup, so a typo is a missing badge — and on a phone the
     alternative was a text box a couple of centimetres wide. Names come from
     the canon (one clubs-meta fetch per session), current season only, which
     is the only season a standings graphic is ever built from. */
  var _teamOptions = "";     /* <optgroup> markup, built once */
  var _teamNames = {};       /* lower-cased roster name → true */

  function buildTeamOptions() {
    return NL.clubs.forSeason().then(function (clubs) {
      var byDiv = function (d) { return clubs.filter(function (c) { return c.division === d; }); };
      _teamNames = {};
      _teamOptions = [
        ["National League", byDiv("National")],
        ["National League North", byDiv("North")],
        ["National League South", byDiv("South")]
      ].filter(function (g) { return g[1].length; }).map(function (g) {
        return '<optgroup label="' + escapeHtml(g[0]) + '">' + g[1].map(function (c) {
          _teamNames[String(c.name).toLowerCase()] = true;
          return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
        }).join("") + '</optgroup>';
      }).join("");
    });
  }

  /* A name the roster doesn't carry — a pasted table from another competition,
     a spelling the feed uses and clubs-meta doesn't, a Cup guest side —
     becomes its own option rather than being silently swapped for whichever
     club sorts first. */
  function teamSelect(i, val) {
    var v = String(val || ""), own = "";
    if (v && !_teamNames[v.toLowerCase()]) {
      own = '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
    }
    return '<select class="nl-select g-team" data-i="' + i + '">' +
             '<option value="">—</option>' + own + _teamOptions +
           '</select>';
  }

  /* ---------------- wire controls ---------------- */
  function changeDivision() {
    state.asAt = ""; live = []; deduct = {}; _deductFor = null;
    document.body.classList.remove("as-at");
    $("earlier").classList.toggle("hidden", isCup());
    if ($("earlier").open && !isCup()) fillAsAtDates();
    save();
    return loadFromNLS();
  }

  function init() {
    load();
    $("divisionSel").value = state.division;
    syncSizeSeg();
    $("earlier").classList.toggle("hidden", isCup());

    $("divisionSel").addEventListener("change", function () { state.division = this.value; changeDivision(); });
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.format = b.getAttribute("data-fmt"); syncSizeSeg(); save(); render();
      });
    });
    $("matchdayInput").addEventListener("input", function () { state.matchday = this.value; render(); });
    $("subIn").addEventListener("input", function () { state.sub = this.value; render(); });

    var pt;
    pasteEl.addEventListener("input", function () {
      clearTimeout(pt); pt = setTimeout(syncRowsFromPaste, 120);
    });
    gridBody.addEventListener("input", gridChanged);
    gridBody.addEventListener("change", gridChanged);
    $("zoneFillBtn").addEventListener("click", fillZonesByPosition);
    $("zoneClearBtn").addEventListener("click", clearZones);
    $("reloadBtn").addEventListener("click", function () { $("asAtSel").value = ""; rebuildAt(""); loadFromNLS(); });

    $("earlier").addEventListener("toggle", function () {
      if (this.open) { fillAsAtDates(); findDeductions().catch(function () {}); }
    });
    $("asAtSel").addEventListener("change", function () { rebuildAt(this.value); });
    $("dedList").addEventListener("input", function (e) {
      var id = e.target.getAttribute("data-id"); if (!id) return;
      deduct[id] = Math.max(0, parseInt(e.target.value, 10) || 0);
      if (state.asAt) rebuildAt(state.asAt);
    });
    $("dedList").addEventListener("click", function (e) {
      var id = e.target.classList.contains("ded-del") && e.target.getAttribute("data-id"); if (!id) return;
      delete deduct[id]; showDeductions();
      if (state.asAt) rebuildAt(state.asAt);
    });
    $("dedAdd").addEventListener("change", function () {
      if (!this.value) return;
      deduct[this.value] = 1; showDeductions();
      var inp = document.querySelector('.ded-pts[data-id="' + this.value + '"]');
      if (inp) { inp.focus(); inp.select(); }
      if (state.asAt) rebuildAt(state.asAt);
    });

    $("downloadBtn").addEventListener("click", function () { downloadSizes(FORMATS); });
    document.querySelectorAll(".dl-btn").forEach(function (b) {
      b.addEventListener("click", function () { downloadSizes([b.getAttribute("data-fmt")]); });
    });

    window.addEventListener("resize", fitStage);
    /* Cup guest sides (PL2 / U21) resolve their short names and parent crests
       from cup-clubs-meta, so load it up front and redraw when it lands. */
    if (NL.clubs.guests) NL.clubs.guests().then(render).catch(function () {});

    /* The grid is built before the roster arrives, so rebuild it once the
       options exist. */
    buildTeamOptions().then(function () { buildGrid(); render(); }).catch(function () {});

    /* clubs-meta carries the season and the optaID → club index the feed's
       names resolve through, so nothing loads before it. */
    NL.clubs.load().catch(function () {}).then(function () {
      state.sub = seasonLabel(nlsSeason());
      $("subIn").value = state.sub;
      return loadFromNLS();
    });
    render();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    [80, 300, 700].forEach(function (t) { setTimeout(fitStage, t); });
    window.addEventListener("load", fitStage);
  }

  /* Boot from auth-guard's nlAuthReady (wired in the shared head): #pageWrap
     is hidden until the session is verified, and the preview fit logic needs
     a visible container to measure. These tools read only localStorage and
     public same-origin assets — no RTDB — so booting post-auth is safe. */
  window.TOOL = window.TOOL || {};
  window.TOOL.boot = init;
  if (window._toolDeferredSession) { init(); delete window._toolDeferredSession; }
})();
