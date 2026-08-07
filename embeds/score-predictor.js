/* Score Predictor — GENERATED FILE, DO NOT EDIT.
 *
 * Built from embeds/score-predictor.html by scripts/build-embeds.js.
 * Edit the HTML file and let CI regenerate this.
 *
 * Embed on the public site with:
 *   <div data-nl-score-predictor></div>
 *   <script src="https://nl.tools/embeds/score-predictor.js" defer></script>
 *
 * If the CMS strips <script src>, use an inline loader instead:
 *   <div data-nl-score-predictor></div>
 *   <script>
 *     (function(){var s=document.createElement('script');
 *      s.src='https://nl.tools/embeds/score-predictor.js';document.body.appendChild(s);})();
 *   </script>
 */
(function () {
  'use strict';

  // Guard against the snippet appearing twice on one page — the widget owns
  // fixed element IDs, so a second copy would fight the first.
  if (window.__nlScorePredictorMounted) {
    if (window.console && console.warn) {
      console.warn('[Score Predictor] already mounted on this page — ignoring duplicate embed.');
    }
    return;
  }
  window.__nlScorePredictorMounted = true;

  var VERSION = "v3.17";
  var CSS = "\n  /* Carbona Variable */\n  @font-face {\n    font-family: \"carbona-variable\";\n    src: url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff2\"),\n         url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/d?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff\");\n    font-display: swap; font-style: normal; font-weight: 200 900; font-stretch: normal;\n  }\n\n  #nlPredictor {\n    /* Values mirror the NL canon (system/nl-brand.css) — embeds can't load\n       the portal stylesheet, so the tokens are inlined verbatim. Ladder\n       stops are the canonical \"lighter/darker\"; no gold, no rgba overlays. */\n    --primary:#9e0000; --primary-50:#fcf4f2; --primary-300:#dfa197;\n    --primary-600:#7e0000; --primary-700:#600000;\n    --navy:#223b7c; --navy-600:#192e63;\n    --red:#d4380d; --red-light:#fff1ec;\n    --green:#1a7030; --green-light:#edf7ee;\n    --amber:#c96f15; --amber-light:#fef6ec;\n    --accent-live:#4ade80;\n    --white:#ffffff; --off-white:#f4f6f9;\n    --text:#1a2a44; --text-muted:#5a6a82;\n    --border:#dde3ed;\n    --radius:6px;\n    --shadow:0 2px 12px rgba(10,22,40,.10);\n    --focus-ring:0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);\n\n    font-family:'carbona-variable','carbona',sans-serif;\n    font-size:15px; line-height:1.45;\n    font-variation-settings:'wght' 400;\n    color:var(--text); -webkit-font-smoothing:antialiased;\n    max-width:680px; margin:24px auto; padding:0 12px;\n  }\n  #nlPredictor, #nlPredictor *, #nlPredictor *::before, #nlPredictor *::after { box-sizing:border-box; }\n\n  /* Banner */\n  #nlPredictor .nlsp__banner {\n    background:var(--amber-light); border:1px solid var(--amber); color:var(--amber);\n    padding:8px 12px; border-radius:var(--radius); font-size:13px; margin-bottom:14px;\n    font-variation-settings:'wght' 600;\n  }\n  #nlPredictor .nlsp__banner.is-err { background:var(--red-light);   border-color:var(--red);   color:var(--red); }\n  #nlPredictor .nlsp__banner.is-ok  { background:var(--green-light); border-color:var(--green); color:var(--green); }\n\n  /* Gate card — covers loading + signed-out, replaces the previous overlay/blur approach */\n  /* The gate's layout depends on how wide the CMS column is, which the\n     viewport does not tell us — a 560px column on a 1440px monitor is common.\n     inline-size containment lets the @container rule below ask the column\n     itself. #nlPredictor's width already comes from its parent, never from\n     its contents, so containing it changes no layout on its own. */\n  #nlPredictor { container-type:inline-size; container-name:nlsp; }\n\n  #nlPredictor .nlsp__gate {\n    padding:48px 16px;\n    /* Card left, table right — the invitation next to the argument for it.\n       v3.15 stacked them to stop names wrapping; the width was never the real\n       problem, the teaser was carrying a Games column it did not need.\n\n       The bases are percentages, not pixels, because the deciding width is\n       the CMS column and this repo does not get to know it. Pixel bases sized\n       against #nlPredictor's own 680px cap held abreast at exactly 680 and\n       silently stacked in any narrower column — which is most of them. These\n       two sum to 94%, so they share a row at any width the gap still fits in,\n       and the media query below stacks them on a phone, where side by side\n       stops being readable regardless of what arithmetic allows. */\n    display:flex; flex-wrap:wrap; justify-content:center; align-items:flex-start; gap:16px;\n  }\n  #nlPredictor .nlsp__gate-card {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    box-shadow:var(--shadow);\n    padding:28px 28px 24px;\n    flex:1 1 36%; max-width:380px; width:100%;\n    text-align:center;\n  }\n  #nlPredictor .nlsp__gate-card img.nlsp__gate-mark {\n    height:56px; width:auto; display:block; margin:0 auto 18px;\n    max-width:200px; object-fit:contain;\n  }\n  #nlPredictor .nlsp__gate-card h2 {\n    margin:0 0 6px;\n    font-size:20px; font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text);\n  }\n  #nlPredictor .nlsp__gate-card p {\n    margin:0 0 18px;\n    color:var(--text-muted); font-size:14px;\n    font-weight:500; font-variation-settings:'wght' 500;\n  }\n  #nlPredictor .nlsp__gate-card .nlsp__btn {\n    /* The button is an <a>, and .nlsp__btn sets no display — so it was inline,\n       width:100% did nothing, and a wrapped label spilled straight out of the\n       red pill because an inline box does not grow for its line boxes. It only\n       ever looked right because the label never wrapped. Block, with the\n       padding in the border box, so the pill grows to whatever it contains. */\n    display:block; box-sizing:border-box; width:100%;\n    padding:12px 16px; text-align:center;\n    white-space:normal; overflow-wrap:anywhere;\n  }\n  #nlPredictor .nlsp__gate-spinner {\n    width:22px; height:22px; margin:0 auto 12px;\n    border:2px solid var(--border); border-top-color:var(--primary);\n    border-radius:50%;\n    animation:nlsp-spin .8s linear infinite;\n  }\n  @keyframes nlsp-spin { to { transform:rotate(360deg); } }\n\n  /* Header — division wide lockup (left), title (centred), club crest (right).\n     NL canon: navy surface, white text, brand-red hairline. The wide lockup\n     carries its own white rounded card, so it sits straight on the navy. */\n  #nlPredictor .nlsp__sponsor {\n    display:grid; grid-template-columns:1fr auto 1fr; align-items:center;\n    background:var(--navy); color:var(--white);\n    padding:12px 16px; border-radius:var(--radius) var(--radius) 0 0;\n    border-bottom:2px solid var(--primary);\n    gap:12px; min-height:54px;\n  }\n  #nlPredictor .nlsp__sponsor-left  { display:flex; align-items:center; gap:10px; justify-self:start; }\n  #nlPredictor .nlsp__sponsor-right { display:flex; align-items:center; gap:8px;  justify-self:end; }\n  #nlPredictor .nlsp__sponsor img.nlsp__sponsor-wide {\n    height:34px; width:auto; display:block; object-fit:contain;\n  }\n  #nlPredictor .nlsp__sponsor img.nlsp__sponsor-team {\n    height:30px; width:30px; display:block; object-fit:contain;\n    background:var(--white); border-radius:4px; padding:1px;\n  }\n  #nlPredictor .nlsp__sponsor .nlsp__sponsor-title {\n    font-size:15px; color:var(--white);\n    text-transform:uppercase; letter-spacing:1.5px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    line-height:1;\n    text-align:center;\n    justify-self:center;\n  }\n  @media (max-width:520px) {\n    #nlPredictor .nlsp__sponsor {\n      padding:10px 12px; min-height:48px;\n      grid-template-columns:1fr auto 1fr;\n      gap:8px;\n    }\n    #nlPredictor .nlsp__sponsor img.nlsp__sponsor-wide { height:26px; }\n    #nlPredictor .nlsp__sponsor img.nlsp__sponsor-team { height:24px; width:24px; }\n    #nlPredictor .nlsp__sponsor .nlsp__sponsor-title { font-size:11px; letter-spacing:1px; }\n  }\n\n  /* Date selector — horizontally scrollable strip of matchday pills.\n     Click-drag enabled on desktop via JS (enableDragScroll). */\n  #nlPredictor .nlsp__datebar {\n    display:flex; gap:6px;\n    padding:14px 2px 8px;\n    overflow-x:auto; overflow-y:hidden;\n    -webkit-overflow-scrolling:touch;\n    scrollbar-width:none;\n    cursor:grab;\n    user-select:none;\n  }\n  #nlPredictor .nlsp__datebar.is-dragging { cursor:grabbing; }\n  #nlPredictor .nlsp__datebar.is-dragging button { pointer-events:none; }\n  #nlPredictor .nlsp__datebar::-webkit-scrollbar { display:none; }\n  #nlPredictor .nlsp__datebar button {\n    flex:none;\n    font-family:inherit; font-size:11px;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:7px 12px; border-radius:999px; cursor:pointer;\n    background:var(--white); color:var(--text-muted);\n    border:1px solid var(--border);\n    font-weight:800; font-variation-settings:'wght' 800;\n    white-space:nowrap;\n    transition:all .15s ease;\n  }\n  #nlPredictor .nlsp__datebar button:hover {\n    color:var(--primary); border-color:var(--primary);\n  }\n  /* Canon single-choice active state (.chip.active in nl-brand.css): navy */\n  #nlPredictor .nlsp__datebar button.is-active {\n    background:var(--navy); color:var(--white); border-color:var(--navy);\n  }\n  #nlPredictor .nlsp__datebar button.is-today {\n    border-color:var(--primary);\n  }\n\n  /* Hero — compressed: greeting ribbon + date */\n  #nlPredictor .nlsp__hero { padding:10px 0 8px; }\n  #nlPredictor .nlsp__hero .nlsp__greetline {\n    font-size:11px; text-transform:uppercase; letter-spacing:1.5px;\n    color:var(--text-muted);\n    font-weight:800; font-variation-settings:'wght' 800;\n    margin-bottom:6px;\n  }\n  #nlPredictor .nlsp__hero h1 {\n    font-size:24px; line-height:1.15; margin:0;\n    font-weight:900; font-variation-settings:'wght' 900;\n  }\n\n  /* Status bar — single thin line above fixtures */\n  #nlPredictor .nlsp__status {\n    display:flex; justify-content:space-between; align-items:baseline;\n    padding:6px 2px; margin-bottom:8px;\n    font-size:12px; color:var(--text-muted);\n    font-weight:700; font-variation-settings:'wght' 700;\n    text-transform:uppercase; letter-spacing:1px;\n    border-bottom:1px solid var(--border);\n  }\n  #nlPredictor .nlsp__status .nlsp__count b { color:var(--text); font-weight:900; font-variation-settings:'wght' 900; }\n  #nlPredictor .nlsp__status .nlsp__savetick {\n    color:var(--green); opacity:0; transition:opacity .25s ease;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlPredictor .nlsp__status .nlsp__savetick.is-on { opacity:1; }\n\n  /* Empty state (no matches on selected date / pre-season / post-season) */\n  #nlPredictor .nlsp__empty {\n    padding:32px 24px;\n    text-align:center;\n    background:var(--white);\n    border:1px solid var(--border);\n    border-radius:var(--radius);\n    box-shadow:var(--shadow);\n    margin:8px 0 12px;\n  }\n  #nlPredictor .nlsp__empty-title {\n    font-size:16px; color:var(--text);\n    font-weight:900; font-variation-settings:'wght' 900;\n    margin-bottom:6px;\n  }\n  #nlPredictor .nlsp__empty-body {\n    font-size:13px; color:var(--text-muted);\n    font-weight:500; font-variation-settings:'wght' 500;\n  }\n\n  /* Fixture rows — stacked layout: meta strip, then home team line, away team line */\n  #nlPredictor .nlsp__row {\n    position:relative;\n    padding:8px 10px;\n    border-bottom:1px solid var(--border);\n    background:var(--white);\n    border-left:3px solid transparent;\n    display:grid; row-gap:2px;\n  }\n  #nlPredictor .nlsp__row:first-child { border-top:1px solid var(--border); }\n\n  /* Hero card — the fan's own club's fixture as a proper showcase. Canon\n     navy top strip (Your club · KO · lock countdown), then the matchup split\n     into TWO club-colour panels — home club's primary left, away club's\n     right (from clubs-meta.json, navy fallback) — so the opponent's colours\n     always share the card. Oversized boxed crests; scores sit in white\n     drop-shadowed windows; text flips dark/light off each panel's luminance.\n     Deliberately NOT a .nlsp__row, so verdict tints never fight the club\n     colours. Soft emphasis only: every other fixture stays available below. */\n  #nlPredictor .nlsp__hero-card {\n    position:relative;\n    background:var(--white);\n    border:1px solid var(--border); border-radius:var(--radius);\n    box-shadow:var(--shadow);\n    overflow:hidden;\n    margin-bottom:14px;\n  }\n  #nlPredictor .nlsp__hero-card.is-void { opacity:.8; }\n  #nlPredictor .nlsp__hero-top {\n    display:flex; align-items:center; gap:10px;\n    background:var(--navy); color:var(--white);\n    padding:10px 14px;\n  }\n  #nlPredictor .nlsp__hero-top .nlsp__meta {\n    flex:1; padding-right:0; color:inherit; opacity:.92; min-height:0;\n  }\n  #nlPredictor .nlsp__hero-card .nlsp__meta .nlsp__pickline,\n  #nlPredictor .nlsp__hero-card .nlsp__meta .nlsp__pickline b,\n  #nlPredictor .nlsp__hero-card .nlsp__meta .nlsp__lock,\n  #nlPredictor .nlsp__hero-card .nlsp__meta .nlsp__ftlabel,\n  #nlPredictor .nlsp__hero-card .nlsp__meta .nlsp__livelbl,\n  #nlPredictor .nlsp__hero-card .nlsp__meta .nlsp__voidlbl,\n  #nlPredictor .nlsp__hero-card .nlsp__countdown { color:inherit; }\n  #nlPredictor .nlsp__heromatch {\n    position:relative;\n    display:grid; grid-template-columns:1fr 1fr;\n  }\n  #nlPredictor .nlsp__heroside {\n    display:flex; flex-direction:column; align-items:center; gap:10px;\n    text-align:center; min-width:0;\n    padding:16px 12px 18px;\n  }\n  #nlPredictor .nlsp__heroside img {\n    width:72px; height:72px; object-fit:contain;\n    background:var(--white); border-radius:10px; padding:7px;\n    box-shadow:var(--shadow);\n  }\n  #nlPredictor .nlsp__heroname {\n    font-size:14px; line-height:1.2;\n    text-transform:uppercase; letter-spacing:.5px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    color:inherit;\n  }\n  #nlPredictor .nlsp__herov {\n    position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);\n    width:28px; height:28px;\n    display:flex; align-items:center; justify-content:center;\n    background:var(--white); color:var(--text-muted);\n    border-radius:50%; box-shadow:var(--shadow);\n    font-size:12px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    text-transform:lowercase;\n    z-index:1;\n  }\n  /* Scores in white windows — bigger, unmissable on any club colour */\n  #nlPredictor .nlsp__hero-card .nlsp__step .nlsp__stepval,\n  #nlPredictor .nlsp__hero-card .nlsp__teamscore {\n    background:var(--white); color:var(--text);\n    min-width:48px; padding:3px 8px;\n    font-size:26px; text-align:center;\n    border-radius:8px;\n    box-shadow:0 3px 10px rgba(10,22,40,.25);\n  }\n  #nlPredictor .nlsp__hero-card .nlsp__teamscore.is-pred { color:var(--text-muted); }\n  #nlPredictor .nlsp__hero-card .nlsp__step { gap:8px; }\n  #nlPredictor .nlsp__hero-card .nlsp__step button { width:36px; height:36px; font-size:18px; }\n  #nlPredictor .nlsp__hero-card .nlsp__editcontrols {\n    margin:0; padding:12px; justify-content:center;\n  }\n  /* On the hero the EDIT affordance is a visible inline button under the\n     matchup (the absolute pill would collide with the countdown chip). */\n  #nlPredictor .nlsp__hero-card .nlsp__rowedit {\n    position:static; display:block; margin:10px auto 12px; opacity:1;\n  }\n  @media (max-width:520px) {\n    #nlPredictor .nlsp__heroside img { width:56px; height:56px; padding:5px; }\n    #nlPredictor .nlsp__heroname { font-size:12px; }\n    #nlPredictor .nlsp__hero-card .nlsp__step button { width:32px; height:32px; }\n    #nlPredictor .nlsp__hero-card .nlsp__step .nlsp__stepval,\n    #nlPredictor .nlsp__hero-card .nlsp__teamscore { font-size:22px; min-width:42px; }\n  }\n\n  /* KO group boxes — fixtures sharing a kick-off time, one countdown each */\n  #nlPredictor .nlsp__kogroup {\n    background:var(--white);\n    border:1px solid var(--border); border-radius:var(--radius);\n    margin-bottom:12px;\n    overflow:hidden;\n  }\n  #nlPredictor .nlsp__kohead {\n    display:flex; align-items:center; justify-content:space-between; gap:10px;\n    padding:8px 12px;\n    background:var(--off-white);\n    border-bottom:1px solid var(--border);\n    font-size:11px; color:var(--text-muted);\n    text-transform:uppercase; letter-spacing:1px;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlPredictor .nlsp__countdown { color:var(--primary); white-space:nowrap; }\n  #nlPredictor .nlsp__kostatus { color:var(--text-muted); white-space:nowrap; }\n  #nlPredictor .nlsp__kostatus.is-live { color:var(--green); }\n  #nlPredictor .nlsp__kogroup .nlsp__row:last-child { border-bottom:none; }\n\n  /* No row background tint for live — just the pulse on the meta strip */\n  #nlPredictor .nlsp__row.is-exact { background:var(--amber-light); }\n  #nlPredictor .nlsp__row.is-right { background:var(--green-light); }\n  #nlPredictor .nlsp__row.is-wrong { background:var(--off-white); }\n  #nlPredictor .nlsp__row.is-editing { border-left-color:var(--primary); }\n\n  /* Meta strip (KO time / live dot / FT verdict) on top */\n  #nlPredictor .nlsp__meta {\n    display:flex; align-items:center; gap:8px;\n    font-size:11px; color:var(--text-muted);\n    text-transform:uppercase; letter-spacing:1px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    padding-right:60px; /* leave room for the hover EDIT pill */\n    min-height:16px;\n  }\n  #nlPredictor .nlsp__meta .nlsp__livedot {\n    width:7px; height:7px; border-radius:50%; background:var(--accent-live);\n    animation:nlsp-pulse 1.4s infinite;\n  }\n  #nlPredictor .nlsp__meta .nlsp__livelbl { color:var(--green); }\n  #nlPredictor .nlsp__meta .nlsp__ftlabel { color:var(--green); }\n  #nlPredictor .nlsp__meta .nlsp__voidlbl { color:var(--text-muted); }\n  #nlPredictor .nlsp__meta .nlsp__lock    { color:var(--text-muted); }\n  /* A called-off fixture should sit clearly behind the live ones — it is\n     context now, not something to act on. */\n  #nlPredictor .nlsp__row.is-void { opacity:.45; }\n  /* Same size and column as a score — it IS the score slot, holding a letter\n     instead of a number. Only the colour says it is not a result. */\n  #nlPredictor .nlsp__teamscore.is-void { color:var(--text-muted); }\n  /* Holds the W/D/L column open on a called-off row. */\n  #nlPredictor .nlsp__wdlbox.is-blank {\n    background:transparent; border-color:transparent;\n  }\n  /* A submitted row reserves 64px on the right for its hover Edit button\n     (.has-edit below). A called-off row has no Edit, so without this its\n     content ran on into that reserved strip and the P sat further right than\n     every score above and below it. Same padding, same column. */\n  #nlPredictor .nlsp__row.is-void { padding-right:64px; }\n  #nlPredictor .nlsp__meta .nlsp__pickline { color:var(--text-muted); }\n  #nlPredictor .nlsp__meta .nlsp__pickline b { color:var(--text); font-weight:900; font-variation-settings:'wght' 900; }\n  @keyframes nlsp-pulse {\n    0%   { box-shadow:0 0 0 0 color-mix(in srgb, var(--accent-live) 60%, transparent); }\n    70%  { box-shadow:0 0 0 6px color-mix(in srgb, var(--accent-live) 0%, transparent); }\n    100% { box-shadow:0 0 0 0 color-mix(in srgb, var(--accent-live) 0%, transparent); }\n  }\n  /* Verdict pill — solid bg, white text. Exact = amber \"champion\" treatment\n     with a slight bump in size + a tiny star prefix. Right result = green.\n     Wrong gets no pill. Always right-aligned in the meta strip. */\n  #nlPredictor .nlsp__pts {\n    margin-left:auto; padding:3px 12px; border-radius:999px;\n    font-size:14px; letter-spacing:.6px;\n    color:var(--white);\n    font-weight:900; font-variation-settings:'wght' 900;\n    display:inline-flex; align-items:center; gap:5px;\n    white-space:nowrap;\n  }\n  #nlPredictor .nlsp__pts.is-exact {\n    background:var(--amber); color:var(--white);\n    font-size:15px; padding:4px 14px;\n    box-shadow:0 1px 4px color-mix(in srgb, var(--amber) 35%, transparent);\n  }\n  #nlPredictor .nlsp__pts.is-exact::before { content:'\\2605'; font-size:13px; line-height:1; }\n  #nlPredictor .nlsp__pts.is-right { background:var(--green); color:var(--white); }\n  #nlPredictor .nlsp__pts.is-wrong {\n    background:var(--white); color:var(--text-muted);\n    border:1px solid var(--border);\n  }\n\n  /* Team line — full row width with score on the right */\n  #nlPredictor .nlsp__teamline {\n    display:flex; align-items:center; gap:10px;\n    font-size:14px; color:var(--text);\n    font-weight:800; font-variation-settings:'wght' 800;\n    text-transform:uppercase; letter-spacing:.5px;\n    min-height:30px;\n  }\n  #nlPredictor .nlsp__teamline img {\n    width:24px; height:24px; flex:none; border-radius:3px;\n    background:var(--white); object-fit:contain;\n  }\n  #nlPredictor .nlsp__teamline .nlsp__tname {\n    flex:1; min-width:0;\n    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n  }\n  #nlPredictor .nlsp__tname-short { display:none; }\n  @media (max-width:520px) {\n    #nlPredictor .nlsp__tname-full  { display:none; }\n    #nlPredictor .nlsp__tname-short { display:inline; }\n  }\n  /* Score cell on the right of each team line */\n  #nlPredictor .nlsp__teamscore {\n    flex:none; min-width:36px;\n    text-align:right;\n    font-size:20px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text);\n  }\n  #nlPredictor .nlsp__teamscore.is-pred { color:var(--text-muted); }\n\n  /* Score stepper — buttons only, no free text. − greys at 0, + greys at 9. */\n  #nlPredictor .nlsp__step { display:flex; align-items:center; gap:6px; flex:none; }\n  #nlPredictor .nlsp__step button {\n    width:32px; height:32px; flex:none; padding:0;\n    display:flex; align-items:center; justify-content:center;\n    font-family:inherit; font-size:17px; line-height:1;\n    font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text); background:var(--white);\n    border:1px solid var(--border); border-radius:var(--radius);\n    cursor:pointer;\n    transition:color .15s ease, border-color .15s ease;\n  }\n  #nlPredictor .nlsp__step button:hover:not(:disabled) { color:var(--primary); border-color:var(--primary); }\n  #nlPredictor .nlsp__step button:focus-visible { outline:none; box-shadow:var(--focus-ring); }\n  #nlPredictor .nlsp__step button:disabled {\n    color:var(--border); background:var(--off-white); cursor:default;\n  }\n  #nlPredictor .nlsp__step .nlsp__stepval {\n    min-width:26px; text-align:center;\n    font-size:20px; font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text);\n  }\n\n  /* Hover-revealed EDIT pill — top-right of the row */\n  #nlPredictor .nlsp__rowedit {\n    position:absolute; right:10px; top:6px;\n    font:inherit; font-size:10px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    text-transform:uppercase; letter-spacing:1px;\n    background:var(--white); color:var(--text-muted);\n    border:1px solid var(--border); border-radius:4px;\n    padding:3px 7px; cursor:pointer;\n    opacity:0; transition:opacity .15s ease, color .15s ease, border-color .15s ease;\n  }\n  #nlPredictor .nlsp__row:hover .nlsp__rowedit,\n  #nlPredictor .nlsp__rowedit:focus-visible { opacity:1; }\n  /* Submitted rows have no meta strip (v2.2), so reserve right-edge space\n     for the pill and centre it vertically — otherwise it overlaps the home\n     score. */\n  #nlPredictor .nlsp__row.has-edit { padding-right:64px; }\n  #nlPredictor .nlsp__row.has-edit .nlsp__rowedit { top:50%; transform:translateY(-50%); }\n  #nlPredictor .nlsp__rowedit:hover { color:var(--primary); border-color:var(--primary); }\n  @media (hover:none) {\n    #nlPredictor .nlsp__rowedit { opacity:.55; }\n  }\n\n  /* Per-row SAVE / CANCEL controls */\n  #nlPredictor .nlsp__editcontrols {\n    display:flex; gap:8px; justify-content:flex-end;\n    margin-top:6px;\n  }\n  #nlPredictor .nlsp__editcontrols button {\n    font:inherit; font-size:11px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:6px 14px; border-radius:var(--radius); cursor:pointer;\n    transition:background .15s ease, color .15s ease, border-color .15s ease;\n  }\n  #nlPredictor .nlsp__editcontrols .nlsp__btn-save {\n    background:var(--primary); color:var(--white); border:1px solid var(--primary);\n  }\n  #nlPredictor .nlsp__editcontrols .nlsp__btn-save:hover  { background:var(--primary-600); }\n  #nlPredictor .nlsp__editcontrols .nlsp__btn-save:disabled {\n    background:var(--border); color:var(--text-muted); border-color:var(--border); cursor:not-allowed;\n  }\n  #nlPredictor .nlsp__editcontrols .nlsp__btn-cancel {\n    background:var(--white); color:var(--text-muted); border:1px solid var(--border);\n  }\n  #nlPredictor .nlsp__editcontrols .nlsp__btn-cancel:hover { color:var(--text); border-color:var(--text-muted); }\n\n  /* Reset all predictions — subtle text link between fixtures and leaderboard */\n  #nlPredictor .nlsp__reset {\n    display:flex; justify-content:flex-end;\n    padding:8px 4px 14px;\n  }\n  #nlPredictor .nlsp__resetbtn {\n    font:inherit; font-size:11px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    text-transform:uppercase; letter-spacing:1px;\n    background:transparent; border:none; padding:4px 0;\n    color:var(--text-muted); cursor:pointer;\n    text-decoration:underline; text-underline-offset:3px;\n    transition:color .15s ease;\n  }\n  #nlPredictor .nlsp__resetbtn:hover { color:var(--red); }\n\n  /* Submit bar — the button when there is something to commit, and the\n     confirmation in the same place once there is not. Feedback belongs where\n     the action was: a banner at the top of the page reports a change the fan\n     made at the bottom of it. */\n  #nlPredictor .nlsp__submitbar {\n    display:flex; gap:12px; align-items:center;\n    padding:12px 14px; margin:14px 0 18px;\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    box-shadow:var(--shadow);\n  }\n  #nlPredictor .nlsp__submitbar .nlsp__btn { flex:1; }\n  #nlPredictor .nlsp__submitbar.is-saved {\n    background:var(--green-light); border-color:var(--green);\n  }\n  #nlPredictor .nlsp__savedpill {\n    flex:1; display:flex; align-items:center; gap:8px;\n    color:var(--green); font-size:14px;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlPredictor .nlsp__savedpill svg { flex:none; }\n  #nlPredictor .nlsp__savedsub {\n    display:block; font-size:12px; color:var(--text-muted);\n    font-weight:400; font-variation-settings:'wght' 400;\n  }\n\n  /* Custom confirm modal */\n  #nlPredictor .nlsp__modal[hidden] { display:none; }\n  #nlPredictor .nlsp__modal {\n    position:fixed; inset:0; z-index:1000;\n    display:flex; align-items:center; justify-content:center;\n    padding:20px;\n    background:rgba(10,22,40,.65); /* canon .modal-backdrop scrim */\n  }\n  #nlPredictor .nlsp__modal-card {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    box-shadow:0 12px 36px rgba(10,22,40,.25);\n    padding:22px 24px; max-width:380px; width:100%;\n    font-family:'carbona-variable','carbona',sans-serif;\n  }\n  #nlPredictor .nlsp__modal-card h3 {\n    margin:0 0 6px;\n    font-size:18px; font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text);\n  }\n  #nlPredictor .nlsp__modal-card p {\n    margin:0 0 18px;\n    font-size:14px; color:var(--text-muted);\n    font-weight:500; font-variation-settings:'wght' 500;\n  }\n  #nlPredictor .nlsp__modal-actions {\n    display:flex; justify-content:flex-end; gap:8px;\n  }\n  #nlPredictor .nlsp__modal-actions button {\n    font:inherit; font-size:13px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:8px 16px; border-radius:var(--radius); cursor:pointer;\n  }\n  #nlPredictor .nlsp__modal-cancel {\n    background:var(--white); color:var(--text-muted); border:1px solid var(--border);\n  }\n  #nlPredictor .nlsp__modal-cancel:hover { color:var(--text); border-color:var(--text-muted); }\n  #nlPredictor .nlsp__modal-confirm {\n    background:var(--primary); color:var(--white); border:1px solid var(--primary);\n  }\n  #nlPredictor .nlsp__modal-confirm:hover { background:var(--primary-600); }\n\n  /* Registration */\n  #nlPredictor .nlsp__register-card {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    padding:24px; box-shadow:var(--shadow);\n  }\n  #nlPredictor .nlsp__register-card label {\n    display:block; font-size:13px; margin:18px 0 6px;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlPredictor .nlsp__register-card select {\n    width:100%; padding:10px 12px; font-size:15px; font-family:inherit;\n    color:var(--text); background:var(--white);\n    border:1px solid var(--border); border-radius:var(--radius);\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n  #nlPredictor .nlsp__register-card select:focus {\n    outline:none; border-color:var(--primary);\n    box-shadow:var(--focus-ring);\n  }\n  #nlPredictor .nlsp__lockwarn {\n    margin:18px 0; padding:10px 12px;\n    background:var(--amber-light); border:1px solid var(--amber); color:var(--amber);\n    font-size:13px; border-radius:var(--radius);\n    font-weight:700; font-variation-settings:'wght' 700;\n  }\n  #nlPredictor .nlsp__btn {\n    font-family:inherit; font-size:15px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    padding:10px 22px; border:none; border-radius:var(--radius);\n    cursor:pointer; background:var(--primary); color:var(--white);\n    transition:background .15s ease;\n  }\n  #nlPredictor .nlsp__btn:hover  { background:var(--primary-600); }\n  #nlPredictor .nlsp__btn:active { background:var(--primary-700); }\n  #nlPredictor .nlsp__btn:focus-visible {\n    outline:3px solid var(--primary-300); outline-offset:2px;\n  }\n  #nlPredictor .nlsp__btn:disabled { background:var(--border); color:var(--text-muted); cursor:not-allowed; }\n\n  /* Leaderboard */\n  #nlPredictor .nlsp__table {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    padding:12px 0; margin:18px 0; box-shadow:var(--shadow);\n  }\n  #nlPredictor .nlsp__tablehead { padding:0 14px 8px; border-bottom:1px solid var(--border); }\n  #nlPredictor .nlsp__tablehead .nlsp__kicker {\n    font-size:11px; text-transform:uppercase; letter-spacing:1.5px;\n    color:var(--text-muted);\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlPredictor .nlsp__tablehead .nlsp__tsub { font-size:12px; color:var(--text-muted); margin-top:2px; }\n  #nlPredictor .nlsp__trow {\n    display:grid; grid-template-columns:24px 24px 1fr auto;\n    align-items:center; gap:10px; padding:6px 14px;\n    font-size:14px;\n    font-weight:700; font-variation-settings:'wght' 700;\n  }\n  /* Leaderboard: three labelled numeric columns (results / exact / games).\n     Fixed widths so the header row and data rows align across grids. */\n  /* Scoped to BOTH leaderboard elements. These six columns used to be keyed\n     on #nlsp-table alone, so the signed-out teaser — a different element with\n     the same markup — fell back to the four-column grid and stacked its\n     numbers on top of each other. A layout keyed to one element id breaks the\n     moment a second place shows the same table. */\n  #nlPredictor #nlsp-table .nlsp__trow,\n  #nlPredictor #nlsp-table .nlsp__thead,\n  #nlPredictor #nlsp-teaser .nlsp__trow,\n  #nlPredictor #nlsp-teaser .nlsp__thead { grid-template-columns:24px 24px 1fr 48px 42px 42px; }\n  /* The teaser drops Games. Signed out you cannot filter by matchday, so the\n     count is context for a table you have no way to interrogate — and it was\n     the 52px the name cell needed to stay on one line beside the card. Same\n     renderer, one column fewer: five here, and the header omits the label. */\n  #nlPredictor #nlsp-teaser .nlsp__trow,\n  #nlPredictor #nlsp-teaser .nlsp__thead {\n    /* Narrower than the signed-in table's, and a tighter gap: beside the\n       sign-in card the table has about 330px to work with, and every pixel\n       not spent on a two-digit number is a pixel the name can use. Worth 22px\n       to the name cell, which is the difference between \"Danielle O (you)\"\n       fitting and being clipped. */\n    grid-template-columns:22px 24px 1fr 42px 36px; gap:10px;\n  }\n  #nlPredictor #nlsp-teaser .nlsp__trow .nlsp__games { display:none; }\n  #nlPredictor .nlsp__thead {\n    display:grid; gap:10px; align-items:end;\n    padding:8px 14px 3px;\n    font-size:9px; color:var(--text-muted);\n    text-transform:uppercase; letter-spacing:.8px;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlPredictor .nlsp__thead span { text-align:right; }\n  /* One line per player. The teaser column is narrow, and a wrapped \"Adam /\n     S\" turns a table you scan into a table you read. */\n  #nlPredictor #nlsp-table .nlsp__trow > span:nth-child(3),\n  #nlPredictor #nlsp-teaser .nlsp__trow > span:nth-child(3) {\n    min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\n  }\n  #nlPredictor #nlsp-table .nlsp__trow .nlsp__pts,\n  #nlPredictor #nlsp-table .nlsp__trow .nlsp__exacts,\n  #nlPredictor #nlsp-table .nlsp__trow .nlsp__games,\n  #nlPredictor #nlsp-teaser .nlsp__trow .nlsp__pts,\n  #nlPredictor #nlsp-teaser .nlsp__trow .nlsp__exacts,\n  #nlPredictor #nlsp-teaser .nlsp__trow .nlsp__games { text-align:right; }\n  #nlPredictor .nlsp__trow .nlsp__games {\n    font-size:12px; color:var(--text-muted);\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n  #nlPredictor .nlsp__trow.is-you { background:var(--primary-50); }\n  #nlPredictor .nlsp__trow .nlsp__rank { color:var(--text-muted); font-weight:900; font-variation-settings:'wght' 900; }\n  #nlPredictor .nlsp__trow img { width:22px; height:22px; border-radius:3px; background:var(--white); object-fit:contain; }\n  #nlPredictor .nlsp__trow .nlsp__pts { font-size:14px; font-weight:900; font-variation-settings:'wght' 900; color:var(--text); padding:0; background:none; }\n  #nlPredictor .nlsp__trow .nlsp__youlbl { color:var(--text-muted); font-weight:600; font-variation-settings:'wght' 600; }\n  /* Secondary stat (exact scorelines) — labelled column, no star needed */\n  #nlPredictor .nlsp__trow .nlsp__exacts {\n    font-size:13px; color:var(--amber);\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n\n  /* Live footer — one strip carrying the live badge, the match minute and\n     the prediction, so a live row needs no meta line above the teams.\n     Full-bleed against the row/card edges. */\n  #nlPredictor .nlsp__row.has-foot { padding-bottom:0; }\n  #nlPredictor .nlsp__rowfoot {\n    display:flex; align-items:center; gap:6px;\n    margin:6px -10px 0; padding:5px 10px;\n    font-size:11px; text-transform:uppercase; letter-spacing:.8px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    background:var(--off-white); color:var(--text-muted);\n  }\n  #nlPredictor .nlsp__rowfoot .nlsp__livedot {\n    flex:none; width:7px; height:7px; border-radius:50%;\n    background:var(--accent-live);\n    animation:nlsp-pulse 1.4s infinite;\n  }\n  #nlPredictor .nlsp__rowfoot .nlsp__footlive { color:var(--green); }\n  /* Separator between the live badge and the prediction */\n  #nlPredictor .nlsp__rowfoot .nlsp__footpick::before {\n    content:'\\00b7'; margin-right:6px; color:var(--border);\n  }\n  #nlPredictor .nlsp__hero-card .nlsp__rowfoot { margin:0; padding:6px 14px; }\n\n  /* W/D/L box — fixed-width letter chip per side. Grey D at 0–0, green W /\n     red L as the scoreline moves. Fixed size so rows never widen. */\n  #nlPredictor .nlsp__wdlbox {\n    flex:none; width:20px; height:20px;\n    display:inline-flex; align-items:center; justify-content:center;\n    border-radius:4px;\n    font-size:11px; line-height:1;\n    font-weight:900; font-variation-settings:'wght' 900;\n    background:var(--off-white); color:var(--text-muted);\n    border:1px solid var(--border);\n  }\n  #nlPredictor .nlsp__wdlbox.is-w { background:var(--green); border-color:var(--green); color:var(--white); }\n  #nlPredictor .nlsp__wdlbox.is-l { background:var(--red);   border-color:var(--red);   color:var(--white); }\n  /* On hero panels the grey D needs to read on club colours — solid white chip */\n  #nlPredictor .nlsp__hero-card .nlsp__wdlbox {\n    background:var(--white); color:var(--text-muted); border-color:var(--white);\n  }\n  #nlPredictor .nlsp__hero-card .nlsp__wdlbox.is-w { background:var(--green); border-color:var(--green); color:var(--white); }\n  #nlPredictor .nlsp__hero-card .nlsp__wdlbox.is-l { background:var(--red);   border-color:var(--red);   color:var(--white); }\n\n  /* The teaser takes the larger share of the row — it is the wider thing and\n     the one whose content suffers first when squeezed. min-width:0 lets it\n     shrink past its content, so the name cell ellipsises instead of forcing\n     the table to overflow the column. */\n  #nlPredictor .nlsp__teaser { flex:1 1 58%; min-width:0; max-width:520px; }\n\n  /* Below this the table starts truncating names and the sign-in button\n     outgrows its card, so the two go one above the other instead. Measured:\n     abreast is clean at a 620px column and visibly degrading by 580. The\n     query measures #nlPredictor's CONTENT box, which is the column less its\n     own 24px of padding — so 545 here is a ~569px column, not a 545px one.\n     The NL page's column is about 600, which must stay abreast, so the\n     threshold sits clear of it rather than a few pixels below.\n\n     Both rules, deliberately. The container query is the accurate one — it\n     reads the column. The media query is the fallback for anything that does\n     not support containment, where it at least catches phones; on everything\n     else it is redundant and harmless. */\n  @container nlsp (max-width:545px) {\n    #nlPredictor .nlsp__gate-card,\n    #nlPredictor .nlsp__teaser { flex-basis:100%; }\n  }\n  @media (max-width:640px) {\n    #nlPredictor .nlsp__gate-card,\n    #nlPredictor .nlsp__teaser { flex-basis:100%; }\n  }\n\n  /* Your row, pinned when it is not on this page. Dashed edge so it reads as\n     \"brought here for comparison\" rather than as part of the run of ten. */\n  #nlPredictor .nlsp__trow.is-pinned { position:relative; }\n  #nlPredictor .nlsp__trow.is-pinned-top    { border-bottom:2px dashed var(--border); }\n  #nlPredictor .nlsp__trow.is-pinned-bottom { border-top:2px dashed var(--border); }\n\n  /* Leaderboard pager. Arrows, not numbered pages: the field grows all season\n     and a row of numbers would grow with it. */\n  #nlPredictor .nlsp__pager {\n    display:flex; align-items:center; justify-content:center; gap:14px;\n    padding:10px 12px;\n  }\n  #nlPredictor .nlsp__pagebtn {\n    font:inherit; font-size:16px; line-height:1;\n    width:30px; height:30px; flex:none;\n    background:var(--white); color:var(--text);\n    border:1px solid var(--border); border-radius:var(--radius);\n    cursor:pointer;\n  }\n  #nlPredictor .nlsp__pagebtn:hover:not(:disabled) { border-color:var(--primary); color:var(--primary); }\n  #nlPredictor .nlsp__pagebtn:disabled { opacity:.4; cursor:default; }\n  #nlPredictor .nlsp__pagelbl {\n    font-size:12px; color:var(--text-muted);\n    font-variant-numeric:tabular-nums;\n  }\n\n  /* Leaderboard scope filters — canon .chip-group pattern (segmented,\n     single-choice, navy active) + contextual select, stacked in the head */\n  #nlPredictor .nlsp__tablefilters {\n    display:flex; flex-direction:column; gap:8px; margin-top:8px;\n  }\n  #nlPredictor .nlsp__chipgroup {\n    display:flex; gap:2px;\n    background:var(--off-white); border-radius:var(--radius); padding:3px;\n  }\n  #nlPredictor .nlsp__chip {\n    flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px;\n    padding:7px 10px;\n    font-family:inherit; font-size:12px;\n    color:var(--text-muted); background:transparent;\n    border:none; border-radius:4px; cursor:pointer;\n    font-weight:700; font-variation-settings:'wght' 700;\n    transition:background .12s ease, color .12s ease;\n  }\n  #nlPredictor .nlsp__chip.is-on { background:var(--navy); color:var(--white); }\n  #nlPredictor .nlsp__chip img { width:16px; height:16px; object-fit:contain; flex:none; }\n  #nlPredictor .nlsp__chip:focus-visible { outline:none; box-shadow:var(--focus-ring); }\n  #nlPredictor .nlsp__tablefilters select {\n    font-family:inherit; font-size:12px;\n    padding:6px 8px; border-radius:var(--radius);\n    border:1px solid var(--border); background:var(--white); color:var(--text);\n    font-weight:700; font-variation-settings:'wght' 700;\n  }\n  #nlPredictor .nlsp__tablefilters select:focus {\n    outline:none; border-color:var(--primary);\n    box-shadow:var(--focus-ring);\n  }\n\n  /* Club v club table — accuracy % rows + below-floor footnote */\n  #nlPredictor .nlsp__clubrow-fans {\n    font-size:11px; color:var(--text-muted);\n    font-weight:600; font-variation-settings:'wght' 600;\n    white-space:nowrap;\n  }\n  #nlPredictor .nlsp__clubfoot {\n    padding:8px 14px 0;\n    font-size:11px; color:var(--text-muted);\n    font-weight:600; font-variation-settings:'wght' 600;\n    border-top:1px solid var(--border); margin-top:6px;\n  }\n\n  /* Sim bar (foot) */\n  #nlPredictor .nlsp__simbar {\n    margin-top:18px; padding-top:10px; border-top:1px dashed var(--border);\n    display:flex; flex-wrap:wrap; gap:8px; align-items:center;\n    font-size:11px; color:var(--text-muted);\n  }\n  #nlPredictor .nlsp__simbar .nlsp__simlbl {\n    text-transform:uppercase; letter-spacing:1.2px;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlPredictor .nlsp__simbar input[type=\"date\"],\n  #nlPredictor .nlsp__simbar input[type=\"time\"] {\n    font-family:inherit; font-size:12px;\n    padding:4px 8px; border-radius:var(--radius);\n    border:1px solid var(--border); background:var(--white); color:var(--text);\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n  #nlPredictor .nlsp__simbar input[type=\"date\"]:focus,\n  #nlPredictor .nlsp__simbar input[type=\"time\"]:focus {\n    outline:none; border-color:var(--primary);\n    box-shadow:var(--focus-ring);\n  }\n  #nlPredictor .nlsp__simbar .nlsp__sim-now-btn {\n    font-family:inherit; font-size:11px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:4px 10px; border-radius:999px; cursor:pointer;\n    background:var(--white); color:var(--text-muted); border:1px solid var(--border);\n  }\n  #nlPredictor .nlsp__simbar .nlsp__sim-now-btn:hover {\n    color:var(--primary); border-color:var(--primary);\n  }\n  #nlPredictor .nlsp__simbar .nlsp__clock {\n    font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11px;\n    color:var(--text-muted); margin-left:auto;\n  }\n\n  @media (max-width:520px) {\n    /* Mobile tweaks for the stacked row layout — DO NOT re-introduce\n       grid-template-columns here or it'll force the old horizontal\n       layout and break stacking below 520px. */\n    #nlPredictor .nlsp__row { padding:8px; }\n    #nlPredictor .nlsp__teamline img { width:22px; height:22px; }\n    #nlPredictor .nlsp__teamline { font-size:13px; }\n    #nlPredictor .nlsp__teamscore { font-size:18px; min-width:30px; }\n    #nlPredictor .nlsp__teamscore input { width:42px; height:32px; font-size:16px; }\n    #nlPredictor .nlsp__hero h1 { font-size:22px; }\n  }\n";
  var HTML = "<div id=\"nlPredictor\">\n  <div class=\"nlsp__sponsor\" id=\"nlsp-sponsor\"></div>\n  <div class=\"nlsp__banner\" id=\"nlsp-banner\" hidden>Loading predictor…</div>\n  <div class=\"nlsp__screen\" id=\"nlsp-register\" hidden></div>\n  <div class=\"nlsp__screen\" id=\"nlsp-main\" hidden>\n    <div id=\"nlsp-datebar\"></div>\n    <div id=\"nlsp-hero\"></div>\n    <div id=\"nlsp-statusbar\"></div>\n    <div id=\"nlsp-fixtures\"></div>\n    <div id=\"nlsp-submitbar\"></div>\n    <div id=\"nlsp-reset\"></div>\n    <div id=\"nlsp-table\"></div>\n    <div id=\"nlsp-clubtable\"></div>\n  </div>\n  <div class=\"nlsp__gate\" id=\"nlsp-gate\"></div>\n  <div id=\"nlsp-sim\"></div>\n  <div class=\"nlsp__modal\" id=\"nlsp-modal\" hidden></div>\n</div>";

  function mount() {
    // Mount into the host page's marker div. Falling back to appending our
    // own container means a missing marker degrades to "renders at the
    // bottom" rather than "renders nowhere".
    var host = document.querySelector('[data-nl-score-predictor]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-nl-score-predictor', '');
      document.body.appendChild(host);
      if (window.console && console.warn) {
        console.warn('[Score Predictor] no [data-nl-score-predictor] element found — appended to <body>.');
      }
    }

    var style = document.createElement('style');
    style.setAttribute('data-nl-embed', "embeds/score-predictor.js");
    style.textContent = CSS;
    document.head.appendChild(style);

    // Markup must be in the DOM before the widget runs — its IIFE resolves
    // every element by ID at the top and does not wait for DOMContentLoaded.
    host.innerHTML = HTML;

    if (window.console && console.info) {
      console.info('[Score Predictor] ' + VERSION + ' mounted.');
    }


    (function () {
      // ---------- config ----------
      var FIREBASE_CONFIG = {
        apiKey:            'AIzaSyAOePUiyfACJ546b08Z7oGWahAEYzEadMo',
        authDomain:        'nl-widgets.firebaseapp.com',
        databaseURL:       'https://nl-widgets-default-rtdb.europe-west1.firebasedatabase.app',
        projectId:         'nl-widgets',
        storageBucket:     'nl-widgets.firebasestorage.app',
        messagingSenderId: '440054238126',
        appId:             '1:440054238126:web:349a1aeaf3c65ff281563f'
      };
      var APP_NAME   = 'nlPredictor';
      var FB_SDK_URL = 'https://www.gstatic.com/firebasejs/10.12.0/';
      // App Check loads second so it can be activated the moment the app exists,
      // before anything signs in. It is only fetched when a site key is set —
      // without one there is nothing to activate and the request would be waste.
      var FB_SDK     = ['firebase-app-compat.js','firebase-auth-compat.js','firebase-database-compat.js'];

      /* Firebase App Check — reCAPTCHA v3 site key for the nl-widgets project.
         PUBLIC by design: reCAPTCHA site keys are meant to ship in the page, and
         the paired secret lives in the Firebase console, never here.

         App Check attests that a request comes from this app on a registered
         domain, rather than from anything holding the Firebase config — which,
         being in this file, is everything. It raises the cost of scripting the
         REST API directly. It is NOT identity: it says nothing about which fan
         is asking, so it must never be described as making the widgets private.

         Empty string = off, and every path below degrades to today's behaviour.
         Enforcement is a console toggle, not a code change, so this same build
         runs in monitor mode and in enforcement.

         Add ?appcheck=debug to the page URL to get a debug token printed to the
         console, for registering a preview domain that reCAPTCHA cannot verify. */
      var APPCHECK_SITE_KEY = '6LdxWHItAAAAAOT69qFXddxpmRelAC-XkDcb2VPk';
      // NL+ logo (red, lozenge) served from the tools repo via raw.githubusercontent.com
      var NLPLUS_LOGO_URL = 'https://raw.githubusercontent.com/thenationalleague/tools/main/assets/logos/NL%2B%20red%20lozenge.png';
      // SA SSO tenant for thenationalleague — matches the tenant_id claim in JWTs
      var SSO_TENANT_ID = 'EBLzD6derkq3NH7m9Rp2mQ';

      // Three NL divisions wired in. Add/change here to extend coverage.
      var COMPS = {
        89:  { id: 89,  name: 'National Division',     shortName: 'National' },
        373: { id: 373, name: 'National League North', shortName: 'North'    },
        372: { id: 372, name: 'National League South', shortName: 'South'    }
      };
      var COMP_IDS = Object.keys(COMPS).map(Number); // [89, 373, 372]
      var DEFAULT_COMP_ID = 89; // National — fallback when team→comp lookup fails
      var SEASON_ID  = 2026; // fallback only — the live value is derived from clubs-meta.json
      var CLUBS_META_URL = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/data/clubs-meta.json';
      var API_BASE   = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
      var MAX_PAGES  = 10;
      var IN_PLAY_MIN = 105;
      var STALE_LIVE_MIN = 240;    // past this, an in-play matchPeriod is not believed
      var EDIT_WINDOW_HOURS = 168; // predictions open 7 days before KO
      var CUTOFF_MIN = 60;         // predictions lock 1h before KO
      var MAX_GOALS = 9;           // stepper cap per side
      var LB_PAGE_SIZE = 10;       // players per leaderboard page
      var TEASER_ROWS  = 10;       // rows shown to a signed-out visitor
      var CLUB_TABLE_MIN_SETTLED = 20; // settled predictions a club needs before it ranks

      // ---------- DOM refs ----------
      var banner    = document.getElementById('nlsp-banner');
      var register  = document.getElementById('nlsp-register');
      var main      = document.getElementById('nlsp-main');
      var hero      = document.getElementById('nlsp-hero');
      var statusbar = document.getElementById('nlsp-statusbar');
      var fixtures  = document.getElementById('nlsp-fixtures');
      var submitb   = document.getElementById('nlsp-submitbar');
      var resetEl   = document.getElementById('nlsp-reset');
      var tableEl   = document.getElementById('nlsp-table');
      var clubTableEl = document.getElementById('nlsp-clubtable');
      var simEl     = document.getElementById('nlsp-sim');
      var sponsorEl = document.getElementById('nlsp-sponsor');
      var datebarEl = document.getElementById('nlsp-datebar');

      // ---------- header (always visible) ----------
      function renderSponsor() {
        var r = state.registration;
        var compId = userCompId() || DEFAULT_COMP_ID;
        var compName_ = compName(compId);
        var teamName  = (r && r.teamName) || '';
        var teamCrest = (r && r.crestUrl)
          ? '<img class="nlsp__sponsor-team" src="' + $h(r.crestUrl) + '" alt="' + $h(teamName || 'My team') + '" ' +
              'title="' + $h(teamName) + ' · ' + $h(compName_) + '" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">'
          : '';
        sponsorEl.innerHTML =
          '<div class="nlsp__sponsor-left">' +
            '<img class="nlsp__sponsor-wide" src="' + compWideLogoUrl(compId) + '" alt="' + $h(compName_) + '" ' +
              'title="' + $h(compName_) + '" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">' +
          '</div>' +
          '<span class="nlsp__sponsor-title">Score Predictor</span>' +
          '<div class="nlsp__sponsor-right">' +
            teamCrest +
          '</div>';
      }
      // NOTE: renderSponsor() can't run here at script-load because it reads
      // state.registration + calls userCompId() / compWideLogoUrl(), and
      // `var state = {...}` plus those helpers are defined further down.
      // Hoisting makes `state` available as `undefined`, which throws on read.
      // Initial paint happens from boot() instead, after all helpers are defined.

      // ---------- helpers ----------
      function $h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
      });}
      function readCookie(name) {
        var p = (document.cookie || '').split('; ');
        for (var i = 0; i < p.length; i++) if (p[i].indexOf(name + '=') === 0) return p[i].slice(name.length + 1);
        return null;
      }
      function decodeJwtPayload(jwt) {
        if (!jwt) return null;
        var parts = jwt.split('.'); if (parts.length !== 3) return null;
        try {
          var s = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (s.length % 4) s += '=';
          return JSON.parse(decodeURIComponent(escape(atob(s))));
        } catch (e) { return null; }
      }
      function loadScript(src) {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src; s.async = false;
          s.onload  = function () { resolve(); };
          s.onerror = function () { reject(new Error('Failed to load ' + src)); };
          document.head.appendChild(s);
        });
      }
      function loadFirebase() {
        var files = APPCHECK_SITE_KEY
          ? [FB_SDK[0], 'firebase-app-check-compat.js'].concat(FB_SDK.slice(1))
          : FB_SDK;
        return files.reduce(function (p, name) {
          return p.then(function () { return loadScript(FB_SDK_URL + name); });
        }, Promise.resolve());
      }
      /* Activate App Check on a freshly initialised app. Deliberately swallows
         every failure: in monitor mode an unattested request still succeeds, so a
         blocked reCAPTCHA (privacy extension, corporate proxy, offline preview)
         must not stop a fan using the widget. Once enforcement is on, the same
         failure denies at the database instead — which is the intended behaviour,
         and still not something this function should try to paper over. */
      function activateAppCheck(app) {
        if (!APPCHECK_SITE_KEY) return;
        try {
          if (/[?&]appcheck=debug\b/.test(location.search)) {
            self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          }
          var ac = firebase.appCheck(app);
          var provider = firebase.appCheck.ReCaptchaV3Provider
            ? new firebase.appCheck.ReCaptchaV3Provider(APPCHECK_SITE_KEY)
            : APPCHECK_SITE_KEY;
          ac.activate(provider, true);
        } catch (e) {
          if (window.console && console.warn) {
            console.warn('[NL] App Check not activated:', e && e.message ? e.message : e);
          }
        }
      }
      function normaliseUtc(s) {
        if (!s) return null;
        var iso = s.indexOf('T') >= 0 ? s : s.replace(' ', 'T') + 'Z';
        return new Date(iso);
      }
      function fmtBST(d) {
        if (!d) return '';
        return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/London' });
      }
      function teamLabel(t) { return t.shortName || t.name || ''; }
      // clubs-meta short name ('Forest Green') for a teamID, falling back to the
      // NLS shortName then the full name.
      function clubShort(teamId, fallback) {
        var n = teamId && state.clubNames[teamId];
        return (n && n.short) || fallback || '';
      }
      // clubs-meta three-letter code ('ALD'). Falls back to the first three
      // letters of whatever name we have so a missing entry still renders.
      function clubCode(teamId, fallback) {
        var n = teamId && state.clubNames[teamId];
        if (n && n.code) return n.code;
        return String(fallback || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
      }
      function showBanner(msg, kind) {
        banner.className = 'nlsp__banner' + (kind === 'err' ? ' is-err' : kind === 'ok' ? ' is-ok' : '');
        banner.textContent = msg; banner.hidden = false;
      }
      function hideBanner() { banner.hidden = true; }
      // Show a green confirmation banner that auto-dismisses after a short
      // window. Used for save / reset confirmations.
      function setBannerOK(msg) {
        showBanner(msg, 'ok');
        setTimeout(function () {
          if (banner.textContent === msg) hideBanner();
        }, 2200);
      }
      // Brief "Saved" toast at the top of the widget (replaces the old savetick
      // pinned to the now-removed status bar).
      function crestImg(url, alt, size) {
        var s = size || 26;
        if (!url) return '<span style="display:inline-block;width:' + s + 'px;height:' + s + 'px;flex:none;"></span>';
        return '<img src="' + $h(url) + '" alt="' + $h(alt || '') + '" ' +
               'onerror="this.onerror=null;this.style.visibility=\'hidden\';">';
      }

      // ---------- sim mode (URL-driven) ----------
      // Production default (no ?sim param) is the real clock with the sim bar
      // hidden. ?sim=bar shows the bar on the live clock; ?sim=<datetime>
      // (anything new Date() can parse) shows the bar frozen at that moment.
      function parseSimMode() {
        var p = new URLSearchParams(window.location.search).get('sim');
        if (p == null) return { now: null, bar: false };
        var l = p.toLowerCase();
        if (l === 'off' || l === 'none' || l === '0' || l === 'false') return { now: null, bar: false };
        var d = new Date(p);
        if (!isNaN(d.getTime())) return { now: d, bar: true };
        return { now: null, bar: true };
      }

      // ---------- state ----------
      var fbApp = null, fbDb = null, fbAuth = null;
      var state = {
        user: null, fbAuthed: false,
        allMatches: [],     // every fixture for the season (paginated full fetch)
        matches: [],        // filtered subset for the currently-active matchday
        registration: null,
        myPreds: {},        // THIS user's predictions only { matchday: { matchId: ... } }
        predictions: {},    // current user, current matchday
        drafts: {},
        editing: {},
        /* Standings come pre-computed from leaderboard/, not from reading every
           fan's records. The widget used to pull the whole users and predictions
           trees to build its tables, which is what forced those trees to be
           readable at root — and a root read hands any client the full list of
           fan ids. See embeds/auth-hardening-plan.md §4. */
        lbRows: null,       // rows for the current scope, or null while loading
        lbLoading: false,
        lbError: false,
        lbCache: {},        // scope path -> rows, so flipping filters is instant
        lbUpdatedAt: null,
        myHash: null,       // salted hash of our own jwtId, to find our own row
        clubColours: {},        // NLS teamID (optaID) -> {primary, secondary, tertiary} from clubs-meta.json
        clubNames: {},          // NLS teamID (optaID) -> {short, code} from clubs-meta.json
        seasonId: null,         // current season from clubs-meta.json (fallback: SEASON_ID)
        selectedMatchday: null, // explicit override from the date selector; null = derive
        lbScope: 'season',      // leaderboard time scope: 'season' | 'month' | 'day'
        lbMonth: null,          // selected month ('YYYY-MM') when scope is 'month'
        lbDay: null,            // selected matchday key ('YYYY-MM-DD') when scope is 'day'
        lbMine: false,          // true = only fans of the user's own club
        lbPage: null,           // leaderboard page; null = jump to the one you are on
        sim: { fixed: null, barEnabled: false } // explicit sim 'now'; bar shown only when ?sim present
      };

      // ---------- sim clock ----------
      function simNow() {
        return state.sim.fixed ? new Date(state.sim.fixed.getTime()) : new Date();
      }
      function setSimFixed(d) {
        state.sim.fixed = d;
        recomputeMatchday();
        renderAll();
      }
      function clearSimFixed() { setSimFixed(null); }
      function renderAll() {
        renderDatebar(); renderSimBar(); renderHero();
        renderFixtures(); renderSubmitbar(); renderReset(); renderTable(); renderClubTable();
      }

      // ---------- matchday derivation ----------
      // BST/GMT calendar date — keeps a 23:00 BST kickoff on the right matchday
      // even though the API timestamps are UTC.
      function bstDateOf(d) {
        if (!d) return '';
        return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      }
      function matchMatchdayKey(m) { return bstDateOf(koOf(m)); }
      function uniqueMatchdayKeys() {
        var compId = userCompId();
        var seen = {};
        (state.allMatches || []).forEach(function (m) {
          if (compId && m.attributes.competitionID !== compId) return;
          var k = matchMatchdayKey(m); if (k) seen[k] = true;
        });
        return Object.keys(seen).sort();
      }
      // Default: probe-date (sim time's BST date, or real today) if any matches
      // that day, else next upcoming matchday from that probe, else the last
      // matchday of the season. Driving from sim time means setting the sim to
      // a March date will auto-navigate the matchday view to the next NL match
      // after March, which matches the user's expectation.
      function defaultMatchdayKey() {
        var probe = bstDateOf(simNow());
        var keys = uniqueMatchdayKeys();
        if (keys.indexOf(probe) !== -1) return probe;
        for (var i = 0; i < keys.length; i++) {
          if (keys[i] > probe) return keys[i];
        }
        return keys[keys.length - 1] || probe;
      }
      // Returns 'before' if sim is before the first matchday of the user's season,
      // 'after' if it's past the last, or null otherwise. Drives the empty-state
      // banner when the predictor isn't relevant yet (or any more).
      function seasonBoundary() {
        var keys = uniqueMatchdayKeys();
        if (!keys.length) return null;
        var probe = bstDateOf(simNow());
        if (probe < keys[0]) return 'before';
        if (probe > keys[keys.length - 1]) return 'after';
        return null;
      }
      // The matchday actually being shown
      function currentMatchdayKey() {
        return state.selectedMatchday || defaultMatchdayKey();
      }
      function setSelectedMatchday(key) {
        state.selectedMatchday = key;
        recomputeMatchday();
        renderAll();
      }
      function recomputeMatchday() {
        var key = currentMatchdayKey();
        var compId = userCompId();
        state.matches = (state.allMatches || []).filter(function (m) {
          if (compId && m.attributes.competitionID !== compId) return false;
          return matchMatchdayKey(m) === key;
        }).sort(function (a, b) { return dateOf(a).localeCompare(dateOf(b)); });
        recomputePredictionsFromRaw();
      }
      function recomputePredictionsFromRaw() {
        if (!state.user) return;
        var key = currentMatchdayKey();
        state.predictions = state.myPreds[key] || {};
      }

      // ---------- match state ----------
      function dateOf(m) {
        var a = (m && m.attributes) || {};
        return String(a.kickOffDateUTC || a.kickoffDateUTC || a.kickOffDate || a.kickoffDate || a.date || '');
      }
      function koOf(m) { return normaliseUtc(dateOf(m)); }
      function periodOf(m) { return ((m && m.attributes && m.attributes.matchPeriod) || '').toLowerCase(); }
      function stateOf(m, now) {
        // matchPeriod from NLS is authoritative when present: FullTime/PostMatch
        // means the score is final, the live periods mean in-play. The clock
        // logic below is the fallback for PreMatch and for a snapshot that has
        // gone stale between fetches.
        var p = periodOf(m);
        if (p === 'postponed') return 'postponed';
        if (p === 'abandoned') return 'abandoned';
        if (p === 'fulltime' || p === 'postmatch') return 'post';
        if (p === 'firsthalf' || p === 'halftime' || p === 'secondhalf' || p === 'extratime' || p === 'penalties') {
          // Don't believe an in-play period forever. A match abandoned mid-game
          // (or a feed that simply stops updating) would otherwise sit at "Live"
          // indefinitely and never settle. Nothing is still in play STALE_LIVE_MIN
          // after kick-off, so past that we treat the match as unresolved: shown
          // as awaiting a result, excluded from scoring, and self-healing the
          // moment NLS moves it to FullTime, Abandoned or Postponed.
          var koLive = koOf(m);
          if (koLive && (now - koLive) / 60000 > STALE_LIVE_MIN) return 'unresolved';
          return 'live';
        }
        var ko = koOf(m); if (!ko) return 'unknown';
        var diffMin = (now - ko) / 60000;
        var hoursUntil = -diffMin / 60;
        if (diffMin < 0 && hoursUntil > EDIT_WINDOW_HOURS) return 'future'; // > 7 days away
        if (diffMin < -CUTOFF_MIN) return 'pre';                             // editable window
        if (diffMin < 0) return 'locked';                                    // final hour before KO
        if (diffMin < IN_PLAY_MIN) return 'live';
        return 'post';
      }
      function cutoffOf(m) {
        var ko = koOf(m);
        return ko ? new Date(ko.getTime() - CUTOFF_MIN * 60000) : null;
      }
      function countdownLabel(ms) {
        if (ms == null || ms <= 0) return 'Locked';
        var mins = Math.ceil(ms / 60000);
        var d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), mm = mins % 60;
        if (d > 0) return d + 'd ' + h + 'h';
        if (h > 0) return h + 'h ' + mm + 'm';
        return mm + 'm';
      }
      function outcome(h, a) { return h > a ? 'H' : (h < a ? 'A' : 'D'); }
      // Counting model — no points. 'exact' implies a correct result too.
      function verdictOf(predH, predA, realH, realA) {
        if (predH == null || predA == null || realH == null || realA == null) return null;
        if (predH === realH && predA === realA) return 'exact';
        if (outcome(predH, predA) === outcome(realH, realA)) return 'result';
        return 'wrong';
      }
      function isOwnTeamMatch(m, reg) {
        return reg && (m.attributes.homeTeam.teamID === reg.teamId || m.attributes.awayTeam.teamID === reg.teamId);
      }
      function monthOfMatchday(mdKey) { return String(mdKey || '').slice(0, 7); } // 'YYYY-MM'
      // Our OWN cumulative tally across the whole season, one month, or a single
      // matchday (the leaderboard's lbScope/lbMonth/lbDay state).
      // results = correct W/D/L (includes exacts); exacts = exact scorelines.
      //
      // This used to run for every fan, to build the leaderboard in the browser.
      // It now runs for one — the signed-in fan — because everyone else's numbers
      // arrive pre-computed. It is kept because a fan with nothing settled yet is
      // absent from the aggregate and still deserves to see their own row.
      function myTally(now) {
        var byDay = state.myPreds || {};
        var t = { results: 0, exacts: 0, settled: 0 };
        for (var i = 0; i < state.allMatches.length; i++) {
          var m = state.allMatches[i];
          var md = matchMatchdayKey(m);
          if (state.lbScope === 'month' && monthOfMatchday(md) !== state.lbMonth) continue;
          if (state.lbScope === 'day' && md !== state.lbDay) continue;
          var p = byDay[md] && byDay[md][m.id];
          if (!p) continue;
          if (stateOf(m, now) !== 'post') continue;
          var v = verdictOf(p.home, p.away, m.attributes.homeTeam.score, m.attributes.awayTeam.score);
          if (v == null) continue;
          t.settled += 1;
          if (v === 'exact') { t.exacts += 1; t.results += 1; }
          else if (v === 'result') { t.results += 1; }
        }
        return t;
      }

      // ---------- fetch fixtures ----------
      // ---------- multi-competition lookup ----------
      // Build a teamId -> competitionID map by walking allMatches.
      var teamCompCache = null;
      function buildTeamCompMap() {
        teamCompCache = {};
        (state.allMatches || []).forEach(function (m) {
          var c = m.attributes.competitionID;
          if (m.attributes.homeTeam && m.attributes.homeTeam.teamID) teamCompCache[m.attributes.homeTeam.teamID] = c;
          if (m.attributes.awayTeam && m.attributes.awayTeam.teamID) teamCompCache[m.attributes.awayTeam.teamID] = c;
        });
      }
      function teamCompId(teamId) {
        if (!teamCompCache) buildTeamCompMap();
        return teamCompCache[teamId] || null;
      }
      function userCompId() {
        if (!state.registration) return null;
        return teamCompId(state.registration.teamId) || DEFAULT_COMP_ID;
      }
      function compWideLogoUrl(compId) {
        var c = COMPS[compId] || COMPS[DEFAULT_COMP_ID];
        return 'https://raw.githubusercontent.com/thenationalleague/tools/main/assets/divisions/' + c.shortName + '-wide.png';
      }
      function compName(compId) {
        var c = COMPS[compId] || COMPS[DEFAULT_COMP_ID];
        return c.name;
      }

      // ---------- clubs-meta (season + club colours) ----------
      function loadClubsMeta() {
        return fetch(CLUBS_META_URL)
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (meta) {
            state.seasonId = (meta && meta.seasons && meta.seasons.current) || null;
            var map = {}, names = {};
            ((meta && meta.clubs) || []).forEach(function (c) {
              if (!c || !c.optaID) return;
              if (c.colors) map[c.optaID] = c.colors;
              names[c.optaID] = { short: c.short || c.name || '', code: c.code || '' };
            });
            state.clubColours = map;
            state.clubNames = names;
          })
          .catch(function () { /* soft-fail: SEASON_ID fallback, navy hero */ });
      }

      // ---------- fetch fixtures (all 3 competitions in parallel) ----------
      function fetchFixtures() {
        return Promise.all(COMP_IDS.map(fetchCompetition))
          .then(function (results) {
            var all = [].concat.apply([], results);
            // Sort by KO; matchday/comp filtering happens in recomputeMatchday()
            return all.sort(function (a, b) { return dateOf(a).localeCompare(dateOf(b)); });
          });
      }
      function fetchCompetition(compId) {
        var all = [];
        function page(n) {
          var url = API_BASE + '/matches/?competitionID=' + compId + '&seasonID=' + (state.seasonId || SEASON_ID) +
                    '&sort=kickOffDateUTC&page.number=' + n + '&page.size=100';
          return fetch(url, { credentials:'omit' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' (comp ' + compId + ')'); return r.json(); })
            .then(function (json) {
              var d = (json && json.data) || [];
              all = all.concat(d);
              var total = json && json.meta && json.meta.totalCount;
              if (d.length === 100 && (total == null || all.length < total) && n < MAX_PAGES) return page(n + 1);
            });
        }
        return page(1).then(function () { return all; });
      }

      // ---------- registration ----------
      // Returns the full team list across all 3 NL divisions, grouped by competition.
      function teamOptionsByComp() {
        var byComp = {}; // compId -> { teamId -> teamObj }
        (state.allMatches || []).forEach(function (m) {
          var c = m.attributes.competitionID;
          if (!byComp[c]) byComp[c] = {};
          [m.attributes.homeTeam, m.attributes.awayTeam].forEach(function (t) {
            if (!byComp[c][t.teamID]) {
              byComp[c][t.teamID] = { id: t.teamID, name: t.name, shortName: t.shortName, crest: t.crest, compId: c };
            }
          });
        });
        // Convert to ordered arrays per comp, comps in fixed order
        var grouped = [];
        COMP_IDS.forEach(function (c) {
          if (!byComp[c]) return;
          var arr = Object.keys(byComp[c]).map(function (id) { return byComp[c][id]; });
          arr.sort(function (a, b) { return a.name.localeCompare(b.name); });
          grouped.push({ compId: c, name: COMPS[c].name, teams: arr });
        });
        return grouped;
      }
      // Flat list of every team (used to find a team by id at submit time).
      function allTeamsFlat() {
        var grouped = teamOptionsByComp();
        var flat = [];
        grouped.forEach(function (g) { flat = flat.concat(g.teams); });
        return flat;
      }
      function renderRegistration() {
        main.hidden = true; register.hidden = false;
        var grouped = teamOptionsByComp();
        var flat    = allTeamsFlat();
        // Try to default-select the user's TC favourite team if it exists across any division
        var defaultId = '';
        if (state.user.favTeamName) {
          var hit = flat.filter(function (o) { return o.name.toLowerCase() === state.user.favTeamName.toLowerCase(); })[0];
          if (hit) defaultId = hit.id;
        }
        var optgroupHTML = grouped.map(function (g) {
          return '<optgroup label="' + $h(g.name) + '">' +
            g.teams.map(function (o) {
              return '<option value="' + $h(o.id) + '"' + (o.id === defaultId ? ' selected' : '') + '>' + $h(o.name) + '</option>';
            }).join('') +
          '</optgroup>';
        }).join('');
        register.innerHTML =
          '<div class="nlsp__register-card">' +
            '<div class="nlsp__hero" style="padding:0;">' +
              '<h1>Welcome, ' + $h(state.user.forename) + '</h1>' +
            '</div>' +
            '<p style="color:var(--text-muted);font-size:14px;margin:6px 0 0;">' +
              'Pick your club from the National, North or South division. Their match leads your predictions each matchday, and you\'ll appear on the leaderboard as ' +
              '<b>' + $h(state.user.forename) + ' ' + $h(state.user.surnameInitial || '') + '</b>.' +
            '</p>' +
            '<label for="nlsp-team-select">Your team</label>' +
            '<select id="nlsp-team-select">' +
              '<option value="">— choose a team —</option>' +
              optgroupHTML +
            '</select>' +
            '<div class="nlsp__lockwarn">This locks for the season. Pick carefully — you can\'t change your team later.</div>' +
            '<button class="nlsp__btn" id="nlsp-register-btn"' + (defaultId ? '' : ' disabled') + '>Confirm and lock my team</button>' +
          '</div>';

        var sel = document.getElementById('nlsp-team-select');
        var btn = document.getElementById('nlsp-register-btn');
        sel.addEventListener('change', function () { btn.disabled = !sel.value; });
        btn.addEventListener('click', function () {
          var teamId = sel.value; if (!teamId) return;
          var team = flat.filter(function (o) { return o.id === teamId; })[0];
          if (!team) return;
          btn.disabled = true; btn.textContent = 'Saving…';
          // Deliberately minimal: forename + surname initial only — the record is
          // readable by every widget client, so no email / full surname here.
          var payload = {
            teamId: team.id, teamName: team.name, crestUrl: team.crest || '',
            forename: state.user.forename, surnameInitial: state.user.surnameInitial,
            registeredAt: firebase.database.ServerValue.TIMESTAMP
          };
          fbDb.ref('users/' + state.user.id).set(payload).catch(function (err) {
            btn.disabled = false; btn.textContent = 'Confirm and lock my team';
            showBanner('Could not save registration: ' + err.message, 'err');
          });
        });
      }

      // ---------- date selector (matchday navigator) ----------
      // Horizontally scrollable strip of every matchday in the season. Default
      // selection is today (in BST) if any matches today, otherwise the next
      // upcoming matchday. Click a pill to navigate; the active pill scrolls
      // into view automatically.
      function renderDatebar() {
        var keys = uniqueMatchdayKeys();
        if (!keys.length) { datebarEl.innerHTML = ''; return; }
        var active = currentMatchdayKey();
        var today  = bstDateOf(new Date());
        datebarEl.className = 'nlsp__datebar';
        datebarEl.innerHTML = keys.map(function (k) {
          var d = new Date(k + 'T12:00:00Z');
          var label = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', timeZone:'Europe/London' });
          var cls = '';
          if (k === active) cls += ' is-active';
          if (k === today)  cls += ' is-today';
          return '<button data-md="' + $h(k) + '" class="' + cls.trim() + '">' + $h(label) + '</button>';
        }).join('');
        Array.prototype.forEach.call(datebarEl.querySelectorAll('button'), function (b) {
          b.addEventListener('click', function () {
            setSelectedMatchday(b.getAttribute('data-md'));
          });
        });
        enableDragScroll(datebarEl);
        // Centre the active pill in view
        var activeBtn = datebarEl.querySelector('button.is-active');
        if (activeBtn && activeBtn.scrollIntoView) {
          try { activeBtn.scrollIntoView({ behavior:'auto', inline:'center', block:'nearest' }); } catch (e) {}
        }
      }

      // Hold-and-drag horizontal scroll for any container. Doesn't interfere
      // with native click on child buttons unless the user actually drags
      // (>5px movement) — in which case the subsequent click is suppressed.
      function enableDragScroll(el) {
        if (el.__nlspDragWired) return;
        el.__nlspDragWired = true;
        var down = false, startX = 0, startScroll = 0, didScroll = false;

        el.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          down = true; didScroll = false;
          startX = e.pageX;
          startScroll = el.scrollLeft;
          // NB: don't add is-dragging here — would set pointer-events:none on
          // child buttons immediately and on some browsers swallows the click
          // that arrives a few ms later. Only add it once we actually scroll.
        });

        document.addEventListener('mousemove', function (e) {
          if (!down) return;
          var dx = e.pageX - startX;
          if (Math.abs(dx) < 15) return; // generous deadzone
          e.preventDefault();
          el.scrollLeft = startScroll - dx;
          if (!didScroll) {
            didScroll = true;
            el.classList.add('is-dragging');
          }
        });

        document.addEventListener('mouseup', function () {
          if (!down) return;
          down = false;
          el.classList.remove('is-dragging');
        });

        // Capture-phase suppression — fires only when we actually scrolled,
        // so a clean click on a pill is never blocked.
        el.addEventListener('click', function (e) {
          if (didScroll) { e.stopPropagation(); e.preventDefault(); }
          didScroll = false;
        }, true);
      }

      // ---------- greeting ----------
      // Greeting ribbon (small caps) + matchday date. The own-club emphasis
      // lives in the club-coloured hero card at the top of the fixtures.
      function renderHero() {
        var key = currentMatchdayKey();
        var midday = new Date(key + 'T12:00:00Z');
        var dateLabel = midday.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', timeZone:'Europe/London' });
        // Greeting drops the team name now that the team crest lives in the header.
        var parts = [ $h((state.user.forename || '').toUpperCase()) ];
        hero.className = 'nlsp__hero';
        hero.innerHTML =
          '<div class="nlsp__greetline">' + parts.join(' · ') + '</div>' +
          '<h1>' + $h(dateLabel) + '</h1>';
      }

      // ---------- status bar ----------
      // The X/12 PREDICTED status bar is removed. The submit-bar count + the
      // per-row state already convey the same info more naturally.
      function renderStatus() { statusbar.innerHTML = ''; }

      // ---------- fixture rendering ----------
      function emptyStateHTML(title, body) {
        return '<div class="nlsp__empty">' +
          '<div class="nlsp__empty-title">' + $h(title) + '</div>' +
          (body ? '<div class="nlsp__empty-body">' + $h(body) + '</div>' : '') +
        '</div>';
      }
      function renderFixtures() {
        if (!state.matches.length) {
          var boundary = seasonBoundary();
          var keys = uniqueMatchdayKeys();
          var compNm = compName(userCompId() || DEFAULT_COMP_ID);
          var firstD = keys[0] ? new Date(keys[0] + 'T12:00:00Z')
                                  .toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', timeZone:'Europe/London' }) : '';
          var lastD  = keys[keys.length - 1] ? new Date(keys[keys.length - 1] + 'T12:00:00Z')
                                  .toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', timeZone:'Europe/London' }) : '';
          if (boundary === 'before') {
            fixtures.innerHTML = emptyStateHTML(
              'Predictor not available yet',
              compNm + ' kicks off on ' + firstD + '. Predictions open seven days before each match.'
            );
          } else if (boundary === 'after') {
            fixtures.innerHTML = emptyStateHTML(
              'Season ended',
              compNm + ' wrapped up on ' + lastD + '. See you next season.'
            );
          } else {
            fixtures.innerHTML = emptyStateHTML(
              'No matches on this date',
              'Pick another date above — ' + compNm + ' isn\'t playing on ' + $h(currentMatchdayKey()) + '.'
            );
          }
          return;
        }
        var now = simNow();
        // KOs beyond the 7-day window are hidden outright (no wall of locked
        // rows to go nuts on). A matchday that hasn't opened at all shows a
        // single "opens on" card instead.
        var visible = state.matches.filter(function (m) { return stateOf(m, now) !== 'future'; });
        if (!visible.length) {
          var firstKo = koOf(state.matches[0]);
          var opens = firstKo ? new Date(firstKo.getTime() - EDIT_WINDOW_HOURS * 3600000) : null;
          var opensLabel = opens
            ? opens.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', timeZone:'Europe/London' })
            : 'one week before kick-off';
          fixtures.innerHTML = emptyStateHTML(
            'Predictions not open yet',
            'This matchday opens on ' + opensLabel + ' — one week before kick-off.'
          );
          renderedStateSig = stateSig(now);
          return;
        }
        // Soft hero: the fan's own club's fixture leads the matchday as a large
        // card; the rest are boxed together by kick-off time, one countdown per
        // KO group (e.g. 12:30 / 15:00 / 17:30 on the same day = 3 boxes).
        var reg = state.registration;
        var own = null, rest = [];
        visible.forEach(function (m) {
          if (!own && isOwnTeamMatch(m, reg)) own = m;
          else rest.push(m);
        });
        var groups = [], byKo = {};
        rest.forEach(function (m) {
          var k = fmtBST(koOf(m)) || 'TBC';
          if (!byKo[k]) { byKo[k] = []; groups.push(k); }
          byKo[k].push(m);
        });
        fixtures.innerHTML =
          (own ? rowHTML(own, now, true) : '') +
          groups.map(function (k) {
            return '<div class="nlsp__kogroup">' +
              '<div class="nlsp__kohead">' +
                '<span>' + $h(k) + ' kick-off' + (byKo[k].length > 1 ? 's' : '') + '</span>' +
                koGroupStatusHTML(byKo[k], now) +
              '</div>' +
              byKo[k].map(function (m) { return rowHTML(m, now, false); }).join('') +
            '</div>';
          }).join('');
        renderedStateSig = stateSig(now);
        wireRow();
      }

      // One status chip per KO group: countdown to the cutoff while editable,
      // then Locked / Live / Full time. Postponed/abandoned members don't drive
      // the group state unless the whole group is void.
      function koGroupStatusHTML(list, now) {
        var rep = null;
        for (var i = 0; i < list.length; i++) {
          var s = stateOf(list[i], now);
          if (s !== 'postponed' && s !== 'abandoned') { rep = s; break; }
        }
        if (rep === 'pre') {
          var cut = cutoffOf(list[0]);
          return '<span class="nlsp__countdown" data-cutoff="' + (cut ? cut.toISOString() : '') + '">' +
            'Predictions lock in ' + countdownLabel(cut ? cut - now : null) + '</span>';
        }
        if (rep === 'locked') return '<span class="nlsp__kostatus">Predictions locked</span>';
        if (rep === 'live')   return '<span class="nlsp__kostatus is-live">Live</span>';
        if (rep === 'post')   return '<span class="nlsp__kostatus">Full time</span>';
        if (rep === 'unresolved') return '<span class="nlsp__kostatus">Awaiting results</span>';
        return '<span class="nlsp__kostatus">Postponed</span>';
      }

      // Signature of every match's state at 'now' — the ticker re-renders when
      // this changes (a cutoff or KO crossed) and only refreshes countdown text
      // otherwise.
      var renderedStateSig = '';
      function stateSig(now) {
        return state.matches.map(function (m) { return stateOf(m, now); }).join(',');
      }
      var tickN = 0;
      function startTicker() {
        setInterval(function () {
          if (main.hidden) return;
          tickN++;
          var now = simNow();
          // While play is in flight on the visible matchday, refetch from NLS
          // every 2 minutes so matchPeriod/scores settle without a reload.
          // 'unresolved' keeps polling too — that's how a stalled or abandoned
          // match heals itself once NLS publishes a real final period.
          var inFlight = state.matches.some(function (m) {
            var s = stateOf(m, now);
            return s === 'live' || s === 'locked' || s === 'unresolved';
          });
          if (inFlight && tickN % 4 === 0) {
            fetchFixtures().then(function (ms) {
              state.allMatches = ms;
              teamCompCache = null;
              recomputeMatchday();
              renderAll();
            }).catch(function () {});
            return;
          }
          // Re-read the aggregate every few minutes. It is rebuilt every 15, so
          // this is not a live feed and does not need to behave like one — but a
          // fan who leaves the page open through a Saturday should still see the
          // table move. Cache-busting on purpose: the cached copy is the stale one.
          if (tickN % 10 === 0 && state.fbAuthed) {
            state.lbCache = {};
            loadLeaderboard(true);
          }
          if (stateSig(now) !== renderedStateSig) { recomputeMatchday(); renderAll(); return; }
          Array.prototype.forEach.call(fixtures.querySelectorAll('[data-cutoff]'), function (el) {
            var iso = el.getAttribute('data-cutoff');
            if (iso) el.textContent = 'Predictions lock in ' + countdownLabel(new Date(iso) - now);
          });
        }, 30000);
      }

      function rowHTML(m, now, hero) {
        var a = m.attributes;
        var s = stateOf(m, now);
        var ko = koOf(m);
        var p = state.predictions[m.id];
        var d = state.drafts[m.id];

        // Pre-KO has three sub-states: empty, submitted, editing
        var preState = '';
        if (s === 'pre') {
          if (!p) preState = 'empty';
          else if (state.editing[m.id]) preState = 'editing';
          else preState = 'submitted';
        }

        // -------- Meta strip (top of row) --------
        var meta = '';
        var rowMod = '';
        if (s === 'future') {
          // > 7 days from KO — predictions not yet open
          var dayLabel = ko.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
          meta = '<span class="nlsp__lock">Opens ' + $h(dayLabel) + '</span>';
        } else if (s === 'pre') {
          // KO time lives in the group head now (or the hero top strip), not on
          // every row — pre rows carry no meta strip. The backed result shows as
          // per-side W/D/L boxes on the team lines instead.
          if (hero) {
            var cut = cutoffOf(m);
            meta = '<span>' + $h(fmtBST(ko)) + '</span>' +
              '<span class="nlsp__countdown" data-cutoff="' + (cut ? cut.toISOString() : '') + '" style="margin-left:auto;">' +
                'Predictions lock in ' + countdownLabel(cut ? cut - now : null) + '</span>';
          } else {
            meta = '';
          }
        } else if (s === 'locked') {
          var pickLocked = (p && p.home != null)
            ? '<span class="nlsp__pickline">Your pick <b>' + p.home + '–' + p.away + '</b></span>'
            : '<span class="nlsp__pickline" style="opacity:.7;">No prediction</span>';
          meta = (hero ? '<span class="nlsp__lock">Predictions locked</span>' : '') + pickLocked;
        } else if (s === 'live') {
          // No meta row at all — the live badge, the minute and the prediction
          // all share the one footer strip below, so a live row costs no more
          // vertical space than a pre-KO one.
          meta = '';
        } else if (s === 'post') {
          var realH = a.homeTeam.score, realA = a.awayTeam.score;
          var v = (p && p.home != null) ? verdictOf(p.home, p.away, realH, realA) : null;
          if (v != null) {
            rowMod = v === 'exact' ? ' is-exact' : v === 'result' ? ' is-right' : ' is-wrong';
            // No points any more — the pill names the verdict. Wrong gets no
            // pill; the muted row tint says enough.
            var pill = v === 'exact'  ? '<span class="nlsp__pts is-exact">Exact score</span>'
                     : v === 'result' ? '<span class="nlsp__pts is-right">Right result</span>'
                     : '';
            meta =
              '<span class="nlsp__ftlabel">FT</span>' +
              '<span class="nlsp__pickline">Your pick <b>' + p.home + '–' + p.away + '</b>' + (v === 'wrong' ? ' · Wrong' : '') + '</span>' +
              pill;
          } else {
            meta = '<span class="nlsp__ftlabel">FT</span><span class="nlsp__pickline" style="opacity:.7;">No prediction</span>';
          }
        } else if (s === 'postponed' || s === 'abandoned') {
          // No meta strip at all. The P (or A) in the score column and the faded
          // row say it; "Postponed · Prediction voided" alongside them was the
          // same fact three times.
          rowMod = ' is-void';
        } else if (s === 'unresolved') {
          // In-play period that never moved on — abandoned, or a stalled feed.
          // Not scored while it sits here; resolves itself on the next fetch
          // that carries a real final period.
          meta = '<span class="nlsp__voidlbl">Awaiting result</span><span class="nlsp__pickline" style="opacity:.7;">Not counted</span>';
          rowMod = ' is-void';
        }

        // -------- Score cell renderer (per side) --------
        function scoreCell(side) {
          var real, cls = 'nlsp__teamscore';
          if (s === 'pre' && (preState === 'empty' || preState === 'editing')) {
            // Stepper, buttons only — no free text (24 keyboards per matchday is
            // a faff on a phone). Starts at 0; − greys at 0, + greys at 9. A row
            // only counts as set once the fan has tapped it (see wireRow).
            var val = (d && d[side] != null) ? d[side] : (p && p[side] != null ? p[side] : 0);
            var teamName_ = (side === 'home' ? a.homeTeam : a.awayTeam).name;
            return '<div class="nlsp__step" data-side="' + side + '" data-m="' + $h(m.id) + '">' +
              '<button type="button" data-step="-1" aria-label="' + $h(teamName_ + ' score down') + '"' + (val <= 0 ? ' disabled' : '') + '>&minus;</button>' +
              '<span class="nlsp__stepval">' + val + '</span>' +
              '<button type="button" data-step="1" aria-label="' + $h(teamName_ + ' score up') + '"' + (val >= MAX_GOALS ? ' disabled' : '') + '>+</button>' +
            '</div>';
          }
          if (s === 'pre' && preState === 'submitted') {
            return '<div class="' + cls + ' is-pred">' + (p && p[side] != null ? p[side] : '–') + '</div>';
          }
          // locked: show the user's prediction (muted) until KO
          if (s === 'locked') {
            return '<div class="' + cls + ' is-pred">' + (p && p[side] != null ? p[side] : '–') + '</div>';
          }
          // live: the ACTUAL live score, bold — the pick lives in the meta strip
          if (s === 'live') {
            real = (side === 'home' ? a.homeTeam : a.awayTeam).score;
            return '<div class="' + cls + '">' + (real != null ? real : '–') + '</div>';
          }
          /* Called off: the printed-grid letter where the score would be — P for
             postponed, A for abandoned — instead of a sentence. It carries the
             meaning on its own to anyone who has read a results grid, and the
             row's own fade says the rest.

             One per line, in the score column and at the score's own size, so it
             lines up with the numbers on every other row. wdlBox() renders a
             spacer for these rows to hold that column open. The full wording
             lives in the title and aria-label, so nothing is lost to a screen
             reader or a hover. */
          if (s === 'postponed' || s === 'abandoned') {
            var letter = s === 'postponed' ? 'P' : 'A';
            var label  = (s === 'postponed' ? 'Postponed' : 'Abandoned') + ' — prediction voided';
            return '<div class="' + cls + ' is-void" title="' + label + '" aria-label="' + label + '">' +
                   letter + '</div>';
          }
          if (s === 'future' || s === 'unresolved') {
            // No trustworthy scoreline — an abandoned match's last score is not
            // a result, so don't assert one.
            return '<div class="' + cls + ' is-pred">–</div>';
          }
          // post: show the real final score
          real = (side === 'home' ? a.homeTeam : a.awayTeam).score;
          return '<div class="' + cls + '">' + (real != null ? real : '?') + '</div>';
        }

        // -------- W/D/L box (per side) --------
        // Fixed-width letter chip next to each score: grey D by default (rows
        // start 0–0), flipping to green W / red L as the scoreline moves. No
        // text pills — the row never widens.
        function wdlBox(side) {
          var v = null;
          if (s === 'pre') {
            v = (d && d.home != null && d.away != null) ? d
              : (p && p.home != null) ? p
              : { home: 0, away: 0 };
          } else if (s === 'locked' && p && p.home != null) {
            // live rows show the real score, so pick-boxes would mislead there
            v = p;
          }
          /* A called-off row has no prediction outcome to show, but it still needs
             the column: without it the score cell slides left into the gap and
             the P sits somewhere the numbers never do. An empty box of the same
             size keeps every row's score in one line down the page. */
          if (s === 'postponed' || s === 'abandoned') {
            return '<span class="nlsp__wdlbox is-blank" aria-hidden="true"></span>';
          }
          if (!v) return '';
          var o = outcome(v.home, v.away);
          var letter = o === 'D' ? 'D' : ((o === 'H') === (side === 'home') ? 'W' : 'L');
          var cls = letter === 'W' ? ' is-w' : letter === 'L' ? ' is-l' : '';
          var word = letter === 'W' ? 'Win' : letter === 'L' ? 'Loss' : 'Draw';
          return '<span class="nlsp__wdlbox' + cls + '" title="' + word + '" aria-label="' + word + '">' + letter + '</span>';
        }

        // -------- Team line --------
        function teamLine(t, side) {
          var full  = t.name || t.shortName || '';
          var short = t.shortName || t.name || '';
          return '<div class="nlsp__teamline">' +
            crestImg(t.crest, full) +
            '<span class="nlsp__tname">' +
              '<span class="nlsp__tname-full">'  + $h(full)  + '</span>' +
              '<span class="nlsp__tname-short">' + $h(short) + '</span>' +
            '</span>' +
            wdlBox(side) +
            scoreCell(side) +
          '</div>';
        }

        // -------- Row-level affordances --------
        var rowAffordance = '';
        if (s === 'pre' && preState === 'submitted') {
          rowAffordance = '<button class="nlsp__rowedit" data-edit="' + $h(m.id) + '" aria-label="Edit prediction">Edit</button>';
        } else if (s === 'pre' && preState === 'editing') {
          var d2 = state.drafts[m.id] || {};
          var canSave = (d2.home != null && d2.away != null);
          rowAffordance =
            '<div class="nlsp__editcontrols">' +
              '<button class="nlsp__btn-cancel" data-canceledit="' + $h(m.id) + '">Cancel</button>' +
              '<button class="nlsp__btn-save"   data-savedit="'   + $h(m.id) + '"' + (canSave ? '' : ' disabled') + '>Save</button>' +
            '</div>';
        }

        if (hero) {
          // Showcase card: canon navy top strip, then the matchup split into two
          // panels in each club's own colours — an FGR fan sees the opponent's
          // colours too, not a wall of green all season. Its own component, not
          // a .nlsp__row, so verdict tints never fight the club colours. Shares
          // scoreCell + the data-* wiring, so steppers/edit work unchanged.
          var heroSide = function (t, side) {
            var cc = clubPanelColours(t.teamID);
            return '<div class="nlsp__heroside" style="background:' + cc.bg + ';color:' + cc.tx + ';">' +
              crestImg(t.crest, t.name || t.shortName || '') +
              '<span class="nlsp__heroname">' +
                '<span class="nlsp__tname-full">'  + $h(t.name || t.shortName || '')  + '</span>' +
                '<span class="nlsp__tname-short">' + $h(t.shortName || t.name || '') + '</span>' +
              '</span>' +
              scoreCell(side) +
              wdlBox(side) +
            '</div>';
          };
          return '<div class="nlsp__hero-card' + rowMod + '">' +
            (meta ? '<div class="nlsp__hero-top"><div class="nlsp__meta">' + meta + '</div></div>' : '') +
            '<div class="nlsp__heromatch">' +
              heroSide(a.homeTeam, 'home') +
              '<span class="nlsp__herov">v</span>' +
              heroSide(a.awayTeam, 'away') +
            '</div>' +
            (s === 'live' ? livePickFooter(p, a) : '') +
            rowAffordance +
          '</div>';
        }

        var rowCls = 'nlsp__row';
        if (s === 'live') rowCls += ' is-live has-foot';
        if (preState === 'editing') rowCls += ' is-editing';
        if (preState === 'submitted') rowCls += ' has-edit';
        rowCls += rowMod;

        return '<div class="' + rowCls + '">' +
          (meta ? '<div class="nlsp__meta">' + meta + '</div>' : '') +
          teamLine(a.homeTeam, 'home') +
          teamLine(a.awayTeam, 'away') +
          (s === 'live' ? livePickFooter(p, a) : '') +
          rowAffordance +
        '</div>';
      }


      // Neutral strip closing a live row — carries the live badge, the match
      // minute and the prediction on one line ("LIVE 67' · PREDICTION: ALD 1–0
      // FGR"). No verdict word: "on track" reads wrong when you're 1-0 down
      // having predicted 2-1. Team codes make the scoreline readable without
      // repeating the row above.
      function livePickFooter(p, a) {
        var mins = (a.formattedMatchTime && a.formattedMatchTime !== "0'") ? a.formattedMatchTime : '';
        var live = '<span class="nlsp__livedot" aria-hidden="true"></span>' +
                   '<span class="nlsp__footlive">Live' + (mins ? ' ' + $h(mins) : '') + '</span>';
        var pick;
        if (!p || p.home == null) {
          pick = '<span class="nlsp__footpick">No prediction</span>';
        } else {
          var hc = clubCode(a.homeTeam.teamID, a.homeTeam.shortName || a.homeTeam.name);
          var ac = clubCode(a.awayTeam.teamID, a.awayTeam.shortName || a.awayTeam.name);
          pick = '<span class="nlsp__footpick">Prediction: ' +
            $h(hc) + ' ' + p.home + '–' + p.away + ' ' + $h(ac) + '</span>';
        }
        return '<div class="nlsp__rowfoot">' + live + pick + '</div>';
      }

      // A club's panel colours for the hero card, from clubs-meta.json keyed by
      // the NLS teamID (optaID). Values are validated hex; navy canon fallback.
      function clubPanelColours(teamId) {
        var cols = teamId && state.clubColours[teamId];
        var ok = function (v) { return (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) ? v.trim() : null; };
        var c1 = cols && ok(cols.primary);
        if (!c1) return { bg: 'var(--navy)', tx: 'var(--white)' };
        return { bg: c1, tx: pickTextColor(c1) };
      }
      function pickTextColor(hex) {
        var c = String(hex || '').replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(c)) return 'var(--white)';
        var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.68 ? 'var(--text)' : 'var(--white)';
      }

      function wireRow() {
        // Stepper buttons. First tap on a row initialises the draft with BOTH
        // sides at their displayed values, so one tap marks the whole row as
        // set (the untouched side commits at its shown 0).
        Array.prototype.forEach.call(fixtures.querySelectorAll('.nlsp__step button[data-step]'), function (b) {
          b.addEventListener('click', function () {
            var wrap = b.parentNode;
            var mid  = wrap.getAttribute('data-m');
            var side = wrap.getAttribute('data-side');
            var p = state.predictions[mid];
            var d = state.drafts[mid] || {};
            var cur = {
              home: d.home != null ? d.home : (p && p.home != null ? p.home : 0),
              away: d.away != null ? d.away : (p && p.away != null ? p.away : 0)
            };
            cur[side] = Math.max(0, Math.min(MAX_GOALS, cur[side] + parseInt(b.getAttribute('data-step'), 10)));
            state.drafts[mid] = cur;
            renderFixtures(); renderSubmitbar(); renderStatus();
          });
        });

        // Per-row Edit (re-open a submitted row)
        Array.prototype.forEach.call(fixtures.querySelectorAll('button[data-edit]'), function (b) {
          b.addEventListener('click', function () {
            var mid = b.getAttribute('data-edit');
            state.editing[mid] = true;
            var existing = state.predictions[mid];
            if (existing) state.drafts[mid] = { home: existing.home, away: existing.away };
            renderFixtures(); renderSubmitbar(); renderStatus();
            var first = fixtures.querySelector('input[data-m="' + mid + '"][data-side="home"]');
            if (first) { first.focus(); first.select && first.select(); }
          });
        });

        // Cancel edit — discard draft, return to locked view
        Array.prototype.forEach.call(fixtures.querySelectorAll('button[data-canceledit]'), function (b) {
          b.addEventListener('click', function () {
            var mid = b.getAttribute('data-canceledit');
            delete state.editing[mid];
            delete state.drafts[mid];
            renderFixtures(); renderSubmitbar(); renderStatus();
          });
        });

        // Save edited prediction — explicit commit
        Array.prototype.forEach.call(fixtures.querySelectorAll('button[data-savedit]'), function (b) {
          b.addEventListener('click', function () {
            var mid = b.getAttribute('data-savedit');
            saveEdited(mid);
          });
        });
      }

      function saveEdited(mid) {
        var d = state.drafts[mid]; if (!d) return;
        if (d.home == null || d.away == null) return;
        var m = state.matches.filter(function (x) { return x.id === mid; })[0];
        if (!m || stateOf(m, simNow()) !== 'pre') return;

        // Clear edit state up front so concurrent RTDB listener re-renders don't
        // race against us and leave the row stuck in the editor (this was the
        // actual save-doesn't-close bug — listener fired before .then() and saw
        // state.editing[mid] still true).
        delete state.editing[mid];

        var existing = state.predictions[mid];
        if (existing && existing.home === d.home && existing.away === d.away) {
          delete state.drafts[mid];
          renderFixtures(); renderSubmitbar(); renderReset();
          return;
        }
        var payload = {
          home: d.home, away: d.away,
          submittedAt: firebase.database.ServerValue.TIMESTAMP
        };
        fbDb.ref('predictions/' + state.user.id + '/' + currentMatchdayKey() + '/' + mid).update(payload)
          .then(function () {
            delete state.drafts[mid];
            renderFixtures(); renderSubmitbar(); renderReset();
          })
          .catch(function (err) {
            // Restore edit state if RTDB rejected the write
            state.editing[mid] = true;
            renderFixtures();
            showBanner('Save failed: ' + err.message, 'err');
          });
      }

      // Returns the matchIds that are 'awaiting' (no committed prediction, still pre-KO)
      function awaitingIds() {
        var now = simNow();
        var ids = [];
        state.matches.forEach(function (m) {
          if (stateOf(m, now) !== 'pre') return;
          if (state.predictions[m.id]) return; // already submitted
          ids.push(m.id);
        });
        return ids;
      }
      // No "x/y set" counter. It counted rows the fan had TAPPED, but submit
      // sends every open fixture at its displayed value — so leaving a genuine
      // 0–0 pick alone read as "11/12 set" and then submitted 12, which is why it
      // is gone rather than corrected.
      function renderSubmitbar() {
        var await_ids = awaitingIds();
        if (await_ids.length) {
          submitb.innerHTML =
            '<div class="nlsp__submitbar">' +
              '<button class="nlsp__btn" id="nlsp-submit">Submit ' +
                await_ids.length + ' prediction' + (await_ids.length === 1 ? '' : 's') +
              '</button>' +
            '</div>';
          var btn = document.getElementById('nlsp-submit');
          if (btn) btn.addEventListener('click', submitAllAwaiting);
          return;
        }
        /* Nothing left to submit. If the fan has predictions in for this matchday
           and it has not kicked off, say so here rather than flashing a banner at
           the top of the page — the answer to "did that save?" should be where
           the button they pressed used to be. The reset link sits just below,
           which is the next thing they might want and nothing sooner. */
        var n = Object.keys(state.predictions).length;
        if (!n || !allMatchesPreKO()) { submitb.innerHTML = ''; return; }
        submitb.innerHTML =
          '<div class="nlsp__submitbar is-saved">' +
            '<span class="nlsp__savedpill">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" ' +
                'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                '<polyline points="20 6 9 17 4 12"/></svg>' +
              '<span>' + n + ' prediction' + (n === 1 ? '' : 's') + ' in' +
                '<span class="nlsp__savedsub">Editable until each match kicks off</span>' +
              '</span>' +
            '</span>' +
          '</div>';
      }

      // Submit is WYSIWYG: every open match goes in at its displayed value, so a
      // 0–0 pick is just... left at 0–0 (no stepper gymnastics). No confirm step:
      // predictions stay editable until each match's own cutoff, so submitting is
      // a lock-in rather than a commitment, and a modal in front of it is
      // ceremony on a reversible action.
      function submitAllAwaiting() {
        var ids = awaitingIds();
        if (!ids.length) return;
        var updates = {};
        var ts = firebase.database.ServerValue.TIMESTAMP;
        ids.forEach(function (mid) {
          var d = state.drafts[mid];
          if (d && d.home != null && d.away != null) {
            updates[mid] = { home: d.home, away: d.away, submittedAt: ts };
          } else {
            updates[mid] = { home: 0, away: 0, submittedAt: ts };
          }
        });
        function doWrite() {
          var btn = document.getElementById('nlsp-submit');
          if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
          fbDb.ref('predictions/' + state.user.id + '/' + currentMatchdayKey()).update(updates)
            .then(function () {
              Object.keys(updates).forEach(function (mid) { delete state.drafts[mid]; });
            })
            .catch(function (err) {
              showBanner('Submit failed: ' + err.message, 'err');
              if (btn) { btn.disabled = false; btn.textContent = 'Submit predictions'; }
            });
        }
        doWrite();
      }

      // ---------- custom confirm modal ----------
      // Replaces window.confirm() for actions like "Reset all predictions".
      var modalEl = document.getElementById('nlsp-modal');
      function showConfirm(opts) {
        return new Promise(function (resolve) {
          modalEl.innerHTML =
            '<div class="nlsp__modal-card" role="dialog" aria-modal="true">' +
              '<h3>' + $h(opts.title || 'Are you sure?') + '</h3>' +
              (opts.message ? '<p>' + $h(opts.message) + '</p>' : '') +
              '<div class="nlsp__modal-actions">' +
                '<button class="nlsp__modal-cancel"  type="button">' + $h(opts.cancel || 'Cancel') + '</button>' +
                '<button class="nlsp__modal-confirm" type="button">' + $h(opts.confirm || 'Confirm') + '</button>' +
              '</div>' +
            '</div>';
          modalEl.hidden = false;
          function close(result) {
            modalEl.hidden = true;
            modalEl.innerHTML = '';
            resolve(result);
          }
          modalEl.querySelector('.nlsp__modal-cancel').addEventListener('click', function () { close(false); });
          modalEl.querySelector('.nlsp__modal-confirm').addEventListener('click', function () { close(true); });
          // Click backdrop = cancel
          modalEl.addEventListener('click', function (e) { if (e.target === modalEl) close(false); }, { once: true });
        });
      }

      // ---------- reset all predictions ----------
      // Shown only while every match is still pre-KO — once any has kicked off,
      // the matchday is effectively settled in stages and "reset all" stops
      // making sense.
      function allMatchesPreKO() {
        var now = simNow();
        for (var i = 0; i < state.matches.length; i++) {
          var s = stateOf(state.matches[i], now);
          // future / pre = not yet kicked off, so still resettable.
          // live / post / postponed / abandoned all freeze the matchday.
          if (s !== 'pre' && s !== 'future') return false;
        }
        return state.matches.length > 0;
      }
      function renderReset() {
        var hasAny = Object.keys(state.predictions).length > 0;
        if (!hasAny || !allMatchesPreKO()) { resetEl.innerHTML = ''; return; }
        resetEl.className = 'nlsp__reset';
        resetEl.innerHTML = '<button class="nlsp__resetbtn" id="nlsp-reset-btn">Reset all predictions</button>';
        var btn = document.getElementById('nlsp-reset-btn');
        if (btn) btn.addEventListener('click', function () {
          showConfirm({
            title:   'Reset all predictions?',
            message: 'Wipes every prediction you\'ve made for this matchday. This can\'t be undone.',
            confirm: 'Reset',
            cancel:  'Cancel'
          }).then(function (ok) {
            if (!ok) return;
            btn.disabled = true; btn.textContent = 'Resetting…';
            // The RTDB rules only grant .write at $matchId, not at the parent
            // $matchday. So deleting the whole subtree at once 403s. We instead
            // do a multi-path update of nulls — each individual delete is
            // allowed by the per-$matchId .write rule.
            var nulls = {};
            Object.keys(state.predictions).forEach(function (mid) { nulls[mid] = null; });
            if (Object.keys(nulls).length === 0) {
              state.drafts = {}; state.editing = {};
              setBannerOK('Nothing to reset.');
              return;
            }
            fbDb.ref('predictions/' + state.user.id + '/' + currentMatchdayKey()).update(nulls)
              .then(function () {
                state.drafts = {}; state.editing = {};
              })
              .catch(function (err) {
                showBanner('Reset failed: ' + err.message, 'err');
                btn.disabled = false; btn.textContent = 'Reset all predictions';
              });
          });
        });
      }

      // ---------- league table ----------
      // Every month that has at least one fixture, in season order.
      // Months with at least one finished match — same reasoning as
      // lbMatchdayKeys() below.
      function seasonMonths() {
        var seen = {};
        lbMatchdayKeys().forEach(function (k) {
          var mo = monthOfMatchday(k);
          if (mo) seen[mo] = true;
        });
        return Object.keys(seen).sort();
      }
      function monthLabel(mo) {
        return new Date(mo + '-15T12:00:00Z').toLocaleDateString('en-GB', { month:'long', timeZone:'Europe/London' });
      }
      /* Matchday keys the leaderboard can offer, across ALL competitions (it spans
         fans of every division, unlike the datebar, which is scoped to the user's
         own comp).

         Only periods that have actually produced a result. Offering every date in
         the season made the dropdown a list of futures, each showing everyone on
         nought — which reads as "you scored nothing in March" rather than "March
         has not happened". A period nobody could have scored in is not a period
         worth ranking. */
      function lbMatchdayKeys() {
        var now = simNow();
        var seen = {};
        (state.allMatches || []).forEach(function (m) {
          if (stateOf(m, now) !== 'post') return;
          var k = matchMatchdayKey(m); if (k) seen[k] = true;
        });
        return Object.keys(seen).sort();
      }
      function lbDayLabel(k) {
        return new Date(k + 'T12:00:00Z').toLocaleDateString('en-GB',
          { weekday:'short', day:'numeric', month:'short', timeZone:'Europe/London' });
      }
      // Human label for the leaderboard's active time window.
      function lbScopeLabel() {
        if (state.lbScope === 'month' && state.lbMonth) return monthLabel(state.lbMonth);
        if (state.lbScope === 'day' && state.lbDay) return lbDayLabel(state.lbDay);
        return 'Whole season';
      }
      // Sensible starting selection when a scope is first opened: the window
      // containing the matchday currently in view.
      function lbDefaultMonth() {
        var months = seasonMonths();
        var cur = monthOfMatchday(currentMatchdayKey());
        return months.indexOf(cur) !== -1 ? cur : (months[0] || null);
      }
      function lbDefaultDay() {
        var keys = lbMatchdayKeys();
        var cur = currentMatchdayKey();
        return keys.indexOf(cur) !== -1 ? cur : (keys[0] || null);
      }
      // Competition-style rank labels: first row of a tie group shows the
      // position, the rest show '='; the next distinct group resumes at its
      // true position (1, =, =, 4).
      function rankLabels(rows, sameFn) {
        var labels = [];
        for (var i = 0; i < rows.length; i++) {
          labels.push(i > 0 && sameFn(rows[i - 1], rows[i]) ? '=' : String(i + 1));
        }
        return labels;
      }
      /* ---------- the pre-computed leaderboard ----------
         Standings arrive from leaderboard/, written every 15 minutes by
         scripts/build-leaderboard.js. The widget no longer reads anyone else's
         records to build them: it used to pull the whole users and predictions
         trees, and that root read is what handed every client the full list of
         fan ids. See embeds/auth-hardening-plan.md §4.

         A row carries no id. To find our own we hash our jwtId with the same salt
         the builder used and match on that — it does not reverse, and testing it
         requires already holding the id. */
      var LB_SALT = 'nl-predictor-leaderboard-v1';
      var LB_HASH_LEN = 12;

      function computeMyHash() {
        if (!state.user || !window.crypto || !crypto.subtle) return Promise.resolve(null);
        var bytes = new TextEncoder().encode(LB_SALT + state.user.id);
        return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
          var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
          state.myHash = hex.slice(0, LB_HASH_LEN);
          return state.myHash;
        }).catch(function () { return null; });
      }

      // Which node the current scope needs. One small read per scope rather than
      // the whole tree, so a season with 40-odd matchdays does not arrive on every
      // page load.
      function lbPath() {
        if (state.lbScope === 'month' && state.lbMonth) return 'leaderboard/month/' + state.lbMonth;
        if (state.lbScope === 'day' && state.lbDay) return 'leaderboard/day/' + state.lbDay;
        return 'leaderboard/season';
      }

      /* Fetch once per scope and cache. once() rather than on(): the aggregate
         changes every 15 minutes at most, so a live subscription per scope would
         be a socket held open for nothing. The ticker re-reads periodically. */
      function loadLeaderboard(force) {
        if (!state.fbAuthed) return;
        var path = lbPath();
        if (!force && state.lbCache[path]) {
          state.lbRows = state.lbCache[path];
          state.lbError = false;
          renderTable(); renderClubTable();
          return;
        }
        state.lbLoading = true;
        if (!force) { state.lbRows = null; renderTable(); }
        whenAuthed(function () {
          return fbDb.ref(path).once('value').then(function (snap) {
            var val = snap.val() || {};
            var rows = val.rows || [];
            state.lbCache[path] = rows;
            state.lbRows = rows;
            state.lbError = false;
          }).catch(function () {
            // A denied or failed read must not blank the rest of the widget —
            // predicting still works without a leaderboard.
            state.lbRows = [];
            state.lbError = true;
          }).then(function () {
            state.lbLoading = false;
            renderTable(); renderClubTable();
          });
        });
      }
      // The aggregate is only ever read after auth is confirmed; anything earlier
      // is denied by the rules and would show as an empty table on first paint.
      function whenAuthed(fn) {
        if (fbAuth && fbAuth.currentUser) { fn(); return; }
        var off = fbAuth.onAuthStateChanged(function (u) { if (u) { off(); fn(); } });
      }

      /* Rows for the current view: the aggregate, filtered to our own club if the
         fan asked for that, plus our own row when we are not in it yet. Everyone
         in the aggregate has at least one settled prediction — the builder drops
         the rest — so the "hide zero-settled" rule the widget used to apply is
         already applied upstream. */
      function visibleRows() {
        var all = state.lbRows || [];
        var mine = state.registration;
        var rows = (state.lbMine && mine)
          ? all.filter(function (r) { return r.t === mine.teamId; })
          : all.slice();

        /* Add our own row when the aggregate does not have us yet — a fan with
           nothing settled, or one who predicted in the last quarter of an hour.
           Tested against the FULL aggregate, not the filtered rows: checking the
           filtered set would add a duplicate the moment the my-club filter hid us
           from a view we are in fact in. */
        var inAggregate = state.myHash && all.some(function (r) { return r.h === state.myHash; });
        if (mine && !inAggregate) {
          var t = myTally(simNow());
          rows.push({
            n: ((mine.forename || '') + ' ' + (mine.surnameInitial || '')).trim(),
            c: mine.crestUrl || '', t: mine.teamId || '', tn: mine.teamName || '',
            r: t.results, e: t.exacts, s: t.settled, h: state.myHash || '__me__',
            // Without this our synthetic row sorts as the oldest thing in the
            // table, which is the opposite of the truth: we are here right now.
            j: Date.now(),
          });
        }
        /* Ties break to YOU first, then alphabetically. Before a ball is kicked
           everyone is joint first on nought, and hunting for your own name down an
           alphabetical list of everyone who has entered is a poor greeting. Your
           rank is unchanged — the '=' labels still say it is a tie. */
        /* Level pegging breaks to the most recent activity — a fan's last
           prediction, or their registration if they have not made one. Before a
           ball is kicked everyone is on nought, and A-Z buried whoever had just
           signed up at the bottom of the only table they had seen.

           You still come first inside your own tie: rank unchanged, the '=' still
           says it is level, but you are not hunting for your own name. */
        rows.sort(function (a, b) {
          if (b.r !== a.r) return b.r - a.r;
          if (b.e !== a.e) return b.e - a.e;
          var am = isMyRow(a), bm = isMyRow(b);
          if (am !== bm) return am ? -1 : 1;
          if ((b.j || 0) !== (a.j || 0)) return (b.j || 0) - (a.j || 0);
          return String(a.n).localeCompare(String(b.n));
        });
        return rows;
      }
      function isMyRow(r) {
        return !!(state.myHash && r.h === state.myHash) || r.h === '__me__';
      }
      // Scope chips (Season / Month / Matchday) + contextual select, then the
      // two-state club toggle (all clubs / fans of YOUR club — never a browse-
      // any-club list).
      function filterControlsHTML() {
        var chip = function (label, attrs, on) {
          return '<button type="button" class="nlsp__chip' + (on ? ' is-on' : '') + '" ' + attrs + '>' + label + '</button>';
        };
        /* Before the first result there is nothing to slice, so the narrower
           scopes are not offered at all — a Month chip that opens an empty
           dropdown is worse than no chip. They appear on their own once a match
           has been played. */
        var months = seasonMonths();
        var days = lbMatchdayKeys();
        if (state.lbScope === 'month' && !months.length) state.lbScope = 'season';
        if (state.lbScope === 'day' && !days.length) state.lbScope = 'season';

        var html = '<div class="nlsp__tablefilters">' +
          '<div class="nlsp__chipgroup" id="nlsp-lb-scope" role="group" aria-label="Time period">' +
            chip('Season', 'data-s="season"', state.lbScope === 'season') +
            (months.length ? chip('Month', 'data-s="month"', state.lbScope === 'month') : '') +
            (days.length ? chip('Matchday', 'data-s="day"', state.lbScope === 'day') : '') +
          '</div>';
        if (state.lbScope === 'month') {
          html += '<select id="nlsp-lb-month" aria-label="Month">' +
            months.map(function (mo) {
              return '<option value="' + $h(mo) + '"' + (state.lbMonth === mo ? ' selected' : '') + '>' + $h(monthLabel(mo)) + '</option>';
            }).join('') + '</select>';
        }
        if (state.lbScope === 'day') {
          html += '<select id="nlsp-lb-day" aria-label="Matchday">' +
            days.map(function (k) {
              return '<option value="' + $h(k) + '"' + (state.lbDay === k ? ' selected' : '') + '>' + $h(lbDayLabel(k)) + '</option>';
            }).join('') + '</select>';
        }
        if (state.registration) {
          html += '<div class="nlsp__chipgroup" id="nlsp-lb-club" role="group" aria-label="Club scope">' +
            chip('All clubs', 'data-mine="0"', !state.lbMine) +
            chip(crestImg(state.registration.crestUrl, state.registration.teamName, 16) +
                 $h(clubShort(state.registration.teamId, state.registration.teamName)) + ' fans',
                 'data-mine="1"', state.lbMine) +
          '</div>';
        }
        return html + '</div>';
      }
      function wireFilters() {
        var scopeEl = document.getElementById('nlsp-lb-scope');
        var clubEl  = document.getElementById('nlsp-lb-club');
        var mSel = document.getElementById('nlsp-lb-month');
        var dSel = document.getElementById('nlsp-lb-day');
        if (scopeEl) scopeEl.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button') : null;
          if (!b) return;
          var s = b.getAttribute('data-s');
          if (s === state.lbScope) return;
          state.lbScope = s;
          if (s === 'month' && !state.lbMonth) state.lbMonth = lbDefaultMonth();
          if (s === 'day' && !state.lbDay) state.lbDay = lbDefaultDay();
          // A scope change points at a different aggregate node, so it needs a
          // fetch; the club toggle below only filters rows we already hold.
          state.lbPage = null;
          loadLeaderboard();
        });
        if (clubEl) clubEl.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button') : null;
          if (!b) return;
          state.lbMine = b.getAttribute('data-mine') === '1';
          state.lbPage = null;
          renderTable();
        });
        if (mSel) mSel.addEventListener('change', function () {
          state.lbMonth = mSel.value; state.lbPage = null; loadLeaderboard();
        });
        if (dSel) dSel.addEventListener('change', function () {
          state.lbDay = dSel.value; state.lbPage = null; loadLeaderboard();
        });
      }
      function renderTable() {
        if (!(state.allMatches || []).length) { tableEl.innerHTML = ''; return; }
        var now = simNow();

        var rows = visibleRows();
        /* Rank the WHOLE field, then show a page of it — a rank is a position in
           the table, not a position on the screen, so it must be worked out before
           any slicing or the second page would restart at 1. */
        var ranks = rankLabels(rows, function (a, b) {
          return a.r === b.r && a.e === b.e;
        });

        var pages = Math.max(1, Math.ceil(rows.length / LB_PAGE_SIZE));
        var myIdx = -1;
        for (var mi = 0; mi < rows.length; mi++) { if (isMyRow(rows[mi])) { myIdx = mi; break; } }

        /* Open on the page you are on. A leaderboard you have to hunt through for
           your own name has failed at the only question most people ask of it. */
        if (state.lbPage == null) state.lbPage = myIdx >= 0 ? Math.floor(myIdx / LB_PAGE_SIZE) : 0;
        if (state.lbPage >= pages) state.lbPage = pages - 1;
        if (state.lbPage < 0) state.lbPage = 0;

        var from = state.lbPage * LB_PAGE_SIZE;
        var pageRows = rows.slice(from, from + LB_PAGE_SIZE);
        var pageRanks = ranks.slice(from, from + LB_PAGE_SIZE);

        /* Your row follows you. Off this page, it pins to the edge you are on the
           far side of — above the ten if you rank higher, below if you rank lower
           — so the page always answers "how am I doing against these ten" without
           paging back to find out. On your own page you are simply in place, and
           nothing is pinned: ten rows, or eleven when the eleventh is you. */
        var pinAbove = myIdx >= 0 && myIdx < from;
        var pinBelow = myIdx >= 0 && myIdx >= from + LB_PAGE_SIZE;

        // Three distinct empty states, because they mean different things: still
        // fetching, could not fetch, and genuinely nobody here yet.
        var empty = '';
        if (state.lbRows === null) empty = 'Loading the leaderboard…';
        else if (state.lbError) empty = 'The leaderboard is briefly unavailable — your predictions are safe.';
        else if (rows.length === 0) empty = 'No players in this view yet — try a different period or scope.';

        var inner =
          '<div class="nlsp__tablehead">' +
            '<div class="nlsp__kicker">Leaderboard</div>' +
            filterControlsHTML() +
          '</div>' +
          '<div class="nlsp__thead">' +
            '<span></span><span></span><span></span>' +
            '<span title="Correct result predictions (win/draw/loss)">Results</span>' +
            '<span title="Correct scoreline predictions">Exact</span>' +
            '<span title="Finished matches predicted">Games</span>' +
          '</div>' +
          (empty ? '<div class="nlsp__clubfoot">' + $h(empty) + '</div>' : '') +
          (pinAbove ? trowHTML(rows[myIdx], ranks[myIdx], ' is-pinned is-pinned-top') : '') +
          pageRows.map(function (r, i) {
            return trowHTML(r, pageRanks[i], '');
          }).join('') +
          (pinBelow ? trowHTML(rows[myIdx], ranks[myIdx], ' is-pinned is-pinned-bottom') : '') +
          pagerHTML(rows.length, pages, from, pageRows.length);

        tableEl.className = 'nlsp__table';
        tableEl.innerHTML = inner;
        wireFilters();
        wirePager();
      }

      function trowHTML(r, rank, extraCls) {
        var me = isMyRow(r);
        return '<div class="nlsp__trow' + (me ? ' is-you' : '') + (extraCls || '') + '">' +
          '<span class="nlsp__rank">' + rank + '</span>' +
          crestImg(r.c, r.tn, 22) +
          '<span>' + $h(r.n) + (me ? ' <span class="nlsp__youlbl">(you)</span>' : '') + '</span>' +
          '<span class="nlsp__pts">' + r.r + '</span>' +
          '<span class="nlsp__exacts">' + r.e + '</span>' +
          '<span class="nlsp__games">' + r.s + '</span>' +
        '</div>';
      }

      /* Arrows rather than numbered pages: with everyone who has entered listed,
         the count grows all season, and a row of page numbers would grow with it.
         The label says where you are, which is the part anyone actually reads. */
      function pagerHTML(total, pages, from, shown) {
        if (pages <= 1) return '';
        var atStart = state.lbPage === 0;
        var atEnd = state.lbPage >= pages - 1;
        return '<div class="nlsp__pager">' +
          '<button type="button" class="nlsp__pagebtn" data-page="prev"' +
            (atStart ? ' disabled' : '') + ' aria-label="Previous players">&lsaquo;</button>' +
          '<span class="nlsp__pagelbl">' + (from + 1) + '&ndash;' + (from + shown) +
            ' of ' + total + '</span>' +
          '<button type="button" class="nlsp__pagebtn" data-page="next"' +
            (atEnd ? ' disabled' : '') + ' aria-label="More players">&rsaquo;</button>' +
        '</div>';
      }
      function wirePager() {
        var el = tableEl.querySelector('.nlsp__pager');
        if (!el) return;
        el.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button[data-page]') : null;
          if (!b || b.disabled) return;
          state.lbPage = (state.lbPage || 0) + (b.getAttribute('data-page') === 'next' ? 1 : -1);
          renderTable();
        });
      }

      // ---------- club v club table ----------
      // Accuracy percentage (correct results ÷ settled predictions across the
      // club's fans) so Torquay's fanbase size doesn't drown out Farnham's.
      // Clubs need CLUB_TABLE_MIN_SETTLED settled predictions to rank.
      //
      // Derived from the same rows the leaderboard draws, rather than precomputed
      // separately — two aggregates of the same numbers would eventually disagree,
      // and the version fans noticed would be whichever was wrong. Ignores the
      // my-club filter deliberately: a club table of one club is not a table.
      function renderClubTable() {
        if (!(state.allMatches || []).length) { clubTableEl.innerHTML = ''; return; }
        var byClub = {};
        (state.lbRows || []).forEach(function (r) {
          if (!r.t || !r.s) return;
          var c = byClub[r.t] || (byClub[r.t] = {
            teamId: r.t, teamName: r.tn, crestUrl: r.c,
            fans: 0, results: 0, exacts: 0, settled: 0
          });
          c.fans += 1; c.results += r.r; c.exacts += r.e; c.settled += r.s;
        });
        var clubs = Object.keys(byClub).map(function (id) { return byClub[id]; });
        if (!clubs.length) { clubTableEl.innerHTML = ''; return; }

        var ranked = clubs.filter(function (c) { return c.settled >= CLUB_TABLE_MIN_SETTLED; })
          .sort(function (a, b) {
            var acc = (b.results / b.settled) - (a.results / a.settled);
            if (acc) return acc;
            var ex = (b.exacts / b.settled) - (a.exacts / a.settled);
            if (ex) return ex;
            return (a.teamName || '').localeCompare(b.teamName || '');
          });
        var below = clubs.length - ranked.length;
        var clubRanks = rankLabels(ranked, function (a, b) {
          return (a.results / a.settled) === (b.results / b.settled) &&
                 (a.exacts / a.settled) === (b.exacts / b.settled);
        });

        var inner =
          '<div class="nlsp__tablehead">' +
            '<div class="nlsp__kicker">Club v club</div>' +
            '<div class="nlsp__tsub">' +
              $h(lbScopeLabel()) +
              ' · % of predictions with the right result' +
            '</div>' +
          '</div>' +
          ranked.map(function (c, i) {
            var pct = Math.round(100 * c.results / c.settled);
            return '<div class="nlsp__trow">' +
              '<span class="nlsp__rank">' + clubRanks[i] + '</span>' +
              crestImg(c.crestUrl, c.teamName, 22) +
              '<span>' + $h(c.teamName) +
                ' <span class="nlsp__clubrow-fans">' + c.fans + ' fan' + (c.fans === 1 ? '' : 's') + ' · ' + c.settled + ' settled</span>' +
              '</span>' +
              '<span class="nlsp__pts">' + pct + '%</span>' +
            '</div>';
          }).join('') +
          (ranked.length === 0
            ? '<div class="nlsp__clubfoot">No club has ' + CLUB_TABLE_MIN_SETTLED + ' settled predictions in this period yet.</div>'
            : (below > 0
                ? '<div class="nlsp__clubfoot">' + below + ' club' + (below === 1 ? ' needs' : 's need') + ' ' + CLUB_TABLE_MIN_SETTLED + '+ settled predictions to rank.</div>'
                : ''));

        clubTableEl.className = 'nlsp__table';
        clubTableEl.innerHTML = inner;
      }

      // ---------- sim bar (dev) ----------
      // ---------- sim bar (datetime picker) ----------
      // Lets you pick any moment as 'now' so you can preview pre-KO, in-play,
      // post-FT or even mid-season states. The datetime-local value is treated
      // as the user's local time; new Date(<value>) handles the conversion.
      function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
      function dateInputValue(d) {
        if (!d) return '';
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      }
      function timeInputValue(d) {
        if (!d) return '';
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      }
      function renderSimBar() {
        if (!state.sim.barEnabled) { simEl.className = ''; simEl.innerHTML = ''; return; }
        var d = simNow();
        var live = state.sim.fixed
          ? 'Sim · ' + d.toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/London' }) + ' BST'
          : 'Live clock';
        simEl.className = 'nlsp__simbar';
        // Separate date + time inputs — datetime-local has a quirk where typing
        // a single digit into the minutes field auto-completes (e.g. "4" -> "04")
        // and prevents you typing "45". Splitting it gives you natural typing.
        simEl.innerHTML =
          '<span class="nlsp__simlbl">Sim now</span>' +
          '<input type="date" id="nlsp-sim-date" value="' + $h(dateInputValue(d)) + '">' +
          '<input type="time" id="nlsp-sim-time" value="' + $h(timeInputValue(d)) + '" step="60">' +
          '<button id="nlsp-sim-now" class="nlsp__sim-now-btn">Now</button>' +
          '<span class="nlsp__clock">' + $h(live) + '</span>';
        var dateInput = document.getElementById('nlsp-sim-date');
        var timeInput = document.getElementById('nlsp-sim-time');
        function commit() {
          var dv = dateInput.value || dateInputValue(d);
          var tv = timeInput.value || timeInputValue(d);
          if (!dv) return;
          var picked = new Date(dv + 'T' + (tv || '12:00'));
          if (isNaN(picked.getTime())) return;
          setSimFixed(picked);
        }
        dateInput.addEventListener('change', commit);
        timeInput.addEventListener('change', commit);
        document.getElementById('nlsp-sim-now').addEventListener('click', clearSimFixed);
      }

      // ---------- RTDB listeners ----------
      /* Own records only. These were `users` and `predictions` at tree root, which
         is what forced both trees to be readable by anyone signed in — and a root
         read hands out the complete list of fan ids, which is what made everything
         else enumerable. Standings now come from the pre-computed leaderboard, so
         nothing here needs to see another fan's data. */
      function listenAll() {
        computeMyHash().then(function () { loadLeaderboard(); });
        fbDb.ref('users/' + state.user.id).on('value', function (snap) {
          state.registration = snap.val() || null;
          if (!state.registration) {
            hideGate();
            renderRegistration();
          } else {
            hideGate();
            register.hidden = true; main.hidden = false;
            // Registration may have just landed — sponsor + matchday filtering
            // both depend on user comp, so refresh sponsor and recompute the
            // matchday view before rendering.
            renderSponsor();
            recomputeMatchday();
            renderDatebar(); renderHero(); renderFixtures(); renderSubmitbar(); renderReset(); renderTable(); renderClubTable(); renderSimBar();
          }
        });
        fbDb.ref('predictions/' + state.user.id).on('value', function (snap) {
          state.myPreds = snap.val() || {};
          recomputePredictionsFromRaw();
          if (!main.hidden) {
            // renderHero() belongs here too — the hero card shows the user's own
            // club's fixture WITH their prediction on it, so leaving it out left
            // a reset (or any change) showing a stale scoreline in the hero while
            // the grid below updated correctly.
            renderHero(); renderFixtures(); renderSubmitbar(); renderReset(); renderTable(); renderClubTable();
          }
        });
      }

      // ---------- signed-out experience ----------
      // ---------- gate card (loading + signed-out) ----------
      var gateEl = document.getElementById('nlsp-gate');

      function renderGateLoading() {
        gateEl.hidden = false;
        register.hidden = true;
        main.hidden = true;
        hideBanner();
        gateEl.innerHTML =
          '<div class="nlsp__gate-card">' +
            '<img class="nlsp__gate-mark" src="' + NLPLUS_LOGO_URL + '" alt="NL+" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">' +
            '<div class="nlsp__gate-spinner" aria-hidden="true"></div>' +
            '<h2>Score Predictor</h2>' +
            '<p>Loading…</p>' +
          '</div>';
      }
      function renderGateSignIn() {
        gateEl.hidden = false;
        register.hidden = true;
        main.hidden = true;
        hideBanner();
        gateEl.innerHTML =
          '<div class="nlsp__gate-card">' +
            '<img class="nlsp__gate-mark" src="' + NLPLUS_LOGO_URL + '" alt="NL+" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">' +
            '<h2>Sign in with NL+ to play for free</h2>' +
            '<p>Predict every National League scoreline. Most correct results tops the table — exact scores break the ties.</p>' +
            '<a class="nlsp__btn" href="' + $h(signInHref()) + '">Sign in with NL+</a>' +
          '</div>' +
          '<div id="nlsp-teaser"></div>';
        loadTeaser();
      }

      /* The standings, shown to someone who has not signed in — the argument for
         joining is other people already playing, and a sign-in card on its own
         does not make it.

         Reading this needs no NL+ account: anonymous Firebase auth is not the NL+
         login, and the leaderboard node has only ever required `auth != null`.
         Nothing new is exposed — the node holds exactly what the table shows, and
         carries no ids at all. What changes is who SEES it, from signed-in fans to
         any passer-by, which was a decision rather than a technicality.

         Read-only: no paging, no club filter, no 'you'. There is no 'you' yet, and
         a filter you cannot act on is furniture. */
      function loadTeaser() {
        var el = document.getElementById('nlsp-teaser');
        if (!el) return;
        loadFirebase().then(function () {
          var exists = firebase.apps && firebase.apps.some(function (a) { return a.name === APP_NAME; });
          fbApp  = exists ? firebase.app(APP_NAME) : firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);
          if (!exists) activateAppCheck(fbApp);
          fbAuth = firebase.auth(fbApp);
          fbDb   = firebase.database(fbApp);
          return fbAuth.signInAnonymously();
        }).then(function () {
          return fbDb.ref('leaderboard/season').once('value');
        }).then(function (snap) {
          renderTeaser(el, (snap.val() && snap.val().rows) || []);
        }).catch(function () {
          /* Silent. This is a lure, not a feature: a fan who cannot see it is no
             worse off than before it existed, and an error message under a sign-in
             card would only suggest something is broken. */
        });
      }

      function renderTeaser(el, rows) {
        if (!rows.length) return;
        var top = rows.slice(0, TEASER_ROWS);
        var ranks = rankLabels(rows, function (a, b) {
          return a.r === b.r && a.e === b.e;
        }).slice(0, TEASER_ROWS);

        el.className = 'nlsp__table nlsp__teaser';
        el.innerHTML =
          '<div class="nlsp__tablehead">' +
            '<div class="nlsp__kicker">Leaderboard</div>' +
            '<div class="nlsp__tsub">' + rows.length + ' fan' + (rows.length === 1 ? '' : 's') +
              ' playing this season</div>' +
          '</div>' +
          '<div class="nlsp__thead">' +
            '<span></span><span></span><span></span>' +
            '<span>Results</span><span>Exact</span>' +
          '</div>' +
          top.map(function (r, i) { return trowHTML(r, ranks[i], ''); }).join('') +
          (rows.length > TEASER_ROWS
            ? '<div class="nlsp__clubfoot">Sign in to see the full table and join in.</div>'
            : '');
      }
      function hideGate() { gateEl.hidden = true; gateEl.innerHTML = ''; }

      function signInHref() {
        // Match the URL pattern the NL site itself uses when bouncing fans
        // through SA SSO (verified against a live header sign-in link).
        //
        // Both returnvisitorurl and successredirecturl point to the current
        // page so the fan lands back on the predictor regardless of which
        // subdomain hosted the embed (www, beta, etc.).
        var here = '';
        try { here = window.location.href; } catch (e) {}
        var enc = encodeURIComponent(here);
        return 'https://signin.thenationalleague.org.uk/auth/login' +
          '?tenantid=' + encodeURIComponent(SSO_TENANT_ID) +
          '&returnvisitorurl=' + enc +
          '&successredirecturl=' + enc +
          '&loginSuccess=true' +
          '&mandatory=false';
      }

      // ---------- boot ----------
      // The SSO cookie is sometimes not yet on document.cookie at initial script
      // execution (Nuxt hydration / SSO middleware writes it asynchronously). We
      // poll for up to ~4s before deciding the user is signed out. During that
      // window the gate card sits there with a spinner + "Loading…".
      function tryDecodeClaims() {
        var jwt = readCookie('_gc_sa_sso_access');
        return decodeJwtPayload(jwt);
      }
      function waitForJwt(maxMs) {
        return new Promise(function (resolve) {
          var c = tryDecodeClaims();
          if (c && c.id) return resolve(c);
          var start = Date.now();
          var iv = setInterval(function () {
            var got = tryDecodeClaims();
            if (got && got.id) { clearInterval(iv); resolve(got); return; }
            if (Date.now() - start >= maxMs) { clearInterval(iv); resolve(null); }
          }, 200);
        });
      }

      (function boot() {
        // Paint the header immediately — brand frame visible during loading
        // and signed-out states. Safe to call here because all helpers are now
        // defined.
        renderSponsor();
        renderGateLoading();
        waitForJwt(4000).then(function (claims) {
          if (!claims || !claims.id) { renderGateSignIn(); return; }
          // Don't hideGate() yet — let it stay through Firebase init + fixtures
          // fetch. The first listenAll listener firing hides it.
          startSignedIn(claims);
        });
      })();

      function startSignedIn(claims) {
        state.user = {
          id: claims.id,
          forename: claims.forename || 'there',
          surname:  claims.surname  || '',
          surnameInitial: (claims.surname || '').charAt(0).toUpperCase(),
          favTeamName: claims.favourite_team || null
        };

        var sim = parseSimMode();
        state.sim.barEnabled = sim.bar;
        if (sim.now) state.sim.fixed = sim.now;

        Promise.all([
          loadFirebase().then(function () {
            var exists = firebase.apps && firebase.apps.some(function (a) { return a.name === APP_NAME; });
            fbApp  = exists ? firebase.app(APP_NAME) : firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);
            if (!exists) activateAppCheck(fbApp);
            fbAuth = firebase.auth(fbApp);
            fbDb   = firebase.database(fbApp);
            return fbAuth.signInAnonymously();
          }).then(function () { state.fbAuthed = true; }),
          // clubs-meta first: it supplies the current seasonID for the fixtures
          // query plus the club colours for the hero card. Failure is soft —
          // SEASON_ID fallback and navy hero.
          loadClubsMeta().then(function () {
            return fetchFixtures();
          }).then(function (ms) {
            state.allMatches = ms;
            teamCompCache = null; // invalidate so it rebuilds from fresh data
          })
        ]).then(function () {
          hideBanner();
          recomputeMatchday();
          listenAll();
          startTicker();
        }).catch(function (err) {
          showBanner('Could not start the predictor: ' + (err && err.message ? err.message : err), 'err');
        });
      }
    })();

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
