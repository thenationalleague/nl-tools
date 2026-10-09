/* ============================================================
   Fixtures & Results Graphic — the tool
   File: /graphics/fixtures-graphic/fixtures-app.js
   Version: v2.0 (09/10/2026)

   ONE TOOL, TWO DOORS. This file is the whole tool and both editions load
   it: /graphics/fixtures-graphic/ (behind a login) and
   /public/fixtures-graphic/ (open, for freelancers without an account). It
   builds its own controls into #fxTool, so the two pages hold no tool markup
   of their own and cannot drift apart. Nothing here reads RTDB; clubs,
   crests, rounds and fixtures are all public files or the public NLS API.

   The card is drawn by /graphics/_shared/fixtures-card.js — the renderer
   the scheduled batch uses — and titled by /graphics/_shared/rounds.js, the
   batch's own round rules, so a card made here matches the automatic one.

   HOW IT IS USED
     Competition + date → the games load, the title fills in from the rounds
     file and the card type is picked from the scores (all played: Results,
     none: Fixtures, some: Round so far). Untick a game to leave it off — a
     late postponement the feed has not caught up with. Download all sizes.
     "Edit by hand" holds the full editor for anything else.

   CHANGELOG
     v2.0 09/10/2026  Rebuilt around the feed: pick a date, untick games,
                      download all three sizes. Title from the rounds file.
                      Round so far type. Whole-round or one-day choice. The
                      paste box and grid moved under "Edit by hand". Builds
                      its own controls so the public edition shares them.
     v1.14 09/10/2026 Pens column in the editor (results only).
     v1.12 09/10/2026 Card drawing moved to _shared/fixtures-card.js.
   ============================================================ */
