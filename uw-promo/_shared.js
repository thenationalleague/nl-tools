/*
  UW Promo Codes — shared runtime for the three standalone pages
  Version: v2.0 (23/07/2026) — pool model: codes are no longer created against
           a club (UW issues them to customers; a club claims one by redeeming
           it at the till). genCodes() prefix now optional (plain 6-char is the
           default), added normCode() + the stored/indexed `norm` field so a
           till entry matches however it's typed.
  Version: v1.0 (23/07/2026) — initial build.
  File: /tools/uw-promo/_shared.js

  Loaded by /tools/uw-promo/ (UW view), /tools/uw-promo/club/ (club view) and
  /tools/uw-promo/admin/ (NL master view), AFTER the Firebase compat SDKs and
  BEFORE nl-utils.js. Initialises the NAMED Firebase app ('nlUwPromo') so this
  family's anonymous sign-in can't clobber a portal login open in another tab
  (same isolation pattern as /tools/footage/club/), and exposes window.UWP:

    UWP.app / UWP.db()          named app + its database
    UWP.ref(path)               ref under app-data/uw-promo
    UWP.ensureAuth()            → Promise<user> (anonymous sign-in)
    UWP.newPasscode()           6-char passcode (unambiguous alphabet)
    UWP.newToken()              14-char direct-link token
    UWP.genCodes(n,prefix,set)  n unique codes "PREFIX-XXXXXX" not in `set`
    UWP.audit(actor,label,action,fields)  append audit entry (server ts)
    UWP.STATUS / UWP.pillFor()  code status metadata → nl-brand .pill class
    UWP.fmt(ms) / UWP.ago(ms)   date-time / relative formatting (canon-backed)
    UWP.crestImgHtml(name,px)   crest <img> string (thumb → full → rose)
    UWP.clubLink(token) / UWP.uwLink(token)  absolute direct-link URLs

  Data lives at RTDB app-data/uw-promo/{config,codes,audit} — shape documented
  in /tools/uw-promo/README.md. Rules: system/rtdb/rules.snapshot.json.
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

  /* Unambiguous alphabet — no 0/O, 1/I/L — for anything a human retypes. */
  var CODE_ALPHA  = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var TOKEN_ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

  function randFrom(alpha, len) {
    var buf = new Uint32Array(len), out = '';
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < len; i++) out += alpha[buf[i] % alpha.length];
    return out;
  }

  /* Normalise a code for storage-key matching and POS entry: uppercase,
     alphanumerics only (dashes/spaces stripped). Every stored code carries a
     `norm` field (indexed) so a till entry matches however it's typed. */
  function normCode(s) {
    return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* n unique 8-char codes, grouped "XXXX-XXXX" for till readability
     (optionally "PREFIX-XXXX-XXXX"), colliding with neither each other nor
     the caller-supplied set of existing NORMALISED code strings. Matching is
     on `norm`, so the dash never has to be typed. */
  function genCodes(n, prefix, existingSet) {
    var out = [], guard = 0;
    existingSet = existingSet || {};
    while (out.length < n && guard < n * 50) {
      guard++;
      var c = (prefix ? prefix + '-' : '') + randFrom(CODE_ALPHA, 4) + '-' + randFrom(CODE_ALPHA, 4);
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

  /* Pure transaction updater for a till redemption — the whole "code locks to
     the club that redeems it" state machine, factored out so tests/uw-promo
     can exercise it without Firebase. Transaction semantics: return the
     record to commit, `undefined` to abort (someone got there first), or the
     null back unchanged (local cache miss — the SDK retries with server data).
     `ts` is injectable for tests; live callers omit it and get the server
     timestamp placeholder. */
  function redeemTxn(cur, club, actorId, ts) {
    if (cur === null) return cur;
    if (cur.status !== 'active') return;
    cur.status = 'redeemed';
    cur.club = club.code;
    cur.clubName = club.name;
    cur.redeemedAt = ts || firebase.database.ServerValue.TIMESTAMP;
    cur.redeemedBy = actorId || ('club:' + club.code);
    return cur;
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

  var ROSE = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/National%20League%20rose.png';
  var UW_LOGO = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/partners/Utility%20Warehouse.png';

  function crestImgHtml(name, px) {
    px = px || 22;
    var esc = window.NL && NL.escHtml ? NL.escHtml : function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    // %27-encode apostrophes (encodeURIComponent leaves them alone) so club
    // names like King's Lynn can't break the single-quoted onerror JS below.
    function u(url) { return String(url).replace(/'/g, '%27'); }
    var thumb = u(NL.clubs.crestUrl(name, 'thumb')), full = u(NL.clubs.crestUrl(name));
    return '<img src="' + esc(thumb) + '" alt="" loading="lazy" ' +
      'onerror="if(this.src!==\'' + esc(full) + '\'){this.src=\'' + esc(full) + '\';}else{this.onerror=null;this.src=\'' + ROSE + '\';}" ' +
      'style="width:' + px + 'px;height:' + px + 'px;object-fit:contain;flex-shrink:0;">';
  }

  function pageBase() {
    // .../tools/uw-promo/(club|admin)/... → .../tools/uw-promo/
    return location.origin + '/tools/uw-promo/';
  }
  function envTail() { return IS_TEST ? '&env=test' : ''; }

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
    newPasscode: function () { return randFrom(CODE_ALPHA, 6); },
    newToken: function () { return randFrom(TOKEN_ALPHA, 14); },
    genCodes: genCodes,
    normCode: normCode,
    STATUS: STATUS,
    redeemTxn: redeemTxn,
    pillFor: function (status) {
      var s = STATUS[status] || STATUS.active;
      return '<span class="pill ' + s.pill + '">' + s.label + '</span>';
    },
    audit: audit,
    fmt: function (ms) { return ms ? NL.formatDateTime(ms) : '—'; },
    ago: function (ms) { return ms ? NL.timeAgo(ms) : '—'; },
    crestImgHtml: crestImgHtml,
    ROSE: ROSE,
    UW_LOGO: UW_LOGO,
    clubLink: function (token) { return pageBase() + 'club/?c=' + encodeURIComponent(token) + envTail(); },
    uwLink: function (token) { return pageBase() + '?u=' + encodeURIComponent(token) + envTail(); }
  };
})();
