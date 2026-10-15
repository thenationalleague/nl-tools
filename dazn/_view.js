/* =============================================================================
   NL Tools — DAZN Viewership: one club's season, as a dashboard
   File: /dazn/_view.js
   Version: v33.0 (15/10/2026)

   CHANGELOG
     v33.0 (15/10/2026) — New headline cards: Total views, Views per game
       (vs division), UK share, Hours watched, Best game. The split UK / INT
       averages and the Games card are gone; the game count sits under
       Views per game.
     v32.0 (15/10/2026) — The Views card reads "Total views".
     v31.0 (15/10/2026) — By month runs August to May on a real calendar,
       empty months as empty slots. By game columns share the full width
       until they would be thinner than ~30px, then scroll. A slicer shows
       only when it would split the club's games.
     v30.0 (15/10/2026) — The chart keeps a fixed height whatever the
       slicers do; Top games' heading stays on one line (full text on hover).
     v29.0 (15/10/2026) — The chart has a y-axis and gridlines, and a FIXED
       scale taken from the club's whole season: slicers no longer rescale
       it ("Not shown in UK" used to balloon to full height). Only the By
       month / By game switch changes the scale.
     v29.0 (15/10/2026) — Slicers start at plain "All". Neutral venues: a
       game marked neutral (set in Admin) reads Neutral / (N), counts under
       Venue: All only, and is its own count on the Games card.
     v28.0 (15/10/2026) — An abandoned game that counts carries a canon
       match-state pill, "Abandoned". Streams left out as not played are
       named in a line under the games, so a club that remembers one knows
       where it went.
     v27.0 (15/10/2026) — The chart switches between By month and By game.
       By game is one thin column per game in date order, scrolling sideways,
       labelled with the opponent's code and (H) / (A). Top games says what
       it is ranked over (season or month, plus any venue / UK slicer).
     v26.0 (15/10/2026) — Slicers say what they do: "UK availability: All
       games / Shown in UK / Not shown in UK" and "Venue: Home & away /
       Home / Away", each titled above its control in a white strip. Home
       or away is written out: a Venue column in the games table and
       "· Home" in Top games, replacing the grey H / A letters. slicer()
       and chips() are exported so the staff page's division slicer matches.
     v25.0 (15/10/2026) — Rebuilt as a one-screen dashboard rather than a
       long page: slicers across the top, a row of KPI cards, then a
       views-by-month column chart beside the top games, then the games in
       a fixed-height table with a sticky header and a Total row. Clicking a
       month's column slices everything to that month, as a report would.
       Built on canon components (.filter-bar, .chip-group, .nl-select,
       .stats/.stat, .form-panel) and the brand pair for the UK / INT split:
       UK red, INT navy, the house order Attendance uses for home / away. The
       division comparison is a delta line under each KPI it applies to
       ("+125% vs division"), the Attendance rank-card idiom. Replaces the
       bespoke bars, the blue / amber palette and the !important overrides
       of v16.
     v16.0 (12/10/2026) — Filters; comparison as % vs average.
     v12.0 (12/10/2026) — Sortable games, stacked bars, INT for International.
     v3.0  (12/10/2026) — First build.

   The club page (/dazn/) and the staff page (/dazn/admin/) both call this,
   so a club and the League see the same numbers drawn the same way.

   CANON USED: .filter-bar / .filter-label / .chip-group / .nl-select
   (slicers), .stats / .stat (KPIs), .form-panel + __head + __body (each
   visual), .ta-right, .form-hint, .empty-state, NL.clubs.crestImgHtml /
   wireCrestImgs, NL.escHtml, NL.formatDateShort, NL.icon.
   TOOL-LOCAL, AND WHY:
     .dz-grid  — a scrolling table with a sticky header and a sticky Total
                 row. Canon .table sets overflow:hidden !important, which
                 makes the table its own sticky scrollport and traps the
                 stuck cells; broadcast-selections hit the same wall and
                 solved it the same way (border on the scroll box, the
                 table itself unclipped). A canon gap, recorded, not filled.
     .dz-cols  — the month column chart. .dz-bar — the UK / INT data bar.
     .dz-delta / .dz-sub — the lines under a KPI (canon .stat has no slot).

     DAZNView.render(el, {
       code:   'ROC',                  clubs-meta code
       games:  { <id>: record, ... },  the club's node from the season
       bench:  { ... } | null,         the division's season averages
       div:    'National',
       nameOf: function (code) { return clubName; },
       seasonLabel: '2025-26',          names the season in Top games' context
       notPlayed: { <id>: {date, home, away, views, mins} }   streams left out
     });
     DAZNView.grid(host, { cols, rows, sort, row, total, height, onRowClick })
     DAZNView.fmt.{ n0, n1, compact }
   ============================================================================= */
