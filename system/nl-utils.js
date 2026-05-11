/* =========================================================================
   NL Tools — Shared utilities
   File: /tools/system/nl-utils.js
   Version: v1.2 (26/04/2026)

   Shared helper functions used by every tool page. Exposed on window.NL
   namespace. All functions are defensive — they handle missing arguments
   gracefully and never throw in normal use.

   Usage:
     NL.toast('Saved', 'success');
     NL.formatDate('2026-04-17');    // → '17 April 2026'
     NL.ensureAuth().then(function(user) { ... });
     NL.escHtml('<script>');          // → '&lt;script&gt;'

   Changelog
   v1.4 (11/05/2026)
     - Manual NL.writeAudit calls suppress the auto-hook for the next
       500ms, so apps that call writeAudit immediately before an RTDB
       write get a single rich audit entry instead of manual + auto.
     - NL.writeAudit no longer silently swallows write failures —
       errors are surfaced via console.warn so future "audit looks
       empty" issues are visible at first glance.

   v1.3 (11/05/2026)
     - Added NL.installAuditHook(): proxies the firebase.database Reference
       prototype so every set/update/push/remove/transaction call writes
       an entry to admin/audit/{key} automatically. Paths under
       admin/audit*, presence/ and .info/ are skipped to avoid loops/noise.
       Auto-installs at script load if firebase is already initialised.
     - writeAudit() now sets action prefix based on path so the feed
       groups by tool (e.g. tasks_changed, holiday-lieu_changed).

   v1.2 (26/04/2026)
     - Added NL.icon(name, size) helper — returns SVG element referencing
       /tools/assets/icons/sprites.svg. Usage: NL.icon('add') or
       NL.icon('download', 'sm'). Sizes: sm/md/lg.

   v1.1 (17/04/2026)
     - writeAudit helper added.

   v1.0 (17/04/2026)
     - Initial centralised utilities. Extracted from duplicated code
       across all tool pages.
   ========================================================================= */

