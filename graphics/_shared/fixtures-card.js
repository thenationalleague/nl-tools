/* ============================================================
   Fixtures & Results Card — shared renderer
   File: /graphics/_shared/fixtures-card.js
   Version: v1.2 (09/10/2026)

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
     toPng(gfx, format)            → Promise<{ blob, late, missing[] }>
                                     (needs png-export.js and html-to-image)
       card = { division, format, mode, matchday, fit, season, rows }
     buildRows(nlsData, clubs)     → { rows, total, postponed, trimmed, odd }
       NLS list-endpoint matches → card rows, with day dividers and the
       kick-off-time defaults (only the odd-one-out times are printed).
     title(matchday)               → the header text
     seasonLabel(startYear)        → "2026-27"
     FORMAT_H, MAX_ROWS, COMPETITION_ID, NLS_BASE, DIVISION_LOGO, DIV_NAME
     ymdUK, koTime, koDay, dividerLabel, nlsDate, nlsTeamName(clubs, team)

   CHANGELOG
     v1.2 09/10/2026  Penalty shootouts: a result row carrying hp/ap prints
                      "(5-6 pens)" under the score. buildRows fills them
                      from NLS penaltyScore.
     v1.1 09/10/2026  Cup guests NLS calls U21 print as PL2, matching the
                      table graphic.
                      Export moved to graphics/_shared/png-export.js.
                      Up to 16 games per card (was 12) for Cup nights; 12 or
                      fewer draw exactly as before.
                      Cup guests NLS calls "U21" (Ipswich, Birmingham, Norwich)
                      now find their PL2 record, so the crest draws. toPng
                      also names the images that failed to load.
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

  /* 16, not 12: a Cup group-stage night has 15 or 16 games (18/08/2026 had
     15) and dropping some is worse than smaller rows. Up to 12 the card is
     drawn exactly as before; past 12 the gaps tighten and rows may shrink
     below the usual 44px floor. */
  var MAX_ROWS = 16;
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
  /* Cup guest sides carry a crestName pointing at the parent club's badge.
     NLS names some of them "U21" where cup-clubs-meta says "PL2" — seen
     09/10/2026 on the 18/08 Cup card: Ipswich Town U21, Birmingham City U21,
     Norwich City U21 — so a U21/U23 name is also tried as its PL2 record.
     Canon candidate: NL.clubs.guestByName could carry this for every tool. */
  function guestFor(clubs, name) {
    if (!clubs.guestByName || !name) return null;
    return clubs.guestByName(name) ||
      clubs.guestByName(String(name).replace(/\s+U2[13]$/i, " PL2"));
  }
  function crestKey(clubs, name) {
    var guest = guestFor(clubs, name);
    return (guest && guest.crestName) || name;
  }
  function canonicalName(clubs, name) {
    var k = String(name || "").toLowerCase().trim();
    if (!k) return String(name || "");
    if (clubs.byName(k)) return clubs.byName(k).name;
    /* A Cup guest prints under its cup-clubs-meta name: "Ipswich Town U21"
       becomes "Ipswich Town PL2", the competition's own name for the side
       and the spelling the table graphic already prints. */
    var guest = guestFor(clubs, name);
    if (guest) return guest.name;
    return ALIAS[k] || String(name || "").trim();
  }
  function teamDisplay(clubs, name, fit) {
    var canon = canonicalName(clubs, name);
    if (fit === "short") {
      var club = clubs.byName(canon) || guestFor(clubs, canon);
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
        /* Cup ties level after 90 go straight to penalties (no extra time):
           the shootout prints small under the score, the way a kick-off
           time sits under the v. */
        if (r.hp != null && r.hp !== "" && r.ap != null && r.ap !== "") {
          mid += '<span class="pens">(' + escapeHtml(r.hp) + '-' + escapeHtml(r.ap) + ' pens)</span>';
        }
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
        var fixtureCount = rows.filter(function (r) { return r.divider == null; }).length;
        var dense = fixtureCount > 12;
        var gap = dense ? 5 : 8;
        var dividerCount = rows.length - fixtureCount;
        var units = fixtureCount + dividerCount * 0.5;   /* dividers are half-height */
        if (units <= 0) units = 1;
        var rh = Math.floor((avail - gap * (rows.length - 1)) / units);
        rh = Math.max(dense ? 30 : 44, Math.min(rh, 98));
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
     graphics/_shared/png-export.js does the work (shared with the table
     graphic); this only supplies the card's size. */
  function toPng(gfx, format) {
    return root.NL_GFX_EXPORT.toPng(gfx, 1080, FORMAT_H[format]);
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
  function nlsPens(t) { return (t && t.penaltyScore != null) ? String(t.penaltyScore) : ""; }

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
        /* penaltyScore is null unless the tie went to a shootout. Live-
           confirmed field (nls-data-structure skill: Hemel Hempstead 1-1
           Weston-super-Mare, 5-6 on pens, 28/04/2026). */
        hp: nlsPens(a.homeTeam),
        ap: nlsPens(a.awayTeam),
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
      var row = { home: r.home, away: r.away, hs: r.hs, as: r.as, ko: r.ko, koOn: r.koOn };
      if (r.hp !== "" && r.ap !== "") { row.hp = r.hp; row.ap = r.ap; }
      rows.push(row);
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
    crestKey: crestKey,
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
