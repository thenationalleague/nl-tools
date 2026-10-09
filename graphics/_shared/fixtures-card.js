/* ============================================================
   Fixtures & Results Card — shared renderer
   File: /graphics/_shared/fixtures-card.js
   Version: v1.0 (09/10/2026)

   Single source of truth for the fixtures/results card artwork. Both the
   interactive tool (/graphics/fixtures-graphic/) and the scheduled batch
   (scripts/build-fixtures-graphics.js) call render(), so a card made by
   hand and one made by the timer are drawn by the same code.

   The card is DOM + CSS (fixtures-styles.css + brand-graphic.css), not a
   canvas, so render() needs a real browser layout to measure names
   against. It resolves once rows are sized and names fitted; the caller
   decides what to do next (the tool scales a preview, the batch exports).

   Club lookups come in as a `clubs` argument rather than being read from
   window.NL here, so the module states its one dependency instead of
   assuming a page global. In practice it is always NL.clubs.

   API (window.NL_FIXTURES_CARD)
     render(host, card, clubs)     → Promise<HTMLElement .gfx>
     toPng(gfx, format)            → Promise<{ blob, late }>  (needs html-to-image)
       card = { division, format, mode, matchday, fit, season, rows }
     buildRows(nlsData, clubs)     → { rows, total, postponed, trimmed, odd }
       NLS list-endpoint matches → card rows, with day dividers and the
       kick-off-time defaults (only the odd-one-out times are printed).
     title(matchday)               → the header text
     seasonLabel(startYear)        → "2026-27"
     FORMAT_H, MAX_ROWS, COMPETITION_ID, NLS_BASE, DIVISION_LOGO, DIV_NAME
     ymdUK, koTime, koDay, dividerLabel, nlsDate, nlsTeamName(clubs, team)

   CHANGELOG
     v1.0 09/10/2026  Lifted out of fixtures-app.js v1.11 unchanged, so the
                      batch can draw the same card. Two additions:
                      - a title containing " – " breaks at the dash onto two
                        lines ("GROUP STAGE" / "MATCHDAY 3"), dash dropped
                        at the break, instead of wrapping wherever it ran
                        out of room;
                      - the eyebrow season comes from the caller instead of
                        a hard-coded "2026-27";
                      - a game counts as postponed by its matchPeriod, not by
                        postponementReason, which NLS leaves on rearranged
                        games — they were being dropped from their new date.
   ============================================================ */
