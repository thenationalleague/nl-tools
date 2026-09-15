/* commercial-benchmarking/dashboard.js  v1.4
   Shared dashboard renderer for the Commercial Benchmarking tool. Pure
   rendering — no Firebase, no data loading. Both entry points use it:
     - index.html  (gated NL tool: staff picker / club's own row via auth-guard)
     - link.html   (public no-login capability link)

   CBDash.mount(AGG, clubs, opts)
     AGG    = { meta, aggregates:{<key>:{label,unit,desc,group,scopes:{...}}}, chips }
     clubs  = array of club payloads { club, division, fsSponsor, metrics, chips }
     opts   = { staff, canEdit, onSave(AGG, clubs), writeLink(token, payload),
                tokenByClub, confirmByClub }
              staff:true shows the club picker; canEdit + onSave enable the
              editor and Import rows; writeLink enables the link manager.
   CBDash.importRows(AGG, clubs, rows, {dryRun, replace}) — see the function.

   Operates on fixed IDs present in the page skeleton (#sections, #chips,
   #scopeSeg, #viewSeg, #clubPick, header fields). Topbar fields are optional
   (the gated tool uses nl-topbar instead) and updated only if present.
*/
window.CBDash = (function () {

  // One escaper for the whole file: NL.escHtml where nl-utils is loaded
  // (index.html), the same rule inline for link.html, which does not load it.
  function esc(s) {
    s = String(s == null ? '' : s);
    if (window.NL && NL.escHtml) return NL.escHtml(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var DIV_FULL = { National: 'National League', North: 'National League North', South: 'National League South' };
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

  // Rebuild the anonymised sector distributions from the (possibly edited) club
  // rows so the donuts stay accurate after a staff edit. Mirrors the Python
  // sector_dist / sector_dist_multi: counts only, sorted most-common first.
  function recomputeSectors(AGG, clubs) {
    function toArr(d) {
      return Object.keys(d).map(function (k) { return { label: k, count: d[k] }; })
        .sort(function (a, b) { return b.count - a.count; });
    }
    function single(field) {
      var d = {};
      clubs.forEach(function (c) { var v = (c[field] || '').trim(); if (v) d[v] = (d[v] || 0) + 1; });
      return toArr(d);
    }
    var st = {};
    clubs.forEach(function (c) {
      (c.standSectors || '').split('|').forEach(function (p) { p = p.trim(); if (p) st[p] = (st[p] || 0) + 1; });
    });
    AGG.sectors = AGG.sectors || {};
    AGG.sectors.front = single('fsSector');
    AGG.sectors.back = single('bsSector');
    AGG.sectors.sleeve = single('slSector');
    AGG.sectors.stand = toArr(st);
    return AGG;
  }

  // Rebuild the categorical chip distributions (programme format, rolling
  // flags, email permissions) from the club rows after a staff edit, so the
  // chip cards' "N of M clubs" narratives stay accurate.
  function recomputeChips(AGG, clubs) {
    var kinds = ['progFormat', 'rollingFront', 'rollingBack', 'rollingSleeve', 'emailSupporters', 'emailPartners'];
    var out = {};
    kinds.forEach(function (k) { out[k] = {}; });
    clubs.forEach(function (c) {
      var ch = c.chips || {};
      kinds.forEach(function (k) {
        var v = ch[k]; if (v == null) return; v = String(v).trim(); if (!v) return;
        out[k][v] = (out[k][v] || 0) + 1;
      });
    });
    AGG.chips = out;
    return AGG;
  }

  // Bring late club returns into the live set. `rows` is the array written by
  // scripts/build-benchmark-rows.py: one payload per club in the stored shape,
  // with metric values but no percentiles. Every row is checked against the
  // roster and the metric list before anything changes, so a bad paste fails
  // whole rather than half-applying. With {dryRun:true} nothing is mutated —
  // the result still says what would happen. A club that already has data is
  // refused unless {replace:true}. On success the aggregates, sector and chip
  // distributions, percentiles for EVERY club, the roster flags and the
  // response counts are all recomputed from the merged set.
  function importRows(AGG, clubs, rows, opts) {
    opts = opts || {};
    var res = { ok: false, added: [], replaced: [], errors: [] };
    if (!AGG || !AGG.aggregates) { res.errors.push('Benchmark data isn’t loaded.'); return res; }
    if (!Array.isArray(rows) || !rows.length) { res.errors.push('Expected a JSON array of club rows.'); return res; }
    var rosterByClub = {};
    (AGG.roster || []).forEach(function (e) { rosterByClub[e.club] = e; });
    var idxByClub = {};
    clubs.forEach(function (c, i) { idxByClub[c.club] = i; });
    var plan = [], seen = {};
    rows.forEach(function (r, i) {
      if (!r || typeof r !== 'object' || typeof r.club !== 'string' || !r.club.trim()) {
        res.errors.push('Row ' + (i + 1) + ': no club name'); return;
      }
      var club = r.club.trim();
      if (seen[club]) { res.errors.push(club + ': listed twice'); return; }
      seen[club] = true;
      var ros = rosterByClub[club];
      if (AGG.roster && !ros) { res.errors.push(club + ': not on the roster'); return; }
      if (ros && ros.division !== r.division) {
        res.errors.push(club + ': division “' + r.division + '” — the roster says “' + ros.division + '”'); return;
      }
      if (!ros && SCOPES.indexOf(r.division) < 0) { res.errors.push(club + ': unknown division “' + r.division + '”'); return; }
      if (!r.metrics || typeof r.metrics !== 'object') { res.errors.push(club + ': no metrics'); return; }
      var unknown = [], bad = [];
      Object.keys(r.metrics).forEach(function (k) {
        if (!AGG.aggregates[k]) { unknown.push(k); return; }
        var v = r.metrics[k] && r.metrics[k].value;
        if (!(v == null || (typeof v === 'number' && isFinite(v)))) bad.push(k);
      });
      if (unknown.length) { res.errors.push(club + ': unknown metric' + (unknown.length > 1 ? 's' : '') + ' ' + unknown.join(', ')); return; }
      if (bad.length) { res.errors.push(club + ': non-numeric value for ' + bad.join(', ')); return; }
      if (!hasData(r)) { res.errors.push(club + ': no figures'); return; }
      var existing = idxByClub[club] != null ? clubs[idxByClub[club]] : null;
      var replacing = !!(existing && hasData(existing));
      if (replacing && !opts.replace) { res.errors.push(club + ': already has data — tick Replace to overwrite it'); return; }
      plan.push({ row: r, club: club, existing: existing, replacing: replacing });
    });
    if (res.errors.length) return res;
    plan.forEach(function (p) { res[p.replacing ? 'replaced' : 'added'].push(p.club); });
    res.ok = true;
    if (opts.dryRun) return res;

    var KEEP = ['division', 'fsSponsor', 'bsSponsor', 'slSponsor', 'fsSector', 'bsSector', 'slSector',
      'fsStart', 'bsStart', 'slStart', 'stands', 'standSectors', 'chips'];
    plan.forEach(function (p) {
      var r = p.row, rec = { club: p.club, metrics: {} };
      KEEP.forEach(function (k) { if (r[k] !== undefined) rec[k] = r[k]; });
      rec.chips = rec.chips || {};
      rec.stands = rec.stands || [];
      rec.standSectors = rec.standSectors || '';
      // values only — recompute below assigns the percentiles
      Object.keys(r.metrics).forEach(function (k) { rec.metrics[k] = { value: r.metrics[k].value == null ? null : r.metrics[k].value }; });
      rec._noData = false;
      if (p.existing) clubs[idxByClub[p.club]] = rec;
      else clubs.push(rec);
      if (rosterByClub[p.club]) rosterByClub[p.club].data = true;
    });
    if (!AGG.roster) {
      var DIV_ORDER = { National: 0, North: 1, South: 2 };
      clubs.sort(function (a, b) { return (DIV_ORDER[a.division] - DIV_ORDER[b.division]) || a.club.localeCompare(b.club); });
    }
    recompute(AGG, clubs);
    recomputeSectors(AGG, clubs);
    recomputeChips(AGG, clubs);
    // response counts: clubs with figures, per division — the footer's "N responding clubs"
    var meta = AGG.meta || (AGG.meta = {});
    meta.divN = { National: 0, North: 0, South: 0 };
    meta.leagueN = 0;
    clubs.forEach(function (c) {
      if (!hasData(c)) return;
      meta.leagueN++;
      if (meta.divN[c.division] != null) meta.divN[c.division]++;
    });
    return res;
  }

  // Whether a club has actually submitted usable commercial data. Mirrors the
  // Python has_data(): any metric other than standCount (which is always 0–4,
  // never null) carries a value. Used to lock out the "no data submitted"
  // cohort from their own dashboard.
  function hasData(own) {
    if (!own || !own.metrics) return false;
    return Object.keys(own.metrics).some(function (k) {
      return k !== 'standCount' && own.metrics[k] && own.metrics[k].value != null;
    });
  }

  // Shown to a club whose data hasn't been submitted — they must request access.
  var NO_DATA = {
    title: 'Benchmarking not available yet',
    body: 'Your club hasn’t submitted its commercial data yet, so there’s nothing to benchmark. ' +
      'To get access, email <a href="mailto:commercial@thenationalleague.org.uk">commercial@thenationalleague.org.uk</a> ' +
      'and the League’s commercial team will get you set up.'
  };

  function mount(AGG, clubs, opts) {
    opts = opts || {};
    var OWN = clubs[0];
    var state = { scope: 'div', view: 'graph', cardView: {} };
    var $ = function (id) { return document.getElementById(id); };
    var editMode = false, ebtn = null;
    var clubByName = {}; clubs.forEach(function (c) { clubByName[c.club] = c; });

    function fmt(v, u) {
      if (v == null) return '—';
      if (u === '£') return '£' + Math.round(v).toLocaleString('en-GB');
      var n = (Math.abs(v - Math.round(v)) > 1e-9) ? Number(v.toFixed(1)) : Math.round(v);
      var s = n.toLocaleString('en-GB');
      return u ? s + u : s;
    }
    function fmtShort(v, u) {
      if (v == null) return '—';
      var s, a = Math.abs(v);
      if (a >= 1e6) s = (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'm';
      else if (a >= 1000) s = (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k';
      else s = (Math.abs(v - Math.round(v)) > 1e-9) ? v.toFixed(1) : Math.round(v).toString();
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
      var provided = own.value != null, left = 50;
      if (provided && s.max > s.min) left = 3 + 94 * Math.max(0, Math.min(1, (own.value - s.min) / (s.max - s.min)));
      var medLeft = s.max > s.min ? 3 + 94 * ((s.median - s.min) / (s.max - s.min)) : 50;
      // Only ever the selected scope — no secondary cross-reference line.
      return '<div class="bar-wrap"><div class="bar">' +
        '<div class="median" style="left:' + medLeft.toFixed(1) + '%"></div>' +
        (provided ? '<div class="marker" style="left:' + left.toFixed(1) + '%"></div>' : '') +
        '</div><div class="scale">' +
        '<span>' + fmtShort(s.min, u) + '<b>Lowest</b></span>' +
        '<span class="mid">' + fmtShort(s.median, u) + '<b>Median</b></span>' +
        '<span style="text-align:right">' + fmtShort(s.max, u) + '<b>Highest</b></span>' +
        '</div></div>';
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
        note = (own.value > s.median ? 'Above' : own.value < s.median ? 'Below' : 'On') + ' the median (' + fmtShort(s.median, u) + ')';
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
      var sc = agg.scopes[scopeKey()];
      var onMedian = provided && sc && own.value === sc.median;
      var b = !provided ? band(null) : (onMedian ? { cls: 'mid', txt: 'On the median' } : band(pct));
      var view = state.cardView[key] || state.view;
      var body = view === 'graph' ? clubBars(agg, own) : rangeBar(agg, own);
      var nextView = view === 'graph' ? 'bars' : 'graph';
      var icon = view === 'graph'
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="4" y1="20" x2="20" y2="20"/><line x1="4" y1="20" x2="4" y2="4"/><path d="M7 14l3-3 3 2 4-6"/></svg> Bars'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="11" width="3.5" height="9"/><rect x="10.25" y="6" width="3.5" height="14"/><rect x="16.5" y="13" width="3.5" height="7"/></svg> Graph';
      var roll = TERM_ROLL[key];
      var rollPill = roll ? '<span class="posn roll">' + chipValue(roll) + '</span>' : '';
      var sponName = SPONSOR_OF[key] ? OWN[SPONSOR_OF[key]] : '';
      var sponLine = sponName ? '<div class="cb-cardspon">' + sponName + '</div>' : '';
      return '<div class="card"><div class="vtoggle"><button data-card="' + key + '" data-next="' + nextView + '">' + icon + '</button></div>' +
        '<div class="lab">' + agg.label + '</div>' + sponLine + '<div class="desc">' + agg.desc + '</div>' +
        '<div class="value-row"><span class="value">' + (provided ? fmt(own.value, agg.unit) : '—') + '</span>' +
        '<span class="posn ' + b.cls + '">' + b.txt + '</span>' + rollPill + '</div>' + body + '</div>';
    }

    // metric content without the card wrapper (for the composite shirt cards)
    function metricBody(key, sublabel) {
      var agg = AGG.aggregates[key], own = (OWN.metrics && OWN.metrics[key]) || { value: null };
      var provided = own.value != null;
      var pct = pctSel(own, state.scope);
      var sc = agg.scopes[scopeKey()];
      var onMedian = provided && sc && own.value === sc.median;
      var b = !provided ? band(null) : (onMedian ? { cls: 'mid', txt: 'On the median' } : band(pct));
      var view = state.cardView[key] || state.view;
      var body = view === 'graph' ? clubBars(agg, own) : rangeBar(agg, own);
      var nextView = view === 'graph' ? 'bars' : 'graph';
      var roll = TERM_ROLL[key];
      var rollPill = roll ? '<span class="posn roll">' + chipValue(roll) + '</span>' : '';
      return '<div class="cb-sm"><div class="cb-sm-head"><span class="cb-sm-lab">' + sublabel + '</span>' +
        '<button class="cb-sm-toggle" data-card="' + key + '" data-next="' + nextView + '">' + (view === 'graph' ? 'Bars' : 'Graph') + '</button></div>' +
        '<div class="value-row"><span class="value">' + (provided ? fmt(own.value, agg.unit) : '—') + '</span>' +
        '<span class="posn ' + b.cls + '">' + b.txt + '</span>' + rollPill + '</div>' + body + '</div>';
    }

    // one card per shirt placement: prominent sponsor + income + deal length + sector donut
    function cleanSpon(v) {
      if (v == null) return '';
      var s = String(v).trim();
      return /^(0|-|–|—|n\/?a|none|nil|tbc|tbd|n\.?a\.?|vacant)$/i.test(s) ? '' : s;
    }
    function shirtSlotCard(sl) {
      var spon = cleanSpon(OWN[sl.sponKey]);
      var head = '<div class="cb-slot-head"><span class="cb-slot-kind">' + sl.kind + '</span>' +
        '<span class="cb-slotspon' + (spon ? '' : ' cb-slotspon-none') + '">' + (spon || 'No sponsor named') + '</span></div>';
      var tenure = '';
      if (spon) {
        var startTxt = monthYear(OWN[sl.startKey]);
        var rollingYes = ((OWN.chips || {})[sl.rollKey] || '').trim().toLowerCase() === 'yes';
        var termV = (OWN.metrics && OWN.metrics[sl.termKey]) ? OWN.metrics[sl.termKey].value : null;
        var endTxt = rollingYes ? '' : expiry(OWN[sl.startKey], termV);
        var parts = [];
        if (startTxt) parts.push('Since <b>' + startTxt + '</b>');
        if (rollingYes) parts.push('<b>rolling</b>');
        else if (endTxt) parts.push('expires <b>' + endTxt + '</b>');
        if (parts.length) tenure = '<div class="cb-slot-tenure">' + parts.join(' &middot; ') + '</div>';
      }
      // dates live with Deal length, not under the sponsor pill
      var dealCell = '<div class="cb-slot-deal">' + metricBody(sl.termKey, 'Deal length') + tenure + '</div>';
      var metrics = '<div class="cb-slot-metrics">' + metricBody(sl.incomeKey, 'Income') + dealCell + '</div>';
      // headline-only: benchmark how long the current sponsor has been on board
      var tenureMetric = (sl.tenureKey && AGG.aggregates[sl.tenureKey])
        ? '<div class="cb-slot-full">' + metricBody(sl.tenureKey, 'Time with current sponsor') + '</div>' : '';
      var donut = (sl.dist && sl.dist.length) ? donutBlock('Sector mix', sl.dist, sl.ownSec, sl.noun) : '';
      return '<div class="card cb-slotcard">' + head + metrics + tenureMetric + donut + '</div>';
    }

    // fixed display order; 'Sponsor sectors' (the donuts) sits after the shirt group
    var GROUP_ORDER = ['Shirt & kit sponsorship', 'Stand sponsorship', 'Ground advertising',
      'Ticketing', 'Hospitality', 'Programme', 'Email & audience'];
    // explicit metric order within groups — RTDB returns object keys
    // alphabetically, so we can't rely on key order (front before back, etc.)
    var METRIC_ORDER = ['msTicket', 'seasonTicket', 'frontShirt', 'frontTerm', 'fsTenure', 'backShirt', 'backTerm',
      'sleeve', 'sleeveTerm', 'standCount', 'standTotal', 'standAvg', 'tvBoard', 'nonTvBoard',
      'mdHosp', 'seasonHosp', 'progAd', 'emailDb', 'optedIn'];
    function render() {
      var sx = $('sections'); if (sx) sx.onclick = null;
      var byGroup = {};
      Object.keys(AGG.aggregates).forEach(function (k) {
        var g = AGG.aggregates[k].group; (byGroup[g] = byGroup[g] || []).push(k);
      });
      Object.keys(byGroup).forEach(function (g) {
        byGroup[g].sort(function (a, b) { return METRIC_ORDER.indexOf(a) - METRIC_ORDER.indexOf(b); });
      });
      var scopeTxt = curScopeLabel();
      function sectionHtml(title) {
        var cards = byGroup[title].map(metricCard);
        CHIP_DEFS.filter(function (d) { return d.group === title; }).forEach(function (d) { cards.push(chipCard(d)); });
        if (title === 'Stand sponsorship') cards.push(standListCard());  // half-width card alongside Avg per stand
        return '<div class="section"><div class="cb-section-head"><h2>' + title + '</h2>' +
          '<span class="count">vs ' + scopeTxt + '</span></div>' +
          '<div class="grid">' + cards.join('') + '</div>' +
          (title === 'Stand sponsorship' ? standDonut() : '') + '</div>';
      }
      // Shirt & kit: one composite card per placement (sponsor + income + term + sector donut).
      function shirtSectionHtml() {
        var S = AGG.sectors || {};
        var slots = [
          { kind: 'Front-of-shirt sponsorship', incomeKey: 'frontShirt', termKey: 'frontTerm', tenureKey: 'fsTenure', sponKey: 'fsSponsor', startKey: 'fsStart', rollKey: 'rollingFront', dist: S.front, ownSec: OWN.fsSector, noun: 'front-of-shirt sponsors' },
          { kind: 'Back-of-shirt sponsorship', incomeKey: 'backShirt', termKey: 'backTerm', sponKey: 'bsSponsor', startKey: 'bsStart', rollKey: 'rollingBack', dist: S.back, ownSec: OWN.bsSector, noun: 'back-of-shirt sponsors' },
          { kind: 'Sleeve sponsorship', incomeKey: 'sleeve', termKey: 'sleeveTerm', sponKey: 'slSponsor', startKey: 'slStart', rollKey: 'rollingSleeve', dist: S.sleeve, ownSec: OWN.slSector, noun: 'sleeve sponsors' }
        ];
        return '<div class="section"><div class="cb-section-head"><h2>Shirt &amp; kit sponsorship</h2>' +
          '<span class="count">vs ' + scopeTxt + '</span></div>' +
          slots.map(shirtSlotCard).join('') + '</div>';
      }
      var html = OWN._noData
        ? '<div class="cb-nodata">No commercial data submitted for <b>' + OWN.club + '</b> — benchmarks shown for context only.</div>'
        : '';
      GROUP_ORDER.forEach(function (g) {
        if (g === 'Shirt & kit sponsorship') { if (byGroup[g]) html += shirtSectionHtml(); }
        else if (byGroup[g]) html += sectionHtml(g);
      });
      // any group not in the explicit order (safety) appended at the end
      Object.keys(byGroup).forEach(function (g) { if (GROUP_ORDER.indexOf(g) < 0) html += sectionHtml(g); });
      $('sections').innerHTML = html;
    }

    // half-width card listing this club's stand sponsors (largest first)
    function standListCard() {
      var st = (OWN.stands || []).slice().sort(function (a, b) {
        return (b.income == null ? -1 : b.income) - (a.income == null ? -1 : a.income);
      });
      // sectors without a fixed colour show as "Other (Name)" — consistent with the donut.
      var secLabel = function (sec) { return !sec ? '' : (SECTOR_COLORS[sec] ? sec : 'Other (' + sec + ')'); };
      var rows = st.length
        ? st.map(function (s) {
          return '<div class="cb-standrow"><span class="cb-standname">' + (s.name || '—') + '</span>' +
            '<span class="cb-standsec">' + secLabel(s.sector) + '</span>' +
            '<span class="cb-standstart">' + (monthYear(s.start) || '') + '</span>' +
            '<span class="cb-standinc">' + (s.income != null ? fmt(s.income, '£') : '—') + '</span></div>';
        }).join('')
        : '<div class="cb-standnone">No stand sponsors recorded.</div>';
      return '<div class="card"><div class="lab">Your stand sponsors</div><div class="cb-standlist">' + rows + '</div></div>';
    }
    function standDonut() {
      if (!(AGG.sectors && AGG.sectors.stand && AGG.sectors.stand.length)) return '';
      return '<div class="cb-standdonut">' + donutBlock('Stand sponsor sectors', AGG.sectors.stand, OWN.standSectors, 'stand sponsors') + '</div>';
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
      { kind: 'emailSupporters', group: 'Email & audience', label: 'Email supporters' },
      { kind: 'emailPartners', group: 'Email & audience', label: 'Email partner offers' },
      { kind: 'progFormat', group: 'Programme', label: 'Programme format' }
    ];
    // rolling/fixed shown as a tag on each shirt-slot's deal-length card
    var TERM_ROLL = { frontTerm: 'rollingFront', backTerm: 'rollingBack', sleeveTerm: 'rollingSleeve' };
    // every categorical chip the survey captured (editable in the staff editor)
    var CHIP_KINDS = ['progFormat', 'rollingFront', 'rollingBack', 'rollingSleeve', 'emailSupporters', 'emailPartners'];
    var SPONSOR_OF = { frontShirt: 'fsSponsor', backShirt: 'bsSponsor', sleeve: 'slSponsor' };
    function chipValue(kind) {
      var c = OWN.chips || {};
      var yn = function (x, on, off) { return x === 'Yes' ? on : (x ? off : '—'); };
      if (kind === 'rollingFront' || kind === 'rollingBack' || kind === 'rollingSleeve') return yn(c[kind], 'Rolling', 'Fixed term');
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
        crest.src = '/assets/crests/' + encodeURIComponent(OWN.club) + '.png';
        crest.alt = OWN.club;
      }
      setText('clubName', OWN.club);
      setText('divPill', divName(OWN.division));
      var sponWrap = $('sponWrap');
      if (sponWrap) sponWrap.style.display = 'none';  // sponsors now named on the kit cards
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

    // Fixed colour per sector so the same sector reads the same in every donut.
    // The 8 most common sectors league-wide take the brand categorical palette
    // (--proj-1..8); everything rarer folds into a neutral grey "Other".
    var SECTOR_COLORS = (function () {
      var S = AGG.sectors || {}, tot = {};
      ['front', 'back', 'sleeve', 'stand'].forEach(function (b) {
        (S[b] || []).forEach(function (e) { tot[e.label] = (tot[e.label] || 0) + e.count; });
      });
      var pal = ['var(--proj-1)', 'var(--proj-2)', 'var(--proj-3)', 'var(--proj-4)',
        'var(--proj-5)', 'var(--proj-6)', 'var(--proj-7)', 'var(--proj-8)'];
      var map = {};
      Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; })
        .forEach(function (lab, i) { if (i < pal.length) map[lab] = pal[i]; });
      return map;
    })();
    var OTHER_COLOR = 'var(--navy-200)';
    function donutBlock(title, dist, ownStr, noun) {
      if (!dist) return '';
      var arr = Array.isArray(dist) ? dist
        : Object.keys(dist).map(function (k) { return { label: k, count: dist[k] }; });
      var own = (ownStr || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      var total = arr.reduce(function (a, e) { return a + e.count; }, 0);
      if (!total) return '';
      // sectors with a fixed colour are shown individually; the rest -> Other
      var known = arr.filter(function (e) { return SECTOR_COLORS[e.label]; })
        .sort(function (a, b) { return b.count - a.count; });
      var otherCount = total - known.reduce(function (a, e) { return a + e.count; }, 0);
      var segs = known.slice();
      if (otherCount > 0) segs.push({ label: 'Other', count: otherCount, other: true });
      var r = 60, cx = 80, cy = 80, sw = 24, C = 2 * Math.PI * r, off = 0, arcs = '';
      // own sector highlighted; if the club's sector is itself uncommon, the
      // Other slice is the highlighted one.
      var ownInOther = own.some(function (o) { return !SECTOR_COLORS[o]; });
      segs.forEach(function (s) {
        var len = s.count / total * C, isOwn = s.other ? ownInOther : own.indexOf(s.label) >= 0;
        s._c = s.other ? OTHER_COLOR : SECTOR_COLORS[s.label];
        s._own = isOwn;
        arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s._c +
          '" stroke-width="' + (isOwn ? sw + 7 : sw) + '" stroke-dasharray="' + len.toFixed(2) + ' ' +
          (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"></circle>';
        off += len;
      });
      var legend = segs.map(function (s) {
        var pct = Math.round(100 * s.count / total);
        return '<div class="cb-leg' + (s._own ? ' own' : '') + '"><span class="cb-leg-sw" style="background:' + s._c + '"></span>' +
          '<span class="cb-leg-lab">' + s.label + (s._own ? ' — your sector' : '') + '</span>' +
          '<span class="cb-leg-n">' + s.count + ' (' + pct + '%)</span></div>';
      }).join('');
      return '<div class="cb-sector"><div class="cb-sector-h">' + title +
        '<span class="cb-sector-sub">' + total + ' ' + (noun || 'sponsors') + ' · all divisions</span></div><div class="cb-sector-body">' +
        '<div class="cb-donut-col"><div class="cb-donut">' +
        '<svg viewBox="0 0 160 160" width="100%" height="100%" style="transform:rotate(-90deg);display:block">' + arcs + '</svg></div>' +
        '<div class="cb-donut-cap"><span class="cb-donut-k">Your sector</span>' +
        '<span class="cb-donut-capv">' + (!own.length ? 'Not provided' : (own.length > 2 ? own.length + ' sectors' :
          own.map(function (s) { return SECTOR_COLORS[s] ? s : 'Other (' + s + ')'; }).join(', '))) + '</span></div></div>' +
        '<div class="cb-legend">' + legend + '</div></div></div>';
    }
    function renderAll() { renderHeader(); renderScopeControl(); render(); }

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

    // The dropdown offers exactly the sectors that surface individually on the
    // front end — the 8 most common league-wide (keys of SECTOR_COLORS). Any
    // rarer sector is "Other" on the donuts, so in the editor it lands on the
    // "Other…" option with the club's specific value kept in the freetext box.
    function allSectors() {
      return Object.keys(SECTOR_COLORS).sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    }

    // Known values for a categorical chip: sensible defaults merged with
    // whatever's actually present, so the dropdown is useful even pre-data.
    function chipOpts(kind) {
      var base = kind === 'progFormat' ? ['Printed', 'Digital', 'Both'] : ['Yes', 'No'];
      Object.keys((AGG.chips && AGG.chips[kind]) || {}).forEach(function (k) { if (base.indexOf(k) < 0) base.push(k); });
      return base;
    }

    // Generic picker: a dropdown of `opts` plus an "Other…" option that reveals
    // a freetext box. `key` namespaces the control, e.g. 'sec:fsSector',
    // 'sec:stand0', 'chip:rollingFront'. Empty selection means "not provided".
    function pickerControl(cur, key, opts, placeholder) {
      cur = (cur == null ? '' : String(cur)).trim();
      var known = opts.indexOf(cur) >= 0, custom = !known && !!cur;
      return '<select class="cb-edit-sel" data-pick="' + key + '">' +
        '<option value=""' + (cur ? '' : ' selected') + '>— none —</option>' +
        opts.map(function (o) { return '<option' + (known && o === cur ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
        '<option value="__other"' + (custom ? ' selected' : '') + '>Other…</option></select>' +
        '<input type="text" class="cb-edit-other" data-pickother="' + key + '" placeholder="' + (placeholder || 'Specify') + '" value="' +
          (custom ? esc(cur) : '') + '"' + (custom ? '' : ' style="display:none"') + '>';
    }
    function sectorControl(cur, attr) { return pickerControl(cur, 'sec:' + attr, allSectors(), 'Specify sector'); }
    function chipPicker(kind) { return pickerControl((OWN.chips || {})[kind], 'chip:' + kind, chipOpts(kind)); }

    function numCtl(k) {
      var m = OWN.metrics[k] || (OWN.metrics[k] = { value: null }), np = m.value == null;
      return '<input type="number" step="any" data-ekey="' + k + '" value="' + (np ? '' : m.value) + '"' + (np ? ' disabled' : '') + '>' +
        '<label class="cb-np"><input type="checkbox" data-np="' + k + '"' + (np ? ' checked' : '') + '> None</label>';
    }

    function editRow(lab, ctl) {
      return '<div class="cb-edit-row"><span class="cb-edit-lab">' + lab + '</span><span class="cb-edit-ctl">' + ctl + '</span></div>';
    }

    var SHIRT_SLOTS = [
      { kind: 'Front-of-shirt', spon: 'fsSponsor', sec: 'fsSector', income: 'frontShirt', term: 'frontTerm', roll: 'rollingFront' },
      { kind: 'Back-of-shirt', spon: 'bsSponsor', sec: 'bsSector', income: 'backShirt', term: 'backTerm', roll: 'rollingBack' },
      { kind: 'Sleeve', spon: 'slSponsor', sec: 'slSector', income: 'sleeve', term: 'sleeveTerm', roll: 'rollingSleeve' }
    ];

    function shirtEditSection() {
      return '<div class="section"><div class="cb-section-head"><h2>Shirt &amp; kit sponsorship</h2></div>' +
        SHIRT_SLOTS.map(function (sl) {
          return '<div class="cb-edit-slot"><div class="cb-edit-slot-kind">' + sl.kind + ' sponsorship</div>' +
            editRow('Sponsor name', '<input type="text" data-espon="' + sl.spon + '" value="' + esc(OWN[sl.spon] || '') + '" placeholder="None">') +
            editRow('Sector', sectorControl(OWN[sl.sec], sl.sec)) +
            editRow('Income (£)', numCtl(sl.income)) +
            editRow('Deal length (yrs)', numCtl(sl.term)) +
            editRow('Rolling deal? (Yes/No)', chipPicker(sl.roll)) +
            '</div>';
        }).join('') + '</div>';
    }

    function standEditSection() {
      OWN.stands = OWN.stands || [];
      var rows = '';
      for (var i = 0; i < 4; i++) {
        var st = OWN.stands[i] || {};
        var nm = st.name && st.name !== '—' ? st.name : '';
        rows += '<div class="cb-edit-slot"><div class="cb-edit-slot-kind">Stand sponsor ' + (i + 1) + '</div>' +
          editRow('Name', '<input type="text" data-estand="' + i + '-name" value="' + esc(nm) + '" placeholder="None">') +
          editRow('Sector', sectorControl(st.sector, 'stand' + i)) +
          editRow('Income (£)', '<input type="number" step="any" data-estand="' + i + '-income" value="' + (st.income != null ? st.income : '') + '" placeholder="—">') +
          '</div>';
      }
      return '<div class="section"><div class="cb-section-head"><h2>Stand sponsorship</h2></div>' + rows +
        '<div class="cb-edit-hint">Number of stand sponsors, combined total and average per stand are calculated from these rows.</div></div>';
    }

    function renderEditForm() {
      var body = groupedKeys().map(function (g) {
        if (g.title === 'Shirt & kit sponsorship') return shirtEditSection();
        if (g.title === 'Stand sponsorship') return standEditSection();
        // numeric metrics, plus any categorical chips that belong in this group
        var chipRows = CHIP_DEFS.filter(function (d) { return d.group === g.title; }).map(function (d) {
          return editRow(d.label, chipPicker(d.kind));
        }).join('');
        return '<div class="section"><div class="cb-section-head"><h2>' + g.title + '</h2></div>' +
          '<div class="cb-edit-grid">' + g.keys.map(function (k) {
            var agg = AGG.aggregates[k], u = (agg.unit || '').trim();
            return editRow(agg.label + (u ? ' (' + u + ')' : ''), numCtl(k));
          }).join('') + chipRows + '</div></div>';
      }).join('');
      body += '<div class="cb-edit-actions"><button id="cb-save" class="cb-edit-btn" type="button">Save changes</button>' +
        '<button id="cb-cancel" class="cb-cancel" type="button">Cancel</button>' +
        '<span id="cb-editnote">Editing <b>' + OWN.club + '</b> — tick <b>None</b> for no figure; 0 is a real zero. Pick a sector or choose <b>Other…</b> to type your own. Saving recomputes all benchmarks.</span></div>';
      $('sections').innerHTML = body;
      $('sections').onchange = function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var npk = t.getAttribute('data-np');
        if (npk != null) {
          var inp = $('sections').querySelector('input[data-ekey="' + npk + '"]');
          if (inp) { inp.disabled = t.checked; if (!t.checked) inp.focus(); }
          return;
        }
        var pick = t.getAttribute('data-pick');
        if (pick != null) {
          var other = $('sections').querySelector('input[data-pickother="' + pick + '"]');
          if (other) { var show = t.value === '__other'; other.style.display = show ? '' : 'none'; if (show) other.focus(); }
        }
      };
      $('cb-cancel').onclick = function () { editMode = false; setEditUI(); render(); };
      $('cb-save').onclick = doSave;
    }

    function readPicker(key) {
      var sel = $('sections').querySelector('select[data-pick="' + key + '"]');
      if (!sel) return null;
      if (sel.value === '__other') {
        var o = $('sections').querySelector('input[data-pickother="' + key + '"]');
        return o ? o.value.trim() : '';
      }
      return (sel.value || '').trim();
    }
    function readSector(attr) { return readPicker('sec:' + attr); }

    function doSave() {
      // numeric metrics (incl. shirt income/term; stand totals are derived below)
      [].forEach.call($('sections').querySelectorAll('input[data-ekey]'), function (inp) {
        var k = inp.getAttribute('data-ekey');
        var np = $('sections').querySelector('input[data-np="' + k + '"]');
        if (np && np.checked) { OWN.metrics[k] = OWN.metrics[k] || {}; OWN.metrics[k].value = null; }
        else { var raw = inp.value.trim(); OWN.metrics[k] = OWN.metrics[k] || {}; OWN.metrics[k].value = raw === '' ? 0 : Number(raw); }
      });
      // shirt sponsor names + sectors
      [].forEach.call($('sections').querySelectorAll('input[data-espon]'), function (inp) {
        OWN[inp.getAttribute('data-espon')] = cleanSpon(inp.value);
      });
      ['fsSector', 'bsSector', 'slSector'].forEach(function (a) { var v = readSector(a); if (v != null) OWN[a] = v; });
      // categorical chips (programme format, rolling flags, email permissions)
      OWN.chips = OWN.chips || {};
      CHIP_KINDS.forEach(function (k) { var v = readPicker('chip:' + k); if (v != null) OWN.chips[k] = v; });
      // stand sponsors -> rebuild list, derive count/total/avg + standSectors
      var stands = [], standSecs = [];
      for (var i = 0; i < 4; i++) {
        var nmEl = $('sections').querySelector('input[data-estand="' + i + '-name"]');
        var incEl = $('sections').querySelector('input[data-estand="' + i + '-income"]');
        var nm = cleanSpon(nmEl ? nmEl.value : '');
        var sec = readSector('stand' + i) || '';
        var incRaw = incEl ? incEl.value.trim() : '';
        var inc = incRaw === '' ? null : Number(incRaw);
        // A real stand needs a genuine sponsor name OR positive income; blank /
        // "0" / vacant slots are dropped entirely so they never inflate the count.
        if (nm || (inc != null && inc > 0)) {
          stands.push({ name: nm || '—', sector: sec, income: inc });
          if (sec) standSecs.push(sec);
        }
      }
      OWN.stands = stands;
      OWN.standSectors = standSecs.join(' | ');
      var incomes = stands.map(function (s) { return s.income; }).filter(function (x) { return x != null; });
      var total = incomes.length ? incomes.reduce(function (a, b) { return a + b; }, 0) : null;
      var count = stands.length;
      function setM(k, v) { OWN.metrics[k] = OWN.metrics[k] || {}; OWN.metrics[k].value = v; }
      setM('standCount', count);
      setM('standTotal', total);
      setM('standAvg', (total != null && count) ? total / count : null);

      recompute(AGG, clubs);
      recomputeSectors(AGG, clubs);
      recomputeChips(AGG, clubs);
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
      var chipCols = [['progFormat', 'Programme format'], ['rollingFront', 'Front-shirt rolling?'],
        ['emailSupporters', 'Can email supporters?'], ['emailPartners', 'Can email partners?']];
      var header = ['Club', 'Division'].concat(keys.map(function (k) {
        var u = (AGG.aggregates[k].unit || '').trim(); return AGG.aggregates[k].label + (u ? ' (' + u + ')' : '');
      })).concat(chipCols.map(function (c) { return c[1]; }));
      var rows = [header].concat(clubs.map(function (c) {
        var row = [c.club, c.division];
        keys.forEach(function (k) { var m = c.metrics && c.metrics[k]; row.push(m && m.value != null ? m.value : ''); });
        chipCols.forEach(function (cc) { row.push((c.chips && c.chips[cc[0]]) || ''); });
        return row;
      }));
      NL.download('commercial-benchmarking-' + new Date().toISOString().slice(0, 10) + '.csv',
        NL.csv(rows, { bom: true }), 'text/csv;charset=utf-8;');
    }

    // Excel workbook of every club's two links, styled like the on-screen
    // table, with "Proof"/"Benchmarking" as live hyperlinks (not raw URLs).
    // Built as Excel-flavoured HTML so it carries both styling and clickable
    // links without any library.
    function exportLinks() {
      var tb = opts.tokenByClub || {};
      var th = 'style="background:#1B2A4A;color:#fff;font-weight:bold;text-align:left;padding:7px 12px;border:1px solid #cfd6e4"';
      var td = 'style="padding:6px 12px;border:1px solid #e2e6ee"';
      function lk(word, url) { return '<a href="' + esc(url) + '" style="color:#9e0000;font-weight:bold;text-decoration:none">' + word + '</a>'; }
      var rows = clubs.map(function (c) {
        var tok = tb[c.club];
        return '<tr><td ' + td + '>' + esc(c.club) + '</td><td ' + td + '>' + esc(c.division) + '</td>' +
          '<td ' + td + '>' + (tok ? lk('Proof', proofUrl(tok)) : '') + '</td>' +
          '<td ' + td + '>' + (tok ? lk('Benchmarking', linkUrl(tok)) : '') + '</td></tr>';
      }).join('');
      var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
        '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Club links</x:Name>' +
        '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
        '<style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}</style></head><body>' +
        '<table><tr><th ' + th + '>Club</th><th ' + th + '>Division</th><th ' + th + '>Proof</th><th ' + th + '>Benchmarking</th></tr>' +
        rows + '</table></body></html>';
      NL.download('commercial-benchmarking-links-' + new Date().toISOString().slice(0, 10) + '.xls',
        new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }));
    }

    // ---- admin: generate & manage per-club capability links ----
    function token24() {
      var a = new Uint8Array(24); window.crypto.getRandomValues(a);
      var s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function linkUrl(tok) { return new URL('link.html?t=' + tok, location.href).href; }
    function proofUrl(tok) { return linkUrl(tok) + '&mode=verify'; }
    function linkNote(t) { var el = $('cb-linknote'); if (el) el.textContent = t || ''; }
    function genOne(club) {
      var c = clubByName[club]; if (!c || !opts.writeLink) return;
      var tok = token24();
      linkNote('Generating link for ' + club + '…');
      return opts.writeLink(tok, c).then(function () { opts.tokenByClub[club] = tok; renderLinks(); });
    }
    function genMissing() {
      var tb = opts.tokenByClub || {};
      var missing = clubs.filter(function (c) { return !tb[c.club]; });
      if (!missing.length) { linkNote('Every club already has a link.'); return; }
      linkNote('Generating ' + missing.length + ' link' + (missing.length > 1 ? 's' : '') + '…');
      Promise.all(missing.map(function (c) { var tok = token24(); opts.tokenByClub[c.club] = tok; return opts.writeLink(tok, c); }))
        .then(function () { renderLinks(); linkNote('Generated ' + missing.length + '.'); },
          function (e) { console.error(e); linkNote('Generation failed — please try again.'); });
    }
    function renderLinks() {
      var tb = opts.tokenByClub || {}, cf = opts.confirmByClub || {};
      function confCell(c) {
        var v = cf[c.club];
        if (!v) return '<span class="cb-unconf">—</span>';
        return '<span class="cb-conf">✓' + (typeof v === 'number' ? ' ' + NL.formatDateShort(v) : '') + '</span>';
      }
      var rows = clubs.map(function (c) {
        var tok = tb[c.club];
        var nameCell = c.club + (c._noData ? ' <span class="cb-nodata-tag">(no data yet)</span>' : '');
        var proof, bench;
        if (tok) {
          proof = '<td><a class="cb-linkword" href="' + proofUrl(tok) + '" target="_blank" rel="noopener">Proof</a></td>';
          bench = '<td><a class="cb-linkword" href="' + linkUrl(tok) + '" target="_blank" rel="noopener">Benchmarked</a></td>';
        } else {
          proof = '<td colspan="2"><button class="cb-edit-btn" type="button" data-gen="' + c.club.replace(/"/g, '&quot;') + '">Generate links</button></td>';
          bench = '';
        }
        return '<tr><td>' + nameCell + '</td><td>' + c.division + '</td>' + proof + bench + '<td>' + confCell(c) + '</td></tr>';
      }).join('');
      var have = clubs.filter(function (c) { return tb[c.club]; }).length;
      var confirmed = clubs.filter(function (c) { return cf[c.club]; }).length;
      $('sections').innerHTML = '<div class="cb-edit-actions">' +
        '<button id="cb-genall" class="cb-edit-btn" type="button">Generate all missing</button>' +
        '<button id="cb-linkdl" class="cb-edit-btn" type="button">Download links (Excel)</button>' +
        '<button id="cb-linkdone" class="cb-cancel" type="button">Done</button>' +
        '<span id="cb-linknote"><b>' + confirmed + ' of ' + clubs.length + '</b> clubs have confirmed their data. ' + have + ' have links. <b>Proof</b> = own-data check; <b>Benchmarked</b> = full comparison.</span></div>' +
        '<table class="cb-linktable"><thead><tr><th>Club</th><th>Division</th><th>Proof</th><th>Benchmarked</th><th>Confirmed</th></tr></thead><tbody>' + rows + '</tbody></table>';
      $('cb-linkdone').onclick = function () { $('sections').onclick = null; render(); };
      $('cb-genall').onclick = genMissing;
      $('cb-linkdl').onclick = exportLinks;
      $('sections').onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.getAttribute('data-gen')) genOne(b.getAttribute('data-gen'));
      };
    }

    var updateSelLink = null;
    function pickOptions() {
      var opt = '', curDiv = '';
      clubs.forEach(function (c, i) {
        if (c.division !== curDiv) { if (curDiv) opt += '</optgroup>'; opt += '<optgroup label="' + divName(c.division) + '">'; curDiv = c.division; }
        opt += '<option value="' + i + '">' + esc(c.club) + (c._noData ? ' — no data' : '') + '</option>';
      });
      return opt + '</optgroup>';
    }

    // ---- admin: import late club rows (paste the JSON from build-benchmark-rows.py) ----
    // Two presses: the first checks the paste and reports what would change
    // (or every reason it can't), the second applies it. Any edit to the
    // paste sends it back to the first step.
    function importDialog() {
      if (!(window.NL && NL.modal)) return;
      editMode = false; setEditUI();
      var checked = null;
      var ctrl = NL.modal({
        title: 'Import club rows',
        width: 'wide',
        body: '<p class="cb-import-help">Paste the JSON written by <code>build-benchmark-rows.py</code>. ' +
          'Clubs are matched to the roster by name; every benchmark and percentile is recomputed on save.</p>' +
          '<textarea id="cb-import-json" class="cb-import-json" rows="10" spellcheck="false" placeholder="[ { &quot;club&quot;: …"></textarea>' +
          '<label class="cb-import-replace"><input type="checkbox" id="cb-import-replace"> Replace clubs that already have data</label>' +
          '<div id="cb-import-note" class="cb-import-note" aria-live="polite"></div>',
        buttons: [
          { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
          { label: 'Check', className: 'btn--primary', onClick: onPress }
        ]
      });
      var ta = document.getElementById('cb-import-json'), note = document.getElementById('cb-import-note');
      var rep = document.getElementById('cb-import-replace');
      var goBtn = ctrl.el.querySelector('.modal__footer button:last-child');
      function reset() { checked = null; goBtn.textContent = 'Check'; }
      ta.addEventListener('input', reset); rep.addEventListener('change', reset);
      function say(html, bad) { note.innerHTML = html; note.className = 'cb-import-note' + (bad ? ' cb-import-note--bad' : ''); }
      function parse() {
        var rows;
        try { rows = JSON.parse(ta.value); } catch (e) { return { errors: ['That isn’t valid JSON — paste the whole file, including the outer [ ].'] }; }
        return importRows(AGG, clubs, rows, { dryRun: true, replace: rep.checked });
      }
      function onPress(c) {
        if (!checked) {
          var dry = parse();
          if (!dry.ok) { say('<b>Nothing imported.</b><ul>' + dry.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>', true); return; }
          checked = dry;
          var parts = [];
          if (dry.added.length) parts.push('<b>Add ' + dry.added.length + '</b>: ' + dry.added.map(esc).join(', '));
          if (dry.replaced.length) parts.push('<b>Replace ' + dry.replaced.length + '</b>: ' + dry.replaced.map(esc).join(', '));
          say(parts.join('<br>') + '<br>Every club’s percentiles will be recomputed and links generated for new clubs.');
          goBtn.textContent = 'Import ' + (dry.added.length + dry.replaced.length) + ' club' + (dry.added.length + dry.replaced.length === 1 ? '' : 's');
          return;
        }
        goBtn.disabled = true; say('Importing…');
        var rows = JSON.parse(ta.value);
        var res = importRows(AGG, clubs, rows, { replace: rep.checked });
        if (!res.ok) { goBtn.disabled = false; reset(); say('<b>Nothing imported.</b> ' + esc(res.errors.join(' ')), true); return; }
        var tb = opts.tokenByClub || (opts.tokenByClub = {});
        Promise.resolve(opts.onSave(AGG, clubs)).then(function () {
          if (!opts.writeLink) return;
          var need = res.added.filter(function (n) { return !tb[n]; });
          return Promise.all(need.map(function (n) { var tok = token24(); tb[n] = tok; return opts.writeLink(tok, clubByName[n]); }));
        }).then(function () {
          clubByName = {}; clubs.forEach(function (x) { clubByName[x.club] = x; });
          var pick = $('clubPick');
          if (pick) { pick.innerHTML = pickOptions(); var first = res.added[0] || res.replaced[0]; var idx = clubs.map(function (x) { return x.club; }).indexOf(first); if (idx >= 0) { pick.value = String(idx); OWN = clubs[idx]; } }
          renderAll(); if (updateSelLink) updateSelLink();
          c.close();
          if (NL.toast) NL.toast('Imported ' + (res.added.length + res.replaced.length) + ' club' + (res.added.length + res.replaced.length === 1 ? '' : 's'));
        }, function (e) {
          console.error(e); goBtn.disabled = false; reset();
          say('<b>Save failed</b> — nothing was written. Refresh the page before trying again, so the figures on screen match the database.', true);
        });
      }
    }

    if (opts.staff) {
      var bar = $('staffBar');
      if (bar) {
        bar.style.display = '';
        var btns = '<button class="cb-cancel" id="cb-export" type="button">Export (Excel)</button>';
        if (opts.canEdit && opts.writeLink) btns += '<button class="cb-cancel" id="cb-links" type="button">Links</button>';
        if (opts.canEdit && opts.onSave) btns += '<button class="cb-cancel" id="cb-import" type="button">Import rows</button>';
        if (opts.canEdit) btns += '<button class="cb-edit-btn" id="cb-edit" type="button">Edit data</button>';
        bar.innerHTML =
          '<select id="clubPick" class="cb-staff-pick">' + pickOptions() + '</select>' +
          '<a id="cb-selLink" class="cb-sellink" target="_blank" rel="noopener"></a>' +
          '<span class="cb-staff-actions">' + btns + '</span>';
        updateSelLink = function () {
          var a = $('cb-selLink'); if (!a) return;
          var tok = (opts.tokenByClub || {})[OWN.club];
          if (tok) { a.href = new URL('link.html?t=' + tok, location.href).href; a.textContent = 'Open club link ↗'; a.style.display = ''; }
          else { a.removeAttribute('href'); a.style.display = 'none'; }
        };
        $('clubPick').addEventListener('change', function () {
          OWN = clubs[+this.value];
          if (editMode) { editMode = false; setEditUI(); }
          renderAll(); updateSelLink();
        });
        $('cb-export').onclick = exportData;
        if ($('cb-links')) $('cb-links').onclick = function () { editMode = false; setEditUI(); renderLinks(); };
        if ($('cb-import')) $('cb-import').onclick = importDialog;
        if ($('cb-edit')) { ebtn = $('cb-edit'); ebtn.onclick = function () { editMode = !editMode; setEditUI(); if (editMode) renderEditForm(); else render(); }; }
        updateSelLink();
      }
      var pt = $('privacyTxt');
      if (pt) pt.innerHTML = '<b>NL staff view.</b> Every club’s named figures are visible here; use <b>Links</b> to copy a club’s private link. Clubs only ever see their own data plus anonymous benchmarks.';
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

  // 'YYYY-MM' (or 'YYYY') -> 'Mmm YYYY' for the verify page.
  function monthYear(s) {
    if (!s) return '';
    var m = String(s).match(/^(\d{4})-(\d{1,2})/);
    if (m) {
      var mon = MON3[(+m[2]) - 1];
      return mon ? mon + ' ' + m[1] : m[1];
    }
    return /^\d{4}$/.test(String(s)) ? String(s) : '';
  }

  // start 'YYYY-MM'/'YYYY' + term in years -> expiry as 'Mmm YYYY' (or 'YYYY').
  function expiry(s, years) {
    if (!s || years == null || isNaN(years)) return '';
    var m = String(s).match(/^(\d{4})(?:-(\d{1,2}))?/);
    if (!m) return '';
    var y = (+m[1]) + Math.round(Number(years));
    if (m[2]) { var mon = MON3[(+m[2]) - 1]; return (mon ? mon + ' ' : '') + y; }
    return String(y);
  }

  // Verify / "check your data" view: a club's OWN captured figures only — no
  // benchmarks, no other clubs, no aggregates even fetched — plus a "report a
  // correction" email CTA. Renders into the same #sections container.
  function review(OWN, opts) {
    opts = opts || {};
    var $ = function (id) { return document.getElementById(id); };
    function val(k) { var m = (OWN.metrics || {})[k]; return m && m.value != null ? m.value : null; }
    function money(v) { return v == null ? '—' : '£' + Number(v).toLocaleString('en-GB'); }
    function plain(v) { return v == null ? '—' : Number(v).toLocaleString('en-GB'); }
    function yrs(v) { return v == null ? '—' : (v + (v === 1 ? ' year' : ' years')); }
    function txt(v) { v = (v == null ? '' : String(v)).trim(); return v || '—'; }
    function chip(k) { var v = ((OWN.chips || {})[k] || '').trim(); return v ? (v.toLowerCase() === 'yes' ? 'Yes' : 'No') : '—'; }
    function rolling(k) { var v = ((OWN.chips || {})[k] || '').trim(); return v ? (v.toLowerCase() === 'yes' ? 'Rolling' : 'Fixed term') : '—'; }

    var crest = $('crest');
    if (crest) { crest.src = '/assets/crests/' + encodeURIComponent(OWN.club) + '.png'; crest.alt = OWN.club; }
    if ($('clubName')) $('clubName').textContent = OWN.club;
    if ($('tbClub')) $('tbClub').textContent = OWN.club;
    if ($('divPill')) $('divPill').textContent = DIV_FULL[OWN.division] || OWN.division || '';
    if ($('sponWrap')) $('sponWrap').style.display = 'none';

    var has = Object.keys(OWN.metrics || {}).some(function (k) { return k !== 'standCount' && (OWN.metrics[k] || {}).value != null; });

    function item(lab, v) { return '<div class="cb-rev-item"><span class="cb-rev-lab">' + lab + '</span><span class="cb-rev-val">' + v + '</span></div>'; }
    // expiry = start + deal length (years); a rolling deal has no fixed expiry
    function endLabel(startKey, termKey, rollKey) {
      if (((OWN.chips || {})[rollKey] || '').trim().toLowerCase() === 'yes') return 'Rolling / ongoing';
      return expiry(OWN[startKey], val(termKey)) || '—';
    }
    function shirt(kind, sponKey, secKey, incKey, termKey, startKey, rollKey) {
      return '<div class="card cb-rev-card"><div class="cb-rev-h">' + kind + '</div><div class="cb-rev-grid">'
        + item('Sponsor', esc(txt(OWN[sponKey])))
        + item('Sector', esc(txt(OWN[secKey])))
        + item('Income / season', money(val(incKey)))
        + item('Deal length', yrs(val(termKey)))
        + item('Started', monthYear(OWN[startKey]) || '—')
        + item('Expires', endLabel(startKey, termKey, rollKey))
        + item('Rolling deal?', rolling(rollKey))
        + '</div></div>';
    }
    function help(t) { return '<div class="cb-rev-help">' + t + '</div>'; }
    function group(title, inner, h) {
      return '<div class="section"><div class="cb-section-head"><h2>' + title + '</h2></div>' + (h ? help(h) : '') + inner + '</div>';
    }
    function card(inner) { return '<div class="card cb-rev-card"><div class="cb-rev-grid">' + inner + '</div></div>'; }

    // Gentle per-section guidance (incl. what each figure is NOT).
    var HELP = {
      shirt: 'Your shirt and kit sponsors. <b>Deal length</b> is the agreed contract term in years — if the deal simply renews each season that is a <b>1-year rolling</b> deal, not a multi-year one (please don’t enter, say, 25 years for a long-standing annual arrangement). Income is per season and excludes VAT.',
      stand: 'Individual stand, ground or perimeter <b>sponsorships</b> and what each pays per season (excluding VAT). This is <b>not</b> matchday hospitality, a shirt deal, or an advertising board.',
      boards: 'The price of a <b>single</b> pitch-side perimeter advertising board for the season — per board, not the whole ground. TV-facing boards sit within the broadcast camera arc; non-TV boards do not.',
      tickets: 'Your <b>highest-priced general-admission adult</b> ticket — the standard top adult price, not concessions, hospitality or members’ rates. Matchday is a single game; Season is the full season.',
      hosp: 'The price of your highest <b>individual matchday hospitality package, per person</b> — typically a seat in a lounge with food. This is <b>not</b> a private box hire, a match-sponsorship package, or a per-table price.',
      programme: 'Whether you produce a matchday programme (printed or digital) and the cost of a <b>full-page advert for the season</b>.',
      email: 'The size of your contactable supporter email database, and how many supporters have <b>opted in</b> to hear from commercial partners. Used to value digital and partner activations.'
    };

    var mail = opts.reportEmail || 'commercial@thenationalleague.org.uk';
    var subj = encodeURIComponent('Commercial data correction — ' + OWN.club);
    var body = encodeURIComponent('Club: ' + OWN.club + '\n\nPlease describe anything below that is wrong or out of date:\n\n');
    var mailto = 'mailto:' + mail + '?subject=' + subj + '&body=' + body;
    var emailLink = '<a href="' + mailto + '">' + mail + '</a>';

    // No data on file: skip the "check your data" page — point them at the survey.
    if (!has) {
      var surveyUrl = opts.surveyUrl || '';
      var surveyTxt = surveyUrl ? '<a href="' + esc(surveyUrl) + '" target="_blank" rel="noopener">the survey</a>' : 'the survey';
      if ($('sections')) $('sections').innerHTML =
        '<div class="cb-rev-banner"><div class="cb-rev-blurb"><b>Your benchmarking isn’t available yet.</b> ' +
        'Please fill in ' + surveyTxt + ' sent by the League’s commercial team to get access to your benchmarking portal.</div></div>';
      return;
    }

    var html = '<div class="cb-rev-banner"><div class="cb-rev-blurb"><b>Please check the details below.</b> This is the commercial information we currently hold for ' +
      esc(OWN.club) + ' (2025/26 season). If anything is wrong or out of date, let us know by emailing ' + emailLink +
      ' — none of this is shared with other clubs.</div></div>';

    html += group('Shirt &amp; kit sponsorship',
      shirt('Front of shirt', 'fsSponsor', 'fsSector', 'frontShirt', 'frontTerm', 'fsStart', 'rollingFront')
      + shirt('Back of shirt', 'bsSponsor', 'bsSector', 'backShirt', 'backTerm', 'bsStart', 'rollingBack')
      + shirt('Sleeve', 'slSponsor', 'slSector', 'sleeve', 'sleeveTerm', 'slStart', 'rollingSleeve'), HELP.shirt);

    var stands = OWN.stands || [];
    var shead = '<div class="cb-rev-strow cb-rev-shead"><span>Stand sponsor</span><span>Sector</span><span>Value</span><span>Start date</span><span>Expiry</span></div>';
    var srows = stands.length ? stands.map(function (s) {
      return '<div class="cb-rev-strow"><span class="cb-rev-sname">' + esc(txt(s.name)) + '</span>' +
        '<span class="cb-rev-ssec">' + esc(txt(s.sector)) + '</span>' +
        '<span>' + (s.income != null ? money(s.income) : '—') + '</span>' +
        '<span>' + (monthYear(s.start) || '—') + '</span>' +
        '<span>' + (expiry(s.start, s.term) || '—') + '</span></div>';
    }).join('') : '';
    var standInner = stands.length
      ? '<div class="cb-rev-stands">' + shead + srows + '</div>'
      : '<div class="cb-rev-empty">No stand sponsors on file.</div>';
    html += group('Stand sponsorship', '<div class="card cb-rev-card">' + standInner + '</div>', HELP.stand);

    html += group('Ground advertising', card(item('TV-facing board / season', money(val('tvBoard'))) + item('Non-TV board / season', money(val('nonTvBoard')))), HELP.boards);
    html += group('Ticketing', card(item('Top adult matchday ticket', money(val('msTicket'))) + item('Top adult season ticket', money(val('seasonTicket')))), HELP.tickets);
    html += group('Hospitality', card(item('Top matchday package', money(val('mdHosp'))) + item('Top seasonal package', money(val('seasonHosp')))), HELP.hosp);
    html += group('Programme', card(item('Format', esc(txt((OWN.chips || {}).progFormat))) + item('Full-page advert / season', money(val('progAd')))), HELP.programme);
    html += group('Email &amp; audience', card(item('Can email supporters?', chip('emailSupporters'))
      + item('Can email partner offers?', chip('emailPartners'))
      + item('Email database', plain(val('emailDb')))
      + item('Opted in to partner emails', plain(val('optedIn')))), HELP.email);

    // Sign-off footer: the confirm control is a pill; the "are you sure?" is a
    // modal. Toggleable both ways and recorded in RTDB.
    function confirmedOn(ts) {
      if (!ts) return '';
      var d = new Date(ts);
      return isNaN(d) ? '' : ' on ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    var cstate = !!(OWN.confirm && OWN.confirm.confirmed), cat = (OWN.confirm && OWN.confirm.at) || null;
    html += '<div class="cb-rev-foot"><button type="button" id="cb-confirm-pill" class="cb-confirm-pill"></button>' +
      '<a class="cb-rev-btn cb-rev-btn-alt" href="' + mailto + '">Report a correction</a></div>';

    if ($('sections')) $('sections').innerHTML = html;

    function modal(title, bodyTxt, okLabel, okClass, onOk) {
      var ov = document.createElement('div');
      ov.className = 'cb-modal-overlay';
      ov.innerHTML = '<div class="cb-modal" role="dialog" aria-modal="true"><div class="cb-modal-title">' + title + '</div>' +
        '<div class="cb-modal-body">' + bodyTxt + '</div><div class="cb-modal-actions">' +
        '<button type="button" class="cb-modal-cancel">Cancel</button>' +
        '<button type="button" class="cb-modal-ok ' + okClass + '">' + okLabel + '</button></div></div>';
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onKey); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      ov.querySelector('.cb-modal-cancel').onclick = close;
      ov.querySelector('.cb-modal-ok').onclick = function () { close(); onOk(); };
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
      ov.querySelector('.cb-modal-ok').focus();
    }
    function paintPill() {
      var p = $('cb-confirm-pill'); if (!p) return;
      p.disabled = false;
      if (cstate) { p.className = 'cb-confirm-pill cb-confirm-pill--done'; p.innerHTML = '✓ Confirmed correct' + confirmedOn(cat); }
      else { p.className = 'cb-confirm-pill cb-confirm-pill--do'; p.textContent = 'Confirm these details are correct'; }
    }
    function setConfirm(want) {
      var p = $('cb-confirm-pill'); if (p) { p.disabled = true; p.textContent = 'Saving…'; }
      Promise.resolve(opts.onConfirm(want)).then(function () {
        cstate = want; cat = Date.now(); paintPill();
      }, function () { paintPill(); modal('Couldn’t save', 'Something went wrong saving your confirmation. Please try again.', 'OK', 'cb-modal-ok-go', function () {}); });
    }
    paintPill();
    if (opts.onConfirm) {
      $('cb-confirm-pill').onclick = function () {
        if (cstate) {
          modal('Remove your confirmation?', 'You’re saying this data is no longer confirmed as correct. You can re-confirm at any time.', 'Remove confirmation', 'cb-modal-ok-warn', function () { setConfirm(false); });
        } else {
          modal('Confirm your data is correct', 'Please confirm that <b>all</b> the commercial information shown above is correct for your club.', 'Yes, it’s correct', 'cb-modal-ok-go', function () { setConfirm(true); });
        }
      };
    }
  }

  return { mount: mount, recompute: recompute, importRows: importRows, hasData: hasData, NO_DATA: NO_DATA, review: review };
})();
