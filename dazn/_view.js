/* =============================================================================
   NL Tools — DAZN Viewing: one club's season
   File: /dazn/_view.js
   Version: v16.0 (12/10/2026)

   CHANGELOG
     v16.0 (12/10/2026) — Filters: Shown in UK / INT only, Home / Away, and
       month. They recalculate the headline cards and the games table; the
       division comparison stays season-wide and says so while a filter is
       on. The comparison is now % above or below the average, out from a
       centre line on one scale for all rows: the bar-plus-marker drew each
       row on its own scale, so every bar looked full and the marker
       wandered.
     v12.0 (12/10/2026) — Games table: every column sorts on click (date
       first by default), and a stacked UK / International bar per game
       replaces the "Most watched" pill — the biggest game is the longest
       bar, so it no longer needs a label. Division comparison: the average
       is a marker on the club's bar rather than a second grey bar, which
       failed the chart colour checks (too grey, under 3:1 contrast) and
       would have clashed with the blue the games bars use for UK. Copy
       trimmed, and "International" shortened to INT throughout.
       sortableTable() added for both DAZN pages.
     v3.0 (12/10/2026) — First build.

   Draws a club's season: headline figures, the comparison with its
   division, and every game DAZN showed. The club page (/dazn/reader/) and
   the staff page (/dazn/) both call this, so a club and the League are
   always looking at the same numbers drawn the same way.

   COLOUR. One meaning per colour across the page, checked with the dataviz
   palette validator (both pairs pass every check on the white surface):
     --primary  the club itself (comparison bars, either side of average)
     --blue     UK views          --amber  International views
   The average is the ink centre line, not a hue: a reference, not a series.

   Needs nl-utils.js (NL.escHtml, NL.formatDateShort, NL.clubs) and _data.js.

     DAZNView.render(el, {
       code:   'ROC',                  clubs-meta code
       games:  { <id>: record, ... },  the club's node from the season
       bench:  { ... } | null,         the division's averages (null hides it)
       div:    'National',
       nameOf: function (code) { return clubName; }
     });

     DAZNView.sortableTable(host, { cols, rows, sort, row, tableClass })
       — see sortableTable below.
   ============================================================================= */
