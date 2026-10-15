/* =============================================================================
   NL Tools — DAZN Viewing: data layer
   File: /dazn/_data.js
   Version: v29.0 (15/10/2026)

   CHANGELOG
     v29.0 (15/10/2026) — Admin edits: applyOverride (neutral venue, UK
       availability, leave out, count anyway), kept apart from the import so
       a re-import re-applies them. Neutral games are neither home nor away
       in summarise. benchAll split out so an edit can recompute averages.
     v27.0 (15/10/2026) — nlsIndex / checkPlayed: streams of games that were
       never played (postponed or rearranged) are found against the NLS
       results and left out of the import. See the block above
       root.DAZNData for the rule.
     v9.0 (12/10/2026) — Dates written out with a month name are accepted
       ("Sat, 9 Aug 2025", "9 August 2025", "09-Aug-25"). The workbook's
       Matches sheet displays its dates that way, so the first real paste
       was refused on every row. A lone dash reads as 0, which is how the
       sheet's number format displays zero.
     v3.0 (12/10/2026) — First build. Parses the "Matches" sheet as pasted
       from the spreadsheet, keys each game, files it under both clubs, and
       works out the per-division averages clubs are compared against.

   Pure functions only — no DOM, no Firebase — so tests/dazn.test.mjs can run
   them in node. Both pages load this file: the admin page to import, the club
   page to summarise.

   WHAT A "VIEW" IS (DAZN's definition, from the source workbook's notes)
     A qualified viewer: someone who clicked to watch, or watched 2+ minutes
     of an autoplayed stream. NOT de-duplicated — one person watching three
     games is three views. So views add up across games, but a total is not a
     count of different people. Average minutes = total minutes ÷ total views.

   UK AVAILABILITY
     DAZN does not say whether a game was available in the UK; the workbook
     infers it, and the import keeps its four answers as codes:
       uk     shown in the UK (midweek, Sunday, Friday…)
       round  Saturday, but the whole round was available (exemption dates)
       moved  Saturday, picked for a 12:30 / 17:30 kick-off
       intl   Saturday 3pm, not available in the UK
     Most "intl" games still carry a handful of UK views (likely VIP / staff
     accounts). They are kept and counted in totals, but left out of "UK views
     per UK-shown game" — the same rule the workbook uses, so the figures here
     reconcile with it.

   STORAGE (written by the admin import, one season at a time)
     app-data/media-dazn/seasons/<season>/matches/<id>          every game, once
     app-data/media-dazn/seasons/<season>/clubs/<CODE>/div      club's division
     app-data/media-dazn/seasons/<season>/clubs/<CODE>/matches/<id>  its games
     app-data/media-dazn/seasons/<season>/bench/<div>           division averages
     app-data/media-dazn/index/<season>                         { label, games, importedAt }
   Each game is written under both clubs because that is what lets the rules
   say "a club code reads its own club's node and nothing else" in one line.
   A rule cannot filter a list; it can only open or shut a node.
   ============================================================================= */
