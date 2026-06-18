/* commercial-benchmarking/dashboard.js  v1.2
   Shared dashboard renderer for the Commercial Benchmarking tool. Pure
   rendering — no Firebase, no data loading. Both entry points use it:
     - index.html  (gated NL tool: staff picker / club's own row via auth-guard)
     - link.html   (public no-login capability link)

   CBDash.mount(AGG, clubs, opts)
     AGG    = { meta, aggregates:{<key>:{label,unit,desc,group,scopes:{...}}}, chips }
     clubs  = array of club payloads { club, division, fsSponsor, metrics, chips }
     opts   = { staff: bool }   // staff:true shows the club picker

   Operates on fixed IDs present in the page skeleton (#sections, #chips,
   #scopeSeg, #viewSeg, #clubPick, header fields). Topbar fields are optional
   (the gated tool uses nl-topbar instead) and updated only if present.
*/
window.CBDash = (function () {

  /* ---- recompute (mirrors scripts/build-benchmarks.py) ----
     One club's edit shifts the division/league medians, the sorted graph
     values, and every club's percentiles — so recompute the lot from the
     full clubs array before writing back. Used by the admin editor. */
  var SCOPES = ['National', 'North', 'South'];
  function r2(x) { return Math.round(x * 100) / 100; }
  function stats(vals) {
    vals = vals.slice().sort(function (a, b) { return a - b; });
    var n = vals.length; if (!n) return null;
    function q(p) {
      if (n === 1) return vals[0];
      var idx = p * (n - 1), lo = Math.floor(idx), hi = Math.min(lo + 1, n - 1);
      return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
    }
    return {
      count: n, min: vals[0], p25: r2(q(.25)), median: r2(q(.5)), p75: r2(q(.75)),
      max: vals[n - 1], mean: r2(vals.reduce(function (a, b) { return a + b; }, 0) / n),
      values: vals.map(r2)
    };
  }
  function pctOf(vals, x) {
    if (x == null || !vals.length) return null;
    var below = 0, eq = 0;
    vals.forEach(function (v) { if (v < x) below++; else if (v === x) eq++; });
    return Math.round(100 * (below + eq / 2) / vals.length);
  }
  function recompute(AGG, clubs) {
    Object.keys(AGG.aggregates).forEach(function (key) {
      var league = [], byDiv = { National: [], North: [], South: [] };
      clubs.forEach(function (c) {
        var m = c.metrics && c.metrics[key], v = m ? m.value : null;
        if (v != null) { league.push(v); if (byDiv[c.division]) byDiv[c.division].push(v); }
      });
      AGG.aggregates[key].scopes.league = stats(league);
      SCOPES.forEach(function (d) { AGG.aggregates[key].scopes[d] = stats(byDiv[d]); });
      AGG.aggregates[key].scopes.Step2 = stats(byDiv.North.concat(byDiv.South));
    });
    clubs.forEach(function (c) {
      Object.keys(AGG.aggregates).forEach(function (key) {
        var m = c.metrics && c.metrics[key]; if (!m) return;
        var lg = (AGG.aggregates[key].scopes.league || {}).values || [];
        var dv = (AGG.aggregates[key].scopes[c.division] || {}).values || [];
        m.divPct = pctOf(dv, m.value); m.leaguePct = pctOf(lg, m.value);
        if (c.division === 'North' || c.division === 'South') {
          m.step2Pct = pctOf((AGG.aggregates[key].scopes.Step2 || {}).values || [], m.value);
        }
      });
    });
    return AGG;
  }

  function mount(AGG, clubs, opts) {
    opts = opts || {};
    var OWN = clubs[0];
    var state = { scope: 'div', view: 'graph', cardView: {} };
    var $ = function (id) { return document.getElementById(id); };
    var editMode = false, ebtn = null;

    function fmt(v, u) {
      if (v == null) return '—';
      var s = Math.round(v).toLocaleString('en-GB');
      return u === '£' ? '£' + s : (u ? s + u : s);
    }
    function fmtShort(v, u) {
      if (v == null) return '—';
      var s, a = Math.abs(v);
      if (a >= 1e6) s = (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'm';
      else if (a >= 1000) s = (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k';
      else s = Math.round(v).toString();
      return (u === '£' ? '£' : '') + s + (u && u !== '£' ? u : '');
    }
    function band(pct) {
      if (pct == null) return { cls: 'na', txt: 'Not provided' };
      if (pct >= 75) return { cls: 'hi', txt: 'Top quartile' };
      if (pct >= 50) return { cls: 'hi', txt: 'Upper half' };
      if (pct >= 25) return { cls: 'mid', txt: 'Lower half' };
      return { cls: 'lo', txt: 'Bottom quartile' };
    }
    // scope model: 'div' (own division), 'step2' (North+South), 'league' (all)
    var DIV_FULL = { National: 'National League', North: 'National League North', South: 'National League South' };
    function divName(d) { return DIV_FULL[d] || d; }
    function scopeOptions() {
      if (OWN.division === 'National') return [{ k: 'div', l: divName('National') }, { k: 'league', l: 'All divisions' }];
      return [{ k: 'div', l: divName(OWN.division) }, { k: 'step2', l: 'Step 2' }, { k: 'league', l: 'All divisions' }];
    }
    function scopeKey() { return state.scope === 'league' ? 'league' : state.scope === 'step2' ? 'Step2' : OWN.division; }
    function pctSel(m, sel) { return sel === 'league' ? m.leaguePct : sel === 'step2' ? m.step2Pct : m.divPct; }
    function curScopeLabel() { var o = scopeOptions().filter(function (x) { return x.k === state.scope; })[0]; return o ? o.l : ''; }
    function scopeNoun() {
      return state.scope === 'league' ? 'clubs across all divisions'
        : state.scope === 'step2' ? 'Step 2 clubs'
        : divName(OWN.division) + ' clubs';
    }

    function rangeBar(agg, own) {
      var s = agg.scopes[scopeKey()], u = agg.unit;
      if (!s) return '<div class="hist-note">No benchmark for this group.</div>';
      var secSel = state.scope === 'league' ? 'div' : 'league';
      var o = agg.scopes[secSel === 'league' ? 'league' : OWN.division];
      var provided = own.value != null, left = 50;
      if (provided && s.max > s.min) left = 3 + 94 * Math.max(0, Math.min(1, (own.value - s.min) / (s.max - s.min)));
      var medLeft = s.max > s.min ? 3 + 94 * ((s.median - s.min) / (s.max - s.min)) : 50;
      var osLabel = secSel === 'league' ? 'All divisions' : divName(OWN.division);
      return '<div class="bar-wrap"><div class="bar">' +
        '<div class="median" style="left:' + medLeft.toFixed(1) + '%"></div>' +
        (provided ? '<div class="marker" style="left:' + left.toFixed(1) + '%"></div>' : '') +
        '</div><div class="scale">' +
        '<span>' + fmtShort(s.min, u) + '<b>Lowest</b></span>' +
        '<span class="mid">' + fmtShort(s.median, u) + '<b>Median</b></span>' +
        '<span style="text-align:right">' + fmtShort(s.max, u) + '<b>Highest</b></span>' +
        '</div><div class="league-line"><span>' + osLabel + ' median <b style="color:var(--text)">' +
        fmtShort(o.median, u) + '</b> (' + o.count + ' clubs)</span>' +
        '<span class="lg-pos">' + band(pctSel(own, secSel)).txt + '</span></div></div>';
    }

    // graph: one rising bar per club, this club's bar highlighted
    function clubBars(agg, own) {
      var s = agg.scopes[scopeKey()], u = agg.unit;
      if (!s) return '<div class="hist-note">No benchmark for this group.</div>';
      var vals = s.values || [], n = vals.length, maxv = s.max || 1, youIdx = -1;
      if (own.value != null && n) {
        var pct = pctSel(own, state.scope);
        var guess = pct == null ? -1 : Math.round((pct / 100) * (n - 1));
        var best = -1, bestD = Infinity;
        for (var i = 0; i < n; i++) {
          var d = Math.abs(vals[i] - own.value) + Math.abs(i - (guess < 0 ? i : guess)) * 1e-6;
          if (d < bestD) { bestD = d; best = i; }
        }
        youIdx = best;
      }
      var bars = '';
      for (var j = 0; j < n; j++) {
        var h = Math.round(6 + 92 * (vals[j] / maxv)), you = j === youIdx;
        bars += '<div class="hbar' + (you ? ' you' : '') + '" style="height:' + h + 'px" title="' + fmtShort(vals[j], u) + '">' +
          (you ? '<span class="youtag">You ' + fmtShort(own.value, u) + '</span>' : '') + '</div>';
      }
      var note;
      if (own.value != null) {
        var ratio = s.max > 0 ? Math.round(100 * own.value / s.max) : null;
        note = (own.value >= s.median ? 'Above' : 'Below') + ' the median (' + fmtShort(s.median, u) + ')';
        if (ratio != null) note += ' and at <b>' + ratio + '%</b> of the highest (' + fmtShort(s.max, u) + ')';
        note += ' &middot; ' + n + ' ' + scopeNoun() + ', lowest to highest.';
      } else {
        note = 'Not provided — distribution shown for ' + n + ' ' + scopeNoun() + ', lowest to highest.';
      }
      return '<div class="hist"><div class="hist-bars">' + bars + '</div><div class="hist-axis">' +
        '<span>' + fmtShort(s.min, u) + '<b>Lowest</b></span>' +
        '<span class="mid">' + fmtShort(s.median, u) + '<b>Median</b></span>' +
        '<span style="text-align:right">' + fmtShort(s.max, u) + '<b>Highest</b></span>' +
        '</div><div class="hist-note">' + note + '</div></div>';
    }

    function metricCard(key) {
      var agg = AGG.aggregates[key], own = (OWN.metrics && OWN.metrics[key]) || { value: null };
      var provided = own.value != null;
      var pct = pctSel(own, state.scope);
      var b = band(provided ? pct : null);
      var view = state.cardView[key] || state.view;
      var body = view === 'graph' ? clubBars(agg, own) : rangeBar(agg, own);
      var nextView = view === 'graph' ? 'bars' : 'graph';
      var icon = view === 'graph'
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="4" y1="20" x2="20" y2="20"/><line x1="4" y1="20" x2="4" y2="4"/><path d="M7 14l3-3 3 2 4-6"/></svg> Bars'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="11" width="3.5" height="9"/><rect x="10.25" y="6" width="3.5" height="14"/><rect x="16.5" y="13" width="3.5" height="7"/></svg> Graph';
      return '<div class="card"><div class="vtoggle"><button data-card="' + key + '" data-next="' + nextView + '">' + icon + '</button></div>' +
        '<div class="lab">' + agg.label + '</div><div class="desc">' + agg.desc + '</div>' +
        '<div class="value-row"><span class="value">' + (provided ? fmt(own.value, agg.unit) : '—') + '</span>' +
        '<span class="posn ' + b.cls + '">' + b.txt + '</span></div>' + body + '</div>';
    }

    function render() {
      var groups = [];
      Object.keys(AGG.aggregates).forEach(function (k) {
        var g = AGG.aggregates[k].group, grp = groups.filter(function (x) { return x.title === g; })[0];
        if (!grp) { grp = { title: g, keys: [] }; groups.push(grp); }
        grp.keys.push(k);
      });
      var scopeTxt = curScopeLabel();
      $('sections').innerHTML = groups.map(function (g) {
        var cards = g.keys.map(metricCard);
        CHIP_DEFS.filter(function (d) { return d.group === g.title; }).forEach(function (d) { cards.push(chipCard(d)); });
        return '<div class="section"><div class="section-head"><h2>' + g.title + '</h2>' +
          '<span class="count">vs ' + scopeTxt + '</span></div>' +
          '<div class="grid">' + cards.join('') + '</div></div>';
      }).join('');
    }

    function chipNarrative(kind) {
      var d = AGG.chips || {};
      function tot(o) { return Object.keys(o || {}).reduce(function (a, k) { return a + o[k]; }, 0); }
      if (kind === 'progFormat') return 'Most clubs print — ' + ((d.progFormat || {}).Printed || 0) + ' printed, ' + ((d.progFormat || {}).Digital || 0) + ' digital, ' + ((d.progFormat || {}).Both || 0) + ' both';
      if (kind === 'rollingFront') return 'Only ' + ((d.rollingFront || {}).Yes || 0) + ' of ' + tot(d.rollingFront) + ' clubs run a rolling front-shirt deal';
      if (kind === 'emailSupporters') return 'Can email their own supporters — ' + ((d.emailSupporters || {}).Yes || 0) + ' of ' + tot(d.emailSupporters) + ' clubs can';
      if (kind === 'emailPartners') return 'Email on behalf of partners — ' + ((d.emailPartners || {}).Yes || 0) + ' of ' + tot(d.emailPartners) + ' clubs can';
      return '';
    }
    // categorical fields, folded into the relevant metric group as cards
    var CHIP_DEFS = [
      { kind: 'rollingFront', group: 'Shirt & kit sponsorship', label: 'Front-shirt deal' },
      { kind: 'progFormat', group: 'Audience & reach', label: 'Programme format' },
      { kind: 'emailSupporters', group: 'Audience & reach', label: 'Email supporters' },
      { kind: 'emailPartners', group: 'Audience & reach', label: 'Email partner offers' }
    ];
    function chipValue(kind) {
      var c = OWN.chips || {};
      var yn = function (x, on, off) { return x === 'Yes' ? on : (x ? off : '—'); };
      if (kind === 'rollingFront') return yn(c.rollingFront, 'Rolling', 'Fixed term');
      if (kind === 'progFormat') return c.progFormat || '—';
      if (kind === 'emailSupporters') return yn(c.emailSupporters, 'Enabled', 'Not enabled');
      if (kind === 'emailPartners') return yn(c.emailPartners, 'Enabled', 'Not enabled');
      return '—';
    }
    function chipCard(def) {
      return '<div class="card chip-card"><div class="lab">' + def.label + '</div>' +
        '<div class="chip-val">' + chipValue(def.kind) + '</div>' +
        '<div class="chip-note">' + chipNarrative(def.kind) + '</div></div>';
    }

    function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
    function renderHeader() {
      var crest = $('crest');
      if (crest) {
        crest.src = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/' + encodeURIComponent(OWN.club) + '.png';
        crest.alt = OWN.club;
      }
      setText('clubName', OWN.club);
      setText('divPill', divName(OWN.division));
      var sponWrap = $('sponWrap');
      if (sponWrap) {
        sponWrap.style.display = '';
        var spon = function (lab, v) { return lab + ': <b>' + (v && String(v).trim() ? v : '—') + '</b>'; };
        sponWrap.innerHTML = [spon('Front', OWN.fsSponsor), spon('Back', OWN.bsSponsor), spon('Sleeve', OWN.slSponsor)].join(' &nbsp;·&nbsp; ');
      }
      setText('dvn', AGG.meta.divN[OWN.division]);
      setText('divName', divName(OWN.division));
      setText('tbClub', OWN.club);
    }

    function renderScopeControl() {
      var opts = scopeOptions();
      if (!opts.some(function (o) { return o.k === state.scope; })) state.scope = 'div';
      $('scopeSeg').innerHTML = opts.map(function (o) {
        return '<button data-scope="' + o.k + '"' + (o.k === state.scope ? ' class="on"' : '') + '>' + o.l + '</button>';
      }).join('');
    }

    // Sponsor-sector donut: top sectors + own (force-shown) + Other; own slice red.
    var SECTOR_PALETTE = ['var(--navy)', 'var(--blue)', 'var(--green)', 'var(--amber)',
      'var(--purple)', 'var(--navy-300)', 'var(--blue-light)', 'var(--navy-600)'];
    function donutBlock(title, dist, ownStr) {
      if (!dist) return '';
      var own = (ownStr || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      var entries = Object.keys(dist).map(function (k) { return { label: k, count: dist[k] }; })
        .sort(function (a, b) { return b.count - a.count; });
      var total = entries.reduce(function (a, e) { return a + e.count; }, 0);
      if (!total) return '';
      var keep = {};
      entries.slice(0, 7).forEach(function (e) { keep[e.label] = e.count; });
      own.forEach(function (o) { if (dist[o] != null) keep[o] = dist[o]; });
      var shown = Object.keys(keep).map(function (k) { return { label: k, count: keep[k] }; })
        .sort(function (a, b) { return b.count - a.count; });
      var other = total - shown.reduce(function (a, e) { return a + e.count; }, 0);
      var segs = shown.slice();
      if (other > 0) segs.push({ label: 'Other', count: other, other: true });
      var r = 54, cx = 64, cy = 64, sw = 22, C = 2 * Math.PI * r, off = 0, pi = 0, arcs = '';
      segs.forEach(function (s) {
        var len = s.count / total * C, isOwn = own.indexOf(s.label) >= 0;
        s._c = isOwn ? 'var(--primary)' : (s.other ? 'var(--navy-100)' : SECTOR_PALETTE[pi++ % SECTOR_PALETTE.length]);
        s._own = isOwn;
        arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s._c +
          '" stroke-width="' + (isOwn ? sw + 5 : sw) + '" stroke-dasharray="' + len.toFixed(2) + ' ' +
          (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"></circle>';
        off += len;
      });
      var legend = segs.map(function (s) {
        var pct = Math.round(100 * s.count / total);
        return '<div class="cb-leg' + (s._own ? ' own' : '') + '"><span class="cb-leg-sw" style="background:' + s._c + '"></span>' +
          '<span class="cb-leg-lab">' + s.label + '</span><span class="cb-leg-n">' + s.count + ' (' + pct + '%)</span></div>';
      }).join('');
      return '<div class="cb-sector"><div class="cb-sector-h">' + title + '</div><div class="cb-sector-body">' +
        '<div class="cb-donut"><svg viewBox="0 0 128 128" width="128" height="128" style="transform:rotate(-90deg)">' + arcs + '</svg>' +
        '<div class="cb-donut-center"><span class="cb-donut-k">Your sector</span><span class="cb-donut-v">' +
        (own.length ? own.join(', ') : 'Not provided') + '</span></div></div>' +
        '<div class="cb-legend">' + legend + '</div></div></div>';
    }
    function renderSectors() {
      var host = $('sectorChart'), section = $('sectorSection');
      if (!host) return;
      var S = AGG.sectors;
      if (!S) { if (section) section.style.display = 'none'; return; }
      if (section) section.style.display = '';
      host.innerHTML =
        donutBlock('Front of shirt', S.front, OWN.fsSector) +
        donutBlock('Back of shirt', S.back, OWN.bsSector) +
        donutBlock('Sleeve', S.sleeve, OWN.slSector);
    }

    function renderAll() { renderHeader(); renderScopeControl(); renderSectors(); render(); }

    function setEditUI() { if (ebtn) ebtn.textContent = editMode ? 'Cancel edit' : 'Edit data'; }

    function groupedKeys() {
      var groups = [];
      Object.keys(AGG.aggregates).forEach(function (k) {
        var g = AGG.aggregates[k].group, grp = groups.filter(function (x) { return x.title === g; })[0];
        if (!grp) { grp = { title: g, keys: [] }; groups.push(grp); }
        grp.keys.push(k);
      });
      return groups;
    }

    function renderEditForm() {
      var body = groupedKeys().map(function (g) {
        return '<div class="section"><div class="section-head"><h2>' + g.title + '</h2></div>' +
          '<div class="cb-edit-grid">' + g.keys.map(function (k) {
            var agg = AGG.aggregates[k], m = OWN.metrics[k] || (OWN.metrics[k] = { value: null });
            var u = (agg.unit || '').trim(), np = m.value == null;
            return '<div class="cb-edit-row"><span class="cb-edit-lab">' + agg.label + (u ? ' (' + u + ')' : '') + '</span>' +
              '<span class="cb-edit-ctl">' +
                '<input type="number" step="any" data-ekey="' + k + '" value="' + (np ? '' : m.value) + '"' + (np ? ' disabled' : '') + '>' +
                '<label class="cb-np"><input type="checkbox" data-np="' + k + '"' + (np ? ' checked' : '') + '> n/p</label>' +
              '</span></div>';
          }).join('') + '</div></div>';
      }).join('');
      body += '<div class="cb-edit-actions"><button id="cb-save" class="cb-edit-btn" type="button">Save changes</button>' +
        '<button id="cb-cancel" class="cb-cancel" type="button">Cancel</button>' +
        '<span id="cb-editnote">Editing <b>' + OWN.club + '</b> — tick <b>n/p</b> for not provided; 0 is a real zero. Saving recomputes all benchmarks.</span></div>';
      $('sections').innerHTML = body;
      $('sections').onchange = function (e) {
        var cb = e.target, key = cb.getAttribute && cb.getAttribute('data-np');
        if (key == null) return;
        var inp = $('sections').querySelector('input[data-ekey="' + key + '"]');
        if (inp) { inp.disabled = cb.checked; if (!cb.checked) { inp.focus(); } }
      };
      $('cb-cancel').onclick = function () { editMode = false; setEditUI(); render(); };
      $('cb-save').onclick = doSave;
    }

    function doSave() {
      [].forEach.call($('sections').querySelectorAll('input[data-ekey]'), function (inp) {
        var k = inp.getAttribute('data-ekey');
        var np = $('sections').querySelector('input[data-np="' + k + '"]');
        if (np && np.checked) { OWN.metrics[k].value = null; }
        else { var raw = inp.value.trim(); OWN.metrics[k].value = raw === '' ? 0 : Number(raw); }
      });
      recompute(AGG, clubs);
      $('cb-save').disabled = true; $('cb-editnote').textContent = 'Saving…';
      Promise.resolve(opts.onSave(AGG, clubs)).then(function () {
        editMode = false; setEditUI(); renderAll();
        if (window.NL && NL.toast) NL.toast('Saved ' + OWN.club);
      }, function (e) {
        console.error(e); $('cb-save').disabled = false;
        $('cb-editnote').textContent = 'Save failed — please try again.';
      });
    }

    function exportData() {
      var keys = Object.keys(AGG.aggregates);
      function cell(s) { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
      var chipCols = [['progFormat', 'Programme format'], ['rollingFront', 'Front-shirt rolling?'],
        ['emailSupporters', 'Can email supporters?'], ['emailPartners', 'Can email partners?']];
      var header = ['Club', 'Division'].concat(keys.map(function (k) {
        var u = (AGG.aggregates[k].unit || '').trim(); return AGG.aggregates[k].label + (u ? ' (' + u + ')' : '');
      })).concat(chipCols.map(function (c) { return c[1]; }));
      var lines = [header.map(cell).join(',')];
      clubs.forEach(function (c) {
        var row = [c.club, c.division];
        keys.forEach(function (k) { var m = c.metrics && c.metrics[k]; row.push(m && m.value != null ? m.value : ''); });
        chipCols.forEach(function (cc) { row.push((c.chips && c.chips[cc[0]]) || ''); });
        lines.push(row.map(cell).join(','));
      });
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'commercial-benchmarking-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    if (opts.staff) {
      var updateShare = function () {};
      var staffCtl = $('staffCtl');
      if (staffCtl) {
        staffCtl.style.display = '';
        var sel = $('clubPick'), html = '', curDiv = '';
        clubs.forEach(function (c, i) {
          if (c.division !== curDiv) { if (curDiv) html += '</optgroup>'; html += '<optgroup label="' + c.division + ' League">'; curDiv = c.division; }
          html += '<option value="' + i + '">' + c.club + '</option>';
        });
        html += '</optgroup>';
        sel.innerHTML = html;
        sel.addEventListener('change', function () { OWN = clubs[+this.value]; if (editMode) { editMode = false; setEditUI(); } renderAll(); updateShare(); });

        // Staff: show the selected club's no-login capability link to copy & send.
        if (opts.tokenByClub) {
          var ctl = document.createElement('div');
          ctl.className = 'cb-ctl'; ctl.id = 'cb-shareCtl';
          ctl.innerHTML = '<span class="lbl">Club link</span>' +
            '<input id="cb-shareUrl" class="cb-shareurl" readonly>' +
            '<button id="cb-shareCopy" class="cb-copy" type="button">Copy</button>';
          staffCtl.parentNode.insertBefore(ctl, staffCtl.nextSibling);
          var urlEl = $('cb-shareUrl'), copyBtn = $('cb-shareCopy');
          updateShare = function () {
            var tok = opts.tokenByClub[OWN.club];
            urlEl.value = tok ? new URL('link.html?t=' + tok, location.href).href : 'No link for this club';
            copyBtn.disabled = !tok;
          };
          copyBtn.addEventListener('click', function () {
            if (copyBtn.disabled) return;
            var done = function () { copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500); };
            if (navigator.clipboard) navigator.clipboard.writeText(urlEl.value).then(done, function () { urlEl.select(); document.execCommand('copy'); done(); });
            else { urlEl.select(); document.execCommand('copy'); done(); }
          });
          updateShare();
        }

        var actions = document.createElement('div');
        actions.className = 'cb-ctl'; actions.style.marginLeft = 'auto'; actions.style.gap = '8px';
        var xbtn = document.createElement('button');
        xbtn.type = 'button'; xbtn.className = 'cb-cancel'; xbtn.textContent = 'Export (Excel)';
        xbtn.addEventListener('click', exportData);
        actions.appendChild(xbtn);
        if (opts.canEdit) {
          ebtn = document.createElement('button');
          ebtn.type = 'button'; ebtn.className = 'cb-edit-btn'; ebtn.textContent = 'Edit data';
          ebtn.addEventListener('click', function () {
            editMode = !editMode; setEditUI();
            if (editMode) renderEditForm(); else render();
          });
          actions.appendChild(ebtn);
        }
        var controls = staffCtl.parentNode; if (controls) controls.appendChild(actions);
      }
      var pt = $('privacyTxt');
      if (pt) pt.innerHTML = '<b>NL staff view.</b> You can see every club’s named figures here, and copy a club’s private no-login link to send them. Clubs only ever see their own data plus anonymous benchmarks.';
    }

    $('scopeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.scope = b.dataset.scope;
      [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      render();
    });
    $('viewSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.view = b.dataset.view; state.cardView = {};
      [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      render();
    });
    $('sections').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-card]'); if (!b) return;
      state.cardView[b.dataset.card] = b.dataset.next; render();
    });

    setText('lgn', AGG.meta.leagueN);
    renderAll();
  }

  return { mount: mount, recompute: recompute };
})();
