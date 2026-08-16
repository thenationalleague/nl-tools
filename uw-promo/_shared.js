/*
  UW Promo Codes — shared runtime for the three standalone pages
  Version: v3.3 (16/08/2026) — the follow-up convergence flagged in v3.2:
           local crestImgHtml(name, px) deleted. Every crest string in the
           family now comes from canon NL.clubs.crestImgHtml('thumb'), with a
           NL.clubs.wireCrestImgs sweep in the same tick as each innerHTML
           render (same thumb → full → rose degrade, no inline onerror). The
           px sizing moved to CSS — .club-cell img (_shared.css) and
           .byclub__item img (page styles). UWP.crestImgHtml and UWP.ROSE are
           gone from the surface.
  Version: v3.2 (16/08/2026) — till-card crest repointed to the canon string
           helper NL.clubs.crestImgHtml, with a NL.clubs.wireCrestImgs sweep
           in printCards replacing the inline onerror (same full-res → rose
           degrade).
  Version: v3.1 (10/08/2026) — till cards move into the shared runtime
           (tillCardHtml/printCards, styles in _shared.css). Two pages print
           them now — the master console and a club printing its own from the
           admin view — and a club-printed card must be identical to an
           NL-printed one, so there is exactly one implementation. The PIN is
           read at print time, so a card printed right after a rotation
           carries the new PIN.
  Version: v3.0 (06/08/2026) — registered-to-a-club model. Every code is
           assigned to exactly one club when it is created, and redeemTxn now
           refuses a code presented at any other club. genCodes() drops the
           XXXX-XXXX grouping (plain 6-char alphanumeric, no hyphen); club
           credentials are 4-digit numeric PINs (newPin) instead of 6-char
           alphanumeric passcodes — master/UW passcodes are unchanged. Added
           rateLimit() for the till-side voucher checker.
  Version: v2.0 (23/07/2026) — pool model: codes are no longer created against
           a club (UW issues them to customers; a club claims one by redeeming
           it at the till). genCodes() prefix now optional (plain 6-char is the
           default), added normCode() + the stored/indexed `norm` field so a
           till entry matches however it's typed.
  Version: v1.0 (23/07/2026) — initial build.
  File: /uw-promo/_shared.js

  Loaded by /uw-promo/ (UW view), /uw-promo/club/ (club view) and
  /uw-promo/admin/ (NL master view), AFTER the Firebase compat SDKs and
  BEFORE nl-utils.js. Initialises the NAMED Firebase app ('nlUwPromo') so this
  family's anonymous sign-in can't clobber a portal login open in another tab
  (same isolation pattern as /footage/club/), and exposes window.UWP:

    UWP.app / UWP.db()          named app + its database
    UWP.ref(path)               ref under app-data/uw-promo
    UWP.ensureAuth()            → Promise<user> (anonymous sign-in)
    UWP.newPasscode()           6-char passcode (unambiguous alphabet) — the
                                master console and the UW partner dashboard
    UWP.newPin(taken)           4-digit numeric PIN, unique against `taken` —
                                club till credentials (typed on a phone)
    UWP.newToken()              14-char direct-link token
    UWP.genCodes(n,prefix,set)  n unique 6-char codes not in `set`
    UWP.rateLimit(key,n,ms)     per-browser sliding-window gate (voucher check)
    UWP.audit(actor,label,action,fields)  append audit entry (server ts)
    UWP.STATUS / UWP.pillFor()  code status metadata → nl-brand .pill class
    UWP.fmt(ms) / UWP.ago(ms)   date-time / relative formatting (canon-backed)
    UWP.clubLink(token) / UWP.uwLink(token)  absolute direct-link URLs

  Crest strings are canon: NL.clubs.crestImgHtml(name, 'thumb') + a
  NL.clubs.wireCrestImgs sweep after each innerHTML render (no local helper).

  Data lives at RTDB app-data/uw-promo/{config,codes,audit} — shape documented
  in /uw-promo/README.md. Rules: system/rtdb/rules.snapshot.json.
*/
(function () {
  'use strict';

  /* Sandbox mode — ?env=test on any of the three pages runs the whole family
     against app-data/uw-promo-test instead of live data (visible TEST MODE
     banner, resettable from the master console). Direct links generated in
     test mode carry the flag, so a seeded sandbox club's link/QR stays in the
     sandbox. */
  var IS_TEST = (function () {
    try { return new URLSearchParams(location.search).get('env') === 'test'; }
    catch (e) { return false; }
  })();
  var ROOT = IS_TEST ? 'app-data/uw-promo-test' : 'app-data/uw-promo';

  // Named app — NOT the default app (see header). nl-utils' audit hook
  // self-skips when there's no default app, which is what we want: this
  // family keeps its own audit trail under app-data/uw-promo/audit.
  var app = firebase.initializeApp({
    apiKey: "AIzaSyC3az3OMnU7TdqlaWp8yrO_EjgZ36l-mXU", authDomain: "nl-tools.firebaseapp.com",
    databaseURL: "https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app", projectId: "nl-tools",
    storageBucket: "nl-tools.firebasestorage.app", messagingSenderId: "801354670005",
    appId: "1:801354670005:web:05d8ebad3e7e63610d03fc"
  }, 'nlUwPromo');

  function ensureAuth() {
    try {
      var u = app.auth().currentUser;
      if (u) return Promise.resolve(u);
      return app.auth().signInAnonymously().then(function (c) { return c.user; });
    } catch (e) { return Promise.reject(e); }
  }

  /* ── Credential handshake ────────────────────────────────────────────
     Exchanges a PIN or passcode for a scoped Firebase session, via the
     uwPromoAuth RTDB trigger (functions/uw-promo.js). The credential is never
     compared in the browser and `config` is not client-readable any more —
     that is the whole point. Same shape as programme/_shared.js.

     A callable would be the obvious thing; it cannot be used, because the
     project's org policy blocks a public invoker on new Cloud Run services and
     club staff have no Google account. See the function header. */
  var AUTH_TIMEOUT_MS = 45000;   // Eventarc delivery is seconds, not instant
  var SESSION = null;

  function requestGrant(payload) {
    return ensureAuth().then(function (user) {
      var uid = user.uid;
      var reqRef = app.database().ref(ROOT + '/authRequests/' + uid);
      var grantRef = app.database().ref(ROOT + '/authGrants/' + uid);

      return new Promise(function (resolve, reject) {
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          grantRef.off();
          reject(new Error('That took too long. Please try again.'));
        }, AUTH_TIMEOUT_MS);

        function finish(fn) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          grantRef.off();
          fn();
        }

        grantRef.on('value', function (snap) {
          var g = snap.val();
          if (!g) return;
          /* Clear both nodes while we still own this uid — after
             signInWithCustomToken the uid changes and the rules would stop us
             touching them, leaving litter behind. */
          var cleanup = Promise.all([
            grantRef.remove().catch(function () {}),
            reqRef.remove().catch(function () {})
          ]);
          finish(function () {
            cleanup.then(function () {
              if (g.ok) resolve(g);
              else reject(new Error(g.error || 'Not recognised.'));
            });
          });
        }, function (err) { finish(function () { reject(err); }); });

        var body = { at: firebase.database.ServerValue.TIMESTAMP };
        Object.keys(payload || {}).forEach(function (k) {
          if (payload[k] != null && payload[k] !== '') body[k] = payload[k];
        });
        reqRef.set(body).catch(function (err) { finish(function () { reject(err); }); });
      });
    });
  }

  /* Exchange a credential for a session. `token` is the ?c= link token when
     the page has one — it names the club server-side before anything is
     compared, which is what lets the function throttle per club instead of
     only globally, and is why a 4-digit PIN is defensible at all. */
  function signIn(code, token) {
    return requestGrant({ code: normCode(code), token: token || null })
      .then(function (g) {
        return app.auth().signInWithCustomToken(g.customToken).then(function () {
          SESSION = {
            role: g.role, club: g.club || null,
            creds: g.creds || null, clubs: g.clubs || null
          };
          window.UWP.session = SESSION;
          return SESSION;
        });
      });
  }

  /* A club manager rotating its own till PIN. Carries no credential — the
     request is keyed on the caller's uid, and `uw-<CODE>-manager` is a uid
     only the trigger mints, only for a proven manager. Resolves the new PIN. */
  function rotateOwnPin() {
    return requestGrant({ rotatePin: true }).then(function (g) {
      if (SESSION && SESSION.creds) SESSION.creds.passcode = g.passcode;
      return g.passcode;
    });
  }

  /* First-run only: mints a master session while no master passcode exists.
     The function refuses once one is set, so this closes itself. */
  function bootstrapMaster() {
    return requestGrant({ bootstrap: true }).then(function (g) {
      return app.auth().signInWithCustomToken(g.customToken).then(function () {
        SESSION = { role: 'master', club: null, creds: null, clubs: null };
        window.UWP.session = SESSION;
        return SESSION;
      });
    });
  }


  /* Unambiguous alphabet — no 0/O, 1/I/L — for anything a human retypes. */
  var CODE_ALPHA  = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var TOKEN_ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
  var PIN_ALPHA   = '0123456789';

  function randFrom(alpha, len) {
    var buf = new Uint32Array(len), out = '';
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < len; i++) out += alpha[buf[i] % alpha.length];
    return out;
  }

  /* Club till credential: a 4-digit numeric PIN, typed on a phone at the
     point of sale.

     Never starts with 0. A leading zero survives neither the access CSV
     (Excel reads "0123" as the number 123) nor a hurried retype at the till,
     and 9,000 PINs is still ample for 72 clubs.

     `taken` is a map of PINs already issued. Uniqueness is enforced, not
     hoped for: 72 clubs drawn from 9,000 collide about a quarter of the time
     by the birthday bound, and a club signing in on its PIN alone (no link)
     is resolved BY that PIN — so a duplicate would open the wrong club's
     till. Master and UW keep the 6-character alphanumeric passcode; they are
     typed once, on a laptop, by one person. */
  function newPin(taken) {
    taken = taken || {};
    for (var i = 0; i < 20000; i++) {
      var p = randFrom(PIN_ALPHA.slice(1), 1) + randFrom(PIN_ALPHA, 3);
      if (!taken[p]) { taken[p] = true; return p; }
    }
    throw new Error('Could not find a free 4-digit PIN');
  }

  /* Normalise a code for storage-key matching and POS entry: uppercase,
     alphanumerics only (dashes/spaces stripped). Every stored code carries a
     `norm` field (indexed) so a till entry matches however it's typed. */
  function normCode(s) {
    return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* n unique 6-character codes (optionally "PREFIX-XXXXXX"), colliding with
     neither each other nor the caller-supplied set of existing NORMALISED
     code strings. No hyphen grouping: generated codes are 6 plain characters,
     and codes UW supply themselves are whatever shape they arrive in.
     Matching everywhere is on `norm`, so punctuation never has to be typed. */
  var CODE_LEN = 6;
  function genCodes(n, prefix, existingSet) {
    var out = [], guard = 0;
    existingSet = existingSet || {};
    while (out.length < n && guard < n * 50) {
      guard++;
      var c = (prefix ? prefix + '-' : '') + randFrom(CODE_ALPHA, CODE_LEN);
      var k = normCode(c);
      if (existingSet[k]) continue;
      existingSet[k] = true;
      out.push(c);
    }
    if (out.length < n) throw new Error('Could not generate enough unique codes');
    return out;
  }

  var STATUS = {
    active:   { label: 'Unredeemed', pill: 'pill--info' },
    redeemed: { label: 'Redeemed',   pill: 'pill--approved' },
    revoked:  { label: 'Revoked',    pill: 'pill--rejected' }
  };

  /* Pure transaction updater for a till redemption, factored out so
     tests/uw-promo can exercise the state machine without Firebase.

     As of v3.0 a code belongs to exactly one club from the moment it is
     created, so this is the last line of enforcement for "redeemable only at
     the club it is registered to": a code registered to Hartlepool that is
     presented at Sutton aborts here even if the caller's pre-check somehow
     let it through. Codes created before v3.0 carry no `club` and still lock
     to whoever redeems them first (the old pool behaviour) — the master
     console can register those to a club retrospectively.

     Transaction semantics: return the record to commit, `undefined` to abort
     (wrong club, or someone got there first), or the null back unchanged
     (local cache miss — the SDK retries with server data). `ts` is injectable
     for tests; live callers omit it and get the server timestamp
     placeholder. */
  function redeemTxn(cur, club, actorId, ts) {
    if (cur === null) return cur;
    if (cur.status !== 'active') return;
    if (cur.club && cur.club !== club.code) return;
    cur.status = 'redeemed';
    cur.club = club.code;
    cur.clubName = club.name;
    cur.redeemedAt = ts || firebase.database.ServerValue.TIMESTAMP;
    cur.redeemedBy = actorId || ('club:' + club.code);
    return cur;
  }

  /* Sliding-window gate, per browser, for the till-side voucher checker —
     10 lookups an hour is plenty for "is this thing real?" and makes fishing
     for live codes by hand tedious. It is deliberately client-side and
     therefore defeatable (clearing storage resets it); the real deterrent is
     that every check lands in the audit trail with the club's name on it.

     Returns { ok, remaining, retryAt }. A permitted call is recorded as it is
     granted, so callers must only invoke this when actually performing a
     lookup. `now` is injectable for tests. */
  var MEM_STORE = {};
  function lsGet(key) {
    try { if (window.localStorage) return window.localStorage.getItem(key); } catch (e) {}
    return Object.prototype.hasOwnProperty.call(MEM_STORE, key) ? MEM_STORE[key] : null;
  }
  function lsSet(key, val) {
    try { if (window.localStorage) { window.localStorage.setItem(key, val); return; } } catch (e) {}
    MEM_STORE[key] = val;
  }
  function rateLimit(key, limit, windowMs, now) {
    now = now || Date.now();
    var hits = [];
    try { hits = JSON.parse(lsGet(key) || '[]'); } catch (e) { hits = []; }
    if (!Array.isArray(hits)) hits = [];
    hits = hits.filter(function (t) { return typeof t === 'number' && now - t < windowMs; });
    if (hits.length >= limit) {
      var oldest = hits[0];
      hits.forEach(function (t) { if (t < oldest) oldest = t; });
      return { ok: false, remaining: 0, retryAt: oldest + windowMs };
    }
    hits.push(now);
    lsSet(key, JSON.stringify(hits));
    return { ok: true, remaining: limit - hits.length, retryAt: 0 };
  }

  function audit(actor, actorLabel, action, fields) {
    var entry = {
      ts: firebase.database.ServerValue.TIMESTAMP,
      actor: actor, actorLabel: actorLabel, action: action
    };
    Object.keys(fields || {}).forEach(function (k) {
      if (fields[k] != null && fields[k] !== '') entry[k] = fields[k];
    });
    return ensureAuth().then(function () {
      return app.database().ref(ROOT + '/audit').push(entry);
    });
  }

  var UW_LOGO = '/assets/partners/Utility%20Warehouse.png';

  function pageBase() {
    // .../uw-promo/(club|admin)/... → .../uw-promo/
    return location.origin + '/uw-promo/';
  }
  function envTail() { return IS_TEST ? '&env=test' : ''; }

  /* ── Till cards ──────────────────────────────────────────────────────
     One A4 card per club: co-branded header, QR of the club's direct link,
     the till PIN and the steps. Lives here because two pages print them —
     the master console (all 72, or one at a time) and a club printing its
     own from the admin view — and a club-printed card must be identical to
     an NL-printed one. Styles are in _shared.css for the same reason.

     The PIN is read from the club record at print time, so a card printed
     straight after a PIN rotation carries the new one.

     QR encoding is local (qrcode.vendor.js) so club link tokens are never
     sent to a third-party QR image API. Callers must load that script. */
  function tillCardHtml(club) {
    var esc = window.NL && NL.escHtml ? NL.escHtml : function (s) { return String(s == null ? '' : s); };
    var link = clubLinkFor(club.token);
    var qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    /* Crest via the canon string helper (nl-utils v1.32). The string carries
       no fallback — printCards runs NL.clubs.wireCrestImgs on the print root
       straight after insertion, so a missing crest still degrades to the rose
       before the browser can fetch anything. A caller using UWP.tillCardHtml
       directly must run its own wireCrestImgs pass. */
    return '<div class="print-card">' +
      '<div class="print-card__brands">' +
        NL.clubs.crestImgHtml(club.name) +
        '<img src="' + UW_LOGO + '" alt="Utility Warehouse" ' +
          'onerror="this.onerror=null;this.style.display=\'none\';">' +
      '</div>' +
      '<div class="print-card__club">' + esc(club.name) + '</div>' +
      '<div class="print-card__kicker">Utility Warehouse promo codes — till card</div>' +
      '<div class="print-card__qr">' + qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true }) + '</div>' +
      '<ol class="print-card__steps">' +
        '<li>Scan the QR code above on your phone.</li>' +
        '<li>Enter your club PIN: <span class="print-card__pass">' + esc(club.passcode) + '</span></li>' +
        '<li>Type the customer’s promo code and press <strong>REDEEM</strong>.</li>' +
        '<li>If successfully redeemed, apply the relevant discount to their items on the club system.</li>' +
        '<li>Codes are issued to this club only. One from elsewhere will be refused — you can confirm any ' +
          'code with <strong>Check a code</strong> at the foot of the page.</li>' +
      '</ol>' +
      '<div class="print-card__url">' + esc(link) + '</div>' +
    '</div>';
  }

  /* Render `clubs` into #printRoot (created on demand) and open the print
     dialog once the crests have loaded — otherwise the browser snapshots the
     page mid-fetch and prints cards with missing logos. 4s hard backstop. */
  function printCards(clubs) {
    if (!clubs || !clubs.length) throw new Error('No clubs to print');
    if (typeof qrcode === 'undefined') throw new Error('QR library failed to load — refresh and try again');
    var root = document.getElementById('printRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'printRoot';
      document.body.appendChild(root);
    }
    root.innerHTML = clubs.map(tillCardHtml).join('');
    NL.clubs.wireCrestImgs(root);   // full-res → rose fallback for the card crests

    /* The card stylesheet is shared by all three pages, so the "hide
       everything but the cards" rule is scoped to this class rather than to
       @media print alone — otherwise an ordinary Ctrl+P anywhere in the
       family would print a blank sheet. Cleared once the dialog closes. */
    document.body.classList.add('is-printing-cards');
    var cleared = false;
    function clear() {
      if (cleared) return;
      cleared = true;
      document.body.classList.remove('is-printing-cards');
    }
    window.addEventListener('afterprint', clear, { once: true });
    setTimeout(clear, 60000);   // backstop: some browsers never fire afterprint

    var imgs = root.querySelectorAll('img');
    var fired = false, done = 0;
    function go() { if (!fired) { fired = true; window.print(); } }
    function maybe() { done++; if (done >= imgs.length) go(); }
    if (!imgs.length) { go(); return clubs.length; }
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.complete) { maybe(); }
      else { img.addEventListener('load', maybe); img.addEventListener('error', maybe); }
    });
    setTimeout(go, 4000);
    return clubs.length;
  }

  function clubLinkFor(token) {
    return pageBase() + 'club/?c=' + encodeURIComponent(token) + envTail();
  }

  // TEST MODE banner — auto-injected so every page in the family shows it.
  if (IS_TEST) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.className = 'test-banner';
      b.textContent = 'Test mode — sandbox data';
      document.body.appendChild(b);
    });
  }

  window.UWP = {
    ROOT: ROOT,
    isTest: IS_TEST,
    app: app,
    db: function () { return app.database(); },
    ref: function (path) { return app.database().ref(ROOT + (path ? '/' + path : '')); },
    ensureAuth: ensureAuth,
    TS: function () { return firebase.database.ServerValue.TIMESTAMP; },
    signIn: signIn,
    rotateOwnPin: rotateOwnPin,
    bootstrapMaster: bootstrapMaster,
    session: null,
    newPasscode: function () { return randFrom(CODE_ALPHA, 6); },
    newPin: newPin,
    newToken: function () { return randFrom(TOKEN_ALPHA, 14); },
    genCodes: genCodes,
    CODE_LEN: CODE_LEN,
    normCode: normCode,
    rateLimit: rateLimit,
    STATUS: STATUS,
    redeemTxn: redeemTxn,
    pillFor: function (status) {
      var s = STATUS[status] || STATUS.active;
      return '<span class="pill ' + s.pill + '">' + s.label + '</span>';
    },
    audit: audit,
    fmt: function (ms) { return ms ? NL.formatDateTime(ms) : '—'; },
    ago: function (ms) { return ms ? NL.timeAgo(ms) : '—'; },
    tillCardHtml: tillCardHtml,
    printCards: printCards,
    UW_LOGO: UW_LOGO,
    clubLink: clubLinkFor,
    uwLink: function (token) { return pageBase() + '?u=' + encodeURIComponent(token) + envTail(); }
  };
})();