(function () {
  "use strict";

  var C = window.NL_FIXTURES_CARD;
  var R = window.NL_ROUNDS;
  var STORAGE_KEY = "nl-fixtures-gfx-v2";
  var MAX_ROWS = C.MAX_ROWS;
  var NLS_BASE = C.NLS_BASE;
  var COMPETITION_ID = C.COMPETITION_ID;
  var ymdUK = C.ymdUK;
  var FORMATS = ["1x1", "4x5", "9x16"];
  var TYPE_WORD = { fixtures: "Fixtures", results: "Results", round: "Round so far" };

  /* ---------------- state ---------------- */
  var state = {
    division: "National",
    format: "4x5",             /* the size previewed; downloads are all three */
    mode: "fixtures",          /* fixtures | results | round */
    span: "day",               /* day | round — which games the card covers */
    date: "",                  /* YYYY-MM-DD the card is for */
    matchday: "",              /* the title: "13", "", "GROUP STAGE – MATCHDAY 3", free text */
    fit: "wrap",               /* wrap | short */
    rows: []                   /* {home, away, hs, as, ko, koOn} | {divider} */
  };
  var games = [];              /* NLS matches for the chosen day or round */
  var off = {};                /* match id → true: left off the card */

  /* ---------------- elements ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var gfxHost, stageWrap, pasteEl, gridBody;

  /* ---------------- helpers ---------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /* Only the choices persist. The games are always fetched fresh — a card
     rebuilt from yesterday's copy of the feed is how a stale score ships. */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        division: state.division, format: state.format, fit: state.fit
      }));
    } catch (e) {}
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (d && typeof d === "object") {
        if (COMPETITION_ID[d.division]) state.division = d.division;
        if (FORMATS.indexOf(d.format) >= 0) state.format = d.format;
        if (d.fit === "wrap" || d.fit === "short") state.fit = d.fit;
      }
    } catch (e) {}
  }
  var period = function (m) { return String(((m && m.attributes) || {}).matchPeriod || "").toLowerCase(); };
  var isPostponed = function (m) { return period(m) === "postponed"; };
  var isDone = function (m) { var p = period(m); return p === "fulltime" || p === "postmatch" || p === "abandoned"; };

  /* ---------------- the controls ----------------
     Built here rather than written into each page, so the gated and public
     editions are the same tool by construction. Competitions and card types
     are closed sets (four, three) and get pills; dates are a dropdown. */
  function mount(root) {
    root.innerHTML =
      '<div class="tool">' +
        '<div class="preview">' +
          '<div class="preview-head">' +
            '<span class="eyebrow">Preview</span>' +
            '<div class="seg" id="sizeSeg">' + FORMATS.map(function (f) {
              return '<button type="button" class="size-btn" data-fmt="' + f + '">' + f.replace("x", ":") + '</button>';
            }).join("") + '</div>' +
          '</div>' +
          '<div class="stage-wrap" id="stageWrap"><div id="gfxHost"></div></div>' +
        '</div>' +
        '<div class="panel">' +
          '<div class="card">' +
            '<div class="row2">' +
              '<div class="field"><label for="divisionSel">Competition</label>' +
                '<select id="divisionSel">' +
                  '<option value="National">National League</option>' +
                  '<option value="North">National League North</option>' +
                  '<option value="South">National League South</option>' +
                  '<option value="Cup">National League Cup</option>' +
                '</select></div>' +
              '<div class="field"><label for="dateSel">Date</label>' +
                '<select id="dateSel"><option value="">Loading dates…</option></select></div>' +
            '</div>' +
            '<div class="field hidden" id="spanField"><label>Games</label>' +
              '<div class="seg" id="spanSeg">' +
                '<button type="button" class="span-btn" data-span="day" id="spanDay">That day</button>' +
                '<button type="button" class="span-btn" data-span="round">Whole round</button>' +
              '</div></div>' +
            '<div class="field"><label>Card</label>' +
              '<div class="seg" id="modeSeg">' +
                '<button type="button" class="mode-btn" data-mode="fixtures">Fixtures</button>' +
                '<button type="button" class="mode-btn" data-mode="results">Results</button>' +
                '<button type="button" class="mode-btn" data-mode="round">Round so far</button>' +
              '</div></div>' +
            '<div class="field"><label for="matchdayInput">Matchday or title</label>' +
              '<input type="text" id="matchdayInput" placeholder="13 — or GROUP STAGE – MATCHDAY 3"></div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="picks" id="picks"><div class="picks-empty">Loading games…</div></div>' +
          '</div>' +
          '<div class="btns">' +
            '<button type="button" class="btn btn--primary" id="downloadBtn">Download all sizes</button>' +
          '</div>' +
          '<details class="disclosure card" id="handEdit">' +
            '<summary>Edit by hand</summary>' +
            '<div class="hand">' +
              '<div class="field"><label for="fitSel">Long names</label>' +
                '<select id="fitSel"><option value="wrap">Wrap to two lines</option><option value="short">Short names</option></select></div>' +
              '<div class="field"><label for="pasteIn">Paste matches</label>' +
                '<textarea id="pasteIn" rows="6" placeholder="One match per line: Home [tab] Away"></textarea></div>' +
              '<div class="grid-scroller"><table class="grid"><thead><tr>' +
                '<th style="width:24px"></th><th>Home</th>' +
                '<th class="col-score">H</th><th class="col-score">A</th><th class="col-pens" style="width:64px">Pens</th>' +
                '<th>Away</th><th class="col-ko" style="width:96px">KO</th><th style="width:30px"></th>' +
              '</tr></thead><tbody id="gridBody"></tbody></table></div>' +
              '<div class="btns ko-bulk">' +
                '<button type="button" class="btn btn--ghost" id="koAllBtn">Show all times</button>' +
                '<button type="button" class="btn btn--ghost" id="koNoneBtn">Hide all times</button>' +
              '</div>' +
              '<div class="btns"><button type="button" class="btn btn--ghost" id="reloadBtn">Reload from the feed</button></div>' +
            '</div>' +
          '</details>' +
          '<footer class="status"><span id="status">Ready</span></footer>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- paste → rows (home, [nuked middle], away) ---------------- */
  function parseScore(s) {
    var m = String(s || "").match(/^(\d{1,2})\s*[-\u2013:]\s*(\d{1,2})$/);
    return m ? { hs: m[1], as: m[2] } : null;
  }
  function splitLine(line) {
    if (line.indexOf("\t") >= 0) return line.split("\t");
    if (line.indexOf(",") >= 0) return line.split(",");
    var sm = line.match(/^(.*?)\s+(\d{1,2}\s*[-\u2013:]\s*\d{1,2})\s+(.*)$/);
    if (sm) return [sm[1], sm[2], sm[3]];
    var vm = line.split(/\s+(?:v|vs)\s+/i);
    if (vm.length === 2) return [vm[0], "", vm[1]];
    return [line];
  }
  function parse(raw) {
    var lines = (raw || "").replace(/\r/g, "\n").split("\n")
      .map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
    var out = [];
    for (var i = 0; i < lines.length && out.length < MAX_ROWS; i++) {
      var cells = splitLine(lines[i]).map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
      if (!cells.length) continue;
      /* home = first cell, away = last cell — anything in the middle is nuked */
      var home = cells[0];
      var away = cells.length >= 2 ? cells[cells.length - 1] : "";
      if (!away) continue;
      var hs = "", as = "";
      for (var k = 1; k < cells.length - 1; k++) {
        var sc = parseScore(cells[k]);
        if (sc) { hs = sc.hs; as = sc.as; break; }
      }
      out.push({ home: home, away: away, hs: hs, as: as, ko: "" });
    }
    return out;
  }

  /* ---------------- render ---------------- */
  function seasonText() {
    var meta = NL.clubs.meta && NL.clubs.meta();
    var y = (meta && NL.season && NL.season.current(meta)) || (NL.season && NL.season.fromDate(new Date()));
    return C.seasonLabel(y) || "";
  }
  function render() {
    return C.render(gfxHost, {
      division: state.division, format: state.format, mode: state.mode,
      matchday: state.matchday, fit: state.fit, season: seasonText(), rows: state.rows
    }, NL.clubs).then(fitStage);
  }

  function fitStage() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx) return;
    var h = C.FORMAT_H[state.format];
    var availW = stageWrap.clientWidth - 24;

    /* The height budget must NOT be read from where the stage happens to sit.
       .preview is sticky, so a taller graphic pushes the pinned panel further
       up, which lowers stageWrap's top, which hands out more height, which
       grows the graphic again. Once the page was scrolled the graphic gained
       ~22px on EVERY re-render — pressing show/hide times a few times inflated
       it off the screen, and it crept on keystrokes too.

       Derive the budget instead from the sticky offset plus the preview's own
       chrome. The first is fixed by CSS; the second is the height of the
       preview header. Neither moves when the stage resizes, so the measurement
       can't feed back into the thing it measures. */
    var preview = stageWrap.closest ? stageWrap.closest(".preview") : stageWrap.parentNode;
    var availH = window.innerHeight - 24;
    if (preview) {
      var pv = getComputedStyle(preview);
      var pinned = (pv.position === "sticky" || pv.position === "fixed") ? parseFloat(pv.top) : NaN;
      /* Not pinned (the single-column layout) — the stage scrolls with the
         page, so the viewport is the only limit worth applying. */
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

  /* ---------------- grid editor ---------------- */
  function buildGrid() {
    gridBody.innerHTML = "";
    state.rows.slice(0, 26).forEach(function (r, i) {
      var tr = document.createElement("tr");
      var ins = '<td><button type="button" class="g-ins" data-i="' + i + '" title="Insert date divider above">＋</button></td>';
      var mv = '<td><div class="mvwrap"><button type="button" class="g-up" data-i="' + i + '" title="Move up">▲</button><button type="button" class="g-down" data-i="' + i + '" title="Move down">▼</button></div></td>';
      var del = '<td><button type="button" class="g-del" data-i="' + i + '" title="Remove">&times;</button></td>';
      if (r.divider != null) {
        tr.className = "divider-row";
        tr.innerHTML = mv +
          '<td colspan="6"><input class="g-div" data-i="' + i + '" data-k="divider" placeholder="Date divider e.g. TUE 19 AUG" value="' + escapeHtml(r.divider) + '"></td>' +
          del;
      } else {
        tr.innerHTML = ins +
          '<td>' + teamSelect(i, "home", r.home) + '</td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="hs" value="' + escapeHtml(r.hs) + '"></td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="as" value="' + escapeHtml(r.as) + '"></td>' +
          '<td class="col-pens"><input class="g-pens" data-i="' + i + '" data-k="pens" placeholder="5-6" value="' +
            escapeHtml(r.hp != null && r.hp !== "" ? r.hp + "-" + r.ap : "") + '"></td>' +
          '<td>' + teamSelect(i, "away", r.away) + '</td>' +
          '<td class="col-ko"><div class="kowrap">' +
            '<input type="checkbox" class="g-koon" data-i="' + i + '" data-k="koOn" title="Print this kick-off time"' +
              (r.ko && r.koOn !== false ? " checked" : "") + '>' +
            '<input class="g-ko" data-i="' + i + '" data-k="ko" value="' + escapeHtml(r.ko) + '">' +
          '</div></td>' +
          del;
      }
      gridBody.appendChild(tr);
    });
    /* Set the selection as a property rather than a `selected` attribute —
       the value round-trips exactly, whatever punctuation the name carries. */
    state.rows.slice(0, 26).forEach(function (r, i) {
      if (r.divider != null) return;
      ["home", "away"].forEach(function (k) {
        var sel = gridBody.querySelector('select.g-team[data-i="' + i + '"][data-k="' + k + '"]');
        if (sel) sel.value = r[k] || "";
      });
    });
  }
  function gridChanged(e) {
    var t = e.target;
    if (t.classList.contains("g-del") || t.classList.contains("g-ins")) return;
    var i = parseInt(t.getAttribute("data-i"), 10);
    if (isNaN(i) || !state.rows[i]) return;
    var k = t.getAttribute("data-k");
    if (t.type === "checkbox") { state.rows[i][k] = t.checked; save(); render(); return; }
    /* "5-6" → home 5, away 6 on pens; anything else clears the shootout */
    if (k === "pens") {
      var pm = String(t.value).match(/^\s*(\d{1,2})\s*[-\u2013:]\s*(\d{1,2})\s*$/);
      if (pm) { state.rows[i].hp = pm[1]; state.rows[i].ap = pm[2]; }
      else { delete state.rows[i].hp; delete state.rows[i].ap; }
      save(); render(); return;
    }
    state.rows[i][k] = t.value;
    /* typing a time means you want it printed; clearing it means you don't.
       The tick follows, so the two controls never disagree. */
    if (k === "ko") {
      state.rows[i].koOn = !!String(t.value).trim();
      var cb = gridBody.querySelector('.g-koon[data-i="' + i + '"]');
      if (cb) cb.checked = state.rows[i].koOn;
    }
    if (k !== "divider") syncPasteFromRows();
    save(); render();
  }
  /* Show-all / hide-all for kick-off times. A row with no time can't show one,
     so "all" leaves it untouched rather than ticking an empty box. */
  function setAllKo(on) {
    state.rows.forEach(function (r) { if (r.divider == null) r.koOn = !!(on && r.ko); });
    buildGrid(); save(); render();
  }
  function moveRow(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.rows.length) return;
    var tmp = state.rows[i]; state.rows[i] = state.rows[j]; state.rows[j] = tmp;
    syncPasteFromRows(); buildGrid(); save(); render();
  }
  function gridClicked(e) {
    var t = e.target;
    var i = parseInt(t.getAttribute("data-i"), 10);
    if (isNaN(i)) return;
    if (t.classList.contains("g-up"))   { moveRow(i, -1); return; }
    if (t.classList.contains("g-down")) { moveRow(i, 1); return; }
    if (t.classList.contains("g-ins")) {
      state.rows.splice(i, 0, { divider: "" });
      buildGrid(); save(); render();
      var inp = gridBody.querySelector('tr:nth-child(' + (i + 1) + ') .g-div');
      if (inp) inp.focus();
      return;
    }
    if (t.classList.contains("g-del")) {
      state.rows.splice(i, 1);
      syncPasteFromRows(); buildGrid(); save(); render();
    }
  }

  /* ---------------- paste sync ---------------- */
  function syncRowsFromPaste() {
    var parsed = parse(pasteEl.value);
    /* preserve any scores/KO already set for matching home/away pairs */
    var prev = state.rows.slice();
    parsed.forEach(function (r) {
      var match = prev.find(function (p) {
        return (p.home || "").toLowerCase() === r.home.toLowerCase() &&
               (p.away || "").toLowerCase() === r.away.toLowerCase();
      });
      if (match) {
        if (r.hs === "" && r.as === "") { r.hs = match.hs; r.as = match.as; }
        if (!r.ko) r.ko = match.ko;
      }
    });
    /* rebuild fixtures from paste, preserving any date dividers in place */
    var result = [];
    var pi = 0;
    prev.forEach(function (p) {
      if (p.divider != null) { result.push(p); }
      else if (pi < parsed.length) { result.push(parsed[pi]); pi++; }
    });
    while (pi < parsed.length) { result.push(parsed[pi]); pi++; }
    state.rows = result;
    buildGrid(); save(); render();
  }
  function syncPasteFromRows() {
    pasteEl.value = state.rows.filter(function (r) { return r.divider == null; }).map(function (r) {
      return [r.home, "v", r.away].join("\t");
    }).join("\n");
  }

  /* ---------------- National League Services ---------------- */

  var _pdCache = {};       /* division → meta.populatedDates for the season */
  var _rounds = null;      /* rounds-<season>.json, once */

  function nlsSeason() {
    var meta = NL.clubs.meta();
    return String((NL.season && NL.season.current(meta)) || NL.season.fromDate(new Date()));
  }
  function nlsUrl(params) { return NLS_BASE + "/matches/?" + params.join("&"); }
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (r.status === 404) return null;      /* an empty window is a 404 */
      if (!r.ok) throw new Error(r.status + " " + url);
      return r.json();
    });
  }
  function loadRounds() {
    if (_rounds) return Promise.resolve(_rounds);
    return getJSON("/assets/data/rounds-" + C.seasonLabel(nlsSeason()) + ".json")
      .then(function (j) { _rounds = j || {}; return _rounds; })
      .catch(function () { _rounds = {}; return _rounds; });
  }
  function matchDays() { return Object.keys(_pdCache[state.division] || {}).sort(); }

  function dateLabel(ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/,/g, "");
  }

  /* meta.populatedDates is the whole season's calendar; one small request
     fills the date list. Defaults to today, or the next day with games. */
  function loadCalendar() {
    var div = state.division, sel = $("dateSel");
    var ready = _pdCache[div] ? Promise.resolve(_pdCache[div]) : getJSON(nlsUrl([
      "seasonID=" + encodeURIComponent(nlsSeason()), "competitionID=" + COMPETITION_ID[div],
      "includePopulatedDates=true",
      "from=" + encodeURIComponent(nlsSeason() + "-07-01 00:00:00Z"),
      "to=" + encodeURIComponent((+nlsSeason() + 1) + "-06-30 23:59:59Z"),
      "page.number=1", "page.size=1"
    ])).then(function (j) { return (_pdCache[div] = (j && j.meta && j.meta.populatedDates) || {}); });
    sel.innerHTML = '<option value="">Loading dates…</option>';
    return Promise.all([ready, loadRounds()]).then(function () {
      var days = matchDays(), today = ymdUK(new Date());
      if (!days.length) { sel.innerHTML = '<option value="">No dates listed</option>'; showGames(); return; }
      var def = days[days.length - 1];
      for (var i = 0; i < days.length; i++) { if (days[i] >= today) { def = days[i]; break; } }
      if (state.date && days.indexOf(state.date) >= 0) def = state.date;
      sel.innerHTML = days.map(function (k) {
        return '<option value="' + k + '"' + (k === def ? " selected" : "") + '>' + escapeHtml(dateLabel(k)) + '</option>';
      }).join("");
      state.date = def;
      return loadGames(true);
    }).catch(function (err) {
      console.error(err);
      sel.innerHTML = '<option value="">Dates unavailable</option>';
      setStatus("Couldn't reach National League Services.", 6000);
    });
  }

  /* fresh = a new date or competition: the span and title are picked again.
     The card type is picked from the scores on every load, so switching to
     Whole round on a Saturday with Friday's result in lands on Round so far;
     a type chosen by hand holds until the next load. */
  function loadGames(fresh) {
    var days = R.roundDays(_rounds, state.division, state.date, matchDays());
    var multi = days.length > 1;
    $("spanField").classList.toggle("hidden", !multi);
    if (fresh) state.span = "day";
    var span = multi && state.span === "round" ? days : [state.date];
    syncSeg(".span-btn", "data-span", state.span);
    $("picks").innerHTML = '<div class="picks-empty">Loading games…</div>';
    return getJSON(nlsUrl([
      "seasonID=" + encodeURIComponent(nlsSeason()), "competitionID=" + COMPETITION_ID[state.division],
      "from=" + encodeURIComponent(span[0] + " 00:00:00Z"),
      "to=" + encodeURIComponent(span[span.length - 1] + " 23:59:59Z"),
      "sort=kickOffDateUTC", "page.number=1", "page.size=1000"
    ])).then(function (j) {
      games = ((j && j.data) || []).slice();
      off = {};
      games.forEach(function (m) { if (isPostponed(m)) off[m.id] = true; });
      setMode(autoMode(games), true);
      if (fresh) {
        state.matchday = R.cardTitle(_rounds, state.division, state.date);
        $("matchdayInput").value = state.matchday;
      }
      showGames(); rebuild();
      setStatus(games.length ? "Loaded " + games.length + " game" + (games.length === 1 ? "" : "s") : "No games that day", 5000);
    }).catch(function (err) {
      console.error(err);
      $("picks").innerHTML = '<div class="picks-empty">Couldn\'t reach National League Services.</div>';
    });
  }

  /* All played: Results. None: Fixtures. Some: Round so far. */
  function autoMode(list) {
    var live = list.filter(function (m) { return !isPostponed(m); });
    var done = live.filter(isDone).length;
    return !done ? "fixtures" : done === live.length ? "results" : "round";
  }

  /* The games list. Ticked = on the card. A game the feed already calls
     postponed starts unticked; tick it to put it back. */
  function showGames() {
    var el = $("picks");
    if (!games.length) { el.innerHTML = '<div class="picks-empty">No games.</div>'; return; }
    var lastDay = null, multi = state.span === "round";
    el.innerHTML = games.map(function (m) {
      var a = m.attributes || {};
      var day = C.koDay(a.kickOffDateUTC), html = "";
      if (multi && day !== lastDay) { html += '<div class="pick-day">' + escapeHtml(dateLabel(day)) + '</div>'; lastDay = day; }
      var h = C.nlsTeamName(NL.clubs, a.homeTeam), w = C.nlsTeamName(NL.clubs, a.awayTeam);
      var meta = isPostponed(m) ? '<span class="pill pill--postponed">P-P</span>'
        : period(m) === "abandoned" ? "A-A"
        : isDone(m) ? (a.homeTeam && a.homeTeam.score) + "-" + (a.awayTeam && a.awayTeam.score)
        : C.koTime(a.kickOffDateUTC);
      return html + '<label class="pick' + (off[m.id] ? " off" : "") + '">' +
        '<input type="checkbox" data-id="' + escapeHtml(m.id) + '"' + (off[m.id] ? "" : " checked") + '>' +
        '<span class="teams"><b>' + escapeHtml(h) + '</b> v <b>' + escapeHtml(w) + '</b></span>' +
        '<span class="meta">' + meta + '</span></label>';
    }).join("");
  }

  /* Ticked games → card rows. A ticked postponed game is treated as on (the
     feed is wrong); on a Results or Round card a game not yet finished shows
     v, never its live score. */
  function rebuild() {
    var data = games.filter(function (m) { return !off[m.id]; }).map(function (m) {
      var a = m.attributes || {};
      if (isPostponed(m)) a = Object.assign({}, a, { matchPeriod: "PreMatch" });
      if (state.mode !== "fixtures" && !isDone(m)) {
        var blank = function (t) { return t ? Object.assign({}, t, { score: null, penaltyScore: null }) : t; };
        a = Object.assign({}, a, { homeTeam: blank(a.homeTeam), awayTeam: blank(a.awayTeam) });
      }
      return Object.assign({}, m, { attributes: a });
    });
    var built = C.buildRows(data, NL.clubs);
    state.rows = built.rows;
    if (built.trimmed) setStatus("Only the first " + MAX_ROWS + " games fit on a card", 6000);
    syncPasteFromRows(); buildGrid(); render();
  }

  /* ---------------- team roster ----------------
     The editor picks teams from a list rather than taking typed text: on a
     phone that is the native picker instead of a text box the width of a
     thumbnail. Both files come from the canon — clubs-meta for the three
     divisions, cup-clubs-meta for the guest sides that enter the NL Cup, which
     are deliberately kept out of clubs-meta because they were never members. */
  var _teamOptions = "";     /* <optgroup> markup, built once */
  var _teamNames = {};       /* lower-cased roster name → true */

  function buildTeamOptions() {
    return Promise.all([
      NL.clubs.forSeason(),
      NL.clubs.guests().catch(function () { return []; })
    ]).then(function (res) {
      var clubs = res[0] || [], guests = res[1] || [];
      var byDiv = function (d) { return clubs.filter(function (c) { return c.division === d; }); };
      var groups = [
        ["National League", byDiv("National")],
        ["National League North", byDiv("North")],
        ["National League South", byDiv("South")],
        ["National League Cup guests", guests]
      ];
      _teamNames = {};
      _teamOptions = groups.filter(function (g) { return g[1].length; }).map(function (g) {
        return '<optgroup label="' + escapeHtml(g[0]) + '">' + g[1].map(function (c) {
          _teamNames[String(c.name).toLowerCase()] = true;
          return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
        }).join("") + '</optgroup>';
      }).join("");
    });
  }

  /* A value the roster doesn't carry — a pasted one-off opponent, a name NLS
     spells differently — is added as its own option rather than being silently
     swapped for whichever club happens to sort first. */
  function teamSelect(i, key, val) {
    var v = String(val || ""), own = "";
    if (v && !_teamNames[v.toLowerCase()]) {
      own = '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
    }
    return '<select class="nl-select g-team" data-i="' + i + '" data-k="' + key + '">' +
             '<option value="">—</option>' + own + _teamOptions +
           '</select>';
  }

  /* ---------------- export ----------------
     Named the way the automatic cards are: "National Results 10Oct26 - 4x5.png". */
  function fileName(fmt) {
    var d = new Date((state.date || ymdUK(new Date())) + "T12:00:00Z");
    var ds = String(d.getUTCDate()).padStart(2, "0") +
      d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).slice(0, 3) + String(d.getUTCFullYear()).slice(2);
    return state.division + " " + TYPE_WORD[state.mode] + " " + ds + " - " + fmt + ".png";
  }
  async function exportOne(fmt) {
    state.format = fmt;
    await render();
    var gfx = gfxHost.querySelector(".gfx");
    var prevT = gfx.style.transform, prevW = gfxHost.style.width, prevH = gfxHost.style.height;
    gfx.style.transform = "none";
    gfxHost.style.width = "1080px"; gfxHost.style.height = C.FORMAT_H[fmt] + "px";
    try {
      var out = await C.toPng(gfx, fmt);
      NL.download(fileName(fmt), out.blob);
      return out.late;
    } finally {
      gfx.style.transform = prevT; gfxHost.style.width = prevW; gfxHost.style.height = prevH;
    }
  }
  async function downloadAll() {
    if (!window.htmlToImage) return;
    var btn = $("downloadBtn"), keep = state.format, late = 0;
    btn.disabled = true;
    setStatus("Making 3 PNGs…", 30000);
    try {
      for (var i = 0; i < FORMATS.length; i++) late += await exportOne(FORMATS[i]);
      /* never let a half-drawn graphic leave without saying so */
      setStatus(late ? late + " image" + (late === 1 ? "" : "s") + " didn't load — check your connection and download again"
                     : "Downloaded 1:1, 4:5 and 9:16", late ? 10000 : 4000);
    } catch (err) {
      console.error(err);
      setStatus("Export blocked — use a screenshot.", 6000);
    } finally {
      state.format = keep; syncSeg(".size-btn", "data-fmt", keep); render(); btn.disabled = false;
    }
  }

  var statusT;
  function setStatus(m, ms) {
    var el = $("status"); if (!el) return;
    el.textContent = m; clearTimeout(statusT);
    statusT = setTimeout(function () { el.textContent = "Ready"; }, ms || 2200);
  }

  function syncSeg(sel, attr, val) {
    document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle("active", b.getAttribute(attr) === val); });
  }
  /* quiet = picked automatically on load; the rows are rebuilt by the caller */
  function setMode(m, quiet) {
    state.mode = m;
    syncSeg(".mode-btn", "data-mode", m);
    document.body.setAttribute("data-mode", m);
    if (!quiet) rebuild();
  }

  /* ---------------- init ---------------- */
  function init() {
    var root = $("fxTool");
    if (!root || root.getAttribute("data-mounted")) return;
    root.setAttribute("data-mounted", "1");
    mount(root);
    gfxHost = $("gfxHost"); stageWrap = $("stageWrap");
    pasteEl = $("pasteIn"); gridBody = $("gridBody");

    load();
    $("divisionSel").value = state.division;
    $("fitSel").value = state.fit;
    syncSeg(".size-btn", "data-fmt", state.format);
    setMode(state.mode, true);

    $("divisionSel").addEventListener("change", function () {
      state.division = this.value; state.date = ""; save(); loadCalendar();
    });
    $("dateSel").addEventListener("change", function () { state.date = this.value; loadGames(true); });
    document.querySelectorAll(".span-btn").forEach(function (b) {
      b.addEventListener("click", function () { state.span = b.getAttribute("data-span"); loadGames(false); });
    });
    document.querySelectorAll(".mode-btn").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
    });
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.format = b.getAttribute("data-fmt"); syncSeg(".size-btn", "data-fmt", state.format); save(); render();
      });
    });
    $("matchdayInput").addEventListener("input", function () { state.matchday = this.value; render(); });
    $("picks").addEventListener("change", function (e) {
      var id = e.target.getAttribute("data-id"); if (!id) return;
      if (e.target.checked) delete off[id]; else off[id] = true;
      e.target.closest(".pick").classList.toggle("off", !e.target.checked);
      rebuild();
    });
    $("fitSel").addEventListener("change", function () { state.fit = this.value; save(); render(); });
    $("koAllBtn").addEventListener("click", function () { setAllKo(true); });
    $("koNoneBtn").addEventListener("click", function () { setAllKo(false); });
    $("reloadBtn").addEventListener("click", function () { loadGames(true); });
    var pt;
    pasteEl.addEventListener("input", function () { clearTimeout(pt); pt = setTimeout(syncRowsFromPaste, 140); });
    gridBody.addEventListener("input", gridChanged);
    gridBody.addEventListener("click", gridClicked);
    $("downloadBtn").addEventListener("click", downloadAll);

    window.addEventListener("resize", fitStage);
    /* clubs-meta carries the season and the optaID → club index the feed's
       names resolve through, so nothing loads before it. */
    NL.clubs.load().then(loadCalendar).catch(loadCalendar);
    buildTeamOptions().then(function () { buildGrid(); render(); }).catch(function () {});
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    [80, 300, 700].forEach(function (t) { setTimeout(fitStage, t); });
    window.addEventListener("load", fitStage);
  }

  /* Two ways in. Behind a login, auth-guard reveals #pageWrap and calls
     TOOL.boot once the session is verified — the preview needs a visible
     container to measure. The public edition has no guard and boots on its
     own. Nothing here reads RTDB, so neither waits on Firebase. */
  window.TOOL = window.TOOL || {};
  window.TOOL.boot = init;
  if (window._toolDeferredSession) { init(); delete window._toolDeferredSession; }
  if (typeof window.NL_TOOL_KEY === "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
