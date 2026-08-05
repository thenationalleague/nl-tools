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
    PP.enter(code)                    → Promise<session>  (club/NL passcode)
    PP.enterAsAdmin()                 → Promise<session>  (portal admin → '*')
    PP.resume()                       → Promise<session|null> (remembered device)
    PP.forget()                       clear the remembered passcode
    PP.session                        { code, name, division, isNL, isAdmin }
    PP.audit(action, fields)          append audit entry (server ts)
    PP.newPasscode()                  admin: mint a club passcode
    PP.clubLink(code)                 absolute per-club link (branding only)
    PP.fmt(ms) / PP.ago(ms)           date-time / relative (canon-backed)
    PP.crestImgHtml(name, px)         crest <img> string (thumb → full → rose)

  Pure helpers (unit-tested in tests/programme.test.mjs — no Firebase needed):
    PP.normCode(s)                    passcode normalisation
    PP.safeName(s)                    filename → storage-path-safe
    PP.storagePath(club, folder, id, name)
    PP.humanSize(bytes)
    PP.fileKind(contentType, name)    'image' | 'pdf' | 'doc' | 'sheet' | 'file'
    PP.uploadType(file)               canonical content type for an upload

  Data lives at RTDB app-data/media-programme/{config,folders,files,trash,audit}
  and Storage programme/<CODE>/… — shapes documented in /programme/README.md.
  Rules: system/rtdb/rules.snapshot.json + system/rtdb/storage.rules.snapshot.
