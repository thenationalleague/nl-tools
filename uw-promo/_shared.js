/*
  UW Promo Codes — shared runtime for the three standalone pages
  Version: v6.3 (09/09/2026) — canon pass: editMethodModal is the ONE
           method-change modal (the consoles' sibling copies had drifted —
           admin stamped updatedAt via a master-only full-record update, UW
           wrote the route node; one write path now, the route node the
           deeper rules grant covers, with the audit entry as the timestamp
           record). dateStamp() replaces three byte-identical filename
           stamps (canon candidate for NL.dateStamp).
  Version: v6.2 (09/09/2026) — remembered sessions for the laptop surfaces
           (owner ruling: the till asks every visit; everything else keeps a
           proper session with Sign out). remember/forget/resume store the
           CREDENTIAL, not the session, and resume re-runs the handshake —
           each tab still mints its own token (v5.1 stands) and a rotated
           credential fails once, forgets itself and shows the gate.
  Version: v6.1 (09/09/2026) — method identity is shared: METHOD/methodPill
           (in-store green, online blue, unassigned amber) and
           methodConsequences(from, to) — the one place the consequences of
           a method change are written, so both consoles warn identically.
  Version: v6.0 (09/09/2026) — the two methods part ways cleanly (owner
           feedback round 2). faceOf names the pre-dispatch stage for who
           acted: 'Created' for a central code, 'Issued' for a club upload.
           New reqFace/reqPill: a request's state is DERIVED from the
           uploads that answer it — waiting → overdue → fulfilled →
           dispatched — nothing on a request is ever pressed after raising
           it, and only a request still short of its ask can be overdue.
  Version: v5.1 (09/09/2026) — auth is per-tab now (persistence NONE).
           Firebase's default persistence shares one current user across
           same-origin tabs, and the handshake's anonymous first step (or a
           holding response, which never upgrades past it) downgraded the
           session in every other open UW tab — an open till then died on
           permission_denied at codes. Found on the first real sandbox
           multi-tab walkthrough. Every page re-gates on every visit, so
           in-memory auth costs nothing.
  Version: v5.0 (09/09/2026) — spec v43.0. chooseRoute() carries a manager's
           in-app route choice (route, undertakings, scheme contacts) through
           the auth trigger and folds the grant back into the session.
           faceOf() derives the presentation ladder over statusOf() — an
           active central code reads issued until dispatchedAt is set, then
           dispatched; expired/redeemed/revoked still win — and STATUS gains
           pills for the two new faces. Sessions carry hasCentral so a club
           that left the in-store route keeps a working till while its
           central codes remain in the wild.
  Version: v4.0 (03/09/2026) — spec v42.0 lands. UWP.VALUE is the one place
           the voucher's worth exists (£40-vs-£50 is unresolved upstream; one
           line changes it everywhere) and UWP.TCS_URL the fan-facing terms.
           Central codes expire 12 months from createdAt — isExpired/
           expiresAt/statusOf derive it (nothing stored, so it covers every
           central code already in the system) and redeemTxn refuses an
           expired central code; club-uploaded codes never expire here, their
           POS is the authority. Sessions carry route + support address from
           the grant, holding responses render as information not error, and
           notifyUpload posts the upload-complete email via the GAS router.
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

  /* Auth lives in THIS TAB ONLY. Firebase's default persistence shares one
     current user across every same-origin tab, and the handshake below signs
     in anonymously before upgrading to a role-carrying custom token — so a
     gate in one tab (worst case a holding response, which never upgrades)
     silently downgraded the session in an already-open till tab, and its
     next read died on permission_denied at codes. Every page here demands a
     credential on every visit, so nothing is lost by keeping the session in
     memory — and a till stays the till you signed into, whatever happens in
     the tab next door.

     'none' is the compat SDK's Persistence.NONE constant, used directly so
     an environment without the constants object (the unit tests' stub) still
     loads this file; a failed call degrades to the old shared behaviour. */
  var persistenceReady = Promise.resolve();
  try {
    persistenceReady = Promise.resolve(app.auth().setPersistence('none'))
      .catch(function () {});
  } catch (e) {}

  function ensureAuth() {
    try {
      return persistenceReady.then(function () {
        var u = app.auth().currentUser;
        if (u) return u;
        return app.auth().signInAnonymously().then(function (c) { return c.user; });
      });
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
              if (g.ok) { resolve(g); return; }
              var e = new Error(g.error || 'Not recognised.');
              /* A correct credential for a club that is not yet activated, or
                 a till PIN at an online-route club. The gate shows a holding
                 state, not an error — the person did nothing wrong. */
              if (g.holding) e.holding = true;
              reject(e);
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
            route: g.route || 'unassigned',
            support: g.support || null,
            /* §4: a club moved off in-store keeps a live till for the cards
               already in the wild — this flag is how the page knows. */
            hasCentral: g.hasCentral === true,
            creds: g.creds || null, clubs: g.clubs || null
          };
          window.UWP.session = SESSION;
          return SESSION;
        });
      });
  }

  /* ── Remembered sessions (owner ruling 09/09/2026) ───────────────────
     The till demands its PIN on every visit — that URL sits behind a QR on
     public display. The three laptop surfaces (UW dashboard, master
     console, club manager view) instead remember the CREDENTIAL in
     localStorage and silently re-run the server handshake on load. The
     credential, deliberately not the session: each tab mints its own
     scoped token, so tabs still never share live auth state (v5.1's fix
     stands), and a rotated or reissued credential simply fails the
     handshake once, forgets itself, and shows the gate. Sign out =
     forget + reload. */
  function credKey(kind) { return 'uwPromoCred:' + kind + (IS_TEST ? ':test' : ''); }
  function remember(kind, code, token) {
    try { window.localStorage.setItem(credKey(kind), JSON.stringify({ code: code, token: token || null })); } catch (e) {}
  }
  function forget(kind) {
    try { window.localStorage.removeItem(credKey(kind)); } catch (e) {}
  }
  function resume(kind) {
    var saved = null;
    try { saved = JSON.parse(window.localStorage.getItem(credKey(kind)) || 'null'); } catch (e) {}
    if (!saved || !saved.code) return Promise.resolve(null);
    return signIn(saved.code, saved.token).catch(function () {
      forget(kind);
      return null;
    });
  }

  /* ── The one voucher value, and the fan-facing terms ─────────────────
     Spec v42.0 item 3: public marketing says £40, every internal document
     says £50, and until that resolves nothing may hardcode a number — every
     piece of copy, confirmation and export reads this constant, so the answer
     is one line here when it lands. £50 is the standing internal figure
     (owner call, 03/09/2026). */
  var VALUE = '£50';
  var TCS_URL = 'https://partner.uw.co.uk/national-league';

  /* Fire-and-forget email when an online club completes an upload — closes
     the gap where codes sat uploaded for up to a month with nobody told
     (spec item 6). Recipients live in RTDB config/support (set from the
     master console, read by GAS with its server credential) — NEVER in this
     public repo. Failure is swallowed: the upload itself already succeeded
     and is audited, and the admin console shows club uploads regardless. */
  function notifyUpload(club, count, batchLabel) {
    try {
      return fetch(NL.endpoints.gas + '?cb=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'uwPromo_uploadNotify',
          clubName: club.name, clubCode: club.code,
          count: count, batchLabel: batchLabel || '',
          test: IS_TEST
        })
      }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  /* The club choosing its own route (spec v43 §1–3) — manager session only,
     authorised like rotatePin by the minted uid. `ticks` is the route's five
     undertakings, `contacts` at least one {name, role, email}. On success the
     route is locked server-side and the grant carries the new route (plus
     till credentials when in-store), so the dashboard unlocks without a
     second sign-in. */
  function chooseRoute(route, ticks, contacts) {
    return requestGrant({ chooseRoute: route, ticks: ticks, contacts: contacts }).then(function (g) {
      if (SESSION) {
        SESSION.route = g.route;
        SESSION.creds = g.creds || null;
        if (g.route === 'instore') SESSION.hasCentral = SESSION.hasCentral || false;
      }
      return g;
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
    revoked:  { label: 'Revoked',    pill: 'pill--rejected' },
    expired:  { label: 'Expired',    pill: 'pill--expired' },  // derived, never stored — see statusOf
    /* Both derived by faceOf for an active undispatched code. 'Issued' is a
       club act (an upload); 'Created' is ours — same lifecycle stage, named
       for who did it (owner ruling 09/09/2026). */
    created:    { label: 'Created',    pill: 'pill--info' },
    issued:     { label: 'Issued',     pill: 'pill--info' },
    dispatched: { label: 'Dispatched', pill: 'pill--soon' }     // derived — faceOf: active + dispatchedAt
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
  function redeemTxn(cur, club, actorId, ts, now) {
    if (cur === null) return cur;
    if (cur.status !== 'active') return;
    if (cur.club && cur.club !== club.code) return;
    if (isExpired(cur, now)) return;
    cur.status = 'redeemed';
    cur.club = club.code;
    cur.clubName = club.name;
    cur.redeemedAt = ts || firebase.database.ServerValue.TIMESTAMP;
    cur.redeemedBy = actorId || ('club:' + club.code);
    return cur;
  }

  /* ── Expiry — central codes only (spec v42.0 item 4) ─────────────────
     A code UW or NL generated goes invalid 12 months after creation, because
     creation is the date this platform reliably knows. A club-uploaded code
     (createdBy 'club:*') is NEVER expired here: the club's own till system is
     the authority on its codes, and the 12-month promise is one of the
     undertakings ticked at upload, not a field we police. Nothing is stored —
     expiry is derived from createdAt, so it applies to every central code
     already in the system. `now` is injectable for tests. */
  var CODE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

  function isCentral(rec) {
    return String((rec && rec.createdBy) || '').indexOf('club:') !== 0;
  }
  function expiresAt(rec) {
    if (!rec || !isCentral(rec) || typeof rec.createdAt !== 'number') return null;
    return rec.createdAt + CODE_TTL_MS;
  }
  function isExpired(rec, now) {
    var at = expiresAt(rec);
    return at != null && (now || Date.now()) > at;
  }
  /* Display status: the stored three-state lifecycle, plus the derived
     'expired' face an unredeemed central code past its date shows. */
  function statusOf(rec, now) {
    if (rec && rec.status === 'active' && isExpired(rec, now)) return 'expired';
    return (rec && rec.status) || 'active';
  }

  /* The lifecycle face a code shows in scheme terms (spec v43 §5):
     issued → dispatched → redeemed, with expired/revoked overriding.
     'dispatched' is a flag on an active code, never a stored status —
     exactly the pattern 'expired' set. */
  function faceOf(rec, now) {
    var st = statusOf(rec, now);
    if (st === 'active' && rec && rec.dispatchedAt) return 'dispatched';
    if (st === 'active') {
      return String((rec && rec.createdBy) || '').indexOf('club:') === 0 ? 'issued' : 'created';
    }
    return st;
  }

  /* Derived request ladder — nothing on a request is ever pressed or
     written after it is raised (owner ruling 09/09/2026: "them sending the
     codes is enough"). Uploads carry the request id they answer, so the
     state falls out of the codes themselves:
       waiting    open, uploads short of the ask
       overdue    waiting, past the due date
       fulfilled  uploads meet the ask
       dispatched fulfilled, and every one of its codes marked dispatched
     Returns { key, got, qty }. `now` injectable for tests. */
  function reqFace(req, codesMap, now) {
    now = now || Date.now();
    var qty = parseInt(req && req.qty, 10) || 0;
    var mine = Object.keys(codesMap || {}).filter(function (k) {
      return codesMap[k] && codesMap[k].request === (req && req._id);
    });
    var got = mine.length;
    var key;
    if (qty && got >= qty) {
      key = mine.every(function (k) { return codesMap[k].dispatchedAt; }) ? 'dispatched' : 'fulfilled';
    } else {
      key = (req && req.due && now > req.due) ? 'overdue' : 'waiting';
    }
    return { key: key, got: got, qty: qty };
  }

  /* Redemption-method identity — shared by both consoles so the pill, the
     wording and the consequences of a change are the same everywhere.
     Semantic hues: in-store green (a live till), online blue, unassigned
     amber (the chase list — it needs an action). */
  var METHOD = {
    unassigned: { label: 'Unassigned', pill: 'pill--pending' },
    instore:    { label: 'In-store',   pill: 'pill--approved' },
    online:     { label: 'Online',     pill: 'pill--info' }
  };
  function methodPill(route) {
    var m = METHOD[route] || METHOD.unassigned;
    return '<span class="pill ' + m.pill + '">' + m.label + '</span>';
  }
  /* What a from→to change actually does, as lines a person reads before
     confirming. Owner ruling 09/09/2026: the change modal must be clear on
     consequence — this is the one place the consequences are written. */
  function methodConsequences(from, to) {
    var lines = ['Every existing code is untouched and stays valid exactly as it is.'];
    if (from === 'instore') {
      lines.push('The till and any printed cards keep working for as long as the club’s ' +
        'central codes are in the wild — but no new till cards can be printed.');
    }
    if (to === 'online') lines.push('New codes will come from the club’s own uploads, raised against requests.');
    if (to === 'instore') lines.push('New codes will be created centrally and redeemed at the club’s till — it will need a till card with its PIN.');
    if (to === 'unassigned') lines.push('The club is switched OFF: both sign-in doors show a holding screen until its manager completes setup again.');
    lines.push('The club sees the change at its next sign-in; anyone already signed in keeps their current screen until then.');
    return lines;
  }

  /* One method-change modal for both consoles. The two pages carried
     sibling copies that had already drifted — the admin one stamped
     updatedAt via a full-record update only a master token may write, the
     UW one wrote the route node the deeper rules grant covers. One
     implementation, one write path (the route node — the audit entry is
     the timestamp record), one set of consequences. */
  function editMethodModal(opts) {
    var esc = window.NL.escHtml;
    var cur = ['instore', 'online'].indexOf(opts.route) !== -1 ? opts.route : 'unassigned';
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<p class="confirm-text">' + esc(opts.name) + ' is currently ' + methodPill(cur) + '</p>' +
      '<div class="chip-group" style="margin-bottom:12px">' +
      ['online', 'unassigned', 'instore'].map(function (r) {
        return '<button class="chip' + (cur === r ? ' active' : '') +
          '" data-mpick="' + r + '">' + METHOD[r].label + '</button>';
      }).join('') + '</div>' +
      '<div data-mconseq></div>';
    var ctrl = window.NL.modal({
      title: 'Change redemption method', body: wrap,
      buttons: [{ label: 'Cancel', className: 'btn--ghost', onClick: function (x) { x.close(); } }]
    });
    wrap.addEventListener('click', function (e) {
      var go = e.target.closest('[data-mgo]');
      if (go) { commit(go.getAttribute('data-mgo')); return; }
      var b = e.target.closest('[data-mpick]');
      if (!b) return;
      var route = b.getAttribute('data-mpick');
      Array.prototype.forEach.call(wrap.querySelectorAll('[data-mpick]'), function (x) {
        x.classList.toggle('active', x === b);
      });
      var panel = wrap.querySelector('[data-mconseq]');
      if (route === cur) { panel.innerHTML = ''; return; }
      panel.innerHTML =
        '<div class="banner banner--amber" style="margin-bottom:12px"><strong>What this does</strong>' +
        '<ul style="margin:6px 0 0 18px;padding:0">' +
        methodConsequences(cur, route).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') +
        '</ul></div>' +
        '<button class="btn btn--danger" data-mgo="' + route + '">Move ' + esc(opts.name) +
        ' to ' + METHOD[route].label + '</button>';
    });
    function commit(route) {
      ensureAuth().then(function () {
        return ref('config/clubs/' + opts.code + '/route').set(route);
      }).then(function () {
        audit(opts.actor, opts.actorLabel, 'route', {
          club: opts.code, clubName: opts.name,
          detail: 'Redemption method set to ' + METHOD[route].label.toLowerCase()
        });
        window.NL.toast(opts.name + ' → ' + METHOD[route].label, 'success');
        if (opts.onDone) opts.onDone(route);
        ctrl.close();
      }).catch(function (err) {
        window.NL.toast('Method change failed: ' + err.message, 'error');
      });
    }
  }

  /* Filename date stamp (uw-promo-YYYYMMDD.csv) — was written byte-identical
     in all three pages. Canon candidate (09/09/2026): first family to need
     it; a second family makes it NL.dateStamp. */
  function dateStamp(d) {
    d = d || new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }

  var REQ_STATUS = {
    waiting:    { label: 'Waiting',    pill: 'pill--pending' },
    overdue:    { label: 'Overdue',    pill: 'pill--rejected' },
    fulfilled:  { label: 'Fulfilled',  pill: 'pill--approved' },
    dispatched: { label: 'Dispatched', pill: 'pill--soon' }
  };
  function reqPill(key) {
    var s = REQ_STATUS[key] || REQ_STATUS.waiting;
    return '<span class="pill ' + s.pill + '">' + s.label + '</span>';
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
      '<div class="print-card__url">Full voucher terms: ' + esc(TCS_URL) + '</div>' +
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
    remember: remember,
    forget: forget,
    resume: resume,
    rotateOwnPin: rotateOwnPin,
    chooseRoute: chooseRoute,
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
    VALUE: VALUE,
    TCS_URL: TCS_URL,
    CODE_TTL_MS: CODE_TTL_MS,
    isCentral: isCentral,
    isExpired: isExpired,
    expiresAt: expiresAt,
    statusOf: statusOf,
    faceOf: faceOf,
    reqFace: reqFace,
    reqPill: reqPill,
    REQ_STATUS: REQ_STATUS,
    METHOD: METHOD,
    methodPill: methodPill,
    methodConsequences: methodConsequences,
    editMethodModal: editMethodModal,
    dateStamp: dateStamp,
    notifyUpload: notifyUpload,
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
