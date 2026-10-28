/* =============================================================================
   NL Tools — Fixture Management: data layer
   File: /fixtures/_core.js
   Version: v1.0 (28/10/2026)
   CHANGELOG
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
                    'fa-trophy' | 'playoffs'; round is the sheet's MD ('16',
                    'R2Q', 'QF').
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
     score          optional, as typed ('2-4'), for those same ties.
   ============================================================================= */
(function (root) {
  'use strict';

  var COMPS = [
    { key: 'national',  label: 'National',  sheet: ['national', 'national league'],             pill: 'nat', league: true },
    { key: 'north',     label: 'North',     sheet: ['north', 'national league north'],          pill: 'nor', league: true },
    { key: 'south',     label: 'South',     sheet: ['south', 'national league south'],          pill: 'sou', league: true },
    { key: 'nl-cup',    label: 'NL Cup',    sheet: ['nl cup', 'national league cup'],           pill: 'nlc' },
    { key: 'fa-cup',    label: 'FA Cup',    sheet: ['fa cup'],                                  pill: 'fac', fa: true },
    { key: 'fa-trophy', label: 'FA Trophy', sheet: ['fa trophy'],                               pill: 'fat', fa: true },
    { key: 'playoffs',  label: 'Play-offs', sheet: ['playoffs', 'play-offs', 'play offs'],      pill: null }
  ];
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

  /* Minted key for a fixture with no Opta ID. Made once and never remade,
     so the parts only have to be unique on the day it is minted. */
  function slug(s) { return norm(s).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function mintKey(comp, round, home, away) {
    return [comp, slug(round) || 'x', slug(home), slug(away)].join('-');
  }

  function pairKey(comp, home, away) { return comp + '|' + norm(home) + '|' + norm(away); }

  /* ── Build ──────────────────────────────────────────────────────────────
     opts:
       fixtures        Fixtures tab paste (text)
       rearrangements  Rearrangements tab paste (text), optional
       seed            assets/data/fixtures-2026-27.json, optional: the
                       league schedule as first published
       clubOf(name)    → { name, code } | null, member or guest club
       parseDate       NL.parseDate
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
      var comp = COMP_BY_SHEET[norm(r['competition'])];
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
          daznMove: norm(r['dazn']) === 'dazn',
          ami: norm(r['ami']) === 'ami'
        },
        wentThrough: comp.fa ? wentThroughOf(r['result h/d/a']) : null,
        score: comp.fa && wentThroughOf(r['result h/d/a']) && /^\d+\s*-\s*\d+$/.test(r['score'] || '')
          ? String(r['score']).replace(/\s/g, '') : null,
        source: 'import'
      };
      if (comp.league && !rec.optaID) problem('opta', line + ': no Opta ID');
      var pk = pairKey(comp.key, rec.home.name, rec.away.name);
      (byPair[pk] = byPair[pk] || []).push(rec);
    });

    Object.keys(byPair).forEach(function (pk) {
      var recs = byPair[pk].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var comp = COMP_BY_KEY[recs[0].comp];
      /* League pairs meet once a season, so two rows are one fixture seen
         twice — an earlier attempt the sheet kept as its own row. Cup pairs
         can meet twice (a replay is a new fixture), so they are left alone. */
      if (comp.league && recs.length > 1) {
        var keep = recs[recs.length - 1];
        recs.slice(0, -1).forEach(function (old) {
          keep.attempts.push({ date: old.date, ko: old.ko, outcome: old.state === 'scheduled' ? 'postponed' : old.state,
            reason: null, noticeAt: null, rescheduledAt: null, minute: null });
          if (!keep.optaID) keep.optaID = old.optaID;
          problem('duplicate', comp.label + ' ' + keep.home.name + ' v ' + keep.away.name +
            ': two rows; ' + fmt(old.date) + ' kept as a lost date, ' + fmt(keep.date) + ' as current. Check it.');
        });
        recs = [keep];
      }
      recs.forEach(function (rec) {
        var hist = (lost[pk] || []).filter(function (a) { return !a.used; });
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

        var seed = original[pk];
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
    var o = { total: 0, awaiting: 0, noOpta: 0, cupDue: 0, byComp: {} };
    Object.keys(fixtures).forEach(function (k) {
      var r = fixtures[k];
      o.total++;
      o.byComp[r.comp] = (o.byComp[r.comp] || 0) + 1;
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
      round: rec.round || null,
      date: rec.date,
      ko: rec.ko || null,
      home: rec.home,
      away: rec.away,
      optaID: rec.optaID || null,
      broadcast: a && a.public ? a.key : null
    };
  }

  root.FixturesCore = {
    COMPS: COMPS,
    COMP_BY_KEY: COMP_BY_KEY,
    AVAILABILITY: AVAILABILITY,
    AVAIL_BY_KEY: AVAIL_BY_KEY,
    parseTsv: parseTsv,
    parseKo: parseKo,
    mintKey: mintKey,
    build: build,
    counts: counts,
    awaiting: awaiting,
    cupResultDue: cupResultDue,
    publicView: publicView,
    fmt: fmt,
    ymdOf: ymdOf
  };
})(typeof window !== 'undefined' ? window : this);
