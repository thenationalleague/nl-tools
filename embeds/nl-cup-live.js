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

  var VERSION = "v1.1";
  var CSS = "\n  /* Carbona Variable */\n  @font-face {\n    font-family: \"carbona-variable\";\n    src: url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff2\"),\n         url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/d?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff\");\n    font-display: swap; font-style: normal; font-weight: 200 900; font-stretch: normal;\n  }\n\n  #nlCupLive {\n    /* Values mirror the NL canon (system/nl-brand.css) — embeds can't load\n       the portal stylesheet, so the tokens are inlined verbatim. */\n    --primary:#9e0000; --primary-600:#7e0000; --primary-700:#600000;\n    --navy:#223b7c; --navy-600:#192e63; --navy-300:#9baac9;\n    --green:#1a7030; --amber:#c96f15;\n    --white:#ffffff; --off-white:#f4f6f9;\n    --text:#1a2a44; --text-muted:#5a6a82;\n    --border:#dde3ed;\n    --radius:6px;\n\n    font-family:'carbona-variable','carbona',sans-serif;\n    font-size:15px; line-height:1.4;\n    font-variation-settings:'wght' 400;\n    color:var(--text); -webkit-font-smoothing:antialiased;\n    max-width:1180px; margin:20px auto; padding:0 12px;\n\n    /* The rail reshapes on the width of THIS block, not the window — a\n       homepage module never owns the viewport. */\n    container-type:inline-size;\n  }\n  #nlCupLive[hidden] { display:none; }\n  #nlCupLive, #nlCupLive *, #nlCupLive *::before, #nlCupLive *::after { box-sizing:border-box; }\n\n  /* Band -------------------------------------------------------------- */\n  #nlCupLive .nlcl__band {\n    display:flex; align-items:stretch;\n    background:var(--navy);\n    border-radius:var(--radius);\n    box-shadow:0 2px 12px rgba(10,22,40,.10);\n    overflow:hidden;\n  }\n\n  /* Cap — the \"what this is\" end of the CTA. Fixed width so the rail below\n     starts on the same line whatever the round looks like. */\n  #nlCupLive .nlcl__cap {\n    flex:none; width:250px;\n    display:flex; align-items:center; gap:11px;\n    padding:14px 14px 14px 16px;\n    border-right:2px solid var(--primary);\n    color:var(--white);\n  }\n  #nlCupLive .nlcl__mark { flex:none; height:47px; width:auto; display:block; }\n  #nlCupLive .nlcl__capText { min-width:0; }\n  #nlCupLive .nlcl__title {\n    display:block;\n    font-size:16px; line-height:1.12; letter-spacing:.01em;\n    font-weight:900; font-variation-settings:'wght' 900;\n  }\n  #nlCupLive .nlcl__sub { display:flex; align-items:center; gap:8px; margin-top:6px; }\n  /* Red pill rather than a red dot: canon reserves --accent-live green for\n     pulse dots BECAUSE red on navy is too low-contrast (nl-brand.css §live).\n     Inverting it — white on brand red — keeps the signal red where the fan\n     reads it and keeps the contrast where canon wanted it. */\n  #nlCupLive .nlcl__badge {\n    flex:none;\n    display:inline-flex; align-items:center; gap:5px;\n    padding:2px 8px 3px; border-radius:999px;\n    background:var(--primary); color:var(--white);\n    font-size:10px; letter-spacing:.1em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlCupLive .nlcl__dot {\n    width:6px; height:6px; border-radius:50%; background:var(--white);\n    animation:nlcl-pulse 1.8s ease-in-out infinite;\n  }\n  @keyframes nlcl-pulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }\n  #nlCupLive .nlcl__date {\n    min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n    font-size:11px; letter-spacing:.05em; text-transform:uppercase;\n    font-weight:700; font-variation-settings:'wght' 700;\n    color:var(--navy-300);\n  }\n\n  /* Scroller ---------------------------------------------------------- */\n  #nlCupLive .nlcl__scroll { position:relative; flex:1; min-width:0; }\n  #nlCupLive .nlcl__track {\n    list-style:none; margin:0;\n    display:flex; gap:8px;\n    padding:10px 12px;\n    overflow-x:auto; overscroll-behavior-x:contain;\n    scroll-snap-type:x proximity;\n    /* Without this the snap point for the first tile aligns it with the raw\n       scrollport edge, which eats the 12px gutter and parks the rail at\n       scrollLeft:12 — so the gutter vanished AND \"am I at the start?\" was\n       never true, leaving a dead back arrow on screen. */\n    scroll-padding-inline:12px;\n    scrollbar-width:none; -ms-overflow-style:none;\n  }\n  #nlCupLive .nlcl__track::-webkit-scrollbar { display:none; }\n  #nlCupLive .nlcl__track > li { flex:none; scroll-snap-align:start; }\n\n  /* Arrows appear only once the rail actually overflows, and the fade under\n     each one is the honest signal that there is more — an arrow alone reads\n     as decoration. */\n  #nlCupLive .nlcl__nav {\n    position:absolute; top:50%; transform:translateY(-50%); z-index:2;\n    width:30px; height:30px; padding:0;\n    display:flex; align-items:center; justify-content:center;\n    border:0; border-radius:50%; cursor:pointer;\n    background:var(--white); color:var(--navy);\n    box-shadow:0 2px 8px rgba(10,22,40,.35);\n    font:inherit;\n  }\n  #nlCupLive .nlcl__nav[hidden] { display:none; }\n  #nlCupLive .nlcl__nav:disabled { opacity:0; pointer-events:none; }\n  #nlCupLive .nlcl__nav:focus-visible { outline:3px solid var(--white); outline-offset:2px; }\n  #nlCupLive .nlcl__nav.is-prev { left:6px; }\n  #nlCupLive .nlcl__nav.is-next { right:6px; }\n  #nlCupLive .nlcl__nav::before {\n    content:\"\"; width:8px; height:8px;\n    border-right:2.5px solid currentColor; border-bottom:2.5px solid currentColor;\n  }\n  #nlCupLive .nlcl__nav.is-prev::before { transform:rotate(135deg); margin-left:3px; }\n  #nlCupLive .nlcl__nav.is-next::before { transform:rotate(-45deg); margin-right:3px; }\n\n  #nlCupLive .nlcl__scroll::before,\n  #nlCupLive .nlcl__scroll::after {\n    content:\"\"; position:absolute; top:0; bottom:0; width:40px; z-index:1;\n    pointer-events:none; opacity:0; transition:opacity .18s ease;\n  }\n  #nlCupLive .nlcl__scroll::before {\n    left:0; background:linear-gradient(to right, var(--navy), rgba(34,59,124,0));\n  }\n  #nlCupLive .nlcl__scroll::after {\n    right:0; background:linear-gradient(to left, var(--navy), rgba(34,59,124,0));\n  }\n  #nlCupLive .nlcl__scroll.can-prev::before,\n  #nlCupLive .nlcl__scroll.can-next::after { opacity:1; }\n\n  /* Tile -------------------------------------------------------------- */\n  #nlCupLive .nlcl__tile {\n    --club:var(--navy); --club-ink:var(--white);\n    display:flex; flex-direction:column; gap:7px;\n    width:186px; height:100%;\n    padding:9px 10px 10px;\n    background:var(--white);\n    border-radius:5px;\n    border-left:3px solid var(--club);\n    text-decoration:none; color:var(--text);\n    transition:transform .16s ease, box-shadow .16s ease;\n  }\n  #nlCupLive a.nlcl__tile:hover,\n  #nlCupLive a.nlcl__tile:focus-visible {\n    transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,.30);\n  }\n  #nlCupLive a.nlcl__tile:focus-visible { outline:3px solid var(--white); outline-offset:2px; }\n  /* Played and postponed ties step back without going translucent — opacity on\n     a white tile lets the navy band through and the tile turns muddy blue. A\n     flat off-white surface reads as \"done\" and stays a solid object. */\n  #nlCupLive .nlcl__tile.is-done { background:var(--off-white); }\n  #nlCupLive .nlcl__tile.is-done .nlcl__name { color:var(--text-muted); }\n  #nlCupLive .nlcl__tile.is-done .nlcl__crest { opacity:.72; }\n\n  #nlCupLive .nlcl__side { display:flex; align-items:center; gap:8px; min-width:0; }\n  #nlCupLive .nlcl__crest { flex:none; width:22px; height:22px; object-fit:contain; display:block; }\n  #nlCupLive .nlcl__code {\n    flex:none; width:22px; text-align:center;\n    font-size:10px; font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--club);\n  }\n  /* Short names, one line, no clamp: a rail tile that grows a second line\n     grows every tile in the band. clubs-meta already publishes the short a\n     human would say out loud. */\n  #nlCupLive .nlcl__name {\n    min-width:0; flex:1;\n    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\n    font-size:14px;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  /* Caption line, shared by every tile. The pinned tile's \"Your club\" flag\n     lives up here rather than on a line of its own — a flex row stretches, so\n     one extra line on one tile was quietly making the whole band taller and\n     leaving a gap inside the other fifteen. */\n  #nlCupLive .nlcl__top {\n    display:flex; align-items:baseline; justify-content:space-between; gap:6px;\n    min-width:0;\n  }\n  #nlCupLive .nlcl__meta {\n    display:flex; align-items:center; justify-content:flex-end;\n    margin-top:auto; padding-top:2px;\n  }\n  #nlCupLive .nlcl__status {\n    display:inline-flex; align-items:center; gap:5px;\n    font-size:11px; letter-spacing:.06em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n    color:var(--text-muted);\n  }\n  #nlCupLive .nlcl__status.is-live { color:var(--primary); }\n  #nlCupLive .nlcl__status.is-live i {\n    width:6px; height:6px; border-radius:50%; background:currentColor;\n    animation:nlcl-pulse 1.8s ease-in-out infinite;\n  }\n  #nlCupLive .nlcl__status.is-ft  { color:var(--green); }\n  #nlCupLive .nlcl__status.is-off { color:var(--amber); }\n  #nlCupLive .nlcl__watch {\n    display:inline-flex; align-items:center; gap:4px;\n    font-size:11px; letter-spacing:.05em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n    color:var(--primary);\n  }\n  #nlCupLive .nlcl__arrow { flex:none; width:11px; height:11px; transition:transform .16s ease; }\n  #nlCupLive a.nlcl__tile:hover .nlcl__arrow,\n  #nlCupLive a.nlcl__tile:focus-visible .nlcl__arrow { transform:translate(2px, -2px); }\n\n  /* The fan's own club, pinned to the front in its own colours. */\n  #nlCupLive .nlcl__tile.is-mine {\n    background:var(--club); color:var(--club-ink);\n    border-left-color:var(--club-ink);\n  }\n  #nlCupLive .nlcl__tile.is-mine .nlcl__status,\n  #nlCupLive .nlcl__tile.is-mine .nlcl__watch,\n  #nlCupLive .nlcl__tile.is-mine .nlcl__code { color:inherit; }\n  #nlCupLive .nlcl__mine {\n    flex:none;\n    font-size:9px; letter-spacing:.12em; text-transform:uppercase;\n    font-weight:800; font-variation-settings:'wght' 800;\n    opacity:.82;\n  }\n\n  /* Solo — one tie is the whole night, so the band becomes the tie ----- */\n  #nlCupLive .nlcl__track.is-solo { padding:0; }\n  #nlCupLive .nlcl__track.is-solo > li { flex:1; min-width:0; }\n  #nlCupLive .nlcl__tile.is-solo {\n    flex-direction:row; align-items:center; gap:16px; flex-wrap:wrap;\n    width:auto; padding:14px 18px;\n    border-left:0; border-radius:0;\n    background:var(--club); color:var(--club-ink);\n  }\n  #nlCupLive a.nlcl__tile.is-solo:hover,\n  #nlCupLive a.nlcl__tile.is-solo:focus-visible { transform:none; box-shadow:none; filter:brightness(1.08); }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__crest { width:44px; height:44px; }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__code { width:44px; font-size:16px; }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__name { font-size:19px; flex:none; font-weight:900; font-variation-settings:'wght' 900; }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__v {\n    font-size:12px; letter-spacing:.1em; text-transform:uppercase; opacity:.7;\n    font-weight:700; font-variation-settings:'wght' 700;\n  }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__meta { margin-left:auto; padding-top:0; gap:14px; }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__status { font-size:13px; color:inherit; }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__watch {\n    padding:8px 14px; border-radius:999px; font-size:12px;\n    background:var(--club-ink); color:var(--club);\n  }\n  #nlCupLive .nlcl__tile.is-solo .nlcl__mine { width:100%; order:-1; margin-bottom:-6px; }\n\n  /* Stacked cap — below this the cap and the rail cannot share a line. */\n  @container (max-width: 640px) {\n    #nlCupLive .nlcl__band { display:block; }\n    #nlCupLive .nlcl__cap {\n      width:auto; border-right:0; border-bottom:2px solid var(--primary);\n      padding:11px 14px;\n    }\n    #nlCupLive .nlcl__mark { height:38px; }\n    #nlCupLive .nlcl__nav { display:none; }   /* thumbs, not arrows */\n    #nlCupLive .nlcl__tile.is-solo { gap:12px; }\n    #nlCupLive .nlcl__tile.is-solo .nlcl__name { font-size:17px; }\n    #nlCupLive .nlcl__tile.is-solo .nlcl__meta { margin-left:0; width:100%; }\n  }\n\n  @media (prefers-reduced-motion: reduce) {\n    #nlCupLive .nlcl__tile, #nlCupLive .nlcl__arrow,\n    #nlCupLive .nlcl__scroll::before, #nlCupLive .nlcl__scroll::after { transition:none; }\n    #nlCupLive a.nlcl__tile:hover, #nlCupLive a.nlcl__tile:focus-visible { transform:none; }\n    #nlCupLive a.nlcl__tile:hover .nlcl__arrow,\n    #nlCupLive a.nlcl__tile:focus-visible .nlcl__arrow { transform:none; }\n    #nlCupLive .nlcl__dot, #nlCupLive .nlcl__status.is-live i { animation:none; }\n  }\n";
  var HTML = "<div id=\"nlCupLive\" hidden>\n  <div class=\"nlcl__band\">\n    <div class=\"nlcl__cap\">\n      <img class=\"nlcl__mark\" width=\"34\" height=\"47\" alt=\"\" decoding=\"async\"\n           src=\"https://raw.githubusercontent.com/thenationalleague/tools/main/assets/divisions/NL%20Cup.png\">\n      <span class=\"nlcl__capText\">\n        <span class=\"nlcl__title\">National League Cup</span>\n        <span class=\"nlcl__sub\">\n          <span class=\"nlcl__badge\"><i class=\"nlcl__dot\" aria-hidden=\"true\"></i>Live</span>\n          <span class=\"nlcl__date\" id=\"nlcl-date\"></span>\n        </span>\n      </span>\n    </div>\n\n    <div class=\"nlcl__scroll\">\n      <button class=\"nlcl__nav is-prev\" type=\"button\" aria-label=\"Previous ties\" hidden></button>\n      <ul class=\"nlcl__track\" id=\"nlcl-track\"></ul>\n      <button class=\"nlcl__nav is-next\" type=\"button\" aria-label=\"More ties\" hidden></button>\n    </div>\n  </div>\n</div>";

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
      var CREST_SM   = REPO + 'assets/crests/thumbs/';     /* 96px  — rail tiles */
      var CREST_MD   = REPO + 'assets/crests/medium/';     /* 256px — solo band  */

      var API      = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2/matches/';
      var COMP_CUP = 1275;                 /* firm NLS code — never a name match */
      var TZ       = 'Europe/London';
      var POLL_MS  = 60000;

      var dateEl  = document.getElementById('nlcl-date');
      var track   = document.getElementById('nlcl-track');
      var scroll  = root.querySelector('.nlcl__scroll');
      var navPrev = root.querySelector('.nlcl__nav.is-prev');
      var navNext = root.querySelector('.nlcl__nav.is-next');

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
         both the tile's rule and the solo wash, so Gateshead falls to its second. */
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
      /* Abbreviated on purpose: the cap is a fixed 250px so the rail below it
         starts on the same line every night, and "Tuesday 11 August" spends that
         budget on letters rather than on the two facts in it. */
      function ukDate(d) { return fmt(d, { o: { weekday: 'short', day: 'numeric', month: 'short' } }); }
      function utcYmd(d) { return new Date(d.getTime()).toISOString().slice(0, 10); }

      /* NLS says "Birmingham City U21"; cup-clubs-meta says "Birmingham City PL2".
         Three of the sixteen academy sides disagree, so both sides get flattened
         to the parent club before any lookup. */
      var SUFFIX = /\s+(PL2|U2[13]|Under[ -]?2[13]|Academy|Development)$/i;
      function baseName(n) { return String(n || '').replace(SUFFIX, '').trim(); }
      function suffixOf(n) { var m = String(n || '').match(SUFFIX); return m ? m[1] : ''; }
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

      var byKey = {};   /* normalised name -> { crestName, short, colors } */

      function indexClubs(meta, isGuest) {
        (meta && meta.clubs || []).forEach(function (c) {
          if (!c || !c.name) return;
          var rec = {
            crestName: c.crestName || c.name,
            short: baseName(c.short || c.name),
            colors: c.colors || {}
          };
          byKey[normKey(c.name)] = rec;
          if (c.crestName) byKey[normKey(c.crestName)] = rec;
          if (isGuest && c.short) byKey[normKey(c.short)] = rec;
        });
      }

      function clubFor(name) {
        return byKey[normKey(name)] || { crestName: baseName(name), short: baseName(name), colors: {} };
      }

      /* The repo's short and the NLS suffix, recombined: "Birmingham PL2" from
         cup-clubs-meta + "U21" from the API = "Birmingham U21", so the tile agrees
         with whatever the broadcast is calling them. */
      function shortFor(name) {
        var s = suffixOf(name);
        return clubFor(name).short + (s ? ' ' + s : '');
      }

      function crestUrl(base, crestName) { return base + encodeURIComponent(crestName) + '.png'; }

      /* A guest may have no code we can print, so a missing crest steps
         96px -> 256px -> the club's initials. */
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
            span.className = 'nlcl__code';
            span.textContent = img.getAttribute('data-code') || '';
            if (img.parentNode) img.parentNode.replaceChild(span, img);
          });
        });
      }

      /* ---------- NL+ SSO (read-only, never blocking, never prompting) ------- */

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
         at script load misses it on a cold visit. Capped short: pinning the fan's
         club is a nicety and the rail must not wait on it. There is no sign-in
         path from here — signed out simply means an unpinned rail. */
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
        ft:        { cls: 'is-ft',   label: 'FT' },
        postponed: { cls: 'is-off',  label: 'P–P' },
        abandoned: { cls: 'is-off',  label: 'Abandoned' }
      };

      var ARROW = '<svg class="nlcl__arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" stroke="currentColor" stroke-width="2.2"' +
        ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

      function statusHTML(m) {
        var s = STATUS[m.state];
        if (!s) return '<span class="nlcl__status">' + escHtml(ukTime(m.ko)) + '</span>';
        return '<span class="nlcl__status ' + s.cls + '">' +
          (s.dot ? '<i aria-hidden="true"></i>' : '') + escHtml(s.label) + '</span>';
      }

      function crestHTML(name, tier) {
        var club = clubFor(name);
        return '<img class="nlcl__crest" src="' + escHtml(crestUrl(tier, club.crestName)) + '"' +
          ' data-fallback="' + escHtml(crestUrl(tier === CREST_SM ? CREST_MD : CREST_SM, club.crestName)) + '"' +
          ' data-code="' + escHtml(initialsOf(name)) + '"' +
          ' alt="" loading="lazy" decoding="async">';
      }

      /* A postponed tie keeps its tile and loses its link — a stream page for a
         game that is not being played is worse than no link at all. */
      function linkable(m) { return m.state !== 'postponed' && m.state !== 'abandoned'; }

      function open(m, links) {
        var url = linkable(m) ? (links[normKey(m.home)] || '') : '';
        return {
          url: url,
          tag: url ? 'a' : 'div',
          attrs: url ? ' href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer"' : ''
        };
      }

      function label(m, mine) {
        return (mine ? 'Your club: ' : '') + m.home + ' versus ' + m.away + ', ' + ukTime(m.ko);
      }

      function tileHTML(m, links, mine) {
        var o = open(m, links);
        var accent = accentFor(clubFor(mine ? m.mineName : m.home).colors || {});
        var done = (m.state === 'ft' || m.state === 'postponed' || m.state === 'abandoned');

        return '<li>' +
          '<' + o.tag + ' class="nlcl__tile' + (mine ? ' is-mine' : '') + (done ? ' is-done' : '') + '"' +
            o.attrs + ' style="--club:' + accent + ';--club-ink:' + pickTextColor(accent) + '"' +
            ' aria-label="' + escHtml(label(m, mine) + (o.url ? ' — watch' : '')) + '">' +
            '<span class="nlcl__top">' + statusHTML(m) +
              (mine ? '<span class="nlcl__mine">Your club</span>' : '') +
            '</span>' +
            '<span class="nlcl__side">' + crestHTML(m.home, CREST_SM) +
              '<span class="nlcl__name">' + escHtml(shortFor(m.home)) + '</span></span>' +
            '<span class="nlcl__side">' + crestHTML(m.away, CREST_SM) +
              '<span class="nlcl__name">' + escHtml(shortFor(m.away)) + '</span></span>' +
            (o.url ? '<span class="nlcl__meta"><span class="nlcl__watch">Watch' + ARROW +
              '</span></span>' : '') +
          '</' + o.tag + '>' +
        '</li>';
      }

      /* One tie is the whole night, so the band becomes the tie rather than
         parking a 186px tile in 900px of navy. */
      function soloHTML(m, links, mine) {
        var o = open(m, links);
        var accent = accentFor(clubFor(mine ? m.mineName : m.home).colors || {});

        return '<li>' +
          '<' + o.tag + ' class="nlcl__tile is-solo"' + o.attrs +
            ' style="--club:' + accent + ';--club-ink:' + pickTextColor(accent) + '"' +
            ' aria-label="' + escHtml(label(m, mine) + (o.url ? ' — watch' : '')) + '">' +
            (mine ? '<span class="nlcl__mine">Your club</span>' : '') +
            '<span class="nlcl__side">' + crestHTML(m.home, CREST_MD) +
              '<span class="nlcl__name">' + escHtml(shortFor(m.home)) + '</span></span>' +
            '<span class="nlcl__v">v</span>' +
            '<span class="nlcl__side">' + crestHTML(m.away, CREST_MD) +
              '<span class="nlcl__name">' + escHtml(shortFor(m.away)) + '</span></span>' +
            '<span class="nlcl__meta">' + statusHTML(m) +
              (o.url ? '<span class="nlcl__watch">Watch' + ARROW + '</span>' : '') +
            '</span>' +
          '</' + o.tag + '>' +
        '</li>';
      }

      function render(matches, links, fav) {
        if (!matches.length) { root.hidden = true; return; }

        var mine = null;
        if (fav) {
          var favKey = normKey(fav);
          for (var i = 0; i < matches.length; i++) {
            if (normKey(matches[i].home) === favKey || normKey(matches[i].away) === favKey) {
              mine = matches[i];
              mine.mineName = normKey(matches[i].home) === favKey ? matches[i].home : matches[i].away;
              break;
            }
          }
        }

        /* Kick-off order, except the fan's own tie, which comes to the front. That
           is the whole reason to know who they support. */
        var ordered = mine ? [mine].concat(matches.filter(function (m) { return m !== mine; })) : matches;
        var solo = ordered.length === 1;

        track.innerHTML = ordered.map(function (m) {
          return solo ? soloHTML(m, links, m === mine) : tileHTML(m, links, m === mine);
        }).join('');
        track.classList.toggle('is-solo', solo);
        wireCrests(track);

        dateEl.textContent = ukDate(matches[0].ko);
        root.hidden = false;
        syncNav();
      }

      /* ---------- rail mechanics ---------- */

      /* Arrows and fades are driven by measurement, not by tie count: a six-tie
         round fits on a desktop homepage and overflows in a sidebar, and the same
         band has to be honest in both. */
      function syncNav() {
        var slack = track.scrollWidth - track.clientWidth;
        var over = slack > 4 && !track.classList.contains('is-solo');
        navPrev.hidden = navNext.hidden = !over;
        if (!over) { scroll.classList.remove('can-prev', 'can-next'); return; }
        var x = track.scrollLeft;
        navPrev.disabled = x <= 2;
        navNext.disabled = x >= slack - 2;
        scroll.classList.toggle('can-prev', !navPrev.disabled);
        scroll.classList.toggle('can-next', !navNext.disabled);
      }

      function nudge(dir) {
        /* Just under a viewport, so a tile is always left on screen as an anchor
           rather than the rail jumping to somewhere unrecognisable. */
        track.scrollBy({ left: dir * Math.max(160, track.clientWidth - 90), behavior: 'smooth' });
      }
      navPrev.addEventListener('click', function () { nudge(-1); });
      navNext.addEventListener('click', function () { nudge(1); });
      track.addEventListener('scroll', syncNav, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(syncNav).observe(track);
      else window.addEventListener('resize', syncNav);

      /* ---------- boot ---------- */

      /* The band stays hidden until it knows it has ties. A skeleton that resolves
         to nothing is not silence. */

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
        var links = loadLinks(res[2]);
        var fav = res[3];
        var season = (res[0].seasons && res[0].seasons.current) || '';
        if (!season) throw new Error('no current season in clubs-meta');

        function cycle() {
          return fetchToday(season).then(function (matches) { render(matches, links, fav); });
        }

        return cycle().then(function () {
          /* One request a minute, and only while the tab is being looked at — a
             tile that says LIVE has to be able to stop saying it, and a page left
             open overnight has to go quiet at midnight on its own. */
          setInterval(function () {
            if (document.hidden) return;
            cycle().catch(function () { /* keep the last good band on screen */ });
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
