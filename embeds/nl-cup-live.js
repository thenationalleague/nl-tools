/* NL Cup Live — GENERATED FILE, DO NOT EDIT.
 *
 * Built from embeds/nl-cup-live.html by scripts/build-embeds.js.
 * Edit the HTML file and let CI regenerate this.
 *
 * Embed on the public site with:
 *   <div data-nl-cup-live></div>
 *   <script src="https://nl.tools/embeds/nl-cup-live.js" defer></script>
 *
 * If the CMS strips <script src>, use an inline loader instead:
 *   <div data-nl-cup-live></div>
 *   <script>
 *     (function(){var s=document.createElement('script');
 *      s.src='https://nl.tools/embeds/nl-cup-live.js';document.body.appendChild(s);})();
 *   </script>
 */
(function () {
  'use strict';

  // Guard against the snippet appearing twice on one page — the widget owns
  // fixed element IDs, so a second copy would fight the first.
  if (window.__nlCupLiveMounted) {
    if (window.console && console.warn) {
      console.warn('[NL Cup Live] already mounted on this page — ignoring duplicate embed.');
    }
    return;
  }
  window.__nlCupLiveMounted = true;

  var VERSION = "v1.0";
  var CSS = "\n  /* Carbona Variable */\n  @font-face {\n    font-family: \"carbona-variable\";\n    src: url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff2\"),\n         url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/d?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff\");\n    font-display: swap; font-style: normal; font-weight: 200 900; font-stretch: normal;\n  }\n\n  #nlCupLive {\n    /* Values mirror the NL canon (system/nl-brand.css) — embeds can't load\n       the portal stylesheet, so the tokens are inlined verbatim. */\n    --primary:#9e0000; --primary-600:#7e0000; --primary-700:#600000;\n    --navy:#223b7c; --navy-600:#192e63; --navy-300:#9baac9;\n    --green:#1a7030; --amber:#c96f15;\n    --accent-live:#4ade80;\n    --white:#ffffff; --off-white:#f4f6f9;\n    --text:#1a2a44; --text-muted:#5a6a82;\n    --border:#dde3ed;\n    --radius:6px;\n\n    font-family:'carbona-variable','carbona',sans-serif;\n    font-size:15px; line-height:1.45;\n    font-variation-settings:'wght' 400;\n    color:var(--text); -webkit-font-smoothing:antialiased;\n    max-width:1180px; margin:24px auto; padding:0 12px;\n\n    /* Columns step on the width of THIS block, not the window. */\n    container-type:inline-size;\n  }\n  #nlCupLive[hidden] { display:none; }\n  #nlCupLive, #nlCupLive *, #nlCupLive *::before, #nlCupLive *::after { box-sizing:border-box; }\n\n  /* Header ----------------------------------------------------------- */\n  #nlCupLive .nlcl__head {\n    display:flex; align-items:center; gap:10px; flex-wrap:wrap;\n    padding:12px 16px;\n    background:var(--navy);\n    border-bottom:2px solid var(--primary);\n    border-radius:var(--radius) var(--radius) 0 0;\n    color:var(--white);\n  }\n  #nlCupLive .nlcl__mark { flex:none; height:41px; width:auto; display:block; }\n  #nlCupLive .nlcl__title {\n    font-size:17px; letter-spacing:.02em;\n    font-weight:900; font-variation-settings:'wght' 900;\n  }\n  /* Red pill rather than a red dot: canon reserves --accent-live green for\n     pulse dots BECAUSE red on navy is too low-contrast (nl-brand.css §live).\n     Inverting it — white on brand red — keeps the signal red where the fan\n     reads it and keeps the contrast where canon wanted it. */\n  #nlCupLive .nlcl__badge {\n    display:inline-flex; align-items:center; gap:6px;\n    padding:3px 9px 4px; border-radius:999px;\n    background:var(--primary); color:var(--white);\n    font-size:11px; letter-spacing:.09em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlCupLive .nlcl__dot {\n    width:7px; height:7px; border-radius:50%; background:var(--white);\n    animation:nlcl-pulse 1.8s ease-in-out infinite;\n  }\n  @keyframes nlcl-pulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }\n  #nlCupLive .nlcl__date {\n    margin-left:auto;\n    font-size:12px; letter-spacing:.05em; text-transform:uppercase;\n    font-weight:700; font-variation-settings:'wght' 700;\n    color:var(--navy-300);\n  }\n\n  /* Grid ------------------------------------------------------------- */\n  #nlCupLive .nlcl__grid {\n    list-style:none; margin:0; padding:14px;\n    background:var(--off-white);\n    border:1px solid var(--border); border-top:0;\n    border-radius:0 0 var(--radius) var(--radius);\n    display:grid; gap:12px;\n    grid-template-columns:repeat(2, minmax(0, 1fr));\n  }\n  /* display:grid above outbids the UA's [hidden] rule, so the one case where\n     the whole card IS the hero needs saying explicitly. */\n  #nlCupLive .nlcl__grid[hidden] { display:none; }\n  @container (min-width: 560px) {\n    #nlCupLive .nlcl__grid { grid-template-columns:repeat(3, minmax(0, 1fr)); }\n  }\n  @container (min-width: 860px) {\n    #nlCupLive .nlcl__grid { gap:14px; grid-template-columns:repeat(4, minmax(0, 1fr)); }\n  }\n  /* One card left over — the fan's own tie is up in the hero and a single\n     other tie remains. Stretching it the full 1180px makes a letterbox with\n     two 30px crests adrift in it, so it keeps a card's width and sits left. */\n  #nlCupLive .nlcl__grid.is-one { grid-template-columns:minmax(0, 340px); }\n\n  /* Kick-off rail ---------------------------------------------------- */\n  #nlCupLive .nlcl__ko {\n    grid-column:1 / -1;\n    display:flex; align-items:center; gap:10px;\n    margin:2px 0 -2px;\n    font-size:12px; letter-spacing:.08em;\n    font-weight:800; font-variation-settings:'wght' 800;\n    color:var(--text-muted);\n  }\n  #nlCupLive .nlcl__ko::after {\n    content:\"\"; flex:1; height:1px; background:var(--border);\n  }\n  #nlCupLive .nlcl__ko:first-child { margin-top:0; }\n\n  /* Card ------------------------------------------------------------- */\n  #nlCupLive .nlcl__card {\n    --club:var(--navy); --club-ink:var(--white);\n    display:flex; flex-direction:column; height:100%;\n    background:var(--white);\n    border:1px solid var(--border); border-top:3px solid var(--club);\n    border-radius:var(--radius);\n    text-decoration:none; color:inherit;\n    transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;\n  }\n  #nlCupLive a.nlcl__card:hover,\n  #nlCupLive a.nlcl__card:focus-visible {\n    transform:translateY(-3px);\n    box-shadow:0 8px 22px rgba(10,22,40,.14);\n  }\n  #nlCupLive a.nlcl__card:focus-visible { outline:3px solid var(--primary); outline-offset:2px; }\n  /* Played and postponed ties stay on the card so the round reads as a whole,\n     but they stop competing with the ties a fan can still watch. */\n  #nlCupLive .nlcl__card.is-done { opacity:.62; }\n\n  #nlCupLive .nlcl__teams { padding:12px 12px 4px; display:grid; gap:8px; }\n  #nlCupLive .nlcl__team { display:flex; align-items:center; gap:9px; min-width:0; }\n  #nlCupLive .nlcl__crest {\n    flex:none; width:30px; height:30px; min-height:0;\n    object-fit:contain; display:block;\n  }\n  #nlCupLive .nlcl__code {\n    flex:none; width:30px; text-align:center;\n    font-size:12px; letter-spacing:.02em;\n    font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--club);\n  }\n  /* Two lines reserved and two the ceiling: \"Wolverhampton Wanderers PL2\" in\n     a quarter-width column needs both, and a third line would make one card\n     taller than the rest of its row. */\n  #nlCupLive .nlcl__name {\n    min-width:0; flex:1;\n    display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;\n    overflow:hidden; overflow-wrap:break-word;\n    font-size:14px; line-height:1.2;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n\n  #nlCupLive .nlcl__foot {\n    margin-top:auto;\n    display:flex; align-items:center; justify-content:space-between; gap:8px;\n    padding:9px 12px 10px;\n    border-top:1px solid var(--border);\n  }\n  #nlCupLive .nlcl__status {\n    display:inline-flex; align-items:center; gap:6px;\n    font-size:12px; letter-spacing:.06em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n    color:var(--text-muted);\n  }\n  #nlCupLive .nlcl__status.is-live { color:var(--primary); }\n  #nlCupLive .nlcl__status.is-live i {\n    width:7px; height:7px; border-radius:50%; background:var(--primary);\n    animation:nlcl-pulse 1.8s ease-in-out infinite;\n  }\n  #nlCupLive .nlcl__status.is-ft { color:var(--green); }\n  #nlCupLive .nlcl__status.is-off { color:var(--amber); }\n  #nlCupLive .nlcl__watch {\n    margin-left:auto;   /* holds the right edge when the time is left off */\n    display:inline-flex; align-items:center; gap:5px;\n    font-size:12px; letter-spacing:.05em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n    color:var(--primary);\n  }\n  #nlCupLive .nlcl__arrow {\n    flex:none; width:13px; height:13px;\n    transition:transform .16s ease;\n  }\n  #nlCupLive a.nlcl__card:hover .nlcl__arrow,\n  #nlCupLive a.nlcl__card:focus-visible .nlcl__arrow { transform:translate(2px, -2px); }\n\n  /* Hero — the supporter's own club ---------------------------------- */\n  /* Full width above the grid, in the club's own colours. It breaks the\n     kick-off ordering on purpose: a fan who supports one of the sixteen is\n     here for one tie, and hunting for it in a 16-card grid is the thing\n     this is meant to remove. */\n  #nlCupLive .nlcl__hero { margin:0; }\n  #nlCupLive .nlcl__hero[hidden] { display:none; }\n  /* :not([hidden]) matters — an adjacent-sibling rule fires whether or not the\n     sibling is displayed, so without it the grid would carry a seam back to a\n     hero that isn't there. */\n  #nlCupLive .nlcl__hero:not([hidden]) + .nlcl__grid {\n    margin-top:12px; border-top:1px solid var(--border); border-radius:var(--radius);\n  }\n  #nlCupLive .nlcl__herocard {\n    --club:var(--navy); --club-ink:var(--white);\n    display:block; text-decoration:none;\n    background:var(--club); color:var(--club-ink);\n    border:1px solid var(--border); border-top:0;\n    padding:16px;\n    transition:filter .16s ease, box-shadow .16s ease;\n  }\n  #nlCupLive a.nlcl__herocard:hover,\n  #nlCupLive a.nlcl__herocard:focus-visible { filter:brightness(1.08); box-shadow:0 8px 22px rgba(10,22,40,.18); }\n  #nlCupLive a.nlcl__herocard:focus-visible { outline:3px solid var(--primary); outline-offset:2px; }\n  /* Your club is the only tie today — the hero closes the block. */\n  #nlCupLive .nlcl__hero.is-last .nlcl__herocard { border-radius:0 0 var(--radius) var(--radius); }\n  #nlCupLive .nlcl__herotag {\n    display:block; margin-bottom:10px;\n    font-size:11px; letter-spacing:.11em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n    opacity:.78;\n  }\n  #nlCupLive .nlcl__heroline {\n    display:flex; align-items:center; gap:14px; flex-wrap:wrap;\n  }\n  #nlCupLive .nlcl__heroside { display:flex; align-items:center; gap:11px; min-width:0; }\n  #nlCupLive .nlcl__herocrest {\n    flex:none; width:52px; height:52px; object-fit:contain; display:block;\n  }\n  #nlCupLive .nlcl__heroname {\n    font-size:19px; line-height:1.15;\n    font-weight:900; font-variation-settings:'wght' 900;\n  }\n  #nlCupLive .nlcl__herov {\n    font-size:13px; letter-spacing:.1em; text-transform:uppercase;\n    font-weight:700; font-variation-settings:'wght' 700;\n    opacity:.7;\n  }\n  #nlCupLive .nlcl__herometa {\n    margin-left:auto; display:flex; align-items:center; gap:14px;\n    font-size:13px; letter-spacing:.06em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  /* On a club-coloured wash the status tokens are unreadable — muted grey on\n     Hartlepool blue all but disappears, and brand red on a red club would too.\n     Everything in the hero takes the ink the wash was contrast-checked for. */\n  #nlCupLive .nlcl__herometa .nlcl__status,\n  #nlCupLive .nlcl__herometa .nlcl__status.is-live,\n  #nlCupLive .nlcl__herometa .nlcl__status.is-ft,\n  #nlCupLive .nlcl__herometa .nlcl__status.is-off { color:inherit; }\n  #nlCupLive .nlcl__herometa .nlcl__status.is-live i { background:currentColor; }\n  #nlCupLive .nlcl__herowatch {\n    display:inline-flex; align-items:center; gap:6px;\n    padding:8px 14px; border-radius:999px;\n    background:var(--club-ink); color:var(--club);\n  }\n\n  @container (max-width: 460px) {\n    #nlCupLive .nlcl__name { font-size:13px; }\n    #nlCupLive .nlcl__crest, #nlCupLive .nlcl__code { width:26px; }\n    #nlCupLive .nlcl__crest { height:26px; }\n    #nlCupLive .nlcl__heroname { font-size:16px; }\n    #nlCupLive .nlcl__herometa { margin-left:0; width:100%; }\n  }\n\n  @media (prefers-reduced-motion: reduce) {\n    #nlCupLive .nlcl__card,\n    #nlCupLive .nlcl__herocard,\n    #nlCupLive .nlcl__arrow { transition:none; }\n    #nlCupLive a.nlcl__card:hover,\n    #nlCupLive a.nlcl__card:focus-visible { transform:none; }\n    #nlCupLive a.nlcl__card:hover .nlcl__arrow,\n    #nlCupLive a.nlcl__card:focus-visible .nlcl__arrow { transform:none; }\n    #nlCupLive .nlcl__dot,\n    #nlCupLive .nlcl__status.is-live i { animation:none; }\n  }\n";
  var HTML = "<div id=\"nlCupLive\" hidden>\n  <div class=\"nlcl__head\">\n    <img class=\"nlcl__mark\" width=\"30\" height=\"41\" alt=\"National League Cup\" decoding=\"async\"\n         src=\"https://raw.githubusercontent.com/thenationalleague/tools/main/assets/divisions/NL%20Cup.png\">\n    <span class=\"nlcl__title\">National League Cup</span>\n    <span class=\"nlcl__badge\"><i class=\"nlcl__dot\" aria-hidden=\"true\"></i>Live</span>\n    <span class=\"nlcl__date\" id=\"nlcl-date\"></span>\n  </div>\n  <div class=\"nlcl__hero\" id=\"nlcl-hero\" hidden></div>\n  <ul class=\"nlcl__grid\" id=\"nlcl-grid\"></ul>\n</div>";

  function mount() {
    // Mount into the host page's marker div. Falling back to appending our
    // own container means a missing marker degrades to "renders at the
    // bottom" rather than "renders nowhere".
    var host = document.querySelector('[data-nl-cup-live]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-nl-cup-live', '');
      document.body.appendChild(host);
      if (window.console && console.warn) {
        console.warn('[NL Cup Live] no [data-nl-cup-live] element found — appended to <body>.');
      }
    }

    var style = document.createElement('style');
    style.setAttribute('data-nl-embed', "embeds/nl-cup-live.js");
    style.textContent = CSS;
    document.head.appendChild(style);

    // Markup must be in the DOM before the widget runs — its IIFE resolves
    // every element by ID at the top and does not wait for DOMContentLoaded.
    host.innerHTML = HTML;

    if (window.console && console.info) {
      console.info('[NL Cup Live] ' + VERSION + ' mounted.');
    }


    (function () {
      'use strict';

      var root = document.getElementById('nlCupLive');
      if (!root) return;

      var REPO       = 'https://raw.githubusercontent.com/thenationalleague/tools/main/';
      var META_URL   = REPO + 'assets/data/clubs-meta.json';
      var GUESTS_URL = REPO + 'assets/data/cup-clubs-meta.json';
      var LINKS_URL  = REPO + 'assets/data/nl-cup-links.json';
      var CREST_SM   = REPO + 'assets/crests/thumbs/';     /* 96px  — grid cards */
      var CREST_MD   = REPO + 'assets/crests/medium/';     /* 256px — hero only  */

      var API      = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2/matches/';
      var COMP_CUP = 1275;                 /* firm NLS code — never a name match */
      var TZ       = 'Europe/London';
      var POLL_MS  = 60000;

      var dateEl = document.getElementById('nlcl-date');
      var heroEl = document.getElementById('nlcl-hero');
      var grid   = document.getElementById('nlcl-grid');

      /* ---------- helpers ---------- */

      function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      function isHex(h) { return /^#[0-9a-fA-F]{6}$/.test(String(h || '')); }

      function lum(hex) {
        var c = String(hex).replace('#', '');
        var r = parseInt(c.slice(0, 2), 16),
            g = parseInt(c.slice(2, 4), 16),
            b = parseInt(c.slice(4, 6), 16);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }
      function pickTextColor(hex) { return isHex(hex) && lum(hex) > 0.68 ? '#1a2a44' : '#ffffff'; }

      /* First colour that isn't effectively white — white-on-white would erase
         the rule and the hero wash, so Gateshead falls through to its second. */
      function accentFor(colors) {
        var order = [colors.primary, colors.secondary, colors.tertiary];
        for (var i = 0; i < order.length; i++) {
          if (isHex(order[i]) && lum(order[i]) <= 0.93) return order[i];
        }
        return '#223b7c';
      }

      /* NLS dates carry no T and no zone: "2026-08-18 18:00:00" is UTC. */
      function parseKO(str) {
        if (!str) return null;
        var d = new Date(String(str).indexOf('T') > -1 ? str : String(str).replace(' ', 'T') + 'Z');
        return isNaN(d.getTime()) ? null : d;
      }

      /* Everything the fan sees is UK wall-clock, and "today" is the UK calendar
         day. Under BST that is an hour off UTC, which is exactly the gap a naive
         toISOString() day window falls into. */
      function fmt(date, opts) {
        try {
          return new Intl.DateTimeFormat(opts.loc || 'en-GB',
            Object.assign({ timeZone: TZ }, opts.o)).format(date);
        } catch (e) {
          return new Intl.DateTimeFormat(opts.loc || 'en-GB', opts.o).format(date);
        }
      }
      function ukYmd(d)  { return fmt(d, { loc: 'en-CA', o: { year: 'numeric', month: '2-digit', day: '2-digit' } }); }
      function ukTime(d) { return fmt(d, { o: { hour: '2-digit', minute: '2-digit', hour12: false } }); }
      function ukDate(d) { return fmt(d, { o: { weekday: 'long', day: 'numeric', month: 'long' } }); }
      function utcYmd(d) { return new Date(d.getTime()).toISOString().slice(0, 10); }

      /* NLS says "Birmingham City U21"; cup-clubs-meta says "Birmingham City PL2".
         Three of the sixteen academy sides disagree, so both sides get flattened
         to the parent club before any lookup. */
      function baseName(n) {
        return String(n || '').replace(/\s+(PL2|U2[13]|Under[ -]?2[13]|Academy|Development)$/i, '').trim();
      }
      function normKey(n) { return baseName(n).toLowerCase().replace(/[^a-z0-9]/g, ''); }

      function periodState(p) {
        var s = String(p || '').toLowerCase();
        if (s === 'postponed') return 'postponed';
        if (s === 'abandoned') return 'abandoned';
        if (s === 'fulltime' || s === 'postmatch') return 'ft';
        if (['firsthalf', 'secondhalf', 'halftime', 'extratime', 'penalties'].some(function (v) {
          return s.indexOf(v) > -1;
        })) return 'live';
        return 'pre';
      }

      /* ---------- club lookup ---------- */

      var byKey = {};   /* normalised name -> { crestName, colors } */

      function indexClubs(meta, isGuest) {
        (meta && meta.clubs || []).forEach(function (c) {
          if (!c || !c.name) return;
          var rec = { crestName: c.crestName || c.name, colors: c.colors || {} };
          byKey[normKey(c.name)] = rec;
          if (c.crestName) byKey[normKey(c.crestName)] = rec;
          if (isGuest && c.short) byKey[normKey(c.short)] = rec;
        });
      }

      function clubFor(name) {
        return byKey[normKey(name)] || { crestName: baseName(name), colors: {} };
      }

      function crestUrl(base, crestName) { return base + encodeURIComponent(crestName) + '.png'; }

      /* Three-letter fallback would need a code we may not have for a guest, so a
         missing crest steps 96px -> 256px -> the club's initials. */
      function initialsOf(name) {
        return baseName(name).split(/\s+/).map(function (w) { return w.charAt(0); })
          .join('').slice(0, 3).toUpperCase();
      }

      function wireCrests(scope) {
        Array.prototype.forEach.call(scope.querySelectorAll('img[data-fallback]'), function (img) {
          img.addEventListener('error', function () {
            var next = img.getAttribute('data-fallback');
            if (next && img.src !== next) { img.removeAttribute('data-fallback'); img.src = next; return; }
            var span = document.createElement('span');
            span.className = img.getAttribute('data-code-class') || 'nlcl__code';
            span.textContent = img.getAttribute('data-code') || '';
            if (img.parentNode) img.parentNode.replaceChild(span, img);
          });
        });
      }

      /* ---------- NL+ SSO (read-only, never blocking) ---------- */

      function readCookie(name) {
        var parts = (document.cookie || '').split('; ');
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].indexOf(name + '=') === 0) return decodeURIComponent(parts[i].slice(name.length + 1));
        }
        return null;
      }
      function decodeJwtPayload(jwt) {
        if (!jwt) return null;
        var parts = String(jwt).split('.');
        if (parts.length !== 3) return null;
        try {
          var s = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (s.length % 4) s += '=';
          return JSON.parse(decodeURIComponent(escape(atob(s))));
        } catch (e) { return null; }
      }
      /* The SSO middleware writes the cookie asynchronously, so a synchronous read
         at script load misses it on a cold visit. Capped short: the hero is a nice
         -to-have and the matchday card must not wait on it. */
      function favouriteTeam(ms) {
        return new Promise(function (resolve) {
          var deadline = Date.now() + (ms || 1500);
          (function tick() {
            var claims = decodeJwtPayload(readCookie('_gc_sa_sso_access'));
            if (claims && claims.favourite_team) return resolve(String(claims.favourite_team));
            if (Date.now() > deadline) return resolve(null);
            setTimeout(tick, 200);
          })();
        });
      }

      /* ---------- fetch ---------- */

      function getJson(url, opts) {
        return fetch(url, opts || { cache: 'no-cache' }).then(function (r) {
          if (!r.ok) throw new Error(url + ' ' + r.status);
          return r.json();
        });
      }

      /* ±1 day around the UK date, then filtered on the UK date — the window is a
         UTC one and the answer is a local one. */
      function fetchToday(season) {
        var now = new Date();
        var from = utcYmd(new Date(now.getTime() - 864e5)) + ' 00:00:00Z';
        var to   = utcYmd(new Date(now.getTime() + 864e5)) + ' 23:59:59Z';
        var url = API + '?seasonID=' + encodeURIComponent(season) +
          '&competitionID=' + COMP_CUP +
          '&from=' + encodeURIComponent(from) +
          '&to='   + encodeURIComponent(to) +
          '&page.number=1&page.size=100';

        var today = ukYmd(now);
        return getJson(url, { cache: 'no-store' }).then(function (json) {
          return (json && json.data || []).map(function (m) {
            var a = m.attributes || {};
            var ko = parseKO(a.kickOffDateUTC);
            return {
              id: m.id,
              ko: ko,
              home: (a.homeTeam && (a.homeTeam.name || a.homeTeam.shortName)) || '',
              away: (a.awayTeam && (a.awayTeam.name || a.awayTeam.shortName)) || '',
              state: a.postponementReason ? 'postponed' : periodState(a.matchPeriod)
            };
          }).filter(function (m) {
            return m.ko && m.home && ukYmd(m.ko) === today;
          }).sort(function (x, y) {
            return (x.ko - y.ko) || x.home.localeCompare(y.home);
          });
        });
      }

      /* ---------- render ---------- */

      var STATUS = {
        live:      { cls: 'is-live', label: 'Live', dot: true },
        ft:        { cls: 'is-ft',   label: 'Full time' },
        postponed: { cls: 'is-off',  label: 'Postponed' },
        abandoned: { cls: 'is-off',  label: 'Abandoned' }
      };

      var ARROW = '<svg class="nlcl__arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" stroke="currentColor" stroke-width="2"' +
        ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

      function statusHTML(m) {
        var s = STATUS[m.state];
        if (!s) return '<span class="nlcl__status">' + escHtml(ukTime(m.ko)) + '</span>';
        return '<span class="nlcl__status ' + s.cls + '">' +
          (s.dot ? '<i aria-hidden="true"></i>' : '') + escHtml(s.label) + '</span>';
      }

      function teamHTML(name) {
        var club = clubFor(name);
        return '<span class="nlcl__team">' +
          '<img class="nlcl__crest" src="' + escHtml(crestUrl(CREST_SM, club.crestName)) + '"' +
            ' data-fallback="' + escHtml(crestUrl(CREST_MD, club.crestName)) + '"' +
            ' data-code="' + escHtml(initialsOf(name)) + '"' +
            ' alt="" loading="lazy" decoding="async">' +
          '<span class="nlcl__name">' + escHtml(name) + '</span>' +
        '</span>';
      }

      /* A postponed tie keeps its card and loses its link — a stream page for a
         game that is not being played is worse than no link at all. */
      function linkable(m) { return m.state !== 'postponed' && m.state !== 'abandoned'; }

      function cardHTML(m, links, showRails) {
        var accent = accentFor(clubFor(m.home).colors || {});
        var url = linkable(m) ? (links[normKey(m.home)] || '') : '';
        var tag = url ? 'a' : 'div';
        var attrs = url ? ' href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer"' : '';
        var done = (m.state === 'ft' || m.state === 'postponed' || m.state === 'abandoned');
        /* The rail directly above already gives the kick-off time, so printing it
           again on every card under it is the same fact twice. It comes back when
           there is no rail, and when there is no Watch link to fill the row. */
        var quiet = showRails && m.state === 'pre' && url;

        return '<li>' +
          '<' + tag + ' class="nlcl__card' + (done ? ' is-done' : '') + '"' + attrs +
            ' style="--club:' + accent + '"' +
            ' aria-label="' + escHtml(m.home + ' versus ' + m.away + ', ' + ukTime(m.ko) +
              (url ? ' — watch' : '')) + '">' +
            '<span class="nlcl__teams">' + teamHTML(m.home) + teamHTML(m.away) + '</span>' +
            '<span class="nlcl__foot">' +
              (quiet ? '' : statusHTML(m)) +
              (url ? '<span class="nlcl__watch"><span>Watch</span>' + ARROW + '</span>' : '') +
            '</span>' +
          '</' + tag + '>' +
        '</li>';
      }

      function heroHTML(m, links) {
        var club = clubFor(m.fav);
        var accent = accentFor(club.colors || {});
        var ink = pickTextColor(accent);
        var url = linkable(m) ? (links[normKey(m.home)] || '') : '';
        var tag = url ? 'a' : 'div';
        var attrs = url ? ' href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer"' : '';

        function side(name) {
          var c = clubFor(name);
          return '<span class="nlcl__heroside">' +
            '<img class="nlcl__herocrest" src="' + escHtml(crestUrl(CREST_MD, c.crestName)) + '"' +
              ' data-fallback="' + escHtml(crestUrl(CREST_SM, c.crestName)) + '"' +
              ' data-code="' + escHtml(initialsOf(name)) + '" data-code-class="nlcl__heroname"' +
              ' alt="" loading="eager" decoding="async">' +
            '<span class="nlcl__heroname">' + escHtml(name) + '</span>' +
          '</span>';
        }

        return '<' + tag + ' class="nlcl__herocard"' + attrs +
          ' style="--club:' + accent + ';--club-ink:' + ink + '"' +
          ' aria-label="' + escHtml('Your club: ' + m.home + ' versus ' + m.away + ', ' + ukTime(m.ko)) + '">' +
          (m.solo ? '' : '<span class="nlcl__herotag">Your club today</span>') +
          '<span class="nlcl__heroline">' +
            side(m.home) +
            '<span class="nlcl__herov">v</span>' +
            side(m.away) +
            '<span class="nlcl__herometa">' + statusHTML(m) +
              (url ? '<span class="nlcl__herowatch">Watch' + ARROW + '</span>' : '') +
            '</span>' +
          '</span>' +
        '</' + tag + '>';
      }

      function render(matches, links, fav) {
        if (!matches.length) { root.hidden = true; return; }

        var hero = null;
        if (fav) {
          var favKey = normKey(fav);
          for (var i = 0; i < matches.length; i++) {
            if (normKey(matches[i].home) === favKey || normKey(matches[i].away) === favKey) {
              hero = matches[i];
              hero.fav = normKey(matches[i].home) === favKey ? matches[i].home : matches[i].away;
              break;
            }
          }
        }

        /* A one-tie night is the whole widget, so it gets the hero treatment
           whoever the fan supports — as a grid card it would be two 30px crests
           marooned in a 1180px letterbox. The "Your club today" tag stays off
           unless the tie really is theirs; there is nothing to distinguish it
           from when it is the only thing on screen. */
        if (!hero && matches.length === 1) {
          hero = matches[0];
          hero.fav = matches[0].home;
          hero.solo = true;
        }

        var rest = matches.filter(function (m) { return m !== hero; });

        if (hero) {
          heroEl.innerHTML = heroHTML(hero, links);
          heroEl.hidden = false;
          wireCrests(heroEl);
        } else {
          heroEl.innerHTML = '';
          heroEl.hidden = true;
        }

        /* Kick-off rails only earn their place when there is more than one time to
           tell apart — a single bucket would be a label for the whole card. */
        var times = rest.map(function (m) { return ukTime(m.ko); });
        var showRails = times.some(function (t) { return t !== times[0]; });

        var html = '', lastKO = null;
        rest.forEach(function (m) {
          var t = ukTime(m.ko);
          if (showRails && t !== lastKO) {
            html += '<li class="nlcl__ko" role="presentation">' + escHtml(t) + '</li>';
            lastKO = t;
          }
          html += cardHTML(m, links, showRails);
        });

        grid.innerHTML = html;
        grid.classList.toggle('is-one', rest.length === 1);
        grid.hidden = rest.length === 0;
        heroEl.classList.toggle('is-last', rest.length === 0);
        wireCrests(grid);

        dateEl.textContent = ukDate(matches[0].ko);
        root.hidden = false;
      }

      /* ---------- boot ---------- */

      /* The widget stays hidden until it knows there is something to show. A
         skeleton that resolves to nothing is not silence. */
      var links = {};

      function loadLinks(json) {
        var out = {};
        Object.keys((json && json.links) || {}).forEach(function (name) {
          var url = String(json.links[name] || '').trim();
          if (url) out[normKey(name)] = url;
        });
        return out;
      }

      function soft(p, fallback) {
        return p.catch(function (e) {
          if (window.console && console.warn) console.warn('[NL Cup Live]', e && e.message || e);
          return fallback;
        });
      }

      Promise.all([
        getJson(META_URL),
        soft(getJson(GUESTS_URL), { clubs: [] }),
        soft(getJson(LINKS_URL), { links: {} }),
        favouriteTeam(1500)
      ]).then(function (res) {
        indexClubs(res[0], false);
        indexClubs(res[1], true);
        links = loadLinks(res[2]);
        var fav = res[3];
        var season = (res[0].seasons && res[0].seasons.current) || '';
        if (!season) throw new Error('no current season in clubs-meta');

        function cycle() {
          return fetchToday(season).then(function (matches) {
            render(matches, links, fav);
          });
        }

        return cycle().then(function () {
          /* One request a minute, and only while the tab is being looked at — a
             card that says LIVE has to be able to stop saying it, and a widget
             left open overnight has to go quiet at midnight on its own. */
          setInterval(function () {
            if (document.hidden) return;
            cycle().catch(function () { /* keep the last good card on screen */ });
          }, POLL_MS);
        });
      }).catch(function (e) {
        /* Failing silently is the correct failure here: on all but ~10 days a
           season the right output IS nothing, so an error box would be wrong far
           more often than it was right. */
        root.hidden = true;
        if (window.console && console.warn) console.warn('[NL Cup Live] not rendered.', e && e.message || e);
      });
    })();

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
