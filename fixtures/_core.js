/* =============================================================================
   NL Tools — Fixture Management: data layer
   File: /fixtures/_core.js
   Version: v1.5 (28/10/2026)
   CHANGELOG
     v1.5 (28/10/2026) — A broadcast game given a new date is marked
       broadcast.review, for the Broadcast tab's review list (plan,
       Broadcast: "its status holds until confirmed"). DAZN_MOVES, the
       season's allocation of moves at DAZN's request.
     v1.4 (28/10/2026) — Play-offs belong to their division: a play-off is
       a National, North or South record with playoff: true and its round
       (QF/SF/F), not a competition of its own. 'North Playoffs' and the like
       read that way; a bare 'Playoffs' takes the home club's division.
       Play-offs never fold or merge with the same clubs' league games.
     v1.3 (28/10/2026) — A past season from its workbook, keyed to the
       Attendance archive (keyToAttendance), so its crowds stay attached:
       the 2025-26 sheet matched all 1,742 league, NL Cup and play-off games
       to NLS one-to-one. A workbook that keeps a postponed date as its own
       row, as that sheet does, has the row folded into the played game as
       a lost date. 'National/North/South Playoffs' read as play-offs, and
       'DAZN pick' as the DAZN column. Each row's sheet crowd rides along
       as sheetCrowd, for the import's cross-check only — never stored.
     v1.2 (28/10/2026) — fromAttendance: a past season built from the
       Attendance tool's archive (its fixtures keep their match IDs as keys,
       so the club-submitted crowds stay joined). Play-offs found as league
       games played after a club's full league season. Records carry
       neutral/venue; the public projection adds them and a numeric score,
       for Attendance to read.
     v1.1 (28/10/2026) — Results: the sheet's goals, extra time and
       penalties import as `result`; resultText formats them as the sheet
       does ('0-0 (1-1 aet, 4-3 p)'); an FA tie's winner comes from the score
       before the sheet's Result column, which says 'D Cup' for a replay won
       in extra time. nlsResults/matchNls read an NLS season list (shape from
       a live call, 28/10/2026) for the daily fill. loseDate / setDate /
       dropAttempt for postponing, abandoning, rescheduling and correcting.
       compare() orders a day by competition. The import no longer merges a
       league pairing seen twice: a row whose teams are reversed (the return
       fixture, per the published schedule) is turned round, anything else
       is kept and reported.
     v1.0 (28/10/2026) — First build. Parses the working fixtures workbook
       (Fixtures + Rearrangements tabs, pasted from Excel), joins it to the
       originally published schedule, and builds one record per fixture with
       its lost dates as attempts. Also the public projection, the competition
       list and the "needs attention" checks.
   Pure functions only, with no DOM and no Firebase, so
   tests/fixture-management.test.mjs can run them in node. The parseDate
   passed in is NL.parseDate; the browser passes the real one and the tests
   load it from nl-utils.

   WHY OUR RECORD AND NOT NLS (system/fixture-management-plan.md)
     The League decides dates and NLS publishes them later, then overwrites
     the kick-off and keeps one match ID, so a lost date leaves no trace
     there. This record keeps every lost date as an attempt. NLS stays the
     source for scores; the only result held here is who went through in an
     FA Cup or FA Trophy tie, which NLS does not carry.

   RECORD (app-data/ops-fixture-management/seasons/<season>/fixtures/<key>)
     key            Opta match ID ('g2660046') where one exists, else minted
                    once at entry and never changed. optaID is its own
                    nullable field, so adding one later orphans nothing.
     comp, round    'national' | 'north' | 'south' | 'nl-cup' | 'fa-cup' |
                    'fa-trophy'; round is the sheet's MD ('16', 'R2Q', 'QF').
     playoff        true for a play-off, which keeps its division's comp.
     home, away     { name, code } for clubs in clubs-meta / cup-clubs-meta,
                    { name } for anyone else. The name is the join for a
                    crest added later.
     date, ko       the current date ('YYYY-MM-DD') and UK kick-off
                    ('15:00'). date is null while a game awaits a new date.
     state          'scheduled' | 'postponed' | 'abandoned'. The last two
                    only while awaiting a date.
     original       { date, ko } as first published.
     attempts       every lost date, oldest first:
                    { date, ko, outcome: 'moved'|'postponed'|'abandoned',
                      reason, noticeAt, rescheduledAt, minute }
                    'moved' is a date changed with no gap in between (notice
                    and new date the same moment). The old tool's rule:
                    postponed and rescheduled are different events.
     broadcast      { availability, enhanced, daznMove, ami }.
                    availability is one of AVAILABILITY. Edited by hand,
                    never inferred (plan, Broadcast).
     wentThrough    'home' | 'away' | 'replay' | null, for FA Cup and FA
                    Trophy ties. 'replay' is a draw; the replay row decides.
     neutral, venue a game away from the home club's ground (a final at
                    Wembley): true + the venue name, else null. Attendance
                    keeps such crowds out of a club's home average.
     result         { h, a, aet: {h,a}|null, pens: {h,a}|null, source } or
                    null. h/a are the 90-minute score; aet the score after
                    extra time; pens the shoot-out. source is 'import',
                    'nls', 'paste' or 'manual'.
   ============================================================================= */
