/* =============================================================================
   NL Tools — Fixture Management: the rearrangement date finder
   File: /fixtures/_finder.js
   Version: v1.4 (28/10/2026)
   CHANGELOG
     v1.4 (28/10/2026) — Every flag carries a category (flag.cat, CATS) so
       the page can group them under headings. A within-48h or pencilled
       flag lists the games behind it, with kick-off.
     v1.3 (28/10/2026) — From the ops team's rules: a game two days either
       side is "within 48h"; two away games in a row each over 200 miles
       round trip are flagged (fixed; opts.longTrip is for tests); international
       windows (calendar.internationalWindows) are flagged. Friday and
       Sunday join Monday and Thursday as switches. A run flag lists its
       games (flag.items) so the reader sees how far apart they are.
     v1.2 (28/10/2026) — Wednesday is a slot as well as Tuesday, and Monday
       joins Thursday behind a switch (Richard, 28/10/2026). Every slot's
       window is the day either side.
     v1.1 (28/10/2026) — The 35-day window runs both ways from the original
       date, so a game postponed well ahead can be brought forward (Richard,
       28/10/2026). Flags name clubs by code and say less.
     v1.0 (28/10/2026) — First build. Every rule is the one settled in
       system/fixture-management-plan.md, "Rearrangements and the date
       finder"; this file says how, the plan says why.
   Pure functions only, with no DOM and no Firebase, so
   tests/fixture-finder.test.mjs can run them in node.

   INPUT
     game      the fixture being rearranged (fixtures/_core.js record)
     ctx       { fixtures   every record of the season, keyed,
                 calendar   assets/data/calendar-2026-27.json,
                 rounds     assets/data/rounds-2026-27.json,
                 distances  assets/data/club-distances.json,
                 today      'YYYY-MM-DD' }
     opts      { mondays, thursdays, fridays, sundays: bool,
                 longTrip: round-trip miles, default 200 (tests only; the
                 page uses the default, Richard 28/10/2026) }
   OUTPUT
     { slots: [{ date, day, ko, within35, flags: [{ level, cat, text, items? }], weight }],
     items: [{ date, text }], the games behind a flag. cat is a key of CATS.
       from, to, original }
     level 'red' | 'amber' | 'info'. Slots within 35 days of the original
     date, before or after it, come first; then cleanest first (fewest and
     mildest flags), then by date. Also windowFrom/windowTo, the 35-day
     window's ends.

   WHAT A SLOT IS
     A Saturday, Tuesday or Wednesday, with Monday, Thursday, Friday and
     Sunday each behind a switch. A slot is taken out only when it cannot be played: either
     club already has a game the day before, the day itself or the day
     after (its window), it is on or after the final matchday, or it is in
     calendar.noRearrange.
     Everything else is a flag, never a block.
   ============================================================================= */
