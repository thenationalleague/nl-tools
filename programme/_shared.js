/*
  Programme Packs — shared runtime for the library + admin console
  Version: v1.5 (21/08/2026) — PP.codesRef / PP.CODES_ROOT. The club codes
           moved out from under this tool to app-data/club-codes: they
           are one credential now, opening Programme Packs and the Handbook
           on the same six characters. Only config moved — folders, files,
           trash, audit and this tool's own authRequests/authGrants all stay
           under ROOT — so the split is deliberate rather than a second root
           to keep in step.
  Version: v1.4 (17/08/2026) — video and audio are kinds of their own
           (🎬 / 🎵 tiles), so the library page can hand them to the
           browser's native players instead of filing them under 📎.
  Version: v1.3 (17/08/2026) — PP.enterMaster: the library's third door. An
           NL admin arriving with ?master=1 gets the console's '*' session on
           the library page itself, so all 73 folders browse AND manage in
           one place. Requires a live portal sign-in on every boot (a
           persisted '*' session is signed out, not adopted, when the portal
           login has gone); with one present, a persisted '*' is adopted to
           skip the Eventarc exchange. FB config hoisted to FB_CONFIG so
           ensureDefaultApp() can initialise the default app when auth-guard
           hasn't.
  Version: v1.2 (17/08/2026) — PP.previews: three sizes per image, the canon
           crest vocabulary (thumb / medium / full). Rendered in the BROWSER
           with a canvas, at upload time — not by a resize endpoint, because
           the org policy that blocks public invokers on new Cloud Run
           services rules a proxy URL out, and the RTDB-trigger workaround's
           Eventarc latency (~15-20s) is what killed footage previews.
           Variants live at programme/<CODE>/_previews/<fileId>-<tier>.<ext>
           and their URLs are stored on the file record, same reason url is.
  Version: v1.1 (16/08/2026) — local crestImgHtml(name, px) deleted; crest
           strings come from canon NL.clubs.crestImgHtml('thumb') + a
           NL.clubs.wireCrestImgs sweep at each render (px sizing was already
           in CSS: .own__crest / .dir__crest / .pack__crest / .club-cell img).
           PP.crestImgHtml is gone from the surface.
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
  app-data/club-codes/{clubs,nl} is closed to everything except a portal
  admin/superadmin or a pClub '*' session. Write-own is enforced by the rules,
  not by this file.

  Exposes window.PP:
    PP.app / PP.db() / PP.storage()   named app + its database/storage
    PP.ref(path)                      ref under app-data/media-programme
    PP.codesRef(path)                 ref under app-data/club-codes (the SHARED
                                      codes; console reads/writes only)
    PP.enter(code)                    → Promise<session>  (club/NL passcode)
    PP.enterAsAdmin()                 → Promise<session>  (portal admin → '*')
    PP.enterMaster()                  → Promise<session>  (library ?master=1;
                                        rejects pp/no-portal without a portal login)
    PP.resume()                       → Promise<session|null> (remembered device)
    PP.forget()                       clear the remembered passcode
    PP.session                        { code, name, division, isNL, isAdmin }
    PP.audit(action, fields)          append audit entry (server ts)
    PP.newPasscode()                  admin: mint a club passcode
    PP.clubLink(code)                 absolute per-club link (branding only)
    PP.fmt(ms) / PP.ago(ms)           date-time / relative (canon-backed)

  Crest strings are canon: NL.clubs.crestImgHtml(name, 'thumb') + a
  NL.clubs.wireCrestImgs sweep after each innerHTML render (no local helper).

  Pure helpers (unit-tested in tests/programme.test.mjs — no Firebase needed):
    PP.normCode(s)                    passcode normalisation
    PP.safeName(s)                    filename → storage-path-safe
    PP.storagePath(club, folder, id, name)
    PP.humanSize(bytes)
    PP.fileKind(contentType, name)    'image' | 'pdf' | 'doc' | 'sheet' | 'file'
    PP.uploadType(file)               canonical content type for an upload
    PP.previews.*                     thumb/medium generation (pure bits tested;
                                      make/store are browser+Firebase)

  Data lives at RTDB app-data/media-programme/{folders,files,trash,audit}, the
  codes at app-data/club-codes/{clubs,nl} (shared with the Handbook),
  and Storage programme/<CODE>/… — shapes documented in /programme/README.md.
  Rules: system/rtdb/rules.snapshot.json + system/storage/rules.snapshot.rules.
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
  var CODES_ROOT = 'app-data/club-codes';
  var STORAGE_ROOT = 'programme';
  var REMEMBER_KEY = 'nl-programme-access';
  var REMEMBER_DAYS = 30;

  /* One config, two apps. The named app is initialised here, always; the
     DEFAULT app is initialised by auth-guard's page (the console) or by
     ensureDefaultApp() when the library boots in master mode and needs to
     see the portal session. */
  var FB_CONFIG = {
    apiKey: "AIzaSyC3az3OMnU7TdqlaWp8yrO_EjgZ36l-mXU", authDomain: "nl-tools.firebaseapp.com",
    databaseURL: "https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app", projectId: "nl-tools",
    storageBucket: "nl-tools.firebasestorage.app", messagingSenderId: "801354670005",
    appId: "1:801354670005:web:05d8ebad3e7e63610d03fc"
  };

  /* Named app — NOT the default app (see header). nl-utils' audit hook
     self-skips when there's no default app; on the admin console the default
     app DOES exist (auth-guard), so this family keeps its own audit trail
     under app-data/media-programme/audit either way. */
  var app = firebase.initializeApp(FB_CONFIG, 'nlProgramme');

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
     changing system/storage/rules.snapshot.rules. */
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
    if (t.indexOf('video/') === 0 || /^(mp4|mov|m4v|webm)$/.test(ext)) return 'video';
    if (t.indexOf('audio/') === 0 || /^(mp3|wav|m4a|aac|ogg)$/.test(ext)) return 'audio';
    if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (t.indexOf('word') !== -1 || ext === 'doc' || ext === 'docx') return 'doc';
    if (t.indexOf('sheet') !== -1 || t.indexOf('excel') !== -1 || ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'sheet';
    return 'file';
  }

  var KIND_ICON = { image: '🖼️', video: '🎬', audio: '🎵', pdf: '📕', doc: '📄', sheet: '📊', file: '📎' };

  /* ── Previews — three sizes per image ─────────────────────────────────
     Same vocabulary as the canon crest tiers (NL.clubs.crestUrl):

       thumb   360px long edge  — the grid tile (128px box, retina-covered)
       medium  1600px long edge — the eye/preview modal (70vh, wide)
       full    the original     — download only

     Rendered in the BROWSER at upload time with a canvas, and their URLs
     stored on the file record next to `url`. NOT an on-demand resize
     endpoint: the org policy blocking public invokers on new Cloud Run
     services (see the header) makes such a URL unreachable, and the
     RTDB-trigger workaround pays ~15-20s of Eventarc latency per request —
     the exact combination that killed the retired footage tool's previews.
     Pre-rendering at upload costs the uploader a second and nobody else
     anything, which is the same trade the crest tiers made.

     Variants live at programme/<CODE>/_previews/<fileId>-<tier>.<ext> —
     inside the club's own prefix, so the existing Storage rules already
     cover them (write-own, clubs cannot delete), and keyed on fileId alone,
     so moving a file between folders (an RTDB-only change) never strands
     them. '_previews' cannot collide with a real folder segment: folderIds
     are push keys, which always start with '-' (or the literal '_root'). */
  var PREVIEW_TIERS = { thumb: 360, medium: 1600 };
  var PREVIEW_QUALITY = 0.82;

  /* Raster types every engine can decode AND draw to a canvas. SVG is left
     out (already small, scales by itself, and can taint a canvas); TIFF and
     PSD because no browser decodes them at all; GIF because a canvas keeps
     only the first frame, and a tile that used to animate would freeze. */
  var DECODABLE = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };

  /* What an <img> can display at all — the no-variant fallback decision.
     Broader than DECODABLE: SVG and AVIF render fine, we just don't resize
     them. A type outside this set (TIFF, PSD, EPS) shows its kind icon
     instead of a broken image. */
  var PREVIEW_RENDERABLE = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1,
    'image/gif': 1, 'image/svg+xml': 1, 'image/avif': 1 };

  function previewEligible(contentType) {
    return DECODABLE[String(contentType || '').toLowerCase()] === 1;
  }
  function previewRenderable(contentType) {
    return PREVIEW_RENDERABLE[String(contentType || '').toLowerCase()] === 1;
  }

  /* PNG sources keep alpha, so their variants stay PNG; everything else
     flattens to JPEG (with a white underfill, for WebP alpha). GIF maps to
     PNG for totality, though eligibility filters it out before this runs. */
  function previewOutput(contentType) {
    var t = String(contentType || '').toLowerCase();
    return (t === 'image/png' || t === 'image/gif')
      ? { type: 'image/png', ext: 'png' }
      : { type: 'image/jpeg', ext: 'jpg' };
  }

  /* Long edge down to `max`, aspect kept, never upscaled, never below 1px. */
  function fitWithin(w, h, max) {
    w = Math.max(1, Math.round(Number(w) || 0));
    h = Math.max(1, Math.round(Number(h) || 0));
    var edge = Math.max(w, h);
    if (edge <= max) return { w: w, h: h };
    var scale = max / edge;
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
  }

  function previewPath(club, fileId, tier, ext) {
    return STORAGE_ROOT + '/' + club + '/_previews/' + fileId + '-' + tier + '.' + ext;
  }

  /* Decode with EXIF orientation applied, so a portrait phone photo does not
     thumb sideways. Engines that don't know the option throw — fall back to
     a plain decode, then to an <img>, which modern engines orient anyway. */
  function decodeImage(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob, { imageOrientation: 'from-image' })
        .catch(function () { return createImageBitmap(blob); })
        .catch(function () { return decodeViaImg(blob); });
    }
    return decodeViaImg(blob);
  }
  function decodeViaImg(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('undecodable')); };
      img.src = url;
    });
  }

  function encodeTier(src, w, h, max, out) {
    var dims = fitWithin(w, h, max);
    var canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    if (out.type === 'image/jpeg') {   // WebP alpha would composite onto black
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, dims.w, dims.h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, dims.w, dims.h);
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b || null); }, out.type, PREVIEW_QUALITY);
    });
  }

  /* blob + canonical content type
       → { thumb?: {blob, contentType, ext}, medium?: {…} }  tiers rendered
       → {}    generation ran and the image is small enough to need none
       → null  ineligible type, or the decode/encode failed (retryable later)
     Resolves rather than rejects for everything expected — a missing preview
     must never block or fail the upload it belongs to. A tier the source
     already fits inside is skipped: a 1200px photo gets a thumb but no
     medium, and the modal simply shows the original. Browser only. */
  function makePreviews(blob, contentType) {
    if (!previewEligible(contentType)) return Promise.resolve(null);
    return decodeImage(blob).then(function (src) {
      var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
      if (!w || !h) return null;
      var out = previewOutput(contentType);
      var tiers = Object.keys(PREVIEW_TIERS).filter(function (t) {
        return Math.max(w, h) > PREVIEW_TIERS[t];
      });
      return tiers.reduce(function (chain, tier) {
        return chain.then(function (acc) {
          return encodeTier(src, w, h, PREVIEW_TIERS[tier], out).then(function (b) {
            if (b) acc[tier] = { blob: b, contentType: out.type, ext: out.ext };
            return acc;
          });
        });
      }, Promise.resolve({})).then(function (acc) {
        if (src.close) src.close();
        return acc;
      });
    }).catch(function () { return null; });
  }

  /* Upload rendered tiers into the club's prefix and hand back the record
     fields ({ previewsAt, thumbUrl?, thumbPath?, mediumUrl?, mediumPath? }).
     previewsAt marks "generation ran" even when the image needed no tier, so
     the admin backfill can tell done from never-tried. A tier whose upload
     fails is dropped silently — its consumer falls back to the original. */
  function storePreviews(club, fileId, made) {
    var fields = { previewsAt: firebase.database.ServerValue.TIMESTAMP };
    return Object.keys(made || {}).reduce(function (chain, tier) {
      return chain.then(function () {
        var v = made[tier];
        var vPath = previewPath(club, fileId, tier, v.ext);
        return app.storage().ref(vPath)
          .put(v.blob, { contentType: v.contentType, cacheControl: 'public,max-age=3600' })
          .then(function (snap) { return snap.ref.getDownloadURL(); })
          .then(function (url) {
            fields[tier + 'Url'] = url;
            fields[tier + 'Path'] = vPath;
          })
          .catch(function () {});
      });
    }, Promise.resolve()).then(function () { return fields; });
  }

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

  /* ── Master entry (the library page, opened by an NL admin) ───────────
     The library's third door, beside the passcode and the remembered device:
     an admin arrives from the console (?master=1) and gets the same '*'
     session the console holds, so every folder is browsable AND writable —
     canWrite() and the rules both already understand '*'; only this entry
     path was missing.

     The portal sign-in is required on EVERY master boot. A '*' custom-token
     session persists in this browser like any Firebase session, and adopting
     it without looking would leave master powers behind on a machine whose
     portal login has since been signed out — so no live portal session means
     no master view, and any lingering '*' session is signed out rather than
     left for the next person at the keyboard. With a live portal session the
     persisted '*' is adopted as-is, which skips the ~15-20s Eventarc
     exchange; the server-side role check re-runs whenever the exchange does
     (first visit, new browser, cleared storage). */

  function authReady(auth) {
    return new Promise(function (resolve) {
      var off = auth.onAuthStateChanged(function (u) { off(); resolve(u); });
    });
  }

  function ensureDefaultApp() {
    try { return firebase.app(); } catch (e) { return firebase.initializeApp(FB_CONFIG); }
  }

  function enterMaster() {
    return authReady(ensureDefaultApp().auth()).then(function (portalUser) {
      if (!portalUser) {
        return authReady(app.auth()).then(function (u) {
          if (u) app.auth().signOut();
          var e = new Error('The master view needs a National League portal sign-in.');
          e.code = 'pp/no-portal';
          throw e;
        });
      }
      return authReady(app.auth()).then(function (u) {
        /* Adoption is bound to the person, not just the machine: the trigger
           mints master sessions as uid pp-admin-<portal uid>, so a persisted
           '*' is only reused by the portal user it was minted for. Anyone
           else at this keyboard — admin or not — goes through the exchange,
           which re-checks THEIR role server-side and mints under THEIR name,
           so the audit can never carry the previous admin's identity. The
           one thing adoption does not re-check is a demotion of that same
           still-signed-in admin; that waits for the next fresh exchange,
           and disabling the portal account closes it everywhere. */
        if (!u || u.uid !== 'pp-admin-' + portalUser.uid) return enterAsAdmin();
        /* The rejection handler covers getIdTokenResult ALONE — hung after
           it, it would also catch a failed exchange and run a second
           ~20s round-trip just to fail again. */
        return u.getIdTokenResult().then(function (t) {
          return (t && t.claims && t.claims.pClub === '*') || null;
        }, function () { return null; }).then(function (isMaster) {
          if (isMaster) {
            session = { code: '*', name: 'National League', division: '', isNL: true, isAdmin: true };
            PP.session = session;
            return session;
          }
          /* A club's session was persisted here (an open-as visit, or a club
             machine) — exchange properly rather than borrowing it. */
          return enterAsAdmin();
        });
      });
    });
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

  var ROSE = '/assets/crests/National%20League%20rose.png';

  window.PP = {
    ROOT: ROOT,
    STORAGE_ROOT: STORAGE_ROOT,
    app: app,
    db: function () { return app.database(); },
    storage: function () { return app.storage(); },
    ref: function (path) { return app.database().ref(ROOT + (path ? '/' + path : '')); },
    /* The codes moved out from under this tool on 21/08/2026. They are one
       credential now — the same six characters open Programme Packs and the
       Handbook, and will open the Club Directory — so they live at
       app-data/club-codes/{clubs,nl} rather than inside any one tool's data.
       Per key, not on the parent: that parent also holds authRequests and
       authGrants, which clients write, and the rules are on each key by name.

       Everything ELSE Programme Packs owns (folders, files, trash, audit, and
       its own authRequests/authGrants) stays under ROOT. Only the config
       moved, so only the console's config reads and writes come through here. */
    CODES_ROOT: CODES_ROOT,
    codesRef: function (path) {
      return app.database().ref(CODES_ROOT + (path ? '/' + path : ''));
    },
    storageRef: function (path) { return app.storage().ref(path); },

    session: null,
    viaAdmin: VIA_ADMIN,
    /* Seeds the remembered-device slot so the club page signs itself in. Used
       by the console's "Open as" — the passcode is one the admin already
       holds, so this discloses nothing they could not read on that screen. */
    handOff: function (code) { remember(code); },
    enter: enter,
    enterAsAdmin: enterAsAdmin,
    enterMaster: enterMaster,
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

    previews: {
      TIERS: PREVIEW_TIERS,
      eligible: previewEligible,
      renderable: previewRenderable,
      output: previewOutput,
      fitWithin: fitWithin,
      path: previewPath,
      make: makePreviews,
      store: storePreviews
    },

    fmt: function (ms) { return ms ? NL.formatDateTime(ms) : '—'; },
    fmtDate: function (ms) { return ms ? NL.formatDateShort(ms) : '—'; },
    ago: function (ms) { return ms ? NL.timeAgo(ms) : '—'; },
    ROSE: ROSE
  };
})();
