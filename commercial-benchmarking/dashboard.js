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
  function mount(AGG, clubs, opts) {
    opts = opts || {};
    var OWN = clubs[0];
    var state = { scope: 'div', view: 'graph', cardView: {} };
    var $ = function (id) { return document.getElementById(id); };

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
    function scopeKey() { return state.scope === 'league' ? 'league' : OWN.division; }
    function otherScope() { return state.scope === 'league' ? OWN.division : 'league'; }
    function pctFor(m, scope) { return scope === 'league' ? m.leaguePct : m.divPct; }

    function rangeBar(agg, own) {
      var s = agg.scopes[scopeKey()], u = agg.unit, os = otherScope(), o = agg.scopes[os];
      if (!s) return '<div class="hist-note">No benchmark for this group.</div>';
      var provided = own.value != null, left = 50;
      if (provided && s.max > s.min) left = 3 + 94 * Math.max(0, Math.min(1, (own.value - s.min) / (s.max - s.min)));
      var medLeft = s.max > s.min ? 3 + 94 * ((s.median - s.min) / (s.max - s.min)) : 50;
      var osLabel = os === 'league' ? 'All divisions' : os + ' division';
      return '<div class="bar-wrap"><div class="bar">' +
        '<div class="median" style="left:' + medLeft.toFixed(1) + '%"></div>' +
        (provided ? '<div class="marker" style="left:' + left.toFixed(1) + '%"></div>' : '') +
        '</div><div class="scale">' +
        '<span>' + fmtShort(s.min, u) + '<b>Lowest</b></span>' +
        '<span class="mid">' + fmtShort(s.median, u) + '<b>Median</b></span>' +
        '<span style="text-align:right">' + fmtShort(s.max, u) + '<b>Highest</b></span>' +
        '</div><div class="league-line"><span>' + osLabel + ' median <b style="color:var(--text)">' +
        fmtShort(o.median, u) + '</b> (' + o.count + ' clubs)</span>' +
        '<span class="lg-pos">' + band(pctFor(own, os === 'league' ? 'league' : 'div')).txt + '</span></div></div>';
    }

    // graph: one rising bar per club, this club's bar highlighted
    function clubBars(agg, own) {
      var s = agg.scopes[scopeKey()], u = agg.unit;
      if (!s) return '<div class="hist-note">No benchmark for this group.</div>';
      var vals = s.values || [], n = vals.length, maxv = s.max || 1, youIdx = -1;
      if (own.value != null && n) {
        var pct = pctFor(own, state.scope === 'league' ? 'league' : 'div');
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
        note += ' &middot; ' + n + ' clubs, lowest to highest.';
      } else {
        note = 'Not provided — distribution shown for ' + n + ' clubs, lowest to highest.';
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
      var pct = pctFor(own, state.scope === 'league' ? 'league' : 'div');
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
      var scopeTxt = state.scope === 'league' ? 'all divisions' : OWN.division + ' division';
      $('sections').innerHTML = groups.map(function (g) {
        return '<div class="section"><div class="section-head"><h2>' + g.title + '</h2>' +
          '<span class="count">vs ' + scopeTxt + '</span></div>' +
          '<div class="grid">' + g.keys.map(metricCard).join('') + '</div></div>';
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
    function renderChips() {
      var c = OWN.chips || {};
      var yn = function (x, on, off) { return x === 'Yes' ? on : (x ? off : '—'); };
      var items = [
        { k: 'Programme format', v: c.progFormat || '—', kind: 'progFormat' },
        { k: 'Front-shirt deal', v: yn(c.rollingFront, 'Rolling', 'Fixed term'), kind: 'rollingFront' },
        { k: 'Email supporters', v: yn(c.emailSupporters, 'Enabled', 'Not enabled'), kind: 'emailSupporters' },
        { k: 'Email partner offers', v: yn(c.emailPartners, 'Enabled', 'Not enabled'), kind: 'emailPartners' }
      ];
      $('chips').innerHTML = items.map(function (it) {
        return '<div class="chip"><div class="kicker">' + it.k + '</div><div class="cv">' + it.v + '</div>' +
          '<div class="cn">' + chipNarrative(it.kind) + '</div></div>';
      }).join('');
    }

    function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
    function renderHeader() {
      var crest = $('crest');
      if (crest) {
        crest.src = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/' + encodeURIComponent(OWN.club) + '.png';
        crest.alt = OWN.club;
      }
      setText('clubName', OWN.club);
      setText('divPill', OWN.division + ' League');
      var sponWrap = $('sponWrap');
      if (sponWrap) {
        if (OWN.fsSponsor) { setText('fsSpon', OWN.fsSponsor); sponWrap.style.display = ''; }
        else sponWrap.style.display = 'none';
      }
      setText('dvn', AGG.meta.divN[OWN.division]);
      setText('divName', OWN.division);
      setText('tbClub', OWN.club);
    }

    function renderAll() { renderHeader(); renderChips(); render(); }

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
        sel.addEventListener('change', function () { OWN = clubs[+this.value]; renderAll(); updateShare(); });

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

  return { mount: mount };
})();
