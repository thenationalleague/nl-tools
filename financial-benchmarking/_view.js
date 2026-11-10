/* =============================================================================
   NL Tools — Financial Benchmarking: the club's view
   File: /financial-benchmarking/_view.js
   Version: v0.1 (10/11/2026)

   CHANGELOG
     v0.1 (10/11/2026) — First build. One card per figure: the club's own
       number, how far it sits from the median, and every club in the
       comparison as a nameless bar with the club's own bar in red.

   Used by the club page (/financial-benchmarking/) and by the staff page's
   "as the club sees it" view (/financial-benchmarking/admin/), so the two
   cannot drift apart.

   NO RANK, NO VERDICT (settled 10/11/2026). The bars are sorted, so a club
   can see where it sits; the words say only how far it is from the median.
   Nothing is coloured as good or bad: income and wages do not arrive evenly
   through a season, so "behind budget after one quarter" would be wrong for
   any club whose year is front- or back-loaded.

     FBView.render(mount, {
       div:      'North',                       the club's division
       v:        { incomeBudget: 1, ... },      the club's stored figures
       benches:  { North: {...}, South: {...} } nameless lists, by division
       quarter:  'q1',
       returns:  [{ id, label }],               every return on file, newest first
       current:  id,                            the one being shown
       onReturn: function (id) {}               another return was picked
     });
   ============================================================================= */
(function (root) {
  'use strict';

  var D = root.FBData;
  var esc = function (s) { return root.NL.escHtml(s == null ? '' : String(s)); };

  /* Which comparison a North or South club last chose, kept while the page
     is open so changing the return does not reset it. */
  var compareBoth = false;

  function bars(values, own) {
    var n = values.length;
    if (!n) return '';
    var lo = Math.min(0, values[0]), hi = Math.max(0, values[n - 1]);
    if (hi === lo) hi = lo + 1;
    var span = hi - lo;
    var y = function (v) { return (v - lo) / span * 100; };

    /* The club's own bar: the first that equals its figure. If the stored
       lists are a save behind the club's row, the nearest stands in. */
    var mine = -1, gap = Infinity;
    if (own != null) {
      values.forEach(function (v, i) {
        var g = Math.abs(v - own);
        if (g < gap) { gap = g; mine = i; }
      });
    }

    var html = values.map(function (v, i) {
      var h = Math.max(Math.abs(v) / span * 100, 1.5);
      return '<span class="fb-bar' + (i === mine ? ' is-own' : '') + '">' +
        '<i style="bottom:' + y(Math.min(v, 0)).toFixed(2) + '%;height:' + h.toFixed(2) + '%"></i></span>';
    }).join('');

    var med = D.median(values);
    var lines = '<span class="fb-bars__median" style="bottom:' + y(med).toFixed(2) + '%"></span>';
    if (lo < 0) lines += '<span class="fb-bars__zero" style="bottom:' + y(0).toFixed(2) + '%"></span>';
    return html + lines;
  }

  function card(m, own, values, who, q) {
    var label = m.label.replace('{Q}', q);
    var med = D.median(values), n = values.length;
    var vs = D.againstMedian(m.kind, own, med, who);
    var num = own == null ? '<span class="fb-card__none">No figure</span>' : esc(D.format(m.kind, own));
    var alt = label + ': ' + (own == null ? 'no figure' : D.format(m.kind, own)) + (vs ? ', ' + vs : '') + '.';

    var chart = n
      ? '<div class="fb-bars" role="img" aria-label="' + esc(alt) + '">' + bars(values, own) + '</div>' +
        '<dl class="fb-range">' +
          '<div><dt>Lowest</dt><dd>' + esc(D.format(m.kind, values[0])) + '</dd></div>' +
          '<div><dt>Median</dt><dd>' + esc(D.format(m.kind, med)) + '</dd></div>' +
          '<div><dt>Highest</dt><dd>' + esc(D.format(m.kind, values[n - 1])) + '</dd></div>' +
        '</dl>'
      : '';

    return '<article class="fb-card">' +
      '<h3 class="fb-card__label">' + esc(label) + '</h3>' +
      '<div class="fb-card__num">' + num + '</div>' +
      '<div class="fb-card__vs">' + esc(vs) + '</div>' +
      chart +
    '</article>';
  }

  function render(mount, o) {
    var set = D.setFor(o.div), def = D.SETS[set];
    if (!def) { mount.innerHTML = ''; return; }

    var q = D.quarterLabel(o.quarter);
    var own = D.figures(set, o.v);
    var benches = o.benches || {};
    var other = set === 'step2' ? (o.div === 'North' ? 'South' : 'North') : null;
    var canBoth = !!(other && benches[other]);
    var both = canBoth && compareBoth;
    var bench = both ? D.combine(benches[o.div], benches[other]) : (benches[o.div] || {});
    var who = both ? 'North and South' : o.div;

    var controls = '';
    if ((o.returns || []).length > 1) {
      controls += '<label class="fb-control"><span class="fb-control__label">Return</span>' +
        '<select class="nl-select" data-fb-return>' + o.returns.map(function (r) {
          return '<option value="' + esc(r.id) + '"' + (r.id === o.current ? ' selected' : '') + '>' + esc(r.label) + '</option>';
        }).join('') + '</select></label>';
    }
    /* A filter button carries its own name, so it takes no title above. */
    if (canBoth) controls += '<div class="fb-control" data-fb-compare></div>';

    var n = 0;
    Object.keys(bench).forEach(function (k) { n = Math.max(n, D.list(bench[k]).length); });

    mount.innerHTML =
      '<div class="fb-view">' +
        (controls ? '<div class="fb-controls">' + controls + '</div>' : '') +
        def.groups.map(function (g) {
          return '<section class="fb-group">' +
            '<div class="section-head"><h2>' + esc(g.title) + '</h2></div>' +
            '<div class="fb-grid">' + g.metrics.map(function (m) {
              return card(m, own[m.key], D.list(bench[m.key]), who, q);
            }).join('') + '</div>' +
          '</section>';
        }).join('') +
        (n ? '<p class="fb-key"><span class="fb-key__own"></span>Your club' +
             '<span class="fb-key__other"></span>' + esc(n > 1 ? 'The other ' + (n - 1) + ' ' + who + ' clubs' : 'Other clubs') +
             '<span class="fb-key__median"></span>Median</p>' : '') +
      '</div>';

    var sel = mount.querySelector('[data-fb-return]');
    if (sel) sel.addEventListener('change', function () { if (o.onReturn) o.onReturn(sel.value); });
    var slot = mount.querySelector('[data-fb-compare]');
    if (slot) {
      root.NL.filterButton(slot, {
        label: 'Compare against', multiple: false, search: false,
        options: [{ value: 'own', label: o.div }, { value: 'both', label: 'North and South' }],
        value: both ? 'both' : 'own',
        onChange: function (v) {
          /* Always one or the other: clearing it goes back to the club's
             own division. */
          compareBoth = v === 'both';
          render(mount, o);
          var t = mount.querySelector('[data-fb-compare] .filter-btn__trigger');
          if (t) t.focus();
        }
      });
    }
  }

  root.FBView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
