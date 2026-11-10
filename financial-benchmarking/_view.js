/* =============================================================================
   NL Tools — Financial Benchmarking: the club's view
   File: /financial-benchmarking/_view.js
   Version: v0.2 (10/11/2026)

   CHANGELOG
     v0.2 (10/11/2026) — North and South are weighted: squad cost against
       income leads (budgeted, and to date), then Income and Playing squad as
       two panels, each budget with its own progress beside it. Budgets carry
       their place by size ("16th of 24"). Position can be shown as bars or
       as a slider from lowest to highest.
     v0.1 (10/11/2026) — First build. One card per figure: the club's own
       number, how far it sits from the median, and every club in the
       comparison as a nameless bar with the club's own bar in red.

   Used by the club page (/financial-benchmarking/) and by the staff page's
   "as the club sees it" view (/financial-benchmarking/admin/), so the two
   cannot drift apart.

   NO VERDICT (settled 10/11/2026). The words say how far a figure is from
   the median. A BUDGET also carries its place by size, because finance asked
   for it and "16th largest budget" is a fact about scale; a percentage never
   does, because the top of "share of budget spent" is not a place to aim for.
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
  /* Bars or slider. Both are kept so the two can be put side by side. */
  var vizMode = 'bars';

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

  /* The other way to show position: a track from the lowest figure to the
     highest, the club's own as a knob and the median as a tick. It gives away
     less than the bars — two ends and a middle, not every club's figure. */
  function slider(values, own) {
    var n = values.length;
    if (!n) return '';
    var lo = values[0], hi = values[n - 1], span = hi - lo || 1;
    var x = function (v) { return Math.max(0, Math.min(100, (v - lo) / span * 100)).toFixed(2); };
    var html = '<span class="fb-slider__median" style="left:' + x(D.median(values)) + '%"></span>';
    if (own != null) {
      html = '<span class="fb-slider__fill" style="width:' + x(own) + '%"></span>' + html +
        '<span class="fb-slider__knob" style="left:' + x(own) + '%"></span>';
    }
    return html;
  }

  /* Position among the comparison clubs, drawn the way the page is set to. */
  function viz(kind, own, values, alt) {
    var n = values.length;
    if (!n) return '';
    var med = D.median(values);
    return (vizMode === 'slider'
      ? '<div class="fb-slider" role="img" aria-label="' + esc(alt) + '">' + slider(values, own) + '</div>'
      : '<div class="fb-bars" role="img" aria-label="' + esc(alt) + '">' + bars(values, own) + '</div>') +
      '<dl class="fb-range">' +
        '<div><dt>Lowest</dt><dd>' + esc(D.format(kind, values[0])) + '</dd></div>' +
        '<div><dt>Median</dt><dd>' + esc(D.format(kind, med)) + '</dd></div>' +
        '<div><dt>Highest</dt><dd>' + esc(D.format(kind, values[n - 1])) + '</dd></div>' +
      '</dl>';
  }

  /* One figure: label, the club's number, where it sits. `m.rank` adds its
     place by size (budgets only — see FBData.rankOf). */
  function figure(m, label, own, values, who, cls) {
    var vs = D.againstMedian(m.kind, own, D.median(values), who);
    var num = own == null ? '<span class="fb-card__none">No figure</span>' : esc(D.format(m.kind, own));
    var r = m.rank ? D.rankOf(values, own) : null;
    var alt = label + ': ' + (own == null ? 'no figure' : D.format(m.kind, own)) + (vs ? ', ' + vs : '') + '.';
    return '<h3 class="fb-card__label">' + esc(label) + '</h3>' +
      '<div class="fb-card__head">' +
        '<div class="fb-card__num' + (cls ? ' ' + cls : '') + '">' + num + '</div>' +
        (r ? '<div class="fb-rank"><b>' + D.ordinal(r.rank) + '</b> of ' + r.of + ' by size</div>' : '') +
      '</div>' +
      '<div class="fb-card__vs">' + esc(vs) + '</div>' +
      viz(m.kind, own, values, alt);
  }

  function card(m, label, own, values, who, cls) {
    return '<article class="fb-card">' + figure(m, label, own, values, who, cls) + '</article>';
  }

  /* A budget with its own progress beside it: how big, then how far through. */
  function panel(pn, byKey, own, bench, who, q) {
    var b = byKey[pn.budget], a = byKey[pn.actual], p = byKey[pn.pct];
    var pv = own[p.key], av = own[a.key], values = D.list(bench[p.key]);
    var vs = D.againstMedian('pct', pv, D.median(values), who);
    var label = pn.pctLabel.replace('{Q}', q);
    return '<article class="fb-panel">' +
      '<h3 class="fb-panel__head">' + esc(pn.title) + '</h3>' +
      '<div class="fb-panel__body">' +
        '<div class="fb-fig">' + figure(b, b.label, own[b.key], D.list(bench[b.key]), who) + '</div>' +
        '<div class="fb-fig fb-fig--todate">' +
          '<h3 class="fb-card__label">' + esc(q + ' to date') + '</h3>' +
          '<div class="fb-card__head">' +
            '<div class="fb-card__num">' + (pv == null ? '<span class="fb-card__none">No figure</span>' : esc(D.percent(pv))) + '</div>' +
            (av == null ? '' : '<div class="fb-rank"><b>' + esc(D.money(av)) + '</b> ' + esc(pn.actualLabel) + '</div>') +
          '</div>' +
          '<div class="fb-card__vs">' + esc(vs) + '</div>' +
          viz('pct', pv, values, label + ': ' + (pv == null ? 'no figure' : D.percent(pv)) + (vs ? ', ' + vs : '') + '.') +
        '</div>' +
      '</div>' +
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

    controls += '<div class="fb-control"><span class="fb-control__label">Show position as</span>' +
      '<div class="tabs fb-viztabs" role="tablist" aria-label="Show position as">' +
        ['bars', 'slider'].map(function (v) {
          return '<button type="button" class="tab' + (v === vizMode ? ' active' : '') + '" role="tab" aria-selected="' +
            (v === vizMode) + '" data-fb-viz="' + v + '">' + (v === 'bars' ? 'Bars' : 'Slider') + '</button>';
        }).join('') + '</div></div>';

    var n = 0;
    Object.keys(bench).forEach(function (k) { n = Math.max(n, D.list(bench[k]).length); });

    var byKey = {};
    D.metricsOf(set).forEach(function (m) { byKey[m.key] = m; });
    var body;
    if (def.panels) {
      /* The ratio leads, then each budget with its progress. */
      body = '<section class="fb-group">' +
          '<div class="section-head"><h2>' + esc(def.lead.title) + '</h2></div>' +
          '<div class="fb-grid fb-grid--2">' + def.lead.metrics.map(function (l) {
            var m = byKey[l.key];
            return card(m, l.label.replace('{Q}', q), own[m.key], D.list(bench[m.key]), who, 'fb-card__num--lead');
          }).join('') + '</div>' +
        '</section>' +
        '<section class="fb-group"><div class="fb-grid fb-grid--2">' + def.panels.map(function (pn) {
          return panel(pn, byKey, own, bench, who, q);
        }).join('') + '</div></section>';
    } else {
      body = def.groups.map(function (g) {
        return '<section class="fb-group">' +
          '<div class="section-head"><h2>' + esc(g.title) + '</h2></div>' +
          '<div class="fb-grid">' + g.metrics.map(function (m) {
            return card(m, m.label.replace('{Q}', q), own[m.key], D.list(bench[m.key]), who);
          }).join('') + '</div>' +
        '</section>';
      }).join('');
    }

    mount.innerHTML =
      '<div class="fb-view">' +
        (controls ? '<div class="fb-controls">' + controls + '</div>' : '') +
        body +
        (n ? '<p class="fb-key"><span class="fb-key__own"></span>Your club' +
             (vizMode === 'slider' ? '' : '<span class="fb-key__other"></span>' +
               esc(n > 1 ? 'The other ' + (n - 1) + ' ' + who + ' clubs' : 'Other clubs')) +
             '<span class="fb-key__median"></span>Median</p>' : '') +
      '</div>';

    var sel = mount.querySelector('[data-fb-return]');
    if (sel) sel.addEventListener('change', function () { if (o.onReturn) o.onReturn(sel.value); });
    mount.querySelectorAll('[data-fb-viz]').forEach(function (b) {
      b.addEventListener('click', function () {
        vizMode = b.getAttribute('data-fb-viz');
        render(mount, o);
        var t = mount.querySelector('[data-fb-viz="' + vizMode + '"]');
        if (t) t.focus();
      });
    });
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
