/* ============================================================
   Fixtures & Results Graphic — app logic.
   Club roster, crests and lookups come from the canon (NL.clubs).
   Paste = home, [middle nuked], away. Editor adds scores + KO.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "nl-fixtures-gfx-v1";
  var MAX_ROWS = 12;

  var DIVISION_LOGO = {
    National: "/assets/divisions/National.png",
    North:    "/assets/divisions/North.png",
    South:    "/assets/divisions/South.png",
    Cup:      "/assets/divisions/Cup.png"
  };
  var LOGO_FALLBACK = (window.__resources && window.__resources.logoFallback) || "/assets/divisions/The%20National%20League.png";
  var SPONSOR_URL = "/assets/partners/TIC%20Health.png";
  var ROSE_WHITE = (window.__resources && window.__resources.roseWhite) || "/assets/crests/National%20League%20rose%20white.png";

  var DIV_NAME = {
    National: "Enterprise National League",
    North: "Enterprise National League North",
    South: "Enterprise National League South",
    Cup: "National League Cup"
  };

  /* Names that always display shortened, in every fit mode. Keyed on the
     canonical club name, lower-cased. */
  var SHORTEN = {
    "hampton & richmond borough": "Hampton & Richmond",
    "hemel hempstead town": "Hemel Hempstead"
  };

  /* Accepted spellings that aren't the club's canonical name. Resolving
     through here means the crest and the club record are found whichever
     way the name was pasted. */
  var ALIAS = {
    "hemel hempstead": "Hemel Hempstead Town"
  };

  /* Any pasted spelling → the club's canonical name (used for crest lookup
     and club record lookup). Unknown names pass through untouched. */
  function canonicalName(name) {
    var k = String(name || "").toLowerCase().trim();
    if (!k) return String(name || "");
    if (NL.clubs.byName(k)) return NL.clubs.byName(k).name;
    return ALIAS[k] || String(name || "").trim();
  }

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
    matchday: "",              /* "" = MATCHDAY (no number) | "1".."46" */
    fit: "wrap",               /* wrap | short | truncate | scale | kern */
    rows: []                   /* {home, away, hs, as, ko} */
  };

  function modeLabel() {
    return state.mode === "results" ? "RESULTS" : "FIXTURES";
  }
  function matchdayTitle() {
    var m = (state.matchday || "").trim();
    if (!m) return "MATCHDAY";
    if (/^\d{1,2}$/.test(m)) return "MATCHDAY " + m;   /* bare number → MATCHDAY N */
    return m;                                         /* free text verbatim */
  }
  function subLine() {
    return (DIV_NAME[state.division] + " " + modeLabel()).toUpperCase();
  }

  /* ---------------- elements ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var gfxHost, stageWrap, pasteEl, gridBody;

  /* ---------------- helpers ---------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function teamDisplay(name) {
    var canon = canonicalName(name);
    /* short-name mode uses each club's short label from the DB */
    if (state.fit === "short") {
      var club = NL.clubs.byName(canon);
      if (club && club.short) return club.short.toUpperCase();
    }
    /* a few names always shorten on arrival, every mode */
    var k = canon.toLowerCase();
    if (SHORTEN[k]) return SHORTEN[k].toUpperCase();
    return canon.toUpperCase();
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (d && typeof d === "object") {
        ["division", "format", "mode", "matchday", "fit"].forEach(function (k) {
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

  /* ---------------- render ---------------- */
  function render() {
    var fc = 0;
    var rows = state.rows.filter(function (r) {
      if (r.divider != null) return true;
      if (!((r.home || "").trim() || (r.away || "").trim())) return false;
      fc++; return fc <= MAX_ROWS;
    });
    var n = rows.length || 1;
    var div = state.division;

    var gfx = document.createElement("div");
    gfx.className = "gfx";
    gfx.setAttribute("data-format", state.format);
    gfx.setAttribute("data-mode", state.mode);
    gfx.setAttribute("data-fit", state.fit);

    /* header */
    var head = document.createElement("div");
    head.className = "gfx-head";
    head.innerHTML =
      '<div class="logo-tile"><img class="div-logo" crossorigin="anonymous" src="' + DIVISION_LOGO[div] +
        '" onerror="this.onerror=null;this.src=\'' + LOGO_FALLBACK + '\'"></div>' +
      '<div class="titles">' +
        '<span class="eyebrow">' + escapeHtml(state.sub || "2026-27") + '</span>' +
        '<h1 class="gfx-title">' + escapeHtml(matchdayTitle()) + '</h1>' +
        '<p class="gfx-sub">' + escapeHtml(subLine()) + '</p>' +
      '</div>' +
      '<img class="rose-wm" crossorigin="anonymous" src="' + ROSE_WHITE + '">';

    /* body */
    var body = document.createElement("div");
    body.className = "gfx-body";

    rows.forEach(function (r) {
      if (r.divider != null) {
        var dv = document.createElement("div");
        dv.className = "fx-divider";
        dv.innerHTML = '<span class="dv-text">' + escapeHtml(r.divider) + '</span>';
        body.appendChild(dv);
        return;
      }
      var homeName = canonicalName(r.home), awayName = canonicalName(r.away);
      var homeCrest = homeName ? NL.clubs.crestUrl(homeName) : "";
      var awayCrest = awayName ? NL.clubs.crestUrl(awayName) : "";
      var hasScore = state.mode === "results" && r.hs !== "" && r.hs != null && r.as !== "" && r.as != null;
      var mid;
      if (hasScore) {
        mid = '<span class="score">' + escapeHtml(r.hs) + '&nbsp;-&nbsp;' + escapeHtml(r.as) + '</span>';
      } else {
        mid = '<span class="vs">v</span>';
        if (state.mode !== "results" && r.ko) mid += '<span class="ko">' + escapeHtml(r.ko) + '</span>';
      }
      var row = document.createElement("div");
      row.className = "fx";
      row.innerHTML =
        '<div class="crest home"><div class="tile">' + (homeCrest ? '<img crossorigin="anonymous" src="' + homeCrest + '" onerror="this.style.display=\'none\'">' : "") + '</div></div>' +
        '<div class="bar home"><span class="nm">' + escapeHtml(teamDisplay(r.home)) + '</span></div>' +
        '<div class="mid">' + mid + '</div>' +
        '<div class="bar away"><span class="nm">' + escapeHtml(teamDisplay(r.away)) + '</span></div>' +
        '<div class="crest away"><div class="tile">' + (awayCrest ? '<img crossorigin="anonymous" src="' + awayCrest + '" onerror="this.style.display=\'none\'">' : "") + '</div></div>';
      body.appendChild(row);
    });

    gfx.appendChild(head);
    gfx.appendChild(body);

    gfxHost.innerHTML = "";
    gfxHost.appendChild(gfx);

    /* size rows to fill the body without overflow */
    requestAnimationFrame(function () {
      var avail = body.clientHeight;
      var gap = 8;
      var fixtureCount = rows.filter(function (r) { return r.divider == null; }).length;
      var dividerCount = rows.length - fixtureCount;
      var units = fixtureCount + dividerCount * 0.5;   /* dividers are half-height */
      if (units <= 0) units = 1;
      var rh = Math.floor((avail - gap * (rows.length - 1)) / units);
      rh = Math.max(44, Math.min(rh, 98));
      gfx.style.setProperty("--rh", rh + "px");
      gfx.style.setProperty("--row-gap", gap + "px");
      gfx.style.setProperty("--crest", rh + "px");
      gfx.style.setProperty("--mid", Math.max(86, Math.round(rh * 1.3)) + "px");
      /* fit the matchday/title: allow up to 2 lines, shrink if longer */
      var titleEl = gfx.querySelector(".gfx-title");
      if (titleEl) {
        titleEl.style.fontSize = "";
        var tsize = 66, tg = 0;
        while (titleEl.scrollHeight > tsize * 0.9 * 2 + 6 && tsize > 34 && tg < 40) {
          tsize -= 1.5; titleEl.style.fontSize = tsize + "px"; tg++;
        }
      }
      /* per-name fitting, then EQUALISE so every name is the same size */
      var fit = state.fit;
      var nms = [].slice.call(body.querySelectorAll(".fx .nm"));
      var baseSize = 0, minSize = Infinity;
      nms.forEach(function (nm) {
        nm.style.fontSize = ""; nm.style.letterSpacing = "";
        var base = parseFloat(getComputedStyle(nm).fontSize) || 20;
        baseSize = base;
        var g = 0, size = base;
        var barH = nm.parentNode.clientHeight;
        /* shrink if wrapped lines exceed the row height OR a single long word
           (e.g. KIDDERMINSTER) overflows the bar width */
        while ((nm.scrollHeight > barH + 1 || nm.scrollWidth > nm.clientWidth + 1)
               && size > base * 0.5 && g < 90) {
          size -= 0.5; nm.style.fontSize = size + "px"; g++;
        }
        if (size < minSize) minSize = size;
      });
      /* apply the single smallest size to every name for a uniform look */
      if (minSize < Infinity) {
        nms.forEach(function (nm) { nm.style.fontSize = minSize + "px"; });
      }
      fitStage();
    });
  }

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
          '<td><input class="g-team" data-i="' + i + '" data-k="home" list="teamList" value="' + escapeHtml(r.home) + '"></td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="hs" value="' + escapeHtml(r.hs) + '"></td>' +
          '<td class="col-score"><input class="g-sc" data-i="' + i + '" data-k="as" value="' + escapeHtml(r.as) + '"></td>' +
          '<td><input class="g-team" data-i="' + i + '" data-k="away" list="teamList" value="' + escapeHtml(r.away) + '"></td>' +
          '<td class="col-ko"><input class="g-ko" data-i="' + i + '" data-k="ko" value="' + escapeHtml(r.ko) + '"></td>' +
          del;
      }
      gridBody.appendChild(tr);
    });
  }
  function gridChanged(e) {
    var t = e.target;
    if (t.classList.contains("g-del") || t.classList.contains("g-ins")) return;
    var i = parseInt(t.getAttribute("data-i"), 10);
    if (isNaN(i) || !state.rows[i]) return;
    state.rows[i][t.getAttribute("data-k")] = t.value;
    if (t.getAttribute("data-k") !== "divider") syncPasteFromRows();
    save(); render();
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

  /* ---------------- matchday options ---------------- */
  function buildMatchdayOptions() {
    var sel = $("matchdaySel");
    var html = '<option value="">Matchday (no number)</option>';
    for (var i = 1; i <= 46; i++) html += '<option value="' + i + '">Matchday ' + i + '</option>';
    sel.innerHTML = html;
  }

  /* ---------------- team datalist ---------------- */
  /* Roster comes from the canon (NL.clubs, one clubs-meta fetch per session),
     not a local mirror — current season only, which is what a matchday
     graphic is ever built from. */
  function buildTeamList() {
    NL.clubs.forSeason().then(function (clubs) {
      $("teamList").innerHTML = clubs.map(function (c) {
        return '<option value="' + escapeHtml(c.name) + '">';
      }).join("");
    }).catch(function () { /* datalist stays empty — names are free text anyway */ });
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
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
    gfx.style.transform = "none";
    gfxHost.style.width = "1080px"; gfxHost.style.height = h + "px";
    setStatus("Rendering PNG…");
    var restore = function () {};
    try {
      await (document.fonts && document.fonts.ready);
      restore = await inlineImages(gfx);   /* pre-inline crests so the canvas isn't cross-origin tainted */
      var blob = await window.htmlToImage.toBlob(gfx, {
        width: 1080, height: h, pixelRatio: 1, cacheBust: false,
        backgroundColor: getComputedStyle(gfx).backgroundColor
      });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      setStatus("Downloaded " + state.format);
    } catch (err) {
      console.error(err);
      setStatus("Export blocked — use a screenshot.");
    } finally {
      try { restore(); } catch (e) {}
      gfx.style.transform = prevT; gfxHost.style.width = prevW; gfxHost.style.height = prevH;
    }
  }
  /* Convert every <img> under root to a data URL via canvas so html-to-image
     never has to fetch cross-origin (which is blocked in the file:// download).
     Any image that can't be converted is blanked for the capture, so export
     is never blocked by a tainted canvas. Returns a restore fn. */
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
          var url = c.toDataURL("image/png");   /* throws if tainted */
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
    el.textContent = m; clearTimeout(statusT);
    statusT = setTimeout(function () { el.textContent = "Ready"; }, 2200);
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
    buildTeamList();
    if (!state.rows.length) state.rows = parse(SAMPLE);
    syncPasteFromRows();
    buildGrid();

    $("divisionSel").value = state.division;
    syncSizeSeg();
    $("matchdayInput").value = state.matchday;
    if ($("fitSel")) $("fitSel").value = state.fit;
    setMode(state.mode);

    $("divisionSel").addEventListener("change", function () { state.division = this.value; save(); render(); });
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

    var pt;
    pasteEl.addEventListener("input", function () { clearTimeout(pt); pt = setTimeout(syncRowsFromPaste, 140); });
    gridBody.addEventListener("input", gridChanged);
    gridBody.addEventListener("click", gridClicked);

    $("downloadBtn").addEventListener("click", downloadPNG);
    $("resetBtn").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state.rows = parse(SAMPLE); state.division = "National"; state.format = "1x1";
      state.mode = "fixtures"; state.matchday = "";
      $("divisionSel").value = "National"; syncSizeSeg(); $("matchdayInput").value = "";
      syncPasteFromRows(); buildGrid(); setMode("fixtures"); setStatus("Reset");
    });

    window.addEventListener("resize", fitStage);
    /* re-render once clubs-meta lands: short names and canonical-name
       resolution both read NL.clubs, which is empty until then */
    NL.clubs.load().then(render).catch(function () {});
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