(function (root) {
  'use strict';

  var COMPS = [
    { key: 'national',  label: 'National',  sheet: ['national', 'national league'],             pill: 'nat', league: true },
    { key: 'north',     label: 'North',     sheet: ['north', 'national league north'],          pill: 'nor', league: true },
    { key: 'south',     label: 'South',     sheet: ['south', 'national league south'],          pill: 'sou', league: true },
    { key: 'nl-cup',    label: 'NL Cup',    sheet: ['nl cup', 'national league cup'],           pill: 'nlc' },
    { key: 'fa-cup',    label: 'FA Cup',    sheet: ['fa cup'],                                  pill: 'fac', fa: true },
    { key: 'fa-trophy', label: 'FA Trophy', sheet: ['fa trophy'],                               pill: 'fat', fa: true }
  ];
  /* Sheet labels for a play-off. The division is in the label, or (a bare
     'Playoffs') taken from the home club. */
  var PLAYOFF_SHEET = {
    'national playoffs': 'national', 'national play-offs': 'national',
    'north playoffs': 'north', 'north play-offs': 'north',
    'south playoffs': 'south', 'south play-offs': 'south',
    'playoffs': '', 'play-offs': '', 'play offs': ''
  };
  var DIVISION_KEY = { 'National': 'national', 'North': 'north', 'South': 'south' };
  var COMP_BY_KEY = {};
  var COMP_BY_SHEET = {};
  COMPS.forEach(function (c) {
    COMP_BY_KEY[c.key] = c;
    c.sheet.forEach(function (s) { COMP_BY_SHEET[s] = c; });
  });

  /* The six broadcast states (plan, Broadcast). Only worldwide and overseas
     are ever shown publicly. */
  var AVAILABILITY = [
    { key: 'worldwide',    label: 'Worldwide',    public: true },
    { key: 'overseas',     label: 'Overseas',     public: true },
    { key: 'unavailable',  label: 'Unavailable' },
    { key: 'tbc',          label: 'TBC' },
    { key: 'not-selected', label: 'Not selected' },
    { key: 'cup',          label: 'Cup' }
  ];
  /* DAZN's allocation of games moved at its request, per season (plan). */
  var DAZN_MOVES = 120;
  var AVAIL_BY_KEY = {};
  AVAILABILITY.forEach(function (a) { AVAIL_BY_KEY[a.key] = a; });

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ── Paste parsing ──────────────────────────────────────────────────────
     Excel copies a range as tab-separated text, quoting a cell only when it
     holds a tab, a newline or a quote. NL.csvParse is comma-only, so this is
     the tab twin. A second tool parsing a tab paste would make this a canon
     candidate: a delimiter option on NL.csvParse. */
  function parseTsv(text) {
    var src = String(text == null ? '' : text);
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
    var rows = [], row = [], cell = '', q = false, i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (q) {
        if (ch === '"') {
          if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell === '') { q = true; i++; continue; }
      if (ch === '\t') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
        if (ch === '\r' && src[i + 1] === '\n') i++;
        i++; continue;
      }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  /* Rows → objects keyed by normalised header. The header is the first row
     carrying every one of `need` — the Fixtures tab has a "Top / Today /
     Last updated" strip above its real header. */
  function table(text, need) {
    var rows = parseTsv(text);
    var at = -1;
    for (var r = 0; r < rows.length && r < 20; r++) {
      var hs = rows[r].map(norm);
      if (need.every(function (n) { return hs.indexOf(n) !== -1; })) { at = r; break; }
    }
    if (at === -1) return null;
    var head = rows[at].map(norm);
    return rows.slice(at + 1).map(function (cells) {
      var o = {};
      head.forEach(function (h, i) { if (h && !(h in o)) o[h] = cells[i] == null ? '' : String(cells[i]).trim(); });
      return o;
    });
  }

  /* ── Values ─────────────────────────────────────────────────────────── */
  function ymdOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hmOf(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* '3pm' '7.45pm' '12.30pm' '15:00' '19:45:00' → 'HH:MM'. */
  function parseKo(s) {
    var t = norm(s).replace(/\s/g, '');
    if (!t) return null;
    var m = t.match(/^(\d{1,2})(?:[.:](\d{2}))?(?::\d{2})?(am|pm)?$/);
    if (!m) return null;
    var h = +m[1], mi = +(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return pad(h) + ':' + pad(mi);
  }

  function blankish(s) {
    var t = norm(s);
    return !t || t === '#n/a' || t === 'n/a' || t === '-' || t === 'tbc';
  }

  function optaOf(s) {
    var t = String(s == null ? '' : s).trim();
    return /^g\d+$/i.test(t) ? t.toLowerCase() : null;
  }

  function availOf(s, comp) {
    var t = norm(s);
    if (t === 'worldwide') return 'worldwide';
    if (t === 'overseas') return 'overseas';
    if (t === 'unavailable') return 'unavailable';
    if (t === 'tbc') return 'tbc';
    if (t === 'not selected') return 'not-selected';
    if (t === 'cup') return 'cup';
    /* Imports bring every status in as the sheet has it (plan, Broadcast).
       The sheet logs nothing for FA ties, which are not ours to show, and
       every NL Cup game imports as Worldwide. */
    if (comp && comp.fa) return 'cup';
    if (comp && comp.key === 'nl-cup') return 'worldwide';
    return 'tbc';
  }

  /* The sheet's Result H/D/A for an FA tie: 'H Cup', 'A Cup', 'H pen Cup'.
     A draw ('D Cup') went to a replay, which is its own row: 'replay' says
     the tie is settled here and the result lives on that row. */
  function wentThroughOf(s) {
    var t = norm(s);
    if (/^h\b/.test(t)) return 'home';
    if (/^a\b/.test(t)) return 'away';
    if (/^d\b/.test(t)) return 'replay';
    return null;
  }

  /* ── Results ────────────────────────────────────────────────────────── */
  function num(s) {
    var t = String(s == null ? '' : s).trim();
    return /^\d+$/.test(t) ? +t : null;
  }

  /* The sheet's goal columns → result, or null when there is no score. */
  function resultOfRow(r, source) {
    var h = num(r['goals h']), a = num(r['goals a']);
    if (h == null || a == null) return null;
    var eh = num(r['goals aet h']), ea = num(r['goals aet a']);
    var ph = num(r['goals pens h']), pa = num(r['goals pens a']);
    return {
      h: h, a: a,
      aet: eh != null && ea != null ? { h: eh, a: ea } : null,
      pens: ph != null && pa != null ? { h: ph, a: pa } : null,
      source: source || 'import'
    };
  }

  /* '2-1', '3-3 (5-4 aet)', '0-0 (1-1 aet, 4-3 p)' — the sheet's own form. */
  function resultText(res) {
    if (!res) return '';
    var x = [];
    if (res.aet) x.push(res.aet.h + '-' + res.aet.a + ' aet');
    if (res.pens) x.push(res.pens.h + '-' + res.pens.a + ' p');
    return res.h + '-' + res.a + (x.length ? ' (' + x.join(', ') + ')' : '');
  }

  /* 'home' | 'away' | 'draw' | null. Penalties, then extra time, then 90. */
  function winnerOf(res) {
    if (!res) return null;
    if (res.pens && res.pens.h !== res.pens.a) return res.pens.h > res.pens.a ? 'home' : 'away';
    var f = res.aet || res;
    return f.h > f.a ? 'home' : f.a > f.h ? 'away' : 'draw';
  }

  function sameResult(x, y) {
    function k(r) { return r ? resultText(r) : ''; }
    return k(x) === k(y);
  }

  /* NLS keeps one score — the final one, after extra time — and the
     shoot-out. A held result agrees with it when its final score (after
     extra time if played, else full time) and penalties match. */
  function agreesWithNls(held, nls) {
    var f = held.aet || held;
    var p1 = held.pens ? held.pens.h + '-' + held.pens.a : '';
    var p2 = nls.pens ? nls.pens.h + '-' + nls.pens.a : '';
    return f.h === nls.h && f.a === nls.a && p1 === p2;
  }

  /* An FA tie's winner: from the score when it settles it, else the sheet's
     Result column. The column alone is wrong for replays decided in extra
     time — it records the 90 minutes ('D Cup' for a 5-4 aet win). */
  function faWinner(res, cell) {
    var w = winnerOf(res);
    if (w === 'home' || w === 'away') return w;
    if (w === 'draw') return 'replay';
    return wentThroughOf(cell);
  }

  /* Minted key for a fixture with no Opta ID. Made once and never remade,
     so the parts only have to be unique on the day it is minted. */
  function slug(s) { return norm(s).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function mintKey(comp, round, home, away) {
    return [comp, slug(round) || 'x', slug(home), slug(away)].join('-');
  }

  function pairKey(comp, home, away, playoff) { return comp + (playoff ? '+po' : '') + '|' + norm(home) + '|' + norm(away); }

  /* ── Build ──────────────────────────────────────────────────────────────
     opts:
       fixtures        Fixtures tab paste (text)
       rearrangements  Rearrangements tab paste (text), optional
       seed            assets/data/fixtures-2026-27.json, optional: the
                       league schedule as first published
       clubOf(name)    → { name, code } | null, member or guest club
       parseDate       NL.parseDate
       divisionOf(name) → 'National'|'North'|'South'|null, for a bare
                       'Playoffs' label
     → { fixtures: { key: record }, problems: [{ kind, text, key? }],
         counts } or { error } */
  function build(opts) {
    var parse = opts.parseDate;
    var clubOf = opts.clubOf || function () { return null; };
    var problems = [];
    function problem(kind, text, key) { problems.push({ kind: kind, text: text, key: key || null }); }

    function dateOf(s) {
      if (s == null || String(s).trim() === '') return null;
      var d = parse(String(s).trim());
      return d && !isNaN(d.getTime()) ? d : null;
    }
    /* A datetime cell's time only counts when it says one: a bare date
       parses to midnight, and midnight is no kick-off. */
    function koOfDateTime(s, d) {
      return d && /\d{1,2}:\d{2}/.test(String(s)) ? hmOf(d) : null;
    }
    function side(name, comp) {
      var c = clubOf(name);
      if (c) return { name: c.name, code: c.code || null };
      if (comp.league) problem('club', '"' + name + '" is not a League club (' + comp.label + ')');
      return { name: String(name).trim() };
    }

    var rows = table(opts.fixtures, ['date', 'competition', 'home team', 'away team']);
    if (!rows) return { error: 'No Fixtures header found. It needs Date, Competition, Home team and Away team.' };

    /* Original schedule, league only: division|home|away → { date, ko }. */
    var original = {};
    var seedRows = (opts.seed && opts.seed.fixtures) || [];
    seedRows.forEach(function (f) {
      var comp = COMP_BY_SHEET[norm(f[1])];
      var d = dateOf(f[0]);
      if (comp && d) original[pairKey(comp.key, f[2], f[3])] = { date: ymdOf(d), ko: parseKo(f[4]) };
    });

    /* Rearrangements: comp|home|away → lost dates, oldest first. */
    var lost = {};
    var rearr = opts.rearrangements
      ? table(opts.rearrangements, ['original date', 'competition', 'home team', 'away team'])
      : [];
    if (opts.rearrangements && !rearr) {
      return { error: 'No Rearrangements header found. It needs Original date, Competition, Home team and Away team.' };
    }
    rearr.forEach(function (r) {
      var comp = COMP_BY_SHEET[norm(r['competition'])];
      if (!comp) { problem('rearrangement', 'Unknown competition "' + r['competition'] + '" on a rearrangement'); return; }
      var od = dateOf(r['original date']);
      if (!od) { problem('rearrangement', 'Rearrangement with no original date: ' + r['home team'] + ' v ' + r['away team']); return; }
      var nd = dateOf(r['new date']);
      var notice = dateOf(r['time of postponement']);
      var resched = dateOf(r['date rescheduled']);
      var note = norm(r['postponement notice']);
      var ab = note.match(/^abandoned(?:\s*\((\d+)m\))?/);
      var outcome = ab || norm(r['reason']) === 'abandonment' ? 'abandoned'
        : (notice && resched && notice.getTime() === resched.getTime() ? 'moved' : 'postponed');
      var k = pairKey(comp.key, r['home team'], r['away team']);
      (lost[k] = lost[k] || []).push({
        date: ymdOf(od),
        ko: koOfDateTime(r['original date'], od),
        outcome: outcome,
        reason: String(r['reason'] || '').trim() || null,
        noticeAt: notice ? notice.toISOString() : null,
        rescheduledAt: resched ? resched.toISOString() : null,
        minute: ab && ab[1] ? +ab[1] : null,
        newDate: nd ? ymdOf(nd) : null,
        newKo: koOfDateTime(r['new date'], nd),
        used: false
      });
    });
    Object.keys(lost).forEach(function (k) { lost[k].sort(function (a, b) { return a.date < b.date ? -1 : 1; }); });

    var out = {};
    var byPair = {};
    rows.forEach(function (r, i) {
      var label = norm(r['competition']);
      var po = label in PLAYOFF_SHEET;
      var comp = po
        ? COMP_BY_KEY[PLAYOFF_SHEET[label] || DIVISION_KEY[(opts.divisionOf || function () { return null; })(r['home team'])] || 'national']
        : COMP_BY_SHEET[label];
      var line = 'Row ' + (i + 1) + ' (' + (r['home team'] || '?') + ' v ' + (r['away team'] || '?') + ')';
      if (!comp) { problem('row', line + ': unknown competition "' + r['competition'] + '"'); return; }
      if (!r['home team'] || !r['away team']) { problem('row', line + ': missing a team'); return; }
      var d = dateOf(r['date']);
      if (!d) { problem('row', line + ': unreadable date "' + r['date'] + '"'); return; }
      var ko = parseKo(r['time']) || koOfDateTime(r['date & time'], dateOf(r['date & time']));
      var stateCell = norm(r['match state']);
      var rec = {
        optaID: optaOf(r['optaid']),
        comp: comp.key,
        playoff: po || null,
        round: blankish(r['md']) ? null : String(r['md']).trim(),
        home: side(r['home team'], comp),
        away: side(r['away team'], comp),
        date: ymdOf(d),
        ko: ko,
        state: stateCell === 'postponed' ? 'postponed' : stateCell === 'abandoned' ? 'abandoned' : 'scheduled',
        original: null,
        attempts: [],
        broadcast: {
          availability: availOf(r['broadcast'], comp),
          enhanced: norm(r['production']) === 'enhanced',
          daznMove: norm(r['dazn'] || r['dazn pick']) === 'dazn',
          ami: norm(r['ami']) === 'ami'
        },
        result: resultOfRow(r, 'import'),
        wentThrough: null,
        source: 'import',
        sheetCrowd: num(r['attendance total'])
      };
      if (comp.fa) rec.wentThrough = faWinner(rec.result, r['result h/d/a']);
      if (comp.league && !rec.optaID) problem('opta', line + ': no Opta ID');
      var pk = pairKey(comp.key, rec.home.name, rec.away.name, po);
      (byPair[pk] = byPair[pk] || []).push(rec);
    });

    /* A workbook may keep a lost date as its own row (Match State
       'Postponed' or 'Abandoned') beside the row the game was played on —
       the 2025-26 sheet does, 212 times. Such a row is a lost date of the
       played game, folded in as an attempt, not a second fixture. */
    Object.keys(byPair).forEach(function (pk) {
      var recs = byPair[pk];
      if (recs.length < 2) return;
      var played = recs.filter(function (r) { return r.state === 'scheduled'; });
      if (played.length !== 1) return;
      var game = played[0];
      /* Before the played date, or after it: a game brought forward lost
         its later date (three in 2025-26, Worthing v Hampton among them). */
      var lostRows = recs.filter(function (r) { return r.state !== 'scheduled'; });
      if (!lostRows.length) return;
      lostRows.forEach(function (l) {
        game.attempts.push({ date: l.date, ko: l.ko, outcome: l.state, reason: null,
          noticeAt: null, rescheduledAt: null, minute: null });
        if (!game.optaID && l.optaID) game.optaID = l.optaID;
      });
      byPair[pk] = recs.filter(function (r) { return lostRows.indexOf(r) === -1; });
    });

    /* A league pairing meets once a season, so two rows for one pairing is
       a mistake in the sheet — but never guess which. The case seen
       (28/10/2026) is the return fixture entered the wrong way round, with
       the first game's Opta ID copied down: when the published schedule has
       the REVERSE pairing on that row's date, and the sheet has no row for
       the reverse, the row is turned round and its borrowed ID dropped.
       Anything else keeps both rows and says so. Merging them, as v1.0 did,
       lost a game and invented a postponement for one already played. */
    Object.keys(byPair).forEach(function (pk) {
      var recs = byPair[pk];
      if (recs.length < 2 || !COMP_BY_KEY[recs[0].comp].league || recs[0].playoff) return;
      recs.slice().forEach(function (rec) {
        var rk = pairKey(rec.comp, rec.away.name, rec.home.name, false);
        var seed = original[rk];
        if (byPair[rk] || !seed || seed.date !== rec.date || byPair[pk].length < 2) return;
        var label = COMP_BY_KEY[rec.comp].label;
        var tmp = rec.home; rec.home = rec.away; rec.away = tmp;
        if (rec.result) rec.result = { h: rec.result.a, a: rec.result.h, aet: null, pens: null, source: rec.result.source };
        var borrowed = rec.optaID && byPair[pk].some(function (o) { return o !== rec && o.optaID === rec.optaID; });
        if (borrowed) rec.optaID = null;
        byPair[pk] = byPair[pk].filter(function (o) { return o !== rec; });
        byPair[rk] = [rec];
        problem('reversed', label + ' ' + rec.away.name + ' v ' + rec.home.name + ' on ' + fmt(rec.date) +
          ': teams were the wrong way round; imported as ' + rec.home.name + ' v ' + rec.away.name +
          (borrowed ? ', without the Opta ID it had copied from the other game' : '') + '.');
      });
      if (byPair[pk].length > 1) {
        problem('duplicate', COMP_BY_KEY[recs[0].comp].label + ' ' + recs[0].home.name + ' v ' + recs[0].away.name +
          ': ' + byPair[pk].length + ' rows for one pairing; all kept. Check them.');
      }
    });

    Object.keys(byPair).forEach(function (pk) {
      var recs = byPair[pk].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var comp = COMP_BY_KEY[recs[0].comp];
      recs.forEach(function (rec) {
        var hist = rec.playoff ? [] : (lost[pk] || []).filter(function (a) { return !a.used; });
        /* Each lost date this fixture has passed through. For a cup pair
           that met twice, only the dates up to this row's date. */
        hist.forEach(function (a) {
          if (!comp.league && a.date > rec.date) return;
          a.used = true;
          if (!rec.attempts.some(function (x) { return x.date === a.date; })) {
            rec.attempts.push({ date: a.date, ko: a.ko, outcome: a.outcome, reason: a.reason,
              noticeAt: a.noticeAt, rescheduledAt: a.rescheduledAt, minute: a.minute });
          } else {
            rec.attempts.forEach(function (x) {
              if (x.date === a.date) { x.outcome = a.outcome; x.reason = a.reason; x.noticeAt = a.noticeAt; x.rescheduledAt = a.rescheduledAt; x.minute = a.minute; }
            });
          }
          /* The sheet row still sits on a date the Rearrangements tab says
             was lost and replaced: the tab is the later word. */
          if (a.date === rec.date && a.newDate && a.newDate !== rec.date) {
            problem('moved', comp.label + ' ' + rec.home.name + ' v ' + rec.away.name + ': Fixtures still showed ' +
              fmt(rec.date) + '; moved to ' + fmt(a.newDate) + ' from the Rearrangements tab.');
            rec.date = a.newDate;
            if (a.newKo) rec.ko = a.newKo;
            rec.state = 'scheduled';
          }
        });
        rec.attempts.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

        /* Postponed or abandoned on the date it sits on, with nothing after
           it: awaiting a new date, so the date comes off and the lost one
           goes into the history. */
        if (rec.state !== 'scheduled') {
          if (!rec.attempts.some(function (x) { return x.date === rec.date; })) {
            rec.attempts.push({ date: rec.date, ko: rec.ko, outcome: rec.state, reason: null,
              noticeAt: null, rescheduledAt: null, minute: null });
            problem('reason', comp.label + ' ' + rec.home.name + ' v ' + rec.away.name + ': ' + rec.state + ' on ' +
              fmt(rec.date) + ' with no Rearrangements row, so no reason.');
          }
          rec.date = null;
          rec.ko = null;
        }

        var seed = rec.playoff ? null : original[pk];
        var first = rec.attempts[0];
        rec.original = seed || (first ? { date: first.date, ko: first.ko } : { date: rec.date, ko: rec.ko });

        var key = rec.optaID || mintKey(rec.comp, rec.round, rec.home.name, rec.away.name);
        var n = 2, base = key;
        while (out[key]) key = base + '-' + (n++);
        rec.key = key;
        out[key] = rec;
      });
    });

    Object.keys(lost).forEach(function (k) {
      lost[k].forEach(function (a) {
        if (!a.used) problem('rearrangement', 'Rearrangement on ' + fmt(a.date) + ' matches no fixture: ' + k.split('|').slice(1).join(' v '));
      });
    });

    return { fixtures: out, problems: problems, counts: counts(out) };
  }

  /* ── Changing a record ──────────────────────────────────────────────────
     Each returns a new record; the caller saves it. `at` is an ISO stamp. */
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* Postpone or abandon: the date becomes a lost date and comes off the
     record, so the game leaves the public view until it has a new one. */
  function loseDate(rec, o) {
    var n = copy(rec);
    n.attempts = (n.attempts || []).concat([{
      date: rec.date, ko: rec.ko || null, outcome: o.outcome, reason: o.reason || null,
      noticeAt: o.at, rescheduledAt: null,
      minute: o.outcome === 'abandoned' && o.minute != null ? +o.minute : null
    }]);
    n.date = null;
    n.ko = null;
    n.state = o.outcome;
    n.result = null;
    return n;
  }

  /* A date for a game. Awaiting one: stamps when it was rescheduled.
     Already dated and changed: the old date is kept as 'moved'. */
  function setDate(rec, date, ko, at) {
    var n = copy(rec);
    n.attempts = n.attempts || [];
    if (!rec.date) {
      var last = n.attempts[n.attempts.length - 1];
      if (last && !last.rescheduledAt) last.rescheduledAt = at;
    } else if (rec.date !== date || (rec.ko || null) !== (ko || null)) {
      n.attempts.push({ date: rec.date, ko: rec.ko || null, outcome: 'moved', reason: null,
        noticeAt: at, rescheduledAt: at, minute: null });
    }
    /* A game shown, or moved at DAZN's request, keeps its status on a new
       date until someone confirms it still holds there. */
    var b = n.broadcast || {};
    var dateChanged = rec.date ? (rec.date !== date || (rec.ko || null) !== (ko || null)) : true;
    if (dateChanged && (b.availability === 'worldwide' || b.availability === 'overseas' || b.daznMove)) {
      n.broadcast = copy(b);
      n.broadcast.review = true;
    }
    n.date = date;
    n.ko = ko || null;
    n.state = 'scheduled';
    return n;
  }

  /* A lost date entered by mistake. Corrected in place, not logged — the
     old tool's rule for a mis-keyed record. Removing the last one of a game
     awaiting a date gives it back that date. */
  function dropAttempt(rec, i) {
    var n = copy(rec);
    var gone = (n.attempts || []).splice(i, 1)[0];
    if (gone && !n.date && i === n.attempts.length) {
      n.date = gone.date; n.ko = gone.ko; n.state = 'scheduled';
    }
    return n;
  }

  /* ── NLS ────────────────────────────────────────────────────────────────
     Shape from a live call to /v2/matches/?seasonID=2026&competitionID=1275
     on 28/10/2026: data[].id 'g2678400'; attributes.kickOffDateUTC
     '2026-08-18 18:00:00' (UTC, no zone marker); matchPeriod 'FullTime';
     resultType 'NormalResult' | 'PenaltyShootout' | null;
     homeTeam/awayTeam { teamID 't3360', name, score, penaltyScore }.
     teamID is clubs-meta optaID for every member club. NLS gives no
     extra-time split, so an NLS result never carries one. */
  var NLS_COMP = { 89: 'national', 373: 'north', 372: 'south', 1275: 'nl-cup' };
  var NLS_DONE = { fulltime: true, postmatch: true };

  /* Every NLS match, played or not — an unplayed one still has the Opta
     ID to fill. `result` is set only once the match is finished. */
  function nlsResults(rows) {
    var out = [];
    (rows || []).forEach(function (m) {
      var a = m && m.attributes;
      if (!a || !a.homeTeam || !a.awayTeam) return;
      var h = a.homeTeam.score, w = a.awayTeam.score;
      var done = NLS_DONE[norm(a.matchPeriod)] && h != null && w != null;
      var t = Date.parse(String(a.kickOffDateUTC || '').replace(' ', 'T') + 'Z');
      var ph = a.homeTeam.penaltyScore, pw = a.awayTeam.penaltyScore;
      out.push({
        id: String(m.id), comp: NLS_COMP[a.competitionID] || null,
        utc: isNaN(t) ? null : t,
        homeID: a.homeTeam.teamID, awayID: a.awayTeam.teamID,
        homeName: a.homeTeam.name, awayName: a.awayTeam.name,
        result: done ? { h: +h, a: +w, aet: null,
          pens: ph != null && pw != null ? { h: +ph, a: +pw } : null, source: 'nls' } : null
      });
    });
    return out;
  }

  /* Pair NLS results with records: by Opta ID, else by competition, home
     club and London date — a club plays once a day. ymdOfUtc turns the
     UTC stamp into the London date; nameOfTeam(teamID) → our club name.
     → [{ key, nls, optaID (to fill, or null), result, current, differs }] */
  function matchNls(fixtures, results, ymdOfUtc, nameOfTeam) {
    var byOpta = {}, byDay = {};
    Object.keys(fixtures).forEach(function (k) {
      var r = fixtures[k];
      if (r.optaID) byOpta[r.optaID] = r;
      if (r.date) byDay[r.comp + '|' + r.date + '|' + norm(r.home.name)] = r;
    });
    var out = [];
    results.forEach(function (n) {
      var rec = byOpta[n.id];
      var fill = null;
      if (!rec && n.utc != null) {
        var home = nameOfTeam(n.homeID) || n.homeName;
        rec = byDay[n.comp + '|' + ymdOfUtc(n.utc) + '|' + norm(home)];
        if (rec && !rec.optaID) fill = n.id;
        else if (rec && rec.optaID !== n.id) rec = null;
      }
      if (!rec || (!n.result && !fill)) return;
      out.push({ key: rec.key, nls: n.id, optaID: fill, result: n.result, current: rec.result || null,
        differs: !!n.result && !!rec.result && !agreesWithNls(rec.result, n.result) });
    });
    return out;
  }

  /* '2-1', '1-1 (4-5 p)', '3-3 (5-4 aet)', '0-0 (1-1 aet, 4-3 p)' → result. */
  var SCORE = /^(\d+)\s*-\s*(\d+)(?:\s*\(\s*(?:(\d+)\s*-\s*(\d+)\s*aet)?\s*,?\s*(?:(\d+)\s*-\s*(\d+)\s*p)?\s*\))?$/i;
  function parseScore(s, source) {
    var m = String(s == null ? '' : s).trim().match(SCORE);
    if (!m) return null;
    return { h: +m[1], a: +m[2],
      aet: m[3] != null ? { h: +m[3], a: +m[4] } : null,
      pens: m[5] != null ? { h: +m[5], a: +m[6] } : null,
      source: source || 'paste' };
  }

  /* Results pasted a day at a time, in whatever columns the sheet shows:
     any row with a score cell, the club either side of it, and a date
     anywhere on the row if there is one. A row from the Fixtures tab
     works, and so does "Home <tab> 2-1 <tab> Away".
     → { matches: [{ key, result, current, differs }], unmatched: [text] } */
  function resultsFromPaste(fixtures, text, parseDate) {
    var byPair = {};
    Object.keys(fixtures).forEach(function (k) {
      var r = fixtures[k];
      (byPair[norm(r.home.name) + '|' + norm(r.away.name)] = byPair[norm(r.home.name) + '|' + norm(r.away.name)] || []).push(r);
    });
    var matches = [], unmatched = [];
    parseTsv(text).forEach(function (cells) {
      var c = cells.map(function (x) { return String(x).trim(); });
      var at = -1, res = null;
      for (var i = 1; i < c.length - 1 && !res; i++) { res = parseScore(c[i]); if (res) at = i; }
      if (!res) return;
      var h = null, w = null, j;
      for (j = at - 1; j >= 0 && !h; j--) if (c[j]) h = c[j];
      for (j = at + 1; j < c.length && !w; j++) if (c[j]) w = c[j];
      var day = null;
      for (j = 0; j < c.length && !day; j++) {
        if (!/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(c[j])) continue;
        var d = parseDate(c[j].split(' ')[0]);
        if (d && !isNaN(d.getTime())) day = ymdOf(d);
      }
      var cands = (byPair[norm(h) + '|' + norm(w)] || []).filter(function (r) { return !day || r.date === day; });
      if (cands.length !== 1) { unmatched.push(c.filter(Boolean).join(' · ')); return; }
      var rec = cands[0];
      matches.push({ key: rec.key, result: res, current: rec.result || null,
        differs: !!rec.result && !sameResult(rec.result, res) });
    });
    return { matches: matches, unmatched: unmatched };
  }

  /* ── Attendance ─────────────────────────────────────────────────────────
     A past season from the Attendance tool's archive
     (app-data/ops-attendance/archive/<season>/fixtures/<matchID>). Its
     records come in two kinds, by gas/FixtureSync.js and by hand:
       NLS copy   matchID 'g2578817', kickoffUTC '2025-08-09 14:00:00' (UTC),
                  competitionKey nl|north|south|nl-cup, homeTeamID 't3360',
                  homeScore/awayScore, matchPeriod, postponementReason
       by hand    matchID 'manual_fa-cup_20251101_…', kickoffUTC
                  '2025-11-01T15:00:00' — typed as UK time, despite the name
     Both may carry isNeutral + venueName. The matchID stays the record's
     key, because the club-submitted crowds are filed under it.
     o: { clubByOpta(teamID), clubOf(name) → {name, code}|null,
          london(utcMs) → { date, ko } }
     → { fixtures, problems } */
  var ATT_COMP = { nl: 'national', north: 'north', south: 'south', 'nl-cup': 'nl-cup', 'fa-cup': 'fa-cup', 'fa-trophy': 'fa-trophy' };

  function fromAttendance(att, o) {
    var out = {}, problems = [];
    var rows = Object.keys(att || {}).map(function (id) { return { id: id, f: att[id] || {} }; });
    rows.forEach(function (x) {
      var f = x.f, comp = COMP_BY_KEY[ATT_COMP[f.competitionKey]];
      if (!comp) { problems.push({ kind: 'row', text: x.id + ': unknown competition "' + f.competitionKey + '"' }); return; }
      var when = null, raw = String(f.kickoffUTC || '');
      var local = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (local && raw.indexOf('Z') === -1) when = { date: local[1], ko: local[2] };
      else {
        var t = Date.parse(raw.replace(' ', 'T') + (/[Z+]/.test(raw) ? '' : 'Z'));
        if (!isNaN(t)) when = o.london(t);
      }
      if (!when) { problems.push({ kind: 'row', text: x.id + ': no kick-off' }); return; }
      function side(id, name) {
        var c = (id && o.clubByOpta(id)) || o.clubOf(name);
        if (c) return { name: c.name, code: c.code || null };
        if (comp.league) problems.push({ kind: 'club', text: '"' + name + '" is not a League club (' + comp.label + ')' });
        return { name: String(name || '?').trim() };
      }
      var h = f.homeScore, a = f.awayScore;
      var result = h != null && a != null && h !== '' && a !== ''
        ? { h: +h, a: +a, aet: null, pens: null, source: 'attendance' } : null;
      var period = norm(f.matchPeriod);
      var rec = {
        key: x.id,
        optaID: /^g\d+$/.test(x.id) ? x.id : null,
        comp: comp.key,
        playoff: null,
        round: null,
        home: side(f.homeTeamID, f.homeTeamName),
        away: side(f.awayTeamID, f.awayTeamName),
        date: when.date, ko: when.ko,
        state: 'scheduled',
        original: { date: when.date, ko: when.ko },
        attempts: [],
        broadcast: { availability: null, enhanced: false, daznMove: false, ami: false },
        result: result,
        wentThrough: comp.fa ? faWinner(result, null) : null,
        neutral: f.isNeutral ? true : null,
        venue: f.isNeutral && f.venueName ? String(f.venueName) : null,
        source: 'attendance'
      };
      if (!result && (period === 'postponed' || period === 'abandoned')) {
        rec.attempts.push({ date: when.date, ko: when.ko, outcome: period, reason: f.postponementReason || null,
          noticeAt: null, rescheduledAt: null, minute: null });
        rec.date = null; rec.ko = null; rec.state = period;
      }
      out[x.id] = rec;
    });

    /* Play-offs arrive in NLS under the league's own competition. A league
       game is a play-off when either club had already played its whole
       league season (2 × (clubs − 1) games) before it kicked off. */
    ['national', 'north', 'south'].forEach(function (ck) {
      var games = Object.keys(out).map(function (k) { return out[k]; })
        .filter(function (r) { return r.comp === ck && r.date; }).sort(compare);
      var clubs = {};
      games.forEach(function (r) { clubs[r.home.name] = 0; clubs[r.away.name] = 0; });
      var full = 2 * (Object.keys(clubs).length - 1);
      games.forEach(function (r) {
        if (clubs[r.home.name] >= full || clubs[r.away.name] >= full) { r.playoff = true; return; }
        clubs[r.home.name]++; clubs[r.away.name]++;
      });
    });
    return { fixtures: out, problems: problems };
  }

  /* Key a past season's workbook records to the Attendance archive, whose
     match IDs the club-submitted crowds are filed under. A record takes the
     ID of the archived game with the same date and clubs (names compared
     loosely: '&' and 'and', case, spacing), else the same date and home
     club. NLS games' IDs are Opta IDs, so a league or NL Cup record also
     gains its optaID. An FA tie added by hand in Attendance has an ID made
     from competition, date and clubs (attendance/index.html,
     buildSyntheticCupMatchID); one with no archived match takes that ID,
     so it still meets its crowd if one was filed under it.
     → { fixtures (re-keyed), matched, formula, unmatched: [record] } */
  function attSlug(name) {
    return String(name).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').substring(0, 20);
  }
  function loose(s) { return norm(s).replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ''); }

  function keyToAttendance(fixtures, archive) {
    var byDay = {}, byHome = {};
    Object.keys(archive || {}).forEach(function (id) {
      var f = archive[id] || {};
      /* Both kinds of kickoffUTC start with the date: the NLS copy's is UTC,
         a hand-added tie's UK time. They differ only after 23:00 UK, when no
         fixture kicks off, so the first ten characters are the London date. */
      var day = /^\d{4}-\d{2}-\d{2}/.test(String(f.kickoffUTC || '')) ? String(f.kickoffUTC).slice(0, 10) : null;
      if (!day) return;
      var k = day + '|' + loose(f.homeTeamName) + '|' + loose(f.awayTeamName);
      (byDay[k] = byDay[k] || []).push(id);
      var h = day + '|' + loose(f.homeTeamName);
      (byHome[h] = byHome[h] || []).push(id);
    });
    var out = {}, matched = 0, formula = 0, unmatched = [], taken = {};
    Object.keys(fixtures).forEach(function (k) {
      var r = fixtures[k];
      var ids = r.date ? (byDay[r.date + '|' + loose(r.home.name) + '|' + loose(r.away.name)] ||
        byHome[r.date + '|' + loose(r.home.name)] || []) : [];
      ids = ids.filter(function (id) { return !taken[id]; });
      var n = copy(r);
      if (ids.length === 1) {
        n.key = ids[0]; taken[ids[0]] = true; matched++;
        if (/^g\d+$/.test(ids[0])) n.optaID = ids[0];
      } else if (COMP_BY_KEY[r.comp].fa && r.date) {
        n.key = 'manual_' + r.comp + '_' + r.date.replace(/-/g, '') + '_' + attSlug(r.home.name) + '_v_' + attSlug(r.away.name);
        formula++;
      } else {
        unmatched.push(r);
      }
      var key = n.key, i = 2;
      while (out[key]) key = n.key + '-' + (i++);
      n.key = key;
      out[key] = n;
    });
    return { fixtures: out, matched: matched, formula: formula, unmatched: unmatched };
  }

  /* ── Order ──────────────────────────────────────────────────────────────
     A day reads by competition (National, North, South, then the cups),
     then kick-off, then home club. */
  var COMP_ORDER = {};
  COMPS.forEach(function (c, i) { COMP_ORDER[c.key] = i; });
  function compare(a, b) {
    if ((a.date || '') !== (b.date || '')) return (a.date || '') < (b.date || '') ? -1 : 1;
    var c = (COMP_ORDER[a.comp] || 0) - (COMP_ORDER[b.comp] || 0);
    if (c) return c;
    if (!!a.playoff !== !!b.playoff) return a.playoff ? 1 : -1;
    if ((a.ko || '') !== (b.ko || '')) return (a.ko || '') < (b.ko || '') ? -1 : 1;
    return a.home.name.localeCompare(b.home.name);
  }

  function fmt(ymd) {
    if (!ymd) return '—';
    var p = ymd.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /* ── Derived ──────────────────────────────────────────────────────────── */
  function awaiting(rec) { return !rec.date; }

  /* An FA tie whose date has passed with no "who went through". It holds
     a soft flag on the club's next round until it is filled (plan). */
  function cupResultDue(rec, todayYmd) {
    var c = COMP_BY_KEY[rec.comp];
    return !!(c && c.fa && rec.date && rec.date < todayYmd && !rec.wentThrough);
  }

  function counts(fixtures, todayYmd) {
    var t = todayYmd || '9999-12-31';
    var o = { total: 0, awaiting: 0, noOpta: 0, cupDue: 0, playoffs: 0, byComp: {} };
    Object.keys(fixtures).forEach(function (k) {
      var r = fixtures[k];
      o.total++;
      o.byComp[r.comp] = (o.byComp[r.comp] || 0) + 1;
      if (r.playoff) o.playoffs++;
      if (awaiting(r)) o.awaiting++;
      if (!r.optaID && r.comp !== 'fa-cup' && r.comp !== 'fa-trophy') o.noOpta++;
      if (cupResultDue(r, t)) o.cupDue++;
    });
    return o;
  }

  /* The public projection, written beside the record so the rules can open
     it to every signed-in user and keep the rest staff-only. A game
     awaiting a date is absent, and only a public broadcast label shows. */
  function publicView(rec) {
    if (awaiting(rec)) return null;
    var a = AVAIL_BY_KEY[rec.broadcast && rec.broadcast.availability];
    return {
      comp: rec.comp,
      playoff: rec.playoff || null,
      round: rec.round || null,
      date: rec.date,
      ko: rec.ko || null,
      home: rec.home,
      away: rec.away,
      optaID: rec.optaID || null,
      broadcast: a && a.public ? a.key : null,
      result: rec.result ? resultText(rec.result) : null,
      score: rec.result ? { h: (rec.result.aet || rec.result).h, a: (rec.result.aet || rec.result).a } : null,
      neutral: rec.neutral || null,
      venue: rec.neutral ? (rec.venue || null) : null
    };
  }

  root.FixturesCore = {
    COMPS: COMPS,
    COMP_BY_KEY: COMP_BY_KEY,
    AVAILABILITY: AVAILABILITY,
    AVAIL_BY_KEY: AVAIL_BY_KEY,
    DAZN_MOVES: DAZN_MOVES,
    parseTsv: parseTsv,
    parseKo: parseKo,
    mintKey: mintKey,
    build: build,
    counts: counts,
    awaiting: awaiting,
    cupResultDue: cupResultDue,
    publicView: publicView,
    resultOfRow: resultOfRow,
    resultText: resultText,
    winnerOf: winnerOf,
    faWinner: faWinner,
    sameResult: sameResult,
    agreesWithNls: agreesWithNls,
    loseDate: loseDate,
    setDate: setDate,
    dropAttempt: dropAttempt,
    nlsResults: nlsResults,
    matchNls: matchNls,
    compare: compare,
    fromAttendance: fromAttendance,
    keyToAttendance: keyToAttendance,
    parseScore: parseScore,
    resultsFromPaste: resultsFromPaste,
    table: table,
    fmt: fmt,
    ymdOf: ymdOf
  };
})(typeof window !== 'undefined' ? window : this);
