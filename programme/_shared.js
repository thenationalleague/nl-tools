/*
  Programme Packs — shared runtime for the library + admin console
  Version: v1.0 (03/08/2026) — initial build.
  File: /programme/_shared.js

  Loaded by /programme/ (club + directory view) and /programme/admin/ (NL
  console), AFTER the Firebase compat SDKs and BEFORE nl-utils.js.

  Initialises the NAMED Firebase app ('nlProgramme') so this family's sign-in
  can never clobber a portal login open in another tab — the same isolation
  pattern as /uw-promo/ and /footage/club/. The admin console additionally runs
  auth-guard on the DEFAULT app; the two coexist precisely because of this.

  Access model (the bit that matters)
  -----------------------------------
  A club types a 6-character passcode. It is NOT checked here — it goes to the
  `programmeAuth` RTDB trigger, which validates it with the Admin SDK and writes
  back a custom token carrying a `pClub` claim (the club's clubs-meta code, or
  'NL'). We sign in with that token, so every subsequent read and write is
  authorised by Storage/RTDB rules against a claim the browser cannot forge.

  A trigger rather than a callable because the project's org policy blocks
  granting public invoker to new Cloud Run services, and clubs have no Google
  account — see functions/programme.js for the full reasoning.

  This is the one deliberate difference from /uw-promo/, where passcodes are
  world-readable and compared client-side. Here no client ever reads a passcode:
  app-data/media-programme/config is closed to everything except a pClub '*'
  session. Write-own is enforced by the rules, not by this file.

  Exposes window.PP:
    PP.app / PP.db() / PP.storage()   named app + its database/storage
    PP.ref(path)                      ref under app-data/media-programme
    PP.enter(code, token)             → Promise<session>  (club/NL passcode)
    PP.enterAsAdmin()                 → Promise<session>  (portal admin → '*')
    PP.resume()                       → Promise<session|null> (remembered device)
    PP.forget()                       clear the remembered passcode
    PP.session                        { code, name, division, isNL, isAdmin }
    PP.audit(action, fields)          append audit entry (server ts)
    PP.newPasscode() / PP.newToken()  admin: mint access credentials
    PP.clubLink(token)                absolute per-club direct link
    PP.fmt(ms) / PP.ago(ms)           date-time / relative (canon-backed)
    PP.crestImgHtml(name, px)         crest <img> string (thumb → full → rose)

  Pure helpers (unit-tested in tests/programme.test.mjs — no Firebase needed):
    PP.normCode(s)                    passcode normalisation
    PP.safeName(s)                    filename → storage-path-safe
    PP.storagePath(club, folder, id, name)
    PP.adState(file, nowMs)           'live' | 'upcoming' | 'expired' | null
    PP.humanSize(bytes)
    PP.fileKind(contentType, name)    'image' | 'pdf' | 'doc' | 'sheet' | 'file'

  Data lives at RTDB app-data/media-programme/{config,folders,files,trash,audit}
  and Storage programme/<CODE>/… — shapes documented in /programme/README.md.
  Rules: system/rtdb/rules.snapshot.json + system/rtdb/storage.rules.snapshot.
*/
(function () {
  'use strict';

  var ROOT = 'app-data/media-programme';
  var STORAGE_ROOT = 'programme';
  var REMEMBER_KEY = 'nl-programme-access';
  var REMEMBER_DAYS = 30;

  /* Named app — NOT the default app (see header). nl-utils' audit hook
     self-skips when there's no default app; on the admin console the default
     app DOES exist (auth-guard), so this family keeps its own audit trail
     under app-data/media-programme/audit either way. */
  var app = firebase.initializeApp({
    apiKey: "AIzaSyC3az3OMnU7TdqlaWp8yrO_EjgZ36l-mXU", authDomain: "nl-tools.firebaseapp.com",
    databaseURL: "https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app", projectId: "nl-tools",
    storageBucket: "nl-tools.firebasestorage.app", messagingSenderId: "801354670005",
    appId: "1:801354670005:web:05d8ebad3e7e63610d03fc"
  }, 'nlProgramme');

  /* ── Pure helpers ──────────────────────────────────────────────────────
     No Firebase, no DOM — everything here is exercised directly by
     tests/programme.test.mjs. Keep it that way. */

  /* Passcodes come off a printed card and get retyped, so match on the
     normalised form: uppercase, alphanumerics only. Mirrors normCode() in
     functions/programme.js — if you change one, change both (the test file
     asserts a shared set of cases). */
  function normCode(s) {
    return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* A filename becomes part of a Storage object path, so strip anything that
     would break the path or let a name climb out of its folder. Keeps the
     extension readable; the unique fileId in front guarantees no collision. */
  function safeName(s) {
    var name = String(s == null ? '' : s).trim();
    name = name.replace(/[\\/]/g, '-');              // no path separators
    name = name.replace(/\.{2,}/g, '.');             // no traversal
    name = name.replace(/[^A-Za-z0-9._ -]/g, '');    // conservative allowlist
    name = name.replace(/-{2,}/g, '-');              // collapse runs left by the above
    name = name.replace(/^[.\-\s]+/, '');            // '../../etc/x' → 'etc-x', not '.-.-etc-x'
    name = name.replace(/\s+/g, ' ').trim();
    if (!name || name === '.' || name === '..') name = 'file';
    return name.slice(0, 120);
  }

  /* programme/<CODE>/<folderId>/<fileId>-<name>
     <CODE> is the clubs-meta 3-letter code (or NL) and is the segment the
     Storage rules match on — never change its position in this path without
     changing system/rtdb/storage.rules.snapshot. */
  function storagePath(club, folderId, fileId, name) {
    return STORAGE_ROOT + '/' + club + '/' + folderId + '/' + fileId + '-' + safeName(name);
  }

  /* NL adverts carry an optional usedFrom/usedUntil window (epoch ms) so a
     club can see which advert belongs in THIS weekend's programme rather than
     scrolling a pile of PNGs. Returns null for anything undated — club files
     are always undated, and an undated NL asset (a spec sheet, the league
     wordmark) is evergreen rather than out of date. Boundaries are inclusive. */
  function adState(file, nowMs) {
    if (!file) return null;
    var from = file.usedFrom || null, until = file.usedUntil || null;
    if (!from && !until) return null;
    var now = nowMs == null ? Date.now() : nowMs;
    if (from && now < from) return 'upcoming';
    if (until && now > until) return 'expired';
    return 'live';
  }

  function humanSize(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    var units = ['KB', 'MB', 'GB'], i = -1, v = b;
    do { v = v / 1024; i++; } while (v >= 1024 && i < units.length - 1);
    return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + ' ' + units[i];
  }

  function fileKind(contentType, name) {
    var t = String(contentType || '').toLowerCase();
    var ext = String(name || '').toLowerCase().split('.').pop();
    if (t.indexOf('image/') === 0) return 'image';
    if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (t.indexOf('word') !== -1 || ext === 'doc' || ext === 'docx') return 'doc';
    if (t.indexOf('sheet') !== -1 || t.indexOf('excel') !== -1 || ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'sheet';
    return 'file';
  }

  var KIND_ICON = { image: '🖼️', pdf: '📕', doc: '📄', sheet: '📊', file: '📎' };

  /* Unambiguous alphabet — no 0/O, 1/I/L — for anything a human retypes.
     Same alphabet as uw-promo, so a printed NL access card reads consistently
     whichever tool issued it. */
  var CODE_ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var TOKEN_ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

  function randFrom(alpha, len) {
    var buf = new Uint32Array(len), out = '';
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < len; i++) out += alpha[buf[i] % alpha.length];
    return out;
  }

  /* Default folders, seeded on a club's first visit. Explicitly DEFAULTS, not
     a schema: a club may rename, delete or add whatever it likes (the folder
     list is per-club data, not config). They exist so 72 clubs converge on a
     common shape by inertia rather than by mandate — there is no cross-club
     search, so the reader's only navigation aid is that most folders are
     named the same thing. 'Miscellaneous' is deliberately NOT seeded: with a
     read-all library, a folder called Miscellaneous is where a sponsor
     contract ends up. */
  var DEFAULT_FOLDERS = [
    { name: 'Crest & Logos', sortOrder: 1 },
    { name: 'Photos', sortOrder: 2 },
    { name: 'Club Info', sortOrder: 3 }
  ];

  var NL_FOLDERS = [
    { name: 'Adverts', sortOrder: 1 },
    { name: 'Templates & Specs', sortOrder: 2 },
    { name: 'League Assets', sortOrder: 3 }
  ];

  /* ── Session ───────────────────────────────────────────────────────────── */

  var session = null;

  /* Passcode validation goes through RTDB, not a callable.
     The project carries an org policy that blocks granting `allUsers` invoker
     to new Cloud Run services, so an onCall function is unreachable for clubs
     (who have no Google account) — see functions/programme.js. Instead we sign
     in anonymously (Identity Toolkit, not Cloud Run, so the policy doesn't
     apply), drop a request node, and wait for the programmeAuth trigger to
     write back a custom token.

     Eventarc delivery is slow — allow well past footage's measured ~15-20s
     before giving up, and let the UI say so rather than looking hung. */
  var AUTH_TIMEOUT_MS = 60000;

  function requestGrant(payload) {
    /* The request is written by whichever app owns the waiting session: the
       named app for a club (anonymous), the DEFAULT app for an admin (their
       portal login). The rules key both nodes on auth.uid, so each caller can
       only ever see its own grant. */
    var useDefault = payload.admin === true;
    var authApp = useDefault ? firebase.app() : app;

    return Promise.resolve()
      .then(function () {
        var u = authApp.auth().currentUser;
        if (u) return u;
        if (useDefault) throw new Error('You need to be signed in.');
        return authApp.auth().signInAnonymously().then(function (c) { return c.user; });
      })
      .then(function (user) {
        var uid = user.uid;
        var db = authApp.database();
        var reqRef = db.ref(ROOT + '/authRequests/' + uid);
        var grantRef = db.ref(ROOT + '/authGrants/' + uid);

        /* Clear anything left by a previous attempt before listening. A stale
           authGrants/<uid> would be delivered to the listener below the instant
           it attaches and accepted as this attempt's answer — with a custom
           token that expires after an hour. Clearing the request too means the
           write that follows is always a fresh value for the trigger. */
        return Promise.all([
          grantRef.remove().catch(function () {}),
          reqRef.remove().catch(function () {})
        ]).then(function () {
          return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () {
              if (done) return;
              done = true;
              grantRef.off();
              reject(new Error('That took too long. Please try again.'));
            }, AUTH_TIMEOUT_MS);

            function finish(fn) {
              if (done) return true;
              done = true;
              clearTimeout(timer);
              grantRef.off();
              fn();
              return false;
            }

            grantRef.on('value', function (snap) {
              var g = snap.val();
              if (!g) return;
              /* Clear both nodes while we still own this uid — after
                 signInWithCustomToken the uid changes and the rules would stop
                 us touching them, leaving litter behind. */
              var cleanup = Promise.all([
                grantRef.remove().catch(function () {}),
                reqRef.remove().catch(function () {})
              ]);
              finish(function () {
                cleanup.then(function () {
                  if (g.ok) resolve(g);
                  else reject(new Error(g.error || 'Passcode not recognised.'));
                });
              });
            }, function (err) {
              finish(function () { reject(err); });
            });

            var body = { at: firebase.database.ServerValue.TIMESTAMP };
            Object.keys(payload).forEach(function (k) {
              if (payload[k] != null && payload[k] !== '') body[k] = payload[k];
            });
            reqRef.set(body).catch(function (err) {
              finish(function () { reject(err); });
            });
          });
        });
      });
  }

  function remember(code, token) {
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ code: code, token: token || '', at: Date.now() }));
    } catch (e) { /* private browsing — the club just retypes next visit */ }
  }

  function recall() {
    try {
      var raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return null;
      var rec = JSON.parse(raw);
      if (!rec || !rec.code) return null;
      if (Date.now() - (rec.at || 0) > REMEMBER_DAYS * 864e5) { forget(); return null; }
      return rec;
    } catch (e) { return null; }
  }

  function forget() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
  }

  /* Exchange a passcode for a scoped session. `token` is the ?c= link token
     when the club arrived by their own link — it only narrows the search
     server-side; the passcode is always required. */
  function enter(code, token) {
    return requestGrant({ code: normCode(code), token: token || '' })
      .then(function (d) {
        return app.auth().signInWithCustomToken(d.customToken).then(function () {
          session = {
            code: d.club.code, name: d.club.name, division: d.club.division || '',
            isNL: !!d.isNL, isAdmin: false
          };
          remember(code, token);
          PP.session = session;
          return session;
        });
      });
  }

  /* Admin console path: the caller is already signed in on the DEFAULT app via
     auth-guard. programmeClaim checks their portal role server-side and returns
     a '*' token for the NAMED app, so the portal session is never modified and
     no custom claims are written onto real user accounts. */
  function enterAsAdmin() {
    /* The request is written from the DEFAULT app, so programmeAuth sees the
       real portal uid and can check users/<uid>/role. The token it returns is
       used to sign into the NAMED app, leaving the portal session untouched. */
    return requestGrant({ admin: true })
      .then(function (d) {
        return app.auth().signInWithCustomToken(d.customToken);
      })
      .then(function () {
        session = { code: '*', name: 'National League', division: '', isNL: true, isAdmin: true };
        PP.session = session;
        return session;
      });
  }

  /* Silent re-entry on a remembered device. Resolves null (never rejects) when
     there's nothing stored or the stored passcode has since been regenerated —
     the caller just shows the gate. */
  function resume() {
    var rec = recall();
    if (!rec) return Promise.resolve(null);
    return enter(rec.code, rec.token).catch(function () { forget(); return null; });
  }

  function requireSession() {
    if (!session) throw new Error('No Programme Packs session');
    return session;
  }

  /* ── Audit ─────────────────────────────────────────────────────────────
     Append-only by rule (see rules.snapshot.json) — nothing in this family,
     admin console included, can edit or prune an entry. */
  function audit(action, fields) {
    var s = session || {};
    var entry = {
      ts: firebase.database.ServerValue.TIMESTAMP,
      actor: s.isAdmin ? 'master' : ('club:' + s.code),
      actorLabel: s.name || s.code || 'unknown',
      action: action
    };
    Object.keys(fields || {}).forEach(function (k) {
      if (fields[k] != null && fields[k] !== '') entry[k] = fields[k];
    });
    return app.database().ref(ROOT + '/audit').push(entry);
  }

  var ROSE = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/National%20League%20rose.png';

  function crestImgHtml(name, px) {
    px = px || 22;
    var esc = window.NL && NL.escHtml ? NL.escHtml : function (s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    // %27-encode apostrophes (encodeURIComponent leaves them) so club names
    // like King's Lynn can't break the single-quoted onerror JS below.
    function u(url) { return String(url).replace(/'/g, '%27'); }
    var thumb = u(NL.clubs.crestUrl(name, 'thumb')), full = u(NL.clubs.crestUrl(name));
    return '<img src="' + esc(thumb) + '" alt="" loading="lazy" ' +
      'onerror="if(this.src!==\'' + esc(full) + '\'){this.src=\'' + esc(full) + '\';}else{this.onerror=null;this.src=\'' + ROSE + '\';}" ' +
      'style="width:' + px + 'px;height:' + px + 'px;object-fit:contain;flex-shrink:0;">';
  }

  window.PP = {
    ROOT: ROOT,
    STORAGE_ROOT: STORAGE_ROOT,
    app: app,
    db: function () { return app.database(); },
    storage: function () { return app.storage(); },
    ref: function (path) { return app.database().ref(ROOT + (path ? '/' + path : '')); },
    storageRef: function (path) { return app.storage().ref(path); },

    session: null,
    enter: enter,
    enterAsAdmin: enterAsAdmin,
    resume: resume,
    forget: forget,
    requireSession: requireSession,

    TS: function () { return firebase.database.ServerValue.TIMESTAMP; },
    audit: audit,

    newPasscode: function () { return randFrom(CODE_ALPHA, 6); },
    newToken: function () { return randFrom(TOKEN_ALPHA, 14); },
    clubLink: function (token) {
      return location.origin + '/programme/?c=' + encodeURIComponent(token);
    },

    DEFAULT_FOLDERS: DEFAULT_FOLDERS,
    NL_FOLDERS: NL_FOLDERS,
    NL_KEY: 'NL',
    MAX_BYTES: 100 * 1024 * 1024,   // must match storage.rules.snapshot

    normCode: normCode,
    safeName: safeName,
    storagePath: storagePath,
    adState: adState,
    humanSize: humanSize,
    fileKind: fileKind,
    kindIcon: function (kind) { return KIND_ICON[kind] || KIND_ICON.file; },

    fmt: function (ms) { return ms ? NL.formatDateTime(ms) : '—'; },
    fmtDate: function (ms) { return ms ? NL.formatDateShort(ms) : '—'; },
    ago: function (ms) { return ms ? NL.timeAgo(ms) : '—'; },
    crestImgHtml: crestImgHtml,
    ROSE: ROSE
  };
})();
