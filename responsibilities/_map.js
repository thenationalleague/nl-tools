/* =========================================================================
   NL Tools — Responsibilities map
   File: /responsibilities/_map.js
   Version: v1.0 (08/10/2026)

   The spoke map, its detail panel, the "Without" switches and the
   narrow-screen list — everything that DRAWS the department's work. Moved out
   of responsibilities/index.html when /responsibilities/view/ became a second
   page showing the same map read-only, so a change to how the map looks or
   computes a share is made once.

   What stays with each page is what differs between them: the edit page owns
   every write (functions, bullets, people, import), the view page owns its
   code gate. This file writes nothing and knows nothing about Firebase — a
   page hands it data with setData() and it draws.

   Usage:
     var map = RespMap.create(document.getElementById('rpHost'), {
       emptyText:   'Nothing has been added yet.',
       actions:     someNode,                     // optional, right of the bar
       isEditing:   function () { return false; }, // optional
       panelTools:  function (fid, fn) { return [nodes]; }, // optional
       onItemClick: function (fid, iid) {}         // optional, edit mode only
     });
     map.setData({ people: {...}, functions: {...} });

   Data shape (RTDB app-data/media-responsibilities):
     people/{pid}     { initials, name, external, colour 1–8, order }
     functions/{fid}  { name, emoji, note, order,
                        items/{iid}: { text, group, sop, order, shares/{pid}: pct } }
   ========================================================================= */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var TEMPLATE =
    '<div class="rp-bar">' +
      '<div class="rp-without" data-rp="without"></div>' +
      '<div class="rp-actions" data-rp="actions">' +
        '<div class="rp-legend" aria-hidden="true">' +
          '<span><i class="is-staff"></i>Staff</span>' +
          '<span><i class="is-ext"></i>External</span>' +
          '<span><i class="rp-unowned-fill"></i>Unowned</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="rp-stage" data-rp="stage">' +
      '<div class="rp-map-wrap">' +
        '<div class="rp-map" data-rp="map">' +
          '<svg class="rp-spokes" data-rp="spokes" aria-hidden="true"></svg>' +
          '<div class="rp-hub" data-rp="hub"><small>Department</small><strong>Media,<br>Communications,<br>Digital &amp;<br>Broadcast</strong></div>' +
        '</div>' +
      '</div>' +
      '<div class="rp-scrim" data-rp="scrim"></div>' +
      '<section class="rp-panel" aria-live="polite">' +
        '<div class="rp-panel__inner" data-rp="panel"></div>' +
      '</section>' +
    '</div>' +
    '<div class="rp-list" data-rp="list"></div>' +
    '<div class="empty-state" data-rp="empty" hidden>' +
      '<div class="empty-state__icon">🗺️</div>' +
      '<div class="empty-state__title">No functions yet</div>' +
      '<div class="empty-state__text" data-rp="emptyText"></div>' +
    '</div>';

  function create(host, opts) {
    opts = opts || {};
    var isEditing = typeof opts.isEditing === 'function' ? opts.isEditing : function () { return false; };

    var data = { people: {}, functions: {} };
    var away = {};          /* pid → true while switched out (view state only) */
    var current = null;     /* open function id */

    var el = {};
    var nodes = {};         /* fid → { btn, line, mirror } */
    var order = [];         /* fids in display order */
    var shown = null, raf = 0, animateNext = false, laidOut = false;
    var ring;

    /* ── Data helpers ─────────────────────────────────────────────────── */
    function byOrder(obj) {
      return Object.keys(obj || {}).map(function (k) { return { id: k, v: obj[k] }; })
        .sort(function (a, b) { return (a.v.order || 0) - (b.v.order || 0); });
    }
    function people() { return byOrder(data.people); }
    function fns() { return byOrder(data.functions); }
    function items(fn) { return byOrder(fn && fn.items); }

    /* A bullet's split for display: present people's shares; everything else
       (unassigned, switched-out people, deleted people) is Unowned. */
    function itemSplit(item) {
      var shares = (item && item.shares) || {};
      var out = [], total = 0;
      people().forEach(function (p) {
        var pct = Number(shares[p.id]) || 0;
        if (pct > 0 && !away[p.id]) { out.push({ pid: p.id, pct: pct }); total += pct; }
      });
      return { parts: out, unowned: Math.max(0, 100 - total) };
    }
    /* A function's split: the average of its bullets, each bullet weighted equally. */
    function fnSplit(fn) {
      var list = items(fn);
      if (!list.length) return null;
      var acc = {}, un = 0;
      list.forEach(function (it) {
        var s = itemSplit(it.v);
        s.parts.forEach(function (p) { acc[p.pid] = (acc[p.pid] || 0) + p.pct; });
        un += s.unowned;
      });
      var parts = people().filter(function (p) { return acc[p.id]; })
        .map(function (p) { return { pid: p.id, pct: acc[p.id] / list.length }; });
      return { parts: parts, unowned: un / list.length };
    }

    function colourVar(p) {
      var n = Math.min(8, Math.max(1, Number(p && p.colour) || 1));
      return 'var(--rp-p' + n + ')';
    }

    function chip(pid, pct) {
      var p = data.people[pid];
      var s = document.createElement('span');
      s.className = 'rp-chip' + (p && p.external ? ' is-ext' : '');
      s.style.setProperty('--pc', colourVar(p));
      s.title = p ? (p.name || p.initials) + (p.external ? ' (external)' : '') : '';
      s.appendChild(dot());
      s.appendChild(document.createTextNode(p ? p.initials : '?'));
      if (pct != null) {
        var b = document.createElement('span');
        b.className = 'rp-chip__pct';
        b.textContent = Math.round(pct) + '%';
        s.appendChild(b);
      }
      return s;
    }
    function dot() {
      var d = document.createElement('i');
      d.className = 'rp-chip__dot';
      d.setAttribute('aria-hidden', 'true');
      return d;
    }
    function unownedChip(pct) {
      var s = document.createElement('span');
      s.className = 'rp-chip is-unowned';
      s.textContent = 'Unowned ' + Math.round(pct) + '%';
      return s;
    }
    function strip(split, big) {
      var s = document.createElement('div');
      s.className = 'rp-strip' + (big ? ' rp-strip--lg' : '');
      if (!split) return s;
      split.parts.forEach(function (p) {
        var seg = document.createElement('span');
        seg.style.width = p.pct + '%';
        seg.style.background = colourVar(data.people[p.pid]);
        seg.title = (data.people[p.pid] || {}).initials + ' ' + Math.round(p.pct) + '%';
        s.appendChild(seg);
      });
      if (split.unowned > 0.01) {
        var u = document.createElement('span');
        u.className = 'rp-unowned-fill';
        u.style.width = split.unowned + '%';
        u.title = 'Unowned ' + Math.round(split.unowned) + '%';
        s.appendChild(u);
      }
      return s;
    }

    /* ── Without switches ─────────────────────────────────────────────── */
    function renderWithout() {
      var host = el.without;
      host.textContent = '';
      var list = people();
      if (!list.length) return;
      var lab = document.createElement('span');
      lab.className = 'rp-without__label';
      lab.textContent = 'Without';
      host.appendChild(lab);
      list.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rp-chip' + (p.v.external ? ' is-ext' : '');
        b.style.setProperty('--pc', colourVar(p.v));
        b.appendChild(dot());
        b.appendChild(document.createTextNode(p.v.initials));
        b.title = (p.v.name || p.v.initials) + (away[p.id] ? ' — back in' : ' — take out');
        b.setAttribute('aria-pressed', away[p.id] ? 'true' : 'false');
        b.addEventListener('click', function () {
          if (away[p.id]) delete away[p.id]; else away[p.id] = true;
          renderAll();
        });
        host.appendChild(b);
      });
    }

    /* ── Map ──────────────────────────────────────────────────────────── */
    function nodeInner(fn) {
      var frag = document.createDocumentFragment();
      var row = document.createElement('span');
      row.className = 'rp-node__row';
      var em = document.createElement('span');
      em.className = 'rp-node__emoji';
      em.textContent = fn.emoji || '•';
      var nm = document.createElement('span');
      nm.className = 'rp-node__name';
      nm.textContent = fn.name || 'Untitled';
      row.appendChild(em); row.appendChild(nm);
      frag.appendChild(row);
      frag.appendChild(strip(fnSplit(fn)));
      return frag;
    }

    function buildNodes() {
      var list = fns();
      var keep = {};
      order = list.map(function (f) { return f.id; });
      list.forEach(function (f) {
        keep[f.id] = true;
        var n = nodes[f.id];
        if (!n) {
          var line = document.createElementNS(NS, 'line');
          el.spokes.appendChild(line);
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'rp-node';
          b.setAttribute('aria-pressed', 'false');
          b.addEventListener('click', function () {
            if (current === f.id) closePanel(); else openPanel(f.id);
          });
          el.map.appendChild(b);
          var mirror = document.createElement('div');
          mirror.className = 'rp-node';
          el.measure.appendChild(mirror);
          n = nodes[f.id] = { btn: b, line: line, mirror: mirror };
        }
        n.btn.textContent = ''; n.btn.appendChild(nodeInner(f.v));
        n.mirror.textContent = ''; n.mirror.appendChild(nodeInner(f.v));
        n.btn.setAttribute('aria-label', (f.v.name || 'Untitled'));
        n.btn.setAttribute('aria-pressed', current === f.id ? 'true' : 'false');
        n.line.classList.toggle('on', current === f.id);
      });
      Object.keys(nodes).forEach(function (id) {
        if (keep[id]) return;
        var n = nodes[id];
        n.btn.remove(); n.line.remove(); n.mirror.remove();
        delete nodes[id];
      });
    }

    function clamp(min, v, max) { return Math.max(min, Math.min(max, v)); }
    function curve(cx, cy, rx, ry, sq, a) {
      var c = Math.cos(a), s = Math.sin(a);
      return [cx + rx * Math.sign(c) * Math.pow(Math.abs(c), sq), cy + ry * Math.sign(s) * Math.pow(Math.abs(s), sq)];
    }
    /* Space boxes by the room they need: beside a neighbour a box needs its
       width, above one it needs its height. */
    function evenPlaces(cx, cy, rx, ry, sq, bw, bh, n) {
      var S = 720, pts = [], cum = [0], k;
      for (k = 0; k <= S; k++) pts.push(curve(cx, cy, rx, ry, sq, -Math.PI / 2 + k / S * 2 * Math.PI));
      for (k = 1; k <= S; k++) cum.push(cum[k - 1] + Math.abs(pts[k][0] - pts[k - 1][0]) / bw + Math.abs(pts[k][1] - pts[k - 1][1]) / bh);
      var T = cum[S], out = [], j = 0;
      for (var i = 0; i < n; i++) {
        var target = T * (i + 0.5) / n;
        while (j < S && cum[j + 1] < target) j++;
        var f = (target - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
        out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
      }
      return out;
    }

    /* Largest text size at which every box (as wide as its own title) fits
       round the hub without touching another box or the hub. */
    function solve(W, H) {
      var n = order.length, cx = W / 2, cy = H / 2, pad = 6, gap = 10;
      var hubD = clamp(140, Math.min(W, H) * 0.24, 300);
      var mir = order.map(function (id) { return nodes[id].mirror; });
      var best = null, ws, hs;
      for (var fs = clamp(16, Math.min(W, H) * 0.03, 28); fs >= 11 && !best; fs -= 0.5) {
        mir.forEach(function (m) { m.style.width = 'auto'; m.style.fontSize = fs + 'px'; });
        ws = mir.map(function (m) { return Math.ceil(m.offsetWidth) + 2; });
        /* Every box takes the widest title's width, so the strips compare like for like. */
        var wMax = Math.max.apply(null, ws);
        ws = ws.map(function () { return wMax; });
        hs = mir.map(function (m) { return m.offsetHeight; });
        if (!n || Math.max.apply(null, ws) > W * 0.48) continue;
        var avgW = ws.reduce(function (t, v) { return t + v; }, 0) / n;
        var nh = Math.max.apply(null, hs);
        var rx = W / 2 - avgW / 2 - pad, ry = H / 2 - nh / 2 - pad;
        [1, 0.85, 0.7, 0.55, 0.45].forEach(function (sq) {
          [true, false].forEach(function (even) {
            if (best) return;
            var places = even ? evenPlaces(cx, cy, rx, ry, sq, avgW + gap, nh + gap, n) : null;
            var rects = [], pts = [], ok = true;
            for (var i = 0; i < n && ok; i++) {
              var p = places ? places[i] : curve(cx, cy, rx, ry, sq, -Math.PI / 2 + Math.PI / n + i * 2 * Math.PI / n);
              var x = clamp(pad + ws[i] / 2, p[0], W - pad - ws[i] / 2), y = clamp(pad + hs[i] / 2, p[1], H - pad - hs[i] / 2);
              var r = [x - ws[i] / 2, y - hs[i] / 2, x + ws[i] / 2, y + hs[i] / 2];
              var hr = hubD / 2 + gap;
              if (r[0] < cx + hr && r[2] > cx - hr && r[1] < cy + hr && r[3] > cy - hr) ok = false;
              for (var j = 0; j < rects.length && ok; j++) {
                var q = rects[j];
                if (r[0] < q[2] + gap && q[0] < r[2] + gap && r[1] < q[3] + gap && q[1] < r[3] + gap) ok = false;
              }
              rects.push(r); pts.push({ x: x, y: y, o: 1, s: 1 });
            }
            if (ok) best = { cx: cx, cy: cy, rx: rx, ry: ry, sq: sq, ws: ws.slice(), fs: fs, hubD: hubD, pts: pts };
          });
        });
      }
      if (!best) {
        var rx2 = W / 2 - 100 - pad, ry2 = H / 2 - 30 - pad;
        best = { cx: cx, cy: cy, rx: rx2, ry: ry2, sq: 0.7, ws: ws || [], fs: 11, hubD: hubD,
          pts: order.map(function (_, i) { var p = curve(cx, cy, rx2, ry2, 0.7, -Math.PI / 2 + Math.PI / n + i * 2 * Math.PI / n); return { x: p[0], y: p[1], o: 1, s: 1 }; }) };
      }
      return best;
    }

    function draw(st) {
      el.hub.style.transform = 'translate(' + st.cx + 'px,' + st.cy + 'px) translate(-50%,-50%)';
      var d = '';
      for (var k = 0; k <= 96; k++) {
        var pt = curve(st.cx, st.cy, st.rx, st.ry, st.sq, k / 96 * 2 * Math.PI);
        d += (k ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1);
      }
      ring.setAttribute('d', d + 'Z');
      st.pts.forEach(function (o, i) {
        var n = nodes[order[i]];
        if (!n) return;
        n.btn.style.transform = 'translate(' + o.x + 'px,' + o.y + 'px) translate(-50%,-50%)' + (o.s < 0.999 ? ' scale(' + o.s + ')' : '');
        n.btn.style.opacity = o.o >= 0.999 ? '' : o.o;
        var f = Math.min(1, o.o * 1.4);
        n.line.setAttribute('x1', st.cx); n.line.setAttribute('y1', st.cy);
        n.line.setAttribute('x2', st.cx + (o.x - st.cx) * f); n.line.setAttribute('y2', st.cy + (o.y - st.cy) * f);
      });
    }

    function lerp(a, b, t) { return a + (b - a) * t; }
    function ease(t) { return 1 - Math.pow(1 - t, 4); }
    function reduced() {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
    }
    function tween(from, to, dur, stagger) {
      cancelAnimationFrame(raf);
      from = from || collapsed(to);
      var start = performance.now();
      function frame(now) {
        var elp = now - start, done = true, tg = ease(Math.min(1, elp / dur));
        var st = { cx: lerp(from.cx, to.cx, tg), cy: lerp(from.cy, to.cy, tg), rx: lerp(from.rx, to.rx, tg), ry: lerp(from.ry, to.ry, tg), sq: lerp(from.sq, to.sq, tg), pts: [] };
        to.pts.forEach(function (p, i) {
          var rawT = (elp - i * stagger) / dur;
          if (rawT < 1) done = false;
          var t = ease(clamp(0, rawT, 1)), f = from.pts[i] || { x: to.cx, y: to.cy, o: 0, s: 0.6 };
          st.pts.push({ x: lerp(f.x, p.x, t), y: lerp(f.y, p.y, t), o: lerp(f.o, p.o, t), s: lerp(f.s, p.s, t) });
        });
        shown = st; draw(st);
        if (!done) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    function collapsed(t) {
      return { cx: t.cx, cy: t.cy, rx: t.rx * 0.3, ry: t.ry * 0.3, sq: t.sq,
        pts: t.pts.map(function () { return { x: t.cx, y: t.cy, o: 0, s: 0.6 }; }) };
    }

    function sizeStage() {
      var top = el.stage.getBoundingClientRect().top + window.scrollY;
      el.stage.style.height = Math.max(520, window.innerHeight - top - 20) + 'px';
      el.stage.style.setProperty('--rp-panel', 'clamp(480px, 30vw, 660px)');
    }

    function layout(animate) {
      var W = el.map.clientWidth, H = el.map.clientHeight;
      if (!W || !H || !order.length) return;
      var target = solve(W, H);
      el.spokes.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      order.forEach(function (id, i) {
        nodes[id].btn.style.width = target.ws[i] + 'px';
        nodes[id].btn.style.fontSize = target.fs + 'px';
      });
      el.hub.style.width = el.hub.style.height = target.hubD + 'px';
      el.hub.style.fontSize = (target.hubD * 0.09) + 'px';
      var sameCount = shown && shown.pts.length === target.pts.length;
      if (reduced()) { cancelAnimationFrame(raf); shown = target; draw(target); return; }
      if (!laidOut || !shown) {
        /* First view: the boxes fan out from the hub one after another. */
        laidOut = true;
        tween(collapsed(target), target, 700, 40);
        return;
      }
      if (animate || !sameCount) tween(shown, target, 650, 0);
      else { cancelAnimationFrame(raf); shown = target; draw(target); }
    }

    /* ── Panel ────────────────────────────────────────────────────────── */
    function renderPanel() {
      var inner = el.panelInner;
      inner.textContent = '';
      var fn = current && data.functions[current];
      if (!fn) return;

      var head = document.createElement('div');
      head.className = 'rp-panel__head';
      var em = document.createElement('span');
      em.className = 'rp-panel__emoji';
      em.textContent = fn.emoji || '•';
      head.appendChild(em);
      var tools = document.createElement('div');
      tools.className = 'rp-panel__tools';
      if (typeof opts.panelTools === 'function') {
        (opts.panelTools(current, fn) || []).forEach(function (n) { tools.appendChild(n); });
      }
      tools.appendChild(btn('Close', 'btn--ghost btn--sm', closePanel));
      head.appendChild(tools);
      inner.appendChild(head);

      var h = document.createElement('h2');
      h.textContent = fn.name || 'Untitled';
      inner.appendChild(h);
      inner.appendChild(strip(fnSplit(fn), true));

      var list = items(fn), lastGroup = null, ul = null;
      list.forEach(function (it) {
        var g = (it.v.group || '').trim();
        if (!ul || g !== lastGroup) {
          if (g) {
            var gl = document.createElement('p');
            gl.className = 'rp-group';
            gl.textContent = g;
            inner.appendChild(gl);
          }
          ul = document.createElement('ul');
          ul.className = 'rp-items';
          inner.appendChild(ul);
          lastGroup = g;
        }
        ul.appendChild(itemRow(current, it));
      });
      if (!list.length) {
        var e = document.createElement('p');
        e.className = 'rp-note';
        e.textContent = isEditing() ? 'No bullets yet. Use Add bullet.' : 'No bullets yet.';
        inner.appendChild(e);
      }
      if (fn.note) {
        var note = document.createElement('p');
        note.className = 'rp-note';
        note.textContent = fn.note;
        inner.appendChild(note);
      }

      var foot = document.createElement('div');
      foot.className = 'rp-panel__foot';
      foot.appendChild(btn('← Previous', 'btn--ghost btn--sm', function () { step(-1); }));
      foot.appendChild(btn('Next →', 'btn--ghost btn--sm', function () { step(1); }));
      inner.appendChild(foot);
    }

    function itemRow(fid, it) {
      var editing = isEditing();
      var li = document.createElement('li');
      li.className = 'rp-item' + (editing ? ' is-editable' : '');
      var t = document.createElement('div');
      t.className = 'rp-item__text';
      t.textContent = it.v.text || '';
      li.appendChild(t);
      var meta = document.createElement('div');
      meta.className = 'rp-item__meta';
      var s = itemSplit(it.v);
      s.parts.sort(function (a, b) { return b.pct - a.pct; })
        .forEach(function (p) { meta.appendChild(chip(p.pid, p.pct)); });
      if (s.unowned > 0.01) meta.appendChild(unownedChip(s.unowned));
      if (it.v.sop) {
        var a = document.createElement('a');
        a.className = 'rp-item__sop';
        a.href = it.v.sop;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'SOP';
        a.prepend(window.NL && NL.icon ? NL.icon('link', 'sm') : document.createTextNode(''));
        a.addEventListener('click', function (e) { e.stopPropagation(); });
        meta.appendChild(a);
      }
      li.appendChild(meta);
      if (editing && typeof opts.onItemClick === 'function') {
        li.addEventListener('click', function () { opts.onItemClick(fid, it.id); });
      }
      return li;
    }

    function btn(label, cls, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    }

    function openPanel(fid) {
      var wasOpen = el.stage.classList.contains('is-open');
      current = fid;
      if (!wasOpen) animateNext = true;
      el.stage.classList.add('is-open');
      renderAll();
      el.panelInner.scrollTop = 0;
    }
    function closePanel() {
      if (!current) return;
      var last = current;
      current = null;
      animateNext = true;
      el.stage.classList.remove('is-open');
      renderAll();
      if (nodes[last]) nodes[last].btn.focus();
    }
    function step(dir) {
      if (!order.length) return;
      var i = order.indexOf(current);
      openPanel(order[(i + dir + order.length) % order.length]);
    }

    /* ── Narrow-screen list ───────────────────────────────────────────── */
    function renderList() {
      el.list.textContent = '';
      fns().forEach(function (f) {
        var d = document.createElement('details');
        d.className = 'disclosure rp-fn';
        var s = document.createElement('summary');
        s.textContent = (f.v.emoji ? f.v.emoji + '  ' : '') + (f.v.name || 'Untitled');
        d.appendChild(s);
        var body = document.createElement('div');
        body.className = 'rp-fn__body';
        body.appendChild(strip(fnSplit(f.v), true));
        var ul = document.createElement('ul');
        ul.className = 'rp-items';
        items(f.v).forEach(function (it) { ul.appendChild(itemRow(f.id, it)); });
        body.appendChild(ul);
        d.appendChild(body);
        el.list.appendChild(d);
      });
    }

    /* ── Render all ───────────────────────────────────────────────────── */
    function renderAll() {
      if (current && !data.functions[current]) { current = null; el.stage.classList.remove('is-open'); }
      var has = fns().length > 0;
      el.empty.hidden = has;
      el.stage.style.visibility = has ? '' : 'hidden';
      renderWithout();
      buildNodes();
      renderPanel();
      renderList();
      requestAnimationFrame(function () { layout(animateNext); animateNext = false; });
    }

    /* ── Mount ────────────────────────────────────────────────────────── */
    host.innerHTML = TEMPLATE;
    function part(name) { return host.querySelector('[data-rp="' + name + '"]'); }
    el.stage = part('stage');
    el.map = part('map');
    el.spokes = part('spokes');
    el.hub = part('hub');
    el.panelInner = part('panel');
    el.without = part('without');
    el.list = part('list');
    el.empty = part('empty');
    part('emptyText').textContent = opts.emptyText || '';
    if (opts.actions) part('actions').appendChild(opts.actions);
    el.measure = document.createElement('div');
    el.measure.className = 'rp-measure';
    el.measure.setAttribute('aria-hidden', 'true');
    el.map.appendChild(el.measure);
    ring = document.createElementNS(NS, 'path');
    el.spokes.appendChild(ring);
    part('scrim').addEventListener('click', closePanel);

    document.addEventListener('keydown', function (e) {
      if (!current || document.querySelector('.modal-backdrop')) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') closePanel();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    });

    sizeStage();
    if (window.ResizeObserver) new ResizeObserver(function () { layout(animateNext); animateNext = false; }).observe(el.map);
    window.addEventListener('resize', sizeStage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(false); });

    return {
      setData: function (v) {
        v = v || {};
        data = { people: v.people || {}, functions: v.functions || {} };
        renderAll();
      },
      data: function () { return data; },
      people: people,
      fns: fns,
      items: items,
      chip: chip,
      current: function () { return current; },
      open: openPanel,
      close: closePanel,
      /* Redraw the panel and list after edit mode changes what they offer. */
      refresh: function () { renderPanel(); renderList(); },
      /* Glide rather than jump on the next layout — after a reorder. */
      animateNext: function () { animateNext = true; },
      /* Forget a removed person's Without switch. */
      forget: function (pid) { delete away[pid]; },
      /* Back to a first view, after an import replaces everything. */
      reset: function () {
        away = {}; current = null; laidOut = false; shown = null;
        el.stage.classList.remove('is-open');
      },
      /* Lay the stage out again once something above it has changed height. */
      resize: sizeStage
    };
  }

  window.RespMap = { create: create };
})();
