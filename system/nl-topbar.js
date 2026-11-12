/* =========================================================================
   NL Tools — Topbar renderer
   File: /system/nl-topbar.js
   Version: v1.9 (12/11/2026)

   v1.9 — Admin panel leaves the menu: the portal's admin area has closed
          (People and cards holds people, invites and requests; the Audit
          log is its own tool). Audit log (/audit/) takes its place, for the
          same roles. The Skeleton key's tag on the small pass reads AAA
          (Access All Areas), not SKL. Cache-bust ?v=12 -> ?v=13, in lockstep with nl-utils
          ?v=55 -> ?v=56.

   v1.8 — People and cards in the menu opens the new tool at /people/, for
          the roles auth-guard lets in there today (superadmin and League
          Admin). Cache-bust ?v=11 -> ?v=12, in lockstep with nl-utils
          ?v=53 -> ?v=54.

   v1.7 — The menu under the circle, as system/permissions-plan.md sets it
          ("The top bar"). It holds no tools any more: the "Your tools" list
          and the RTDB read that filled it are gone, and the portal home is
          where you go to tools. In their place: a small version of your
          pass (name, job title, key tags, a skull tag for the Skeleton key,
          or "Your pass hasn't been issued yet"), My pass, Who can open this
          (on a tool, for the Skeleton key and whoever holds Manage there by
          their pass), People and cards (/people/, for the roles that
          open it today: superadmin and League Admin), View as (Skeleton
          key and Tester). Admin panel stays for League Admins until step 4.
          The role pill goes with the tools list. Display only: nothing here
          changes what anyone can open. Cache-bust ?v=10 -> ?v=11, in
          lockstep with nl-utils ?v=52 -> ?v=53 and auth-guard ?v=17 -> ?v=18.

   v1.6 — This file's CSS is injected as a JavaScript STRING, so every sweep
          of the estate's stylesheets walked straight past it — including the
          type-scale conversion at nl-brand v2.49. Eight hardcoded font-sizes
          were still here, the version badge among them at 10px, on the one
          component that renders on every page in the estate. All on the
          --text-* scale now. Six hand-mixed rgba() overlays become color-mix
          against the brand tokens (the topbar ground is --primary), the raw
          #4ade80 "new" dot becomes --green, the changelog scrim becomes the
          new --scrim token and its modal shadow --shadow-lg.
          tests/brand-canon.test.mjs now reads this file and auth-guard.js as
          well as nl-brand.css — the guard had the same blind spot as the
          sweep, which is why this hid. Cache-bust ?v=9 -> ?v=10.

   Renders the standardised NL Tools topbar into #nlTopbar slot. Reads
   session from window.NL_SESSION (set by auth-guard) and tool catalogue
   from /{key} in RTDB.

   Usage on every tool page:
   ----
   <div id="nlTopbar"></div>

   <script>
     window.NL_TOOL = {
       title: 'Vacancies',           // required — tool name shown in topbar
       toolKey: 'ops-vacancies',     // required — matches /{key} in RTDB
       kicker: 'NL Tools',           // optional — defaults to 'NL Tools'. Use '' on portal
       isPortal: false,              // optional — hides Portal button if true
       extras: {                     // optional — tool-specific topbar elements
         left: null,                 // HTML string inserted left of logo (e.g. menu toggle)
         right: null,                // HTML string inserted before profile (e.g. settings gear)
         middle: null               // HTML string inserted between title and profile
       }
     };
   </script>
   ----

   The topbar auto-renders when auth-guard fires nlAuthReady(session).
   Call window.NL.renderTopbar() manually if needed (e.g. portal dashboard
   which doesn't use auth-guard directly).

   Changelog
   v1.5 (25/04/2026)
     - PWA + favicon injection: injects manifest link, theme-color meta,
       favicon links, and iOS PWA meta tags into every page that loads
       nl-topbar.js. Tools no longer need these tags in their own <head>.
       Idempotent — safe to run even if tags already exist.
       Pairs with _headers file (repo root) for no-cache on system files.

   v1.4 (25/04/2026)
     - Logo now a link to /portal/ on all pages (acts as home button).
     - Removed arrow (←) from Portal button — just shows "Portal" text.

   v1.3 (21/04/2026)
     - Added "Install as app" item in profile dropdown. Captures Android Chrome's
       beforeinstallprompt event and fires the native install dialog on click.
       Hidden by default; revealed when browser confirms site is installable.
       Also hidden if app is already installed (display-mode: standalone).
     - Gracefully no-ops on iOS Safari and Firefox (no beforeinstallprompt support).

   v1.2 (17/04/2026)
     - Added "What's new" changelog feature. Tool pages declare
       window.NL_CHANGELOG = [{date, version, items: []}] and the most recent
       version appears as a clickable badge next to the title. Click opens a
       modal with full user-friendly release notes. Unread versions show a
       green dot (tracked per-tool via localStorage).
     - Removed kicker from default visible topbar (version badge replaces it).
       kicker still supported if set explicitly (legacy fallback).

   v1.1 (17/04/2026)
     - Sign-out now calls NL.writeAudit and nlSession.clear before firebase signOut.

   v1.0 (17/04/2026)
     - Initial centralised topbar component.
   ========================================================================= */