(function() {
  'use strict';

  window.NL = window.NL || {};

  /* ── Toast notification ──────────────────────────────────────────────── */
  var toastTimeout = null;
  var toastEl = null;

  window.NL.toast = function(message, type) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    var kind = type || 'success';
    toastEl.className = 'toast toast--' + kind + ' show';
    toastEl.textContent = message || '';
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function() {
      toastEl.classList.remove('show');
    }, 3500);
  };

  /* ── Auth helper: wait for Firebase Auth to resolve before reading/writing ── */
  /* Auth-guard may fire nlAuthReady with a cached session before Firebase
     Auth has actually restored the live user. Any RTDB operation that needs
     a real auth token must wrap in ensureAuth(). */
  window.NL.ensureAuth = function() {
    return new Promise(function(resolve, reject) {
      if (!window.firebase || !firebase.auth) {
        reject(new Error('Firebase Auth not loaded'));
        return;
      }
      var user = firebase.auth().currentUser;
      if (user) { resolve(user); return; }
      var unsub = firebase.auth().onAuthStateChanged(function(u) {
        unsub();
        if (u) resolve(u);
        else reject(new Error('Not authenticated'));
      });
    });
  };

  /* ── Date helpers ────────────────────────────────────────────────────── */
  /* Accepts multiple formats:
     - ISO: "2026-04-17" or "2026-04-17T09:30"
     - UK with time: "17/04/2026 09:30" or "17/04/2026 09:30:00"
     - UK date only: "17/04/2026"
  */
  window.NL.parseDate = function(str) {
    if (!str) return null;
    str = String(str).trim();
    if (!str) return null;

    var d;

    /* UK format: DD/MM/YYYY with optional HH:MM[:SS] */
    var ukMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ukMatch) {
      d = new Date(
        parseInt(ukMatch[3], 10),
        parseInt(ukMatch[2], 10) - 1,
        parseInt(ukMatch[1], 10),
        parseInt(ukMatch[4] || 0, 10),
        parseInt(ukMatch[5] || 0, 10),
        parseInt(ukMatch[6] || 0, 10)
      );
      return isNaN(d.getTime()) ? null : d;
    }

    /* ISO format: YYYY-MM-DD with optional THH:MM[:SS] */
    var isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (isoMatch) {
      d = new Date(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10),
        parseInt(isoMatch[4] || 0, 10),
        parseInt(isoMatch[5] || 0, 10),
        parseInt(isoMatch[6] || 0, 10)
      );
      return isNaN(d.getTime()) ? null : d;
    }

    /* Fallback: let JS Date try */
    d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  window.NL.formatDate = function(str) {
    var d = window.NL.parseDate(str);
    if (!d) return '—';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  };

  /* Short format, e.g. '17 Apr 2026' */
  window.NL.formatDateShort = function(str) {
    var d = window.NL.parseDate(str);
    if (!d) return '—';
    return d.getDate() + ' ' + MONTHS[d.getMonth()].substring(0, 3) + ' ' + d.getFullYear();
  };

  /* ── HTML escape ─────────────────────────────────────────────────────── */
  window.NL.escHtml = function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /* JS string escape (for embedding in single-quoted inline handlers) */
  window.NL.escJ = function(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
  };

  /* ── Session helper ──────────────────────────────────────────────────── */
  /* Set by auth-guard so tool pages can access session without duplication */
  window.NL.session = null;

  /* ── Audit log helpers ───────────────────────────────────────────────── */
  /* When a manual NL.writeAudit fires, the auto-hook below suppresses
     itself for AUDIT_MANUAL_SUPPRESS_MS so a single user action that
     produces "manual write + RTDB write" doesn't generate two entries.
     Call NL.writeAudit BEFORE the RTDB write to benefit from this. */
  var AUDIT_MANUAL_SUPPRESS_MS = 500;
  window.NL._auditLastManualAt = 0;

  function _auditDetailString(d) {
    if (d == null) return '';
    if (typeof d === 'string') return d;
    if (typeof d === 'number' || typeof d === 'boolean') return String(d);
    try { return JSON.stringify(d); }
    catch(e) { return String(d); }
  }

  window.NL.writeAudit = function(action, detail) {
    if (!window.firebase || !firebase.database) return;
    if (!window.NL.session) return;
    window.NL._auditLastManualAt = Date.now();
    var entry = {
      action: String(action || ''),
      detail: _auditDetailString(detail),
      uid: window.NL.session.uid,
      name: window.NL.session.name || '',
      email: window.NL.session.email || '',
      ts: Date.now()
    };
    var key = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 8);
    var updates = {};
    updates['admin/audit/' + key] = entry;
    updates['admin/audit-by-user/' + window.NL.session.uid + '/' + key] = entry;
    firebase.database().ref().update(updates).catch(function(e) {
      console.warn('NL.writeAudit failed:', e && e.code, e && e.message);
    });
  };

  /* ── Auto-audit RTDB writes ──────────────────────────────────────────── */
  /* Paths matching any of these are NOT auto-audited (avoids loops/noise).
     Editable at runtime via NL.AUDIT_AUTO.skipPatterns. */
  window.NL.AUDIT_AUTO = {
    enabled: true,
    skipPatterns: [
      /* Portal manages /admin/* itself and writes its own audit entries
         (request_approved, invite_sent, access_changed, etc.) — skip the
         whole namespace to avoid double-logging. */
      /^\/?admin(\/|$)/,
      /^\/?presence(\/|$)/,
      /^\/?\.info(\/|$)/
    ]
  };

  function _auditSkip(path) {
    var p = String(path || '');
    var pats = window.NL.AUDIT_AUTO.skipPatterns;
    for (var i = 0; i < pats.length; i++) {
      if (pats[i].test(p)) return true;
    }
    return false;
  }

  function _refPath(ref) {
    try {
      var s = ref.toString();
      return s.replace(/^https?:\/\/[^/]+/, '') || '/';
    } catch(e) { return ''; }
  }

  /* Tool name from a path: skips generic container segments like
     "app-data" / "data" so paths like /app-data/staff-tasks/items/...
     are grouped as "staff-tasks_changed" not "app-data_changed". */
  function _toolFromPath(path) {
    var parts = String(path || '').split('/').filter(Boolean);
    if (!parts.length) return 'root';
    var skip = { 'app-data': 1, 'data': 1, 'tools': 1 };
    var seg = parts[0];
    if (skip[seg] && parts.length > 1) seg = parts[1];
    return seg.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'root';
  }

  function _valueSummary(value) {
    if (value == null) return '';
    if (typeof value === 'object') {
      var keys = Object.keys(value);
      if (!keys.length) return '';
      var preview = keys.slice(0, 3).join(', ');
      return ' { ' + preview + (keys.length > 3 ? ', …' : '') + ' }';
    }
    var s = String(value);
    return ' = ' + (s.length > 40 ? s.slice(0, 40) + '…' : s);
  }

  function _autoAudit(op, path, value) {
    if (!window.NL.AUDIT_AUTO.enabled) return;
    if (!window.NL.session) return;
    if (window.NL._auditWriting) return;
    if (_auditSkip(path)) return;
    /* If a manual NL.writeAudit just fired, the calling code is logging
       this action itself — skip the auto entry to avoid duplicates. */
    if (Date.now() - window.NL._auditLastManualAt < AUDIT_MANUAL_SUPPRESS_MS) return;
    var tool = _toolFromPath(path);
    var detail = op + ' ' + path + _valueSummary(value);
    window.NL._auditWriting = true;
    try { window.NL.writeAudit(tool + '_changed', detail); }
    finally { window.NL._auditWriting = false; }
  }

  window.NL.installAuditHook = function() {
    if (window.NL._auditHookInstalled) return;
    if (!window.firebase || !firebase.database || !firebase.database.Reference) return;
    var R = firebase.database.Reference.prototype;
    if (!R) return;

    var origSet = R.set;
    R.set = function(value) {
      _autoAudit('set', _refPath(this), value);
      return origSet.apply(this, arguments);
    };

    var origUpdate = R.update;
    R.update = function(values) {
      var base = _refPath(this);
      if (values && typeof values === 'object') {
        /* update() may carry many absolute paths in its keys */
        var keys = Object.keys(values);
        var nonSkipped = [];
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var full = (k.indexOf('/') === 0)
            ? k
            : (base.replace(/\/$/, '') + '/' + k);
          if (!_auditSkip(full)) nonSkipped.push(k);
        }
        if (nonSkipped.length) {
          /* Summarise by the first non-skipped path so the tool prefix is right */
          var sample = nonSkipped[0];
          var samplePath = (sample.indexOf('/') === 0)
            ? sample
            : (base.replace(/\/$/, '') + '/' + sample);
          _autoAudit('update', samplePath, values);
        }
      } else {
        _autoAudit('update', base, values);
      }
      return origUpdate.apply(this, arguments);
    };

    var origRemove = R.remove;
    R.remove = function() {
      _autoAudit('remove', _refPath(this));
      return origRemove.apply(this, arguments);
    };

    var origPush = R.push;
    R.push = function(value) {
      if (value !== undefined) _autoAudit('push', _refPath(this), value);
      return origPush.apply(this, arguments);
    };

    if (R.setWithPriority) {
      var origSWP = R.setWithPriority;
      R.setWithPriority = function(value) {
        _autoAudit('set', _refPath(this), value);
        return origSWP.apply(this, arguments);
      };
    }

    if (R.transaction) {
      var origTx = R.transaction;
      R.transaction = function() {
        _autoAudit('transaction', _refPath(this));
        return origTx.apply(this, arguments);
      };
    }

    window.NL._auditHookInstalled = true;
  };

  /* ── data-audit click delegation ──────────────────────────────────────── */
  /* Any element (or ancestor) carrying data-audit="action_name" triggers an
     audit entry when clicked. Optional data-audit-detail supplies a detail
     string; if omitted, the element's trimmed textContent is used (capped
     to 80 chars). Handlers can mutate data-audit-detail just before the
     click to inject runtime context. */
  function _onAuditClick(e) {
    var t = e.target && e.target.closest && e.target.closest('[data-audit]');
    if (!t) return;
    if (!window.NL.writeAudit) return;
    var action = t.getAttribute('data-audit');
    if (!action) return;
    var detail = t.getAttribute('data-audit-detail');
    if (detail == null) {
      detail = (t.textContent || '').replace(/\s+/g, ' ').trim();
      if (detail.length > 80) detail = detail.slice(0, 80) + '…';
    }
    try { window.NL.writeAudit(action, detail); } catch(err) {}
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', _onAuditClick, true);
  }

  /* Auto-install if firebase is already loaded; otherwise wait. */
  if (window.firebase && window.firebase.database) {
    try { window.NL.installAuditHook(); } catch(e) {}
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      if (window.firebase && window.firebase.database) {
        try { window.NL.installAuditHook(); } catch(e) {}
      }
    });
  }

  /* ── Icon helper ─────────────────────────────────────────────────────── */
  /* Returns an SVG element referencing the sprite sheet.
     Usage: NL.icon('add')           → <svg class="icon">...</svg>
            NL.icon('add', 'md')     → <svg class="icon icon--md">...</svg>
            NL.icon('delete', 'sm')  → <svg class="icon icon--sm">...</svg>
     Available sizes: 'sm' (16px), 'md' (20px, default), 'lg' (24px)
     Available icons: add, close, back, forward, up, down, download, upload,
       tick, refresh, settings, edit, search, eye, filter, calendar, user,
       warning, info, link, star, star-filled, send, delete             */
  window.NL.icon = function(name, size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var cls = 'icon';
    if (size && size !== 'md') cls += ' icon--' + size;
    else if (!size) cls += ' icon--md';
    else cls += ' icon--md';
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/tools/assets/icons/sprites.svg#icon-' + name);
    svg.appendChild(use);
    return svg;
  };


})();
