/* =========================================================================
   NL Tools — Handbook reader
   File: /handbook/_reader.js
   Version: v1.0 (26/08/2026)

   The reading half of the handbook: the five areas, the outline, the search,
   the clause deep-links, the mobile drawer and the PDF button. It was written
   inline in handbook/reader/index.html and moved here on its second use —
   handbook/public is the same reader with no door on it.

   THE ONLY DIFFERENCE BETWEEN THE TWO PAGES is which entry they call:

       NLHandbook.boot({ gated: true })   -> the code gate, then load()
       NLHandbook.boot({ gated: false })  -> load()

   Everything below is shared. A second copy would have meant the public
   handbook and the club handbook drifting apart on the thing that matters
   most about a rulebook, which is that it says the same thing to everybody.

   The gated page owns the sign-out button and the club name under the title;
   both are guarded here rather than duplicated, because the public page has
   neither and should not pretend to.

   Callers must have loaded firebase-app + firebase-database compat and
   nl-utils before this file, and must contain the markup ids this reads:
   rdShell, rdSide, rdScrim, rdMenu, rdNav, rdToc, rdSearch, rdDoc, rdCrumb,
   rdBrand, rdPdf. The gated page adds rdGate and rdOut.
   ========================================================================= */
window.NLHandbook = (function () {
  'use strict';
  var BASE = 'app-data/ops-handbook';
  var db = firebase.database();
  var $ = function (id) { return document.getElementById(id); };
  var esc = NL.escHtml;

  // Fixed area order (matches the editor).
  var AREAS = [
    { id: 'memorandum', title: 'Memorandum of Association' },
    { id: 'articles', title: 'Articles of Association' },
    { id: 'league-rules', title: 'League Rules' },
    { id: 'appendices', title: 'Appendices' },
    { id: 'board-directives', title: 'Board Directives' }
  ];
  var S = { edition: null, area: null, selected: null, nodeById: {} };

  var fmtDate = NL.formatDate;   // canon: '14 July 2026' (handles epoch ms via NL.parseDate)
  function areaTitle(id) { for (var i = 0; i < AREAS.length; i++) if (AREAS[i].id === id) return AREAS[i].title; return id; }
  function docOf(id) { return S.edition && S.edition.docs && S.edition.docs[id]; }
  function nodesOf(id) {
    var d = docOf(id); if (!d) return [];
    // editions store nodes as an array; be tolerant of an object map too.
    return Array.isArray(d.nodes) ? d.nodes : (d.nodes ? Object.keys(d.nodes).map(function (k) { return d.nodes[k]; }) : []);
  }

  function state(title, msg) {
    $('rdDoc').innerHTML = '<div class="rd-state"><h1>' + esc(title) + '</h1><p>' + esc(msg) + '</p></div>';
  }

  /* ---------- the gate ----------
     One club code, covering every club-facing gated tool — see
     system/club-code-plan.md. The code is checked SERVER-SIDE and nowhere
     else: NL.codeGate.viaFunction posts it to a trigger under
     app-data/club-codes, which mints a token carrying `club: '<key>'`, and
     the RTDB rules on editions/ read that claim. The gate below is the screen;
     the rules are the boundary. A verify that compared the code in this file
     would be neither, and the retired Cup Footage tool is the scar that proves
     it — its answer key shipped in the page with the question.

     What this gate does NOT do is make the handbook confidential. The seed
     JSON in the repo carries the same text and the repo is public (plan §1.0,
     route 3). This is a front door on a building with an open side gate, and
     that is a deliberate, recorded choice — never tell clubs otherwise. */
  function clubLabel(session) {
    if (!session) return '';
    if (session.role === '*') return 'National League';
    if (session.name) return session.name;
    /* Resume path: the token carries the club KEY, not its name — display data
       does not belong in a claim, or renaming a club would mean re-issuing 72
       tokens. Resolve it from clubs-meta instead, which is the source of truth
       for club names anyway.
       CANON CANDIDATE: NL.clubs has byName and byOpta but no byCode, and this
       is not the only place that wants one — the Programme admin console maps
       the same keys to the same names. Promote on the next use. */
    var all = (window.NL && NL.clubs && NL.clubs.all && NL.clubs.all()) || [];
    var hit = all.filter(function (c) { return c.code === session.role; })[0];
    return (hit && hit.name) || session.role;
  }

  /* THE GATED ENTRY. club-directory/public's sibling — handbook/public —
     calls load() directly instead, so this is the whole of the difference
     between the two pages. */
  function gateThenLoad() {
    NL.codeGate.ensure({
      mount: document.getElementById('rdGate'),
      title: 'The National League Handbook',
      /* ACCESS CODE, not club code: the same six characters are held by the
         72 clubs AND by named people at the League, and the League is not a
         club. No "digit" either — the codes are alphanumeric. */
      sub: 'Enter your access code.',
      numeric: false,
      /* The tool rides along with the code so the usage log can say which
         door a club came in by — see noteUse in functions/club-code.js. */
      verify: NL.codeGate.viaFunction('app-data/club-codes', { tool: 'handbook' }),
      claim: 'club'
    }).then(function (session) {
      /* HIDE THE GATE FIRST, and before anything that could throw.

         NL.codeGate resolves its promise and leaves its own card on screen —
         tearing it down is the caller's job, which every other consumer does
         (uw-promo sets display none, club-directory sets hidden) and this page
         did not. The effect was the worst kind of bug: a correct code worked,
         the handbook rendered underneath, and the card stayed on top still
         reading "Checking…" — so the thing that had succeeded looked like the
         thing that had hung, and three separate innocent parties got blamed
         for it, IAM twice.

         Order matters. The shell is revealed and the gate removed before
         clubLabel runs, because clubLabel reads clubs-meta and a throw there
         must not be able to leave a working page invisible behind a spinner
         again. */
      var gate = document.getElementById('rdGate');
      if (gate) gate.hidden = true;
      document.getElementById('rdShell').hidden = false;
      load();

      try {
        var sub = document.querySelector('.nl-idbar__sub');
        if (sub) sub.textContent = clubLabel(session) || 'The National League';
      } catch (_) { /* the bar keeps its default; the handbook still opens */ }
    });
  }

  /* ---------- load ---------- */
  function load() {
  db.ref(BASE + '/publishedEditionId').once('value').then(function (snap) {
    var id = snap.val();
    if (!id) { state('Not published yet', 'The handbook has not been published. Please check back soon.'); return null; }
    wirePdfButton(id);
    return db.ref(BASE + '/editions/' + id).once('value').then(function (s2) { return s2.val(); });
  }).then(function (ed) {
    if (!ed) return;
    S.edition = ed;
    renderNav();
    var t = parseHash();
    if (t && docOf(t.area)) { showArea(t.area, t.nodeId); }
    else { showCover(); }
  }).catch(function (e) {
    /* PERMISSION_DENIED here means the token has no `club` claim — an expired
       session, or the rules deployed before this page did. Say which, because
       "could not be loaded" sends someone to the wrong place entirely. */
    var denied = /permission[_ ]denied/i.test(String((e && e.message) || ''));
    state(denied ? 'Session expired' : 'Unavailable',
      denied ? 'Reload the page and enter your access code again.'
             : 'Sorry — the handbook could not be loaded. ' + (e && e.message || ''));
  });
  }

  // Download PDF: serve the pre-rendered static file when it matches the live
  // edition (instant, CDN-style); otherwise fall back to the print view — e.g.
  // in the window between a publish and the render workflow catching up.
  function wirePdfButton(editionId) {
    fetch('/handbook/pdf-meta.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (meta) {
        if (!meta || meta.editionId !== editionId) return;   // keep print fallback
        /* By id, not by class. This used to reach for .rd-pdf — the old
           header's own class — so renaming the bar would have quietly stopped
           the swap and left everyone on the slower print-view fallback with
           nothing visibly broken to notice. */
        var a = document.getElementById('rdPdf'); if (!a) return;
        a.href = '/handbook/handbook.pdf?e=' + encodeURIComponent(editionId);
        a.removeAttribute('target');
        /* The version lives on the FILE, not the cover — season plus the date
           it was published. Two downloads a month apart are then telling apart
           in a downloads folder, which "…Handbook 2026-27.pdf" twice is not. */
        var stamp = (S.edition && S.edition.publishedAt) ? fmtDate(S.edition.publishedAt) : '';
        a.setAttribute('download', 'The National League Handbook' +
          (meta.season || meta.label ? ' ' + (meta.season || meta.label) : '') +
          (stamp ? ' (' + stamp + ')' : '') + '.pdf');
      })
      .catch(function () { /* print fallback stands */ });
  }

  /* ---------- render ---------- */
  // Title page — the handbook's front cover, stamped with the published edition label.
  function showCover() {
    S.area = null; S.selected = null;
    closeDrawer();
    [].forEach.call($('rdNav').children, function (b) { b.classList.remove('is-active'); });
    var ed = S.edition || {};
    // The big line is the season (from the edition label); the full label — the locked
    // version — appears small with the published date, not massive.
    var season = seasonOf();
    $('rdDoc').innerHTML =
      '<div class="nl-cover">' +
        '<img class="nl-cover__lockup" src="/assets/divisions/The National League.png" alt="The National League">' +
        '<h1 class="nl-cover__title">Handbook</h1>' +
        '<div class="nl-cover__season">' + esc(season) + '</div>' +
        '<div class="nl-cover__rule"></div>' +
        '<div class="nl-cover__divs">' + ['National', 'North', 'South'].map(function (n) {
          return '<img src="/assets/divisions/' + n + '.png" alt="National League ' + n + '">';
        }).join('') + '</div>' +
        // The document's single, quiet statement — bottom of the title page.
        // The edition LABEL is not printed here. It carries the season, which
        // is already the big line above, so "Edition 2026-27" under "2026-27"
        // said one thing twice; and before the editor locked the season into
        // the label it could be free text, which is how a cover came to be
        // headed "v2". "Last updated" rather than "Published": a reader wants
        // to know how current this is, not that a publish event occurred.
        (ed.publishedAt ? '<div class="nl-cover__meta">Last updated ' +
          esc(fmtDate(ed.publishedAt)) + '</div>' : '') +
      '</div>';
    $('rdToc').innerHTML = '';
    $('rdDoc').scrollTop = 0;
    if (S.enteredArea !== '__cover') { enter($('rdDoc')); S.enteredArea = '__cover'; }
    updateCrumb();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  }
  /* THE SEASON HAS ONE SOURCE: edition.season, written at publish.

     It used to be parsed off the front of `label`, while the editor's own cover
     read a SEASON constant — two sources for one fact, so the two pages
     disagreed the moment a label did not start with a season. That is exactly
     what happened: the edition published 28/07/2026 was named "v2", the editor
     showed 2026-27 and this page showed "v2" on the cover and "Handbook v2" in
     the breadcrumb.

     The label parse survives only to read editions published before the field
     existed. Anything that resolves to neither yields NOTHING — an absent
     season line is a gap, a version number standing where the season belongs
     is a false statement about which handbook someone is reading. */
  function seasonOf() {
    var ed = S.edition || {};
    if (ed.season) return String(ed.season);
    var m = String(ed.label || '').match(/^\s*(\d{4}\s*[-\/]\s*\d{2,4})/);
    return m ? m[1] : '';
  }

  function renderNav() {
    /* COVER IS A NAV ITEM, not a secret. The title page was reachable only by
       clicking the brand text in the bar — undiscoverable, and there is no
       reason the front of a document should be harder to reach than any
       chapter of it. It sits above the five areas because that is where it
       sits in the document. */
    $('rdNav').innerHTML =
      '<button class="rd-nav__item" data-area="__cover"' +
      (S.area ? '' : ' aria-current="true"') + '>Cover</button>' +
      AREAS.map(function (a) {
        var has = !!docOf(a.id);
        return '<button class="rd-nav__item" data-area="' + a.id + '"' + (has ? '' : ' disabled style="opacity:.4;cursor:default"') + '>' + esc(a.title) + '</button>';
      }).join('');
  }

  /* Canon's view-entrance (nl-brand.css .nl-enter), the same movement the
     Programme Packs library uses when you open a club. Canon's own rule: run
     it when the view CHANGES, not on every re-render, or picking a clause out
     of the contents replays the whole entrance. So it fires here and on the
     cover, and never on selection or scroll.

     Restarting an animation needs the class off, a reflow read, then the class
     on — reassigning it alone does nothing if it is already there.

     Safe on #rdDoc specifically: .nl-enter animates transform, which makes its
     element a containing block, and a position:sticky descendant stops sticking
     while it runs. The sticky things here — the identity bar, the contents
     rail's head, the breadcrumb — are all outside this pane. */
  function enter(el) {
    if (!el) return;
    el.classList.remove('nl-enter');
    void el.offsetWidth;
    el.classList.add('nl-enter');
  }

  function showArea(area, nodeId) {
    S.area = area; S.selected = nodeId || null;
    closeDrawer();
    [].forEach.call($('rdNav').children, function (b) { b.classList.toggle('is-active', b.dataset.area === area); });
    var d = docOf(area);
    $('rdDoc').innerHTML = (d && d.html) || '<div class="rd-state"><p>This area has no published content.</p></div>';
    if (area !== S.enteredArea) { enter($('rdDoc')); S.enteredArea = area; }
    S.nodeById = {};
    nodesOf(area).forEach(function (n) { S.nodeById[n.id] = n; });
    applySelection();
    renderToc();
    if (nodeId) scrollTo(nodeId);
    else $('rdDoc').scrollTop = 0;
    updateCrumb();
    setHash(area, nodeId);
  }

  /* ---------- "you are here" breadcrumb (mirrors the editor's scroll-spy) ---------- */
  var spyLock = null;   // {secId, until} — pins the highlight on a jump target mid-scroll
  function currentSectionEl() {
    var host = $('rdDoc');
    // The active line must sit BELOW .nl-art's scroll-margin-top (14px), otherwise a
    // section you just jumped to lands above the line and the previous one wins.
    var line = host.getBoundingClientRect().top + 28;
    var arts = host.querySelectorAll('.nl-art'), cur = arts[0] || null;
    for (var i = 0; i < arts.length; i++) {
      if (arts[i].getBoundingClientRect().top <= line) cur = arts[i]; else break;
    }
    return cur;
  }
  function updateCrumb() {
    var crumb = $('rdCrumb'); if (!crumb) return;
    if (!S.area) { crumb.innerHTML = '<span class="nl-crumb__area">Handbook' + (seasonOf() ? ' ' + esc(seasonOf()) : '') + '</span>'; return; }
    // While a jump's smooth scroll is in flight, keep the highlight pinned on the
    // target; release once it arrives (or on timeout for safety).
    if (spyLock) {
      var curEl = currentSectionEl();
      if ((curEl && curEl.getAttribute('data-id')) === spyLock.secId || Date.now() > spyLock.until) spyLock = null;
    }
    var secId;
    if (spyLock) { secId = spyLock.secId; }
    else { var el = currentSectionEl(); secId = el && el.getAttribute('data-id'); }
    var node = secId && S.nodeById[secId];
    var sec = node ? ((node.number ? esc(node.number) + ' · ' : '') + esc(node.title || textOf(node).slice(0, 60))) : '';
    crumb.innerHTML = '<span class="nl-crumb__area">' + esc(areaTitle(S.area)) + '</span>' +
      (sec ? '<span class="nl-crumb__sep">›</span><span class="nl-crumb__sec">' + sec + '</span>' : '');
    // reflect the current section in the contents rail (only when showing the outline)
    if (secId && !($('rdSearch').value || '').trim()) {
      [].forEach.call($('rdToc').querySelectorAll('.rd-toc__item'), function (a) {
        a.classList.toggle('is-current', a.getAttribute('data-goto') === secId);
      });
    }
  }

  function renderToc() {
    var q = ($('rdSearch').value || '').trim();
    if (q) { renderSearch(q); return; }
    var roots = nodesOf(S.area).filter(function (n) { return n.parentId == null; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    $('rdToc').innerHTML = roots.map(function (n) {
      var label = n.title || textOf(n).slice(0, 70) || '(untitled)';
      var cur = (n.id === S.selected) ? ' is-current' : '';
      return '<a class="rd-toc__item' + cur + '" data-goto="' + n.id + '"><span class="rd-toc__num">' + esc(n.number || '') + '</span><span>' + esc(label) + '</span></a>';
    }).join('') || '<p style="color:var(--text-muted);font-size:var(--text-sm);padding:6px 8px">No sections.</p>';
  }

  function textOf(n) {
    if (n.title) return n.title;
    if (n.body) return n.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (n.table) return tableText(n);
    return '';
  }
  function tableText(n) {
    if (!n.table) return '';
    var s = (n.table.header || []).join(' ');
    (n.table.rows || []).forEach(function (r) { s += ' ' + (Array.isArray(r) ? r.join(' ') : ''); });
    return s;
  }

  function renderSearch(q) {
    var ql = q.toLowerCase(), out = [], total = 0;
    AREAS.forEach(function (a) {
      var ns = nodesOf(a.id); if (!ns.length) return;
      var hits = ns.filter(function (n) {
        var t = ((n.title || '') + ' ' + (n.body || '').replace(/<[^>]+>/g, ' ') + ' ' + tableText(n) + ' ' + (n.number || '')).toLowerCase();
        return t.indexOf(ql) !== -1;
      });
      if (!hits.length) return;
      total += hits.length;
      out.push('<div class="rd-toc__group">' + esc(a.title) + ' · ' + hits.length + '</div>');
      hits.slice(0, 40).forEach(function (n) {
        var label = n.title || textOf(n).slice(0, 80) || '(untitled)';
        out.push('<a class="rd-toc__item" data-goto="' + n.id + '" data-area="' + a.id + '"><span class="rd-toc__num">' + esc(n.number || '') + '</span><span>' + esc(label) + '</span></a>');
      });
    });
    $('rdToc').innerHTML = total ? out.join('') : '<p style="color:var(--text-muted);font-size:var(--text-sm);padding:6px 8px">No matches.</p>';
  }

  function applySelection() {
    var host = $('rdDoc');
    [].forEach.call(host.querySelectorAll('.is-sel'), function (el) { el.classList.remove('is-sel'); });
    if (!S.selected) return;
    var el = document.getElementById('c-' + S.selected);
    if (el) el.classList.add('is-sel');
  }
  function scrollTo(nodeId) {
    var el = document.getElementById('c-' + nodeId);
    if (!el) return;
    // Lock the scroll-spy on the tapped section while the smooth scroll is in
    // flight — otherwise the nav highlight snaps back to the current section and
    // rattles through every one in between until the scroll arrives.
    var art = el.closest('.nl-art') || el;
    spyLock = { secId: art.getAttribute('data-id'), until: Date.now() + 2500 };
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateCrumb();
  }

  /* ---------- deep links ---------- */
  var _suppress = false;
  function setHash(area, nodeId) {
    _suppress = true;
    try { location.hash = '#' + area + (nodeId ? '/' + nodeId : ''); } catch (_) {}
    setTimeout(function () { _suppress = false; }, 0);
  }
  function parseHash() {
    var h = (location.hash || '').replace(/^#/, ''); if (!h) return null;
    var i = h.indexOf('/'); var area = i < 0 ? h : h.slice(0, i); var nodeId = i < 0 ? null : h.slice(i + 1);
    if (!AREAS.some(function (a) { return a.id === area; })) return null;
    return { area: area, nodeId: nodeId };
  }
  function goto(area, nodeId) {
    if (area && area !== S.area) { showArea(area, nodeId); return; }
    S.selected = nodeId; applySelection(); renderToc(); if (nodeId) scrollTo(nodeId); setHash(S.area, nodeId);
  }
  function copyLink(nodeId) {
    var url = location.origin + location.pathname + '#' + S.area + '/' + nodeId;
    NL.copy(url);
    setHash(S.area, nodeId);
    NL.toast && NL.toast('Link copied — opens the handbook at this clause', 'success');
  }

  /* ---------- events ---------- */
  /* SIGN OUT, and it must actually sign out. A club code persists per origin
     — that is the point, one code across every tool — so "sign out" that only
     reloads leaves the session intact and the page straight back in. Someone
     handing a club laptop on, or testing a second code, needs the session
     genuinely gone.

     (uw-promo's button reloads and nothing else. Worth revisiting there.)

     NL.codeGate.signOut is canon and does the real thing; the reload after it
     is what puts the gate back up. */
  /* handbook/public has no sign-out, because there is nothing to sign out
     of. Guarded rather than duplicated: the two pages share this file. */
  var outBtn = $('rdOut');
  if (outBtn) outBtn.addEventListener('click', function () {
    var go = function () { location.reload(); };
    if (window.NL && NL.codeGate && NL.codeGate.signOut) NL.codeGate.signOut().then(go, go);
    else go();
  });

  $('rdNav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-area]'); if (!b || b.disabled) return;
    if (b.dataset.area === '__cover') { showCover(); return; }
    showArea(b.dataset.area, null);
  });
  $('rdToc').addEventListener('click', function (e) {
    var a = e.target.closest('[data-goto]'); if (!a) return;
    e.preventDefault(); goto(a.dataset.area || S.area, a.dataset.goto);
  });
  $('rdSearch').addEventListener('input', renderToc);
  $('rdDoc').addEventListener('click', function (e) {
    var num = e.target.closest('.nl-clause__num, .nl-art__num'); if (!num) return;
    var host = num.closest('[data-id]'); if (host) copyLink(host.dataset.id);
  });
  document.getElementById('rdBrand').addEventListener('click', function () { if (S.edition) showCover(); });
  window.addEventListener('hashchange', function () {
    if (_suppress) return;
    var t = parseHash();
    if (t) goto(t.area, t.nodeId);
    else if (S.edition) showCover();
  });

  // Header height feeds the shell (--rd-top) so both panes fill the viewport exactly.
  function setTopVar() {
    var t = document.querySelector('.nl-idbar');
    document.documentElement.style.setProperty('--rd-top', ((t && t.offsetHeight) || 61) + 'px');
  }
  setTopVar();
  window.addEventListener('resize', setTopVar);
  setTimeout(setTopVar, 300);

  // Scroll-spy breadcrumb: update "you are here" as the document scrolls.
  var crumbRaf = null;
  $('rdDoc').addEventListener('scroll', function () {
    if (crumbRaf) return;
    crumbRaf = requestAnimationFrame(function () { crumbRaf = null; updateCrumb(); });
  });
  // On mobile the breadcrumb is the quickest way back to the contents.
  $('rdCrumb').addEventListener('click', function () {
    var menu = $('rdMenu');
    if (menu && getComputedStyle(menu).display !== 'none') {
      $('rdSide').classList.add('is-open'); $('rdScrim').classList.add('is-open');
    }
  });

  // Mobile drawer
  function closeDrawer() { $('rdSide').classList.remove('is-open'); $('rdScrim').classList.remove('is-open'); }
  $('rdMenu').addEventListener('click', function () {
    var open = !$('rdSide').classList.contains('is-open');
    $('rdSide').classList.toggle('is-open', open); $('rdScrim').classList.toggle('is-open', open);
  });
  $('rdScrim').addEventListener('click', closeDrawer);

  /* The whole public contract. `gated` defaults to TRUE: a page that forgets
     to say gets the door, not the open room. */
  function boot(opts) {
    var gated = !opts || opts.gated !== false;
    if (gated) { gateThenLoad(); return; }
    /* REVEALING THE SHELL IS PART OF ENTERING, and on the gated page that job
       belongs to the code gate. Without this the public page loaded the whole
       handbook correctly behind a shell still marked hidden — the failure
       that looks exactly like a broken page and is not one. */
    var shell = $('rdShell');
    if (shell) shell.hidden = false;
    load();
  }

  return { boot: boot, AREAS: AREAS };
}());
