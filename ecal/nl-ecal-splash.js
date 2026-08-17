/* ============================================================================
   NL ECAL Club-Aware Splash / Interstitial — external script (GTM-safe)
   Version: v8.9
   Date: 17/08/2026
   Commit this to the repo as:  ecal/nl-ecal-splash.js
   Deploy via GTM Custom HTML tag (All Pages) with ONE line:
     <script src="https://nl.tools/ecal/nl-ecal-splash.js"></script>
   (v8.5: served from nl.tools, our own domain. The old jsdelivr URL died when
   the repo moved to the org as nl-tools — and jsdelivr cannot serve a private
   repo, which this one is about to become. The GTM tag must be repointed.)
   (v8.6: the ad click yields to ECAL's modal robustly — our overlay can no
   longer intercept the clicks inside ECAL's popup. See the wiring below.)
   (No inline JS in the tag => GTM's HTML validator has nothing to flag.)

   Behaviour identical to the v7.1 inline build:
   - Site-wide, fires on any first page of the day; once per DAY per device.
   - Skips ticketing/checkout + sign-in/account (CONFIG.EXCLUDE_PATHS).
   - Club from NL+ SSO JWT (cookie _gc_sa_sso_access, claim favourite_team).
   - Square "<CLUB> - 1x1.png" centred as the ECAL sync button; dismiss via
     X / backdrop / Esc; clicking the ad fires ECAL and drops the dimmer.
   - GA4 dataLayer events: nl_splash_shown | _dismissed | _synced (club-tagged).

   Preview: nlEcalSetTestClub('Torquay United') then reload;
            ?ecalSplash=1 forces past the daily cap; ?ecalDebug=1 traces.

   NOTE ON UPDATES: jsDelivr caches @main aggressively. After pushing a change,
   purge it via https://www.jsdelivr.com/tools/purge (or append ?v=N to the src
   during testing) so the new version is served.

   CHANGELOG
   v8.9 — v8.8 called initButtons() once, as soon as it existed — too early.
          EcalWidget.initButtons is defined the moment ECAL's script parses, but
          its widget data loads asynchronously afterwards (boot / continueBoot /
          loadButtons in their API), so that first call scanned with nothing
          loaded and bound nothing. The console proved it: "initButtons() —
          button bound" logged, and the click still only fired our own handler.
          Running it by hand a minute later worked because ECAL had finished
          booting by then. The call is idempotent, so it now REPEATS every 400ms
          while the splash is open (~10s cap, stops on close) and catches
          whichever tick ECAL finishes on. Debug logs the widget count per
          attempt so the boot moment is visible.
   v8.8 — CRITICAL FIX: the ad now opens ECAL on pages that carry the banner.
          ECAL binds .ecal-sync-widget-button elements when its script scans the
          DOM and never re-scans. Our button is injected late (DOMContentLoaded
          + 650ms + up to 2.5s of JWT wait), so on any page where ECAL was
          ALREADY loaded — every page with the banner advert, where bootEcal
          returns early by design — the scan had long finished and our button
          was never bound. Clicking it hit only our close handler: the splash
          closed, no modal. That is the "it just closes" report, and it was
          never a click-timing problem (v8.6/v8.7 chased that).
          New bindEcalButton() calls EcalWidget.initButtons() after the button
          is complete, polling ~6s because ECAL may still be loading. Verified
          live: initButtons() by hand then clicking the ad opens the modal.
   v8.7 — CRITICAL FIX: the ad click opens ECAL again. v8.6 yielded on pointerdown
          (capture) — it set the overlay pointer-events:none BEFORE the click's
          hit-test, so the click never landed on the button and ECAL's own click
          handler never fired: the dimmer faded and it "just closed" without ever
          opening the calendar modal. Removed the pointerdown hook. yieldToEcal now
          runs on CLICK only, after the browser has already delivered that same
          click to ECAL — so ECAL opens and our overlay stops intercepting from
          that point on. This is the v8.4 timing (let the click land, then get out
          of the way) with v8.6's pointer-transparency instead of a fade+hide.
   v8.6 — (regressed the click; see v8.7.) Intended: the ad click yields to ECAL's
          modal robustly so our overlay can no longer intercept clicks inside it.
   v8.4 — Auto-close made reliable. Removed the hover/touch/keypress "engagement"
          cancels (a mobile scroll-swipe was landing as a touch on the modal and
          cancelling the timer, so it never closed). The 8s timer now always runs
          and is cancelled ONLY when the splash actually closes — ad click, X,
          backdrop, Esc, or the timeout itself. Clicking the ad still cancels via
          close(), so ECAL's popup is never affected.
   v8.3 — Auto-dismiss: the splash now closes itself after CONFIG.AUTO_CLOSE_MS
          (default 8s) if untouched — a hard guarantee against ever locking the
          page. The timer is cancelled the moment the fan engages (hovers or taps
          the ad, presses a key, or dismisses), so it's never yanked away mid-
          interaction. Auto-closes log as dismissed with method 'timeout' in GA4.
          Set AUTO_CLOSE_MS to 0 to disable.
   v8.2 — Square splash assets are now JPG (smaller for solid-gradient creatives;
          no transparency needed). IMAGE_SUFFIX -> " - 1x1.jpg". Upload the JPGs
          to the same ecal/ folder with identical names, e.g.
          "Torquay United - 1x1.jpg", "National League - 1x1.jpg".
   v8.1 — CRITICAL FIX: the overlay's id rule (#nl-ecal-splash{display:flex})
          out-specified the browser's [hidden] rule, so the full-screen dimmer
          stayed in the DOM at zero opacity on suppressed/closed states —
          invisible but capturing every click and trapping the page. Added
          #nl-ecal-splash[hidden]{display:none!important} and a
          :not(.nl-splash--in){pointer-events:none} safety net so the overlay
          can never block the page unless it is actually open. No other change.
   v8.0 — Externalised the v7.1 inline tag into a hosted, self-injecting script
          so the GTM Custom HTML tag is a single <script src> (clears GTM's
          "Invalid HTML" validation). Builds its own <style> + DOM on load.
          No behaviour change from v7.1.
============================================================================ */
(function(){
  "use strict";
  if (window.__NL_SPLASH_ACTIVE) return;
  window.__NL_SPLASH_ACTIVE = true;

  var CONFIG = {
    FREQUENCY:     "day",                 // 'day' | 'session' | 'always'
    EXCLUDE_PATHS: ["/ticket","/checkout","/basket","/cart","/booking",
                    "/signin","/sign-in","/login","/account","/my-account","/auth","/register"],
    SHOW_DELAY_MS: 650,
    AUTO_CLOSE_MS: 8000,                  // auto-dismiss if untouched (0 = never)
    JWT_WAIT_MS:   2500,
    COOKIE_NAME:   "_gc_sa_sso_access",
    CLAIM:         "favourite_team",
    IMAGE_BASE:    "https://nl.tools/ecal/",
    IMAGE_SUFFIX:  " - 1x1.jpg",
    ECAL_APIKEY:   "sMJhxXuD7phKwU4rcepysZh2E4oJwM6ahS5hzho1YM62e82018",
    ECAL_SCRIPT:   "//sync.ecal.com/v2/ecal.widget.js",
    NL_WIDGET_ID:  "6a3c898fbbf8c400029e0a2c",
    TEST_KEY:      "nlEcalTestClub",
    SEEN_KEY:      "nlEcalSplashSeen",
    ANALYTICS:     true,
    DEBUG:         false
  };

  var CLUBS = {
    "AFC Fylde":"6a4372f17a225e0002199e37","AFC Telford United":"6a44d20713ebdc00024668ab",
    "AFC Totton":"6a475ef36e53950002294433","Aldershot Town":"6a4341131b9dd5000258084c",
    "Altrincham":"6a43735d7a225e0002199e38","Barrow":"6a4375c03dfae400020e4ae1",
    "Bedford Town":"6a44d25913ebdc00024668ac","Billericay Town":"6a4386e85d3afc0002a6d93f",
    "Boreham Wood":"6a4376403dfae400020e4ae2","Boston United":"6a4376bd7a225e0002199e39",
    "Brackley Town":"6a44d2e634fd6f0002d21c65","Braintree Town":"6a43b18b659f9800026569ea",
    "Buxton":"6a44d372e7498000021cd400","Carlisle United":"6a43778d7a225e0002199e3a",
    "Chelmsford City":"6a43b1e9659f9800026569eb","Chesham United":"6a43b247bd424800029ed1a5",
    "Chester":"6a44d44b13ebdc00024668ad","Chorley":"6a44d49c34fd6f0002d21c66",
    "Dagenham & Redbridge":"6a475fdc6e53950002294434","Darlington":"6a44d52013ebdc00024668ae",
    "Dorking Wanderers":"6a43b36c963c460002b8feef","Dover Athletic":"6a47603f6e53950002294435",
    "Eastleigh":"6a4377eb7a225e0002199e3b","Ebbsfleet United":"6a4760ab6e53950002294436",
    "Farnborough":"6a47621249b9eb00025e01e6","Farnham Town":"6a43b524659f9800026569ee",
    "FC Halifax Town":"6a4378657a225e0002199e3c","Folkestone Invicta":"6a43b56a659f9800026569ef",
    "Forest Green Rovers":"6a4378a67a225e0002199e3d","Gateshead":"6a437a07e6f28d0002d89365",
    "Hampton & Richmond Borough":"6a43b5c11091400002aae7de","Harborough Town":"6a44d658bc4ef000023f73ec",
    "Harrogate Town":"6a437a89c8c7900002f2eab0","Hartlepool United":"6a437b646964d100029f348f",
    "Hebburn Town":"6a44d6b8bc4ef000023f73ed","Hednesford Town":"6a44d71813ebdc00024668af",
    "Hemel Hempstead Town":"6a43b60d963c460002b8fef0","Hereford":"6a44d764bc4ef000023f73ee",
    "Hornchurch":"6a437eb45d3afc0002a6d93d","Horsham":"6a47626d6e53950002294437",
    "Kidderminster Harriers":"6a437f3fc8c7900002f2eab1","King's Lynn Town":"6a44d7b8bc4ef000023f73ef",
    "Macclesfield":"6a44d7fd5374cf0002ac300d","Maidenhead United":"6a4762db3093f90002337917",
    "Maidstone United":"6a43b698963c460002b8fef1","Marine":"6a44d8445374cf0002ac300e",
    "Merthyr Town":"6a44d88913ebdc00024668b0","Morecambe":"6a44d8d5bc4ef000023f73f0",
    "Oxford City":"6a44d9215374cf0002ac3010","Radcliffe":"6a44d98113ebdc00024668b1",
    "Salisbury":"6a43b6db1091400002aae7df","Scarborough Athletic":"6a44da0d13ebdc00024668b2",
    "Scunthorpe United":"6a437facc8c7900002f2eab2","Slough Town":"6a43b7201091400002aae7e0",
    "Solihull Moors":"6a438245c8c7900002f2eab3","South Shields":"6a44da521d87cb00020cbf74",
    "Southend United":"6a4383565d3afc0002a6d93e","Southport":"6a44da991d87cb00020cbf75",
    "Spalding United":"6a44dae01d87cb00020cbf76","Spennymoor Town":"6a44db3513ebdc00024668b3",
    "Sutton United":"6a4383d7c8c7900002f2eab4","Tamworth":"6a4384390639f9000240f037",
    "Tonbridge Angels":"6a43b88e659f9800026569f0","Torquay United":"6a43b8f7e2a5230002fc0b2c",
    "Truro City":"6a4763346e53950002294438","Walton & Hersham":"6a43b97a137e2d0002023bbb",
    "Wealdstone":"6a4384cf0639f9000240f038","Weston-super-Mare":"6a4763976e53950002294439",
    "Woking":"6a438517b46e00000209d7f8","Worksop Town":"6a44db8cf37a1c0002216642",
    "Worthing":"6a438586d11d2700026745a8","Yeovil Town":"6a4385d0c8c7900002f2eab5"
  };

  var qs = location.search,
      DEBUG = CONFIG.DEBUG || /[?&]ecalDebug=1/.test(qs),
      FORCE = /[?&]ecalSplash=1/.test(qs);
  var curDisplay = "National League", curSignedIn = false;

  /* ---- identity (nl-sso-club) ---- */
  function readCookie(n){ var p=(document.cookie||"").split("; "); for(var i=p.length-1;i>=0;i--){ if(p[i].indexOf(n+"=")===0) return p[i].slice(n.length+1); } return null; }
  function decodeJwtPayload(j){ if(!j) return null; var pr=j.split("."); if(pr.length!==3) return null;
    try{ var s=pr[1].replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4){ s+="="; } return JSON.parse(decodeURIComponent(escape(atob(s)))); }catch(e){ return null; } }
  function claims(){ return decodeJwtPayload(readCookie(CONFIG.COOKIE_NAME)); }
  function stripFC(s){ return String(s).replace(/\s+f\.?\s?c\.?$/i,"").trim(); }
  function norm(s){ return String(s).toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,""); }
  var CI={}, N={}; Object.keys(CLUBS).forEach(function(n){ CI[n.toLowerCase()]=n; N[norm(n)]=n; });
  function matchClub(v){ if(v==null) return null; var s=String(v).trim(); if(!s) return null; var f=stripFC(s);
    return CI[s.toLowerCase()]||CI[f.toLowerCase()]||N[norm(s)]||N[norm(f)]||null; }
  function clubFromClaims(c){ if(!c) return null; var fav=c[CONFIG.CLAIM]||c.favourite_team||c.favouriteTeam||c.favorite_team; return fav?matchClub(fav):null; }

  /* ---- gating ---- */
  function excluded(){ var p=(location.pathname||"").toLowerCase(); return CONFIG.EXCLUDE_PATHS.some(function(x){ return p.indexOf(x)>-1; }); }
  function alreadySeen(){ if(FORCE) return false;
    try{ if(CONFIG.FREQUENCY==="always") return false;
      if(CONFIG.FREQUENCY==="session") return sessionStorage.getItem(CONFIG.SEEN_KEY)==="1";
      var t=parseInt(localStorage.getItem(CONFIG.SEEN_KEY)||"0",10); return t && (Date.now()-t)<86400000;
    }catch(e){ return false; } }
  function markSeen(){ try{ if(CONFIG.FREQUENCY==="session") sessionStorage.setItem(CONFIG.SEEN_KEY,"1");
    else if(CONFIG.FREQUENCY!=="always") localStorage.setItem(CONFIG.SEEN_KEY,String(Date.now())); }catch(e){} }

  /* ---- analytics ---- */
  function track(action, extra){ if(!CONFIG.ANALYTICS) return;
    try{ window.dataLayer=window.dataLayer||[];
      var o={ event:"nl_splash_"+action, splash_club:curDisplay, splash_signed_in:curSignedIn };
      if(extra){ for(var k in extra){ o[k]=extra[k]; } }
      window.dataLayer.push(o); if(DEBUG) console.log("[NL ECAL Splash] dataLayer:", o);
    }catch(e){} }

  /* ---- ECAL ---- */
  var booted=false;
  function bootEcal(){ if(booted) return; booted=true;
    if(document.querySelector('script[src*="ecal.widget.js"]')) return;
    var s=document.createElement("script"); s.src=CONFIG.ECAL_SCRIPT; s.setAttribute("data-ecal-apikey",CONFIG.ECAL_APIKEY); document.body.appendChild(s); }

  /* ECAL binds .ecal-sync-widget-button elements when its script scans the DOM,
     and it does not watch for new ones. Our button is injected late — after
     DOMContentLoaded, a 650ms delay and up to 2.5s of JWT wait — so on any page
     that ALREADY has ECAL loaded (every page carrying the banner advert, where
     bootEcal returns early by design) the scan happened long before our button
     existed. It was therefore never bound: clicking it hit only our own close
     handler, so the splash just closed and no calendar modal ever opened.

     EcalWidget.initButtons() re-scans and picks it up. Confirmed live: running
     it by hand and then clicking the ad opens the modal.

     Polled because ECAL may still be loading when we show — on a page without
     the banner we have only just appended the script ourselves. Give up quietly
     after ~6s rather than spin. */
  function bindEcalButton(){
    var tries = 0, MAX = 24;   /* ~10s */
    (function attempt(){
      var E = window.EcalWidget;
      if (E && typeof E.initButtons === "function") {
        try {
          E.initButtons();
          if (DEBUG) console.log("[NL ECAL Splash] initButtons() attempt " + (tries + 1) +
            " — widgets loaded: " + ((E.widgets && E.widgets.length) || 0));
        } catch(e){ if(DEBUG) console.warn("[NL ECAL Splash] initButtons() threw", e); }
      }
      /* Keep re-scanning while the splash is open. initButtons exists the moment
         ECAL's script parses, but its widget data loads asynchronously after
         that (see boot/continueBoot/loadButtons in their API), so calling it
         once — the moment it appears — scans with nothing loaded and binds
         nothing. That was v8.8: the log said the call succeeded while the
         button stayed unbound. The call is idempotent, so simply repeating it
         costs nothing and catches whichever tick ECAL finishes booting on. */
      if (++tries < MAX && isOpen) setTimeout(attempt, 400);
    })();
  }

  function fileFor(d){ return CONFIG.IMAGE_BASE + encodeURIComponent(d + CONFIG.IMAGE_SUFFIX); }

  /* ---- inject styles ---- */
  function injectCss(){
    var css =
      "#nl-ecal-splash{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .28s ease}"+
      "#nl-ecal-splash[hidden]{display:none!important}"+
      "#nl-ecal-splash:not(.nl-splash--in){pointer-events:none}"+
      "#nl-ecal-splash.nl-splash--in{opacity:1}"+
      "#nl-ecal-splash .nl-splash__backdrop{position:absolute;inset:0;background:rgba(10,16,28,.72);backdrop-filter:saturate(.85) blur(1px)}"+
      "#nl-ecal-splash .nl-splash__modal{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;transform:scale(.96);transition:transform .28s ease}"+
      "#nl-ecal-splash.nl-splash--in .nl-splash__modal{transform:scale(1)}"+
      "#nl-ecal-splash .nl-splash__adbtn{display:block;padding:0;margin:0;border:0;background:transparent;cursor:pointer;line-height:0;-webkit-appearance:none;appearance:none;border-radius:12px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45)}"+
      "#nl-ecal-splash .nl-splash__img{display:block;width:min(86vw,86vh,520px);height:auto;border-radius:12px}"+
      "#nl-ecal-splash .nl-splash__x{position:absolute;top:-14px;right:-14px;z-index:2;width:36px;height:36px;border-radius:50%;border:0;cursor:pointer;background:#fff;color:#111;font-size:22px;line-height:36px;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.35);padding:0}"+
      "#nl-ecal-splash .nl-splash__x:hover{background:#f2f2f2}"+
      "#nl-ecal-splash .nl-splash__hint{margin-top:14px;color:rgba(255,255,255,.82);font-size:13px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:center}"+
      "@media (max-width:480px){#nl-ecal-splash .nl-splash__x{top:-10px;right:-10px}}"+
      "html.nl-splash-lock,body.nl-splash-lock{overflow:hidden !important}";
    var st=document.createElement("style"); st.setAttribute("data-nl-splash",""); st.textContent=css; document.head.appendChild(st);
  }

  /* ---- inject DOM ---- */
  function injectDom(){
    var host=document.createElement("div");
    host.innerHTML =
      '<div id="nl-ecal-splash" hidden>'+
        '<div class="nl-splash__backdrop" data-close="backdrop"></div>'+
        '<div class="nl-splash__modal" role="dialog" aria-modal="true" aria-label="National League offer">'+
          '<button type="button" class="nl-splash__x" id="nl-splash-x" aria-label="Close">&times;</button>'+
          '<button type="button" id="nl-splash-btn" class="ecal-sync-widget-button nl-splash__adbtn" '+
            'data-ecal-widget-id="'+CONFIG.NL_WIDGET_ID+'" data-ecal-no-styling '+
            'aria-label="Sync National League fixtures to your calendar">'+
            '<img id="nl-splash-img" class="nl-splash__img" '+
              'src="'+fileFor("National League")+'" '+
              'alt="Sync National League fixtures to your calendar">'+
          '</button>'+
          '<span class="nl-splash__hint">Tap outside or press Esc to close</span>'+
        '</div>'+
      '</div>';
    document.body.appendChild(host.firstChild);
  }

  var root, btn, img, xBtn, lastFocus=null, isOpen=false;

  function applyClub(club){
    curDisplay = club || "National League";
    var widgetId = club ? CLUBS[club] : CONFIG.NL_WIDGET_ID;
    btn.setAttribute("data-ecal-widget-id", widgetId);
    btn.setAttribute("aria-label","Sync "+curDisplay+" fixtures to your calendar");
    img.alt="Sync "+curDisplay+" fixtures to your calendar";
    img.src=fileFor(curDisplay);
  }
  function lockScroll(on){ try{ document.documentElement.classList.toggle("nl-splash-lock",on); document.body.classList.toggle("nl-splash-lock",on);}catch(e){} }

  var autoTimer=null;
  function startAuto(){ if(CONFIG.AUTO_CLOSE_MS>0){ cancelAuto(); autoTimer=setTimeout(function(){ close("timeout"); }, CONFIG.AUTO_CLOSE_MS); } }
  function cancelAuto(){ if(autoTimer){ clearTimeout(autoTimer); autoTimer=null; } }

  function open(){
    if(isOpen) return; isOpen=true;
    lastFocus=document.activeElement; root.hidden=false;
    requestAnimationFrame(function(){ root.classList.add("nl-splash--in"); });
    lockScroll(true); markSeen(); track("shown");
    try{ xBtn.focus(); }catch(e){}
    document.addEventListener("keydown", onKey, true);
    startAuto();
  }
  function close(reason){
    if(!isOpen) return; isOpen=false;
    cancelAuto();
    if(reason && reason!=="synced") track("dismissed", { splash_dismiss_method: reason });
    root.classList.remove("nl-splash--in"); lockScroll(false);
    document.removeEventListener("keydown", onKey, true);
    setTimeout(function(){ root.hidden=true; }, 300);
    try{ if(lastFocus && lastFocus.focus) lastFocus.focus(); }catch(e){}
  }
  function onKey(e){
    if(e.key==="Escape"){ e.preventDefault(); close("esc"); }
    if(e.key==="Tab"){ e.preventDefault(); (document.activeElement===xBtn?btn:xBtn).focus(); }
  }

  function debugDump(club, via){
    try{ var c=claims();
      console.group("%c[NL ECAL Splash]","color:#9e0000;font-weight:bold");
      console.log("Excluded:",excluded()," Seen:",alreadySeen()," Force:",FORCE," Path:",location.pathname);
      console.log("Cookie:",!!readCookie(CONFIG.COOKIE_NAME)," claim:",c?(c[CONFIG.CLAIM]||"(none)"):"(no JWT)");
      console.log("Matched club:",club||"(NL fallback)"," via:",via);
      console.groupEnd();
    }catch(e){}
  }

  function decideAndShow(club, via, signedIn){
    curSignedIn = !!signedIn;
    if(DEBUG) debugDump(club, via);
    /* Order matters: applyClub sets the final widget id on the button, so the
       button must be complete before ECAL is asked to bind it. */
    applyClub(club); bootEcal(); open(); bindEcalButton();
  }

  function start(){
    if(excluded() || alreadySeen()){ if(DEBUG) debugDump(null,"suppressed"); return; }
    var t=null; try{ t=localStorage.getItem(CONFIG.TEST_KEY); }catch(e){}
    if(t){ var mt=matchClub(t); if(mt){ decideAndShow(mt,"test",true); return; } }
    var c=claims();
    if(c){ decideAndShow(clubFromClaims(c),"jwt",true); return; }
    var st=Date.now();
    var iv=setInterval(function(){
      var cc=claims();
      if(cc){ clearInterval(iv); decideAndShow(clubFromClaims(cc),"jwt-late",true); }
      else if(Date.now()-st>=CONFIG.JWT_WAIT_MS){ clearInterval(iv); decideAndShow(null,"signed-out",false); }
    },200);
  }

  window.nlEcalSetTestClub=function(name){ try{ localStorage.setItem(CONFIG.TEST_KEY,name); location.reload(); }catch(e){} };

  function init(){
    injectCss();
    injectDom();
    root=document.getElementById("nl-ecal-splash");
    btn=document.getElementById("nl-splash-btn");
    img=document.getElementById("nl-splash-img");
    xBtn=document.getElementById("nl-splash-x");

    root.addEventListener("click", function(e){
      var t=e.target; if(t && t.getAttribute && t.getAttribute("data-close")) close(t.getAttribute("data-close"));
    });
    xBtn.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); close("x"); });
    /* The ad button is ECAL's: ECAL binds its own CLICK handler and opens ITS
       OWN modal. Our overlay sits at z-index 2147483000 (near max), so once ECAL
       opens we must stop capturing clicks or the modal shows through with dead
       buttons. The trick is timing: we get out of the way AFTER the opening click
       has been dispatched, never before it.
         - yieldToEcal makes the whole overlay pointer-transparent (inline style,
           beats any class-timing race) and fades our chrome, but NEVER sets
           root.hidden — the node stays inert-but-present so an ECAL modal anchored
           to our button keeps its anchor.
         - It runs on CLICK, which fires after the browser has already delivered
           the same click to ECAL's handler. Setting pointer-events:none inside a
           click handler does not un-dispatch the in-flight event, so ECAL still
           opens; our overlay just stops intercepting from that point on.
       v8.6 also ran this on pointerdown (capture) — that set the overlay
       pointer-transparent BEFORE the click hit-test, so the click never landed on
       the button and ECAL's handler never fired: the overlay faded and it "just
       closed" without opening. v8.7 removes the pointerdown hook; click alone is
       both sufficient and correct. */
    function yieldToEcal(){
      root.style.pointerEvents = "none";
      root.classList.remove("nl-splash--in");
      lockScroll(false);
      cancelAuto();
      isOpen = false;
      document.removeEventListener("keydown", onKey, true);
    }
    btn.addEventListener("click", function(){ track("synced"); yieldToEcal(); });

    setTimeout(start, CONFIG.SHOW_DELAY_MS);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