(function () {
  'use strict';

  var D = window.DAZNData;
  var esc = function (s) { return window.NL.escHtml(s); };
  var whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  var oneDp = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

  function n0(v) { return v == null ? '—' : whole.format(v); }
  function n1(v) { return v == null ? '—' : oneDp.format(v); }

  var AVAIL = {
    uk:    { text: 'Yes', title: '' },
    round: { text: 'Yes', title: 'Saturday: the whole round was available in the UK' },
    moved: { text: 'Yes', title: 'Saturday: moved kick-off' },
    intl:  { text: 'No', title: 'Saturday 3pm: not shown in the UK' }
  };

  /* ---- Sortable table ---------------------------------------------------
     CANON CANDIDATE (12/10/2026): Club Directory hand-rolls the same
     click-a-header-to-sort table (th[data-sort], .is-sorted). Two tools now;
     promote to NL.* + a .table modifier with the next nl-utils change.

       cols:  [{ key, label, num?, get(row) → sortable value, cls? }]
       rows:  the data
       sort:  { key, dir }   dir 1 ascending, -1 descending; kept on the
              host between clicks so a re-render keeps the user's choice
       row:   function (r) → '<tr>…</tr>'
     Numbers sort biggest first on the first click, text and dates A→Z. */
  function sortableTable(host, cfg) {
    host._dzSort = host._dzSort || cfg.sort;
    var s = host._dzSort;
    var col = cfg.cols.filter(function (c) { return c.key === s.key; })[0] || cfg.cols[0];
    var rows = cfg.rows.slice().sort(function (a, b) {
      var x = col.get(a), y = col.get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      var r = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return r * s.dir;
    });
    var head = cfg.cols.map(function (c) {
      var on = c.key === s.key;
      return '<th class="' + (c.num ? 'dz-num ' : '') + (c.cls || '') + '"' +
        ' aria-sort="' + (on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" class="dz-sort' + (on ? ' is-on' : '') + '" data-sort="' + c.key + '">' +
          esc(c.label) + '<span class="dz-sort__arrow" aria-hidden="true">' +
          (on ? (s.dir > 0 ? '▲' : '▼') : '▼') + '</span></button></th>';
    }).join('');
    host.innerHTML = '<div class="table-wrap"><table class="table table--compact dz-table ' + (cfg.tableClass || '') + '">' +
      '<thead><tr>' + head + '</tr></thead><tbody>' + rows.map(cfg.row).join('') + '</tbody></table></div>';
    host.onclick = function (e) {
      var b = e.target.closest('button[data-sort]');
      if (!b) { if (cfg.onRowClick) cfg.onRowClick(e); return; }
      var key = b.getAttribute('data-sort');
      var c = cfg.cols.filter(function (x) { return x.key === key; })[0];
      host._dzSort = key === s.key ? { key: key, dir: -s.dir } : { key: key, dir: c.num ? -1 : 1 };
      sortableTable(host, cfg);
    };
    if (window.NL.clubs.wireCrestImgs) window.NL.clubs.wireCrestImgs(host);
  }

  /* ---- Headline ---------------------------------------------------------- */
  function stat(num, label, sub, title) {
    return '<div class="stat"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
      '<div class="stat__num">' + num + '</div>' +
      '<div class="stat__label">' + esc(label) + '</div>' +
      (sub ? '<div class="dz-stat__sub">' + esc(sub) + '</div>' : '') +
    '</div>';
  }

  function headline(s) {
    var gamesSub = [s.home && s.home + ' home', s.away && s.away + ' away',
      s.intlOnly && s.intlOnly + ' not shown in UK'].filter(Boolean).join(' · ');
    return '<div class="stats dz-stats">' +
      stat(n0(s.games), 'Games on DAZN', gamesSub) +
      stat(n0(s.views), 'Total views') +
      stat(n0(s.ukViews), 'UK views') +
      stat(n0(s.intlViews), 'INT views') +
      stat(compact.format(s.mins), 'Minutes watched', null, whole.format(s.mins) + ' minutes') +
      stat(n1(s.avgMins), 'Avg minutes per view') +
    '</div>';
  }

  /* ---- Against the division --------------------------------------------
     How far above or below the division average the club is, as a bar out
     from a centre line at the average. All rows share one scale, so a row
     reads against the others as well as against the average. The scale is
     the largest gap on show, never less than ±50%, so a club a few percent
     off average gets a short bar rather than one blown up to full width.
     Season-wide always: the filters narrow the club's games, but the
     average was stored for the whole season, so the comparison says so. */
  function benchRows(s, bench) {
    var defs = [
      ['UK views per UK-shown game', s.avgUkPerUkShown, D.benchFigure(bench, 'avgUkPerUkShown'), n0],
      ['INT views per game', s.avgIntlPerGame, D.benchFigure(bench, 'avgIntlPerGame'), n0],
      ['Average minutes per view', s.avgMins, D.benchFigure(bench, 'avgMins'), n1]
    ];
    return defs.filter(function (d) { return d[1] != null && d[2]; })
      .map(function (d) { return { label: d[0], mine: d[1], avg: d[2], fmt: d[3], diff: (d[1] - d[2]) / d[2] }; });
  }

  function benchmark(s, bench, div) {
    if (!bench) return '';
    var rows = benchRows(s, bench);
    if (!rows.length) return '';
    var scale = Math.max(0.5, Math.max.apply(null, rows.map(function (r) { return Math.abs(r.diff); })));
    var body = rows.map(function (r) {
      var w = (Math.abs(r.diff) / scale * 100).toFixed(1);
      var pct = Math.round(r.diff * 100);
      return '<div class="dz-bench__row">' +
        '<div class="dz-bench__label">' + esc(r.label) + '</div>' +
        '<div class="dz-div" title="' + esc('You ' + r.fmt(r.mine) + ' · division average ' + r.fmt(r.avg)) + '">' +
          '<div class="dz-div__half dz-div__half--neg">' + (r.diff < 0 ? '<span style="width:' + w + '%"></span>' : '') + '</div>' +
          '<div class="dz-div__half dz-div__half--pos">' + (r.diff > 0 ? '<span style="width:' + w + '%"></span>' : '') + '</div>' +
        '</div>' +
        '<div class="dz-bench__vals"><strong>' + (pct > 0 ? '+' : pct < 0 ? '−' : '') + Math.abs(pct) + '%</strong>' +
          '<span class="dz-bench__avg">' + r.fmt(r.mine) + ' · avg ' + r.fmt(r.avg) + '</span></div>' +
      '</div>';
    }).join('');
    return '<section class="dz-section">' +
      '<div class="section-head"><h2>Season against the ' + esc(D.DIV_LABEL[div] || div) + ' average</h2>' +
        '<span class="dz-filtered-note" data-bench-note hidden>Whole season. Filters don’t apply.</span></div>' +
      '<div class="dz-bench">' +
        '<div class="dz-bench__row dz-bench__row--head"><div></div>' +
          '<div class="dz-div__labels"><span>Below average</span><span>Above average</span></div><div></div></div>' +
        body +
      '</div>' +
    '</section>';
  }

  /* ---- Games ------------------------------------------------------------- */
  function viewsBar(g, max) {
    var total = g.ukViews + g.intlViews;
    var uk = max ? g.ukViews / max * 100 : 0, intl = max ? g.intlViews / max * 100 : 0;
    return '<div class="dz-vbar" title="' + esc('UK ' + n0(g.ukViews) + ' · INT ' + n0(g.intlViews)) + '">' +
      '<div class="dz-vbar__track">' +
        (g.ukViews ? '<span class="dz-vbar__uk" style="width:' + uk.toFixed(1) + '%"></span>' : '') +
        (g.intlViews ? '<span class="dz-vbar__intl" style="width:' + intl.toFixed(1) + '%"></span>' : '') +
      '</div><span class="dz-vbar__num">' + n0(total) + '</span></div>';
  }

  function games(host, list, code, nameOf) {
    var max = 0;
    var rows = list.map(function (g) {
      var home = g.home === code;
      var opp = home ? g.away : g.home;
      var total = g.ukViews + g.intlViews;
      if (total > max) max = total;
      return { g: g, home: home, oppName: nameOf(opp) || opp, total: total,
               avg: total ? (g.ukMins + g.intlMins) / total : null };
    });
    sortableTable(host, {
      sort: { key: 'date', dir: 1 },
      cols: [
        { key: 'date', label: 'Date', get: function (r) { return r.g.date; } },
        { key: 'opp', label: 'Opponent', get: function (r) { return r.oppName; } },
        { key: 'avail', label: 'Shown in UK', cls: 'dz-sm-hide', get: function (r) { return r.g.avail === 'intl' ? 'No' : 'Yes'; } },
        { key: 'total', label: 'Views', num: true, cls: 'dz-vcol', get: function (r) { return r.total; } },
        { key: 'uk', label: 'UK', num: true, cls: 'dz-sm-hide', get: function (r) { return r.g.ukViews; } },
        { key: 'intl', label: 'INT', num: true, cls: 'dz-sm-hide', get: function (r) { return r.g.intlViews; } },
        { key: 'mins', label: 'Avg mins', num: true, cls: 'dz-sm-hide', get: function (r) { return r.avg; } }
      ],
      rows: rows,
      row: function (r) {
        var g = r.g, a = AVAIL[g.avail] || AVAIL.uk, intl = g.avail === 'intl';
        return '<tr>' +
          '<td class="dz-nowrap">' + esc(window.NL.formatDateShort(g.date)) + '</td>' +
          '<td><span class="dz-opp">' + window.NL.clubs.crestImgHtml(r.oppName, 'thumb', { className: 'dz-crest' }) +
            '<span>' + esc(r.oppName) + '</span><span class="dz-ha">' + (r.home ? 'H' : 'A') + '</span></span></td>' +
          '<td class="dz-sm-hide' + (intl ? ' dz-muted' : '') + '"' + (a.title ? ' title="' + esc(a.title) + '"' : '') + '>' + a.text + '</td>' +
          '<td class="dz-vcol">' + viewsBar(g, max) + '</td>' +
          '<td class="dz-num dz-sm-hide' + (intl ? ' dz-muted' : '') + '"' +
            (intl ? ' title="Not shown in the UK. Counted in totals, not in UK averages."' : '') + '>' + n0(g.ukViews) + '</td>' +
          '<td class="dz-num dz-sm-hide">' + n0(g.intlViews) + '</td>' +
          '<td class="dz-num dz-sm-hide">' + n1(r.avg) + '</td>' +
        '</tr>';
      }
    });
  }

  /* ---- Filters ------------------------------------------------------------
     Closed sets, so segmented chips (canon .chip-group); months run to ten
     or so a season, so a select. They narrow the cards and the games; the
     division comparison stays season-wide (see benchmark). */
  var MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  function chips(key, opts, on) {
    return '<div class="chip-group" role="group" data-f="' + key + '">' + opts.map(function (o) {
      return '<button type="button" class="chip' + (o[0] === on ? ' active' : '') + '" data-v="' + o[0] + '"' +
        ' aria-pressed="' + (o[0] === on) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function filterBar(list, F) {
    var months = {};
    list.forEach(function (g) { months[g.date.slice(0, 7)] = true; });
    var opts = Object.keys(months).sort().map(function (m) {
      var label = MONTH.format(new Date(m + '-01T00:00:00Z'));
      return '<option value="' + m + '"' + (F.month === m ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    return '<div class="dz-filters">' +
      chips('uk', [['all', 'All games'], ['uk', 'Shown in UK'], ['intl', 'INT only']], F.uk) +
      chips('venue', [['all', 'Home & away'], ['home', 'Home'], ['away', 'Away']], F.venue) +
      '<select class="nl-select" data-f="month" aria-label="Month"><option value="all">All months</option>' + opts + '</select>' +
    '</div>';
  }

  function applyFilters(list, code, F) {
    return list.filter(function (g) {
      if (F.uk === 'uk' && g.avail === 'intl') return false;
      if (F.uk === 'intl' && g.avail !== 'intl') return false;
      if (F.venue === 'home' && g.home !== code) return false;
      if (F.venue === 'away' && g.home === code) return false;
      if (F.month !== 'all' && g.date.slice(0, 7) !== F.month) return false;
      return true;
    });
  }

  function render(el, o) {
    var list = D.values(o.games);
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state__title">No DAZN games this season</div></div>';
      return;
    }
    var F = { uk: 'all', venue: 'all', month: 'all' };
    var nameOf = o.nameOf || function () { return ''; };
    el.innerHTML = filterBar(list, F) +
      '<div data-cards></div>' +
      benchmark(D.summarise(list, o.code), o.bench, o.div) +
      '<section class="dz-section">' +
        '<div class="section-head"><h2>Games</h2>' +
          '<div class="dz-key"><span class="dz-key__sw dz-key__sw--uk"></span>UK' +
          '<span class="dz-key__sw dz-key__sw--intl"></span>INT</div></div>' +
        '<div data-games></div>' +
        '<p class="dz-foot">Someone who watched three games counts as three views.</p>' +
      '</section>';

    var cards = el.querySelector('[data-cards]');
    var gamesHost = el.querySelector('[data-games]');
    var note = el.querySelector('[data-bench-note]');

    function draw() {
      var shown = applyFilters(list, o.code, F);
      var filtered = F.uk !== 'all' || F.venue !== 'all' || F.month !== 'all';
      if (note) note.hidden = !filtered;
      if (!shown.length) {
        cards.innerHTML = '';
        gamesHost.innerHTML = '<div class="empty-state"><div class="empty-state__title">No games match these filters</div></div>';
        return;
      }
      cards.innerHTML = headline(D.summarise(shown, o.code));
      games(gamesHost, shown, o.code, nameOf);
    }

    el.querySelector('.dz-filters').addEventListener('click', function (e) {
      var b = e.target.closest('.chip[data-v]');
      if (!b) return;
      var group = b.parentNode;
      F[group.getAttribute('data-f')] = b.getAttribute('data-v');
      Array.prototype.forEach.call(group.querySelectorAll('.chip'), function (c) {
        var on = c === b;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      draw();
    });
    el.querySelector('select[data-f="month"]').addEventListener('change', function () {
      F.month = this.value;
      draw();
    });
    draw();
  }

  window.DAZNView = { render: render, sortableTable: sortableTable, applyFilters: applyFilters };
})();
