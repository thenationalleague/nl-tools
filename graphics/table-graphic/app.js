/* ============================================================
   App — controls, paste→grid sync, live render, PNG export.
   ============================================================ */
(function () {
  "use strict";

  var E = window.NLEngine;
  var STORAGE_KEY = "nl-table-gfx-v1";

  var DIVISION_LOGO = {
    National: "/assets/divisions/medium/National.png",
    North:    "/assets/divisions/medium/North.png",
    South:    "/assets/divisions/medium/South.png"
  };
  /* No LOGO_FALLBACK. A division badge that fails used to be replaced with the
     generic National League logo, which published a graphic branded as the
     wrong competition — worse than an obvious gap. Missing art now renders
     blank (visibility:hidden keeps the header's spacing) and the export
     warning names it. */
  var SPONSOR_URL = "/assets/partners/TIC%20Health.png";

  /* National League Services — the authoritative standings. Public, no auth,
     and fetched straight from the browser as travel-planner and the fan embeds
     already do, so no proxy is involved. competitionID values are firm NLS
     codes; never derive them from a division name. */
  var NLS_BASE = "https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2";
  var COMPETITION_ID = { National: 89, North: 373, South: 372 };

  var ROSE_WHITE = "/assets/crests/National%20League%20rose%20white.png";

  var DIV_EYEBROW = {
    National: "Enterprise National League",
    North: "Enterprise National League North",
    South: "Enterprise National League South"
  };
  /* Division name shown beneath the title */
  var DIV_NAME = {
    National: "Enterprise National League",
    North: "Enterprise National League North",
    South: "Enterprise National League South"
  };

  /* Long names that need shortening to fit the team column */
  var SHORTEN = {
    "hampton & richmond borough": "Hampton & Richmond",
    "kidderminster harriers": "Kidderminster Harriers"
  };

  var SAMPLE = [
    "C\tYork City\t46\t33\t9\t4\t114\t41\t+73\t108",
    "SF\tRochdale\t46\t33\t7\t6\t88\t41\t+47\t106",
    "SF\tCarlisle United\t46\t29\t8\t9\t85\t49\t+36\t95",
    "QF\tBoreham Wood\t46\t27\t9\t10\t95\t58\t+37\t90",
    "QF\tScunthorpe United\t46\t23\t13\t10\t77\t62\t+15\t82",
    "QF\tSouthend United\t46\t23\t12\t11\t83\t47\t+36\t81",
    "QF\tForest Green Rovers\t46\t23\t12\t11\t82\t52\t+30\t81",
    "8\tFC Halifax Town\t46\t20\t10\t16\t69\t66\t+3\t70",
    "9\tHartlepool United\t46\t18\t14\t14\t54\t59\t-5\t68",
    "10\tWoking\t46\t16\t15\t15\t69\t54\t+15\t63",
    "11\tTamworth\t46\t17\t11\t18\t63\t71\t-8\t62",
    "12\tBoston United\t46\t15\t14\t17\t63\t67\t-4\t59",
    "13\tAltrincham\t46\t17\t6\t23\t56\t65\t-9\t57",
    "14\tSolihull Moors\t46\t14\t14\t18\t71\t72\t-1\t56",
    "15\tWealdstone\t46\t15\t11\t20\t67\t75\t-8\t56",
    "16\tYeovil Town\t46\t15\t6\t25\t48\t68\t-20\t51",
    "17\tEastleigh\t46\t13\t11\t22\t57\t80\t-23\t50",
    "18\tGateshead\t46\t14\t8\t24\t54\t90\t-36\t50",
    "19\tSutton United\t46\t11\t14\t21\t59\t79\t-20\t47",
    "20\tAldershot Town\t46\t13\t7\t26\t69\t87\t-18\t46",
    "R\tBrackley Town\t46\t10\t12\t24\t40\t75\t-35\t42",
    "R\tMorecambe\t46\t9\t11\t26\t64\t101\t-37\t38",
    "R\tBraintree Town\t46\t8\t12\t26\t38\t76\t-38\t36",
    "R\tTruro City\t46\t8\t10\t28\t42\t72\t-30\t34"
  ].join("\n");

  /* ---------------- state ---------------- */
  var state = {
    dir: "1",
    division: "National",
    format: "1x1",
    matchday: "",            /* "" = Current Standings | "final" | "1".."46" */
    source: "feed",          /* feed | manual — which entry card is shown */
    sub: "2026-27",
    rows: []
  };

  /* Headline derived from the matchday selector */
  function matchdayTitle() {
    var m = state.matchday;
    if (m === "final") return "FINAL STANDINGS";
    if (!m) return "CURRENT STANDINGS";
    return "MATCHDAY " + m;
  }

  /* ---------------- elements ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var gfxHost = $("gfxHost");
  var stageWrap = $("stageWrap");
  var pasteEl = $("pasteIn");
  var gridBody = $("gridBody");

  /* ---------------- helpers ---------------- */
  function teamDisplay(name) {
    var k = String(name || "").toLowerCase().trim();
    if (SHORTEN[k]) return SHORTEN[k].toUpperCase();
    return String(name || "").toUpperCase();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (d && typeof d === "object") {
        ["division", "format", "matchday", "sub", "source"].forEach(function (k) {
          if (typeof d[k] === "string") state[k] = d[k];
        });
        if (Array.isArray(d.rows)) state.rows = d.rows;
        /* migrate stale season labels (e.g. "2025/26 Season") to current */
        if (/2025|season|\//i.test(state.sub || "")) state.sub = "2026-27";
      }
    } catch (e) {}
  }

  /* ---------------- render graphic ---------------- */
  function render() {
    var rows = state.rows.filter(function (r) { return E.safeText(r.team); });
    var n = rows.length || 1;
    var div = state.division;

    var gfx = document.createElement("div");
    gfx.className = "gfx";
    gfx.setAttribute("data-dir", state.dir);
    gfx.setAttribute("data-format", state.format);

    /* header */
    var head = document.createElement("div");
    head.className = "gfx-head";
    head.innerHTML =
      '<div class="logo-tile"><img class="div-logo" crossorigin="anonymous" src="' + DIVISION_LOGO[div] +
        '" onerror="this.onerror=null;this.style.visibility=\'hidden\'"></div>' +
      '<div class="titles">' +
        '<span class="eyebrow">' + escapeHtml(state.sub) + '</span>' +
        '<h1 class="gfx-title">' + escapeHtml(matchdayTitle()) + '</h1>' +
        '<p class="gfx-sub">' + (DIV_NAME[div] || "National League").toUpperCase() + '</p>' +
      '</div>' +
      '<img class="rose-wm" crossorigin="anonymous" src="' + ROSE_WHITE + '">';

    /* column set: square = full stats, portrait/story = minimal */
    var COLS_FULL = [["P","p"],["W","w"],["D","d"],["L","l"],["F","f"],["A","a"],["GD","gd"],["PTS","pts"]];
    var COLS_MIN  = [["P","p"],["GD","gd"],["PTS","pts"]];
    var cols = state.format === "1x1" ? COLS_FULL : COLS_MIN;
    gfx.setAttribute("data-cols", state.format === "1x1" ? "full" : "min");

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
      else if (flag === "SF") cls += " is-po-sf";
      else if (flag === "QF") cls += " is-po-qf";
      else if (flag === "R") cls += " is-releg";
      rowEl.className = cls;

      /* medium tier on purpose: 24 crests render at row height in a
         1080-wide canvas, so 256px is comfortably oversampled and ~9x lighter
         than the full-res originals — the difference between ~12.6MB and
         ~1.4MB, which decides whether they all arrive on a slow connection. */
      var crest = r.team ? NL.clubs.crestUrl(r.team, 'medium') : null;
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
        '<div class="team">' + escapeHtml(teamDisplay(r.team)) + '</div>' +
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

    /* assemble — dirs 3 & 4 wrap the table in a framed card on a navy field */
    if (state.dir === "3" || state.dir === "4") {
      var frame = document.createElement("div");
      frame.className = "frame";
      frame.appendChild(head);
      frame.appendChild(colhead);
      frame.appendChild(rowsEl);
      frame.appendChild(legend);
      gfx.appendChild(frame);
    } else {
      gfx.appendChild(head);
      gfx.appendChild(colhead);
      gfx.appendChild(rowsEl);
      gfx.appendChild(legend);
    }

    gfxHost.innerHTML = "";
    gfxHost.appendChild(gfx);

    /* size rows after layout */
    requestAnimationFrame(function () {
      var h = rowsEl.clientHeight;
      if (h && n) gfx.style.setProperty("--rh", (h / n) + "px");
      fitStage();
    });
  }

  /* Escaping is canon — NL.escHtml. The local copy this replaced was a fifth
     independent implementation of the same five replacements. */
  function escapeHtml(s) { return NL.escHtml(s); }

  /* scale stage to fit preview column */
  function fitStage() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx) return;
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
    var availW = stageWrap.clientWidth - 24;

    /* The height budget must NOT be read from where the stage happens to sit.
       .preview is sticky, so a taller graphic pushes the pinned panel further
       up, which lowers stageWrap's top, which hands out more height, which
       grows the graphic again — it gained a little on every redraw once the
       page was scrolled. Derive the budget from the sticky offset plus the
       preview's own chrome: the first is fixed by CSS, the second is the
       header's height, and neither moves when the stage resizes. */
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
    var n = Math.max(state.rows.length, 1);
    state.rows.forEach(function (r, i) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="g-pos">' + (i + 1) + '</td>' +
        '<td><select class="nl-select g-flag" data-i="' + i + '">' +
          flagOpt("-", r.flag) + flagOpt("C", r.flag) + flagOpt("SF", r.flag) +
          flagOpt("QF", r.flag) + flagOpt("R", r.flag) + '</select></td>' +
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
    save();
    render();
  }

  /* ---------------- paste <-> rows ---------------- */
  function syncRowsFromPaste() {
    state.rows = E.parse(pasteEl.value);
    if (!state.rows.length) state.rows = E.parse(SAMPLE);
    buildGrid();
    save();
    render();
  }
  function syncPasteFromRows() {
    var lines = state.rows.map(function (r, i) {
      var f = (r.flag && r.flag !== "-") ? r.flag : String(i + 1);
      return [f, r.team, r.p, r.w, r.d, r.l, r.f, r.a, r.gd, r.pts].join("\t");
    });
    pasteEl.value = lines.join("\n");
  }

  /* ---------------- export ---------------- */
  function fileName() {
    var d = new Date();
    var mmm = d.toLocaleString("en-GB", { month: "short" });
    var ds = String(d.getDate()).padStart(2, "0") + mmm + String(d.getFullYear()).slice(2);
    return "Table " + state.division + " " + ds + " - " + state.format + ".png";
  }

  async function downloadPNG() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx || !window.htmlToImage) return;
    var prevT = gfx.style.transform, prevW = gfxHost.style.width, prevH = gfxHost.style.height;
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
    gfx.style.transform = "none";
    gfxHost.style.width = "1080px";
    gfxHost.style.height = h + "px";
    setStatus("Rendering PNG…");
    var restore = function () {};
    try {
      await (document.fonts && document.fonts.ready);
      /* Wait for every crest to finish loading FIRST. inlineImages can only
         convert an image the browser already holds — anything still in flight
         was replaced with a blank, so on a cold cache or a slow connection the
         export came out with all but one of the 24 crests missing, and said
         "Downloaded" regardless. Same fix as fixtures-graphic. */
      var pending = [].slice.call(gfx.querySelectorAll("img"));
      var loaded = await Promise.all(pending.map(function (img) { return whenImageReady(img, 10000); }));
      var late = loaded.filter(function (ok) { return !ok; }).length;
      restore = await inlineImages(gfx);   /* pre-inline crests so the canvas isn't cross-origin tainted */
      var blob = await window.htmlToImage.toBlob(gfx, {
        width: 1080, height: h, pixelRatio: 1, cacheBust: false,
        backgroundColor: getComputedStyle(gfx).backgroundColor
      });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      /* never let a half-drawn graphic leave without saying so */
      setStatus(late
        ? "Downloaded — but " + late + " image" + (late === 1 ? "" : "s") + " didn't load. Check your connection and export again."
        : "Downloaded " + state.format);
    } catch (err) {
      console.error(err);
      setStatus("Export blocked — use a screenshot. (" + (err && err.message) + ")");
    } finally {
      try { restore(); } catch (e) {}
      gfx.style.transform = prevT; gfxHost.style.width = prevW; gfxHost.style.height = prevH;
    }
  }
  /* Resolve once an <img> has actually decoded, or once it's clear it won't.
     Never rejects — the caller only needs to know whether it made it. */
  function whenImageReady(img, ms) {
    return new Promise(function (resolve) {
      if (img.complete && img.naturalWidth) return resolve(true);
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
        resolve(ok);
      }
      function onLoad() { finish(!!img.naturalWidth); }
      function onError() { finish(false); }
      var timer = setTimeout(function () { finish(false); }, ms || 10000);
      img.addEventListener("load", onLoad);
      img.addEventListener("error", onError);
    });
  }

  async function inlineImages(root) {
    var BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    var imgs = [].slice.call(root.querySelectorAll("img"));
    var restores = [];
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
    el.textContent = m;
    clearTimeout(statusT);
    statusT = setTimeout(function () { el.textContent = "Ready"; }, ms || 2200);
  }

  /* ---------------- size segmented control ---------------- */
  function syncSizeSeg() {
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-fmt") === state.format);
    });
  }

  /* ---------------- National League Services ----------------
     There is no dated table endpoint and there does not need to be: a
     standings graphic is either the table as it stands or last season's final
     one, and the second is a paste job. So this loads current, or nothing.

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

  /* clubs-meta optaID IS the NLS teamID, so a club resolves on its code rather
     than on its name — which is what keeps the crest lookup reliable. */
  function nlsTeamName(row) {
    var a = row.attributes || {};
    var club = row.id && NL.clubs.byOpta(row.id);
    return (club && club.name) || a.teamName || a.teamShortName || "";
  }

  /* The graphic prints GD with its sign, the way a table does. */
  function gdText(v) {
    var n = Number(v);
    if (v == null || v === "" || isNaN(n)) return "";
    return n > 0 ? "+" + n : String(n);
  }
  function numText(v) { return (v == null || v === "") ? "" : String(v); }

  function loadFromNLS() {
    var comp = COMPETITION_ID[state.division];
    if (!comp) { setStatus("No table for that competition."); return; }
    var btn = $("nlsLoadBtn");
    btn.disabled = true;
    setStatus("Loading from National League Services…", 20000);

    NL.clubs.load()
      .catch(function () { /* fall back to the clock-derived season */ })
      .then(function () {
        return fetch(NLS_BASE + "/league-tables/?competitionID=" + comp +
                     "&seasonID=" + encodeURIComponent(nlsSeason()));
      })
      .then(function (r) {
        if (!r.ok) throw new Error("NLS " + r.status);
        return r.json();
      })
      .then(function (j) { applyTable((j && j.data) || []); })
      .catch(function (err) {
        console.error(err);
        setStatus("Couldn't reach National League Services.", 5000);
      })
      .then(function () { btn.disabled = false; });
  }

  function applyTable(data) {
    var rows = data.filter(function (r) {
      var a = (r && r.attributes) || {};
      return r && r.id && (a.teamName || a.teamShortName) && a.position != null;
    }).sort(function (x, y) {
      return (x.attributes.position || 999) - (y.attributes.position || 999);
    }).map(function (r) {
      var a = r.attributes || {};
      return {
        team: nlsTeamName(r),
        flag: E.FLAG_NONE,          /* the feed has no zones — see above */
        p: numText(a.played), w: numText(a.won), d: numText(a.drawn), l: numText(a.lost),
        f: numText(a.goalsFor), a: numText(a.goalsAgainst),
        gd: gdText(a.goalDifference), pts: numText(a.points)
      };
    });

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

  /* ---------------- source toggle ----------------
     Picks which half of the tool is on screen. The grid editor underneath
     belongs to both, so a table loaded from the feed stays editable by hand. */
  function setSource(src) {
    state.source = (src === "manual") ? "manual" : "feed";
    document.querySelectorAll(".src-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-src") === state.source);
    });
    document.body.setAttribute("data-source", state.source);
    save();
  }

  /* ---------------- matchday options ---------------- */
  function buildMatchdayOptions() {
    var sel = $("matchdaySel");
    if (!sel) return;
    var html = '<option value="">Current Standings</option>' +
               '<option value="final">Final Standings</option>';
    for (var i = 1; i <= 46; i++) html += '<option value="' + i + '">Matchday ' + i + '</option>';
    sel.innerHTML = html;
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
     a spelling the feed uses and clubs-meta doesn't — becomes its own option
     rather than being silently swapped for whichever club sorts first. */
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
  function setActiveDir(d) {
    state.dir = d;
    document.querySelectorAll(".dir-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-dir") === d);
    });
    save(); render();
  }

  function init() {
    load();

    if (!state.rows.length) {
      state.rows = E.parse(SAMPLE);
    }
    syncPasteFromRows();
    buildGrid();

    $("divisionSel").value = state.division;
    syncSizeSeg();
    buildMatchdayOptions();
    $("matchdaySel").value = state.matchday;
    $("subIn").value = state.sub;
    setSource(state.source);

    $("divisionSel").addEventListener("change", function () {
      state.division = this.value;
      save(); render();
    });
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.format = b.getAttribute("data-fmt"); syncSizeSeg(); save(); render();
      });
    });
    $("matchdaySel").addEventListener("change", function () { state.matchday = this.value; save(); render(); });
    $("subIn").addEventListener("input", function () { state.sub = this.value; save(); render(); });

    var pt;
    pasteEl.addEventListener("input", function () {
      clearTimeout(pt); pt = setTimeout(syncRowsFromPaste, 120);
    });
    gridBody.addEventListener("input", gridChanged);
    gridBody.addEventListener("change", gridChanged);

    $("nlsLoadBtn").addEventListener("click", loadFromNLS);
    $("zoneFillBtn").addEventListener("click", fillZonesByPosition);
    $("zoneClearBtn").addEventListener("click", clearZones);
    document.querySelectorAll(".src-btn").forEach(function (b) {
      b.addEventListener("click", function () { setSource(b.getAttribute("data-src")); fitStage(); });
    });

    $("downloadBtn").addEventListener("click", downloadPNG);
    $("resetBtn").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state.rows = E.parse(SAMPLE); state.matchday = ""; state.sub = "2026-27";
      state.division = "National"; state.format = "1x1"; state.source = "feed";
      $("divisionSel").value = "National"; syncSizeSeg(); setSource("feed");
      $("matchdaySel").value = ""; $("subIn").value = state.sub;
      syncPasteFromRows(); buildGrid(); save(); render();
      setStatus("Reset");
    });

    window.addEventListener("resize", fitStage);

    /* The grid is built before the roster arrives, so rebuild it once the
       options exist. */
    buildTeamOptions().then(function () { buildGrid(); render(); }).catch(function () {});

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
