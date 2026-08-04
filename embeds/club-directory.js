/* Club Directory — GENERATED FILE, DO NOT EDIT.
 *
 * Built from embeds/club-directory.html by scripts/build-embeds.js.
 * Edit the HTML file and let CI regenerate this.
 *
 * Embed on the public site with:
 *   <div data-nl-clubs></div>
 *   <script src="https://nl.tools/embeds/club-directory.js" defer></script>
 *
 * If the CMS strips <script src>, use an inline loader instead:
 *   <div data-nl-clubs></div>
 *   <script>
 *     (function(){var s=document.createElement('script');
 *      s.src='https://nl.tools/embeds/club-directory.js';document.body.appendChild(s);})();
 *   </script>
 */
(function () {
  'use strict';

  // Guard against the snippet appearing twice on one page — the widget owns
  // fixed element IDs, so a second copy would fight the first.
  if (window.__nlClubDirectoryMounted) {
    if (window.console && console.warn) {
      console.warn('[Club Directory] already mounted on this page — ignoring duplicate embed.');
    }
    return;
  }
  window.__nlClubDirectoryMounted = true;

  var VERSION = "v1.0";
  var CSS = "\n  /* Carbona Variable */\n  @font-face {\n    font-family: \"carbona-variable\";\n    src: url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff2\"),\n         url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/d?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff\");\n    font-display: swap; font-style: normal; font-weight: 200 900; font-stretch: normal;\n  }\n\n  #nlClubs {\n    /* Values mirror the NL canon (system/nl-brand.css) — embeds can't load\n       the portal stylesheet, so the tokens are inlined verbatim. */\n    --primary:#9e0000; --primary-600:#7e0000;\n    --navy:#223b7c;\n    --white:#ffffff; --off-white:#f4f6f9;\n    --text:#1a2a44; --text-muted:#5a6a82;\n    --border:#dde3ed;\n    --radius:6px;\n\n    font-family:'carbona-variable','carbona',sans-serif;\n    font-size:15px; line-height:1.45;\n    font-variation-settings:'wght' 400;\n    color:var(--text); -webkit-font-smoothing:antialiased;\n    max-width:1180px; margin:24px auto; padding:0 12px;\n\n    /* The grid steps on the width of THIS block, not the window — the same\n       embed has to work full-bleed and inside a narrow article column. */\n    container-type:inline-size;\n  }\n  #nlClubs, #nlClubs *, #nlClubs *::before, #nlClubs *::after { box-sizing:border-box; }\n\n  /* Meta strip ------------------------------------------------------- */\n  #nlClubs .nlcd__head {\n    display:flex; align-items:baseline; justify-content:space-between; gap:16px;\n    padding-bottom:10px; margin-bottom:16px;\n    border-bottom:1px solid var(--border);\n  }\n  #nlClubs .nlcd__count {\n    font-size:12px; letter-spacing:.08em; text-transform:uppercase;\n    font-weight:700; font-variation-settings:'wght' 700;\n    color:var(--text-muted);\n  }\n  #nlClubs .nlcd__count b {\n    color:var(--primary);\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlClubs .nlcd__hint {\n    font-size:12px; color:var(--text-muted);\n    font-weight:500; font-variation-settings:'wght' 500;\n  }\n\n  /* Grid ------------------------------------------------------------- */\n  /* Two columns is the floor and the no-container-query fallback; 24 clubs\n     divide evenly by 2, 3 and 4, so no row is ever left with one orphan. */\n  #nlClubs .nlcd__grid {\n    list-style:none; margin:0; padding:0;\n    display:grid; gap:14px;\n    grid-template-columns:repeat(2, minmax(0, 1fr));\n  }\n  @container (min-width: 560px) {\n    #nlClubs .nlcd__grid { grid-template-columns:repeat(3, minmax(0, 1fr)); }\n  }\n  @container (min-width: 860px) {\n    #nlClubs .nlcd__grid { gap:18px; grid-template-columns:repeat(4, minmax(0, 1fr)); }\n  }\n\n  /* Card ------------------------------------------------------------- */\n  #nlClubs .nlcd__card {\n    --club:var(--navy); --club-ink:var(--white);\n    display:flex; flex-direction:column;\n    height:100%;\n    background:var(--white);\n    border:1px solid var(--border); border-radius:var(--radius);\n    overflow:hidden; text-decoration:none; color:inherit;\n    transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;\n  }\n  #nlClubs .nlcd__card:hover,\n  #nlClubs .nlcd__card:focus-visible {\n    transform:translateY(-3px);\n    border-color:var(--club);\n    box-shadow:0 8px 22px rgba(10,22,40,.14);\n  }\n  #nlClubs .nlcd__card:focus-visible {\n    outline:3px solid var(--primary); outline-offset:2px;\n  }\n\n  /* Crest well — a whisper of the club's colour behind the badge so a card\n     reads as that club before the name is even legible. */\n  #nlClubs .nlcd__crest {\n    position:relative;\n    display:flex; align-items:center; justify-content:center;\n    aspect-ratio:1 / 1; padding:16%;\n    background:radial-gradient(circle at 50% 46%,\n      color-mix(in srgb, var(--club) 10%, var(--white)) 0%,\n      var(--white) 74%);\n  }\n  #nlClubs .nlcd__crest img {\n    max-width:100%; max-height:100%;\n    width:auto; height:auto;\n    object-fit:contain; display:block;\n    transition:transform .16s ease;\n  }\n  #nlClubs .nlcd__card:hover .nlcd__crest img,\n  #nlClubs .nlcd__card:focus-visible .nlcd__crest img { transform:scale(1.05); }\n\n  /* Fallback when a crest PNG is missing — the club's three-letter code in\n     its own colour, rather than a broken-image glyph. */\n  #nlClubs .nlcd__code {\n    font-size:26px; letter-spacing:.04em;\n    font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--club);\n  }\n\n  /* Label ------------------------------------------------------------ */\n  #nlClubs .nlcd__foot {\n    margin-top:auto;\n    display:flex; align-items:center; gap:8px;\n    padding:10px 12px 11px;\n    border-top:3px solid var(--club);\n    background:var(--white);\n    transition:background-color .16s ease, color .16s ease;\n  }\n  #nlClubs .nlcd__card:hover .nlcd__foot,\n  #nlClubs .nlcd__card:focus-visible .nlcd__foot {\n    background:var(--club); color:var(--club-ink);\n  }\n  #nlClubs .nlcd__names { min-width:0; flex:1; }\n  #nlClubs .nlcd__name {\n    display:block;\n    font-size:14px; line-height:1.25;\n    font-weight:800; font-variation-settings:'wght' 800;\n    overflow-wrap:break-word;\n  }\n  #nlClubs .nlcd__nick {\n    display:block; margin-top:2px;\n    font-size:11px; letter-spacing:.05em; text-transform:uppercase;\n    font-weight:700; font-variation-settings:'wght' 700;\n    color:var(--text-muted);\n    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\n    transition:color .16s ease;\n  }\n  #nlClubs .nlcd__card:hover .nlcd__nick,\n  #nlClubs .nlcd__card:focus-visible .nlcd__nick { color:inherit; }\n\n  #nlClubs .nlcd__arrow {\n    flex:none; width:15px; height:15px;\n    opacity:.4; transition:opacity .16s ease, transform .16s ease;\n  }\n  #nlClubs .nlcd__card:hover .nlcd__arrow,\n  #nlClubs .nlcd__card:focus-visible .nlcd__arrow {\n    opacity:1; transform:translate(2px, -2px);\n  }\n\n  @media (prefers-reduced-motion: reduce) {\n    #nlClubs .nlcd__card,\n    #nlClubs .nlcd__crest img,\n    #nlClubs .nlcd__foot,\n    #nlClubs .nlcd__arrow { transition:none; }\n    #nlClubs .nlcd__card:hover,\n    #nlClubs .nlcd__card:focus-visible { transform:none; }\n    #nlClubs .nlcd__card:hover .nlcd__crest img,\n    #nlClubs .nlcd__card:focus-visible .nlcd__crest img { transform:none; }\n    #nlClubs .nlcd__card:hover .nlcd__arrow,\n    #nlClubs .nlcd__card:focus-visible .nlcd__arrow { transform:none; }\n  }\n\n  #nlClubs .nlcd__empty {\n    grid-column:1 / -1;\n    padding:32px 16px; text-align:center;\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    color:var(--text-muted); font-size:14px;\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n\n  @container (max-width: 460px) {\n    #nlClubs .nlcd__hint { display:none; }\n    #nlClubs .nlcd__crest { padding:13%; }\n    #nlClubs .nlcd__name { font-size:13px; }\n  }\n";
  var HTML = "<div id=\"nlClubs\" data-division=\"National\">\n  <div class=\"nlcd__head\">\n    <span class=\"nlcd__count\" id=\"nlcd-count\"></span>\n    <span class=\"nlcd__hint\">Every card links to the club's own website</span>\n  </div>\n  <ul class=\"nlcd__grid\" id=\"nlcd-grid\"></ul>\n</div>";

  function mount() {
    // Mount into the host page's marker div. Falling back to appending our
    // own container means a missing marker degrades to "renders at the
    // bottom" rather than "renders nowhere".
    var host = document.querySelector('[data-nl-clubs]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-nl-clubs', '');
      document.body.appendChild(host);
      if (window.console && console.warn) {
        console.warn('[Club Directory] no [data-nl-clubs] element found — appended to <body>.');
      }
    }

    var style = document.createElement('style');
    style.setAttribute('data-nl-embed', "embeds/club-directory.js");
    style.textContent = CSS;
    document.head.appendChild(style);

    // Markup must be in the DOM before the widget runs — its IIFE resolves
    // every element by ID at the top and does not wait for DOMContentLoaded.
    host.innerHTML = HTML;

    if (window.console && console.info) {
      console.info('[Club Directory] ' + VERSION + ' mounted.');
    }


    (function () {
      'use strict';

      var root = document.getElementById('nlClubs');
      if (!root) return;

      var REPO      = 'https://raw.githubusercontent.com/thenationalleague/tools/main/';
      var META_URL  = REPO + 'assets/data/clubs-meta.json';
      var CREST_URL = REPO + 'assets/crests/medium/';   // 256px tier — full-res is 10x the bytes
      var CREST_FULL = REPO + 'assets/crests/';

      // Seed — the current season's line-up, so the grid paints on first frame
      // and survives a failed fetch. Regenerated from clubs-meta.json; the live
      // file overwrites it the moment it lands.
      // [ name, code, nickname, domain, primary, secondary, tertiary ]
      var SEED_SEASON = '2026';
      var SEED_LABEL  = '2026-27';
      var SEED = {
        National: [
          ["AFC Fylde","FYL","The Coasters","afcfylde.co.uk","#FFFFFF","#003C7F","#000000"],
          ["Aldershot Town","ALD","The Shots","theshots.co.uk","#E43C2F","#00038D","#FFFFFF"],
          ["Altrincham","ALT","The Robins","altrinchamfc.com","#C62228","#FFFFFF","#FFFFFF"],
          ["Barrow","BRW","The Bluebirds","barrowafc.com","#FFFFFF","#1C3A7E","#000000"],
          ["Boreham Wood","BHW","The Wood","borehamwoodfootballclub.co.uk","#FFFFFF","#000000","#000000"],
          ["Boston United","BOS","The Pilgrims","bostonunited.co.uk","#F5C400","#000000","#000000"],
          ["Carlisle United","CAR","The Cumbrians","carlisleunited.co.uk","#276FB7","#ED142A","#FFFFFF"],
          ["Eastleigh","EAS","The Spitfires","eastleighfc.com","#132A9C","#FFFFFF","#FFFFFF"],
          ["FC Halifax Town","HAL","The Shaymen","fchalifaxtown.com","#1C5D9B","#FFFFFF","#FFFFFF"],
          ["Forest Green Rovers","FGR","Rovers","fgr.co.uk","#A8D40E","#000000","#000000"],
          ["Gateshead","GAT","The Heed","gateshead-fc.com","#FFFFFF","#000000","#000000"],
          ["Harrogate Town","HGT","The Sulphurites","harrogatetownafc.com","#FFF700","#000000","#000000"],
          ["Hartlepool United","HAR","Pools","hartlepoolunited.co.uk","#0056A0","#FFFFFF","#FFFFFF"],
          ["Hornchurch","HOR","The Urchins","hornchurchfc.com","#EE2826","#FFFFFF","#FFFFFF"],
          ["Kidderminster Harriers","KID","The Harriers","harriers.co.uk","#EE4427","#FFFFFF","#000000"],
          ["Scunthorpe United","SCU","The Iron","scunthorpe-united.co.uk","#759BB3","#8B2942","#000000"],
          ["Solihull Moors","SOL","The Moors","solihullmoorsfc.co.uk","#F0E000","#1A2A4A","#000000"],
          ["Southend United","SOU","The Shrimpers","southendunited.co.uk","#0F3E7A","#FFFFFF","#FFFFFF"],
          ["Sutton United","SUT","The U's","suttonunited.net","#F2BD2F","#000000","#000000"],
          ["Tamworth","TAM","The Lambs","tamworthfc.co.uk","#D92C3A","#000000","#FFFFFF"],
          ["Wealdstone","WEA","The Stones","wealdstone-fc.com","#2469A8","#FFFFFF","#FFFFFF"],
          ["Woking","WOK","The Cards","wokingfc.co.uk","#B50F1C","#FFFFFF","#FFFFFF"],
          ["Worthing","WOR","The Rebels","worthingfc.com","#F63131","#FFFFFF","#000000"],
          ["Yeovil Town","YEO","The Glovers","ytfc.net","#3E8C3D","#FFFFFF","#FFFFFF"]
        ]
      };

      // The marker div on the host page wins, so one hosted bundle serves all
      // three divisions without the CMS block carrying any markup of its own.
      var host = root.parentNode && root.parentNode.closest
        ? root.parentNode.closest('[data-nl-clubs]') : null;
      var division = (host && host.getAttribute('data-nl-clubs'))
        || root.getAttribute('data-division') || 'National';
      division = String(division).trim() || 'National';

      var grid  = document.getElementById('nlcd-grid');
      var count = document.getElementById('nlcd-count');

      /* ---------- helpers ---------- */

      function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      function isHex(h) { return /^#[0-9a-fA-F]{6}$/.test(String(h || '')); }

      // Gamma-encoded luminance, same measure and threshold the score predictor
      // uses on its hero panels — keep the family consistent.
      function lum(hex) {
        var c = String(hex).replace('#', '');
        var r = parseInt(c.slice(0, 2), 16),
            g = parseInt(c.slice(2, 4), 16),
            b = parseInt(c.slice(4, 6), 16);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }
      function pickTextColor(hex) {
        return isHex(hex) && lum(hex) > 0.68 ? '#1a2a44' : '#ffffff';
      }

      // First colour that isn't effectively white. White-on-white would erase the
      // rule and the hover fill, so a white-primary club (Fylde, Barrow, Gateshead)
      // falls through to its second colour. Navy only if a club has nothing usable.
      function accentFor(colors) {
        var order = [colors.primary, colors.secondary, colors.tertiary];
        for (var i = 0; i < order.length; i++) {
          if (isHex(order[i]) && lum(order[i]) <= 0.93) return order[i];
        }
        return '#223b7c';
      }

      function siteUrl(domain) {
        var d = String(domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        return d ? 'https://' + d : '';
      }

      function crestUrl(base, name) { return base + encodeURIComponent(name) + '.png'; }

      /* ---------- render ---------- */

      function cardHTML(c) {
        var accent = accentFor(c.colors || {});
        var url    = siteUrl(c.domain);
        var label  = c.name + (url ? ' — visit ' + url.replace(/^https:\/\//, '') : '');
        var tag    = url ? 'a' : 'span';
        var attrs  = url
          ? ' href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer"'
          : '';

        return '<li>' +
          '<' + tag + ' class="nlcd__card"' + attrs +
            ' style="--club:' + accent + ';--club-ink:' + pickTextColor(accent) + '"' +
            ' aria-label="' + escHtml(label) + '">' +
            '<span class="nlcd__crest">' +
              '<img src="' + escHtml(crestUrl(CREST_URL, c.name)) + '"' +
                  ' alt="' + escHtml(c.name) + ' crest" loading="lazy" decoding="async"' +
                  ' data-full="' + escHtml(crestUrl(CREST_FULL, c.name)) + '"' +
                  ' data-code="' + escHtml(c.code || '') + '">' +
            '</span>' +
            '<span class="nlcd__foot">' +
              '<span class="nlcd__names">' +
                '<span class="nlcd__name">' + escHtml(c.name) + '</span>' +
                (c.nickname ? '<span class="nlcd__nick">' + escHtml(c.nickname) + '</span>' : '') +
              '</span>' +
              (url ? '<svg class="nlcd__arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
                       '<path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" stroke="currentColor"' +
                       ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                     '</svg>' : '') +
            '</span>' +
          '</' + tag + '>' +
        '</li>';
      }

      // Two-step crest fallback: 256px tier, then the full-res original, then the
      // club's code. Each step clears its own handler so a missing file can't
      // spin the browser through a retry loop.
      function wireCrests() {
        Array.prototype.forEach.call(grid.querySelectorAll('.nlcd__crest img'), function (img) {
          img.addEventListener('error', function () {
            var full = img.getAttribute('data-full');
            if (full && img.src !== full) { img.src = full; return; }
            var code = img.getAttribute('data-code') || '';
            var span = document.createElement('span');
            span.className = 'nlcd__code';
            span.textContent = code;
            if (img.parentNode) img.parentNode.replaceChild(span, img);
          });
        });
      }

      function render(clubs, seasonLabel) {
        if (!clubs.length) return;
        clubs = clubs.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
        grid.innerHTML = clubs.map(cardHTML).join('');
        wireCrests();
        count.innerHTML = '<b>' + clubs.length + '</b> clubs &middot; ' +
          escHtml(seasonLabel) + ' season';
      }

      // Only the National division is seeded. A North/South embed waits for
      // clubs-meta rather than flashing 24 National clubs first — a wrong list
      // that then swaps is worse than a moment of nothing.
      function fromSeed() {
        return (SEED[division] || []).map(function (r) {
          return {
            name: r[0], code: r[1], nickname: r[2], domain: r[3],
            colors: { primary: r[4], secondary: r[5], tertiary: r[6] }
          };
        });
      }

      /* ---------- boot ---------- */

      render(fromSeed(), SEED_LABEL);

      // Upgrade from the canonical file. Promotion and relegation land here on
      // their own — the CMS block is never re-pasted for a season rollover.
      fetch(META_URL, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('clubs-meta ' + r.status);
          return r.json();
        })
        .then(function (meta) {
          var seasons = (meta.seasons || {});
          var season  = seasons.current || SEED_SEASON;
          var label   = (seasons.list && seasons.list[season] && seasons.list[season].label) || SEED_LABEL;
          var live = (meta.clubs || []).filter(function (c) {
            return c && c.seasons && c.seasons[season] === division;
          });
          if (live.length) render(live, label);
        })
        .catch(function (e) {
          if (window.console && console.warn) {
            console.warn('[NL Club Directory] clubs-meta unavailable.', e);
          }
          // Seeded divisions still have their grid; an unseeded one has nothing,
          // and an empty box with no explanation reads as a broken page.
          if (!grid.children.length) {
            grid.innerHTML = '<li class="nlcd__empty">Club list unavailable right now. ' +
              'Please try again shortly.</li>';
          }
        });
    })();

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