(function() {

  /* ── PWA install prompt capture ──────────────────────────────────────────
     Android Chrome fires beforeinstallprompt when site is installable.
     We capture it to trigger the native install dialog from our own UI
     (the "Install as app" item in the profile dropdown). */
  var deferredInstallPrompt = null;
  var isAppInstalled = false;

  if (typeof window !== 'undefined') {
    /* Detect if already running as installed PWA */
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      isAppInstalled = true;
    }
    if (window.navigator && window.navigator.standalone === true) {
      isAppInstalled = true; /* iOS Safari detection */
    }

    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      /* Update any open dropdown to show the item */
      var installItems = document.querySelectorAll('.topbar__dd-item--install');
      installItems.forEach(function(el) { el.style.display = ''; });
    });

    window.addEventListener('appinstalled', function() {
      isAppInstalled = true;
      deferredInstallPrompt = null;
      var installItems = document.querySelectorAll('.topbar__dd-item--install');
      installItems.forEach(function(el) { el.style.display = 'none'; });
    });
  }

  'use strict';

  /* ── Namespace ───────────────────────────────────────────────────────── */
  window.NL = window.NL || {};

  /* Same-origin — see the note on CREST_BASE in nl-utils.js. */
  var CREST_BASE = '/assets/crests/';
  var LOGO_URL = CREST_BASE + 'National%20League%20rose%20white.png';
  var LOGO_FALLBACK = CREST_BASE + 'National%20League%20rose.png';

  /* ── Public API ──────────────────────────────────────────────────────── */

  /**
   * Render the topbar into #nlTopbar slot.
   * Called automatically by auth-guard after auth resolves.
   * Safe to call multiple times (will replace existing topbar).
   */
  window.NL.renderTopbar = function(session) {
    var mount = document.getElementById('nlTopbar');
    if (!mount) {
      console.warn('[nl-topbar] No #nlTopbar slot found on page');
      return;
    }

    var cfg = window.NL_TOOL || {};
    var title = cfg.title || 'NL Tools';
    var kicker = (cfg.kicker === undefined) ? 'NL Tools' : cfg.kicker;
    var isPortal = !!cfg.isPortal;
    var extras = cfg.extras || {};

    mount.innerHTML = '';
    mount.appendChild(buildTopbar(session, {
      title: title,
      kicker: kicker,
      isPortal: isPortal,
      extras: extras,
      currentToolKey: cfg.toolKey || null
    }));

  };


  /* ── PWA + favicon injection ─────────────────────────────────────────────
     Injects manifest link, theme-color, and favicon tags into <head> on
     every page that loads nl-topbar.js. This means the portal only needs
     the PWA setup (manifest.json + sw.js) — all tool pages get the
     favicons automatically without any HTML changes. Idempotent. */
  (function injectPWAMeta() {
    var head = document.head;
    if (!head) return;

    function hasLink(rel, sizes) {
      var sel = 'link[rel="' + rel + '"]' + (sizes ? '[sizes="' + sizes + '"]' : '');
      return !!document.querySelector(sel);
    }
    function hasMeta(name) {
      return !!document.querySelector('meta[name="' + name + '"]');
    }

    /* Manifest */
    if (!document.querySelector('link[rel="manifest"]')) {
      var m = document.createElement('link');
      m.rel = 'manifest'; m.href = '/manifest.json';
      head.appendChild(m);
    }

    /* Theme colour */
    if (!hasMeta('theme-color')) {
      var tc = document.createElement('meta');
      tc.name = 'theme-color'; tc.content = '#9e0000';
      head.appendChild(tc);
    }

    /* Favicons */
    if (!hasLink('icon', '32x32')) {
      var f32 = document.createElement('link');
      f32.rel = 'icon'; f32.type = 'image/png';
      f32.setAttribute('sizes', '32x32');
      f32.href = '/assets/icons/favicon-32x32.png';
      head.appendChild(f32);
    }
    if (!hasLink('icon', '16x16')) {
      var f16 = document.createElement('link');
      f16.rel = 'icon'; f16.type = 'image/png';
      f16.setAttribute('sizes', '16x16');
      f16.href = '/assets/icons/favicon-16x16.png';
      head.appendChild(f16);
    }
    if (!hasLink('apple-touch-icon')) {
      var atc = document.createElement('link');
      atc.rel = 'apple-touch-icon';
      atc.setAttribute('sizes', '180x180');
      atc.href = '/assets/icons/apple-touch-icon.png';
      head.appendChild(atc);
    }

    /* iOS PWA meta */
    if (!hasMeta('apple-mobile-web-app-capable')) {
      var amc = document.createElement('meta');
      amc.name = 'apple-mobile-web-app-capable'; amc.content = 'yes';
      head.appendChild(amc);
    }
    if (!hasMeta('apple-mobile-web-app-status-bar-style')) {
      var ambs = document.createElement('meta');
      ambs.name = 'apple-mobile-web-app-status-bar-style';
      ambs.content = 'black-translucent';
      head.appendChild(ambs);
    }
  })();

  /* ── Topbar builder ──────────────────────────────────────────────────── */
  function buildTopbar(session, opts) {
    var header = el('header', { class: 'topbar' });

    /* Extras: left (e.g. menu toggle) */
    if (opts.extras.left) {
      var leftWrap = document.createElement('span');
      leftWrap.innerHTML = opts.extras.left;
      while (leftWrap.firstChild) header.appendChild(leftWrap.firstChild);
    }

    /* Logo — links to portal (home) on all pages */
    var logoLink = el('a', {
      class: 'topbar__logo-link',
      href: '/portal/',
      'aria-label': 'NL Tools home',
      title: 'Go to portal'
    });
    var logo = el('img', {
      class: 'topbar__logo',
      src: LOGO_URL,
      alt: 'National League'
    });
    logo.onerror = function() { this.onerror = null; this.src = LOGO_FALLBACK; };
    logoLink.appendChild(logo);
    header.appendChild(logoLink);

    /* Title + (clickable version badge if NL_CHANGELOG is declared) */
    var titleWrap = el('div', { class: 'topbar__title-wrap' });
    var titleRow  = el('div', { class: 'topbar__title-row' });
    titleRow.appendChild(el('span', { class: 'topbar__title', text: opts.title }));

    /* Version badge — clickable, opens What's new modal. League roles only:
       version/changelog detail is internal, hidden from club + third-party. */
    var vbRole = (session && session.role) || '';
    var vbIsLeague = (vbRole === 'superadmin' || vbRole === 'admin' || vbRole === 'staff');
    var changelog = window.NL_CHANGELOG;
    if (vbIsLeague && changelog && changelog.length && changelog[0].version) {
      var versionBtn = el('button', {
        class: 'topbar__version',
        type:  'button',
        'aria-label': "What's new in " + changelog[0].version,
        title: "What's new"
      });
      versionBtn.textContent = changelog[0].version;
      /* Unread dot if this version hasn't been seen */
      var seenKey = 'nl_changelog_seen:' + (opts.toolKey || 'portal');
      try {
        var seen = localStorage.getItem(seenKey);
        if (seen !== changelog[0].version) {
          var dot = el('span', { class: 'topbar__version-dot', 'aria-label': 'New' });
          versionBtn.appendChild(dot);
        }
      } catch(e) { /* localStorage may be blocked */ }
      versionBtn.addEventListener('click', function() {
        openChangelogModal(changelog, opts.toolKey, opts.title);
        try { localStorage.setItem(seenKey, changelog[0].version); } catch(e) {}
        var existingDot = versionBtn.querySelector('.topbar__version-dot');
        if (existingDot) existingDot.remove();
      });
      titleRow.appendChild(versionBtn);
    }
    titleWrap.appendChild(titleRow);

    if (opts.kicker) {
      titleWrap.appendChild(el('span', { class: 'topbar__kicker', text: opts.kicker }));
    }
    header.appendChild(titleWrap);

    /* Extras: middle */
    if (opts.extras.middle) {
      var midWrap = document.createElement('span');
      midWrap.innerHTML = opts.extras.middle;
      while (midWrap.firstChild) header.appendChild(midWrap.firstChild);
    }

    /* Portal button (tool pages only) */
    if (!opts.isPortal) {
      var portalBtn = el('a', {
        class: 'topbar__btn topbar__btn--portal',
        href: '/portal/',
        'aria-label': 'Back to portal'
      });
      portalBtn.textContent = 'Portal';
      header.appendChild(portalBtn);
    }

    /* Extras: right (e.g. settings gear) */
    if (opts.extras.right) {
      var rightWrap = document.createElement('span');
      rightWrap.innerHTML = opts.extras.right;
      while (rightWrap.firstChild) header.appendChild(rightWrap.firstChild);
    }

    /* Profile avatar + dropdown */
    var profile = buildProfile(session, opts);
    header.appendChild(profile);

    return header;
  }

  /* ── Profile (avatar + dropdown) ─────────────────────────────────────── */
  function buildProfile(session, opts) {
    var profileWrap = el('div', { class: 'topbar__profile' });

    /* Avatar */
    var isClub = !!(session && session.club && session.club.trim());
    var avatar = buildAvatar(session, isClub);
    profileWrap.appendChild(avatar);

    /* Dropdown (initially hidden) */
    var dropdown = buildDropdown(session, isClub, opts);
    profileWrap.appendChild(dropdown);

    /* Toggle on click */
    avatar.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.toggle('is-open');
    });

    /* Close on outside click */
    document.addEventListener('click', function(e) {
      if (!profileWrap.contains(e.target)) dropdown.classList.remove('is-open');
    });

    /* Close on Escape */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') dropdown.classList.remove('is-open');
    });

    return profileWrap;
  }

  function buildAvatar(session, isClub) {
    if (isClub) {
      var avatar = el('button', {
        class: 'topbar__avatar topbar__avatar--club',
        'aria-label': 'Open profile menu'
      });
      var img = el('img', {
        src: CREST_BASE + encodeURIComponent(session.club) + '.png',
        alt: session.club
      });
      img.onerror = function() {
        this.onerror = null;
        /* Fallback to initials */
        this.parentElement.className = 'topbar__avatar topbar__avatar--staff topbar__avatar--staff-2';
        this.parentElement.textContent = initials(session.club || session.name || '?');
      };
      avatar.appendChild(img);
      return avatar;
    } else {
      var inits = initials(session && session.name || session && session.email || '?');
      var sizeClass = 'topbar__avatar--staff-' + Math.min(inits.length, 4);
      return el('button', {
        class: 'topbar__avatar topbar__avatar--staff ' + sizeClass,
        'aria-label': 'Open profile menu',
        text: inits
      });
    }
  }

  /* ── The menu under the circle (v1.7) ──────────────────────────────────
     system/permissions-plan.md, "The top bar": the menu holds no tools at
     all. The portal home is where you go to tools. It holds, in order: a
     small version of your pass, My pass, Who can open this (on a tool, for
     the people who run it), People and cards (/people/), View as
     (Skeleton key and Tester), Audit log, Install as app, Sign out. It never scrolls.
     The pass is DISPLAY ONLY here: what you can open is still decided by
     auth-guard from your role. */
  function buildDropdown(session, isClub, opts) {
    var dd = el('div', { class: 'topbar__dropdown' });
    var P = window.NL && window.NL.pass;
    var pass = session && session.pass;
    var issued = !!(P && P.isIssued(pass));

    dd.appendChild(buildMiniPass(session, pass, issued));

    function item(href, iconName, label, onClick) {
      var a = el(href ? 'a' : 'button', { class: 'topbar__dd-item' });
      if (href) a.href = href; else a.type = 'button';
      var ic = el('span', { class: 'topbar__dd-item-icon' });
      if (window.NL && window.NL.icon) ic.appendChild(window.NL.icon(iconName, 'sm'));
      a.appendChild(ic);
      a.appendChild(el('span', { class: 'topbar__dd-item-label', text: label }));
      if (onClick) a.addEventListener('click', onClick);
      return a;
    }

    var onPassPage = !!(window.NL_TOOL && window.NL_TOOL.toolKey === 'pass');
    if (!onPassPage) dd.appendChild(item('/pass/', 'user', 'My pass'));

    /* Who can open this — on a tool page, for whoever runs it (Manage by the
       pass) and the Skeleton key. Worked out from the grants, never typed. */
    var toolKey = !opts.isPortal && !onPassPage && opts.currentToolKey;
    if (toolKey && issued && (P.isSkeleton(pass) || session.passLevel === 'manage')) {
      dd.appendChild(item(null, 'info', 'Who can open this', function() {
        dd.classList.remove('is-open');
        openWhoCanOpen(toolKey, opts.title);
      }));
    }

    /* Issuing passes: the Skeleton key. Until the first pass is issued nobody
       holds one, so today's superadmin role may issue too — the way in for
       the first pass. Goes at step 6, when the role stops meaning anything. */
    /* People and cards (/people/): until step 6 auth-guard opens it to the
       roles that run the portal's admin area today, so the menu offers it
       to them. */
    var role = session && session.role;
    if (role === 'superadmin' || role === 'admin') dd.appendChild(item('/people/', 'list', 'People and cards'));
    if (issued && P.canViewAs(pass)) dd.appendChild(item('/pass/?view=as', 'eye', 'View as'));

    /* The Audit log (/audit/), for the roles the database lets read it. */
    if (role === 'superadmin' || role === 'admin') dd.appendChild(item('/audit/', 'article', 'Audit log'));

    /* Install as app — shown only if browser fired beforeinstallprompt and app
       not already installed. Hidden by default (style.display='none') and
       revealed by the event listener when the prompt becomes available. */
    var installBtn = item(null, 'download', 'Install as app');
    installBtn.classList.add('topbar__dd-item--install');
    installBtn.style.display = (deferredInstallPrompt && !isAppInstalled) ? '' : 'none';
    installBtn.addEventListener('click', function() {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function() {
        deferredInstallPrompt = null;
        installBtn.style.display = 'none';
      }).catch(function() {
        deferredInstallPrompt = null;
        installBtn.style.display = 'none';
      });
    });
    dd.appendChild(installBtn);

    /* Sign out */
    dd.appendChild(el('div', { class: 'topbar__dd-divider' }));
    var signOut = el('button', { class: 'topbar__dd-item topbar__dd-item--danger', type: 'button' });
    signOut.innerHTML =
      '<span class="topbar__dd-item-icon">↪</span>' +
      '<span class="topbar__dd-item-label">Sign out</span>';
    signOut.addEventListener('click', function() {
      /* Before sign-out: write audit entry (needs auth to succeed) and clear session cache */
      try {
        if (window.NL && window.NL.writeAudit) {
          window.NL.writeAudit('signed_out', 'Signed out');
        }
      } catch(e) {}
      try {
        if (window.nlSession && window.nlSession.clear) {
          window.nlSession.clear();
        }
      } catch(e) {}
      /* Allow audit write to fire, then sign out */
      setTimeout(function() {
        if (window.firebase && firebase.auth) {
          firebase.auth().signOut().then(function() {
            window.location.replace('/');
          });
        } else {
          window.location.replace('/');
        }
      }, 50);
    });
    dd.appendChild(signOut);

    return dd;
  }

  /* A small version of your pass: the card's colour along the top, name,
     job title, a tag per key held, a skull tag for the Skeleton key. Links
     to My pass. Someone with no pass gets one line saying so. */
  function buildMiniPass(session, pass, issued) {
    var P = window.NL && window.NL.pass;
    var name = (session && session.name) || (session && session.email) || 'Unknown user';
    var card = el('a', { class: 'topbar__mini-pass', href: '/pass/', 'aria-label': 'My pass' });
    var band = el('span', { class: 'topbar__mini-pass-band' });
    card.appendChild(band);
    var body = el('span', { class: 'topbar__mini-pass-body' });
    body.appendChild(el('span', { class: 'topbar__dd-name', text: name }));

    if (!issued) {
      card.classList.add('topbar__mini-pass--none');
      body.appendChild(el('span', { class: 'topbar__dd-email', text: 'Your pass hasn’t been issued yet' }));
      card.appendChild(body);
      return card;
    }

    if (pass.jobTitle) body.appendChild(el('span', { class: 'topbar__dd-email', text: pass.jobTitle }));
    var tags = el('span', { class: 'topbar__mini-pass-tags' });
    if (P.isSkeleton(pass)) {
      var sk = el('span', { class: 'topbar__mini-pass-tag topbar__mini-pass-tag--skeleton', title: 'Skeleton key' });
      sk.innerHTML = SKULL_SVG + '<span>AAA</span>';
      tags.appendChild(sk);
    }
    P.keysHeld(pass).forEach(function(id) {
      var k = P.KEY[id];
      tags.appendChild(el('span', { class: 'topbar__mini-pass-tag', title: k.name, text: k.code }));
    });
    if (tags.childNodes.length) body.appendChild(tags);
    card.appendChild(body);

    /* Club card: the club's own band colour once clubs-meta is in. League:
       NL red, from the stylesheet. */
    if (pass.base === 'club' && window.NL.clubs && window.NL.clubs.load) {
      card.classList.add('topbar__mini-pass--club');
      window.NL.clubs.load().then(function() {
        var col = P.clubColours(window.NL.clubs.byName(pass.club));
        if (col) { band.style.background = col.band; card.style.setProperty('--mini-pass-tag', col.sticker); card.style.setProperty('--mini-pass-tag-text', col.stickerText); }
      }).catch(function() {});
    }
    return card;
  }

  /* A skull, for the Skeleton key's tag. Drawn, not an emoji. */
  var SKULL_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="currentColor">' +
    '<path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.6 1.1 4.6 2.9 5.9V19a1 1 0 0 0 1 1h1.8v-2h1.6v2h2.4v-2h1.6v2h1.8a1 1 0 0 0 1-1v-2.9c1.8-1.3 2.9-3.3 2.9-5.9C20.5 5.6 17 2 12 2zM8.6 13.6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6.8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>';

  /* "Who can open this": one read of tools/<key>, rows from the grants. */
  function openWhoCanOpen(toolKey, title) {
    var P = window.NL && window.NL.pass;
    if (!P || !window.firebase || !firebase.database || !window.NL.modal) return;
    firebase.database().ref('tools/' + toolKey).once('value').then(function(snap) {
      var w = P.whoCanOpen(snap.val());
      var esc = window.NL.escHtml || function(s) { return String(s); };
      var html;
      if (!w) {
        html = '<p>This tool has no grants yet, so only the Skeleton key opens it.</p>';
      } else {
        var shelf = w.shelf === 'structural' ? 'On the Structure shelf: only the Skeleton key opens it.'
          : w.shelf === 'sandbox' ? (w.testers ? 'In Sandbox: until it launches, only testers and the Skeleton key open it.' : 'In Sandbox: until it launches, only the Skeleton key opens it.')
          : '';
        html = (shelf ? '<p class="topbar__who-note">' + esc(shelf) + '</p>' : '') +
          '<table class="topbar__who"><tbody>' +
          (w.rows.length ? w.rows.map(function(r) {
            var lv = r.level === 'manage' ? 'Manage' : 'Access';
            if (r.granted === 'manage' && r.level !== 'manage') lv = 'Access <span class="topbar__who-later">(Manage once the tool offers it)</span>';
            return '<tr><td>' + esc(r.label) + '</td><td class="topbar__who-level">' + lv + '</td></tr>';
          }).join('') : '<tr><td colspan="2">Nobody but the Skeleton key.</td></tr>') +
          '</tbody></table>' +
          '<p class="topbar__who-note">' + esc(P.FOR[w.for] || '') +
          (w.for === 'both' ? ' · ' + esc(P.CLUB_DATA[w.clubData] || '') : '') +
          (w.sensitive ? ' · Sensitive' : '') + '</p>' +
          '<p class="topbar__who-note">Shown from the new passes. Until the switch, today’s roles still decide who gets in.</p>';
      }
      window.NL.modal({ title: 'Who can open ' + (title || 'this'), body: html, size: 'sm' });
    }).catch(function() {});
  }

  /* ── Utilities ───────────────────────────────────────────────────────── */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (!attrs) return node;
    Object.keys(attrs).forEach(function(k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function initials(str) {
    if (!str) return '?';
    var parts = String(str).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    /* Up to 4 initials — first letter of each word */
    return parts.slice(0, 4).map(function(p) { return p.charAt(0); }).join('').toUpperCase();
  }


  /* ── Changelog modal ──────────────────────────────────────────────────── */
  function openChangelogModal(changelog, toolKey, toolTitle) {
    /* Remove any existing modal first */
    var existing = document.getElementById('nlChangelogBackdrop');
    if (existing) existing.remove();

    var backdrop = el('div', { id: 'nlChangelogBackdrop', class: 'nl-changelog-backdrop' });
    var modal    = el('div', { class: 'nl-changelog-modal' });

    var head = el('div', { class: 'nl-changelog-modal__head' });
    head.appendChild(el('h3', { text: "What's new" + (toolTitle ? ' in ' + toolTitle : '') }));
    var closeBtn = el('button', {
      class: 'nl-changelog-modal__close',
      type: 'button',
      'aria-label': 'Close'
    });
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function() { backdrop.remove(); });
    head.appendChild(closeBtn);
    modal.appendChild(head);

    var body = el('div', { class: 'nl-changelog-modal__body' });
    if (!changelog.length) {
      body.appendChild(el('p', { text: 'No updates yet.' }));
    } else {
      changelog.forEach(function(entry) {
        var entryEl = el('div', { class: 'nl-changelog-entry' });
        var meta    = el('div', { class: 'nl-changelog-entry__meta' });
        if (entry.date) meta.appendChild(el('span', { class: 'nl-changelog-entry__date', text: entry.date }));
        if (entry.version) {
          meta.appendChild(el('span', { class: 'nl-changelog-entry__sep', text: '·' }));
          meta.appendChild(el('span', { class: 'nl-changelog-entry__version', text: entry.version }));
        }
        entryEl.appendChild(meta);
        if (entry.items && entry.items.length) {
          var ul = el('ul', { class: 'nl-changelog-entry__list' });
          entry.items.forEach(function(item) {
            ul.appendChild(el('li', { text: item }));
          });
          entryEl.appendChild(ul);
        } else if (entry.note) {
          entryEl.appendChild(el('p', { class: 'nl-changelog-entry__note', text: entry.note }));
        }
        body.appendChild(entryEl);
      });
    }
    modal.appendChild(body);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    /* Click backdrop to close */
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) backdrop.remove();
    });
    /* Esc to close */
    var escHandler = function(e) {
      if (e.key === 'Escape') {
        backdrop.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /* Inject changelog modal styles (one-shot) */
  if (!document.getElementById('nl-changelog-styles')) {
    var cs = document.createElement('style');
    cs.id = 'nl-changelog-styles';
    cs.textContent = [
      '.topbar__title-row{display:flex;align-items:center;gap:8px;}',
      '.topbar__version{position:relative;background:color-mix(in srgb, var(--white) 15%, var(--primary));color:var(--white);border:1px solid color-mix(in srgb, var(--white) 20%, var(--primary));padding:2px 8px;border-radius:10px;font-size:var(--text-xs);font-weight:700;font-family:var(--font);cursor:pointer;transition:all 0.15s;white-space:nowrap;letter-spacing:0.04em;}',
      '.topbar__version:hover{background:color-mix(in srgb, var(--white) 25%, var(--primary));border-color:color-mix(in srgb, var(--white) 35%, var(--primary));}',
      '.topbar__logo-link{display:flex;align-items:center;flex-shrink:0;opacity:0.92;transition:opacity 0.15s;}',
      '.topbar__logo-link:hover{opacity:1;}',
      '.topbar__version-dot{position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:var(--green);border:1.5px solid var(--primary);box-shadow:0 0 0 1px color-mix(in srgb, var(--white) 40%, var(--primary));}',
      '.nl-changelog-backdrop{position:fixed;inset:0;background:var(--scrim);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;animation:nlFade 0.15s ease-out;}',
      '.nl-changelog-modal{background:var(--white);border-radius:10px;width:100%;max-width:560px;box-shadow:var(--shadow-lg);overflow:hidden;margin:auto;animation:nlFade 0.2s ease-out;}',
      '.nl-changelog-modal__head{background:var(--primary);color:var(--white);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:7px solid var(--navy);}',
      '.nl-changelog-modal__head h3{color:var(--white);font-size:var(--text-sm);font-weight:900;font-variation-settings:\'wght\' 900;text-transform:uppercase;letter-spacing:0.1em;margin:0;}',
      '.nl-changelog-modal__close{background:none;border:none;color:color-mix(in srgb, var(--white) 60%, var(--navy));font-size:26px;cursor:pointer;line-height:1;padding:2px 8px;font-family:var(--font);}',
      '.nl-changelog-modal__close:hover{color:var(--white);}',
      '.nl-changelog-modal__body{padding:24px;max-height:65vh;overflow-y:auto;}',
      '.nl-changelog-entry{padding:16px 0;border-bottom:1px solid var(--border);}',
      '.nl-changelog-entry:first-child{padding-top:0;}',
      '.nl-changelog-entry:last-child{border-bottom:none;padding-bottom:0;}',
      '.nl-changelog-entry__meta{display:flex;gap:8px;margin-bottom:10px;align-items:center;}',
      '.nl-changelog-entry__date{font-size:var(--text-xs);font-weight:900;font-variation-settings:\'wght\' 900;color:var(--navy);text-transform:uppercase;letter-spacing:0.08em;}',
      '.nl-changelog-entry__sep{color:var(--text-muted);font-size:var(--text-xs);}',
      '.nl-changelog-entry__version{font-size:var(--text-xs);color:var(--text-muted);font-weight:600;background:var(--off-white);border:1px solid var(--border);padding:1px 7px;border-radius:10px;}',
      '.nl-changelog-entry__list{margin:0;padding-left:20px;}',
      '.nl-changelog-entry__list li{font-size:var(--text-sm);line-height:1.6;color:var(--text);margin-bottom:6px;}',
      '.nl-changelog-entry__list li:last-child{margin-bottom:0;}',
      '.nl-changelog-entry__note{font-size:var(--text-sm);line-height:1.6;color:var(--text);}',
      /* v1.7 — the small pass at the head of the menu. Canon candidate: the
         same card-band-and-key-tag idea is drawn large on /pass/; if a third
         place wants it, promote to nl-brand.css. */
      '.topbar__mini-pass{display:flex;flex-direction:column;text-decoration:none;color:var(--text);border-bottom:1px solid var(--border);--mini-pass-tag:var(--navy);--mini-pass-tag-text:var(--white);}',
      '.topbar__mini-pass:hover{background:var(--off-white);}',
      '.topbar__mini-pass:focus-visible{outline:none;box-shadow:inset var(--focus-ring);}',
      '.topbar__mini-pass-band{height:8px;background:var(--primary);}',
      '.topbar__mini-pass--none .topbar__mini-pass-band{background:var(--navy-100);}',
      '.topbar__mini-pass-body{display:flex;flex-direction:column;gap:2px;padding:12px 16px 14px;}',
      '.topbar__mini-pass-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
      '.topbar__mini-pass-tag{display:inline-flex;align-items:center;gap:4px;background:var(--mini-pass-tag);color:var(--mini-pass-tag-text);font-size:var(--text-xs);font-weight:800;letter-spacing:0.04em;padding:3px 7px;border-radius:var(--radius-sm);}',
      '.topbar__mini-pass-tag--skeleton{background:var(--navy-900);color:var(--white);}',
      '.topbar__dd-item-icon .icon{display:block;margin:0 auto;}',
      '.topbar__who{width:100%;border-collapse:collapse;font-size:var(--text-sm);}',
      '.topbar__who td{padding:8px 0;border-bottom:1px solid var(--border);}',
      '.topbar__who-level{text-align:right;font-weight:700;color:var(--navy);}',
      '.topbar__who-later{display:block;font-weight:400;font-size:var(--text-xs);color:var(--text-muted);}',
      '.topbar__who-note{font-size:var(--text-sm);color:var(--text-muted);margin:10px 0 0;}',
      '.topbar__who-note:first-child{margin:0 0 10px;}'
    ].join('\n');
    document.head.appendChild(cs);
  }

})();
