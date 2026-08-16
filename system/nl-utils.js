/* =========================================================================
   NL Tools — Shared utilities
   File: /system/nl-utils.js
   Version: v1.33 (16/08/2026)

   Changelog
   v1.33 (16/08/2026)
     - NL.formatDuration(x) — seconds (number, or a '3600s'-style Routes API
       string) → compact human duration, joining the date family: '45s',
       '5 min', '1h', '1h 30min'. PR #808 flagged nls-monitor's
       humanInterval() as promotion-ready when a second caller appeared;
       travel-planner's fmtDur() is that caller. The compound hours+minutes
       convention is travel-planner's — strictly more accurate than
       nls-monitor's rounding ('1h 30min', where 5400s used to round to
       '2 hr'). Absent/zero/junk → '—' like the rest of the family; both
       pre-canon copies treated zero as absent too, and a caller whose
       sentence needs a word instead owns that word.
       Cache-bust ?v=35 -> ?v=36 in lockstep.

   v1.32 (16/08/2026)
     - NL.clubs.crestImgHtml(name, size, opts) — crest <img> as an escaped
       HTML string, for string-built markup where wireCrestImg has no
       element yet. Eight call sites across six tools were hand-rolling the
       same string (escaping, tier choice, and — inconsistently — fallback
       handling); uw-promo and programme had each grown a whole local
       crestImgHtml. Emits data-crest="<name>" so the established
       post-insertion sweep keeps working; carries no inline onerror of its
       own — fallback wiring stays a wiring pass, now also canon:
     - NL.clubs.wireCrestImgs(root, hideOnFail) — wires every
       img[data-crest] under root via wireCrestImg. The identical loop
       existed verbatim in club-kits, club-contacts and club-directory.
       Cache-bust ?v=34 -> ?v=35 in lockstep.

   v1.31 (16/08/2026)
     - NL.formatTime(x) — time only, 'HH:MM' 24-hour, local tz, joining the
       date family (same parseDate input handling: string / Date / epoch).
       PR #808 flagged nls-monitor's kickoffTime() as promotion-ready the
       moment a second caller appeared; travel-planner's ft() and
       newsletter's inline autosave stamp make three. Local time by design,
       matching formatDateTime — the CMS embeds pin Europe/London via
       toLocaleTimeString because they run on fan devices anywhere, and
       cannot load NL.* regardless.
       Cache-bust ?v=33 -> ?v=34 in lockstep.

   v1.30 (16/08/2026)
     - NL.season.fromDate(d) — derive the season start-year from a date,
       flipping on 1 July. The same three-line ternary existed in four
       places (motm widget, leaderboard + feed-cache jobs, claudio) and
       claudio had a fifth copy that flipped on 1 August instead, so for
       a month each July two parts of the same tool disagreed about what
       season it was. The boundary is canon now; the embeds and Node jobs
       cannot load NL.* so they keep hand-mirrored copies with a lockstep
       comment pointing here.
       Cache-bust ?v=32 -> ?v=33 in lockstep.

   v1.29 (15/08/2026)
     - NL.codeGate — the "type a code, get in" screen, which five pages had
       each grown their own copy of (club directory ×2, uw-promo, programme,
       footage/producer). Same markup, same keystroke handling; only the check
       behind it differed, and that difference is the one that matters, so the
       surface splits them. codeGate.open() renders and runs the caller's
       verify(code) and makes NO security claim of its own; codeGate.viaFunction
       (the RTDB-trigger handshake lifted from club-directory/_gate.js) is the
       one that is a real boundary, and is kept separate and named for it so
       nobody adopts the UI and assumes they inherited the boundary with it.
       Pairs with .nl-idbar and the canon .gate card in nl-brand.css v2.37: the bar's colour
       states how you got in.

   v1.28 (10/08/2026)
     - Guest clubs — the non-member sides that enter NL competitions (the
       PL2 representative teams in the NL Cup) become addressable from the
       canon rather than each tool re-reading the file. Added
       NL.clubs.guests() (promise-memoised loader for cup-clubs-meta.json,
       same shape as clubs.load) and NL.clubs.guestByName(). They are
       deliberately NOT folded into clubs.all()/byName(): every tool that
       filters clubs-meta on division would otherwise start offering
       "Fulham PL2" in a league graphic.
     - NL.clubPicker gains `extraClubs` (an array of club-like records
       appended to the roster, exempt from the division filter) and the
       controller method setExtraClubs(list), so a caller can add or drop
       guests as its competition selector changes.
     - NL.clubPicker now honours `crestName` on any club record when
       resolving a crest. Guest records carry the parent club's badge name
       ("Fulham PL2" -> Fulham.png), so no crest is duplicated under a
       suffixed name. Member clubs have no crestName and are unaffected.
       Cache-bust ?v=29 -> ?v=30 in lockstep.

   v1.27 (02/08/2026)
     - NL.icon() reaches the match-event icons. The sprite sheet gains 14
       filled icons (ball, goal, card, sub-on, sub-off, corner, free-kick,
       offside, save, miss, block, lineup, whistle-start, whistle-stop),
       so a tool no longer has to inline its own copy of a football. No
       code change here — the helper already builds a <use> from any name
       — but the documented list was the only place to find out what
       exists, so leaving it stale would have hidden the new half.
       Colour is the caller's: card takes --card-yellow/--card-red,
       sub-on takes --green and sub-off --red.
       Cache-bust ?v=28 -> ?v=29 in lockstep.

   v1.26 (30/07/2026)
     - NL.csvParse(text, {header}) — the symmetric half of NL.csv, which
       has only ever gone rows -> string. Full RFC-4180 state machine, so
       it handles the cases a split(',') cannot: quoted cells containing
       commas, escaped "" quotes, and CRLF or bare-LF inside a quoted
       cell. Strips a UTF-8 BOM (Excel writes one, and it would otherwise
       corrupt the first header name). Returns rows as arrays, or with
       {header:true} an array of objects keyed by a trimmed header row.
       Added for the fixtures cup-fixture importer; any tool taking a
       spreadsheet upload wants this rather than its own split.
       Cache-bust ?v=27 -> ?v=28 in lockstep.

   v1.25 (24/07/2026)
     - NL.sanitiseHtml now normalises block structure at the top level:
       loose inline runs are wrapped in <p>, and double-<br> sequences
       become paragraph breaks. Fixes Enter producing line breaks instead
       of paragraphs inside <br>-structured content (multi-paragraph
       plain-text pastes, and bodies written before the paragraph
       separator was enforced) — content self-heals on next load.
     - NL.richText paste: multi-line plain text is inserted as real <p>
       paragraphs (blank line = paragraph, single newline = <br>) via
       escaped insertHTML; single-line paste stays insertText. Still
       plain-text only — formatting is never carried across.
       Cache-bust nl-utils ?v=25 -> ?v=26.

   v1.24 (24/07/2026)
     - Added NL.sanitiseHtml(html) — whitelist HTML sanitiser for
       user-entered rich text (p/br/b/strong/i/em/ul/li/a[http(s)/mailto];
       unknown tags unwrapped, attributes stripped, script/style dropped,
       contenteditable <div> blocks become <p>). Run it before writing rich
       text to RTDB and again before rendering.
     - Added NL.richText(mount, opts) — minimal rich-text editor pairing
       the .fmt-toolbar widget (Bold/Italic/bullets/link) with a sanitised
       contenteditable .fmt-edit area. Plain-text paste always; Enter =
       paragraph, Shift+Enter = line break; onChange receives sanitised
       HTML. Promoted from the newsletter tool — the second consumer of
       rich-text entry after graphics/article-composer. Paired with
       .fmt-toolbar--compact / .fmt-edit in nl-brand v2.27.
       Cache-bust nl-utils ?v=24 -> ?v=25, nl-brand ?v=24 -> ?v=25.

   v1.23 (14/07/2026)
     - installAuditHook() now no-ops when there is no DEFAULT Firebase app
       (try firebase.app()). Lets pages that run only a NAMED app — the
       /footage/club + /producer isolation — load nl-utils for its pure UI
       helpers (NL.toast/confirm/escHtml) without the global RTDB audit proxy
       throwing "No [DEFAULT] app" on every write. No change for the other
       tools (they have a default app → hook installs as before).
       Cache-bust nl-utils ?v=23 -> ?v=24.


   Shared helper functions used by every tool page. Exposed on window.NL
   namespace. All functions are defensive — they handle missing arguments
   gracefully and never throw in normal use.

   Usage:
     NL.toast('Saved', 'success');
     NL.formatDate('2026-04-17');    // → '17 April 2026'
     NL.ensureAuth().then(function(user) { ... });
     NL.escHtml('<script>');          // → '&lt;script&gt;'

   Changelog
   v1.22 (13/07/2026)
     - Added NL.modal(opts) — accessible modal primitive over the shared
       .modal-backdrop/.modal CSS (focus-trap, Escape, backdrop-click, autofocus,
       focus restore — the bits tools did inconsistently or not at all). On top:
       NL.confirm(msg,{title,confirmText,cancelText,detail,variant}) → Promise<bool>,
       NL.prompt(msg,{default,placeholder,multiline}) → Promise<string|null>,
       NL.alert(msg,{title}) → Promise<void>. Replaces native window.confirm/
       alert/prompt and the hand-wired confirm modals. Paired with nl-brand.css
       .modal--sm / .modal__input. Cache-bust nl-utils ?v=22 -> ?v=23,
       nl-brand ?v=21 -> ?v=22.

   v1.21 (13/07/2026)
     - Added NL.copy(text, {ok, err, silent, onOk, onErr}) — clipboard copy
       with the async-API-then-execCommand fallback, returning Promise<bool>.
       Collapses 13 hand-rolled copy sites; {silent:true} lets callers keep
       their own confirmation UI. Added NL.download(filename, data, mime) —
       the Blob → object-URL → temp <a download> → click → revoke dance,
       copy-pasted ~10 times. Added NL.csv(rows, {bom}) — RFC-4180 escaping,
       replacing three divergent per-cell escapers. Cache-bust ?v=21 -> ?v=22.

   v1.20 (13/07/2026)
     - NL.parseDate now accepts a Date (passthrough) or an epoch-ms number
       (Date.now() / Firebase server timestamps), not only strings.
     - Added NL.formatDateTime(x, {weekday, year, seconds}) — default
       '17 Apr 2026, 09:30', local tz. Collapses ~19 hand-rolled date+time
       formatters. Added NL.timeAgo(x) — 'just now' / 'Nm ago' / 'Nh ago' /
       'Nd ago' (<7d) then an absolute formatDateTime; replaces the relative-
       time ladders in portal / claudio / tasks. Cache-bust ?v=20 -> ?v=21.

   v1.19 (13/07/2026)
     - Added NL.roles.norm(role) — legacy 'club' -> 'club-admin', empty -> 'staff'.
       The single place the planned club->club-admin rename lands. Cache-bust ?v=20.

   v1.18 (13/07/2026)
     - Added NL.clubs.byOpta(id) — club record by Opta teamID, memoised across
       all clubs. Replaces the optaID→club maps tools hand-built (team-of-the-
       week, attendance). Cache-bust ?v=18 → ?v=19.

   v1.17 (12/07/2026)
     - Added NL.endpoints — one home for shared backend URLs (public locations
       only, never secrets). NL.endpoints.gas is the consolidated Apps Script
       deployment, previously pasted into 7 files under 4 names (NL_GAS_URL /
       GAS_URL / API_URL / PP_GAS_URL). Rotate here → every tool follows; a
       lint rule flags any new inline script.google.com URL. Cache-bust ?v=18.

   v1.16 (12/07/2026)
     - NL.clubs.crestUrl gained a size arg: 'thumb' (96px) and 'medium'
       (256px) resolve to assets/crests/thumbs|medium/; no-arg stays full-res
       (byte-identical, backwards compatible). Added NL.clubs.wireCrestImg for
       the tier→full→rose onerror chain. NL.clubPicker renders option/selected
       crests as thumbs. Tiers auto-generated (scripts/build-crest-thumbs.py).
       Cache-busted ?v=15 → ?v=16 (thumbs) → ?v=17 (medium).

   v1.15 (12/07/2026)
     - NL.clubPicker: ROOT-CAUSE FIX — `freetext` was never copied from
       options into the internal opt object, so opt.freetext was always
       undefined. Result: the "use as entered" row never rendered and blur
       always hit the wipe branch, i.e. freetext never worked at all (the
       crest + blur-commit changes in v1.12–v1.14 were dead code behind the
       unset flag). Now opt.freetext = options.freetext, so freetext:'commit'
       actually engages: the commit row shows, Enter/click/blur commit the
       typed value, and the crest resolves via crests/<name>.png.
       Cache-busted ?v=14 → ?v=15.

   v1.14 (12/07/2026)
     - NL.clubPicker: blur auto-commit now fires SYNCHRONOUSLY (was a
       160ms setTimeout). The deferred version lost a race against any
       side-effect of the click that caused the blur (e.g. a caller that
       rebuilds its picker on change), so the typed value appeared to
       "wipe" instead of committing. Firing during blur lands the commit
       first. Guarded with input.isConnected. Cache-busted ?v=13 → ?v=14.

   v1.13 (12/07/2026)
     - NL.clubPicker (search mode): blur now auto-commits a typed-but-
       uncommitted value, so a typed club "takes" without an explicit
       Enter/click. An exact roster name commits that club; otherwise, if
       freetext is enabled, the typed value commits as freetext (crest
       resolved by crests/<name>.png); with freetext off, dangling text
       reverts to the last selection. Fixes the "I typed a club but the
       payload didn't fire" trap (e.g. an EFL club in transfer-centre).
       Cache-busted ?v=12 → ?v=13 (nl-brand.css unchanged at ?v=21).

   v1.12 (12/07/2026) — NL.clubPicker refinements:
     - Browsing shows the WHOLE eligible roster: an empty search box no
       longer caps at `limit` (12) — `limit` now only bounds typed searches
       — and search mode opens on focus/click when empty, so a plain click
       reveals the full list to scroll rather than needing a keystroke first.
     - Freetext commits resolve their crest by the same crests/<name>.png
       rule (was hardcoded to the rose), so an off-roster club (e.g. an EFL
       side entered in transfer-centre) shows its repo crest when present.
     - `clearable` now defaults ON in search mode (opt-out via clearable:false);
       select mode stays opt-in.
     - `placeholder` derives from mode when not supplied ("Search or select a
       club…" / "Select a club").
     Cache-busted ?v=11 → ?v=12 (nl-brand.css unchanged at ?v=21).

   v1.11 (12/07/2026)
     - Added NL.clubs — session-cached clubs-meta accessor (load/meta/all/
       forSeason/byName/crestUrl). Promise-memoised: one fetch per page
       session, replacing ~30 independent clubs-meta fetches across tools.
     - Added NL.clubPicker(mount, options) — the shared, accessible club
       picker. Renders the canonical .club-picker shell and wires
       search/select modes, keyboard (type-ahead + arrow keys, Enter/Esc/
       Home/End), combobox/listbox ARIA, freetext commit, season/division
       filtering (season-specific rosters via NL.season), and crest
       fallback ONCE, so every migrated caller inherits it. Additive —
       wired to no tool yet. Cache-busted ?v=10 → ?v=11 in lockstep with
       nl-brand.css ?v=20 → ?v=21 (new .club-picker rules) across the
       template + every tool head.

   v1.7 (09/06/2026)
     - Added NL.season — shared multi-season helper for the new clubs-meta
       v1.9 model. clubs-meta now carries a top-level `seasons` registry
       ({ current, list:{<key>:{label}} }) and each club a `seasons` map
       ({ <key>: <division that season> }). NL.season.current(meta),
       .label(meta,key), .keys(meta) and .clubsFor(meta,key) read off the
       parsed clubs-meta object a tool has already fetched (stateless).
       clubsFor returns that season's clubs with `division` resolved to the
       season's division (not the current-season top-level field).
       Cache-busted ?v=10.

   v1.6 (18/05/2026)
     - Palette tightening (brand v2.20). NL.projColours updated to
       mirror the new --proj-* aliases: proj-1/2/3/4/5/6 now resolve
       to navy/primary/green/amber/purple/blue from the semantic
       palette (slight hue shifts from the old per-shade hexes).
       proj-7/8 unchanged. Cache-busted ?v=9.

   v1.5 (18/05/2026)
     - Brand-compliance sweep: three identity-data exports promoted from
       tools where they used to live as local arrays/maps.
       * NL.mapStyle.drive   — Google Maps style array, was DRIVE_MAP_STYLE
                               in travel-planner.
       * NL.positionBands    — NL competition position-band colours
                               (champ / sf / qf / releg + po and r
                               fg/bg). Was POS_*_COLOR constants in
                               graphics/league-tables. Mirrors --pos-*
                               CSS tokens for canvas/image-generation
                               callers that need literal hex strings.
       * NL.projColours      — 8-colour project-identity array,
                               mirrors --proj-1 … --proj-8 CSS tokens.
                               Was PROJ_COLOURS in tasks. Meeting-notes
                               keeps a different 6-stop local palette
                               (darker / more saturated) — its DB has
                               existing project colours from that palette
                               so promotion would require a migration.
     Cache-busted via ?v=8 across every tool head in lockstep.

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
       /assets/icons/sprites.svg. Usage: NL.icon('add') or
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

  /* ── Shared backend endpoints ────────────────────────────────────────────
     One place to rotate a URL instead of hunting down pasted copies. PUBLIC
     service locations + identifiers only — NEVER credentials or secrets. */
  window.NL.endpoints = {
    /* Consolidated Google Apps Script deployment: invite + notification
       emails (sign-in, portal), vacancy submissions (vacancies + submit),
       the Claudio AI proxy, meeting-minutes generation, and programme-pack
       Drive operations. Rotate here → every tool follows. */
    gas: 'https://script.google.com/macros/s/AKfycbyHutd1esz1kykMR5aLXBkgXY2LPC-CzhUWOLBAFjhN-6XCPlxocQ1N9BAoCpE6cdof/exec'
  };

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
    if (!str) return null;                    // null / undefined / '' / 0 / NaN

    /* Already a Date — pass through (reject Invalid Date). */
    if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
    /* Epoch milliseconds (Date.now() / Firebase server timestamps). A 0/NaN
       epoch is caught by the falsy guard above — treated as "no timestamp". */
    if (typeof str === 'number') {
      var dn = new Date(str);
      return isNaN(dn.getTime()) ? null : dn;
    }

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

  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Date + time, local tz. Default '17 Apr 2026, 09:30'. Options:
       weekday:true  → 'Sat 17 Apr 2026, 09:30'
       year:false    → '17 Apr, 09:30'
       seconds:true  → '17 Apr 2026, 09:30:05'
     Accepts anything parseDate accepts (string / Date / epoch number). */
  window.NL.formatDateTime = function(x, opts) {
    var d = window.NL.parseDate(x);
    if (!d) return '—';
    opts = opts || {};
    var out = '';
    if (opts.weekday) out += WEEKDAYS[d.getDay()] + ' ';
    out += d.getDate() + ' ' + MONTHS[d.getMonth()].substring(0, 3);
    if (opts.year !== false) out += ' ' + d.getFullYear();
    out += ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (opts.seconds) out += ':' + pad2(d.getSeconds());
    return out;
  };

  /* Time only, local tz, 24-hour: '09:30'. Accepts anything parseDate
     accepts (string / Date / epoch number); unparseable → '—'. Same
     convention as formatDateTime's time part — local time, because every
     gated tool is staff-facing UK usage. The CMS embeds deliberately use
     Europe/London-pinned toLocaleTimeString instead (they run on fan
     devices anywhere) and cannot load NL.* anyway. */
  window.NL.formatTime = function(x) {
    var d = window.NL.parseDate(x);
    if (!d) return '—';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  };

  /* Relative past time: 'just now', '5m ago', '3h ago', '2d ago' (<7d),
     else an absolute formatDateTime. Accepts string / Date / epoch number. */
  window.NL.timeAgo = function(x) {
    var d = window.NL.parseDate(x);
    if (!d) return '—';
    var secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 0) secs = 0;                     // clock skew / future → 'just now'
    if (secs < 60) return 'just now';
    var mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return window.NL.formatDateTime(d);
  };

  /* Elapsed duration → compact human string: 45 → '45s', 300 → '5 min',
     3600 → '1h', 5400 → '1h 30min'. Accepts a number of seconds or a
     '3600s'-style duration string (the Routes API shape). Minutes floor —
     above the minute, leftover seconds are dropped, never rounded up.
     Absent, zero, negative or unparseable → '—', the date family's
     fallback; a caller whose sentence needs a word instead ('every unknown
     interval') supplies that word itself. */
  window.NL.formatDuration = function(x) {
    var secs = x;
    if (typeof secs === 'string') {
      var m = secs.match(/^\s*(\d+(?:\.\d+)?)\s*s?\s*$/);
      secs = m ? parseFloat(m[1]) : NaN;
    }
    if (typeof secs !== 'number' || !isFinite(secs)) return '—';
    secs = Math.round(secs);
    if (secs <= 0) return '—';
    if (secs < 60) return secs + 's';
    var h = Math.floor(secs / 3600);
    var mins = Math.floor((secs % 3600) / 60);
    if (!h) return mins + ' min';
    return mins ? h + 'h ' + mins + 'min' : h + 'h';
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

  /* ── Clipboard + file download ───────────────────────────────────────── */
  /* Copy text to the clipboard. Tries the async Clipboard API, falls back to
     a hidden-textarea execCommand for older/insecure contexts. Always returns
     a Promise<boolean> (true = copied). Confirmation options:
       (default)      → NL.toast('Copied', 'success') on ok, error toast on fail
       {ok, err}      → custom toast messages (still via NL.toast)
       {silent:true}  → no toast — caller owns the UI (button flash, setStatus…)
       {onOk, onErr}  → callbacks fired in addition to / instead of the toast */
  function execCopyFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }
  window.NL.copy = function(text, opts) {
    opts = opts || {};
    text = text == null ? '' : String(text);
    function done(ok) {
      if (!opts.silent) {
        if (ok) window.NL.toast(opts.ok || 'Copied', 'success');
        else    window.NL.toast(opts.err || 'Copy failed', 'error');
      }
      if (ok && typeof opts.onOk === 'function') opts.onOk();
      if (!ok && typeof opts.onErr === 'function') opts.onErr();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return done(true); },
        function () { return done(execCopyFallback(text)); }
      );
    }
    return Promise.resolve(done(execCopyFallback(text)));
  };

  /* Trigger a browser download of `data` as `filename`. `data` may be a Blob
     or a string (wrapped in a Blob with `mime`, default UTF-8 text). Handles
     the object-URL lifecycle (create → temp <a download> → click → revoke). */
  window.NL.download = function(filename, data, mime) {
    var blob = (typeof Blob !== 'undefined' && data instanceof Blob)
      ? data
      : new Blob([data == null ? '' : data], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  };

  /* Build a CSV string from an array of rows (each an array of cells). Escapes
     per RFC 4180: a cell containing a comma, quote or newline is wrapped in
     double-quotes with internal quotes doubled. {bom:true} prefixes a UTF-8
     BOM so Excel reads accented text correctly. */
  window.NL.csv = function(rows, opts) {
    opts = opts || {};
    function cell(v) {
      v = v == null ? '' : String(v);
      return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var body = (rows || []).map(function (r) {
      return (r || []).map(cell).join(',');
    }).join('\r\n');
    return (opts.bom ? '\ufeff' : '') + body;
  };

  /* Parse a CSV string into rows \u2014 the reverse of NL.csv. Full RFC-4180,
     because the cases a split(',') gets wrong are the ones real
     spreadsheets produce: a quoted cell containing a comma, "" as an
     escaped quote, and CRLF or bare LF *inside* a quoted cell.

     Leading UTF-8 BOM is stripped (Excel writes one, and it would
     otherwise end up glued to the first header name). A trailing newline
     produces no phantom row. Rows are NOT padded to equal length \u2014
     callers that care should check.

       NL.csvParse('a,b\r\n1,"x,y"')            \u2192 [['a','b'], ['1','x,y']]
       NL.csvParse(txt, {header:true})           \u2192 [{a:'1', b:'x,y'}]

     With {header:true} the first row becomes keys (trimmed); duplicate
     header names keep the last column, and a row longer than the header
     drops the surplus. */
  window.NL.csvParse = function(text, opts) {
    opts = opts || {};
    var src = String(text == null ? '' : text);
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

    var rows = [], row = [], cell = '', inQuotes = false, i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = ''; i++; continue;
      }
      cell += ch; i++;
    }
    /* Flush the final cell unless the input ended on a clean row break. */
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

    if (!opts.header) return rows;
    if (!rows.length) return [];
    var keys = rows[0].map(function (k) { return String(k || '').trim(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      for (var k = 0; k < keys.length; k++) o[keys[k]] = r[k] != null ? r[k] : '';
      return o;
    });
  };

  /* ── Modal / confirm / prompt / alert ────────────────────────────────── */
  /* Accessible modal primitive driving the shared .modal-backdrop/.modal CSS.
     Bakes in — once — the bits every hand-wired modal did inconsistently or
     not at all: focus-trap, Escape-to-close, backdrop-click-to-close, initial
     autofocus, and focus restore to the trigger on close.

     NL.modal(opts) → controller { el, body, backdrop, close(result) }
       opts.title        head bar text (omit for a chromeless panel)
       opts.body         string (HTML) or a DOM Node for .modal__body
       opts.buttons      [{ label, className, autofocus, onClick(ctrl) }]
       opts.size         'sm' (440px) — omit for the default 640px
       opts.width        'wide' (740px)
       opts.dismissable  false disables Escape + backdrop-click (default true)
       opts.closeButton  false hides the header X (default shown when titled)
       opts.footerSplit  true → space-between footer (destructive-left layout)
       opts.onClose(result)  fired after teardown

     NL.confirm / NL.prompt / NL.alert are thin Promise wrappers over it. */
  var _modalSeq = 0;
  window.NL.modal = function(opts) {
    opts = opts || {};
    var prevFocus = (typeof document !== 'undefined') ? document.activeElement : null;

    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    var modal = document.createElement('div');
    modal.className = 'modal' +
      (opts.width === 'wide' ? ' modal--wide' : '') +
      (opts.size === 'sm' ? ' modal--sm' : '');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    backdrop.appendChild(modal);

    if (opts.title) {
      var titleId = 'nlmodal-title-' + (++_modalSeq);
      modal.setAttribute('aria-labelledby', titleId);
      var head = document.createElement('div');
      head.className = 'modal__head';
      var h = document.createElement('h3');
      h.id = titleId;
      h.textContent = opts.title;
      head.appendChild(h);
      if (opts.closeButton !== false) {
        var x = document.createElement('button');
        x.className = 'modal__close';
        x.type = 'button';
        x.setAttribute('aria-label', 'Close');
        x.innerHTML = '&times;';
        x.addEventListener('click', function() { ctrl.close(); });
        head.appendChild(x);
      }
      modal.appendChild(head);
    }

    var body = document.createElement('div');
    body.className = 'modal__body';
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    modal.appendChild(body);

    var footer = null;
    if (opts.buttons && opts.buttons.length) {
      footer = document.createElement('div');
      footer.className = 'modal__footer' + (opts.footerSplit ? ' modal__footer--split' : '');
      opts.buttons.forEach(function(b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ' + (b.className || 'btn--ghost');
        btn.textContent = b.label;
        if (b.autofocus) btn.setAttribute('data-nl-autofocus', '1');
        btn.addEventListener('click', function() { if (b.onClick) b.onClick(ctrl); });
        footer.appendChild(btn);
      });
      modal.appendChild(footer);
    }

    function focusables() {
      return modal.querySelectorAll(
        'a[href],button:not([disabled]),textarea:not([disabled]),' +
        'input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
      );
    }
    function onKeydown(e) {
      if (e.key === 'Escape' && opts.dismissable !== false) { e.preventDefault(); ctrl.close(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function onBackdrop(e) {
      if (e.target === backdrop && opts.dismissable !== false) ctrl.close();
    }
    backdrop.addEventListener('mousedown', onBackdrop);
    document.addEventListener('keydown', onKeydown, true);

    var closed = false;
    var ctrl = {
      el: modal, backdrop: backdrop, body: body,
      close: function(result) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKeydown, true);
        backdrop.classList.remove('open');
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
        if (opts.onClose) opts.onClose(result);
      }
    };

    document.body.appendChild(backdrop);
    backdrop.classList.add('open');

    /* Autofocus: explicit [autofocus] / data-nl-autofocus, else first field,
       else first footer button. */
    var af = modal.querySelector('[autofocus],[data-nl-autofocus]') ||
             body.querySelector('input,textarea,select') ||
             (footer && footer.querySelector('button'));
    if (af && af.focus) { try { af.focus(); } catch (e) {} }

    return ctrl;
  };

  /* NL.confirm(message, opts) → Promise<boolean>. Cancel/Escape/backdrop/X
     resolve false; the confirm button resolves true.
       opts.title, opts.confirmText, opts.cancelText, opts.detail (secondary
       .confirm-job line), opts.variant 'danger'|'restore'|'primary' (button
       colour), opts.html (treat message as trusted HTML). Newlines in a plain
       message render as line breaks. Danger confirms autofocus Cancel. */
  window.NL.confirm = function(message, opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
      var settled = false;
      function settle(v) { if (!settled) { settled = true; resolve(v); } }
      var variant = opts.variant || 'primary';
      var okClass = variant === 'danger' ? 'btn--danger'
                  : variant === 'restore' ? 'btn--restore' : 'btn--primary';
      var msg = opts.html ? message : window.NL.escHtml(message).replace(/\n/g, '<br>');
      var html = '<p class="confirm-text">' + msg + '</p>';
      if (opts.detail) html += '<p class="confirm-job">' + window.NL.escHtml(opts.detail) + '</p>';
      window.NL.modal({
        title: opts.title || 'Confirm',
        size: 'sm',
        body: html,
        onClose: function() { settle(false); },
        buttons: [
          { label: opts.cancelText || 'Cancel', className: 'btn--ghost',
            autofocus: variant === 'danger',
            onClick: function(c) { c.close(); } },
          { label: opts.confirmText || 'Confirm', className: okClass,
            autofocus: variant !== 'danger',
            onClick: function(c) { settle(true); c.close(); } }
        ]
      });
    });
  };

  /* NL.prompt(message, opts) → Promise<string|null>. OK resolves the input
     value; Cancel/Escape/backdrop resolve null. opts.default, opts.placeholder,
     opts.multiline, opts.title, opts.confirmText, opts.cancelText. */
  window.NL.prompt = function(message, opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
      var settled = false;
      function settle(v) { if (!settled) { settled = true; resolve(v); } }
      var wrap = document.createElement('div');
      if (message) {
        var p = document.createElement('p');
        p.className = 'confirm-text';
        p.textContent = message;
        wrap.appendChild(p);
      }
      var input = document.createElement(opts.multiline ? 'textarea' : 'input');
      if (!opts.multiline) input.type = 'text';
      input.className = 'modal__input';
      input.value = opts.default != null ? String(opts.default) : '';
      if (opts.placeholder) input.placeholder = opts.placeholder;
      wrap.appendChild(input);
      var ctrl = window.NL.modal({
        title: opts.title || 'Enter a value',
        size: 'sm',
        body: wrap,
        onClose: function() { settle(null); },
        buttons: [
          { label: opts.cancelText || 'Cancel', className: 'btn--ghost',
            onClick: function(c) { c.close(); } },
          { label: opts.confirmText || 'OK', className: 'btn--primary',
            onClick: function(c) { settle(input.value); c.close(); } }
        ]
      });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !opts.multiline) { e.preventDefault(); settle(input.value); ctrl.close(); }
      });
      if (input.focus) { try { input.focus(); } catch (e) {} }
    });
  };

  /* NL.alert(message, opts) → Promise<void>. A single OK button; Escape/
     backdrop/OK all resolve. opts.title, opts.confirmText, opts.html. */
  window.NL.alert = function(message, opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
      var settled = false;
      function settle() { if (!settled) { settled = true; resolve(); } }
      var msg = opts.html ? message : window.NL.escHtml(message).replace(/\n/g, '<br>');
      window.NL.modal({
        title: opts.title || 'Notice',
        size: 'sm',
        body: '<p class="confirm-text">' + msg + '</p>',
        onClose: settle,
        buttons: [
          { label: opts.confirmText || 'OK', className: 'btn--primary',
            autofocus: true, onClick: function(c) { c.close(); } }
        ]
      });
    });
  };

  /* ── Rich text ───────────────────────────────────────────────────────── */
  /* NL.sanitiseHtml(html) → clean HTML string. Whitelist: p, br, b, strong,
     i, em, ul, li, a[href http(s)/mailto]. Unknown tags are unwrapped
     (children kept), all other attributes stripped, script/style dropped
     entirely, contenteditable <div> blocks become <p>. Use before writing
     any user-entered rich text to RTDB and again before rendering it. */
  window.NL.sanitiseHtml = function(html) {
    var ALLOWED = { P:'p', BR:'br', B:'b', STRONG:'strong', I:'i', EM:'em', UL:'ul', LI:'li', A:'a' };
    var src = document.createElement('div');
    src.innerHTML = html || '';
    var out = document.createElement('div');
    (function walk(from, to) {
      var node = from.firstChild;
      while (node) {
        if (node.nodeType === 3) {
          to.appendChild(document.createTextNode(node.nodeValue));
        } else if (node.nodeType === 1) {
          var tag = node.tagName;
          if (tag === 'DIV') tag = 'P';
          if (tag === 'SCRIPT' || tag === 'STYLE') { node = node.nextSibling; continue; }
          if (ALLOWED[tag]) {
            var clean = document.createElement(ALLOWED[tag]);
            if (tag === 'A') {
              var href = node.getAttribute('href') || '';
              if (/^(https?:|mailto:)/i.test(href)) clean.setAttribute('href', href);
            }
            to.appendChild(clean);
            walk(node, clean);
          } else {
            walk(node, to);
          }
        }
        node = node.nextSibling;
      }
    })(src, out);

    /* Normalise top-level structure: wrap loose inline runs in <p>, treat
       double-<br> as a paragraph break (single <br> stays a line break).
       Without this, <br>-structured content (multi-paragraph plain-text
       pastes, legacy bodies) keeps the browser inserting line breaks on
       Enter instead of paragraphs. */
    var norm = document.createElement('div');
    var para = null;
    function flushPara() {
      if (para && para.childNodes.length) norm.appendChild(para);
      para = null;
    }
    var nodes = Array.prototype.slice.call(out.childNodes);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 1 && (n.tagName === 'P' || n.tagName === 'UL')) {
        flushPara();
        norm.appendChild(n);
        continue;
      }
      if (n.nodeType === 1 && n.tagName === 'BR') {
        var next = nodes[i + 1];
        if (next && next.nodeType === 1 && next.tagName === 'BR') { flushPara(); i++; continue; }
        if (!para) continue;                 /* leading <br> — drop */
        para.appendChild(n);
        continue;
      }
      if (n.nodeType === 3 && !(n.nodeValue || '').trim() && !para) continue;
      if (!para) para = document.createElement('p');
      para.appendChild(n);
    }
    flushPara();
    return norm.innerHTML;
  };

  /* NL.richText(mount, opts) → controller. Minimal rich-text editor: the
     .fmt-toolbar widget (Bold / Italic / bulleted list / link) above a
     sanitised contenteditable .fmt-edit area. Paste is forced to plain
     text; Enter makes a paragraph, Shift+Enter a line break; every change
     passes through NL.sanitiseHtml before it reaches the caller.
       opts.value               initial HTML (sanitised on the way in)
       opts.placeholder         ghost text shown while empty
       opts.compact             true → .fmt-toolbar--compact (inline cards)
       opts.onChange(cleanHtml) fires on every edit with sanitised output
     Returns { editor, toolbar, getValue, setValue, focus }. */
  window.NL.richText = function(mount, opts) {
    opts = opts || {};
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}

    var bar = document.createElement('div');
    bar.className = 'fmt-toolbar' + (opts.compact ? ' fmt-toolbar--compact' : '');
    bar.setAttribute('aria-label', 'Formatting toolbar');
    var edit = document.createElement('div');
    edit.className = 'fmt-edit';
    edit.contentEditable = 'true';
    if (opts.placeholder) edit.setAttribute('data-placeholder', opts.placeholder);
    edit.innerHTML = window.NL.sanitiseHtml(opts.value || '');

    function currentValue() {
      var clean = window.NL.sanitiseHtml(edit.innerHTML);
      var probe = document.createElement('div');
      probe.innerHTML = clean;
      return (probe.textContent || '').trim() ? clean : '';
    }
    function changed() { if (opts.onChange) opts.onChange(currentValue()); }

    function tbBtn(labelHtml, title, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fmt-icon';
      b.title = title;
      b.innerHTML = labelHtml;
      /* mousedown + preventDefault keeps the text selection alive */
      b.addEventListener('mousedown', function(e) { e.preventDefault(); });
      b.addEventListener('click', function() { fn(); edit.focus(); changed(); });
      return b;
    }
    bar.appendChild(tbBtn('<strong>B</strong>', 'Bold', function() { document.execCommand('bold'); }));
    bar.appendChild(tbBtn('<em>I</em>', 'Italic', function() { document.execCommand('italic'); }));
    bar.appendChild(tbBtn('• List', 'Bulleted list', function() { document.execCommand('insertUnorderedList'); }));
    bar.appendChild(tbBtn('Link', 'Insert link', function() {
      var sel = window.getSelection();
      var range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      window.NL.prompt('Link address', { title: 'Insert link', placeholder: 'https://…' })
        .then(function(url) {
          if (!url) return;
          if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
          if (range) {
            var s = window.getSelection();
            s.removeAllRanges();
            s.addRange(range);
          }
          edit.focus();
          document.execCommand('createLink', false, url);
          changed();
        });
    }));

    edit.addEventListener('input', changed);
    edit.addEventListener('paste', function(e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
      if (text.indexOf('\n') === -1) {
        /* Single line — plain insertText keeps the caret's paragraph intact */
        document.execCommand('insertText', false, text);
      } else {
        /* Multi-line — build REAL paragraphs (blank line = paragraph break,
           single newline = line break) from escaped text. insertText would
           emit <br>s, which then makes Enter continue as line breaks. */
        var html = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map(function(p) {
          return '<p>' + window.NL.escHtml(p).replace(/\n/g, '<br>') + '</p>';
        }).join('');
        document.execCommand('insertHTML', false, html);
      }
      changed();
    });

    if (mount) { mount.appendChild(bar); mount.appendChild(edit); }
    return {
      editor: edit,
      toolbar: bar,
      getValue: currentValue,
      setValue: function(html) { edit.innerHTML = window.NL.sanitiseHtml(html || ''); },
      focus: function() { edit.focus(); }
    };
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
    var now = Date.now();
    var entry = {
      action: String(action || ''),
      detail: _auditDetailString(detail),
      uid: window.NL.session.uid,
      name: window.NL.session.name || '',
      email: window.NL.session.email || '',
      ts: now,
      at: new Date(now).toISOString()
    };
    var key = String(now) + '_' + Math.random().toString(36).slice(2, 8);
    var updates = {};
    updates['admin/audit/' + key] = entry;
    updates['admin/audit-by-user/' + window.NL.session.uid + '/' + key] = entry;
    /* Wait for Firebase Auth to be restored before writing — RTDB rules check
       the live auth token, not NL.session. Tools that don't otherwise touch
       RTDB (graphics, etc.) may have a populated session but no resolved
       firebase.auth().currentUser yet, which would fail PERMISSION_DENIED. */
    var doWrite = function() {
      return firebase.database().ref().update(updates).catch(function(e) {
        console.warn('NL.writeAudit failed:', e && e.code, e && e.message);
      });
    };
    if (window.NL.ensureAuth) {
      window.NL.ensureAuth().then(doWrite).catch(function(e) {
        console.warn('NL.writeAudit (auth) failed:', e && e.message);
      });
    } else {
      doWrite();
    }
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
    // Needs the DEFAULT Firebase app: the audit write runs through NL.ensureAuth →
    // firebase.auth() (default app). Pages that init only a NAMED app (e.g. the
    // /footage/club + /producer isolation) have no default app — skip, else the
    // global Reference proxy would throw "No [DEFAULT] app" on every RTDB write.
    try { firebase.app(); } catch (e) { return; }
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

     UI icons (stroked): add, close, back, forward, up, down, download,
       upload, tick, refresh, settings, edit, search, eye, filter,
       calendar, user, warning, info, link, star, star-filled, send, delete

     Match events (filled): ball, goal, card, sub-on, sub-off, corner,
       free-kick, offside, save, miss, block, lineup, whistle-start,
       whistle-stop

     Both kinds take their colour from the parent's `color`. The match-event
     set carries no semantic colour of its own — a card is drawn once and
     coloured var(--card-yellow) or var(--card-red) by the caller, sub-on
     var(--green) and sub-off var(--red).                              */
  window.NL.icon = function(name, size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var cls = 'icon';
    if (size && size !== 'md') cls += ' icon--' + size;
    else if (!size) cls += ' icon--md';
    else cls += ' icon--md';
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/assets/icons/sprites.svg#icon-' + name);
    svg.appendChild(use);
    return svg;
  };

  /* ── Identity-data shared with brand CSS ────────────────────────────────
     These mirror the matching --proj-*, --pos-*, --road-sign-* tokens in
     nl-brand.css for JS callers that need literal hex strings (canvas
     exports, Google Maps style arrays, etc.). When the brand tokens
     change, change these too — see the commented hex next to each var
     reference to confirm. Promoted in v1.5 from per-tool definitions. */

  /* Project identity wheel — mirrors --proj-1 … --proj-8 in brand.
     v1.6: 1-6 are aliases of the semantic palette; values must match
     the brand var() resolution so saved DB project colours stay in
     lockstep with what the CSS would render. */
  window.NL.projColours = [
    '#223b7c', /* --proj-1 -> --navy    */
    '#9e0000', /* --proj-2 -> --primary */
    '#1a7030', /* --proj-3 -> --green   */
    '#c96f15', /* --proj-4 -> --amber   */
    '#6a1b9a', /* --proj-5 -> --purple  */
    '#1565c0', /* --proj-6 -> --blue    */
    '#1a2f63', /* --proj-7 deep navy slate (no semantic equivalent) */
    '#374151'  /* --proj-8 cool slate    (no semantic equivalent) */
  ];

  /* NL competition position-band palette — mirrors --pos-* in brand.
     Used by canvas/image-generation in graphics tools. */
  window.NL.positionBands = {
    champ:   '#7F99DC', /* --pos-champ        */
    sf:      '#3760C8', /* --pos-sf           */
    qf:      '#2D4FA4', /* --pos-qf           */
    releg:   '#192C5C', /* --pos-releg        */
    cFg:     '#000000', /* --pos-c-fg         */
    poSfBg:  '#9aa3ad', /* --pos-po-sf-bg     */
    poFg:    '#000000', /* --pos-po-fg        */
    rBg:     '#000000', /* --pos-r-bg         */
    rFg:     '#ffffff'  /* --pos-r-fg         */
  };

  /* Google Maps style arrays — pass directly to new google.maps.Map({...styles: NL.mapStyle.drive}).
     Future variants (.satellite, .transit) belong on this object too. */
  window.NL.mapStyle = {
    drive: [
      {featureType:"landscape",elementType:"geometry.fill",stylers:[{color:"#f0f1f5"}]},
      {featureType:"landscape.man_made",elementType:"geometry.fill",stylers:[{color:"#eceef3"}]},
      {featureType:"poi",elementType:"all",stylers:[{visibility:"off"}]},
      {featureType:"poi.park",elementType:"geometry.fill",stylers:[{visibility:"on"},{color:"#e4e7ee"}]},
      {featureType:"poi.park",elementType:"labels",stylers:[{visibility:"off"}]},
      {featureType:"road.highway",elementType:"geometry.fill",stylers:[{color:"#4a7abf"}]},
      {featureType:"road.highway",elementType:"geometry.stroke",stylers:[{color:"#3a6299"},{weight:1}]},
      {featureType:"road.highway",elementType:"labels",stylers:[{visibility:"on"}]},
      {featureType:"road.highway",elementType:"labels.text.fill",stylers:[{color:"#1a2a44"}]},
      {featureType:"road.highway",elementType:"labels.text.stroke",stylers:[{color:"#ffffff"},{weight:3}]},
      {featureType:"road.arterial",elementType:"geometry.fill",stylers:[{color:"#d0d6e0"}]},
      {featureType:"road.arterial",elementType:"labels",stylers:[{visibility:"on"}]},
      {featureType:"road.arterial",elementType:"labels.text.fill",stylers:[{color:"#5a6a82"}]},
      {featureType:"road.local",elementType:"geometry.fill",stylers:[{color:"#e8eaf0"}]},
      {featureType:"road.local",elementType:"labels",stylers:[{visibility:"off"}]},
      {featureType:"transit",elementType:"all",stylers:[{visibility:"off"}]},
      {featureType:"water",elementType:"geometry.fill",stylers:[{color:"#cdd5e2"}]},
      {featureType:"water",elementType:"labels.text.fill",stylers:[{color:"#9aa3b8"}]},
      {featureType:"administrative",elementType:"labels.text.fill",stylers:[{color:"#8a90a0"}]},
      {featureType:"administrative.locality",elementType:"labels.text.fill",stylers:[{color:"#6b7186"}]}
    ]
  };

  /* ── Season helper (clubs-meta v1.9+) ────────────────────────────────────
     Stateless: every method except fromDate takes the parsed clubs-meta
     object a tool has already fetched. clubs-meta carries a top-level `seasons` registry
     { current, list:{<key>:{label}} } and each club a `seasons` map
     { <key>: <division that season> }. The top-level club.division stays =
     the current season's division (null for clubs not in the current
     league), so legacy consumers are unaffected; season-aware tools use
     clubsFor() to get the right roster + per-season division. */
  window.NL.season = {
    /* Season start-year for a date (defaults to now), e.g. 2026 for any
       date from 01/07/2026 to 30/06/2027. The season flips on 1 JULY —
       not August, even though league fixtures kick off in August —
       because a season is named for the calendar year it starts in and
       NLS publishes the new season's fixtures in July. Prefer clubs-meta
       seasons.current (via .current()) when the file is already loaded;
       this is the clock-derived answer for when it isn't. */
    fromDate: function(d) {
      d = d || new Date();
      return (d.getMonth() + 1) >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    },
    /* Current season key, e.g. '2026'. */
    current: function(meta) {
      return (meta && meta.seasons && meta.seasons.current) || null;
    },
    /* All season keys, newest first, e.g. ['2026','2025']. */
    keys: function(meta) {
      var list = (meta && meta.seasons && meta.seasons.list) || {};
      return Object.keys(list).sort().reverse();
    },
    /* Human label for a season key, e.g. '2026' -> '2026-27'. Falls back to
       deriving 'YYYY-YY' from the key if it isn't in the registry. */
    label: function(meta, key) {
      var list = meta && meta.seasons && meta.seasons.list;
      if (list && list[key] && list[key].label) return list[key].label;
      var y = parseInt(key, 10);
      if (isNaN(y)) return String(key);
      var nxt = String((y + 1) % 100);
      return y + '-' + (nxt.length < 2 ? '0' + nxt : nxt);
    },
    /* Clubs that played in `key` (defaults to current), each shallow-cloned
       with `division` resolved to THAT season's division. Sorted by name. */
    clubsFor: function(meta, key) {
      key = key || this.current(meta);
      var clubs = (meta && meta.clubs) || [];
      return clubs
        .filter(function(c) { return c.seasons && c.seasons[key] != null; })
        .map(function(c) {
          var clone = {};
          for (var k in c) { if (c.hasOwnProperty(k)) clone[k] = c[k]; }
          clone.division = c.seasons[key];
          return clone;
        })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });
    }
  };

  /* ===================================================================
     NL.codeGate — the code-entry screen for pages outside auth-guard

     Five pages had grown their own version of "type a code, get in": the
     club directory (twice), uw-promo, programme and footage/producer. The
     markup and the keystroke handling were the same in all of them; only the
     check behind it differed, and that difference is the important one, so
     this splits them.

     WHAT THIS DOES AND DOES NOT PROMISE. The gate renders the screen and
     runs the caller's `verify`. It makes NO security claim of its own — a
     verify that compares the code in the browser is a screen to get past, and
     a verify that hands the code to a server is a boundary. Both look
     identical to the person typing. `NL.codeGate.viaFunction` is the second
     kind, and is the one to reach for; it is kept separate and named for what
     it does so that nobody adopts the UI and assumes they inherited the
     boundary with it.

     It renders the canon .gate card (nl-brand.css, canon since v2.32 — two
     tools were still overriding it with their own copy) and pairs with
     .nl-idbar: white bar, red underline, the page knows you by code and by
     nothing else.

       NL.codeGate.ensure({
         mount:  document.getElementById('gate'),
         title:  'Club Directory',
         verify: NL.codeGate.viaFunction('app-data/ops-club-directory'),
         claim:  'dir'
       }).then(function (session) { ... });
     =================================================================== */
  var CODEGATE_ROSE = '/assets/crests/National%20League%20rose.png';
  /* Long enough to cover a cold start plus Eventarc delivery, short enough
     that a genuinely dead backend says so rather than spinning forever. */
  var CODEGATE_TIMEOUT_MS = 45000;

  function codeGateOpen(opts) {
    opts = opts || {};
    var mount = opts.mount || document.body;
    var len = opts.length || 6;
    var numeric = opts.numeric !== false;
    var sub0 = opts.sub || ('Enter your ' + (numeric ? len + '-digit' : '') + ' code.').replace('  ', ' ');
    var esc = window.NL.escHtml;
    var verify = opts.verify;
    if (typeof verify !== 'function') {
      throw new Error('NL.codeGate: a verify(code) function is required.');
    }

    return new Promise(function (resolve) {
      var logo = opts.lockup
        ? '<img class="gate__lockup" src="' + esc(opts.lockup) + '" alt="' + esc(opts.lockupAlt || '') + '">'
        : '<img class="gate__logo" src="' + esc(opts.logo || CODEGATE_ROSE) + '" alt="National League">';

      var host = document.createElement('div');
      host.innerHTML =
        '<div class="gate"><div class="gate__card">' + logo +
          '<div class="gate__title">' + esc(opts.title || 'Sign in') + '</div>' +
          '<div class="gate__sub" data-sub>' + esc(sub0) + '</div>' +
          '<input class="gate__input" data-in ' +
            (numeric ? 'inputmode="numeric" autocomplete="one-time-code" ' : 'autocapitalize="characters" ') +
            'maxlength="' + len + '" placeholder="' + new Array(len + 1).join('•') + '" ' +
            'aria-label="' + esc(opts.inputLabel || (len + '-character code')) + '">' +
          '<div class="gate__err" data-err role="alert"></div>' +
        '</div></div>';
      var card = host.firstElementChild;
      mount.innerHTML = '';
      mount.appendChild(card);

      var input = card.querySelector('[data-in]');
      var err = card.querySelector('[data-err]');
      var sub = card.querySelector('[data-sub]');
      var busy = false;

      function clean(v) {
        return numeric ? String(v || '').replace(/[^0-9]/g, '').slice(0, len)
                       : String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len);
      }

      function fail(msg) {
        busy = false;
        input.disabled = false;
        sub.textContent = sub0;
        err.textContent = msg;
        input.value = '';
        input.focus();
      }

      function submit() {
        var code = clean(input.value);
        if (busy || code.length !== len) return;
        busy = true;
        err.textContent = '';
        input.disabled = true;
        sub.textContent = 'Checking…';
        Promise.resolve()
          .then(function () { return verify(code); })
          .then(function (session) {
            if (session === false || session == null) {
              fail(opts.rejectMessage || 'Code not recognised.');
              return;
            }
            resolve(session);
          })
          .catch(function (e) { fail((e && e.message) || 'Something went wrong.'); });
      }

      /* The code is the whole credential, so submit on the last character
         rather than asking for a keypress that adds nothing. */
      input.addEventListener('input', function () {
        var v = clean(input.value);
        if (v !== input.value) input.value = v;
        err.textContent = '';
        if (v.length === len) submit();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submit();
      });
      setTimeout(function () { input.focus(); }, 30);
    });
  }

  /* A custom-token session survives a reload — Firebase persists it and
     refreshes the ID token itself — so asking for the code again on every
     load is the page failing to look, not the session expiring.

     Resolves with the session or null. An anonymous user left behind by an
     abandoned attempt carries no claim and counts as nobody, which stops a
     half-finished handshake looking like a valid sign-in. */
  function codeGateResume(claim) {
    if (!claim || typeof firebase === 'undefined') return Promise.resolve(null);
    return new Promise(function (resolve) {
      var off = firebase.auth().onAuthStateChanged(function (user) {
        off();
        if (!user || user.isAnonymous) { resolve(null); return; }
        user.getIdTokenResult()
          .then(function (t) {
            var c = (t && t.claims) || {};
            resolve(c[claim] ? { role: c[claim], name: c[claim + 'Name'] || '' } : null);
          })
          .catch(function () { resolve(null); });
      });
    });
  }

  /* Server-side verification, and the only kind that is a real boundary.
     Returns a verify(code) for NL.codeGate, backed by the RTDB-trigger
     handshake under <root>:

       1. sign in anonymously. Identity Toolkit rather than Cloud Run, so an
          org policy blocking public invokers on callables does not apply.
       2. write { code, at } to authRequests/<uid>.
       3. a trigger validates server-side, deletes the request so a code never
          lingers in the database, and writes authGrants/<uid>.
       4. read the grant, delete both nodes while this uid still owns them,
          then sign in again with the custom token it carried.

     The code is never checked in the browser and the config holding it is not
     readable by any client. Eventarc delivery costs seconds; acceptable when
     a person signs in once and a spinner covers it. */
  function codeGateViaFunction(root, extra) {
    return function (code) {
      var payload = { code: code };
      if (extra) Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
      return codeGateExchange(root, payload);
    };
  }

  function codeGateExchange(root, payload) {
    var auth = firebase.auth(), db = firebase.database();
    return auth.signInAnonymously().then(function (cred) {
      var uid = cred.user.uid;
      var reqRef = db.ref(root + '/authRequests/' + uid);
      var grantRef = db.ref(root + '/authGrants/' + uid);

      return new Promise(function (resolve, reject) {
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true; grantRef.off();
          reject(new Error('The sign-in service did not answer. Please try again.'));
        }, CODEGATE_TIMEOUT_MS);

        grantRef.on('value', function (snap) {
          var g = snap.val();
          if (!g || done) return;
          done = true;
          clearTimeout(timer);
          grantRef.off();
          /* Clear both nodes while this uid still owns them — after the
             custom-token sign-in the uid changes and the rules stop allowing
             it. */
          Promise.all([grantRef.remove()['catch'](function () {}),
                       reqRef.remove()['catch'](function () {})])
            .then(function () {
              if (!g.ok) { reject(new Error(g.error || 'Code not recognised.')); return; }
              resolve(g);
            });
        }, function (e) {
          if (done) return;
          done = true; clearTimeout(timer); reject(e);
        });

        var body = { at: firebase.database.ServerValue.TIMESTAMP };
        Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
        reqRef.set(body)['catch'](function (e) {
          if (done) return;
          done = true; clearTimeout(timer); grantRef.off(); reject(e);
        });
      });
    }).then(function (g) {
      return firebase.auth().signInWithCustomToken(g.customToken).then(function () {
        return { role: g.role, name: g.name };
      });
    });
  }

  window.NL.codeGate = {
    open: codeGateOpen,
    resume: codeGateResume,
    /* Resume if we can, gate if we cannot — what every caller actually wants. */
    ensure: function (opts) {
      opts = opts || {};
      return codeGateResume(opts.claim).then(function (s) {
        return s || codeGateOpen(opts);
      });
    },
    viaFunction: codeGateViaFunction,
    /* The master-key route: uses the caller's existing auth-guard session
       instead of a code, and the trigger checks the role server-side. */
    openAsAdmin: function (root) { return codeGateExchange(root, { admin: true }); },
    signOut: function () { return firebase.auth().signOut(); }
  };

  /* ===================================================================
     NL.roles — canonical role model (v1.10). Three realms:
       league  : superadmin / admin / staff
       club    : club-admin (edit own club) / club-viewer (view only)
       external: third-party (org-named, tools granted individually,
                 hidden everywhere by default, never club-scoped)
     'club' is the LEGACY key for club-admin and stays accepted until the
     Phase-3 rename. Tools branch on these helpers, NOT raw role strings,
     so the rename touches one place. ============================== */
  window.NL.roles = {
    LABELS: {
      superadmin:    'Superadmin',
      admin:         'League Admin',
      staff:         'League Staff',
      'club-admin':  'Club Admin',
      club:          'Club Admin',      /* legacy alias */
      'club-viewer': 'Club Viewer',
      'third-party': 'Third Party'
    },
    realm: function(role) {
      if (role === 'superadmin' || role === 'admin' || role === 'staff') return 'league';
      if (role === 'club' || role === 'club-admin' || role === 'club-viewer') return 'club';
      if (role === 'third-party') return 'external';
      return null;
    },
    label: function(role) { return this.LABELS[role] || role || ''; },
    /* Normalise a role for access lookups: legacy 'club' → 'club-admin',
       empty → 'staff'. The one place the Phase-3 rename lands. */
    norm: function(role) { return role === 'club' ? 'club-admin' : (role || 'staff'); }
  };

  /* A club user of either tier — scope tools to session.club for these. */
  window.NL.isClubUser = function(role) {
    return role === 'club' || role === 'club-admin' || role === 'club-viewer';
  };
  /* May this user edit their OWN club's content? club-admin (legacy
     'club') yes; club-viewer no. League admin/superadmin editing of any
     club stays in each tool's own admin check, not here. */
  window.NL.canClubEdit = function(role) {
    return role === 'club' || role === 'club-admin';
  };

  /* ===================================================================
     NL.clubs — cached clubs-meta accessor (v1.11)
     One fetch per page session, promise-memoised. Replaces ~30
     independent clubs-meta fetches across tools. Reads the same
     assets/data/clubs-meta.json every tool already used.
     =================================================================== */
  var _clubsPromise = null;
  var _clubsMeta    = null;
  var _clubsCb      = null;  /* per-session cache-buster, stamped once */
  var _optaIndex    = null;  /* lazy optaID → club map, built by byOpta */
  var _guestsPromise = null;
  var _guestsMeta    = null;
  var CLUBS_URL     = '/assets/data/clubs-meta.json';
  var GUESTS_URL    = '/assets/data/cup-clubs-meta.json';
  /* Same-origin, and not a style point. raw.githubusercontent does not Vary
     on Origin and sits behind a 5-minute CDN cache, so a crossOrigin request
     for a crest can be served a cached non-CORS response and fail — the image
     is then skipped and a canvas export ships without it. That was diagnosed
     and fixed inside the graphics tools in August 2026 and never brought back
     here, so every other caller kept the bug. Serving from this domain removes
     CORS, canvas tainting and the third-party dependency together. */
  var CREST_BASE    = '/assets/crests/';
  var THUMB_BASE    = CREST_BASE + 'thumbs/';
  var MEDIUM_BASE   = CREST_BASE + 'medium/';
  var CLUB_ROSE     = CREST_BASE + 'National%20League%20rose.png';

  window.NL.clubs = {
    ROSE: CLUB_ROSE,
    /* Absolute crest URL for a club name.
         crestUrl(name)           → full-res original (byte-identical to the
                                     legacy URL, so no-arg callers are unaffected).
         crestUrl(name, 'thumb')  → 96px  (assets/crests/thumbs/…)  ~14KB —
                                     lists, dropdowns, tables, markers.
         crestUrl(name, 'medium') → 256px (assets/crests/medium/…) ~57KB —
                                     on-page hero/detail badges.
       Tiers are auto-generated (scripts/build-crest-thumbs.py + the crest-thumbs
       Action). Pair a thumb/medium <img> with the ...→full→rose onerror chain
       (NL.clubs.wireCrestImg) so a not-yet-built tier file still renders.
       Canvas/social exports + downloads use full-res (no size arg). */
    crestUrl: function(name, size) {
      if (!name) return CLUB_ROSE;
      var base = size === 'thumb' ? THUMB_BASE : size === 'medium' ? MEDIUM_BASE : CREST_BASE;
      return base + encodeURIComponent(name) + '.png';
    },
    /* Wire a crest <img> so a missing thumb degrades thumb → full → rose
       (or hides, if hideOnFail). Safe to call on a full-res <img> too. */
    wireCrestImg: function(img, name, hideOnFail) {
      if (!img) return img;
      var full = this.crestUrl(name), rose = CLUB_ROSE;
      img.onerror = function() {
        if (img.src !== full && name) { img.src = full; return; }
        img.onerror = null;
        if (hideOnFail) img.style.display = 'none'; else img.src = rose;
      };
      return img;
    },
    /* Crest <img> as an HTML STRING, for string-built markup (table rows,
       modal bodies, print sheets) where wireCrestImg has no element yet.
       Same size arg as crestUrl ('thumb' / 'medium' / omit for full-res).
       Name and URL are escHtml-escaped; alt defaults to "" (decorative).
         opts.className → class attribute
         opts.alt       → alt text override
       The string carries NO fallback of its own. It emits data-crest="<name>"
       so the existing post-insertion sweep — NL.clubs.wireCrestImgs(container)
       (or a per-element wireCrestImg call) — attaches the thumb → full → rose
       onerror chain. Insert the markup and sweep in the same tick: image
       fetches resolve asynchronously, so a 404 cannot beat a sweep that runs
       before the current task yields. */
    crestImgHtml: function(name, size, opts) {
      opts = opts || {};
      var esc = window.NL.escHtml;
      return '<img data-crest="' + esc(name || '') + '"' +
        (opts.className ? ' class="' + esc(opts.className) + '"' : '') +
        ' src="' + esc(this.crestUrl(name, size)) + '"' +
        ' alt="' + esc(opts.alt || '') + '">';
    },
    /* Wire every img[data-crest] under `root` (an element or document) via
       wireCrestImg, reading the club name back from the data-crest attribute.
       The companion sweep for crestImgHtml — the identical loop existed
       hand-rolled in club-kits, club-contacts and club-directory. */
    wireCrestImgs: function(root, hideOnFail) {
      if (!root || !root.querySelectorAll) return;
      var self = this;
      Array.prototype.forEach.call(root.querySelectorAll('img[data-crest]'), function(img) {
        self.wireCrestImg(img, img.getAttribute('data-crest'), hideOnFail);
      });
    },
    /* Load + memoise clubs-meta. One network hit per session. */
    load: function() {
      if (_clubsPromise) return _clubsPromise;
      if (!_clubsCb) _clubsCb = Date.now();
      _clubsPromise = fetch(CLUBS_URL + '?cb=' + _clubsCb, { cache: 'no-store' })
        .then(function(r) { if (!r.ok) throw new Error('clubs-meta ' + r.status); return r.json(); })
        .then(function(data) { _clubsMeta = data; _optaIndex = null; return data; })
        .catch(function(err) { _clubsPromise = null; throw err; }); /* soft: allow retry */
      return _clubsPromise;
    },
    /* Synchronous accessor once loaded (null before). */
    meta: function() { return _clubsMeta; },
    /* Every club, name-sorted (base division left as-is). */
    all: function() {
      return this.load().then(function(meta) {
        return (meta.clubs || []).slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
      });
    },
    /* Clubs for a season key (defaults to current), division resolved to
       that season's tier. Wraps NL.season.clubsFor. */
    forSeason: function(key) {
      return this.load().then(function(meta) {
        return window.NL.season.clubsFor(meta, (key && key !== 'current') ? key : null);
      });
    },
    /* ---- guest clubs -------------------------------------------------
       Non-member sides that enter NL competitions (the PL2 representative
       teams in the NL Cup). They live in their own file, and are kept OUT
       of load()/all()/byName() on purpose: those read clubs-meta, where
       `division: null` already means "former NL member" (Rochdale, York).
       Folding guests in would make a side that was never a member
       indistinguishable from one that was — and at least six graphics
       tools filter that file on division.

       Records are club-LIKE, not clubs: { name, short, code, nickname,
       crestName, colors }. There is no division and no optaID. `name`
       carries the competition-correct "… PL2" suffix; `crestName` points
       at the parent club's badge, so no crest is duplicated.

       Which guests entered WHICH season is not a property of the club —
       it lives on the competition record in competitions-meta.json. Read
       that to narrow this list to a given season's entrants. */
    guests: function() {
      if (_guestsPromise) return _guestsPromise;
      if (!_clubsCb) _clubsCb = Date.now();
      _guestsPromise = fetch(GUESTS_URL + '?cb=' + _clubsCb, { cache: 'no-store' })
        .then(function(r) { if (!r.ok) throw new Error('cup-clubs-meta ' + r.status); return r.json(); })
        .then(function(data) {
          _guestsMeta = data;
          return (data.clubs || []).slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
        })
        .catch(function(err) { _guestsPromise = null; throw err; }); /* soft: allow retry */
      return _guestsPromise;
    },
    /* Sync lookup of a guest by exact name (null before guests() resolves). */
    guestByName: function(name) {
      if (!_guestsMeta || !name) return null;
      var lc = String(name).toLowerCase(), list = _guestsMeta.clubs || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name && list[i].name.toLowerCase() === lc) return list[i];
      }
      return null;
    },
    /* Sync lookup by exact name (once loaded). */
    byName: function(name) {
      if (!_clubsMeta || !name) return null;
      var lc = String(name).toLowerCase(), list = _clubsMeta.clubs || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name && list[i].name.toLowerCase() === lc) return list[i];
      }
      return null;
    },
    /* Club record by Opta teamID (e.g. 't3360'), across ALL clubs. Requires
       load() first; memoised. Returns null if not loaded or not found.
       Replaces the optaID→club maps tools used to hand-build. */
    byOpta: function(id) {
      if (!_clubsMeta || !id) return null;
      if (!_optaIndex) {
        _optaIndex = {};
        (_clubsMeta.clubs || []).forEach(function(c) { if (c.optaID) _optaIndex[c.optaID] = c; });
      }
      return _optaIndex[id] || null;
    }
  };

  /* ===================================================================
     NL.clubPicker(mount, options) — shared, accessible club picker (v1.12)
     Renders the canonical .club-picker shell (see nl-brand.css) and wires
     search/select, keyboard (type-ahead + arrows), freetext and crest
     fallback ONCE so every caller inherits it. Returns a controller:
       { setValue, getValue, clear, setDisabled, setSeason, setDivisions,
         setExtraClubs, refresh, destroy }
     Options (all optional except onSelect):
       mode 'search'|'select' · season 'current'|'all'|'<key>' ·
       divisions ['North'] · offRoster 'hide'|'flag'|'allow' ·
       secondary 'division'|'stadium'|fn · crestFallback 'rose'|'hide' ·
       clearable · value · disabled · placeholder · limit ·
       extraClubs [club-like records] · onSelect(sel)
     onSelect payload: { name, club, division, crestUrl, isFreetext,
                         isOffRoster, seasonKey }

     extraClubs appends records that are not on the clubs-meta roster —
     the NL Cup guest sides from NL.clubs.guests() are the intended case.
     They are appended AFTER the division filter, so `divisions` never
     drops them (a guest has no division to match). Swap the list at any
     time with controller.setExtraClubs(list); pass [] to remove them.

     Any record — roster or extra — may carry `crestName` to point at a
     different badge file than its own name ("Fulham PL2" -> Fulham.png).
     =================================================================== */
  var _cpSeq = 0;
  window.NL.clubPicker = function(mount, options) {
    options = options || {};
    var el = (typeof mount === 'string') ? document.querySelector(mount) : mount;
    if (!el) throw new Error('NL.clubPicker: mount not found');

    var _mode = options.mode === 'select' ? 'select' : 'search';
    var opt = {
      mode:          _mode,
      season:        options.season || 'current',
      divisions:     options.divisions || null,
      offRoster:     options.offRoster || 'hide',
      secondary:     options.secondary || 'division',
      crestFallback: options.crestFallback || 'rose',
      /* Freetext: false | 'commit' ('use as entered' row + auto-commit on
         blur for off-roster names). This key was missing, so freetext never
         actually engaged — renderList and the blur commit both read it. */
      freetext:      options.freetext || false,
      /* Clear (×) defaults ON in search mode (typing available); opt-out via
         clearable:false. Select mode stays opt-in. */
      clearable:     options.clearable != null ? !!options.clearable : (_mode === 'search'),
      value:         options.value || null,
      disabled:      !!options.disabled,
      /* Placeholder derives from mode unless the caller overrides. */
      placeholder:   options.placeholder || (_mode === 'select' ? 'Select a club' : 'Search or select a club…'),
      limit:         options.limit || 12,
      /* Off-roster records appended after the division filter. */
      extraClubs:    options.extraClubs || [],
      onSelect:      typeof options.onSelect === 'function' ? options.onSelect : function() {}
    };

    /* Which badge file a record resolves to. Falls back to the record's own
       name, so member clubs (no crestName) behave exactly as before. */
    function crestKeyOf(c) { return (c && (c.crestName || c.name)) || ''; }

    var id = 'nlcp' + (++_cpSeq), listId = id + '-list';
    var clubs = [], rendered = [], activeIdx = -1, selectedName = null, open = false;

    el.classList.add('club-picker');
    if (opt.mode === 'select') el.classList.add('club-picker--select');
    el.innerHTML = '';

    var wrap = document.createElement(opt.mode === 'select' ? 'button' : 'div');
    wrap.className = 'club-picker__wrap';
    if (opt.mode === 'select') { wrap.type = 'button'; wrap.setAttribute('aria-haspopup', 'listbox'); wrap.setAttribute('aria-expanded', 'false'); }

    var crest = document.createElement('img');
    crest.className = 'club-picker__crest'; crest.alt = ''; crest.src = CLUB_ROSE;

    var input = null, valueSpan = null;
    if (opt.mode === 'select') {
      valueSpan = document.createElement('span');
      valueSpan.className = 'club-picker__value club-picker__value--placeholder';
      valueSpan.textContent = opt.placeholder;
      var chev = document.createElement('span'); chev.className = 'club-picker__chevron'; chev.textContent = '▾';
      wrap.appendChild(crest); wrap.appendChild(valueSpan); wrap.appendChild(chev);
    } else {
      input = document.createElement('input');
      input.type = 'text'; input.className = 'club-picker__input';
      input.placeholder = opt.placeholder; input.autocomplete = 'off';
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-expanded', 'false');
      input.setAttribute('aria-controls', listId);
      input.setAttribute('aria-autocomplete', 'list');
      wrap.appendChild(crest); wrap.appendChild(input);
    }

    var clearBtn = null;
    if (opt.clearable) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button'; clearBtn.className = 'club-picker__clear';
      clearBtn.setAttribute('aria-label', 'Clear selection');
      clearBtn.textContent = '×'; clearBtn.style.display = 'none';
      wrap.appendChild(clearBtn);
    }

    var dd = document.createElement('div');
    dd.className = 'club-picker__dropdown'; dd.id = listId; dd.setAttribute('role', 'listbox');

    el.appendChild(wrap); el.appendChild(dd);

    function seasonKey() {
      if (opt.season && opt.season !== 'current' && opt.season !== 'all') return opt.season;
      var m = window.NL.clubs.meta();
      return m ? window.NL.season.current(m) : null;
    }
    function loadRoster() {
      var p = (opt.season === 'all') ? window.NL.clubs.all() : window.NL.clubs.forSeason(opt.season);
      return p.then(function(list) {
        if (opt.divisions && opt.divisions.length) {
          var set = {};
          opt.divisions.forEach(function(d) { set[String(d).toLowerCase()] = true; });
          list = list.filter(function(c) { return set[String(c.division).toLowerCase()]; });
        }
        /* Extras land after the filter — a guest has no division to match. */
        if (opt.extraClubs.length) list = list.concat(opt.extraClubs);
        clubs = list; return list;
      }).catch(function() {
        /* Roster fetch failed: still offer the extras rather than nothing. */
        clubs = opt.extraClubs.slice(); return clubs;
      });
    }
    function secondaryText(c) {
      if (typeof opt.secondary === 'function') return opt.secondary(c) || '';
      if (opt.secondary === 'stadium') return c.stadium_name || '';
      return c.division || '';
    }
    function filtered(q) {
      q = (q || '').toLowerCase().trim();
      /* Empty box = browsing → show the WHOLE eligible roster (the dropdown
         scrolls). opt.limit only caps typed searches, so it stays snappy. */
      if (!q) return clubs.slice();
      return clubs.filter(function(c) {
        return c.name.toLowerCase().indexOf(q) !== -1 || (c.short && c.short.toLowerCase().indexOf(q) !== -1);
      }).slice(0, opt.limit);
    }
    function renderList(q) {
      var matches = filtered(q);
      rendered = matches.map(function(c) { return { club: c, freetext: false }; });
      dd.innerHTML = '';
      matches.forEach(function(c, i) {
        var o = document.createElement('div');
        o.className = 'club-picker__option'; o.id = id + '-opt' + i;
        o.setAttribute('role', 'option'); o.setAttribute('aria-selected', 'false');
        var img = document.createElement('img'); img.alt = '';
        window.NL.clubs.wireCrestImg(img, crestKeyOf(c), opt.crestFallback === 'hide');
        img.src = window.NL.clubs.crestUrl(crestKeyOf(c), 'thumb');
        var nm = document.createElement('span'); nm.className = 'club-picker__option-name'; nm.textContent = c.name;
        o.appendChild(img); o.appendChild(nm);
        var sec = secondaryText(c);
        if (sec) { var dv = document.createElement('span'); dv.className = 'club-picker__option-div'; dv.textContent = sec; o.appendChild(dv); }
        o.addEventListener('mousedown', function(e) { e.preventDefault(); commit(i); });
        dd.appendChild(o);
      });
      if (opt.freetext === 'commit' && q && q.trim()) {
        var typed = q.trim(), fi = rendered.length;
        rendered.push({ club: null, freetext: true, typed: typed });
        var fo = document.createElement('div');
        fo.className = 'club-picker__option club-picker__option--freetext'; fo.id = id + '-opt' + fi;
        fo.setAttribute('role', 'option');
        var fn = document.createElement('span'); fn.className = 'club-picker__option-name';
        fn.textContent = 'Use “' + typed + '” as entered';
        fo.appendChild(fn);
        fo.addEventListener('mousedown', function(e) { e.preventDefault(); commit(fi); });
        dd.appendChild(fo);
      }
      if (!rendered.length) {
        var em = document.createElement('div');
        em.className = 'club-picker__option'; em.textContent = 'No clubs found';
        em.style.cssText = 'color:var(--text-muted);cursor:default;';
        dd.appendChild(em);
      }
      activeIdx = rendered.length ? 0 : -1; paintActive();
    }
    function paintActive() {
      var opts = dd.querySelectorAll('.club-picker__option');
      for (var i = 0; i < opts.length; i++) {
        var on = (i === activeIdx);
        opts[i].classList.toggle('club-picker__option--active', on);
        if (rendered[i]) opts[i].setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) { if (input) input.setAttribute('aria-activedescendant', opts[i].id); opts[i].scrollIntoView({ block: 'nearest' }); }
      }
      if (!rendered.length && input) input.removeAttribute('aria-activedescendant');
    }
    function openDd() {
      if (open || opt.disabled) return;
      open = true; dd.classList.add('open'); el.classList.add('is-open');
      if (input) input.setAttribute('aria-expanded', 'true');
      if (opt.mode === 'select') wrap.setAttribute('aria-expanded', 'true');
    }
    function closeDd() {
      if (!open) return;
      open = false; dd.classList.remove('open'); el.classList.remove('is-open');
      if (input) input.setAttribute('aria-expanded', 'false');
      if (opt.mode === 'select') wrap.setAttribute('aria-expanded', 'false');
    }
    function applySelection(sel) {
      selectedName = sel.name;
      /* Visible crest uses the thumb (thumb→full→rose fallback); the payload's
         sel.crestUrl stays full-res for onSelect callers. */
      var ck = sel.crestKey || sel.name;
      if (ck) {
        window.NL.clubs.wireCrestImg(crest, ck, false);
        crest.src = window.NL.clubs.crestUrl(ck, 'thumb');
      } else {
        crest.onerror = function() { this.onerror = null; this.src = CLUB_ROSE; };
        crest.src = sel.crestUrl || CLUB_ROSE;
      }
      if (opt.mode === 'select') { valueSpan.textContent = sel.name; valueSpan.classList.remove('club-picker__value--placeholder'); }
      else { input.value = sel.name; }
      if (clearBtn) clearBtn.style.display = sel.name ? '' : 'none';
      el.classList.toggle('has-crest', !!sel.name);
    }
    function commitSel(sel) { applySelection(sel); closeDd(); opt.onSelect(sel); }
    function commit(idx) {
      var row = rendered[idx]; if (!row) return;
      var sel = row.freetext
        /* Freetext (e.g. an EFL club not on the NL roster): still resolve the
           crest by the same crests/<name>.png rule, so a repo crest shows if
           present (onerror falls back to the rose). */
        ? { name: row.typed, club: null, division: '', crestKey: row.typed, crestUrl: window.NL.clubs.crestUrl(row.typed), isFreetext: true, isOffRoster: false, seasonKey: seasonKey() }
        : { name: row.club.name, club: row.club, division: row.club.division || '', crestKey: crestKeyOf(row.club), crestUrl: window.NL.clubs.crestUrl(crestKeyOf(row.club)), isFreetext: false, isOffRoster: false, seasonKey: seasonKey() };
      commitSel(sel);
    }
    /* Blur with a typed-but-uncommitted value: land it so nothing dangles. An
       exact roster name commits that club; otherwise, if freetext is enabled,
       the typed value commits as freetext; else the dangling text reverts to
       the last committed selection. */
    function autoCommitTyped() {
      if (!input) return;
      var typed = input.value.trim();
      if (!typed || typed === selectedName) return;
      var lc = typed.toLowerCase(), exact = null;
      for (var i = 0; i < clubs.length; i++) { if (clubs[i].name.toLowerCase() === lc) { exact = clubs[i]; break; } }
      if (exact) {
        commitSel({ name: exact.name, club: exact, division: exact.division || '', crestKey: crestKeyOf(exact), crestUrl: window.NL.clubs.crestUrl(crestKeyOf(exact)), isFreetext: false, isOffRoster: false, seasonKey: seasonKey() });
      } else if (opt.freetext) {
        commitSel({ name: typed, club: null, division: '', crestKey: typed, crestUrl: window.NL.clubs.crestUrl(typed), isFreetext: true, isOffRoster: false, seasonKey: seasonKey() });
      } else {
        input.value = selectedName || '';
      }
    }
    function move(delta) { if (!rendered.length) return; activeIdx = (activeIdx + delta + rendered.length) % rendered.length; paintActive(); }
    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { openDd(); loadRoster().then(function() { renderList(input ? input.value : ''); }); } else move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { if (open && activeIdx >= 0) { e.preventDefault(); commit(activeIdx); } }
      else if (e.key === 'Escape') { if (open) { e.preventDefault(); closeDd(); } }
      else if (e.key === 'Home') { if (open && rendered.length) { e.preventDefault(); activeIdx = 0; paintActive(); } }
      else if (e.key === 'End') { if (open && rendered.length) { e.preventDefault(); activeIdx = rendered.length - 1; paintActive(); } }
    }

    if (opt.mode === 'search') {
      input.addEventListener('input', function() {
        selectedName = null; crest.src = CLUB_ROSE; el.classList.remove('has-crest');
        if (clearBtn) clearBtn.style.display = input.value ? '' : 'none';
        openDd(); loadRoster().then(function() { renderList(input.value); });
      });
      input.addEventListener('focus', function() {
        /* Open on focus/click even when empty, so a plain click reveals the
           full eligible list to browse (not just after typing). */
        openDd(); loadRoster().then(function() { renderList(input.value); });
      });
      input.addEventListener('keydown', onKey);
      input.addEventListener('blur', function() {
        /* Commit synchronously on blur. Option clicks don't blur (they use
           mousedown + preventDefault), so this only fires on a genuine leave —
           and firing during blur means the commit lands BEFORE any external
           side-effect of the click (e.g. a demo/tool that rebuilds on change).
           A deferred (setTimeout) commit would lose that race and appear to
           "wipe". Guard against a torn-down input. */
        if (input.isConnected) autoCommitTyped();
      });
    } else {
      var typeBuf = '', typeTimer = null;
      function jumpType() {
        for (var i = 0; i < rendered.length; i++) {
          if (rendered[i].club && rendered[i].club.name.toLowerCase().indexOf(typeBuf) === 0) { activeIdx = i; paintActive(); return; }
        }
      }
      wrap.addEventListener('click', function() { if (open) { closeDd(); return; } openDd(); loadRoster().then(function() { renderList(''); }); });
      wrap.addEventListener('keydown', function(e) {
        onKey(e);
        if (e.key && e.key.length === 1 && /\S/.test(e.key)) {
          if (!open) { openDd(); loadRoster().then(function() { renderList(''); typeBuf += e.key.toLowerCase(); jumpType(); }); return; }
          typeBuf += e.key.toLowerCase(); clearTimeout(typeTimer); typeTimer = setTimeout(function() { typeBuf = ''; }, 800); jumpType();
        }
      });
    }
    if (clearBtn) clearBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); controller.clear(); });

    function onDocClick(e) { if (!el.contains(e.target)) closeDd(); }
    document.addEventListener('click', onDocClick);

    var controller = {
      setValue: function(name) {
        if (!name) return this.clear();
        var apply = function(c) {
          var ck = c ? crestKeyOf(c) : name;
          applySelection({ name: name, club: c || null, division: (c && c.division) || '', crestKey: ck, crestUrl: window.NL.clubs.crestUrl(ck), isFreetext: !c, isOffRoster: false, seasonKey: seasonKey() });
        };
        /* Extras first — a guest is not on the clubs-meta roster, so byName
           would miss it and the value would render as freetext. */
        var found = null, lc = String(name).toLowerCase();
        for (var i = 0; i < opt.extraClubs.length; i++) {
          if (String(opt.extraClubs[i].name).toLowerCase() === lc) { found = opt.extraClubs[i]; break; }
        }
        if (!found) found = window.NL.clubs.byName(name);
        if (found) apply(found);
        else window.NL.clubs.load().then(function() { apply(window.NL.clubs.byName(name)); }).catch(function() { apply(null); });
        return this;
      },
      getValue: function() { return selectedName; },
      clear: function() {
        selectedName = null; crest.src = CLUB_ROSE;
        if (opt.mode === 'select') { valueSpan.textContent = opt.placeholder; valueSpan.classList.add('club-picker__value--placeholder'); }
        else { input.value = ''; }
        if (clearBtn) clearBtn.style.display = 'none';
        el.classList.remove('has-crest'); return this;
      },
      setDisabled: function(d) {
        opt.disabled = !!d;
        if (input) input.disabled = !!d;
        if (opt.mode === 'select') wrap.disabled = !!d;
        el.classList.toggle('is-disabled', !!d); return this;
      },
      setSeason:    function(key)  { opt.season = key || 'current'; clubs = []; return this; },
      setDivisions: function(divs) { opt.divisions = divs || null; clubs = []; return this; },
      /* Swap the off-roster records (pass [] to drop them). The dropdown is
         rebuilt on next open, so this is safe to call while closed. */
      setExtraClubs: function(list) { opt.extraClubs = list || []; clubs = []; return loadRoster().then(function() { return controller; }); },
      refresh:      function()     { clubs = []; return loadRoster(); },
      destroy:      function()     { document.removeEventListener('click', onDocClick); el.innerHTML = ''; el.className = el.className.replace(/\bclub-picker\S*/g, '').replace(/\bis-open\b|\bhas-crest\b|\bis-disabled\b/g, '').trim(); }
    };

    if (opt.disabled) controller.setDisabled(true);
    if (opt.value) controller.setValue(opt.value);
    loadRoster(); /* warm the cache */

    return controller;
  };

})();
