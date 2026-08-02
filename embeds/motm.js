/* Man of the Match — GENERATED FILE, DO NOT EDIT.
 *
 * Built from embeds/motm.html by scripts/build-embeds.js.
 * Edit the HTML file and let CI regenerate this.
 *
 * Embed on the public site with:
 *   <div data-nl-motm></div>
 *   <script src="https://nl.tools/embeds/motm.js" defer></script>
 *
 * If the CMS strips <script src>, use an inline loader instead:
 *   <div data-nl-motm></div>
 *   <script>
 *     (function(){var s=document.createElement('script');
 *      s.src='https://nl.tools/embeds/motm.js';document.body.appendChild(s);})();
 *   </script>
 */
(function () {
  'use strict';

  // Guard against the snippet appearing twice on one page — the widget owns
  // fixed element IDs, so a second copy would fight the first.
  if (window.__nlMotmMounted) {
    if (window.console && console.warn) {
      console.warn('[Man of the Match] already mounted on this page — ignoring duplicate embed.');
    }
    return;
  }
  window.__nlMotmMounted = true;

  var VERSION = "v2.0";
  var CSS = "\n  /* Carbona Variable */\n  @font-face {\n    font-family: \"carbona-variable\";\n    src: url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff2\"),\n         url(\"https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/d?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3\") format(\"woff\");\n    font-display: swap; font-style: normal; font-weight: 200 900; font-stretch: normal;\n  }\n\n  #nlMotm {\n    /* Values mirror the NL canon (system/nl-brand.css) — embeds can't load\n       the portal stylesheet, so the tokens are inlined verbatim. Ladder\n       stops are the canonical \"lighter/darker\"; no gold, no rgba overlays.\n       Kept identical to the Score Predictor's block so the two widgets\n       cannot drift apart. */\n    --primary:#9e0000; --primary-50:#fcf4f2; --primary-300:#dfa197;\n    --primary-600:#7e0000; --primary-700:#600000;\n    --navy:#223b7c; --navy-600:#192e63;\n    --red:#d4380d; --red-light:#fff1ec;\n    --green:#1a7030; --green-light:#edf7ee;\n    --amber:#c96f15; --amber-light:#fef6ec;\n    --accent-live:#4ade80;\n    --white:#ffffff; --off-white:#f4f6f9;\n    --text:#1a2a44; --text-muted:#5a6a82;\n    --border:#dde3ed;\n    --radius:6px;\n    --shadow:0 2px 12px rgba(10,22,40,.10);\n    --focus-ring:0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);\n\n    font-family:'carbona-variable','carbona',sans-serif;\n    font-size:15px; line-height:1.45;\n    font-variation-settings:'wght' 400;\n    color:var(--text); -webkit-font-smoothing:antialiased;\n    max-width:680px; margin:24px auto; padding:0 12px;\n  }\n  #nlMotm, #nlMotm *, #nlMotm *::before, #nlMotm *::after { box-sizing:border-box; }\n\n  /* Banner */\n  #nlMotm .nlsm__banner {\n    background:var(--amber-light); border:1px solid var(--amber); color:var(--amber);\n    padding:8px 12px; border-radius:var(--radius); font-size:13px; margin-bottom:14px;\n    font-variation-settings:'wght' 600;\n  }\n  #nlMotm .nlsm__banner.is-err { background:var(--red-light);   border-color:var(--red);   color:var(--red); }\n  #nlMotm .nlsm__banner.is-ok  { background:var(--green-light); border-color:var(--green); color:var(--green); }\n\n  /* Gate */\n  #nlMotm .nlsm__gate {\n    padding:48px 16px; display:flex; justify-content:center;\n  }\n  #nlMotm .nlsm__gate-card {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    box-shadow:var(--shadow);\n    padding:28px 28px 24px; max-width:380px; width:100%;\n    text-align:center;\n  }\n  #nlMotm .nlsm__gate-card img.nlsm__gate-mark {\n    height:56px; width:auto; display:block; margin:0 auto 18px;\n    max-width:200px; object-fit:contain;\n  }\n  #nlMotm .nlsm__gate-card h2 {\n    margin:0 0 6px;\n    font-size:20px; font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text);\n  }\n  #nlMotm .nlsm__gate-card p {\n    margin:0 0 18px;\n    color:var(--text-muted); font-size:14px;\n    font-weight:500; font-variation-settings:'wght' 500;\n  }\n  #nlMotm .nlsm__gate-card .nlsm__btn { width:100%; padding:12px 22px; }\n  #nlMotm .nlsm__gate-spinner {\n    width:22px; height:22px; margin:0 auto 12px;\n    border:2px solid var(--border); border-top-color:var(--primary);\n    border-radius:50%;\n    animation:nlsm-spin .8s linear infinite;\n  }\n  @keyframes nlsm-spin { to { transform:rotate(360deg); } }\n\n  /* Sponsor header */\n  #nlMotm .nlsm__sponsor {\n    display:grid; grid-template-columns:1fr auto 1fr; align-items:center;\n    background:var(--navy); color:var(--white);\n    padding:12px 16px; border-radius:var(--radius) var(--radius) 0 0;\n    border-bottom:2px solid var(--primary);\n    gap:12px; min-height:54px;\n  }\n  #nlMotm .nlsm__sponsor-left  { display:flex; align-items:center; gap:10px; justify-self:start; }\n  #nlMotm .nlsm__sponsor-right { display:flex; align-items:center; gap:8px;  justify-self:end; }\n  #nlMotm .nlsm__sponsor img.nlsm__sponsor-logo {\n    height:26px; width:auto; display:block; object-fit:contain;\n  }\n  #nlMotm .nlsm__sponsor img.nlsm__sponsor-comp {\n    height:30px; width:auto; display:block; object-fit:contain;\n  }\n  #nlMotm .nlsm__sponsor img.nlsm__sponsor-team {\n    height:30px; width:30px; display:block; object-fit:contain;\n    background:var(--white); border-radius:4px; padding:1px;\n  }\n  #nlMotm .nlsm__sponsor .nlsm__sponsor-title {\n    font-size:15px; color:var(--white);\n    text-transform:uppercase; letter-spacing:1.5px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    line-height:1; text-align:center; justify-self:center;\n  }\n  @media (max-width:520px) {\n    #nlMotm .nlsm__sponsor {\n      padding:10px 12px; min-height:48px;\n      grid-template-columns:1fr auto 1fr; gap:8px;\n    }\n    #nlMotm .nlsm__sponsor img.nlsm__sponsor-logo { height:20px; }\n    #nlMotm .nlsm__sponsor img.nlsm__sponsor-comp,\n    #nlMotm .nlsm__sponsor img.nlsm__sponsor-team { height:24px; }\n    #nlMotm .nlsm__sponsor img.nlsm__sponsor-team { width:24px; }\n    #nlMotm .nlsm__sponsor .nlsm__sponsor-title { font-size:11px; letter-spacing:1px; }\n  }\n\n  /* Footer */\n  #nlMotm .nlsm__footer {\n    display:flex; align-items:center; justify-content:center;\n    padding:16px 0 4px; margin-top:12px;\n    border-top:1px solid var(--border);\n  }\n  #nlMotm .nlsm__footer img { height:22px; width:auto; display:block; opacity:.65; }\n\n  /* Datebar */\n  #nlMotm .nlsm__datebar {\n    display:flex; gap:6px;\n    padding:14px 2px 8px;\n    overflow-x:auto; overflow-y:hidden;\n    -webkit-overflow-scrolling:touch;\n    scrollbar-width:none;\n    cursor:grab; user-select:none;\n  }\n  #nlMotm .nlsm__datebar.is-dragging { cursor:grabbing; }\n  #nlMotm .nlsm__datebar.is-dragging button { pointer-events:none; }\n  #nlMotm .nlsm__datebar::-webkit-scrollbar { display:none; }\n  #nlMotm .nlsm__datebar button {\n    flex:none;\n    font-family:inherit; font-size:11px;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:7px 12px; border-radius:999px; cursor:pointer;\n    background:var(--white); color:var(--text-muted);\n    border:1px solid var(--border);\n    font-weight:800; font-variation-settings:'wght' 800;\n    white-space:nowrap;\n    transition:all .15s ease;\n  }\n  #nlMotm .nlsm__datebar button:hover { color:var(--primary); border-color:var(--primary); }\n  /* Canon single-choice active state (.chip.active in nl-brand.css): navy */\n  #nlMotm .nlsm__datebar button.is-active { background:var(--navy); color:var(--white); border-color:var(--navy); }\n  #nlMotm .nlsm__datebar button.is-today { border-color:var(--primary); }\n\n  /* Hero */\n  #nlMotm .nlsm__hero { padding:10px 0 8px; }\n  #nlMotm .nlsm__hero .nlsm__greetline {\n    font-size:11px; text-transform:uppercase; letter-spacing:1.5px;\n    color:var(--text-muted);\n    font-weight:800; font-variation-settings:'wght' 800;\n    margin-bottom:6px;\n  }\n  #nlMotm .nlsm__hero h1 {\n    font-size:24px; line-height:1.15; margin:0;\n    font-weight:900; font-variation-settings:'wght' 900;\n  }\n  /* Supported club is not locked — this is the way out of it. */\n  #nlMotm .nlsm__swapline {\n    margin-top:6px;\n    font-size:12px; color:var(--text-muted);\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n  #nlMotm .nlsm__swapline a {\n    color:var(--primary); text-decoration:underline; text-underline-offset:2px;\n    font-weight:700; font-variation-settings:'wght' 700;\n  }\n  #nlMotm .nlsm__swapline a:hover { color:var(--primary-600); }\n\n  /* Fixture row */\n  #nlMotm .nlsm__row {\n    position:relative;\n    padding:10px 12px;\n    border:1px solid var(--border);\n    border-radius:var(--radius);\n    background:var(--white);\n    margin-bottom:10px;\n    display:grid; row-gap:6px;\n  }\n  #nlMotm .nlsm__row.is-voting { border-color:var(--primary); }\n  #nlMotm .nlsm__row.is-voted  { background:var(--green-light); }\n  #nlMotm .nlsm__row.is-void   { opacity:.7; }\n\n  #nlMotm .nlsm__meta {\n    display:flex; align-items:center; gap:8px;\n    font-size:11px; color:var(--text-muted);\n    text-transform:uppercase; letter-spacing:1px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    min-height:16px;\n  }\n  #nlMotm .nlsm__meta .nlsm__livedot {\n    width:7px; height:7px; border-radius:50%; background:var(--accent-live);\n    animation:nlsm-pulse 1.4s infinite;\n  }\n  #nlMotm .nlsm__meta .nlsm__livelbl { color:var(--green); }\n  #nlMotm .nlsm__meta .nlsm__ftlabel { color:var(--green); }\n  #nlMotm .nlsm__meta .nlsm__votelbl { color:var(--primary); }\n  #nlMotm .nlsm__meta .nlsm__voidlbl { color:var(--text-muted); }\n  #nlMotm .nlsm__meta .nlsm__lock    { color:var(--text-muted); }\n  #nlMotm .nlsm__meta .nlsm__countdown { color:var(--text); }\n  @keyframes nlsm-pulse {\n    0%   { box-shadow:0 0 0 0 color-mix(in srgb, var(--accent-live) 60%, transparent); }\n    70%  { box-shadow:0 0 0 6px color-mix(in srgb, var(--accent-live) 0%, transparent); }\n    100% { box-shadow:0 0 0 0 color-mix(in srgb, var(--accent-live) 0%, transparent); }\n  }\n\n  /* Team line */\n  #nlMotm .nlsm__teamline {\n    display:flex; align-items:center; gap:10px;\n    font-size:14px; color:var(--text);\n    font-weight:800; font-variation-settings:'wght' 800;\n    text-transform:uppercase; letter-spacing:.5px;\n    min-height:30px;\n  }\n  #nlMotm .nlsm__teamline img {\n    width:24px; height:24px; flex:none; border-radius:3px;\n    background:var(--white); object-fit:contain;\n  }\n  #nlMotm .nlsm__teamline .nlsm__tname {\n    flex:1; min-width:0;\n    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n  }\n  #nlMotm .nlsm__tname-short { display:none; }\n  @media (max-width:520px) {\n    #nlMotm .nlsm__tname-full  { display:none; }\n    #nlMotm .nlsm__tname-short { display:inline; }\n  }\n  #nlMotm .nlsm__teamscore {\n    flex:none; min-width:36px; text-align:right;\n    font-size:20px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text);\n  }\n  #nlMotm .nlsm__vs {\n    text-align:center; font-size:10px; color:var(--text-muted);\n    font-weight:800; font-variation-settings:'wght' 800;\n    letter-spacing:1px;\n    padding:2px 0;\n  }\n\n  /* Voting picker */\n  #nlMotm .nlsm__picker {\n    margin-top:4px;\n    display:grid; row-gap:10px;\n  }\n  #nlMotm .nlsm__picker > label {\n    font-size:11px; text-transform:uppercase; letter-spacing:1.2px;\n    color:var(--text-muted);\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlMotm .nlsm__teampick {\n    display:grid; grid-template-columns:1fr 1fr; gap:8px;\n  }\n  #nlMotm .nlsm__teamcol {\n    background:var(--white); border:1px solid var(--border);\n    border-radius:var(--radius); overflow:hidden;\n    display:flex; flex-direction:column;\n  }\n  #nlMotm .nlsm__teamhead {\n    display:flex; align-items:center; gap:6px;\n    padding:6px 8px;\n    background:var(--team-primary,var(--navy));\n    color:var(--team-secondary,var(--white));\n    font-size:11px; line-height:1.2;\n    font-weight:900; font-variation-settings:'wght' 900;\n    text-transform:uppercase; letter-spacing:.8px;\n    min-height:28px;\n  }\n  #nlMotm .nlsm__teamhead img {\n    width:18px; height:18px; object-fit:contain; flex:none;\n    background:var(--white); border-radius:3px; padding:1px;\n  }\n  #nlMotm .nlsm__teamhead .nlsm__thname {\n    flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n  }\n  #nlMotm .nlsm__plist { display:flex; flex-direction:column; }\n  #nlMotm .nlsm__subdiv {\n    padding:4px 8px 2px;\n    font-size:9px; text-transform:uppercase; letter-spacing:1px;\n    color:var(--text-muted);\n    font-weight:800; font-variation-settings:'wght' 800;\n    border-top:1px dashed var(--border);\n    margin-top:2px;\n  }\n  #nlMotm .nlsm__player {\n    -webkit-appearance:none; appearance:none;\n    text-align:left; font:inherit;\n    display:flex; align-items:center; gap:6px;\n    padding:8px 8px; min-height:36px;\n    background:transparent; border:none; border-top:1px solid var(--border);\n    color:var(--text); cursor:pointer;\n    font-size:12px; line-height:1.2;\n    font-weight:700; font-variation-settings:'wght' 700;\n  }\n  #nlMotm .nlsm__plist > .nlsm__player:first-child,\n  #nlMotm .nlsm__plist > .nlsm__subdiv + .nlsm__player {\n    border-top:none;\n  }\n  #nlMotm .nlsm__player:hover { background:var(--off-white); }\n  #nlMotm .nlsm__pshirt {\n    flex:none; display:inline-block;\n    min-width:22px; text-align:center;\n    font-size:11px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text-muted);\n  }\n  #nlMotm .nlsm__pname {\n    flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n  }\n  #nlMotm .nlsm__player.is-sub .nlsm__pname { color:var(--text-muted); font-weight:600; font-variation-settings:'wght' 600; }\n  #nlMotm .nlsm__player.is-selected {\n    background:var(--primary-50);\n    box-shadow:inset 3px 0 0 var(--primary);\n  }\n  #nlMotm .nlsm__player.is-selected .nlsm__pname,\n  #nlMotm .nlsm__player.is-selected .nlsm__pshirt { color:var(--primary); }\n  #nlMotm .nlsm__player:focus-visible {\n    outline:2px solid var(--primary); outline-offset:-2px;\n  }\n\n  /* Optional note */\n  #nlMotm .nlsm__note {\n    display:grid; row-gap:4px;\n  }\n  #nlMotm .nlsm__note textarea {\n    width:100%; box-sizing:border-box;\n    padding:8px 10px; font-family:inherit; font-size:13px; line-height:1.4;\n    color:var(--text); background:var(--white);\n    border:1px solid var(--border); border-radius:var(--radius);\n    resize:vertical; min-height:54px;\n    font-weight:500; font-variation-settings:'wght' 500;\n  }\n  #nlMotm .nlsm__note textarea:focus {\n    outline:none; border-color:var(--primary);\n    box-shadow:var(--focus-ring);\n  }\n  #nlMotm .nlsm__notefoot {\n    display:flex; justify-content:space-between; align-items:center;\n    font-size:10px; color:var(--text-muted);\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n  #nlMotm .nlsm__notedisc { flex:1 1 auto; padding-right:8px; }\n  #nlMotm .nlsm__notecount.is-max { color:var(--red); }\n\n  /* Your-pick note recall (below summary) */\n  #nlMotm .nlsm__yournote {\n    margin-top:6px;\n    padding:6px 10px;\n    border-left:2px solid var(--border);\n    font-size:12px; line-height:1.45; color:var(--text-muted);\n    font-weight:500; font-variation-settings:'wght' 500;\n    font-style:italic;\n  }\n\n  #nlMotm .nlsm__pickactions {\n    display:flex; gap:8px; justify-content:flex-end;\n    align-items:center;\n  }\n  #nlMotm .nlsm__pickactions .nlsm__pickhint {\n    margin-right:auto; font-size:12px; color:var(--text-muted);\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n  #nlMotm .nlsm__pickactions button {\n    font:inherit; font-size:11px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:7px 14px; border-radius:var(--radius); cursor:pointer;\n  }\n  #nlMotm .nlsm__btn-save {\n    background:var(--primary); color:var(--white); border:1px solid var(--primary);\n  }\n  #nlMotm .nlsm__btn-save:hover  { background:var(--primary-600); }\n  #nlMotm .nlsm__btn-save:disabled { background:var(--border); color:var(--text-muted); border-color:var(--border); cursor:not-allowed; }\n  #nlMotm .nlsm__btn-cancel {\n    background:var(--white); color:var(--text-muted); border:1px solid var(--border);\n  }\n  #nlMotm .nlsm__btn-cancel:hover { color:var(--text); border-color:var(--text-muted); }\n\n  /* Voted summary */\n  #nlMotm .nlsm__voted {\n    display:flex; align-items:center; gap:10px;\n    padding:8px 10px;\n    background:var(--green-light); border:1px solid var(--green);\n    border-radius:var(--radius);\n    font-size:13px; color:var(--text);\n    font-weight:700; font-variation-settings:'wght' 700;\n  }\n  #nlMotm .nlsm__voted .nlsm__vname { color:var(--text); font-weight:900; font-variation-settings:'wght' 900; }\n  #nlMotm .nlsm__voted .nlsm__vlbl  { color:var(--green); }\n  #nlMotm .nlsm__voted .nlsm__editmini {\n    margin-left:auto;\n    font:inherit; font-size:11px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    text-transform:uppercase; letter-spacing:1px;\n    background:transparent; border:none; padding:0;\n    color:var(--text-muted); cursor:pointer;\n    text-decoration:underline; text-underline-offset:3px;\n  }\n  #nlMotm .nlsm__voted .nlsm__editmini:hover { color:var(--primary); }\n  #nlMotm .nlsm__voted.is-locked { background:var(--off-white); border-color:var(--border); }\n  #nlMotm .nlsm__voted.is-locked .nlsm__vlbl { color:var(--text-muted); }\n\n  /* Not-your-match notice (for non-own-team rows, if any are surfaced) */\n  #nlMotm .nlsm__lockcard {\n    padding:12px 14px;\n    background:var(--off-white); border:1px solid var(--border);\n    border-radius:var(--radius);\n    font-size:13px; color:var(--text-muted);\n    font-weight:600; font-variation-settings:'wght' 600;\n    text-align:center;\n  }\n\n  /* Modal */\n  #nlMotm .nlsm__modal[hidden] { display:none; }\n  #nlMotm .nlsm__modal {\n    position:fixed; inset:0; z-index:1000;\n    display:flex; align-items:center; justify-content:center;\n    padding:20px;\n    background:rgba(10,22,40,.65); /* canon .modal-backdrop scrim */\n  }\n  #nlMotm .nlsm__modal-card {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    box-shadow:0 12px 36px rgba(10,22,40,.25);\n    padding:22px 24px; max-width:380px; width:100%;\n    font-family:'carbona-variable','carbona',sans-serif;\n  }\n  #nlMotm .nlsm__modal-card h3 {\n    margin:0 0 6px;\n    font-size:18px; font-weight:900; font-variation-settings:'wght' 900;\n    color:var(--text);\n  }\n  #nlMotm .nlsm__modal-card p {\n    margin:0 0 18px;\n    font-size:14px; color:var(--text-muted);\n    font-weight:500; font-variation-settings:'wght' 500;\n  }\n  #nlMotm .nlsm__modal-actions {\n    display:flex; justify-content:flex-end; gap:8px;\n  }\n  #nlMotm .nlsm__modal-actions button {\n    font:inherit; font-size:13px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:8px 16px; border-radius:var(--radius); cursor:pointer;\n  }\n  #nlMotm .nlsm__modal-cancel {\n    background:var(--white); color:var(--text-muted); border:1px solid var(--border);\n  }\n  #nlMotm .nlsm__modal-cancel:hover { color:var(--text); border-color:var(--text-muted); }\n  #nlMotm .nlsm__modal-confirm {\n    background:var(--primary); color:var(--white); border:1px solid var(--primary);\n  }\n  #nlMotm .nlsm__modal-confirm:hover { background:var(--primary-600); }\n\n  /* Registration */\n  #nlMotm .nlsm__register-card {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    padding:24px; box-shadow:var(--shadow);\n  }\n  #nlMotm .nlsm__btn {\n    font-family:inherit; font-size:15px;\n    font-weight:900; font-variation-settings:'wght' 900;\n    padding:10px 22px; border:none; border-radius:var(--radius);\n    cursor:pointer; background:var(--primary); color:var(--white);\n    transition:background .15s ease;\n  }\n  #nlMotm .nlsm__btn:hover  { background:var(--primary-600); }\n  #nlMotm .nlsm__btn:active { background:var(--primary-700); }\n  #nlMotm .nlsm__btn:focus-visible {\n    outline:3px solid var(--primary-300); outline-offset:2px;\n  }\n  #nlMotm .nlsm__btn:disabled { background:var(--border); color:var(--text-muted); cursor:not-allowed; }\n\n  /* Tally */\n  #nlMotm .nlsm__tally {\n    background:var(--white); border:1px solid var(--border); border-radius:var(--radius);\n    padding:12px 0; margin:18px 0; box-shadow:var(--shadow);\n  }\n  #nlMotm .nlsm__tallyhead { padding:0 14px 8px; border-bottom:1px solid var(--border); }\n  #nlMotm .nlsm__tallyhead .nlsm__kicker {\n    font-size:11px; text-transform:uppercase; letter-spacing:1.5px;\n    color:var(--text-muted);\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlMotm .nlsm__tallyhead .nlsm__tsub { font-size:12px; color:var(--text-muted); margin-top:2px; }\n  #nlMotm .nlsm__trow {\n    display:flex; align-items:center; gap:10px;\n    padding:9px 14px;\n    font-size:14px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    border-bottom:1px solid var(--off-white);\n  }\n  #nlMotm .nlsm__trow:last-child { border-bottom:none; }\n  #nlMotm .nlsm__trow.is-leader { background:var(--amber-light); }\n  #nlMotm .nlsm__trow.is-you-pick { background:var(--primary-50); }\n  #nlMotm .nlsm__trow.is-leader.is-you-pick {\n    background:linear-gradient(90deg,\n      var(--amber-light) 0%,\n      var(--primary-50) 100%);\n  }\n  #nlMotm .nlsm__trow .nlsm__rank {\n    flex:none; width:18px; color:var(--text-muted);\n    font-weight:900; font-variation-settings:'wght' 900;\n  }\n  #nlMotm .nlsm__trow .nlsm__pname {\n    flex:1; min-width:0;\n    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n  }\n  #nlMotm .nlsm__trow .nlsm__ptag {\n    flex:none;\n    font-size:10px; color:var(--text-muted);\n    text-transform:uppercase; letter-spacing:1px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    padding:2px 6px; border:1px solid var(--border); border-radius:999px;\n    max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n  }\n  #nlMotm .nlsm__trow .nlsm__leadpill {\n    flex:none;\n    font-size:10px;\n    text-transform:uppercase; letter-spacing:1px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    padding:2px 8px; border-radius:999px;\n    background:var(--amber); color:var(--white);\n  }\n  #nlMotm .nlsm__trow .nlsm__youpill {\n    flex:none;\n    font-size:10px;\n    text-transform:uppercase; letter-spacing:1px;\n    font-weight:800; font-variation-settings:'wght' 800;\n    padding:2px 8px; border-radius:999px;\n    background:var(--white); color:var(--primary);\n    border:1px solid var(--primary);\n  }\n  @media (max-width:520px) {\n    #nlMotm .nlsm__trow { gap:8px; padding:9px 12px; }\n    #nlMotm .nlsm__trow .nlsm__ptag { display:none; }\n  }\n\n  /* Sim bar */\n  #nlMotm .nlsm__simbar {\n    margin-top:18px; padding-top:10px; border-top:1px dashed var(--border);\n    display:flex; flex-wrap:wrap; gap:8px; align-items:center;\n    font-size:11px; color:var(--text-muted);\n  }\n  #nlMotm .nlsm__simbar .nlsm__simlbl {\n    text-transform:uppercase; letter-spacing:1.2px;\n    font-weight:800; font-variation-settings:'wght' 800;\n  }\n  #nlMotm .nlsm__simbar input[type=\"date\"],\n  #nlMotm .nlsm__simbar input[type=\"time\"] {\n    font-family:inherit; font-size:12px;\n    padding:4px 8px; border-radius:var(--radius);\n    border:1px solid var(--border); background:var(--white); color:var(--text);\n    font-weight:600; font-variation-settings:'wght' 600;\n  }\n  #nlMotm .nlsm__simbar input[type=\"date\"]:focus,\n  #nlMotm .nlsm__simbar input[type=\"time\"]:focus {\n    outline:none; border-color:var(--primary);\n    box-shadow:var(--focus-ring);\n  }\n  #nlMotm .nlsm__simbar .nlsm__sim-now-btn {\n    font-family:inherit; font-size:11px;\n    font-weight:700; font-variation-settings:'wght' 700;\n    text-transform:uppercase; letter-spacing:1px;\n    padding:4px 10px; border-radius:999px; cursor:pointer;\n    background:var(--white); color:var(--text-muted); border:1px solid var(--border);\n  }\n  #nlMotm .nlsm__simbar .nlsm__sim-now-btn:hover { color:var(--primary); border-color:var(--primary); }\n  #nlMotm .nlsm__simbar .nlsm__clock {\n    font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11px;\n    color:var(--text-muted); margin-left:auto;\n  }\n\n  /* Spinner inline */\n  #nlMotm .nlsm__inlinespin {\n    display:inline-block; vertical-align:-3px;\n    width:14px; height:14px; margin-right:6px;\n    border:2px solid var(--border); border-top-color:var(--primary);\n    border-radius:50%;\n    animation:nlsm-spin .8s linear infinite;\n  }\n\n  @media (max-width:520px) {\n    #nlMotm .nlsm__row { padding:10px; }\n    #nlMotm .nlsm__teamline img { width:22px; height:22px; }\n    #nlMotm .nlsm__teamline { font-size:13px; }\n    #nlMotm .nlsm__teamscore { font-size:18px; min-width:30px; }\n    #nlMotm .nlsm__hero h1 { font-size:22px; }\n  }\n";
  var HTML = "<div id=\"nlMotm\">\n  <div class=\"nlsm__sponsor\" id=\"nlsm-sponsor\"></div>\n  <div class=\"nlsm__banner\" id=\"nlsm-banner\" hidden>Loading MOTM...</div>\n  <div class=\"nlsm__screen\" id=\"nlsm-register\" hidden></div>\n  <div class=\"nlsm__screen\" id=\"nlsm-main\" hidden>\n    <div id=\"nlsm-datebar\"></div>\n    <div id=\"nlsm-hero\"></div>\n    <div id=\"nlsm-fixtures\"></div>\n    <div id=\"nlsm-tally\"></div>\n  </div>\n  <div class=\"nlsm__gate\" id=\"nlsm-gate\"></div>\n  <div class=\"nlsm__footer\" id=\"nlsm-footer\"></div>\n  <div id=\"nlsm-sim\"></div>\n  <div class=\"nlsm__modal\" id=\"nlsm-modal\" hidden></div>\n</div>";

  function mount() {
    // Mount into the host page's marker div. Falling back to appending our
    // own container means a missing marker degrades to "renders at the
    // bottom" rather than "renders nowhere".
    var host = document.querySelector('[data-nl-motm]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-nl-motm', '');
      document.body.appendChild(host);
      if (window.console && console.warn) {
        console.warn('[Man of the Match] no [data-nl-motm] element found — appended to <body>.');
      }
    }

    var style = document.createElement('style');
    style.setAttribute('data-nl-embed', "embeds/motm.js");
    style.textContent = CSS;
    document.head.appendChild(style);

    // Markup must be in the DOM before the widget runs — its IIFE resolves
    // every element by ID at the top and does not wait for DOMContentLoaded.
    host.innerHTML = HTML;

    if (window.console && console.info) {
      console.info('[Man of the Match] ' + VERSION + ' mounted.');
    }


    (function () {
      // ---------- config ----------
      // Shared nl-widgets Firebase project (also hosts the Score Predictor's
      // predictions/ tree). MOTM data is isolated under motm/. APP_NAME stays
      // unique per widget so two widgets on one page don't clash on init.
      var FIREBASE_CONFIG = {
        apiKey:            'AIzaSyAOePUiyfACJ546b08Z7oGWahAEYzEadMo',
        authDomain:        'nl-widgets.firebaseapp.com',
        databaseURL:       'https://nl-widgets-default-rtdb.europe-west1.firebasedatabase.app',
        projectId:         'nl-widgets',
        storageBucket:     'nl-widgets.firebasestorage.app',
        messagingSenderId: '440054238126',
        appId:             '1:440054238126:web:349a1aeaf3c65ff281563f'
      };
      var APP_NAME   = 'nlMotm';
      var FB_SDK_URL = 'https://www.gstatic.com/firebasejs/10.12.0/';
      var FB_SDK     = ['firebase-app-compat.js','firebase-auth-compat.js','firebase-database-compat.js'];
      var NLPLUS_LOGO_URL = 'https://raw.githubusercontent.com/thenationalleague/tools/main/assets/logos/NL%2B%20red%20lozenge.png';
      var SSO_TENANT_ID = 'EBLzD6derkq3NH7m9Rp2mQ';

      var COMPS = {
        89:  { id: 89,  name: 'National Division',     shortName: 'National', logoFile: 'National.png' },
        373: { id: 373, name: 'National League North', shortName: 'North',    logoFile: 'North.png'    },
        372: { id: 372, name: 'National League South', shortName: 'South',    logoFile: 'South.png'    }
      };
      var COMP_IDS = Object.keys(COMPS).map(Number);
      var DEFAULT_COMP_ID = 89;
      var API_BASE   = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
      var CLUBS_META_URL = 'https://raw.githubusercontent.com/thenationalleague/tools/main/assets/data/clubs-meta.json';
      var MAX_PAGES  = 10;
      var NOTE_MAX   = 280;

      // A season is named for the calendar year it STARTS in and runs 1 Jul to
      // 30 Jun, so "2026" is the 2026-27 campaign. The live value comes from
      // clubs-meta (seasons.current) rather than being hardcoded; deriving it
      // from the date is the fallback if that fetch fails, and ?season=2025
      // forces an older one for testing.
      function deriveSeasonId(d) {
        var y = d.getFullYear();
        return (d.getMonth() + 1) >= 7 ? y : y - 1;
      }
      function seasonOverride() {
        var v = new URLSearchParams(window.location.search).get('season');
        return /^\d{4}$/.test(v || '') ? Number(v) : null;
      }

      // Voting opens at FULL TIME and closes 24h after kick-off. A match that
      // never reaches full time never opens for voting at all.
      var VOTE_CLOSE_MIN = 24 * 60;
      // Past this, an in-play matchPeriod is not believed — an abandoned match
      // or a stalled feed would otherwise sit at "Live" forever.
      var STALE_LIVE_MIN = 240;

      // ---------- DOM refs ----------
      var banner    = document.getElementById('nlsm-banner');
      var register  = document.getElementById('nlsm-register');
      var main      = document.getElementById('nlsm-main');
      var hero      = document.getElementById('nlsm-hero');
      var fixtures  = document.getElementById('nlsm-fixtures');
      var tallyEl   = document.getElementById('nlsm-tally');
      var simEl     = document.getElementById('nlsm-sim');
      var sponsorEl = document.getElementById('nlsm-sponsor');
      var footerEl  = document.getElementById('nlsm-footer');
      var datebarEl = document.getElementById('nlsm-datebar');

      // ---------- sponsor + footer ----------
      var ENTERPRISE_LOGO_URL = 'https://raw.githubusercontent.com/thenationalleague/tools/main/assets/partners/Enterprise.png';
      function renderSponsor() {
        var r = state.registration;
        var compId = userCompId() || DEFAULT_COMP_ID;
        var compName_ = compName(compId);
        var teamName  = (r && r.teamName) || '';
        var compCrest = '<img class="nlsm__sponsor-comp" src="' + compLogoUrl(compId) + '" alt="' + $h(compName_) + '" ' +
                          'title="' + $h(compName_) + '" ' +
                          'onerror="this.onerror=null;this.style.display=\'none\';">';
        var teamCrest = (r && r.crestUrl)
          ? '<img class="nlsm__sponsor-team" src="' + $h(r.crestUrl) + '" alt="' + $h(teamName || 'My team') + '" ' +
              'title="' + $h(teamName) + ' &middot; ' + $h(compName_) + '" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">'
          : '';
        sponsorEl.innerHTML =
          '<div class="nlsm__sponsor-left">' +
            '<img class="nlsm__sponsor-logo" src="' + ENTERPRISE_LOGO_URL + '" alt="Enterprise" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">' +
          '</div>' +
          '<span class="nlsm__sponsor-title">Man of the Match</span>' +
          '<div class="nlsm__sponsor-right">' +
            compCrest +
            teamCrest +
          '</div>';
      }
      function renderFooter() {
        footerEl.innerHTML =
          '<img src="' + ENTERPRISE_LOGO_URL + '" alt="Enterprise" ' +
            'onerror="this.onerror=null;this.style.display=\'none\';">';
      }

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
        return FB_SDK.reduce(function (p, name) {
          return p.then(function () { return loadScript(FB_SDK_URL + name); });
        }, Promise.resolve());
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
      function fmtBSTDateShort(d) {
        if (!d) return '';
        return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', timeZone:'Europe/London' });
      }
      function showBanner(msg, kind) {
        banner.className = 'nlsm__banner' + (kind === 'err' ? ' is-err' : kind === 'ok' ? ' is-ok' : '');
        banner.textContent = msg; banner.hidden = false;
      }
      function hideBanner() { banner.hidden = true; }
      function setBannerOK(msg) {
        showBanner(msg, 'ok');
        setTimeout(function () {
          if (banner.textContent === msg) hideBanner();
        }, 2200);
      }
      function crestImg(url, alt, size) {
        var s = size || 26;
        if (!url) return '<span style="display:inline-block;width:' + s + 'px;height:' + s + 'px;flex:none;"></span>';
        return '<img src="' + $h(url) + '" alt="' + $h(alt || '') + '" ' +
               'onerror="this.onerror=null;this.style.visibility=\'hidden\';">';
      }
      // Compact "in 1h 23m" / "in 45m" style countdown
      function relSoon(ms) {
        if (ms <= 0) return 'now';
        var mins = Math.round(ms / 60000);
        if (mins < 60) return 'in ' + mins + 'm';
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        if (h < 24) return 'in ' + h + 'h' + (m ? ' ' + m + 'm' : '');
        var days = Math.round(h / 24);
        return 'in ' + days + 'd';
      }

      // ---------- sim mode (URL-driven, same contract as the Score Predictor) ----------
      //   (no param)      -> real clock, bar hidden (production)
      //   ?sim=true|bar   -> bar visible, live clock
      //   ?sim=<datetime> -> bar visible, clock frozen at that moment
      //   ?sim=off        -> real clock, bar hidden (explicit form)
      function parseSimMode() {
        var p = new URLSearchParams(window.location.search).get('sim');
        if (p == null) return { fixed: null, barEnabled: false };
        var l = p.toLowerCase();
        if (l === 'off' || l === 'none' || l === '0' || l === 'false') return { fixed: null, barEnabled: false };
        if (l === 'true' || l === 'bar' || l === '1' || l === 'on') return { fixed: null, barEnabled: true };
        var d = new Date(p);
        return { fixed: isNaN(d.getTime()) ? null : d, barEnabled: true };
      }

      // ---------- state ----------
      var fbApp = null, fbDb = null, fbAuth = null;
      var state = {
        user: null, fbAuthed: false,
        allMatches: [],
        matches: [],        // user-team-only matches for selected matchday (usually 1)
        registration: null,
        allVotesRaw: {},    // { jwtId: { matchId: { playerId, ... } } }
        myVotes: {},        // { matchId: vote }
        drafts: {},         // { matchId: playerId } — pending unsaved pick
        editing: {},        // { matchId: true } — re-open submitted vote
        pendingMid: null,   // matchId we're writing right now
        players: {},        // matchId -> { loading, error, list: [{playerId, name, teamId, teamName, shirt, position, status}] }
        clubsByOpta: {},    // teamID (e.g. 't434') -> { name, code, colors:{primary,secondary,tertiary}, ... }
        selectedMatchday: null,
        seasonId: null,     // from clubs-meta seasons.current (or derived / ?season)
        sim: { fixed: null, barEnabled: false }
      };

      // Team palette from clubs-meta, with brand-safe fallback.
      function getTeamPalette(teamId) {
        var c = state.clubsByOpta[teamId];
        var cols = c && c.colors;
        return {
          primary:   (cols && cols.primary)   || 'var(--navy)',
          secondary: (cols && cols.secondary) || 'var(--white)',
          tertiary:  (cols && cols.tertiary)  || 'var(--primary)'
        };
      }
      function fetchClubsMeta() {
        return fetch(CLUBS_META_URL, { credentials:'omit', cache:'no-store' })
          .then(function (r) { if (!r.ok) throw new Error('clubs-meta ' + r.status); return r.json(); })
          .then(function (json) {
            var clubs = (json && json.clubs) || [];
            var map = {};
            clubs.forEach(function (c) { if (c && c.optaID) map[c.optaID] = c; });
            state.clubsByOpta = map;
            var cur = json && json.seasons && json.seasons.current;
            if (cur && /^\d{4}$/.test(String(cur))) state.seasonId = Number(cur);
          })
          .catch(function () { state.clubsByOpta = {}; });
      }

      function simNow() {
        return state.sim.fixed ? new Date(state.sim.fixed.getTime()) : new Date();
      }
      function setSimFixed(d) { state.sim.fixed = d; recomputeMatchday(); renderAll(); }
      function clearSimFixed() { setSimFixed(null); }
      function renderAll() {
        renderDatebar(); renderSimBar(); renderHero();
        renderFixtures(); renderTally();
      }

      // ---------- matchday derivation (own-team only) ----------
      function bstDateOf(d) {
        if (!d) return '';
        return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      }
      function matchMatchdayKey(m) { return bstDateOf(koOf(m)); }
      // Only matchdays where the user's own team plays
      function uniqueMatchdayKeys() {
        var reg = state.registration;
        if (!reg) return [];
        var seen = {};
        (state.allMatches || []).forEach(function (m) {
          if (!isOwnTeamMatch(m, reg)) return;
          var k = matchMatchdayKey(m); if (k) seen[k] = true;
        });
        return Object.keys(seen).sort();
      }
      // Default to the most recently kicked-off match (likely in the voting window
      // or just closed). Fall back to the next upcoming match.
      function defaultMatchdayKey() {
        var keys = uniqueMatchdayKeys();
        if (!keys.length) return '';
        var now = simNow();
        var today = bstDateOf(now);
        // Prefer a matchday whose match is currently in the voting window
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var matches = (state.allMatches || []).filter(function (m) {
            return isOwnTeamMatch(m, state.registration) && matchMatchdayKey(m) === k;
          });
          for (var j = 0; j < matches.length; j++) {
            if (stateOf(matches[j], now) === 'voting') return k;
          }
        }
        // Else: today if it's in the set
        if (keys.indexOf(today) !== -1) return today;
        // Else: next upcoming
        for (var p = 0; p < keys.length; p++) {
          if (keys[p] >= today) return keys[p];
        }
        return keys[keys.length - 1];
      }
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
        var reg = state.registration;
        state.matches = (state.allMatches || []).filter(function (m) {
          if (!reg || !isOwnTeamMatch(m, reg)) return false;
          return matchMatchdayKey(m) === key;
        }).sort(function (a, b) { return dateOf(a).localeCompare(dateOf(b)); });
        recomputeMyVotes();
        // Lazy-fetch players for any match in voting/closed state (or imminent)
        var now = simNow();
        state.matches.forEach(function (m) {
          var s = stateOf(m, now);
          if (s === 'voting' || s === 'closed') {
            ensurePlayers(m.id);
          }
        });
      }
      function recomputeMyVotes() {
        if (!state.user) return;
        state.myVotes = state.allVotesRaw[state.user.id] || {};
      }

      // ---------- match state ----------
      function dateOf(m) {
        var a = (m && m.attributes) || {};
        return String(a.kickOffDateUTC || a.kickoffDateUTC || a.kickOffDate || a.kickoffDate || a.date || '');
      }
      function koOf(m) { return normaliseUtc(dateOf(m)); }
      function periodOf(m) { return ((m && m.attributes && m.attributes.matchPeriod) || '').toLowerCase(); }
      // Voting is gated on the match actually being FINISHED, not on the clock:
      // NLS must report FullTime/PostMatch. A game that is abandoned, or whose
      // feed never publishes a final period, therefore never opens for voting —
      // there is no man of the match for a match that did not finish.
      function stateOf(m, now) {
        var p = periodOf(m);
        if (p === 'postponed') return 'postponed';
        if (p === 'abandoned') return 'abandoned';
        var ko = koOf(m); if (!ko) return 'unknown';
        var diffMin = (now - ko) / 60000;
        if (diffMin < 0) return 'pre';
        var isFT = (p === 'fulltime' || p === 'postmatch');
        if (!isFT) {
          // Kicked off but no final period yet: in play, or a stalled/abandoned
          // feed once we are well past any plausible finish.
          return diffMin > STALE_LIVE_MIN ? 'unresolved' : 'live';
        }
        if (diffMin < VOTE_CLOSE_MIN) return 'voting';   // full time -> KO+24h
        return 'closed';
      }
      // Season actually in force: ?season override, else clubs-meta, else derived.
      function activeSeasonId() {
        return seasonOverride() || state.seasonId || deriveSeasonId(simNow());
      }
      function isOwnTeamMatch(m, reg) {
        return reg && (m.attributes.homeTeam.teamID === reg.teamId || m.attributes.awayTeam.teamID === reg.teamId);
      }

      // ---------- multi-comp lookup ----------
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
      function compLogoUrl(compId) {
        var c = COMPS[compId] || COMPS[DEFAULT_COMP_ID];
        return 'https://raw.githubusercontent.com/thenationalleague/tools/main/assets/divisions/' + c.logoFile;
      }
      function compName(compId) {
        var c = COMPS[compId] || COMPS[DEFAULT_COMP_ID];
        return c.name;
      }

      // ---------- fixtures fetch ----------
      function fetchFixtures() {
        return Promise.all(COMP_IDS.map(fetchCompetition))
          .then(function (results) {
            var all = [].concat.apply([], results);
            return all.sort(function (a, b) { return dateOf(a).localeCompare(dateOf(b)); });
          });
      }
      function fetchCompetition(compId) {
        var all = [];
        function page(n) {
          var url = API_BASE + '/matches/?competitionID=' + compId + '&seasonID=' + activeSeasonId() +
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

      // ---------- player list (lazy, per match) ----------
      function ensurePlayers(matchId) {
        var entry = state.players[matchId];
        if (entry && (entry.loading || entry.list)) return; // already loading or loaded
        state.players[matchId] = { loading: true };
        fetch(API_BASE + '/matches/' + matchId, { credentials:'omit' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (json) {
            var teams = (json && json.data && json.data.attributes && json.data.attributes.matchTeams) || [];
            var list = [];
            teams.forEach(function (team) {
              var teamID = team.teamID;
              var teamName = (team.team && team.team.teamName) || '';
              var all = (team.players && team.players.Start || []).concat((team.players && team.players.Sub) || []);
              all.forEach(function (p) {
                var pn = p.playerName || {};
                var name = pn.knownName || pn.customKnownName || ((pn.firstName || '') + ' ' + (pn.lastName || '')).trim();
                if (!name) name = 'Player ' + p.playerID;
                list.push({
                  playerId:  p.playerID,
                  name:      name,
                  shirt:     p.shirtNumber,
                  position:  (p.playerPosition === 'Substitute' && p.playerSubPosition) ? p.playerSubPosition : p.playerPosition,
                  status:    p.playerStatus,
                  teamId:    teamID,
                  teamName:  teamName
                });
              });
            });
            state.players[matchId] = { list: list };
            // Re-render the matching row + tally now that names are in
            renderFixtures();
            renderTally();
          })
          .catch(function (err) {
            state.players[matchId] = { error: err.message || String(err) };
            renderFixtures();
          });
      }
      function findPlayer(matchId, playerId) {
        var entry = state.players[matchId];
        if (!entry || !entry.list) return null;
        for (var i = 0; i < entry.list.length; i++) {
          if (entry.list[i].playerId === playerId) return entry.list[i];
        }
        return null;
      }

      // ---------- registration ----------
      function teamOptionsByComp() {
        var byComp = {};
        (state.allMatches || []).forEach(function (m) {
          var c = m.attributes.competitionID;
          if (!byComp[c]) byComp[c] = {};
          [m.attributes.homeTeam, m.attributes.awayTeam].forEach(function (t) {
            if (!byComp[c][t.teamID]) {
              byComp[c][t.teamID] = { id: t.teamID, name: t.name, shortName: t.shortName, crest: t.crest, compId: c };
            }
          });
        });
        var grouped = [];
        COMP_IDS.forEach(function (c) {
          if (!byComp[c]) return;
          var arr = Object.keys(byComp[c]).map(function (id) { return byComp[c][id]; });
          arr.sort(function (a, b) { return a.name.localeCompare(b.name); });
          grouped.push({ compId: c, name: COMPS[c].name, teams: arr });
        });
        return grouped;
      }
      function allTeamsFlat() {
        var grouped = teamOptionsByComp();
        var flat = [];
        grouped.forEach(function (g) { flat = flat.concat(g.teams); });
        return flat;
      }
      // NL+ profile portal — where fans change their favourite team. After
      // updating it there they need to sign out and back in for the new
      // favourite_team JWT claim to reach this widget.
      var NLPLUS_PORTAL_URL = 'https://signin.thenationalleague.org.uk/';

      // The supported club is NOT locked for the season and is not stored as a
      // registration the fan has to confirm. It is read from the NL+ SSO
      // favourite_team claim on every load, so changing it in the NL+ profile
      // (then signing back in) is all it takes to follow a different club. The
      // widget keeps a users/{jwtId} record for the name/email a Team of the
      // Week quote needs, but nothing gates on it.
      function normClubName(s) {
        return String(s || '').toLowerCase()
          .replace(/&/g, 'and')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      }
      // clubs-meta short name for a teamID ('Forest Green'), used in the
      // "not a X fan?" prompt so it reads the way a fan would say it.
      function clubShort(teamId, fallback) {
        var c = state.clubsByOpta[teamId];
        return (c && (c.short || c.name)) || fallback || '';
      }
      // Match the JWT's favourite_team against this season's teams. Tries the
      // NLS name, then the clubs-meta name/short, all normalised — the claim is
      // free text set in another system, so exact equality is too brittle.
      function resolveTeamFromSso() {
        var fav = state.user && state.user.favTeamName;
        if (!fav) return null;
        var want = normClubName(fav);
        if (!want) return null;
        var flat = allTeamsFlat();
        for (var i = 0; i < flat.length; i++) {
          var t = flat[i];
          var meta = state.clubsByOpta[t.id] || {};
          var candidates = [t.name, t.shortName, meta.name, meta.short];
          for (var k = 0; k < candidates.length; k++) {
            if (candidates[k] && normClubName(candidates[k]) === want) {
              return { teamId: t.id, teamName: t.name, crestUrl: t.crest || '' };
            }
          }
        }
        return null;
      }
      // Keep a lightweight record of who voted — the Team of the Week article
      // quotes notes, which needs a name against them. Fire-and-forget: a
      // failure here must never block voting.
      function upsertUserRecord() {
        var r = state.registration;
        if (!r || !fbDb || !state.user) return;
        fbDb.ref('users/' + state.user.id).update({
          teamId: r.teamId, teamName: r.teamName, crestUrl: r.crestUrl,
          forename: state.user.forename, surnameInitial: state.user.surnameInitial,
          email: state.user.email || '',
          lastSeenAt: firebase.database.ServerValue.TIMESTAMP
        }).catch(function () {});
      }

      // Shown when favourite_team is missing, or names a club outside the
      // National, North and South divisions this season. There is no dropdown
      // fallback by design: the club has to come from NL+ so it stays in sync
      // with the rest of the fan's profile.
      function renderNoTeamCard() {
        main.hidden = true; register.hidden = false;
        var fav = state.user && state.user.favTeamName;
        var lead = fav
          ? 'Your NL+ favourite team (<b>' + $h(fav) + '</b>) isn\'t in the National, North or South divisions this season.'
          : 'Your NL+ profile doesn\'t have a favourite team set yet.';
        register.innerHTML =
          '<div class="nlsm__register-card">' +
            '<div class="nlsm__hero" style="padding:0;">' +
              '<div class="nlsm__greetline">Man of the Match</div>' +
              '<h1>Welcome, ' + $h(state.user.forename) + '</h1>' +
            '</div>' +
            '<p style="color:var(--text-muted);font-size:14px;margin:6px 0 18px;">' + lead +
              ' Set a National League club in your NL+ details, then sign out and back in to vote.</p>' +
            '<a class="nlsm__btn" style="display:block;text-align:center;text-decoration:none;" ' +
               'href="' + $h(NLPLUS_PORTAL_URL) + '">Update your details</a>' +
          '</div>';
      }

      // ---------- datebar ----------
      function renderDatebar() {
        var keys = uniqueMatchdayKeys();
        if (!keys.length) { datebarEl.innerHTML = ''; return; }
        var active = currentMatchdayKey();
        var today  = bstDateOf(new Date());
        datebarEl.className = 'nlsm__datebar';
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
        var activeBtn = datebarEl.querySelector('button.is-active');
        if (activeBtn && activeBtn.scrollIntoView) {
          try { activeBtn.scrollIntoView({ behavior:'auto', inline:'center', block:'nearest' }); } catch (e) {}
        }
      }
      function enableDragScroll(el) {
        if (el.__nlsmDragWired) return;
        el.__nlsmDragWired = true;
        var down = false, startX = 0, startScroll = 0, scrolledBy = 0;
        el.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          down = true; scrolledBy = 0;
          startX = e.pageX;
          startScroll = el.scrollLeft;
          el.classList.add('is-dragging');
        });
        document.addEventListener('mousemove', function (e) {
          if (!down) return;
          var dx = e.pageX - startX;
          if (Math.abs(dx) > 12) {
            e.preventDefault();
            var newScroll = startScroll - dx;
            if (newScroll !== el.scrollLeft) {
              el.scrollLeft = newScroll;
              scrolledBy = Math.abs(el.scrollLeft - startScroll);
            }
          }
        });
        document.addEventListener('mouseup', function () {
          if (!down) return;
          down = false;
          el.classList.remove('is-dragging');
        });
        el.addEventListener('click', function (e) {
          if (scrolledBy > 4) { e.stopPropagation(); e.preventDefault(); }
          scrolledBy = 0;
        }, true);
      }

      // ---------- hero ----------
      function renderHero() {
        var key = currentMatchdayKey();
        if (!key) { hero.innerHTML = ''; return; }
        var midday = new Date(key + 'T12:00:00Z');
        var dateLabel = midday.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', timeZone:'Europe/London' });
        var r = state.registration;
        // The club is not locked — say so, and give them the way to change it.
        var swap = r
          ? '<div class="nlsm__swapline">Not a ' + $h(clubShort(r.teamId, r.teamName)) + ' fan? ' +
              '<a href="' + $h(NLPLUS_PORTAL_URL) + '">Update your details here</a></div>'
          : '';
        hero.className = 'nlsm__hero';
        hero.innerHTML =
          '<div class="nlsm__greetline">' + $h((state.user.forename || '').toUpperCase()) + '</div>' +
          '<h1>' + $h(dateLabel) + '</h1>' +
          swap;
      }

      // ---------- fixture rendering ----------
      function renderFixtures() {
        if (!state.matches.length) {
          // No own-team match on the selected matchday — either no fixtures
          // selected yet, or sim/navigation has wandered off-piste.
          fixtures.innerHTML =
            '<div class="nlsm__lockcard">' +
              'No ' + $h(state.registration ? state.registration.teamName : 'team') + ' match on this date.' +
            '</div>';
          return;
        }
        var now = simNow();
        fixtures.innerHTML = state.matches.map(function (m) { return rowHTML(m, now); }).join('');
        wireRow();
      }

      function rowHTML(m, now) {
        var a = m.attributes;
        var s = stateOf(m, now);
        var ko = koOf(m);
        var voteClose = ko ? new Date(ko.getTime() + VOTE_CLOSE_MIN * 60000) : null;
        var existing = state.myVotes[m.id];
        var draft    = state.drafts[m.id];
        var editing  = state.editing[m.id];

        // Meta strip
        var meta = '';
        var rowMod = '';
        if (s === 'pre') {
          meta = '<span>' + $h(fmtBST(ko)) + '</span>' +
                 '<span class="nlsm__lock">Voting opens at full time</span>';
        } else if (s === 'live') {
          meta = '<span class="nlsm__livedot" aria-hidden="true"></span><span class="nlsm__livelbl">Live</span>' +
                 '<span class="nlsm__lock">Voting opens at full time</span>';
        } else if (s === 'unresolved') {
          // Kicked off long ago with no final period published — abandoned, or a
          // stalled feed. Never opens for voting; heals itself if NLS catches up.
          meta = '<span class="nlsm__voidlbl">Awaiting result</span>' +
                 '<span class="nlsm__lock">No vote until full time</span>';
          rowMod = ' is-void';
        } else if (s === 'voting') {
          var closesIn = relSoon(voteClose - now);
          meta = '<span class="nlsm__votelbl">Vote open</span>' +
                 '<span class="nlsm__countdown">Closes ' + $h(closesIn) + '</span>';
          rowMod = ' is-voting';
        } else if (s === 'closed') {
          meta = '<span class="nlsm__ftlabel">Vote closed</span>' +
                 '<span class="nlsm__lock">Closed ' + $h(fmtBSTDateShort(voteClose)) + '</span>';
        } else if (s === 'postponed') {
          meta = '<span class="nlsm__voidlbl">Postponed</span><span style="opacity:.7;">No vote</span>';
          rowMod = ' is-void';
        } else if (s === 'abandoned') {
          meta = '<span class="nlsm__voidlbl">Abandoned</span><span style="opacity:.7;">No vote</span>';
          rowMod = ' is-void';
        }

        function scoreCell(side) {
          var real = (side === 'home' ? a.homeTeam : a.awayTeam).score;
          if (s === 'pre' || s === 'unresolved') return '<div class="nlsm__teamscore" style="color:var(--text-muted);">—</div>';
          return '<div class="nlsm__teamscore">' + (real != null ? real : '?') + '</div>';
        }
        function teamLine(t, side) {
          var full  = t.name || t.shortName || '';
          var short = t.shortName || t.name || '';
          return '<div class="nlsm__teamline">' +
            crestImg(t.crest, full) +
            '<span class="nlsm__tname">' +
              '<span class="nlsm__tname-full">'  + $h(full)  + '</span>' +
              '<span class="nlsm__tname-short">' + $h(short) + '</span>' +
            '</span>' +
            scoreCell(side) +
          '</div>';
        }

        // Action area
        var action = '';
        if (s === 'voting') {
          if (existing && !editing) {
            var p = findPlayer(m.id, existing.playerId);
            var displayName = (p && p.name) || existing.playerName || existing.playerId;
            action =
              '<div class="nlsm__voted">' +
                '<span class="nlsm__vlbl">Your pick</span>' +
                '<span class="nlsm__vname">' + $h(displayName) + '</span>' +
                '<button type="button" class="nlsm__editmini" data-edit="' + $h(m.id) + '">Change</button>' +
              '</div>' +
              (existing.note ? '<div class="nlsm__yournote">"' + $h(existing.note) + '"</div>' : '');
          } else {
            var draftForPicker = draft || (existing ? { playerId: existing.playerId, note: existing.note || '' } : null);
            action = pickerHTML(m, draftForPicker, !!existing);
          }
        } else if (s === 'closed') {
          if (existing) {
            var p2 = findPlayer(m.id, existing.playerId);
            var displayName2 = (p2 && p2.name) || existing.playerName || existing.playerId;
            action =
              '<div class="nlsm__voted is-locked">' +
                '<span class="nlsm__vlbl">Your pick</span>' +
                '<span class="nlsm__vname">' + $h(displayName2) + '</span>' +
              '</div>' +
              (existing.note ? '<div class="nlsm__yournote">"' + $h(existing.note) + '"</div>' : '');
          } else {
            action = '<div class="nlsm__lockcard">No vote submitted — window closed.</div>';
          }
        } else if (s === 'pre' || s === 'live' || s === 'unresolved') {
          // No action — the meta strip already says voting waits for full time.
        }

        var rowCls = 'nlsm__row';
        rowCls += rowMod;
        if (existing && s === 'voting' && !editing) rowCls += ' is-voted';

        return '<div class="' + rowCls + '">' +
          '<div class="nlsm__meta">' + meta + '</div>' +
          teamLine(a.homeTeam, 'home') +
          teamLine(a.awayTeam, 'away') +
          action +
        '</div>';
      }

      function pickerHTML(m, draft, hadVote) {
        var entry = state.players[m.id];
        if (!entry || entry.loading) {
          return '<div class="nlsm__lockcard"><span class="nlsm__inlinespin" aria-hidden="true"></span>Loading lineups...</div>';
        }
        if (entry.error) {
          return '<div class="nlsm__lockcard">Lineups not available yet. Check back soon.</div>';
        }
        var list = entry.list || [];
        if (!list.length) {
          return '<div class="nlsm__lockcard">Lineups not posted for this match.</div>';
        }
        var selectedPid = (draft && draft.playerId) || '';
        var noteVal     = (draft && draft.note) || '';
        var a = m.attributes;

        function teamCol(team) {
          var palette = getTeamPalette(team.teamID);
          var ps = list.filter(function (p) { return p.teamId === team.teamID; });
          // Starters first then subs (by shirt number within each group)
          ps.sort(function (x, y) {
            var sx = x.status === 'Start' ? 0 : 1;
            var sy = y.status === 'Start' ? 0 : 1;
            if (sx !== sy) return sx - sy;
            var nx = x.shirt == null ? 999 : x.shirt;
            var ny = y.shirt == null ? 999 : y.shirt;
            return nx - ny;
          });
          var seenSub = false;
          var rows = ps.map(function (p) {
            var isSub = p.status !== 'Start';
            var divider = '';
            if (isSub && !seenSub) { seenSub = true; divider = '<div class="nlsm__subdiv">Subs</div>'; }
            var shirt = p.shirt != null ? '#' + p.shirt : '';
            var cls = 'nlsm__player' + (isSub ? ' is-sub' : '') + (p.playerId === selectedPid ? ' is-selected' : '');
            return divider +
              '<button type="button" class="' + cls + '" ' +
                  'data-pick="' + $h(m.id) + '" data-pid="' + $h(p.playerId) + '" ' +
                  'aria-pressed="' + (p.playerId === selectedPid ? 'true' : 'false') + '">' +
                '<span class="nlsm__pshirt">' + $h(shirt) + '</span>' +
                '<span class="nlsm__pname">' + $h(p.name) + '</span>' +
              '</button>';
          }).join('');
          var teamLabel = team.shortName || team.name || '';
          return '<div class="nlsm__teamcol" style="--team-primary:' + $h(palette.primary) + ';--team-secondary:' + $h(palette.secondary) + ';">' +
            '<div class="nlsm__teamhead">' +
              (team.crest ? '<img src="' + $h(team.crest) + '" alt="" onerror="this.style.display=\'none\';">' : '') +
              '<span class="nlsm__thname">' + $h(teamLabel) + '</span>' +
            '</div>' +
            '<div class="nlsm__plist">' + (rows || '<div class="nlsm__subdiv" style="text-align:center;padding:10px 6px;">No squad listed</div>') + '</div>' +
          '</div>';
        }

        var hint = hadVote ? 'Tap a player to update' : 'Tap a player from either side';
        var noteLen = noteVal.length;
        var notedID = 'nlsm-note-' + m.id;
        return '<div class="nlsm__picker">' +
          '<label>Man of the Match</label>' +
          '<div class="nlsm__teampick">' +
            teamCol(a.homeTeam) +
            teamCol(a.awayTeam) +
          '</div>' +
          '<div class="nlsm__note">' +
            '<textarea id="' + notedID + '" data-note="' + $h(m.id) + '" ' +
              'maxlength="' + NOTE_MAX + '" rows="2" ' +
              'placeholder="Add a note (optional) — may be quoted in our Team of the Week article">' +
              $h(noteVal) +
            '</textarea>' +
            '<div class="nlsm__notefoot">' +
              '<span class="nlsm__notedisc">Optional — your note may be quoted in our Team of the Week article.</span>' +
              '<span class="nlsm__notecount' + (noteLen >= NOTE_MAX ? ' is-max' : '') + '" data-count="' + $h(m.id) + '">' + noteLen + '/' + NOTE_MAX + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="nlsm__pickactions">' +
            '<span class="nlsm__pickhint">' + $h(hint) + '</span>' +
            (hadVote ? '<button type="button" class="nlsm__btn-cancel" data-cancel="' + $h(m.id) + '">Cancel</button>' : '') +
            '<button type="button" class="nlsm__btn-save" data-save="' + $h(m.id) + '"' + (selectedPid ? '' : ' disabled') + '>Save vote</button>' +
          '</div>' +
        '</div>';
      }

      function wireRow() {
        Array.prototype.forEach.call(fixtures.querySelectorAll('button.nlsm__player[data-pick]'), function (btn) {
          btn.addEventListener('click', function () {
            var mid = btn.getAttribute('data-pick');
            var pid = btn.getAttribute('data-pid');
            var d = state.drafts[mid] || {};
            d.playerId = pid;
            state.drafts[mid] = d;
            // Update selection state in-place to avoid losing textarea focus.
            var others = fixtures.querySelectorAll('button.nlsm__player[data-pick="' + mid + '"]');
            Array.prototype.forEach.call(others, function (b) {
              var on = b.getAttribute('data-pid') === pid;
              b.classList.toggle('is-selected', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            var saveBtn = fixtures.querySelector('button[data-save="' + mid + '"]');
            if (saveBtn) saveBtn.disabled = false;
          });
        });
        Array.prototype.forEach.call(fixtures.querySelectorAll('textarea[data-note]'), function (ta) {
          ta.addEventListener('input', function () {
            var mid = ta.getAttribute('data-note');
            var v = ta.value || '';
            if (v.length > NOTE_MAX) { v = v.slice(0, NOTE_MAX); ta.value = v; }
            var d = state.drafts[mid] || {};
            d.note = v;
            state.drafts[mid] = d;
            var counter = fixtures.querySelector('[data-count="' + mid + '"]');
            if (counter) {
              counter.textContent = v.length + '/' + NOTE_MAX;
              counter.classList.toggle('is-max', v.length >= NOTE_MAX);
            }
          });
        });
        Array.prototype.forEach.call(fixtures.querySelectorAll('button[data-save]'), function (b) {
          b.addEventListener('click', function () {
            var mid = b.getAttribute('data-save');
            saveVote(mid);
          });
        });
        Array.prototype.forEach.call(fixtures.querySelectorAll('button[data-cancel]'), function (b) {
          b.addEventListener('click', function () {
            var mid = b.getAttribute('data-cancel');
            delete state.editing[mid];
            delete state.drafts[mid];
            renderFixtures();
          });
        });
        Array.prototype.forEach.call(fixtures.querySelectorAll('button[data-edit]'), function (b) {
          b.addEventListener('click', function () {
            var mid = b.getAttribute('data-edit');
            state.editing[mid] = true;
            var existing = state.myVotes[mid];
            if (existing) {
              state.drafts[mid] = {
                playerId: existing.playerId,
                note: existing.note || ''
              };
            }
            renderFixtures();
          });
        });
      }

      function saveVote(mid) {
        var d = state.drafts[mid] || {};
        var pid = d.playerId;
        if (!pid) return;
        var m = state.matches.filter(function (x) { return x.id === mid; })[0];
        if (!m) return;
        if (stateOf(m, simNow()) !== 'voting') {
          showBanner('Voting window has closed.', 'err');
          return;
        }
        var p = findPlayer(mid, pid);
        if (!p) {
          showBanner('Player not in lineup.', 'err');
          return;
        }
        // Clear edit flag up front so the listener re-render doesn't leave the
        // row stuck in the picker after the write succeeds.
        delete state.editing[mid];
        state.pendingMid = mid;

        var note = (d.note || '').trim().slice(0, NOTE_MAX);
        var payload = {
          playerId:    pid,
          playerName:  p.name,
          teamId:      p.teamId,
          submittedAt: firebase.database.ServerValue.TIMESTAMP
        };
        if (note) payload.note = note;
        fbDb.ref('motm/' + state.user.id + '/' + mid).set(payload)
          .then(function () {
            delete state.drafts[mid];
            state.pendingMid = null;
            setBannerOK('Vote saved');
            renderFixtures();
            renderTally();
          })
          .catch(function (err) {
            state.editing[mid] = true;
            state.pendingMid = null;
            renderFixtures();
            showBanner('Vote failed: ' + err.message, 'err');
          });
      }

      // ---------- per-match standings ----------
      // Deliberately hides absolute vote counts to avoid the "2 votes" sad-face
      // when turnout is low. Shows the top 5 names ranked by votes (sorted then
      // ordered) and a "Leading" pill on #1 only when there's a clear leader
      // (strictly more votes than #2). Ties at the top get no leader badge —
      // it would just shout "no clear leader" if e.g. 3 fans each picked a
      // different player.
      var TALLY_TOP_N = 5;
      function renderTally() {
        if (!state.matches.length) { tallyEl.innerHTML = ''; return; }
        var now = simNow();
        var target = null;
        for (var i = 0; i < state.matches.length; i++) {
          var st = stateOf(state.matches[i], now);
          if (st === 'voting' || st === 'closed') { target = state.matches[i]; break; }
        }
        if (!target) { tallyEl.innerHTML = ''; return; }
        var entry = state.players[target.id];
        if (!entry || !entry.list) { tallyEl.innerHTML = ''; return; }

        var counts = {};
        var totalVotes = 0;
        Object.keys(state.allVotesRaw).forEach(function (jwtId) {
          var v = state.allVotesRaw[jwtId] && state.allVotesRaw[jwtId][target.id];
          if (!v || !v.playerId) return;
          counts[v.playerId] = (counts[v.playerId] || 0) + 1;
          totalVotes += 1;
        });
        var s = stateOf(target, now);
        var statusLabel = s === 'voting' ? 'Man of the Match — Live' : 'Man of the Match — Final';
        var matchLabel  = $h(target.attributes.homeTeam.name) + ' v ' + $h(target.attributes.awayTeam.name);

        if (!totalVotes) {
          tallyEl.className = 'nlsm__tally';
          tallyEl.innerHTML =
            '<div class="nlsm__tallyhead">' +
              '<div class="nlsm__kicker">' + $h(statusLabel) + '</div>' +
              '<div class="nlsm__tsub">' + matchLabel + '</div>' +
            '</div>';
          return;
        }

        var rows = Object.keys(counts).map(function (pid) {
          var p = findPlayer(target.id, pid);
          return {
            playerId: pid,
            name:     (p && p.name) || pid,
            teamId:   p && p.teamId,
            teamName: p && p.teamName,
            votes:    counts[pid]  // used to sort; never rendered
          };
        }).sort(function (a, b) {
          if (b.votes !== a.votes) return b.votes - a.votes;
          return a.name.localeCompare(b.name);
        }).slice(0, TALLY_TOP_N);

        var topVotes    = rows[0].votes;
        var secondVotes = rows[1] ? rows[1].votes : 0;
        var hasClearLeader = (rows.length === 1) || (topVotes > secondVotes);
        var youPick = state.myVotes[target.id] && state.myVotes[target.id].playerId;

        var inner =
          '<div class="nlsm__tallyhead">' +
            '<div class="nlsm__kicker">' + $h(statusLabel) + '</div>' +
            '<div class="nlsm__tsub">' + matchLabel + '</div>' +
          '</div>' +
          rows.map(function (r, i) {
            var isLeader = hasClearLeader && i === 0;
            var isYou    = r.playerId === youPick;
            var cls = 'nlsm__trow';
            if (isLeader) cls += ' is-leader';
            if (isYou)    cls += ' is-you-pick';
            var pills = '';
            if (isLeader) pills += '<span class="nlsm__leadpill">Leading</span>';
            if (isYou)    pills += '<span class="nlsm__youpill">Your pick</span>';
            return '<div class="' + cls + '">' +
              '<span class="nlsm__rank">' + (i + 1) + '</span>' +
              '<span class="nlsm__pname">' + $h(r.name) + '</span>' +
              '<span class="nlsm__ptag">' + $h(r.teamName || '') + '</span>' +
              pills +
            '</div>';
          }).join('');

        tallyEl.className = 'nlsm__tally';
        tallyEl.innerHTML = inner;
      }

      // ---------- sim bar ----------
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
          ? 'Sim &middot; ' + d.toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/London' }) + ' BST'
          : 'Live clock';
        simEl.className = 'nlsm__simbar';
        simEl.innerHTML =
          '<span class="nlsm__simlbl">Sim now</span>' +
          '<input type="date" id="nlsm-sim-date" value="' + $h(dateInputValue(d)) + '">' +
          '<input type="time" id="nlsm-sim-time" value="' + $h(timeInputValue(d)) + '" step="60">' +
          '<button id="nlsm-sim-now" class="nlsm__sim-now-btn">Now</button>' +
          '<span class="nlsm__clock">' + live + '</span>';
        var dateInput = document.getElementById('nlsm-sim-date');
        var timeInput = document.getElementById('nlsm-sim-time');
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
        document.getElementById('nlsm-sim-now').addEventListener('click', clearSimFixed);
      }

      // ---------- RTDB listeners ----------
      // Only votes are listened to. The supported club comes from SSO on every
      // load, so there is no users/ subscription and nothing to wait for before
      // the UI can render.
      function listenAll() {
        fbDb.ref('motm').on('value', function (snap) {
          state.allVotesRaw = snap.val() || {};
          recomputeMyVotes();
          if (!main.hidden) {
            // Don't yank focus from a user mid-vote (textarea / player tap).
            // Their own save path re-renders explicitly when the write returns.
            var midEdit = fixtures.contains(document.activeElement);
            if (!midEdit) renderFixtures();
            renderTally();
          }
        });
      }

      // ---------- gate ----------
      var gateEl = document.getElementById('nlsm-gate');
      function renderGateLoading() {
        gateEl.hidden = false;
        register.hidden = true;
        main.hidden = true;
        hideBanner();
        gateEl.innerHTML =
          '<div class="nlsm__gate-card">' +
            '<img class="nlsm__gate-mark" src="' + NLPLUS_LOGO_URL + '" alt="NL+" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">' +
            '<div class="nlsm__gate-spinner" aria-hidden="true"></div>' +
            '<h2>Man of the Match</h2>' +
            '<p>Loading...</p>' +
          '</div>';
      }
      function renderGateSignIn() {
        gateEl.hidden = false;
        register.hidden = true;
        main.hidden = true;
        hideBanner();
        gateEl.innerHTML =
          '<div class="nlsm__gate-card">' +
            '<img class="nlsm__gate-mark" src="' + NLPLUS_LOGO_URL + '" alt="NL+" ' +
              'onerror="this.onerror=null;this.style.display=\'none\';">' +
            '<h2>Sign in with NL+ to vote</h2>' +
            '<p>Pick the Man of the Match after every one of your team\'s games. Voting opens 2.5 hours after kick-off.</p>' +
            '<a class="nlsm__btn" href="' + $h(signInHref()) + '">Sign in with NL+</a>' +
          '</div>';
      }
      function hideGate() { gateEl.hidden = true; gateEl.innerHTML = ''; }

      function signInHref() {
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
        renderSponsor();
        renderFooter();
        renderGateLoading();
        waitForJwt(4000).then(function (claims) {
          if (!claims || !claims.id) { renderGateSignIn(); return; }
          startSignedIn(claims);
        });
      })();

      function startSignedIn(claims) {
        // Parse sim up front: the season fallback derives from the sim clock, so
        // a frozen date must be in place before fixtures are requested.
        state.sim = parseSimMode();
        state.user = {
          id: claims.id,
          forename: claims.forename || 'there',
          surname:  claims.surname  || '',
          surnameInitial: (claims.surname || '').charAt(0).toUpperCase(),
          email:    claims.email    || '',
          favTeamName: claims.favourite_team || null
        };

        Promise.all([
          loadFirebase().then(function () {
            var exists = firebase.apps && firebase.apps.some(function (a) { return a.name === APP_NAME; });
            fbApp  = exists ? firebase.app(APP_NAME) : firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);
            fbAuth = firebase.auth(fbApp);
            fbDb   = firebase.database(fbApp);
            return fbAuth.signInAnonymously();
          }).then(function () { state.fbAuthed = true; }),
          // clubs-meta first: it carries seasons.current, which the fixtures
          // request needs, and the club colours/short names the UI reads.
          fetchClubsMeta().then(function () {
            return fetchFixtures();
          }).then(function (ms) {
            state.allMatches = ms;
            teamCompCache = null;
          })
        ]).then(function () {
          hideBanner();
          // Club comes from the SSO claim, resolved against this season's teams.
          state.registration = resolveTeamFromSso();
          hideGate();
          if (!state.registration) { renderNoTeamCard(); return; }
          register.hidden = true; main.hidden = false;
          upsertUserRecord();
          renderSponsor();
          recomputeMatchday();
          renderAll();
          listenAll();
          // Keep "voting opens / closes in Xm" labels fresh
          setInterval(function () {
            if (!main.hidden) {
              renderFixtures();
            }
          }, 60000);
        }).catch(function (err) {
          showBanner('Could not start MOTM: ' + (err && err.message ? err.message : err), 'err');
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
