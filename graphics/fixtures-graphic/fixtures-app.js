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
    National: "/assets/divisions/medium/National.png",
    North:    "/assets/divisions/medium/North.png",
    South:    "/assets/divisions/medium/South.png",
    Cup:      "/assets/divisions/medium/NL%20Cup.png"
  };
  /* No LOGO_FALLBACK. A division badge that fails used to be replaced with the
     generic National League logo, which published a graphic branded as the
     wrong competition — worse than an obvious gap. Missing art now renders
     blank (visibility:hidden keeps the header's spacing) and the export
     warning names it. */
  var SPONSOR_URL = "/assets/partners/TIC%20Health.png";

  /* National League Services — the authoritative fixture/result feed. Public,
     no auth, and already fetched straight from the browser by travel-planner
     and the fan embeds, so no proxy is involved. competitionID values are firm
     NLS codes; never derive them from a division name. */
  var NLS_BASE = "https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2";
  var COMPETITION_ID = { National: 89, North: 373, South: 372, Cup: 1275 };
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
    "hemel hempstead": "Hemel Hempstead Town",
    "hampton & richmond": "Hampton & Richmond Borough"
  };

  /* Crests are served same-origin on purpose. The PNG export draws every image
     into a canvas, and a cross-origin image taints it — the crest is then
     dropped from the export rather than drawn. NL.clubs.crestUrl points at
     raw.githubusercontent.com, so it cannot be used on this path; the club
     lookup still comes from the canon, only the URL is local. */
  /* medium tier (256px). Row crests render small in a 1080-wide graphic, so
     256px is comfortably oversampled, while the full-res originals average
     524KB each (largest 5.4MB) — at 24 crests that is ~12.6MB of needless
     transfer, and the slower the connection the more likely one of them fails
     to arrive before export and is dropped. Medium averages 57KB. */
  var CREST_BASE = "/assets/crests/medium/";
  function crestUrl(name) {
    return name ? CREST_BASE + encodeURIComponent(name) + ".png" : "";
  }
  /* Guest sides — the PL2 teams that enter the National League Cup — live in
     their own file and carry a crestName pointing at the parent club's badge,
     so no crest is duplicated. "Birmingham City PL2" is drawn with the
     Birmingham City crest; without this it asked for a file that isn't there
     and rendered a gap. */
  function crestKey(name) {
    var guest = NL.clubs.guestByName && NL.clubs.guestByName(name);
    return (guest && guest.crestName) || name;
  }

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
    source: "feed",            /* feed | manual — which entry card is shown */
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
      var club = NL.clubs.byName(canon) ||
                 (NL.clubs.guestByName && NL.clubs.guestByName(canon));
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
        '" onerror="this.onerror=null;this.style.visibility=\'hidden\'"></div>' +
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
      var homeCrest = crestUrl(crestKey(homeName));
      var awayCrest = crestUrl(crestKey(awayName));
      var hasScore = state.mode === "results" && r.hs !== "" && r.hs != null && r.as !== "" && r.as != null;
      var mid;
      if (hasScore) {
        mid = '<span class="score">' + escapeHtml(r.hs) + '&nbsp;-&nbsp;' + escapeHtml(r.as) + '</span>';
      } else {
        mid = '<span class="vs">v</span>';
        /* koOn undefined = show (how every pasted row has always behaved);
           only an explicit false hides a time the row is carrying. */
        if (state.mode !== "results" && r.ko && r.koOn !== false) {
          mid += '<span class="ko">' + escapeHtml(r.ko) + '</span>';
        }
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
      fitNames(body);
      fitStage();
    });
  }

  /* ---------------- name fitting ----------------
     One line is the goal: a name only wraps when it genuinely cannot fit on
     one at the smallest size we allow.

     The old version measured each name against its own bar's height. That bar
     is a grid item sized by its content, so its height already included the
     wrap — a name that had wrapped was measured as "fitting" and never got
     shrunk, and the leftover two-line box is what read as a name sitting high
     in the pill with an empty second line under it. Nothing here reads a
     height that its own font-size decides; the only measurement is the name's
     one-line width against the bar's width, which the grid fixes independently
     of the text. */

  /* How far the whole set is willing to shrink to keep everything on one line.
     A name that still won't fit at this size is a genuine two-liner
     (SCARBOROUGH ATHLETIC), and it wraps rather than dragging every other name
     down with it. */
  var MIN_RATIO = 0.82;

  function barAvailWidth(nm) {
    var bar = nm.parentNode, cs = getComputedStyle(bar);
    return bar.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  }

  /* Largest size at or below `base` at which the name fits on one line. */
  function oneLineSize(nm, base, floor) {
    var avail = barAvailWidth(nm);
    nm.style.whiteSpace = "nowrap";
    var size = base, g = 0;
    nm.style.fontSize = size + "px";
    while (nm.scrollWidth > avail + 1 && size > floor && g < 120) {
      size -= 0.5; nm.style.fontSize = size + "px"; g++;
    }
    return { size: size, fits: nm.scrollWidth <= avail + 1 };
  }

  function fitNames(body) {
    var nms = [].slice.call(body.querySelectorAll(".fx .nm"));
    if (!nms.length) return;
    var canWrap = state.fit === "wrap" || state.fit === "short";

    /* base size comes from --rh via CSS, so read it with our overrides cleared */
    nms.forEach(function (nm) { nm.style.fontSize = ""; nm.style.letterSpacing = ""; nm.style.whiteSpace = ""; });
    var base = parseFloat(getComputedStyle(nms[0]).fontSize) || 20;
    var floor = base * MIN_RATIO;

    /* Smallest one-line size any name needs, ignoring names that can't manage
       one line even at the floor — those wrap instead, so they don't get to
       shrink everyone else. */
    var minSize = base;
    nms.forEach(function (nm) {
      var r = oneLineSize(nm, base, floor);
      if (r.fits && r.size < minSize) minSize = r.size;
    });

    /* Apply the shared size, then decide per name whether it stays on one
       line. nowrap is set explicitly, so a name that fits can never end up in
       a two-line box. */
    nms.forEach(function (nm) {
      nm.style.fontSize = minSize + "px";
      nm.style.whiteSpace = "nowrap";
      if (nm.scrollWidth <= barAvailWidth(nm) + 1) return;
      if (!canWrap) return;               /* truncate/scale/kern handle it in CSS */

      nm.style.whiteSpace = "normal";     /* genuinely too long — two lines it is */
      /* keep the wrapped name inside the row. The row's height is fixed by
         --rh, so unlike the old code this measures something the font-size
         cannot move. */
      var row = nm.parentNode.parentNode;
      var rowH = row ? row.clientHeight : 0;
      var size = minSize, g = 0;
      while (rowH && nm.scrollHeight > rowH - 2 && size > base * 0.5 && g < 60) {
        size -= 0.5; nm.style.fontSize = size + "px"; g++;
      }
    });
  }

  function fitStage() {
    var gfx = gfxHost.querySelector(".gfx");
    if (!gfx) return;
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
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

  /* NLS timestamps are UTC and arrive either as "2026-08-29 14:00:00" (list)
     or with a T and a Z. Normalise both, then read them back in UK time —
     a 19:45 BST kick-off is 18:45Z, and printing the Z time would be wrong. */
  function nlsDate(s) {
    if (!s) return null;
    var d = new Date(String(s).trim().replace(" ", "T").replace(/Z?$/, "Z"));
    return isNaN(d.getTime()) ? null : d;
  }
  function ymdUK(d) { return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); }
  function koTime(s) {
    var d = nlsDate(s);
    return d ? d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  }
  function koDay(s) { var d = nlsDate(s); return d ? ymdUK(d) : ""; }
  function dividerLabel(ymd) {
    var d = new Date(ymd + "T12:00:00Z");   /* midday: no DST edge either way */
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
            .replace(/,/g, "").toUpperCase();
  }
  /* clubs-meta optaID IS the NLS teamID, so a club resolves on its code rather
     than on its name — which is what makes the crest lookup reliable. Cup
     guest sides have no optaID and fall back to the name NLS supplies. */
  function nlsTeamName(t) {
    if (!t) return "";
    var club = t.teamID && NL.clubs.byOpta(t.teamID);
    return (club && club.name) || t.name || "";
  }
  function nlsScore(t) { return (t && t.score != null) ? String(t.score) : ""; }

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
    var postponed = 0;
    var matches = data.filter(function (m) {
      if ((m.attributes || {}).postponementReason) { postponed++; return false; }
      return true;
    }).map(function (m) {
      var a = m.attributes || {};
      return {
        home: nlsTeamName(a.homeTeam),
        away: nlsTeamName(a.awayTeam),
        hs: nlsScore(a.homeTeam),
        as: nlsScore(a.awayTeam),
        ko: koTime(a.kickOffDateUTC),
        day: koDay(a.kickOffDateUTC)
      };
    }).filter(function (r) { return r.home && r.away; })
      .sort(function (a, b) {
        if (a.day !== b.day) return a.day < b.day ? -1 : 1;
        if (a.ko !== b.ko) return a.ko < b.ko ? -1 : 1;
        return a.home.localeCompare(b.home);
      });

    var trimmed = matches.length > MAX_ROWS;
    matches = matches.slice(0, MAX_ROWS);
    if (!matches.length) {
      setStatus(postponed
        ? "Nothing to load — all " + postponed + " postponed."
        : "No matches on that date.", 5000);
      return;
    }

    /* Tick the kick-offs that are NOT the day's usual time. A card where every
       game is at 15:00 prints no times at all; the 12:30 and the 19:45 print
       theirs. Show all / Hide all override it. */
    var counts = {}, usual = "", most = 0;
    matches.forEach(function (r) {
      if (!r.ko) return;
      counts[r.ko] = (counts[r.ko] || 0) + 1;
      if (counts[r.ko] > most) { most = counts[r.ko]; usual = r.ko; }
    });
    var odd = 0;
    matches.forEach(function (r) { r.koOn = !!(r.ko && r.ko !== usual); if (r.koOn) odd++; });

    /* A card spanning more than one day gets a divider above each day. */
    var days = [];
    matches.forEach(function (r) { if (days.indexOf(r.day) < 0) days.push(r.day); });
    var rows = [], lastDay = null;
    matches.forEach(function (r) {
      if (days.length > 1 && r.day !== lastDay) { rows.push({ divider: dividerLabel(r.day) }); lastDay = r.day; }
      rows.push({ home: r.home, away: r.away, hs: r.hs, as: r.as, ko: r.ko, koOn: r.koOn });
    });

    state.rows = rows;
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
    var h = (state.format === "1x1" ? 1080 : state.format === "4x5" ? 1350 : 1920);
    gfx.style.transform = "none";
    gfxHost.style.width = "1080px"; gfxHost.style.height = h + "px";
    setStatus("Rendering PNG…");
    var restore = function () {};
    try {
      await (document.fonts && document.fonts.ready);
      /* Wait for every crest and logo to finish loading FIRST. inlineImages can
         only convert an image the browser already holds, so exporting before
         they land silently drops them — which is what a colleague on a cold
         cache or a slower connection was getting. */
      var pending = [].slice.call(gfx.querySelectorAll("img"));
      var loaded = await Promise.all(pending.map(function (img) { return whenImageReady(img, 10000); }));
      var late = loaded.filter(function (ok) { return !ok; }).length;
      restore = await inlineImages(gfx);   /* pre-inline so the canvas isn't cross-origin tainted */
      var blob = await window.htmlToImage.toBlob(gfx, {
        width: 1080, height: h, pixelRatio: 1, cacheBust: false,
        backgroundColor: getComputedStyle(gfx).backgroundColor
      });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      /* never let a half-drawn graphic leave without saying so */
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
