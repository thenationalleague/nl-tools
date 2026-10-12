/* =============================================================================
   NL Tools — DAZN Viewing: one club's season
   File: /dazn/_view.js
   Version: v12.0 (12/10/2026)

   CHANGELOG
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
     --primary  the club itself (comparison bar)
     --blue     UK views          --amber  International views
   The division average is an ink marker, not a hue — it is a reference
   line, not a series.

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
    var gamesSub = s.home + ' home · ' + s.away + ' away' +
      (s.intlOnly ? ' · ' + s.intlOnly + ' not shown in UK' : '');
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
     The club is a bar; the division average is a marker on the same scale.
     The scale runs a little past the larger of the two so neither sits
     hard against the edge. */
  function benchRow(label, mine, theirs, fmt) {
    if (mine == null || theirs == null) return '';
    var max = Math.max(mine, theirs) * 1.1 || 1;
    var diff = theirs ? Math.round((mine - theirs) / theirs * 100) : 0;
    var diffText = diff === 0 ? 'Level' : (diff > 0 ? diff + '% above' : Math.abs(diff) + '% below');
    return '<div class="dz-bench__row">' +
      '<div class="dz-bench__label">' + esc(label) + '</div>' +
      '<div class="dz-bench__track" title="' + esc('You ' + fmt(mine) + ' · division average ' + fmt(theirs)) + '">' +
        '<div class="dz-bench__bar" style="width:' + (mine / max * 100).toFixed(1) + '%"></div>' +
        '<div class="dz-bench__mark" style="left:' + (theirs / max * 100).toFixed(1) + '%"></div>' +
      '</div>' +
      '<div class="dz-bench__vals"><strong>' + fmt(mine) + '</strong>' +
        '<span class="dz-bench__avg">avg ' + fmt(theirs) + '</span>' +
        '<span class="dz-bench__diff ' + (diff >= 0 ? 'dz-up' : 'dz-down') + '">' + esc(diffText) + '</span></div>' +
    '</div>';
  }

  function benchmark(s, bench, div) {
    if (!bench) return '';
    var rows =
      benchRow('UK views per UK-shown game', s.avgUkPerUkShown, D.benchFigure(bench, 'avgUkPerUkShown'), n0) +
      benchRow('INT views per game', s.avgIntlPerGame, D.benchFigure(bench, 'avgIntlPerGame'), n0) +
      benchRow('Average minutes per view', s.avgMins, D.benchFigure(bench, 'avgMins'), n1);
    if (!rows) return '';
    return '<section class="dz-section">' +
      '<div class="section-head"><h2>Against the ' + esc(D.DIV_LABEL[div] || div) + ' average</h2>' +
        '<div class="dz-key"><span class="dz-key__sw dz-key__sw--club"></span>You' +
        '<span class="dz-key__mark"></span>Division average</div></div>' +
      '<div class="dz-bench">' + rows + '</div>' +
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

  function render(el, o) {
    var list = D.values(o.games);
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state__title">No DAZN games this season</div></div>';
      return;
    }
    var s = D.summarise(list, o.code);
    el.innerHTML = headline(s) + benchmark(s, o.bench, o.div) +
      '<section class="dz-section">' +
        '<div class="section-head"><h2>Games</h2>' +
          '<div class="dz-key"><span class="dz-key__sw dz-key__sw--uk"></span>UK' +
          '<span class="dz-key__sw dz-key__sw--intl"></span>INT</div></div>' +
        '<div data-games></div>' +
        '<p class="dz-foot">Someone who watched three games counts as three views.</p>' +
      '</section>';
    games(el.querySelector('[data-games]'), list, o.code, o.nameOf || function () { return ''; });
  }

  window.DAZNView = { render: render, sortableTable: sortableTable };
})();