(function (root) {
  "use strict";

  var MAX_ROWS = 12;
  var FORMAT_H = { "1x1": 1080, "4x5": 1350, "9x16": 1920 };

  var DIVISION_LOGO = {
    National: "/assets/divisions/medium/National.png",
    North:    "/assets/divisions/medium/North.png",
    South:    "/assets/divisions/medium/South.png",
    Cup:      "/assets/divisions/medium/NL%20Cup.png"
  };
  /* No logo fallback. A division badge that fails used to be replaced with
     the generic National League logo, which published a graphic branded as
     the wrong competition — worse than an obvious gap. Missing art renders
     blank (visibility:hidden keeps the header's spacing). */

  /* National League Services — the authoritative fixture/result feed.
     Public, no auth. competitionID values are firm NLS codes; never derive
     them from a division name. */
  var NLS_BASE = "https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2";
  var COMPETITION_ID = { National: 89, North: 373, South: 372, Cup: 1275 };

  var DIV_NAME = {
    National: "Enterprise National League",
    North: "Enterprise National League North",
    South: "Enterprise National League South",
    Cup: "National League Cup"
  };

  function roseWhite() {
    return (root.__resources && root.__resources.roseWhite) ||
      "/assets/crests/National%20League%20rose%20white.png";
  }

  /* Names that always display shortened, in every fit mode. Keyed on the
     canonical club name, lower-cased. */
  var SHORTEN = {
    "hampton & richmond borough": "Hampton & Richmond",
    "hemel hempstead town": "Hemel Hempstead"
  };

  /* Accepted spellings that aren't the club's canonical name. */
  var ALIAS = {
    "hemel hempstead": "Hemel Hempstead Town",
    "hampton & richmond": "Hampton & Richmond Borough"
  };

  /* Crests are served same-origin on purpose: the PNG export draws every
     image into a canvas, and a cross-origin image taints it. Medium tier
     (256px) — comfortably oversampled for a row crest, ~57KB each rather
     than the ~524KB originals, so fewer fail to arrive before export. */
  var CREST_BASE = "/assets/crests/medium/";
  function crestUrl(name) {
    return name ? CREST_BASE + encodeURIComponent(name) + ".png" : "";
  }
  /* Cup guest sides carry a crestName pointing at the parent club's badge. */
  function crestKey(clubs, name) {
    var guest = clubs.guestByName && clubs.guestByName(name);
    return (guest && guest.crestName) || name;
  }
  function canonicalName(clubs, name) {
    var k = String(name || "").toLowerCase().trim();
    if (!k) return String(name || "");
    if (clubs.byName(k)) return clubs.byName(k).name;
    return ALIAS[k] || String(name || "").trim();
  }
  function teamDisplay(clubs, name, fit) {
    var canon = canonicalName(clubs, name);
    if (fit === "short") {
      var club = clubs.byName(canon) || (clubs.guestByName && clubs.guestByName(canon));
      if (club && club.short) return club.short.toUpperCase();
    }
    var k = canon.toLowerCase();
    if (SHORTEN[k]) return SHORTEN[k].toUpperCase();
    return canon.toUpperCase();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function title(matchday) {
    var m = String(matchday || "").trim();
    if (!m) return "MATCHDAY";
    if (/^\d{1,2}$/.test(m)) return "MATCHDAY " + m;   /* bare number → MATCHDAY N */
    return m;                                         /* free text verbatim */
  }
  /* " – " (en dash, spaced) is a deliberate break point: each side gets its
     own line and the dash is dropped at the break. Agreed 09/10/2026 for
     "GROUP STAGE – MATCHDAY 3", which otherwise wrapped mid-phrase. */
  function titleHtml(text) {
    return String(text).split(/\s+–\s+/).map(escapeHtml).join("<br>");
  }

  function seasonLabel(startYear) {
    var y = parseInt(startYear, 10);
    if (!y) return "";
    return y + "-" + String((y + 1) % 100).padStart(2, "0");
  }

  /* ---------------- render ---------------- */
  function render(host, card, clubs) {
    var fit = card.fit || "wrap", mode = card.mode || "fixtures";
    var fc = 0;
    var rows = (card.rows || []).filter(function (r) {
      if (r.divider != null) return true;
      if (!((r.home || "").trim() || (r.away || "").trim())) return false;
      fc++; return fc <= MAX_ROWS;
    });
    var div = card.division;

    var gfx = document.createElement("div");
    gfx.className = "gfx";
    gfx.setAttribute("data-format", card.format);
    gfx.setAttribute("data-mode", mode);
    gfx.setAttribute("data-fit", fit);

    var sub = (DIV_NAME[div] + " " + (mode === "results" ? "RESULTS" : "FIXTURES")).toUpperCase();

    var head = document.createElement("div");
    head.className = "gfx-head";
    head.innerHTML =
      '<div class="logo-tile"><img class="div-logo" crossorigin="anonymous" src="' + DIVISION_LOGO[div] +
        '" onerror="this.onerror=null;this.style.visibility=\'hidden\'"></div>' +
      '<div class="titles">' +
        '<span class="eyebrow">' + escapeHtml(card.season || "") + '</span>' +
        '<h1 class="gfx-title">' + titleHtml(title(card.matchday)) + '</h1>' +
        '<p class="gfx-sub">' + escapeHtml(sub) + '</p>' +
      '</div>' +
      '<img class="rose-wm" crossorigin="anonymous" src="' + roseWhite() + '">';

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
      var homeCrest = crestUrl(crestKey(clubs, canonicalName(clubs, r.home)));
      var awayCrest = crestUrl(crestKey(clubs, canonicalName(clubs, r.away)));
      var hasScore = mode === "results" && r.hs !== "" && r.hs != null && r.as !== "" && r.as != null;
      var mid;
      if (hasScore) {
        mid = '<span class="score">' + escapeHtml(r.hs) + '&nbsp;-&nbsp;' + escapeHtml(r.as) + '</span>';
      } else {
        mid = '<span class="vs">v</span>';
        /* koOn undefined = show; only an explicit false hides a time. */
        if (mode !== "results" && r.ko && r.koOn !== false) {
          mid += '<span class="ko">' + escapeHtml(r.ko) + '</span>';
        }
      }
      var row = document.createElement("div");
      row.className = "fx";
      row.innerHTML =
        '<div class="crest home"><div class="tile">' + (homeCrest ? '<img crossorigin="anonymous" src="' + homeCrest + '" onerror="this.style.display=\'none\'">' : "") + '</div></div>' +
        '<div class="bar home"><span class="nm">' + escapeHtml(teamDisplay(clubs, r.home, fit)) + '</span></div>' +
        '<div class="mid">' + mid + '</div>' +
        '<div class="bar away"><span class="nm">' + escapeHtml(teamDisplay(clubs, r.away, fit)) + '</span></div>' +
        '<div class="crest away"><div class="tile">' + (awayCrest ? '<img crossorigin="anonymous" src="' + awayCrest + '" onerror="this.style.display=\'none\'">' : "") + '</div></div>';
      body.appendChild(row);
    });

    gfx.appendChild(head);
    gfx.appendChild(body);
    host.innerHTML = "";
    host.appendChild(gfx);

    /* size rows to fill the body without overflow */
    return new Promise(function (resolve) {
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
        /* fit the title: allow up to 2 lines, shrink if longer */
        var titleEl = gfx.querySelector(".gfx-title");
        if (titleEl && titleEl.innerHTML.indexOf("<br>") >= 0) {
          /* Forced break: each half is one line, so it may not wrap again.
             The titles column is sized by its content, so its width can't
             be the limit — the header's inner right edge is. */
          titleEl.style.fontSize = "";
          titleEl.style.whiteSpace = "nowrap";
          var hcs = getComputedStyle(head);
          var limit = head.getBoundingClientRect().right - parseFloat(hcs.paddingRight || 0);
          var bsize = 66, bg = 0;
          while (titleEl.getBoundingClientRect().left + titleEl.scrollWidth > limit + 1 && bsize > 34 && bg < 40) {
            bsize -= 1.5; titleEl.style.fontSize = bsize + "px"; bg++;
          }
        } else if (titleEl) {
          titleEl.style.fontSize = "";
          var tsize = 66, tg = 0;
          while (titleEl.scrollHeight > tsize * 0.9 * 2 + 6 && tsize > 34 && tg < 40) {
            tsize -= 1.5; titleEl.style.fontSize = tsize + "px"; tg++;
          }
        }
        fitNames(body, fit);
        resolve(gfx);
      });
    });
  }

  /* ---------------- name fitting ----------------
     One line is the goal: a name only wraps when it genuinely cannot fit on
     one at the smallest size allowed. The only measurement is the name's
     one-line width against the bar's width, which the grid fixes
     independently of the text — never a height its own font-size decides. */
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
    while (nm.scrollWidth > avail + 1 && size > floor && g < 120) {
      size -= 0.5; nm.style.fontSize = size + "px"; g++;
    }
    return { size: size, fits: nm.scrollWidth <= avail + 1 };
  }
  function fitNames(body, fit) {
    var nms = [].slice.call(body.querySelectorAll(".fx .nm"));
    if (!nms.length) return;
    var canWrap = fit === "wrap" || fit === "short";
    nms.forEach(function (nm) { nm.style.fontSize = ""; nm.style.letterSpacing = ""; nm.style.whiteSpace = ""; });
    var base = parseFloat(getComputedStyle(nms[0]).fontSize) || 20;
    var floor = base * MIN_RATIO;
    var minSize = base;
    nms.forEach(function (nm) {
      var r = oneLineSize(nm, base, floor);
      if (r.fits && r.size < minSize) minSize = r.size;
    });
    nms.forEach(function (nm) {
      nm.style.fontSize = minSize + "px";
      nm.style.whiteSpace = "nowrap";
      if (nm.scrollWidth <= barAvailWidth(nm) + 1) return;
      if (!canWrap) return;
      nm.style.whiteSpace = "normal";
      var row = nm.parentNode.parentNode;
      var rowH = row ? row.clientHeight : 0;
      var size = minSize, g = 0;
      while (rowH && nm.scrollHeight > rowH - 2 && size > base * 0.5 && g < 60) {
        size -= 0.5; nm.style.fontSize = size + "px"; g++;
      }
    });
  }

  /* ---------------- export ----------------
     One export path for the tool's Download button and the batch, so a
     fix to how crests are captured lands in both at once. Needs
     window.htmlToImage (html-to-image 1.11.11) on the page. The caller
     must have the .gfx unscaled at full size before calling. */
  function toPng(gfx, format) {
    var h = FORMAT_H[format];
    var restore = function () {};
    return Promise.resolve(document.fonts && document.fonts.ready).then(function () {
      /* Wait for every crest and logo to finish loading FIRST: inlineImages
         can only convert an image the browser already holds, so exporting
         before they land silently drops them. */
      var pending = [].slice.call(gfx.querySelectorAll("img"));
      return Promise.all(pending.map(function (img) { return whenImageReady(img, 10000); }));
    }).then(function (loaded) {
      var late = loaded.filter(function (ok) { return !ok; }).length;
      restore = inlineImages(gfx);   /* pre-inline so the canvas isn't tainted */
      return root.htmlToImage.toBlob(gfx, {
        width: 1080, height: h, pixelRatio: 1, cacheBust: false,
        backgroundColor: getComputedStyle(gfx).backgroundColor
      }).then(function (blob) { return { blob: blob, late: late }; });
    }).then(function (r) { try { restore(); } catch (e) {} return r; },
            function (err) { try { restore(); } catch (e) {} throw err; });
  }
  /* Resolve once an <img> has decoded, or once it's clear it won't. */
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
  /* Convert every <img> to a data URL via canvas so html-to-image never
     fetches cross-origin. An image that can't be converted is blanked for
     the capture, so export is never blocked. Returns a restore fn. */
  function inlineImages(rootEl) {
    var BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    var imgs = [].slice.call(rootEl.querySelectorAll("img"));
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

  /* ---------------- National League Services ---------------- */

  /* NLS timestamps are UTC, "2026-08-29 14:00:00" (list) or with T and Z.
     Read back in UK time — a 19:45 BST kick-off is 18:45Z. */
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
  /* clubs-meta optaID IS the NLS teamID. Cup guests have no optaID and
     fall back to the name NLS supplies. */
  function nlsTeamName(clubs, t) {
    if (!t) return "";
    var club = t.teamID && clubs.byOpta(t.teamID);
    return (club && club.name) || t.name || "";
  }
  function nlsScore(t) { return (t && t.score != null) ? String(t.score) : ""; }

  function buildRows(data, clubs) {
    /* Postponed = matchPeriod "Postponed". NOT postponementReason: NLS keeps
       the reason on a game after it is rearranged, so filtering on it drops
       the rearranged game from its new date. Seen 09/10/2026: Ebbsfleet v
       Folkestone, played 06/10 (FullTime, 1,177 crowd), still carries
       postponementReason "Other", as does Ebbsfleet v AFC Totton, a
       rearranged fixture on 13/10. */
    var postponed = 0;
    var matches = (data || []).filter(function (m) {
      if (String((m.attributes || {}).matchPeriod || "").toLowerCase() === "postponed") { postponed++; return false; }
      return true;
    }).map(function (m) {
      var a = m.attributes || {};
      return {
        home: nlsTeamName(clubs, a.homeTeam),
        away: nlsTeamName(clubs, a.awayTeam),
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

    var total = matches.length;
    var trimmed = matches.length > MAX_ROWS;
    matches = matches.slice(0, MAX_ROWS);

    /* Tick the kick-offs that are NOT the card's usual time. A card where
       every game is at 15:00 prints no times at all; the 12:30 and the
       19:45 print theirs. */
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
    return { rows: rows, matches: matches, total: total, postponed: postponed, trimmed: trimmed, odd: odd };
  }

  root.NL_FIXTURES_CARD = {
    VERSION: "v1.0",
    MAX_ROWS: MAX_ROWS,
    FORMAT_H: FORMAT_H,
    DIVISION_LOGO: DIVISION_LOGO,
    DIV_NAME: DIV_NAME,
    NLS_BASE: NLS_BASE,
    COMPETITION_ID: COMPETITION_ID,
    render: render,
    toPng: toPng,
    buildRows: buildRows,
    title: title,
    seasonLabel: seasonLabel,
    nlsDate: nlsDate,
    ymdUK: ymdUK,
    koTime: koTime,
    koDay: koDay,
    dividerLabel: dividerLabel,
    nlsTeamName: nlsTeamName
  };
})(typeof window !== "undefined" ? window : this);
