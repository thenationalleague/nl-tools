/* =============================================================================
   NL Tools — DAZN Viewing: one club's season
   File: /dazn/_view.js
   Version: v3.0 (12/10/2026)

   CHANGELOG
     v3.0 (12/10/2026) — First build.

   Draws a club's season: headline figures, the comparison with its
   division, and every game DAZN showed. The club page (/dazn/reader/) and the staff
   page (/dazn/) both call this, so a club and the League are always
   looking at the same numbers drawn the same way.

   Needs nl-utils.js (NL.escHtml, NL.formatDateShort, NL.clubs) and _data.js.

     DAZNView.render(el, {
       code:   'ROC',                  clubs-meta code
       name:   'Rochdale',
       games:  { <id>: record, ... },  the club's node from the season
       bench:  { ... } | null,         the division's averages (null hides it)
       div:    'National',
       nameOf: function (code) { return clubName; }
     });
   ============================================================================= */
(function () {
  'use strict';

  var D = window.DAZNData;
  var esc = function (s) { return window.NL.escHtml(s); };
  var whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  var oneDp = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

  function n0(v) { return v == null ? '\u2014' : whole.format(v); }
  function n1(v) { return v == null ? '\u2014' : oneDp.format(v); }

  var AVAIL = {
    uk:    { text: 'Yes', title: '' },
    round: { text: 'Yes', title: 'Saturday: the whole round was available in the UK' },
    moved: { text: 'Yes', title: 'Saturday: moved kick-off' },
    intl:  { text: 'No', title: 'Saturday 3pm: not shown in the UK' }
  };

  function stat(num, label, sub, title) {
    return '<div class="stat"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
      '<div class="stat__num">' + num + '</div>' +
      '<div class="stat__label">' + esc(label) + '</div>' +
      (sub ? '<div class="dz-stat__sub">' + esc(sub) + '</div>' : '') +
    '</div>';
  }

  function headline(s) {
    var gamesSub = s.home + ' home \u00b7 ' + s.away + ' away' +
      (s.intlOnly ? ' \u00b7 ' + s.intlOnly + ' not shown in UK' : '');
    return '<div class="stats dz-stats">' +
      stat(n0(s.games), 'Games on DAZN', gamesSub) +
      stat(n0(s.views), 'Total views') +
      stat(n0(s.ukViews), 'UK views') +
      stat(n0(s.intlViews), 'International views') +
      stat(compact.format(s.mins), 'Minutes watched', null, whole.format(s.mins) + ' minutes') +
      stat(n1(s.avgMins), 'Avg minutes per view') +
    '</div>';
  }

  /* One row of the comparison: the club's figure and the division's, as
     two bars on the same scale, with the difference in words. */
  function benchRow(label, mine, theirs, fmt) {
    if (mine == null || theirs == null) return '';
    var max = Math.max(mine, theirs) || 1;
    var diff = theirs ? Math.round((mine - theirs) / theirs * 100) : 0;
    var diffText = diff === 0 ? 'Level with the average'
      : (diff > 0 ? diff + '% above' : Math.abs(diff) + '% below') + ' the average';
    return '<div class="dz-bench__row">' +
      '<div class="dz-bench__label">' + esc(label) + '</div>' +
      '<div class="dz-bench__bars">' +
        '<div class="dz-bench__bar dz-bench__bar--club" style="width:' + (mine / max * 100).toFixed(1) + '%"></div>' +
        '<span class="dz-bench__val">' + fmt(mine) + '</span>' +
        '<div class="dz-bench__bar dz-bench__bar--div" style="width:' + (theirs / max * 100).toFixed(1) + '%"></div>' +
        '<span class="dz-bench__val dz-bench__val--div">' + fmt(theirs) + '</span>' +
      '</div>' +
      '<div class="dz-bench__diff ' + (diff >= 0 ? 'dz-up' : 'dz-down') + '">' + esc(diffText) + '</div>' +
    '</div>';
  }

  function benchmark(s, bench, div) {
    if (!bench) return '';
    var rows =
      benchRow('UK views per UK-shown game', s.avgUkPerUkShown, D.benchFigure(bench, 'avgUkPerUkShown'), n0) +
      benchRow('International views per game', s.avgIntlPerGame, D.benchFigure(bench, 'avgIntlPerGame'), n0) +
      benchRow('Average minutes per view', s.avgMins, D.benchFigure(bench, 'avgMins'), n1);
    if (!rows) return '';
    return '<section class="dz-section">' +
      '<div class="section-head"><h2>Against the ' + esc(D.DIV_LABEL[div] || div) + ' average</h2>' +
        '<div class="dz-key"><span class="dz-key__sw dz-key__sw--club"></span>You' +
        '<span class="dz-key__sw dz-key__sw--div"></span>Division average</div></div>' +
      '<div class="dz-bench">' + rows + '</div>' +
    '</section>';
  }

  function matchTable(list, code, s, nameOf) {
    var body = list.map(function (g) {
      var home = g.home === code;
      var opp = home ? g.away : g.home;
      var oppName = nameOf(opp) || opp;
      var total = g.ukViews + g.intlViews;
      var avg = total ? (g.ukMins + g.intlMins) / total : null;
      var a = AVAIL[g.avail] || AVAIL.uk;
      var intl = g.avail === 'intl';
      return '<tr' + (g === s.top ? ' class="dz-top"' : '') + '>' +
        '<td class="dz-nowrap">' + esc(window.NL.formatDateShort(g.date)) + '</td>' +
        '<td><span class="dz-opp">' + window.NL.clubs.crestImgHtml(oppName, 'thumb', { className: 'dz-crest' }) +
          '<span>' + esc(oppName) + '</span><span class="dz-ha">' + (home ? 'H' : 'A') + '</span>' +
          (g === s.top ? '<span class="pill pill--info dz-toppill">Most watched</span>' : '') +
        '</span></td>' +
        '<td' + (a.title ? ' title="' + esc(a.title) + '"' : '') + ' class="' + (intl ? 'dz-muted' : '') + '">' + a.text + '</td>' +
        '<td class="dz-num' + (intl ? ' dz-muted' : '') + '"' +
          (intl ? ' title="Not shown in the UK. Counted in totals, not in UK averages."' : '') + '>' + n0(g.ukViews) + '</td>' +
        '<td class="dz-num">' + n0(g.intlViews) + '</td>' +
        '<td class="dz-num dz-strong">' + n0(total) + '</td>' +
        '<td class="dz-num">' + n1(avg) + '</td>' +
      '</tr>';
    }).join('');
    return '<section class="dz-section">' +
      '<div class="section-head"><h2>Games</h2></div>' +
      '<div class="table-wrap"><table class="table table--compact dz-table">' +
        '<thead><tr><th>Date</th><th>Opponent</th><th>Shown in UK</th>' +
          '<th class="dz-num">UK</th><th class="dz-num">International</th>' +
          '<th class="dz-num">Total</th><th class="dz-num">Avg mins</th></tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table></div>' +
      '<p class="dz-foot">A view is one person watching one game, so someone who watched three games counts three times.</p>' +
    '</section>';
  }

  function render(el, o) {
    var list = D.values(o.games).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state__title">No DAZN games this season</div></div>';
      return;
    }
    var s = D.summarise(list, o.code);
    el.innerHTML = headline(s) + benchmark(s, o.bench, o.div) + matchTable(list, o.code, s, o.nameOf || function () { return ''; });
    window.NL.clubs.wireCrestImgs(el);
  }

  window.DAZNView = { render: render };
})();