*/
(function () {
  'use strict';

  /* ?as=1 marks a session that an NL admin opened on a club's behalf from the
     console. The session really is the club's — it carries that club's pClub
     claim and can do exactly what the club can — so the audit would otherwise
     record the admin's actions as the club's own. This flag keeps the trail
     honest without weakening anything. It is not a permission: setting it by
     hand grants nothing, because the claim is what the rules read. */
  var VIA_ADMIN = (function () {
    try { return new URLSearchParams(location.search).get('as') === '1'; }
    catch (e) { return false; }
  })();

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

  function humanSize(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    var units = ['KB', 'MB', 'GB'], i = -1, v = b;
    do { v = v / 1024; i++; } while (v >= 1024 && i < units.length - 1);
    return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + ' ' + units[i];
  }

  /* What to store as the file's content type.
     Extension first, browser second. The browser's own File.type is derived
     from the OS registry on Windows and reports a .zip as
     application/x-zip-compressed — which the Storage rule used to refuse
     outright, so a perfectly ordinary 51MB zip failed to upload with a
     permission error (04/08/2026). Plenty of files also arrive with no type at
     all, and an empty type makes a browser guess when the file is downloaded
     later. A canonical type here fixes both ends. */
  var EXT_TYPE = {
    zip: 'application/zip', pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
    psd: 'image/vnd.adobe.photoshop',
    eps: 'application/postscript', ai: 'application/postscript',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf',
    mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg'
  };

  function uploadType(file) {
    var name = String((file && file.name) || '');
    var dot = name.lastIndexOf('.');
    var ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    if (EXT_TYPE[ext]) return EXT_TYPE[ext];
    return (file && file.type) || 'application/octet-stream';
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
  /* No sortOrder: folders render alphabetically, always. Manual ordering is
     hidden state nobody maintains, and across 72 clubs it would mean 72
     arrangements of the same three folders — the opposite of what a reader
     needs when hunting through someone else's library. */
  var DEFAULT_FOLDERS = [
    { name: 'Crest & Logos' },
    { name: 'Photos' },
    { name: 'Club Info' }
  ];

  var NL_FOLDERS = [
    { name: 'Adverts' },
    { name: 'Templates & Specs' },
    { name: 'League Assets' }
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

  function remember(code) {
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ code: code, at: Date.now() }));
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

  /* Exchange a passcode for a scoped session. The passcode is the whole
     credential — there is nothing in the URL to combine it with. A per-club
     ?c= token existed until 04/08/2026 and only narrowed the server-side
     search; see clubLink below for why it went. */
  function enter(code) {
    return requestGrant({ code: normCode(code) })
      .then(function (d) {
        return app.auth().signInWithCustomToken(d.customToken).then(function () {
          session = {
            code: d.club.code, name: d.club.name, division: d.club.division || '',
            isNL: !!d.isNL, isAdmin: false, viaAdmin: VIA_ADMIN
          };
          remember(code);
          PP.session = session;
          /* Logged after the session exists, so the entry is attributed to the
             club rather than to nobody. Failures are not logged here — the
             trigger already records a rejected passcode server-side, where it
             cannot be skipped by closing the tab. */
          audit('sign-in', {});
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
    return enter(rec.code).catch(function () { forget(); return null; });
  }

  function requireSession() {
    if (!session) throw new Error('No Programme Packs session');
    return session;
  }

  /* ── Audit ─────────────────────────────────────────────────────────────
     Append-only by rule (see rules.snapshot.json) — nothing in this family,
     admin console included, can edit or prune an entry. */
  /* Every entry records who did it and, where relevant, whose folder it was
     done to. `crossClub` is derived rather than left to each caller to
     remember: it is the question the audit exists to answer — who is taking
     other clubs' material — and a flag computed in one place cannot be
     forgotten at a call site. */
  function audit(action, fields) {
    var s = session || {};
    fields = fields || {};
    var entry = {
      ts: firebase.database.ServerValue.TIMESTAMP,
      actor: s.isAdmin ? 'master' : ('club:' + s.code),
      actorLabel: s.name || s.code || 'unknown',
      action: action
    };
    if (fields.club && !s.isAdmin && fields.club !== s.code) entry.crossClub = true;
    if (VIA_ADMIN && !s.isAdmin) {
      entry.viaAdmin = true;
      entry.actorLabel = (s.name || s.code) + ' (opened by NL)';
    }
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
    viaAdmin: VIA_ADMIN,
    /* Seeds the remembered-device slot so the club page signs itself in. Used
       by the console's "Open as" — the passcode is one the admin already
       holds, so this discloses nothing they could not read on that screen. */
    handOff: function (code) { remember(code); },
    enter: enter,
    enterAsAdmin: enterAsAdmin,
    resume: resume,
    forget: forget,
    requireSession: requireSession,

    TS: function () { return firebase.database.ServerValue.TIMESTAMP; },
    audit: audit,

    newPasscode: function () { return randFrom(CODE_ALPHA, 6); },
    /* ?club= is cosmetic only — it lets the gate show the club's crest before
       anyone has proved who they are. It is never trusted: the passcode is what
       the trigger validates, so tampering with it changes the badge on the gate
       and nothing else.

       There used to be a ?c= token beside it, a second random string that
       narrowed the server's passcode search to one club. It granted nothing —
       /programme/ with no query has always worked — but regenerating rotated it
       along with the passcode, so every bookmark and old email in the club went
       stale and a correct new passcode came back "not recognised" (Sutton,
       04/08/2026). It was guarding against two clubs drawing the same 6
       characters out of 31^6; the console now simply refuses to mint a passcode
       another club already holds, which is a guarantee rather than a tiebreak.
       So the link is branding, it never expires, and regenerating touches the
       passcode alone. */
    clubLink: function (code) {
      return location.origin + '/programme/?club=' + encodeURIComponent(code);
    },

    DEFAULT_FOLDERS: DEFAULT_FOLDERS,
    NL_FOLDERS: NL_FOLDERS,
    NL_KEY: 'NL',
    /* Files may sit loose at the top of a club's folder, not only inside one.
       They carry this as their folderId so a root file is an ordinary record
       with an ordinary storage path — the alternative, a null folderId, needs
       a special case at every read and produced exactly one: filesFor(code,
       null) matched everything, so whole-pack zips counted and packed every
       file twice. */
    ROOT_FOLDER: '_root',
    MAX_BYTES: 100 * 1024 * 1024,   // must match storage.rules.snapshot

    normCode: normCode,
    safeName: safeName,
    storagePath: storagePath,
    humanSize: humanSize,
    fileKind: fileKind,
    uploadType: uploadType,
    kindIcon: function (kind) { return KIND_ICON[kind] || KIND_ICON.file; },

    fmt: function (ms) { return ms ? NL.formatDateTime(ms) : '—'; },
    fmtDate: function (ms) { return ms ? NL.formatDateShort(ms) : '—'; },
    ago: function (ms) { return ms ? NL.timeAgo(ms) : '—'; },
    crestImgHtml: crestImgHtml,
    ROSE: ROSE
  };
})();