(function () {
  'use strict';

  var D = window.DAZNData;
  var esc = function (s) { return window.NL.escHtml(s); };
  var whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  var oneDp = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var compactFmt = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  var MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
  var MONTH_LONG = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  function n0(v) { return v == null ? '—' : whole.format(v); }
  function n1(v) { return v == null ? '—' : oneDp.format(v); }
  /* KPI figures: whole numbers up to 9,999, then 73.7K / 6.4M, so a card
     never holds more than five characters and the brand numerals fit. */
  function compact(v) { return v == null ? '—' : (Math.abs(v) < 10000 ? whole.format(v) : compactFmt.format(v)); }

  function venueOf(r) { return r.g.neutral ? 'Neutral' : r.home ? 'Home' : 'Away'; }
  function venueAbbr(r) { return r.g.neutral ? 'N' : r.home ? 'H' : 'A'; }

  var AVAIL_TITLE = {
    round: 'Saturday: the whole round was available in the UK',
    moved: 'Saturday: moved kick-off',
    intl:  'Saturday 3pm: not shown in the UK. Counted in totals, not in UK averages.'
  };

  /* ---- Grid: scrolling table, sticky header and Total row -------------- */
  function grid(host, cfg) {
    host._dzSort = host._dzSort || cfg.sort;
    var s = host._dzSort;
    var col = cfg.cols.filter(function (c) { return c.key === s.key; })[0] || cfg.cols[0];
    var rows = cfg.rows.slice().sort(function (a, b) {
      var x = col.get(a), y = col.get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * s.dir;
    });
    var head = cfg.cols.map(function (c) {
      var on = c.key === s.key;
      var cls = (c.num ? 'ta-right ' : '') + (c.cls || '');
      if (c.sort === false) return '<th class="' + cls + '">' + esc(c.label) + '</th>';
      return '<th class="' + cls + '" aria-sort="' + (on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" class="dz-grid__sort' + (on ? ' is-on' : '') + '" data-sort="' + c.key + '">' +
        '<span>' + esc(c.label) + '</span>' +
        window.NL.icon(on && s.dir > 0 ? 'up' : 'down', 'sm').outerHTML + '</button></th>';
    }).join('');
    host.innerHTML =
      '<div class="dz-grid" style="max-height:' + (cfg.height || 420) + 'px">' +
        '<table><thead><tr>' + head + '</tr></thead>' +
        '<tbody>' + rows.map(cfg.row).join('') + '</tbody>' +
        (cfg.total ? '<tfoot>' + cfg.total + '</tfoot>' : '') +
      '</table></div>';
    host.onclick = function (e) {
      var b = e.target.closest('button[data-sort]');
      if (!b) { if (cfg.onRowClick) cfg.onRowClick(e); return; }
      var key = b.getAttribute('data-sort');
      var c = cfg.cols.filter(function (x) { return x.key === key; })[0];
      host._dzSort = key === s.key ? { key: key, dir: -s.dir } : { key: key, dir: c.num ? -1 : 1 };
      grid(host, cfg);
    };
    window.NL.clubs.wireCrestImgs(host);
  }

  /* UK / INT data bar against a shared max. Red then navy, the brand pair. */
  function bar(uk, intl, max) {
    var pu = max ? uk / max * 100 : 0, pi = max ? intl / max * 100 : 0;
    return '<span class="dz-bar" title="' + esc('UK ' + n0(uk) + ' · INT ' + n0(intl)) + '">' +
      (uk ? '<span class="dz-bar__uk" style="width:' + pu.toFixed(1) + '%"></span>' : '') +
      (intl ? '<span class="dz-bar__int" style="width:' + pi.toFixed(1) + '%"></span>' : '') +
    '</span>';
  }

  function legend() {
    return '<span class="dz-legend"><span class="dz-legend__sw dz-legend__sw--uk"></span>UK' +
      '<span class="dz-legend__sw dz-legend__sw--int"></span>INT</span>';
  }

  /* ---- Slicers ---------------------------------------------------------- */
  function chips(key, opts, on) {
    return '<div class="chip-group" role="group" data-f="' + key + '">' + opts.map(function (o) {
      return '<button type="button" class="chip' + (o[0] === on ? ' active' : '') + '" data-v="' + o[0] + '"' +
        ' aria-pressed="' + (o[0] === on) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function filtered(F) { return F.uk !== 'all' || F.venue !== 'all' || F.month !== 'all'; }

  /* A slicer: its title above its control, as a report's slicer reads.
     The strip they sit in is a white panel, so the controls read as
     controls and not as loose text on the page background. */
  function slicer(title, control) {
    return '<div class="dz-slicer"><span class="filter-label">' + esc(title) + '</span>' + control + '</div>';
  }

  /* A slicer appears only when it would split this club's games: a North
     club whose games were all shown in the UK gets no UK availability
     slicer, and a club with one game gets no venue slicer. The same rule
     the month list already followed (no month with no games). */
  function slicers(months, F, has) {
    var venues = [['all', 'All']];
    if (has.home) venues.push(['home', 'Home']);
    if (has.away) venues.push(['away', 'Away']);
    var ukSplits = has.uk && has.intl;
    var venueSplits = (has.home ? 1 : 0) + (has.away ? 1 : 0) + (has.neutral ? 1 : 0) > 1 && venues.length > 2;
    /* Nothing to split by (a one-game club): no strip at all. */
    if (!ukSplits && !venueSplits && months.length < 2 && !filtered(F)) return '';
    return '<div class="filter-bar dz-slicers">' +
      (ukSplits ? slicer('UK availability', chips('uk', [['all', 'All'], ['uk', 'Shown in UK'], ['intl', 'Not shown in UK']], F.uk)) : '') +
      (venueSplits ? slicer('Venue', chips('venue', venues, F.venue)) : '') +
      (months.length < 2 ? '' : slicer('Month', '<select class="nl-select" data-f="month" aria-label="Month"><option value="all">All</option>' +
        months.map(function (m) {
          return '<option value="' + m + '"' + (F.month === m ? ' selected' : '') + '>' +
            esc(MONTH_LONG.format(new Date(m + '-01T00:00:00Z'))) + '</option>';
        }).join('') + '</select>')) +
      (filtered(F) ? '<button type="button" class="btn btn--ghost btn--sm dz-slicers__clear" data-reset>Clear</button>' : '') +
    '</div>';
  }

  function applyFilters(list, code, F) {
    return list.filter(function (g) {
      if (F.uk === 'uk' && g.avail === 'intl') return false;
      if (F.uk === 'intl' && g.avail !== 'intl') return false;
      /* A neutral game (a final at Wembley) is neither home nor away. */
      if (F.venue === 'home' && (g.neutral || g.home !== code)) return false;
      if (F.venue === 'away' && (g.neutral || g.home === code)) return false;
      if (F.month !== 'all' && g.date.slice(0, 7) !== F.month) return false;
      return true;
    });
  }

  /* ---- KPI cards -------------------------------------------------------
     The division comparison sits under the KPIs it applies to. It is a
     season figure, so it shows only while no slicer is on: a home-only or
     single-month figure against a season average would read as a
     comparison and not be one. */
  function delta(mine, avg) {
    if (mine == null || !avg) return '';
    var pct = Math.round((mine - avg) / avg * 100);
    var sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
    return '<div class="dz-delta ' + (pct >= 0 ? 'dz-delta--up' : 'dz-delta--down') + '">' +
      sign + Math.abs(pct) + '% vs division</div>';
  }

  /* Five cards, each answering one question: how many watched, how a
     game does against the division, where the audience is, how long they
     stay, and the game that drew most. One comparison only (views per
     game): it is the figure a club compares, and a UK share or minutes
     "vs division" percentage reads as a different thing from a views one.
     `who` names the club so Best game can say who it was against; the
     League tab passes none and gets "HOME v AWAY". */
  function kpis(s, bench, showBench, who) {
    var b = function (k) { return showBench ? D.benchFigure(bench, k) : null; };
    var card = function (num, label, extra, title) {
      return '<div class="stat"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
        '<div class="stat__num">' + num + '</div><div class="stat__label">' + esc(label) + '</div>' + (extra || '') + '</div>';
    };
    var sub = function (t) { return t ? '<div class="dz-sub">' + esc(t) + '</div>' : ''; };
    var share = s.views ? Math.round(s.ukViews / s.views * 100) : null;
    var t = s.top, code = who && who.code, nameOf = (who && who.nameOf) || function () { return ''; };
    var best = '', bestTitle = '';
    if (t) {
      var when = window.NL.formatDateShort(t.date);
      if (code) {
        var opp = t.home === code ? t.away : t.home, v = t.neutral ? 'N' : t.home === code ? 'H' : 'A';
        best = 'v ' + opp + ' (' + v + ') · ' + when;
        bestTitle = 'v ' + (nameOf(opp) || opp) + ' (' + v + '), ' + when;
      } else {
        best = t.home + ' v ' + t.away + ' · ' + when;
        bestTitle = (nameOf(t.home) || t.home) + ' v ' + (nameOf(t.away) || t.away) + ', ' + when;
      }
      bestTitle += ': ' + n0(t.ukViews + t.intlViews) + ' views';
    }
    return '<div class="stats dz-kpis">' +
      card(compact(s.views), 'Total views',
        sub('UK ' + compact(s.ukViews) + ' · INT ' + compact(s.intlViews)), n0(s.views) + ' views') +
      card(compact(s.avgViewsPerGame), 'Views per game',
        delta(s.avgViewsPerGame, b('avgViewsPerGame')) + sub(n0(s.games) + (s.games === 1 ? ' game' : ' games'))) +
      card(share == null ? '—' : share + '%', 'UK share',
        sub(s.intlOnly ? s.intlOnly + ' not shown in UK' : ''), n0(s.ukViews) + ' UK of ' + n0(s.views) + ' views') +
      card(compact(s.mins / 60), 'Hours watched',
        sub(n1(s.avgMins) + ' mins per view'), n0(s.mins) + ' minutes watched') +
      card(t ? compact(t.ukViews + t.intlViews) : '—', 'Best game', sub(best), bestTitle) +
    '</div>';
  }

  /* ---- The column chart: a y-axis, gridlines and a FIXED scale -----------
     The scale comes from the club's whole season (the busiest month in By
     month, the busiest game in By game) and the slicers never change it. A
     subset should look smaller than the season, because it is: rescaling
     to the subset made "Not shown in UK" balloon to the same height as the
     UK-shown games. Only the By month / By game switch changes the scale.

     Nice ticks: about five steps of 1, 2, 2.5 or 5 x 10^n, the top tick at
     or above the busiest column, labelled in the KPI style (2,500, 15K). */
  function ticks(max) {
    if (!(max > 0)) return [0, 1];
    var raw = max / 5, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; })
      .filter(function (st) { return st >= raw; })[0];
    var out = [];
    for (var t = 0; t < max + step / 2 && out.length < 8; t += step) out.push(t);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }

  /* cols: [{ uk, intl, label (html), title, value (text above, optional),
              attrs (extra attributes), cls, tag ('button'|'div') }] */
  function chart(cols, scaleMax, extraCls, minInner) {
    var tk = ticks(scaleMax), top = tk[tk.length - 1] || 1;
    var pct = function (v) { return (v / top * 100).toFixed(2) + '%'; };
    var grid = tk.map(function (t) { return '<span class="dz-chart__grid" style="bottom:' + pct(t) + '"></span>'; }).join('');
    var yl = tk.map(function (t) { return '<span class="dz-chart__tick" style="bottom:' + pct(t) + '">' + compact(t) + '</span>'; }).join('');
    var body = cols.map(function (c) {
      var t = c.uk + c.intl, tag = c.tag || 'div';
      return '<' + tag + (tag === 'button' ? ' type="button"' : '') + ' class="dz-col ' + (c.cls || '') + '"' + (c.attrs || '') +
          ' title="' + esc(c.title) + '">' +
        (c.value ? '<span class="dz-col__val" style="bottom:' + pct(t) + '">' + c.value + '</span>' : '') +
        '<span class="dz-col__stack" style="height:' + pct(t) + '">' +
          (c.intl ? '<span class="dz-col__int" style="flex-grow:' + c.intl + '"></span>' : '') +
          (c.uk ? '<span class="dz-col__uk" style="flex-grow:' + c.uk + '"></span>' : '') +
        '</span></' + tag + '>';
    }).join('');
    var xl = cols.map(function (c) { return '<span class="dz-chart__x ' + (c.cls || '') + '">' + c.label + '</span>'; }).join('');
    return '<div class="dz-chart ' + (extraCls || '') + '">' +
      '<div class="dz-chart__y" aria-hidden="true">' + yl + '</div>' +
      '<div class="dz-chart__scroll"><div class="dz-chart__inner"' + (minInner ? ' style="min-width:' + minInner + 'px"' : '') + '>' +
        '<div class="dz-chart__plot">' + grid + '<div class="dz-chart__cols">' + body + '</div></div>' +
        '<div class="dz-chart__xrow">' + xl + '</div>' +
      '</div></div></div>';
  }

  function byMonth(list, months) {
    var by = {};
    months.forEach(function (m) { by[m] = { uk: 0, intl: 0 }; });
    list.forEach(function (g) { var m = by[g.date.slice(0, 7)]; if (m) { m.uk += g.ukViews; m.intl += g.intlViews; } });
    return by;
  }

  /* By month: one column per month, click to slice to it. */
  /* By month: the whole season, August to May, every month in its real
     place, so October, February and March are not drawn side by side. A
     month with no games is an empty slot, not a column to click. */
  function monthChart(list, axis, F, scaleMax, hasGames) {
    var by = byMonth(list, axis);
    return chart(axis.map(function (m) {
      var v = by[m], t = v.uk + v.intl, on = F.month === m, dim = F.month !== 'all' && !on;
      var d = new Date(m + '-01T00:00:00Z');
      if (!hasGames[m]) {
        return { uk: 0, intl: 0, cls: 'is-empty', title: MONTH_LONG.format(d) + ': no DAZN games', label: esc(MONTH.format(d)) };
      }
      return {
        uk: v.uk, intl: v.intl, tag: 'button', value: t ? compact(t) : '',
        cls: (on ? 'is-on' : '') + (dim ? ' is-dim' : ''),
        attrs: ' data-month="' + m + '" aria-pressed="' + on + '"',
        title: MONTH_LONG.format(d) + ': UK ' + n0(v.uk) + ' · INT ' + n0(v.intl),
        label: esc(MONTH.format(d))
      };
    }), scaleMax, 'dz-chart--months');
  }

  /* By game: one thin column per game in date order, scrolling sideways,
     labelled with the opponent's code over (H) / (A) / (N). Not clickable:
     a single game is a row in the table, not a slice. */
  function gameChart(rows, scaleMax) {
    var list = rows.slice().sort(function (a, b) { return a.g.date < b.g.date ? -1 : a.g.date > b.g.date ? 1 : 0; });
    return chart(list.map(function (r) {
      var g = r.g;
      return {
        uk: g.ukViews, intl: g.intlViews,
        title: window.NL.formatDateShort(g.date) + ' · ' + r.oppName + ' (' + venueAbbr(r) + ')\nUK ' +
          n0(g.ukViews) + ' · INT ' + n0(g.intlViews) + ' · ' + n0(r.total) + ' views',
        label: esc(r.oppCode) + '<br>(' + venueAbbr(r) + ')'
      };
    /* Columns share the width; past ~34px each they scroll instead. */
    }), scaleMax, 'dz-chart--games', list.length * 34);
  }

  /* ---- Top games -------------------------------------------------------- */
  function topGames(rows) {
    var top = rows.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
    var max = top.length ? top[0].total : 0;
    return '<ol class="dz-top">' + top.map(function (r) {
      return '<li>' +
        window.NL.clubs.crestImgHtml(r.oppName, 'thumb', { className: 'nl-crest' }) +
        '<span class="dz-top__id"><span class="dz-top__name">' + esc(r.oppName) + '</span>' +
          '<span class="dz-top__date">' + esc(window.NL.formatDateShort(r.g.date)) + ' \u00b7 ' + venueOf(r) + '</span></span>' +
        '<span class="dz-top__val">' + n0(r.total) + '</span>' +
        '<span class="dz-top__bar">' + bar(r.g.ukViews, r.g.intlViews, max) + '</span>' +
      '</li>';
    }).join('') + '</ol>';
  }

  /* ---- Games table ------------------------------------------------------ */
  function gamesGrid(host, rows, s) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([0]));
    grid(host, {
      height: 440,
      sort: { key: 'date', dir: 1 },
      cols: [
        { key: 'date', label: 'Date', get: function (r) { return r.g.date; } },
        { key: 'opp', label: 'Opponent', get: function (r) { return r.oppName; } },
        { key: 'venue', label: 'Venue', cls: 'dz-sm-hide', get: venueOf },
        { key: 'avail', label: 'Shown in UK', cls: 'dz-sm-hide', get: function (r) { return r.g.avail === 'intl' ? 'No' : 'Yes'; } },
        { key: 'uk', label: 'UK', num: true, cls: 'dz-sm-hide', get: function (r) { return r.g.ukViews; } },
        { key: 'intl', label: 'INT', num: true, cls: 'dz-sm-hide', get: function (r) { return r.g.intlViews; } },
        { key: 'total', label: 'Views', num: true, get: function (r) { return r.total; } },
        { key: 'bar', label: '', sort: false, cls: 'dz-grid__barcol' },
        { key: 'mins', label: 'Avg mins', num: true, cls: 'dz-sm-hide', get: function (r) { return r.avg; } }
      ],
      rows: rows,
      row: function (r) {
        var g = r.g, intl = g.avail === 'intl', t = AVAIL_TITLE[g.avail];
        return '<tr>' +
          '<td class="dz-nowrap">' + esc(window.NL.formatDateShort(g.date)) + '</td>' +
          '<td><span class="dz-opp">' + window.NL.clubs.crestImgHtml(r.oppName, 'thumb', { className: 'nl-crest' }) +
            '<span>' + esc(r.oppName) + '</span>' +
            (g.abandoned ? ' <span class="pill pill--postponed" title="Abandoned. Counted: it was played and watched.">Abandoned</span>' : '') +
            '</span></td>' +
          '<td class="dz-sm-hide">' + venueOf(r) + '</td>' +
          '<td class="dz-sm-hide' + (intl ? ' dz-muted' : '') + '"' + (t ? ' title="' + esc(t) + '"' : '') + '>' + (intl ? 'No' : 'Yes') + '</td>' +
          '<td class="ta-right dz-sm-hide' + (intl ? ' dz-muted' : '') + '"' + (intl ? ' title="' + esc(AVAIL_TITLE.intl) + '"' : '') + '>' + n0(g.ukViews) + '</td>' +
          '<td class="ta-right dz-sm-hide">' + n0(g.intlViews) + '</td>' +
          '<td class="ta-right dz-strong">' + n0(r.total) + '</td>' +
          '<td class="dz-grid__barcol">' + bar(g.ukViews, g.intlViews, max) + '</td>' +
          '<td class="ta-right dz-sm-hide">' + n1(r.avg) + '</td>' +
        '</tr>';
      },
      total: '<tr>' +
        '<td>Total</td><td>' + n0(s.games) + ' games</td><td class="dz-sm-hide"></td><td class="dz-sm-hide"></td>' +
        '<td class="ta-right dz-sm-hide">' + n0(s.ukViews) + '</td>' +
        '<td class="ta-right dz-sm-hide">' + n0(s.intlViews) + '</td>' +
        '<td class="ta-right">' + n0(s.views) + '</td>' +
        '<td class="dz-grid__barcol"></td>' +
        '<td class="ta-right dz-sm-hide">' + n1(s.avgMins) + '</td>' +
      '</tr>'
    });
  }

  function panel(title, body, extra, cls, titleAttr) {
    return '<section class="form-panel dz-panel ' + (cls || '') + '">' +
      '<div class="form-panel__head dz-panel__head"><span' + (titleAttr ? ' ' + titleAttr : '') + '>' + esc(title) + '</span>' + (extra || '') + '</div>' +
      '<div class="form-panel__body dz-panel__body">' + body + '</div></section>';
  }

  /* Streams DAZN made of games that were not played on that date
     (postponed, or abandoned and replayed). Left out of every figure, and
     named here so a club that remembers the stream knows where it went. */
  function notPlayedNote(np, nameOf, code) {
    var list = D.values(np).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!list.length) return '';
    return '<p class="form-hint">Not counted: ' + list.map(function (m) {
      var opp = m.home === code ? m.away : m.home;
      return esc(window.NL.formatDateShort(m.date)) + ' v ' + esc(nameOf(opp) || opp) + ' (' + (m.neutral ? 'N' : m.home === code ? 'H' : 'A') + ')';
    }).join(', ') + ' \u2014 not played on ' + (list.length === 1 ? 'that date' : 'those dates') + '.</p>';
  }

  /* ---- Render ------------------------------------------------------------ */
  function render(el, o) {
    var all = D.values(o.games);
    if (!all.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state__title">No DAZN games this season</div></div>';
      return;
    }
    var nameOf = o.nameOf || function () { return ''; };
    var months = Object.keys(all.reduce(function (m, g) { m[g.date.slice(0, 7)] = 1; return m; }, {})).sort();
    var hasGames = {};
    months.forEach(function (m) { hasGames[m] = true; });
    /* The chart's month axis: August to May of this season, plus any month
       the data reaches outside it (a July friendly would still show). */
    var first = months[0].split('-'), y0 = +first[1] >= 7 ? +first[0] : +first[0] - 1;
    var axis = [];
    for (var k = 0; k < 10; k++) {
      var mm = 8 + k, yy = y0 + (mm > 12 ? 1 : 0); mm = ((mm - 1) % 12) + 1;
      axis.push(yy + '-' + (mm < 10 ? '0' : '') + mm);
    }
    months.forEach(function (m) { if (axis.indexOf(m) === -1) axis.push(m); });
    axis.sort();
    /* What this club's games can be split by, for the slicers. */
    var has = { uk: false, intl: false, home: false, away: false, neutral: false };
    all.forEach(function (g) {
      has[g.avail === 'intl' ? 'intl' : 'uk'] = true;
      has[g.neutral ? 'neutral' : g.home === o.code ? 'home' : 'away'] = true;
    });
    var F = { uk: 'all', venue: 'all', month: 'all' };
    var view = 'month';
    /* Fixed scales: the club's whole season, never the sliced subset. */
    var allByMonth = byMonth(all, months);
    var scale = {
      month: Math.max.apply(null, months.map(function (m) { return allByMonth[m].uk + allByMonth[m].intl; })),
      game: Math.max.apply(null, all.map(function (g) { return g.ukViews + g.intlViews; }))
    };

    /* What Top games is ranked over, so the list is never ambiguous:
       "2025-26", "April 2026", "2025-26 · Home · Not shown in UK". */
    function context() {
      var bits = [F.month !== 'all' ? MONTH_LONG.format(new Date(F.month + '-01T00:00:00Z')) : (o.seasonLabel || 'Season')];
      if (F.venue !== 'all') bits.push(F.venue === 'home' ? 'Home' : 'Away');
      if (F.uk !== 'all') bits.push(F.uk === 'uk' ? 'Shown in UK' : 'Not shown in UK');
      return bits.join(' \u00b7 ');
    }

    el.innerHTML = '<div class="dz-dash">' +
      '<div data-slicers></div>' +
      '<div data-kpis></div>' +
      '<div class="dz-row">' +
        panel('Views by month', '<div data-chart></div>',
          '<span class="dz-panel__tools">' + chips('chart', [['month', 'By month'], ['game', 'By game']], 'month') + legend() + '</span>',
          '', 'data-chart-title') +
        panel('Top games', '<div data-top></div>', '<span class="dz-panel__ctx" data-top-ctx></span>') +
      '</div>' +
      panel('Games', '<div data-games></div>', legend(), 'dz-panel--flush') +
      notPlayedNote(o.notPlayed, nameOf, o.code) +
      '<p class="form-hint">A view is counted per game, so someone who watched three games counts three times.</p>' +
    '</div>';

    var q = function (sel) { return el.querySelector(sel); };

    function draw() {
      q('[data-slicers]').innerHTML = slicers(months, F, has);
      var shown = applyFilters(all, o.code, F);
      q('[data-chart-title]').textContent = view === 'game' ? 'Views by game' : 'Views by month';
      var ctx = context();
      q('[data-top-ctx]').textContent = ctx;
      q('[data-top-ctx]').title = ctx;   /* in full when the heading is cut short */
      /* The month chart takes every slicer except the month itself, so the
         other months stay visible to click across to. */
      if (view === 'month') {
        q('[data-chart]').innerHTML = monthChart(applyFilters(all, o.code, { uk: F.uk, venue: F.venue, month: 'all' }), axis, F, scale.month, hasGames);
      }
      if (!shown.length) {
        if (view === 'game') q('[data-chart]').innerHTML = '';
        q('[data-kpis]').innerHTML = '';
        q('[data-top]').innerHTML = '';
        q('[data-games]').innerHTML = '<div class="empty-state"><div class="empty-state__title">No games match these slicers</div></div>';
        return;
      }
      var s = D.summarise(shown, o.code);
      var rows = shown.map(function (g) {
        var home = g.home === o.code, opp = home ? g.away : g.home, total = g.ukViews + g.intlViews;
        return { g: g, home: home, oppName: nameOf(opp) || opp, oppCode: opp, total: total,
                 avg: total ? (g.ukMins + g.intlMins) / total : null };
      });
      if (view === 'game') q('[data-chart]').innerHTML = gameChart(rows, scale.game);
      q('[data-kpis]').innerHTML = kpis(s, o.bench, !filtered(F), { code: o.code, nameOf: nameOf });
      q('[data-top]').innerHTML = topGames(rows);
      window.NL.clubs.wireCrestImgs(q('[data-top]'));
      gamesGrid(q('[data-games]'), rows, s);
    }

    el.onclick = function (e) {
      var chip = e.target.closest('.dz-slicers .chip[data-v]');
      if (chip) { F[chip.parentNode.getAttribute('data-f')] = chip.getAttribute('data-v'); draw(); return; }
      var sw = e.target.closest('[data-f="chart"] .chip[data-v]');
      if (sw) {
        view = sw.getAttribute('data-v');
        Array.prototype.forEach.call(sw.parentNode.querySelectorAll('.chip'), function (c) {
          var on = c === sw; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on));
        });
        draw(); return;
      }
      var col = e.target.closest('.dz-col[data-month]');
      if (col) { var m = col.getAttribute('data-month'); F.month = F.month === m ? 'all' : m; draw(); return; }
      if (e.target.closest('[data-reset]')) { F = { uk: 'all', venue: 'all', month: 'all' }; draw(); }
    };
    el.onchange = function (e) {
      if (e.target.matches('select[data-f="month"]')) { F.month = e.target.value; draw(); }
    };
    draw();
  }

  window.DAZNView = {
    render: render, grid: grid, applyFilters: applyFilters, chips: chips, slicer: slicer, kpis: kpis,
    fmt: { n0: n0, n1: n1, compact: compact }
  };
})();