(function (root) {
  'use strict';

  /* Benchmarks built from fewer games than this are not shown. With very few
     games behind an average, a club could work back to another club's figure
     from its own. */
  var MIN_BENCH_GAMES = 5;

  var DIVS = {
    'national league': 'National',
    'national league north': 'North',
    'national league south': 'South',
    'national': 'National', 'north': 'North', 'south': 'South'
  };
  var DIV_LABEL = { National: 'National League', North: 'National League North', South: 'National League South' };

  /* Header text → field. Matched on a normalised header so "UK views",
     "UK Views" and "uk  views" are the same column. Total columns in the
     sheet are ignored — totals are recomputed from the UK + international
     parts, so they can never disagree with them. */
  var COLS = {
    date: ['date'],
    home: ['home'],
    away: ['away'],
    div: ['division (home club)', 'division'],
    ukViews: ['uk views'],
    intlViews: ['international views'],
    ukMins: ['uk minutes'],
    intlMins: ['international minutes'],
    avail: ['shown in uk?', 'shown in uk']
  };

  function normHead(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  /* "09/08/2025", "9/8/2025", "2025-08-09", "2025-08-09 00:00:00",
     "Sat, 9 Aug 2025", "9 August 2025", "09-Aug-25" → "2025-08-09".
     Spreadsheets copy dates as they are DISPLAYED, so the text depends on
     the cell's format: a UK-locale sheet gives DD/MM/YYYY, and the DAZN
     workbook's Matches sheet shows "Sat, 9 Aug 2025". Anything else is
     refused rather than guessed: a guessed date files a game under the
     wrong fixture. The weekday is ignored, not checked. */
  function parseDate(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = s.match(/^(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]+)\.?,?[\s-]+(\d{2}|\d{4})$/i);
    if (m) {
      var mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
      if (mo && (m[2].length === 3 || MONTH_NAMES[mo - 1] === m[2].toLowerCase() || m[2].toLowerCase() === 'sept')) {
        return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, +m[1]);
      }
    }
    return null;
  }
  var MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
                     'august', 'september', 'october', 'november', 'december'];
  var MONTHS = MONTH_NAMES.map(function (n) { return n.slice(0, 3); });
  function valid(y, mo, d) {
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }

  /* "15,211" and " 311 " are numbers; "" and "n/a" are not. A lone dash is
     ZERO: the workbook's number format (#,##0;-#,##0;–) displays 0 as "–",
     and a paste carries the displayed text. */
  function parseNum(s) {
    var t = String(s == null ? '' : s).replace(/[,\s£]/g, '');
    if (/^[\u2013\u2014-]$/.test(t)) return 0;
    if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return null;
    var n = parseFloat(t);
    return n >= 0 ? n : null;
  }

  function parseAvail(s) {
    var t = String(s || '').trim().toLowerCase();
    if (/^no\b/.test(t)) return 'intl';
    if (/whole round/.test(t)) return 'round';
    if (/moved/.test(t)) return 'moved';
    if (/^yes\b/.test(t)) return 'uk';
    return null;
  }

  function parseDiv(s) { return DIVS[normHead(s)] || null; }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* Tab-separated text copied from the Matches sheet, header row included.
     Returns { rows, errors } — every problem is reported with its line
     number so it can be fixed in the sheet, and nothing is half-imported. */
  function parsePaste(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n')
      .filter(function (l) { return l.replace(/\t/g, '').trim() !== ''; });
    var errors = [];
    if (!lines.length) return { rows: [], errors: ['Nothing pasted.'] };

    var head = lines[0].split('\t').map(normHead);
    var idx = {};
    Object.keys(COLS).forEach(function (k) {
      for (var i = 0; i < COLS[k].length; i++) {
        var at = head.indexOf(COLS[k][i]);
        if (at !== -1) { idx[k] = at; return; }
      }
    });
    var missing = Object.keys(COLS).filter(function (k) { return idx[k] == null; });
    if (missing.length) {
      return { rows: [], errors: ['The first line must be the sheet\'s header row. Missing: ' +
        missing.map(function (k) { return COLS[k][0]; }).join(', ') + '.'] };
    }

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var c = lines[i].split('\t');
      var line = i + 1;
      var r = {
        date: parseDate(c[idx.date]),
        home: String(c[idx.home] || '').trim(),
        away: String(c[idx.away] || '').trim(),
        div: parseDiv(c[idx.div]),
        ukViews: parseNum(c[idx.ukViews]),
        intlViews: parseNum(c[idx.intlViews]),
        ukMins: parseNum(c[idx.ukMins]),
        intlMins: parseNum(c[idx.intlMins]),
        avail: parseAvail(c[idx.avail])
      };
      var bad = [];
      if (!r.date) bad.push('date "' + (c[idx.date] || '') + '"');
      if (!r.home) bad.push('home club');
      if (!r.away) bad.push('away club');
      if (!r.div) bad.push('division "' + (c[idx.div] || '') + '"');
      ['ukViews', 'intlViews', 'ukMins', 'intlMins'].forEach(function (k) {
        if (r[k] == null) bad.push(COLS[k][0] + ' "' + (c[idx[k]] || '') + '"');
      });
      if (!r.avail) bad.push('shown in UK? "' + (c[idx.avail] || '') + '"');
      if (bad.length) { errors.push('Line ' + line + ': ' + bad.join(', ') + '.'); continue; }
      r.ukMins = round1(r.ukMins);
      r.intlMins = round1(r.intlMins);
      r.line = line;
      rows.push(r);
    }
    return { rows: rows, errors: errors };
  }

  /* <yyyymmdd>-<HOME>-<AWAY>. The sheet carries no match ID, and last
     season predates the NLS sync, so the game is keyed on what identifies
     it. Club codes are clubs-meta's, the same keys the club-code claim
     carries. */
  function matchId(date, homeCode, awayCode) {
    return date.replace(/-/g, '') + '-' + homeCode + '-' + awayCode;
  }

  /* Attach club codes and build the season. `codeOf(name)` → clubs-meta code
     or null. Returns { season, unmatched, errors } — the season is null if
     anything did not resolve, because a game filed under no club is a game
     neither club can see. */
  function buildSeason(rows, codeOf) {
    var unmatched = {}, errors = [], matches = {}, clubs = {}, homeDiv = {};
    rows.forEach(function (r) {
      var h = codeOf(r.home), a = codeOf(r.away);
      if (!h) unmatched[r.home] = true;
      if (!a) unmatched[r.away] = true;
      if (!h || !a) return;
      var id = matchId(r.date, h, a);
      if (matches[id]) { errors.push('Line ' + r.line + ': ' + r.home + ' v ' + r.away + ' on ' + r.date + ' appears twice.'); return; }
      var rec = {
        date: r.date, home: h, away: a, div: r.div,
        ukViews: r.ukViews, intlViews: r.intlViews,
        ukMins: r.ukMins, intlMins: r.intlMins, avail: r.avail
      };
      if (r.abandoned) rec.abandoned = true;
      matches[id] = rec;
      [h, a].forEach(function (code) {
        clubs[code] = clubs[code] || { matches: {} };
        clubs[code].matches[id] = rec;
      });
      /* The sheet's division is the HOME club's, so a club's own division
         is read off its home games. */
      homeDiv[h] = r.div;
    });
    var names = Object.keys(unmatched).sort();
    if (names.length || errors.length) return { season: null, unmatched: names, errors: errors };

    Object.keys(clubs).forEach(function (code) {
      clubs[code].div = homeDiv[code] || mostCommonDiv(clubs[code].matches);
    });

    return {
      season: { matches: matches, clubs: clubs, bench: benchAll(matches) },
      unmatched: [], errors: []
    };
  }

  /* Every division's averages, from the season's games (each game once). */
  function benchAll(matches) {
    var bench = {};
    Object.keys(DIV_LABEL).forEach(function (div) {
      var inDiv = values(matches).filter(function (m) { return m.div === div; });
      if (inDiv.length) bench[div] = benchOf(inDiv);
    });
    return bench;
  }

  /* ---- Edits from the Admin tab (v29.0) ---------------------------------
     An edit is an override, kept apart from the imported season under
     overrides/<season>/<id>, so a re-import re-applies it instead of
     losing it. One override, applied to a season object in place:
       { neutral: true|false }        neither club was at home (a final at
                                      Wembley): counts under All only
       { avail: 'uk'|'intl' }         UK availability corrected by hand
       { excluded: true }             leave a counted game out (not played)
       { restored: true }             count a stream the NLS check left out
     A game lives in three places (matches, and each club's copy), and the
     division averages depend on it, so all three are kept in step and the
     averages are recomputed. Returns the season. */
  function placeGame(season, id, rec) {
    season.matches = season.matches || {};
    season.clubs = season.clubs || {};
    season.matches[id] = rec;
    [rec.home, rec.away].forEach(function (c) {
      if (!season.clubs[c]) season.clubs[c] = { div: rec.div, matches: {} };
      season.clubs[c].matches = season.clubs[c].matches || {};
      season.clubs[c].matches[id] = clone(rec);
    });
  }

  function dropGame(season, id) {
    var rec = (season.matches || {})[id];
    if (!rec) return null;
    delete season.matches[id];
    [rec.home, rec.away].forEach(function (c) {
      var club = (season.clubs || {})[c];
      if (club && club.matches) delete club.matches[id];
    });
    return rec;
  }

  function clone(o) { var c = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }

  function setNotPlayed(season, id, rec) {
    season.notPlayed = season.notPlayed || {};
    var np = clone(rec);
    np.views = rec.ukViews + rec.intlViews;
    np.mins = rec.ukMins + rec.intlMins;
    season.notPlayed[id] = np;
    [rec.home, rec.away].forEach(function (c) {
      var club = (season.clubs || {})[c];
      if (club) (club.notPlayed = club.notPlayed || {})[id] = np;
    });
  }

  function clearNotPlayed(season, id) {
    var np = (season.notPlayed || {})[id];
    if (!np) return null;
    delete season.notPlayed[id];
    [np.home, np.away].forEach(function (c) {
      var club = (season.clubs || {})[c];
      if (club && club.notPlayed) delete club.notPlayed[id];
    });
    return np;
  }

  function applyOverride(season, id, ov) {
    if (!season || !ov) return season;
    if (ov.restored) {
      var np = clearNotPlayed(season, id);
      if (np && np.ukViews != null) {
        var back = clone(np); delete back.views; delete back.mins;
        placeGame(season, id, back);
      }
    }
    if (ov.excluded) {
      var gone = dropGame(season, id);
      if (gone) setNotPlayed(season, id, gone);
    }
    var rec = (season.matches || {})[id];
    if (rec) {
      if (ov.neutral != null) rec.neutral = !!ov.neutral;
      if (ov.avail === 'uk' || ov.avail === 'intl') {
        /* Keep the finer Saturday code when it is still true. */
        if (ov.avail === 'intl') rec.avail = 'intl';
        else if (rec.avail === 'intl') rec.avail = 'uk';
      }
      if (!rec.neutral) delete rec.neutral;
      placeGame(season, id, rec);
    }
    season.bench = benchAll(season.matches || {});
    return season;
  }

  function mostCommonDiv(byId) {
    var n = {};
    Object.keys(byId).forEach(function (id) { var d = byId[id].div; n[d] = (n[d] || 0) + 1; });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a]; })[0] || null;
  }

  function values(obj) { return Object.keys(obj || {}).map(function (k) { return obj[k]; }); }

  /* Season figures for one club's games (or any list of games). */
  function summarise(games, clubCode) {
    games = Array.isArray(games) ? games : values(games);
    var s = {
      games: games.length, home: 0, away: 0, neutral: 0, intlOnly: 0,
      ukViews: 0, intlViews: 0, views: 0, mins: 0,
      ukShownGames: 0, ukShownViews: 0,
      avgMins: null, avgUkPerUkShown: null, avgIntlPerGame: null, avgViewsPerGame: null,
      top: null
    };
    games.forEach(function (g) {
      if (clubCode) { if (g.neutral) s.neutral++; else if (g.home === clubCode) s.home++; else s.away++; }
      var v = g.ukViews + g.intlViews;
      s.ukViews += g.ukViews;
      s.intlViews += g.intlViews;
      s.views += v;
      s.mins += g.ukMins + g.intlMins;
      if (g.avail === 'intl') s.intlOnly++;
      else { s.ukShownGames++; s.ukShownViews += g.ukViews; }
      if (!s.top || v > s.top.ukViews + s.top.intlViews) s.top = g;
    });
    if (s.views) s.avgMins = s.mins / s.views;
    if (s.ukShownGames) s.avgUkPerUkShown = s.ukShownViews / s.ukShownGames;
    if (s.games) {
      s.avgIntlPerGame = s.intlViews / s.games;
      s.avgViewsPerGame = s.views / s.games;
    }
    return s;
  }

  /* What gets stored for a division: only the averages and the game counts
     behind them, never the games. Clubs read this node; it must not let
     them rebuild another club's figures. */
  function benchOf(games) {
    var s = summarise(games);
    return {
      games: s.games,
      ukShownGames: s.ukShownGames,
      avgUkPerUkShown: s.avgUkPerUkShown == null ? null : Math.round(s.avgUkPerUkShown),
      avgIntlPerGame: s.avgIntlPerGame == null ? null : Math.round(s.avgIntlPerGame),
      avgMins: s.avgMins == null ? null : round1(s.avgMins)
    };
  }

  /* A benchmark figure, or null when too few games stand behind it. */
  function benchFigure(bench, key) {
    if (!bench) return null;
    var n = key === 'avgUkPerUkShown' ? bench.ukShownGames : bench.games;
    if (!(n >= MIN_BENCH_GAMES)) return null;
    return bench[key] == null ? null : bench[key];
  }

  /* ---- Was the game played? (NLS cross-check, v27.0) ---------------------
     DAZN streams games that never happened: a fixture postponed after the
     stream was set up (Woking v Solihull, 25 Feb 2026: 2 views) or one that
     did not complete and was rearranged (Altrincham v Morecambe, 3 Jan 2026:
     7 average minutes). NLS keeps a postponed fixture ONCE, at the date it
     was finally played, reusing the match ID, so the original date leaves
     no trace. The test is therefore: is there an NLS row for these two
     clubs ON THIS DATE?
       - FullTime / PostMatch: played.
       - Abandoned: counted too. It took place and was watched: Scunthorpe
         v Wealdstone (6 Sep 2025) was abandoned with no replay, and DAZN's
         viewers averaged 91 minutes of it.
       - no row at all: not played, and the stream is left out entirely.
     postponementReason is NOT a signal: it stays set on 161 games of
     2025-26 that were rearranged and then played.
     NLS teamID equals clubs-meta optaID for every club, so the join is on
     IDs, never names. */
  var LONDON = typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    : null;

  /* "2026-02-03 19:45:00" (UTC, no zone marker) → "2026-02-03" in London. */
  function londonDate(utc) {
    var t = Date.parse(String(utc || '').replace(' ', 'T') + 'Z');
    if (isNaN(t)) return null;
    return LONDON ? LONDON.format(new Date(t)) : new Date(t).toISOString().slice(0, 10);
  }

  var TOOK_PLACE = { fulltime: true, postmatch: true, abandoned: true };

  /* NLS /v2/matches data[] → { 'YYYY-MM-DD|tHOME|tAWAY': matchPeriod } */
  function nlsIndex(rows) {
    var idx = {};
    (rows || []).forEach(function (m) {
      var a = m && m.attributes;
      if (!a || !TOOK_PLACE[String(a.matchPeriod || '').toLowerCase()]) return;
      var d = londonDate(a.kickOffDateUTC);
      if (!d || !a.homeTeam || !a.awayTeam) return;
      idx[d + '|' + a.homeTeam.teamID + '|' + a.awayTeam.teamID] = a.matchPeriod;
    });
    return idx;
  }

  /* Split parsed rows into played and not played. optaOf(name) → clubs-meta
     optaID. A club with no optaID cannot be checked, so its games are kept
     and reported, never silently dropped. */
  function checkPlayed(rows, optaOf, idx) {
    var played = [], notPlayed = [], unchecked = [];
    rows.forEach(function (r) {
      var h = optaOf(r.home), a = optaOf(r.away);
      if (!h || !a) { unchecked.push(r); played.push(r); return; }
      var period = idx[r.date + '|' + h + '|' + a];
      if (!period) { notPlayed.push(r); return; }
      /* Abandoned games count, but carry a flag so the club sees why the
         game has no ordinary result. */
      if (String(period).toLowerCase() === 'abandoned') r.abandoned = true;
      played.push(r);
    });
    return { played: played, notPlayed: notPlayed, unchecked: unchecked };
  }

  root.DAZNData = {
    MIN_BENCH_GAMES: MIN_BENCH_GAMES,
    DIV_LABEL: DIV_LABEL,
    parseDate: parseDate,
    parseNum: parseNum,
    parseAvail: parseAvail,
    parsePaste: parsePaste,
    matchId: matchId,
    buildSeason: buildSeason,
    summarise: summarise,
    benchOf: benchOf,
    benchFigure: benchFigure,
    values: values,
    benchAll: benchAll,
    applyOverride: applyOverride,
    setNotPlayed: setNotPlayed,
    londonDate: londonDate,
    nlsIndex: nlsIndex,
    checkPlayed: checkPlayed
  };
})(typeof window !== 'undefined' ? window : globalThis);