(function (root) {
  'use strict';

  var DAY = 864e5;
  /* Flag categories, in the order the page shows them. */
  var CATS = [
    { key: 'run', label: 'Consecutive games' },
    { key: 'proximity', label: 'Match proximity' },
    { key: 'cup', label: 'Cup rounds' },
    { key: 'international', label: 'International window' },
    { key: 'broadcast', label: 'Broadcast' },
    { key: 'pencil', label: 'Pencilled' },
    { key: 'day', label: 'Day' }
  ];
  var WINDOW = 35;
  var LONG_TRIP = 200;   /* round-trip miles: ops team's suggested limit */
  var DIVISION_LABEL = { national: 'National', north: 'North', south: 'South' };
  var LEAGUE = { national: true, north: true, south: true };

  function t(ymd) { return Date.parse(ymd + 'T12:00:00Z'); }
  function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function add(d, n) { return ymd(t(d) + n * DAY); }
  function dow(d) { return new Date(t(d)).getUTCDay(); }
  function gap(a, b) { return Math.round(Math.abs(t(a) - t(b)) / DAY); }

  /* A slot's window: the days a game on them would clash with. */
  function windowOf(d) { return [add(d, -1), d, add(d, 1)]; }

  function nameOf(side) { return side && side.name; }
  /* One game in a flag's list, from a club's side: 'Gillingham (A) · 15:00'. */
  function gameItem(r, club) {
    var home = nameOf(r.home) === club;
    return { date: r.date, text: nameOf(home ? r.away : r.home) + ' (' + (home ? 'H' : 'A') + ')' + (r.ko ? ' · ' + r.ko : '') };
  }
  /* A club in a flag: its code, which is short, or its name. */
  function tag(side) { return (side && (side.code || side.name)) || '?'; }
  function plays(r, club) { return nameOf(r.home) === club || nameOf(r.away) === club; }

  /* A club's division, from any league game of its season. */
  function divisionOf(fixtures, club) {
    var keys = Object.keys(fixtures);
    for (var i = 0; i < keys.length; i++) {
      var r = fixtures[keys[i]];
      if (LEAGUE[r.comp] && plays(r, club)) return r.comp;
    }
    return null;
  }

  /* Who won: FA ties by wentThrough, otherwise the score (penalties, then
     extra time, then 90). null while undecided. */
  function winnerSide(r) {
    if (r.wentThrough === 'home' || r.wentThrough === 'away') return r.wentThrough;
    var res = r.result;
    if (!res) return null;
    if (res.pens && res.pens.h !== res.pens.a) return res.pens.h > res.pens.a ? 'home' : 'away';
    var f = res.aet || res;
    return f.h > f.a ? 'home' : f.a > f.h ? 'away' : null;
  }

  /* Is a club possibly still in a cup round? 'out' once beaten in an
     earlier knockout tie; 'n/a' before its division enters (FA) or when it
     never entered (NL Cup); otherwise 'possible'. An NL Cup group game
     beats nobody out: the top two of each group go through. */
  function cupStatus(ctx, club, comp, round, roundDate) {
    var cal = ctx.calendar, fx = ctx.fixtures;
    var ties = Object.keys(fx).map(function (k) { return fx[k]; })
      .filter(function (r) { return r.comp === comp && plays(r, club); });
    if (comp === 'nl-cup') {
      if (!ties.length) return 'n/a';
    } else {
      var div = divisionOf(fx, club);
      var order = cal.cups.filter(function (c) { return c.comp === comp; }).map(function (c) { return c.round; });
      var entry = cal.entry && cal.entry[comp] && div ? cal.entry[comp][div] : null;
      if (entry && order.indexOf(round) < order.indexOf(entry)) return 'n/a';
    }
    /* A knockout round already drawn without this club: it is out (or
       never got that far). */
    var drawn = Object.keys(fx).some(function (k) { return fx[k].comp === comp && fx[k].round === round; });
    var inIt = ties.some(function (r) { return r.round === round; });
    if (drawn && !inIt && !(comp === 'nl-cup' && !/^(QF|SF|F)$/.test(round))) return 'out';
    for (var i = 0; i < ties.length; i++) {
      var r = ties[i];
      if (!r.date || r.date >= roundDate) continue;
      if (comp === 'nl-cup' && !/^(QF|SF|F)$/.test(r.round || '')) continue;
      var w = winnerSide(r);
      if (!w) continue;
      var mine = nameOf(r.home) === club ? 'home' : 'away';
      if (w !== mine) return 'out';
    }
    return 'possible';
  }

  function decided(fx, club, comp, round) {
    return Object.keys(fx).some(function (k) {
      var r = fx[k];
      return r.comp === comp && r.round === round && plays(r, club) && !!winnerSide(r);
    });
  }

  /* A division's league matchday covering a date, from rounds-2026-27. */
  function matchdayOn(rounds, comp, d) {
    var list = (rounds && rounds[DIVISION_LABEL[comp]]) || [];
    for (var i = 0; i < list.length; i++) if (d >= list[i].from && d <= list[i].to) return list[i];
    return null;
  }

  function blocked(cal, d) {
    var b = cal.blockedHours;
    return !!b && dow(d) === 6 && d >= b.from && d <= b.to && (b.exempt || []).indexOf(d) === -1;
  }

  /* Does a kick-off on a blocked Saturday overlap the blocked hours? A
     game is taken as 110 minutes, half-time included, so 12:30 and 17:30
     pass and 15:00 does not. Extra time on a 12:30 cup tie could still
     overlap; noted in the plan, not built for. */
  var GAME_MINUTES = 110;
  function mins(hhmm) { var p = String(hhmm || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function overlapsBlocked(cal, d, ko) {
    if (!ko || !blocked(cal, d)) return false;
    var b = cal.blockedHours, k = mins(ko);
    return k < mins(b.end || '17:15') && k + GAME_MINUTES > mins(b.start || '14:45');
  }
  /* Shown in the UK: Article 48 applies to these, not to overseas-only. */
  function ukShown(rec) {
    var b = (rec && rec.broadcast) || {};
    return b.availability === 'worldwide' || !!b.daznMove;
  }

  function slots(game, ctx, opts) {
    opts = opts || {};
    var cal = ctx.calendar, fx = ctx.fixtures;
    var home = nameOf(game.home), away = nameOf(game.away);
    var tags = {}; tags[home] = tag(game.home); tags[away] = tag(game.away);
    var original = (game.original && game.original.date) ||
      (game.attempts && game.attempts.length ? game.attempts[0].date : game.date);

    /* Every other dated game of either club, and every other pencil. */
    var dated = [], pencils = [];
    Object.keys(fx).forEach(function (k) {
      var r = fx[k];
      if (k === game.key) return;
      if (!(plays(r, home) || plays(r, away))) return;
      if (r.date) dated.push(r);
      if (r.pencil && r.pencil.date) pencils.push(r);
    });

    /* The last usable day: the midweek before the final matchday — every
       league game must be played before it (plan). */
    var final = cal.finalMatchday;
    var to = add(final, -1);
    var from = add(ctx.today, 1);
    var no = {};
    (cal.noRearrange || []).forEach(function (x) { no[x.date] = x.why; });

    var out = [];
    for (var d = from; d <= to; d = add(d, 1)) {
      var w = dow(d);
      var day = w === 6 ? 'Sat' : w === 2 ? 'Tue' : w === 3 ? 'Wed' :
        (w === 1 && opts.mondays) ? 'Mon' : (w === 4 && opts.thursdays) ? 'Thu' :
        (w === 5 && opts.fridays) ? 'Fri' : (w === 0 && opts.sundays) ? 'Sun' : null;
      if (!day || no[d]) continue;
      var win = windowOf(d);
      var clash = dated.some(function (r) { return win.indexOf(r.date) !== -1; });
      if (clash) continue;

      var flags = [];
      var tooClose = false;
      [home, away].forEach(function (club) {
        var mine = dated.filter(function (r) { return plays(r, club); });
        var nearest = mine.reduce(function (m, r) { var g = gap(r.date, d); return g < m ? g : m; }, 99);
        if (nearest < 2) tooClose = true;
        else if (nearest === 2) {
          flags.push({ level: 'amber', cat: 'proximity', text: tags[club] + ' within 48h',
            items: mine.filter(function (r) { return gap(r.date, d) === 2; }).map(function (r) { return gameItem(r, club); }) });
        }
      });
      if (tooClose) continue;

      if (day === 'Thu') flags.push({ level: 'info', cat: 'day', text: 'Thursday' });
      if (day === 'Mon') flags.push({ level: 'info', cat: 'day', text: 'Monday' });
      if (day === 'Fri') flags.push({ level: 'info', cat: 'day', text: 'Friday' });
      if (day === 'Sun') flags.push({ level: 'info', cat: 'day', text: 'Sunday' });

      /* International windows: a soft flag; a few clubs lose players. */
      (cal.internationalWindows || []).forEach(function (iw) {
        if (d >= iw.from && d <= iw.to) flags.push({ level: 'info', cat: 'international', text: 'International window',
          items: [{ date: iw.from, text: 'to ' + iw.to.slice(8) + '/' + iw.to.slice(5, 7) }] });
      });

      pencils.forEach(function (r) {
        if (win.indexOf(r.pencil.date) !== -1) {
          flags.push({ level: 'amber', cat: 'pencil', text: 'Pencilled ' + tag(r.home) + ' v ' + tag(r.away),
            items: [{ date: r.pencil.date, text: nameOf(r.home) + ' v ' + nameOf(r.away) + (r.pencil.ko ? ' · ' + r.pencil.ko : '') }] });
        }
      });

      /* Cup rounds in the window: a club possibly still in has the date
         flagged; two clubs both out of a blank cup Saturday have a slot. */
      (cal.cups || []).forEach(function (c) {
        var on = win.indexOf(c.date) !== -1, replayOn = c.replay && win.indexOf(c.replay) !== -1;
        if (!on && !replayOn) return;
        var label = (c.comp === 'fa-cup' ? 'FAC' : c.comp === 'fa-trophy' ? 'FAT' : 'NLC') + ' ' + c.round;
        var states = [home, away].map(function (club) { return cupStatus(ctx, club, c.comp, c.round, c.date); });
        [home, away].forEach(function (club, i) {
          if (states[i] !== 'possible') return;
          /* Only a replay date in the window, and the tie already decided:
             no replay to make room for. */
          if (!on && replayOn && decided(fx, club, c.comp, c.round)) return;
          flags.push({ level: 'amber', cat: 'cup', text: tags[club] + ' in ' + label + (replayOn ? ' replay' : '') + '?' });
        });
        if (on && day === 'Sat' && states[0] !== 'possible' && states[1] !== 'possible' &&
            LEAGUE[game.comp] && !matchdayOn(ctx.rounds, game.comp, d)) {
          flags.push({ level: 'info', cat: 'cup', text: label + ' Saturday, both out' });
        }
      });

      /* Article 48 (FA blocked hours notice): a game shown in the UK loses
         that on a blocked Saturday at 15:00. 12:30 and 17:30 keep it. */
      if (ukShown(game) && day === 'Sat' && blocked(cal, d)) {
        flags.push({ level: 'amber', cat: 'broadcast', text: 'Blocked hours at 15:00' });
      }

      runFlags(game, d, dated, ctx.distances, flags, opts.longTrip || LONG_TRIP);

      var within35 = !!original && gap(original, d) <= WINDOW;
      var weight = flags.reduce(function (s, f) { return s + (f.level === 'red' ? 10 : f.level === 'amber' ? 1 : 0); }, 0);
      out.push({ date: d, day: day, ko: day === 'Sat' ? '15:00' : '19:45', within35: within35, flags: flags, weight: weight });
    }

    out.sort(function (a, b) {
      if (a.within35 !== b.within35) return a.within35 ? -1 : 1;
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.date < b.date ? -1 : 1;
    });
    return { slots: out, from: from, to: to, original: original,
      windowFrom: original ? add(original, -WINDOW) : null, windowTo: original ? add(original, WINDOW) : null };
  }

  /* Home and away runs, every competition counted (plan: staffing and
     cost do not care which). Three or more in a row is a flag, rising with
     the run; never a block. An away run shows each trip as `186 mi · 3h10`
     (plan) — terse, the judging is the reader's; a cup opponent with no
     coordinates shows '?'. Neutral games break no run and
     extend none. */
  function runFlags(game, d, dated, distances, flags, longTrip) {
    var pairs = (distances && distances.pairs) || {};
    function oneWay(r) {
      var h = r.home && r.home.code, a = r.away && r.away.code;
      var p = h && a ? pairs[h + '|' + a] : null;
      return p ? p[0] : null;
    }
    [['home', 'H'], ['away', 'A']].forEach(function (pair) {
      var club = nameOf(game[pair[0]]), who = tag(game[pair[0]]);
      var seq = dated.filter(function (r) { return plays(r, club) && !r.neutral; })
        .map(function (r) { return { date: r.date, side: nameOf(r.home) === club ? 'H' : 'A', r: r }; });
      seq.push({ date: d, side: pair[1], r: game, here: true });
      seq.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var i = seq.findIndex(function (x) { return x.here; });
      function item(x) {
        var home = nameOf(x.r.home) === club, opp = home ? x.r.away : x.r.home, mi = home ? null : oneWay(x.r);
        return { date: x.date, text: (x.here ? 'This game' : nameOf(opp)) + ' (' + (home ? 'H' : 'A') + ')' +
          (home ? '' : mi != null ? ' · ' + Math.round(mi * 2) + ' mi round trip' : ' · miles unknown') };
      }
      var lo = i, hi = i;
      while (lo > 0 && seq[lo - 1].side === pair[1]) lo--;
      while (hi < seq.length - 1 && seq[hi + 1].side === pair[1]) hi++;
      var run = hi - lo + 1;
      if (run >= 3) {
        flags.push({ level: run >= 4 ? 'red' : 'amber', cat: 'run',
          text: who + ' ' + run + ' ' + (pair[1] === 'H' ? 'home' : 'away') + ' in a row',
          items: seq.slice(lo, hi + 1).map(item) });
      }
      /* Two away games in a row, each a round trip over the limit (ops
         team, 28/10/2026). Only the travelling club can have one. */
      if (pair[1] === 'A') {
        var here = oneWay(game);
        if (here == null || here * 2 <= longTrip) return;
        [seq[i - 1], seq[i + 1]].forEach(function (nb) {
          if (!nb || nb.side !== 'A') return;
          var mi = oneWay(nb.r);
          if (mi == null || mi * 2 <= longTrip) return;
          var two = nb.date < d ? [nb, seq[i]] : [seq[i], nb];
          flags.push({ level: 'amber', cat: 'run', text: who + ' 2 long trips in a row', items: two.map(item) });
        });
      }
    });
  }

  function trip(p) {
    if (!p) return '?';
    var m = Math.round(p[1]);
    return Math.round(p[0]) + 'mi ' + Math.floor(m / 60) + 'h' + ('0' + (m % 60)).slice(-2);
  }

  /* Pencilled: staff only, and a soft block on the same slot for the
     clubs' other games (plan, "States"). Confirming goes through
     FixturesCore.setDate, which stamps the decision; the pencil goes. */
  function pencil(rec, date, ko, at) {
    var n = JSON.parse(JSON.stringify(rec));
    n.pencil = { date: date, ko: ko || null, at: at };
    return n;
  }
  function unpencil(rec) {
    var n = JSON.parse(JSON.stringify(rec));
    delete n.pencil;
    return n;
  }

  /* The to-do list: every game awaiting a date, oldest original date
     first, each with how many others its clubs have waiting (the backlog
     badge, plan). */
  function todo(fixtures) {
    var waiting = Object.keys(fixtures).map(function (k) {
      var r = fixtures[k];
      if (r.key == null) r = Object.assign({ key: k }, r);
      return r;
    }).filter(function (r) { return !r.date; });
    function orig(r) {
      return (r.original && r.original.date) || (r.attempts && r.attempts.length ? r.attempts[0].date : '') || '';
    }
    var per = {};
    waiting.forEach(function (r) {
      [nameOf(r.home), nameOf(r.away)].forEach(function (c) { per[c] = (per[c] || 0) + 1; });
    });
    return waiting.map(function (r) {
      return { rec: r, original: orig(r),
        backlog: { home: per[nameOf(r.home)] - 1, away: per[nameOf(r.away)] - 1 } };
    }).sort(function (a, b) { return a.original < b.original ? -1 : a.original > b.original ? 1 : 0; });
  }

  root.FixturesFinder = {
    CATS: CATS,
    slots: slots,
    todo: todo,
    pencil: pencil,
    unpencil: unpencil,
    trip: trip,
    cupStatus: cupStatus,
    windowOf: windowOf,
    blocked: blocked,
    overlapsBlocked: overlapsBlocked,
    ukShown: ukShown
  };
})(typeof window !== 'undefined' ? window : this);
