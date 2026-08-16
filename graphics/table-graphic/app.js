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
        ["division", "format", "matchday", "sub"].forEach(function (k) {
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

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* scale stage to fit preview column */
  function fitStage() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx) return;
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
    var availW = stageWrap.clientWidth - 24;
    var top = stageWrap.getBoundingClientRect().top;
    var availH = window.innerHeight - top - 24;
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
        '<td><select class="g-flag" data-i="' + i + '">' +
          flagOpt("-", r.flag) + flagOpt("C", r.flag) + flagOpt("SF", r.flag) +
          flagOpt("QF", r.flag) + flagOpt("R", r.flag) + '</select></td>' +
        '<td><input class="g-team" data-i="' + i + '" list="teamList" value="' + escapeHtml(r.team) + '"></td>' +
        '<td><input class="g-num" data-i="' + i + '" data-k="p" value="' + escapeHtml(r.p) + '"></td>' +
        '<td><input class="g-num" data-i="' + i + '" data-k="gd" value="' + escapeHtml(r.gd) + '"></td>' +
        '<td><input class="g-num" data-i="' + i + '" data-k="pts" value="' + escapeHtml(r.pts) + '"></td>';
      gridBody.appendChild(tr);
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
  function setStatus(m) {
    var el = $("status"); if (!el) return;
    el.textContent = m;
    clearTimeout(statusT);
    statusT = setTimeout(function () { el.textContent = "Ready"; }, 2200);
  }

  /* ---------------- size segmented control ---------------- */
  function syncSizeSeg() {
    document.querySelectorAll(".size-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-fmt") === state.format);
    });
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

  /* ---------------- team datalist ---------------- */
  /* Names from the canon, async: the datalist appearing a beat after boot is
     invisible in practice, and the alternative was the clubs-data.js mirror —
     the last copy of club data outside clubs-meta, 29 colours adrift by the
     time it was retired (nothing here ever read the colours; the drift was
     the warning, not the damage). */
  function buildTeamList() {
    NL.clubs.all().then(function (clubs) {
      $("teamList").innerHTML = clubs.map(function (c) {
        return '<option value="' + escapeHtml(c.name) + '">';
      }).join("");
    }).catch(function () { /* free-text entry still works without it */ });
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
    buildTeamList();

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

    $("downloadBtn").addEventListener("click", downloadPNG);
    $("resetBtn").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state.rows = E.parse(SAMPLE); state.matchday = ""; state.sub = "2026-27";
      state.division = "National"; state.format = "1x1";
      $("divisionSel").value = "National"; syncSizeSeg();
      $("matchdaySel").value = ""; $("subIn").value = state.sub;
      syncPasteFromRows(); buildGrid(); save(); render();
      setStatus("Reset");
    });

    window.addEventListener("resize", fitStage);

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
