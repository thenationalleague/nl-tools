/* ============================================================
   Fixtures & Results Graphic — app logic.
   Version: v1.12 (09/10/2026)

   The card itself is drawn by /graphics/_shared/fixtures-card.js — the
   same renderer the scheduled batch (scripts/build-fixtures-graphics.js)
   uses, so a hand-made card and a timed one cannot drift. This file is
   the tool around it: state, editor, paste box, the NLS date pickers,
   preview scaling and the PNG download.

   Club roster, crests and lookups come from the canon (NL.clubs).
   Paste = home, [middle nuked], away. Editor adds scores + KO.

   CHANGELOG
     v1.12 09/10/2026  Card drawing moved to _shared/fixtures-card.js.
                       Season eyebrow now read from clubs-meta instead of
                       a hard-coded "2026-27". A title typed with a spaced
                       en dash breaks onto two lines at the dash.
   ============================================================ */
(function () {
  "use strict";

  var C = window.NL_FIXTURES_CARD;
  var STORAGE_KEY = "nl-fixtures-gfx-v1";
  var MAX_ROWS = C.MAX_ROWS;
  var NLS_BASE = C.NLS_BASE;
  var COMPETITION_ID = C.COMPETITION_ID;
  var ymdUK = C.ymdUK;

  var SAMPLE = [
    "Brackley Town\tv\tSolihull Moors",
    "Gateshead\tv\tWealdstone",
    "Southend United\tv\tRochdale",
    "Truro City\tv\tScunthorpe United",
    "Woking\tv\tYeovil Town"
  ].join("\n");

  /* ---------------- state ---------------- */
  var state = {
    division: "National",
    format: "1x1",
    mode: "fixtures",          /* fixtures | results */
    source: "feed",            /* feed | manual — which entry card is shown */
    matchday: "",              /* "" = MATCHDAY (no number) | "1".."46" | free text */
    fit: "wrap",               /* wrap | short */
    rows: []                   /* {home, away, hs, as, ko, koOn} | {divider} */
  };

  /* ---------------- elements ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var gfxHost, stageWrap, pasteEl, gridBody;

  /* ---------------- helpers ---------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (d && typeof d === "object") {
        ["division", "format", "mode", "matchday", "fit", "source"].forEach(function (k) {
          if (typeof d[k] === "string") state[k] = d[k];
        });
        if (Array.isArray(d.rows)) state.rows = d.rows;
      }
    } catch (e) {}
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

  /* ---------------- render ----------------
     The eyebrow is the season clubs-meta calls current; until that file
     lands, the clock's answer. */
  function seasonText() {
    var meta = NL.clubs.meta && NL.clubs.meta();
    var y = (meta && NL.season && NL.season.current(meta)) || (NL.season && NL.season.fromDate(new Date()));
    return state.sub || C.seasonLabel(y) || "";
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
          '<td colspan="5"><input class="g-div" data-i="' + i + '" data-k="divider" placeholder="Date divider e.g. TUE 19 AUG" value="' + escapeHtml(r.divider) + '"></td>' +
          del;
      } else {
        tr.innerHTML = ins +
          '<td>' + teamSelect(i, "home", r.home) + '</td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="hs" value="' + escapeHtml(r.hs) + '"></td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="as" value="' + escapeHtml(r.as) + '"></td>' +
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
    state.rows = result.length ? result : parse(SAMPLE);
    buildGrid(); save(); render();
  }
  function syncPasteFromRows() {
    pasteEl.value = state.rows.filter(function (r) { return r.divider == null; }).map(function (r) {
      return [r.home, "v", r.away].join("\t");
    }).join("\n");
  }

  /* ---------------- National League Services ----------------
     One request builds a card. The same response carries kick-off times and
     scores, so switching Fixtures ⇄ Results after a load needs no refetch —
     the mode only decides which of the two the graphic prints. */

  var _pdCache = {};   /* division → meta.populatedDates for the season */

  /* seasonID is the season's FIRST year ("2026" = 2026-27). clubs-meta is the
     single source of truth for it; the clock-derived answer is the fallback
     for the window between page load and clubs-meta arriving. */
  function nlsSeason() {
    var meta = NL.clubs.meta();
    return String((NL.season && NL.season.current(meta)) || NL.season.fromDate(new Date()));
  }
  function nlsUrl(params) { return NLS_BASE + "/matches/?" + params.join("&"); }

  function dateOptionLabel(ymd, info) {
    var d = new Date(ymd + "T12:00:00Z");
    var lab = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
    /* Kept short on purpose: "Sat 29 Aug · 12 matches" was being cut off
       mid-word inside the select at the panel's width. */
    var n = info && info.count;
    return lab + (n ? " (" + n + ")" : "");
  }

  /* meta.populatedDates is the whole season's calendar and comes back whatever
     window is asked for, so one narrow request fills both date pickers. */
  function loadDates() {
    var div = state.division, comp = COMPETITION_ID[div], from = $("nlsFrom");
    if (!from || !comp) return;
    if (_pdCache[div]) { fillDates(_pdCache[div]); return; }
    from.innerHTML = '<option value="">Loading dates…</option>';
    $("nlsTo").innerHTML = "";
    var today = ymdUK(new Date());
    fetch(nlsUrl([
      "seasonID=" + encodeURIComponent(nlsSeason()),
      "competitionID=" + comp,
      "includePopulatedDates=true",
      "from=" + encodeURIComponent(today + " 00:00:00Z"),
      "to=" + encodeURIComponent(today + " 23:59:59Z"),
      "page.number=1", "page.size=1"
    ])).then(function (r) {
      if (!r.ok) throw new Error("NLS " + r.status);
      return r.json();
    }).then(function (j) {
      var pd = (j && j.meta && j.meta.populatedDates) || {};
      _pdCache[div] = pd;
      fillDates(pd);
    }).catch(function (err) {
      console.error(err);
      from.innerHTML = '<option value="">Dates unavailable</option>';
      setStatus("Couldn't reach National League Services.", 5000);
    });
  }

  function fillDates(pd) {
    var keys = Object.keys(pd).sort(), from = $("nlsFrom");
    if (!keys.length) {
      from.innerHTML = '<option value="">No dates listed</option>';
      $("nlsTo").innerHTML = '<option value="">—</option>';
      return;
    }
    var today = ymdUK(new Date()), def = keys[keys.length - 1];
    for (var i = 0; i < keys.length; i++) { if (keys[i] >= today) { def = keys[i]; break; } }
    from.innerHTML = keys.map(function (k) {
      return '<option value="' + k + '"' + (k === def ? " selected" : "") + '>' +
             escapeHtml(dateOptionLabel(k, pd[k])) + '</option>';
    }).join("");
    fillToDates();
  }

  /* "Through to" only ever offers dates at or after the one chosen, so the
     range cannot be inverted. Capped at a week's worth of matchdays — beyond
     that the card is past the 12-match ceiling anyway. */
  function fillToDates() {
    var pd = _pdCache[state.division] || {}, fromVal = $("nlsFrom").value;
    var later = Object.keys(pd).sort().filter(function (k) { return k >= fromVal; }).slice(0, 8);
    $("nlsTo").innerHTML = later.map(function (k, i) {
      return '<option value="' + k + '"' + (i === 0 ? " selected" : "") + '>' +
             escapeHtml(i === 0 ? "Same day" : dateOptionLabel(k, pd[k])) + '</option>';
    }).join("");
  }

  function loadFromNLS() {
    var comp = COMPETITION_ID[state.division];
    var from = $("nlsFrom").value, to = $("nlsTo").value || from;
    if (!comp || !from) { setStatus("Pick a date first."); return; }
    if (to < from) to = from;
    var btn = $("nlsLoadBtn");
    btn.disabled = true;
    setStatus("Loading from National League Services…", 20000);
    fetch(nlsUrl([
      "seasonID=" + encodeURIComponent(nlsSeason()),
      "competitionID=" + comp,
      "from=" + encodeURIComponent(from + " 00:00:00Z"),
      "to=" + encodeURIComponent(to + " 23:59:59Z"),
      "sort=kickOffDateUTC",
      "page.number=1", "page.size=100"
    ])).then(function (r) {
      if (!r.ok) throw new Error("NLS " + r.status);
      return r.json();
    }).then(function (j) {
      applyMatches((j && j.data) || []);
    }).catch(function (err) {
      console.error(err);
      setStatus("Couldn't reach National League Services.", 5000);
    }).then(function () { btn.disabled = false; });
  }

  function applyMatches(data) {
    var built = C.buildRows(data, NL.clubs);
    if (!built.total) {
      setStatus(built.postponed
        ? "Nothing to load — all " + built.postponed + " postponed."
        : "No matches on that date.", 5000);
      return;
    }
    var matches = built.matches, postponed = built.postponed, odd = built.odd, trimmed = built.trimmed;

    state.rows = built.rows;
    syncPasteFromRows(); buildGrid(); save(); render();

    var msg = "Loaded " + matches.length + " match" + (matches.length === 1 ? "" : "es");
    if (postponed) msg += " · " + postponed + " postponed left out";
    if (trimmed) msg += " · trimmed to " + MAX_ROWS;
    if (state.mode === "results") {
      var scored = matches.filter(function (r) { return r.hs !== "" && r.as !== ""; }).length;
      if (!scored) msg += " · no scores yet";
      else if (scored < matches.length) msg += " · " + (matches.length - scored) + " without a score";
    } else if (odd) {
      msg += " · " + odd + " kick-off" + (odd === 1 ? "" : "s") + " ticked";
    }
    setStatus(msg, 8000);
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

  /* ---------------- export ---------------- */
  function fileName() {
    var d = new Date();
    var mmm = d.toLocaleString("en-GB", { month: "short" });
    var ds = String(d.getDate()).padStart(2, "0") + mmm + String(d.getFullYear()).slice(2);
    return (state.mode === "results" ? "Results " : "Fixtures ") + state.division + " " + ds + " - " + state.format + ".png";
  }
  async function downloadPNG() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx || !window.htmlToImage) return;
    var prevT = gfx.style.transform, prevW = gfxHost.style.width, prevH = gfxHost.style.height;
    var h = C.FORMAT_H[state.format];
    gfx.style.transform = "none";
    gfxHost.style.width = "1080px"; gfxHost.style.height = h + "px";
    setStatus("Rendering PNG…");
    try {
      var out = await C.toPng(gfx, state.format);
      var a = document.createElement("a");
      a.href = URL.createObjectURL(out.blob); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      /* never let a half-drawn graphic leave without saying so */
      setStatus(out.late
        ? "Downloaded — but " + out.late + " image" + (out.late === 1 ? "" : "s") + " didn't load. Check your connection and export again."
        : "Downloaded " + state.format);
    } catch (err) {
      console.error(err);
      setStatus("Export blocked — use a screenshot.");
    } finally {
      gfx.style.transform = prevT; gfxHost.style.width = prevW; gfxHost.style.height = prevH;
    }
  }
  var statusT;
  function setStatus(m, ms) {
    var el = $("status"); if (!el) return;
    el.textContent = m; clearTimeout(statusT);
    statusT = setTimeout(function () { el.textContent = "Ready"; }, ms || 2200);
  }

  /* ---------------- source + mode toggles ----------------
     Source picks which half of the tool is on screen: the feed loader or the
     paste box. The editor underneath belongs to both, so a card loaded from
     the feed stays editable by hand after switching. */
  function setSource(src) {
    state.source = (src === "manual") ? "manual" : "feed";
    document.querySelectorAll(".src-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-src") === state.source);
    });
    document.body.setAttribute("data-source", state.source);
    save();
  }

  /* ---------------- mode toggle ---------------- */
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll(".mode-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === m);
    });
    document.body.setAttribute("data-mode", m);
    save(); render();
  }

  function syncSizeSeg() {
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-fmt") === state.format);
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    gfxHost = $("gfxHost"); stageWrap = $("stageWrap");
    pasteEl = $("pasteIn"); gridBody = $("gridBody");

    load();
    if (["wrap", "short"].indexOf(state.fit) < 0) state.fit = "wrap";
    if (!state.rows.length) state.rows = parse(SAMPLE);
    syncPasteFromRows();
    buildGrid();

    $("divisionSel").value = state.division;
    syncSizeSeg();
    $("matchdayInput").value = state.matchday;
    if ($("fitSel")) $("fitSel").value = state.fit;
    setSource(state.source);
    setMode(state.mode);

    $("divisionSel").addEventListener("change", function () {
      state.division = this.value; save(); render();
      loadDates();                       /* each competition has its own calendar */
    });
    $("nlsFrom").addEventListener("change", fillToDates);
    $("nlsLoadBtn").addEventListener("click", loadFromNLS);
    $("koAllBtn").addEventListener("click", function () { setAllKo(true); });
    $("koNoneBtn").addEventListener("click", function () { setAllKo(false); });
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.format = b.getAttribute("data-fmt"); syncSizeSeg(); save(); render();
      });
    });
    $("matchdayInput").addEventListener("input", function () { state.matchday = this.value; save(); render(); });
    if ($("fitSel")) $("fitSel").addEventListener("change", function () { state.fit = this.value; save(); render(); });
    document.querySelectorAll(".mode-btn").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
    });
    document.querySelectorAll(".src-btn").forEach(function (b) {
      b.addEventListener("click", function () { setSource(b.getAttribute("data-src")); fitStage(); });
    });

    var pt;
    pasteEl.addEventListener("input", function () { clearTimeout(pt); pt = setTimeout(syncRowsFromPaste, 140); });
    gridBody.addEventListener("input", gridChanged);
    gridBody.addEventListener("click", gridClicked);

    $("downloadBtn").addEventListener("click", downloadPNG);
    $("resetBtn").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state.rows = parse(SAMPLE); state.division = "National"; state.format = "1x1";
      state.mode = "fixtures"; state.matchday = ""; state.source = "feed";
      $("divisionSel").value = "National"; syncSizeSeg(); $("matchdayInput").value = "";
      syncPasteFromRows(); buildGrid(); setSource("feed"); setMode("fixtures"); setStatus("Reset");
    });

    window.addEventListener("resize", fitStage);
    /* re-render once clubs-meta lands: short names, canonical-name resolution
       and the optaID → club index all read NL.clubs, which is empty until
       then — and the NLS date list needs seasons.current from the same file. */
    NL.clubs.load().then(function () { render(); loadDates(); })
      .catch(function () { loadDates(); });
    /* The grid is built before the roster arrives, so rebuild it once the
       options exist — and re-render, since guest crests and short names both
       read cup-clubs-meta. */
    buildTeamOptions().then(function () { buildGrid(); render(); }).catch(function () {});
    render();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    /* re-fit after layout settles (fixes tiny 9x16 on first paint / in an iframe) */
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
