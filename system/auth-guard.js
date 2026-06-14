/*
 * auth-guard.js — NL Tools v2
 * File: /tools/system/auth-guard.js
 * Version: v6.1 (14/06/2026)
 *
 * v6.1: Access-level model simplified to off / access / admin. The old
 *        "hidden" level is merged into "off": there is one no-access state
 *        and it is always a silent redirect to the portal. The "off =
 *        request access" card (showDeniedCard) and the tool-requests write
 *        are removed — access is granted directly by an admin in the portal.
 *        Legacy "hidden" entries and absent entries both resolve to "off",
 *        so no data migration is required; backward-compatible at the gate.
 *
 * v6.0: BREAKING (correctness) — sessionStorage is now cache only. Every page
 *        load waits for firebase.auth() to confirm a signed-in user, then
 *        re-reads users/<uid> and tools/<key> before granting access.
 *        Fixes three classes of bug:
 *          (a) Race where nlAuthReady fired before Firebase Auth restored its
 *              JWT, causing tools to hit PERMISSION_DENIED on RTDB reads
 *              despite the user appearing signed in (DAZN VIP symptom).
 *          (b) Stale role/access flags lingering up to 4h after a server-side
 *              change.
 *          (c) Disabled users appearing signed in for up to 4h until cache
 *              expires.
 *        The nlAuthReady(session) contract is preserved, but firebase.auth()
 *        .currentUser is now guaranteed to be populated by the time
 *        nlAuthReady fires. No tool code changes required.
 *
 * v5.1: Writes a `page_opened` audit entry after access is granted, so
 *        every tool page visit shows up in the superadmin audit log even
 *        for read-only tools that never write to RTDB.
 *
 * v5.0: Defaults lookup now uses bare role keys (`staff` / `admin` /
 *        `superadmin` / `club`) matching the portal admin UI's v5.81
 *        change and the canonical tool-registry shape. Compound keys
 *        (`nl-staff` / `nl-admin` / `nl-superadmin`) still accepted as
 *        fallback for any tool registry entries that haven't migrated.
 *        Fixes silent-redirect-to-portal for newly-deployed tools whose
 *        users don't yet have explicit per-user grants.
 *
 * v4.0: Moved to /tools/system/. Integrates with NL namespace:
 *   - Sets window.NL.session after auth
 *   - Calls window.NL.renderTopbar(session) for automatic topbar
 *   - Tool-requests path updated to /admin/tool-requests
 *
 * Requirements on tool pages:
 *   - window.NL_TOOL = { title: 'Tool Name', toolKey: 'ops-example' };
 *   - <div id="nlTopbar"></div> in <body>
 *   - #pageWrap wrapping page content (hidden by default)
 *
 * Previous versions:
 *
 * Changelog:
 * v3.5 — CRITICAL FIX: checkAccess now handles both string format ("admin",
 *         "access", "off", "hidden") and legacy boolean object format
 *         ({access: true, admin: true}). Previously an object entry was
 *         coerced to "[object Object]" which matched neither access nor
 *         admin, causing silent redirect to portal with spinner stuck.
 * v3.4 — CRITICAL FIX: nlSession now defined before NL_TOOL_KEY check
 *         so window.nlSession is always exposed (portal needs it).
 *         Added currentUser immediate check + 5s fallback for direct access.
 * v3.3 — Fixed grantAccess to wait for DOMContentLoaded before showing page.
 * v3.2 — Fixed crash: document.body.appendChild called before body exists.
 * v3.1 — Progressive loading messages. Reassurance at 3s and 8s.
 * v3.0 — Complete rewrite. sessionStorage-first architecture.
 *         Session written by portal on load. Tool pages read instantly.
 *         Falls back to Firebase Auth for direct access / bookmarks.
 *         Clean URLs always -- no tokens.
 *         Three access states: hidden (silent redirect), off (request card),
 *         access/admin (page loads).
 *         Future pages need only: var NL_TOOL_KEY + this script.
 * v2.2 — Promise.resolve() + currentUser check.
 * v2.1 — Timeout fallback for onAuthStateChanged.
 * v2.0 — Rebuilt for v2 string access model.
 * v1.0 — Initial build.
 *
 * ── Usage (two lines on every tool page) ────────────────────────────────────
 *
 *   <script>var NL_TOOL_KEY = 'ops-vacancies';</script>
 *   <script src="/tools/auth-guard.js"></script>
 *
 *   Wrap page content in: <div id="pageWrap" style="display:none">
 *   Guard shows it when access confirmed.
 *
 *   Optional callback for when access is confirmed:
 *   window.nlAuthReady = function(userData) { ... }
 *
 * ── Session written by portal ────────────────────────────────────────────────
 *
 *   Portal calls nlSession.write(uid, userData) after loading user record.
 *   Session stored in sessionStorage under key 'nl_session'.
 *   Expires after 4 hours. Cleared on sign-out.
 *
 * ── Requirements ────────────────────────────────────────────────────────────
 *
 *   Firebase compat SDKs (app + auth + database) loaded before this script.
 *   NL_TOOL_KEY defined before this script.
 */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */
  var SESSION_KEY  = 'nl_session';
  var SESSION_TTL  = 4 * 60 * 60 * 1000; /* 4 hours in ms */
  var PORTAL_URL   = '/tools/portal/';
  var LOGIN_URL    = '/tools/';
  var ROSE_URL     = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/National%20League%20rose%20white.png';

  /* ── Session helpers -- defined first so portal can always access them ─── */
  var nlSession = {
    write: function(uid, userData) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          uid:      uid,
          name:     userData.name     || '',
          email:    userData.email    || '',
          role:     userData.role     || '',
          org:      userData.org      || '',
          orgKey:   '', /* deprecated — org distinction removed, all staff treated equally */
          club:     userData.club     || '',
          jobTitle: userData.jobTitle || '',
          pending:  userData.pending  || false,
          tools:    userData.tools    || {},
          cachedAt: Date.now()
        }));
      } catch(e) {}
    },
    read: function() {
      try {
        var raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        var s = JSON.parse(raw);
        if (!s || !s.uid) return null;
        if (Date.now() - (s.cachedAt || 0) > SESSION_TTL) {
          sessionStorage.removeItem(SESSION_KEY);
          return null;
        }
        return s;
      } catch(e) { return null; }
    },
    clear: function() {
      try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
    }
  };

  /* Always expose -- portal needs this even when NL_TOOL_KEY is not set */
  window.nlSession = nlSession;

  /* ── Validate -- bail if no tool key (e.g. when loaded on portal) ───────── */
  if (typeof NL_TOOL_KEY === 'undefined' || !NL_TOOL_KEY) {
    return; /* Portal uses window.nlSession only -- no guard needed */
  }

  /* ── Loading overlay ────────────────────────────────────────────────────── */
  var styleEl = document.createElement('style');
  styleEl.textContent = [
    '@keyframes nlSpin{to{transform:rotate(360deg)}}',
    '@keyframes nlFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}'
  ].join('');
  document.head.appendChild(styleEl);

  var overlay = document.createElement('div');
  overlay.id  = 'nlAuthOverlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:#9e0000',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:carbona-variable,Arial,sans-serif',
    'flex-direction:column', 'gap:0'
  ].join(';');

  /* Card */
  var card = document.createElement('div');
  card.style.cssText = [
    'background:rgba(0,0,0,0.15)',
    'border-radius:12px',
    'padding:32px 40px',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:20px',
    'min-width:260px', 'text-align:center'
  ].join(';');

  /* NL Rose */
  var rose = document.createElement('img');
  rose.src = ROSE_URL;
  rose.style.cssText = 'height:44px;width:auto;opacity:0.9;';
  card.appendChild(rose);

  /* Spinner */
  var spinner = document.createElement('div');
  spinner.style.cssText = [
    'width:28px', 'height:28px',
    'border:2px solid rgba(255,255,255,0.3)',
    'border-top-color:#fff',
    'border-radius:50%',
    'animation:nlSpin 0.8s linear infinite',
    'flex-shrink:0'
  ].join(';');
  card.appendChild(spinner);

  /* Status text */
  var statusText = document.createElement('div');
  statusText.style.cssText = [
    'font-size:13px', 'font-weight:600',
    'color:rgba(255,255,255,0.9)',
    'letter-spacing:0.02em',
    'min-height:20px',
    'animation:nlFade 0.3s ease'
  ].join(';');
  statusText.textContent = 'Loading…';
  card.appendChild(statusText);

  /* Sub text */
  var subText = document.createElement('div');
  subText.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.55);margin-top:-12px;min-height:16px;';
  card.appendChild(subText);

  overlay.appendChild(card);
  /* Append overlay -- body may not exist yet if script is in <head> */
  if (document.body) {
    document.body.appendChild(overlay);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.appendChild(overlay);
    });
  }

  /* Progress messages */
  var _msgTimeout = null;
  function setStatus(msg, sub) {
    statusText.style.animation = 'none';
    void statusText.offsetWidth; /* reflow to restart animation */
    statusText.style.animation = 'nlFade 0.3s ease';
    statusText.textContent = msg;
    subText.textContent    = sub || '';
  }

  /* Reassurance message if things are taking a while */
  var _slowTimer = setTimeout(function() {
    setStatus('Still loading…', 'This can take a moment on first visit');
  }, 3000);

  var _verySlowTimer = setTimeout(function() {
    setStatus('Nearly there…', 'Waking up the server');
  }, 8000);

  function removeOverlay() {
    clearTimeout(_slowTimer);
    clearTimeout(_verySlowTimer);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  /* ── Access check ──────────────────────────────────────────────────────── */
  function checkAccess(session, toolData) {
    if (session.pending) {
      window.location.replace(PORTAL_URL + '?guard=pending');
      return;
    }

    /* Superadmin: always granted */
    if (session.role === 'superadmin') {
      grantAccess(session);
      return;
    }

    /* Resolve tool entry -- handles both string format ("admin","access","off")
       and legacy boolean object format ({access:true, admin:true}). The old
       "hidden" level was merged into "off" (v6.1): there is one no-access
       state now, and it is always a silent redirect. */
    var rawEntry = session.tools && session.tools[NL_TOOL_KEY];
    var level;
    if (!rawEntry && rawEntry !== 0) {
      level = 'off';
    } else if (typeof rawEntry === 'string') {
      level = rawEntry;
    } else if (typeof rawEntry === 'object') {
      /* Legacy object format: {access: true/false, admin: true/false} */
      if (rawEntry.admin)  level = 'admin';
      else if (rawEntry.access) level = 'access';
      else level = 'off';
    } else if (rawEntry === true) {
      level = 'access';
    } else {
      level = 'off';
    }

    /* Fallback to tool defaults if no explicit entry.
       v5.0: prefer bare role key (`staff`, `admin`, `superadmin`, `club`)
       to match the canonical tool-registry shape and the portal's v5.81
       admin-UI lookup. Compound key (`nl-${role}`) accepted as fallback
       for any older registry entries that haven't migrated. */
    if (!session.tools || !session.tools.hasOwnProperty(NL_TOOL_KEY)) {
      if (toolData && toolData.defaults) {
        /* Bare role key IS the defaults key, uniformly for every role
           (superadmin/admin/staff/club[-admin]/club-viewer/third-party).
           The legacy compound `<org>-<role>` lookup is gone with the
           deprecated orgKey (org distinction removed; all staff equal).
           A role with no defaults entry — e.g. third-party — resolves to
           'off', which is exactly the intended zero-access default. */
        level = toolData.defaults[session.role] || 'off';
      }
    }

    if (level === 'access' || level === 'admin') {
      grantAccess(session);
    } else {
      /* off (or legacy hidden) -- no access, silent redirect */
      window.location.replace(PORTAL_URL);
    }
  }

  function grantAccess(session) {
    /* Wait for DOM to be ready before showing page and calling nlAuthReady */
    function doGrant() {
      removeOverlay();
      var wrap = document.getElementById('pageWrap');
      if (wrap) wrap.style.display = 'block';
      if (typeof window.nlAuthReady === 'function') {
        window.NL = window.NL || {};
      window.NL.session = session;
      if (window.NL.renderTopbar) window.NL.renderTopbar(session);
      if (window.NL.installAuditHook) {
        try { window.NL.installAuditHook(); } catch(e) {}
      }
      if (window.NL.writeAudit) {
        try {
          var toolTitle = (window.NL_TOOL && window.NL_TOOL.title) || '';
          var toolKey   = (typeof NL_TOOL_KEY !== 'undefined' && NL_TOOL_KEY) ||
                          (window.NL_TOOL && window.NL_TOOL.toolKey) || '';
          /* Throttle: suppress duplicate page_opened for the same tool
             within the same session/tab if logged in the last 5 minutes.
             Stops refreshes and back/forward nav from flooding the feed. */
          var throttleKey = 'nl_audit_open_' + (toolKey || location.pathname);
          var last = parseInt(sessionStorage.getItem(throttleKey) || '0', 10);
          if (Date.now() - last < 5 * 60 * 1000) {
            /* recently logged — skip */
          } else {
            sessionStorage.setItem(throttleKey, String(Date.now()));
            var parts = [];
            if (toolTitle) parts.push(toolTitle);
            if (toolKey && toolKey !== toolTitle) parts.push('[' + toolKey + ']');
            parts.push(location.pathname);
            window.NL.writeAudit('page_opened', parts.join(' '));
          }
        } catch(e) {}
      }
      window.nlAuthReady(session);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doGrant);
    } else {
      doGrant();
    }
  }

  /* ── Wait for Firebase Auth to resolve ─────────────────────────────────── */
  /* Resolves with the current user (or null after timeout). The first of:
     immediate currentUser, onAuthStateChanged firing, or AUTH_TIMEOUT_MS
     elapsed. */
  var AUTH_TIMEOUT_MS = 8000;
  function waitForFirebaseUser() {
    return new Promise(function (resolve) {
      var resolved = false;
      function done(u) {
        if (resolved) return;
        resolved = true;
        resolve(u || null);
      }

      /* Immediate check -- might already be restored from IndexedDB */
      var current = firebase.auth().currentUser;
      if (current) { done(current); return; }

      var unsub = firebase.auth().onAuthStateChanged(function (u) {
        if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
        done(u);
      });

      setTimeout(function () { done(firebase.auth().currentUser); }, AUTH_TIMEOUT_MS);
    });
  }

  /* ── Main flow ─────────────────────────────────────────────────────────── */
  /* v6.0: single path. sessionStorage is cache only.
     1. Wait for Firebase Auth to confirm a signed-in user.
     2. If no user → clear cache, redirect to login.
     3. Re-read users/<uid> + tools/<key> in parallel (source of truth).
     4. Refresh sessionStorage cache.
     5. checkAccess against fresh data. */
  function run() {
    /* Show "Verifying" if we have a cached session, otherwise "Signing in". */
    setStatus(nlSession.read() ? 'Verifying session…' : 'Signing you in…');

    waitForFirebaseUser().then(function (user) {
      if (!user) {
        /* No Firebase Auth user. Either truly signed out, or session has
           expired / been revoked since the cache was written. */
        nlSession.clear();
        window.location.replace(LOGIN_URL);
        return;
      }

      setStatus('Loading your profile…');
      var db = firebase.database();

      Promise.all([
        db.ref('users/' + user.uid).once('value'),
        db.ref('tools/' + NL_TOOL_KEY).once('value')
      ]).then(function (snaps) {
        if (!snaps[0].exists()) {
          /* User record missing -- account deleted or never set up. */
          nlSession.clear();
          window.location.replace(PORTAL_URL + '?guard=error');
          return;
        }
        var userData = snaps[0].val();
        var toolData = snaps[1].exists() ? snaps[1].val() : null;

        /* Refresh cache so portal / other tools see the latest values. */
        nlSession.write(user.uid, userData);
        checkAccess(nlSession.read(), toolData);
      }).catch(function (err) {
        console.error('[auth-guard] RTDB read failed:', err);
        window.location.replace(PORTAL_URL + '?guard=error');
      });
    });
  }

  run();

})();
