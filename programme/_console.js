/* =========================================================================
   Programme Packs — the League's tabs: Removed files, Audit and Manage
   File: /programme/_console.js
   Version: v1.0 (13/11/2026) — the console's tabs, moved from
     /programme/admin/ (v1.12) when the console and the library became one
     page at /programme/ (system/one-address-plan.md). Loaded only for a
     League session with Manage (PP.enterMaster's '*' session); clubs never
     fetch it. The library page owns the tabs and calls show(tab).
   ========================================================================= */
(function () {
  'use strict';

  var CONFIG = { clubs: {}, nl: null };
  /* False until the config listener has actually delivered a value. An empty
     CONFIG has two very different causes — nothing seeded yet, or we have not
     heard back — and they were rendering the same screen: "Not switched on
     yet", with a Seed roster button under it. Pressed on the second cause,
     that mints 72 replacement passcodes for clubs already holding working
     ones. Nearly happened on 21/08/2026, when the codes moved out from under
     this tool and the console was still reading the emptied node. */
  var configSeen = false;
  var FILES = {}, TRASH = {}, AUDIT = {}, ROSTER = [], BY_CODE = {};
  var ready = false;
  var tab = null;          // set by show(): 'trash' | 'audit' | 'access'
  /* Boot messages go to whichever tab is showing. */
  function paneEl() {
    return el({ access: 'paneAccess', trash: 'paneTrash', audit: 'paneAudit' }[tab] || 'paneTrash');
  }

  var esc = function (s) { return NL.escHtml(s); };
  function el(id) { return document.getElementById(id); }

  /* Nothing here may fail silently. An earlier build attached the RTDB
     listeners with no error callback and rendered only once data arrived, so a
     denied read — or a passcode exchange that never came back — left the panes
     blank forever with nothing in the console. Every path below ends in either
     content or a visible message. */
  function status(text, detail) {
    paneEl().innerHTML = '<p class="boot">' + esc(text) + (detail ? '<br>' + esc(detail) : '') + '</p>';
  }

  function fail(where, e) {
    var msg = (e && (e.message || e.code)) || String(e);
    console.error('[programme-admin] ' + where, e);
    paneEl().innerHTML =
      '<div class="empty-state"><div class="empty-state__title">Couldn’t open the console</div>' +
      '<div class="empty-state__text">' + esc(where) + ' — ' + esc(msg) + '</div></div>';
  }

  /* Called by the library page once the League's all-clubs session is in
     (PP.enterMaster): the same '*' session the library uses, so nothing is
     exchanged twice. */
  function start() {
    if (ready) return;
    ready = true;
    status('Opening…');
    
    NL.clubs.forSeason().then(function (clubs) {
      ROSTER = clubs;
      BY_CODE = {};
      clubs.forEach(function (c) { BY_CODE[c.code] = c; });
      render();

      /* Re-render only the tab a change can affect. An audit write used to
         redraw the access table, which threw away its horizontal scroll
         position mid-click — the "nav pops back to the left". */
      var PANE = { access: 'paneAccess', trash: 'paneTrash', audit: 'paneAudit' };
      function watch(path, apply, tabs, ref) {
        (ref || PP.ref(path)).on('value', function (s) {
          apply(s.val() || {});
          if (tabs.indexOf(tab) !== -1) render();
        }, function (err) { fail('reading ' + path, err, PANE[tabs[tabs.length - 1]]); });
      }

      /* The codes live outside this tool now — app-data/club-codes/{clubs,nl},
         the one credential the Handbook and Programme Packs both open on. The
         explicit refs are why: PP.ref('config') would read the emptied node
         under this tool and report 72 clubs with no access, one button press
         away from minting 72 replacement passcodes nobody holds.

         Two watchers rather than one on the parent, because that parent also
         holds authRequests/authGrants, which clients write and nobody should
         be able to read across. Reading each key by name keeps the rule on
         each key. */
      watch('clubs', function (v) {
        configSeen = true;
        CONFIG.clubs = v || {};
      }, ['access'], PP.codesRef('clubs'));
      watch('nl', function (v) {
        CONFIG.nl = (v && Object.keys(v).length) ? v : null;
      }, ['access'], PP.codesRef('nl'));
      /* The standard message is not a credential and stays in the wrapper.
         Keep an edit in progress — only adopt the stored template when the box
         hasn't been touched, or a save from another tab would wipe what you
         are typing. */
      watch('emailTemplate', function (v) {
        if (v && v.body) {
          var box = el('tplBody');
          if (!box || box.value === TPL || !box.value) TPL = v.body;
        }
      }, ['access'], PP.codesRef('config/emailTemplate'));
      watch('files', function (v) { FILES = v; }, ['access']);
      watch('trash', function (v) { TRASH = v; }, ['access', 'trash']);
      subscribeAudit();
    }).catch(function (e) { fail('reading the club list', e, 'paneAccess'); });
  }

  function render() {
    if (!ready || !tab) return;
    if (tab === 'access') renderAccess();
    else if (tab === 'trash') renderTrash();
    else if (tab === 'audit') renderAudit();
  }

  /* ── Access ───────────────────────────────────────────────────────────── */

  function fileCount(code) { return Object.keys(FILES[code] || {}).length; }

  /* Storage is billed on what is in the bucket, and a club "removing" a file
     only moves its RTDB record to trash — the bytes stay until the console
     purges them. So live and removed are counted separately and both shown:
     a big removed figure is reclaimable space, not noise. Sizes come from the
     records rather than the bucket, which is exact for anything uploaded
     through the tool and the only figure available to a client. */
  function bytesIn(node, code) {
    var obj = (node[code] || {}), total = 0;
    Object.keys(obj).forEach(function (k) { total += Number(obj[k].size) || 0; });
    return total;
  }
  function liveBytes(code)  { return bytesIn(FILES, code); }
  function trashBytes(code) { return bytesIn(TRASH, code); }

  function totalBytes(node) {
    var t = 0;
    Object.keys(node).forEach(function (code) { t += bytesIn(node, code); });
    return t;
  }

  /* Sequential ramp, light → dark, from the brand navy ladder. One hue: the
     bars encode magnitude, not identity, so a categorical palette (and its CVD
     validation) is the wrong tool. Deepest for the biggest. */
  var RAMP = ['var(--navy-300)', 'var(--navy-400)', 'var(--navy-500)',
              'var(--navy-600)', 'var(--navy-700)', 'var(--navy-800)'];

  function storageHero() {
    var live = totalBytes(FILES), removed = totalBytes(TRASH);
    var nlBytes = liveBytes('NL');
    var clubsWithFiles = ROSTER.filter(function (c) { return fileCount(c.code) > 0; }).length;

    return '<div class="hero">' +
      '<div class="hero__cell hero__cell--lead">' +
        '<div class="hero__num">' + esc(PP.humanSize(live)) + '</div>' +
        '<div class="hero__label">Stored</div></div>' +
      '<div class="hero__cell"><div class="hero__num">' + esc(PP.humanSize(nlBytes)) + '</div>' +
        '<div class="hero__label">National League</div></div>' +
      '<div class="hero__cell"><div class="hero__num">' + clubsWithFiles + '</div>' +
        '<div class="hero__label">Clubs uploading</div></div>' +
      '<div class="hero__cell"><div class="hero__num">' + esc(PP.humanSize(removed)) + '</div>' +
        '<div class="hero__label">Removed, recoverable</div></div>' +
    '</div>';
  }

  function storageRanks() {
    var rows = [];
    if (liveBytes('NL')) rows.push({ name: 'National League', bytes: liveBytes('NL') });
    ROSTER.forEach(function (c) {
      var b = liveBytes(c.code);
      if (b) rows.push({ name: c.name, bytes: b });
    });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return b.bytes - a.bytes; });

    var top = rows.slice(0, 12);
    var rest = rows.slice(12);
    if (rest.length) {
      rows = top.concat([{ name: rest.length + ' others', bytes:
        rest.reduce(function (t, r) { return t + r.bytes; }, 0), muted: true }]);
    } else { rows = top; }

    var max = rows[0].bytes || 1;
    return '<div class="rank"><div class="rank__title">Storage by folder</div>' +
      rows.map(function (r, i) {
        var pct = Math.max(1, Math.round((r.bytes / max) * 100));
        var shade = r.muted ? 'var(--navy-200)'
                            : RAMP[Math.min(RAMP.length - 1, RAMP.length - 1 - Math.floor(i / 2))];
        return '<div class="rank__row" title="' + esc(r.name + ' — ' + PP.humanSize(r.bytes)) + '">' +
          '<div class="rank__name">' + esc(r.name) + '</div>' +
          '<div class="rank__track"><div class="rank__fill" style="width:' + pct + '%;background:' + shade + '"></div></div>' +
          '<div class="rank__val">' + esc(PP.humanSize(r.bytes)) + '</div></div>';
      }).join('') + '</div>';
  }

  /* ── Previews backfill ────────────────────────────────────────────────
     Images uploaded before v1.17 of the library have no thumb/medium tiers,
     so every tile that shows them costs the full original — the exact thing
     previews exist to stop. This renders the missing tiers HERE, in the
     admin's browser: fetch the bytes (bucket CORS already admits this origin
     for the zip feature), resize on a canvas, store the variants into the
     club's own prefix under the '*' session, stamp the record. No function,
     no deploy — the same decision as generation at upload, for the same
     org-policy and latency reasons (_shared.js header).

     Idempotent by record: previewsAt marks generation as having run, even
     when an image was small enough to need no tiers, so re-pressing the
     button only ever picks up what is still missing. Failures stay
     unstamped and are retried next run. */
  var BACKFILL = { running: false, done: 0, total: 0, failed: 0, current: '', cancel: false };
  var BACKFILL_CONC = 3;

  function backfillCandidates() {
    var out = [];
    Object.keys(FILES).forEach(function (code) {
      Object.keys(FILES[code] || {}).forEach(function (id) {
        var r = FILES[code][id] || {};
        if (!r.url || r.previewsAt || r.thumbUrl) return;
        if (!PP.previews.eligible(r.contentType)) return;
        out.push({ code: code, id: id, rec: r });
      });
    });
    return out;
  }

  function previewsCard() {
    var waiting = backfillCandidates();
    if (BACKFILL.running) {
      return '<div class="tpl"><div class="tpl__head">Previews</div>' +
        '<div class="up-row"><span class="up-row__name">' +
          esc(BACKFILL.done + ' of ' + BACKFILL.total +
            (BACKFILL.current ? ' · ' + BACKFILL.current : '')) + '</span>' +
        '<span class="up-row__bar"><span class="up-row__fill" style="transform:scaleX(' +
          (BACKFILL.total ? BACKFILL.done / BACKFILL.total : 0) + ')"></span></span>' +
        '<button class="btn btn--ghost btn--sm" id="bfStop">Stop</button></div></div>';
    }
    if (!waiting.length) return '';   // nothing to do, nothing to say
    var bytes = waiting.reduce(function (t, c) { return t + (Number(c.rec.size) || 0); }, 0);
    return '<div class="tpl"><div class="tpl__head">Previews</div>' +
      '<p class="form-hint" style="margin:0 0 10px">' +
        esc(waiting.length + ' image' + (waiting.length === 1 ? '' : 's') + ' (' +
          PP.humanSize(bytes) + ') still previewing at full size — each one is ' +
          'downloaded in full every time its folder is opened.') + '</p>' +
      '<button class="btn btn--primary btn--sm" id="bfRun">Generate previews</button>' +
      (BACKFILL.failed ? ' <span class="form-hint">' +
        esc(BACKFILL.failed + ' failed last run — kept for retry') + '</span>' : '') +
      '</div>';
  }

  function backfillOne(item) {
    return fetch(item.rec.url)
      .then(function (r) {
        if (!r.ok) throw new Error('fetch ' + r.status);
        return r.blob();
      })
      .then(function (blob) { return PP.previews.make(blob, item.rec.contentType); })
      .then(function (made) {
        if (!made) throw new Error('undecodable');
        return PP.previews.store(item.code, item.id, made);
      })
      .then(function (fields) {
        return PP.ref('files/' + item.code + '/' + item.id).update(fields);
      });
  }

  function runBackfill() {
    var queue = backfillCandidates();
    if (!queue.length || BACKFILL.running) return;
    BACKFILL = { running: true, done: 0, total: queue.length, failed: 0, current: '', cancel: false };
    render();

    var next = 0;
    function pump() {
      if (BACKFILL.cancel || next >= queue.length) return Promise.resolve();
      var item = queue[next++];
      BACKFILL.current = item.rec.name || '';
      return backfillOne(item)
        .catch(function () { BACKFILL.failed++; })
        .then(function () {
          BACKFILL.done++;
          /* The record update already re-renders via the files watcher; this
             covers the failure path, where nothing else would repaint. */
          if (tab === 'access') render();
          return pump();
        });
    }

    var lanes = [];
    for (var i = 0; i < BACKFILL_CONC; i++) lanes.push(pump());
    Promise.all(lanes).then(function () {
      var ok = BACKFILL.done - BACKFILL.failed;
      var stopped = BACKFILL.cancel;
      BACKFILL.running = false;
      BACKFILL.current = '';
      PP.audit('previews-backfill', { count: ok,
        detail: ok + ' generated' + (BACKFILL.failed ? ', ' + BACKFILL.failed + ' failed' : '') +
          (stopped ? ', stopped early' : '') });
      NL.toast(ok + ' preview' + (ok === 1 ? '' : 's') + ' generated' +
        (BACKFILL.failed ? ' · ' + BACKFILL.failed + ' failed' : ''),
        BACKFILL.failed ? 'info' : 'success');
      render();
    });
  }

  function renderAccess() {
    var seeded = Object.keys(CONFIG.clubs || {}).length;

    if (!seeded && !CONFIG.nl && !configSeen) {
      status('Reading club access…',
        'If this does not clear, the codes are not readable from here — say so ' +
        'rather than seeding, which would issue new passcodes over the top.');
      return;
    }

    if (!seeded && !CONFIG.nl) {
      el('paneAccess').innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state__title">Not switched on yet</div>' +
          '<div class="empty-state__text">Seed the current National League roster. Each club gets its own ' +
          'passcode and direct link, plus one shared National League code for uploading adverts.</div>' +
          '<div style="margin-top:14px"><button class="btn btn--primary" id="btnSeed">Seed roster</button></div>' +
        '</div>';
      el('btnSeed').onclick = seedRoster;
      return;
    }

    var rows = [];

    if (CONFIG.nl) {
      rows.push(accessRow('NL', 'National League', '', CONFIG.nl, true));
    }
    ROSTER.forEach(function (c) {
      var rec = CONFIG.clubs[c.code];
      if (rec) rows.push(accessRow(c.code, c.name, c.division || '', rec, false));
    });

    var missing = ROSTER.filter(function (c) { return !CONFIG.clubs[c.code]; }).length;

    el('paneAccess').innerHTML =
      storageHero() + storageRanks() + previewsCard() +
      '<div class="tpl">' +
        '<div class="tpl__head">Standard message</div>' +
        '<p class="form-hint" style="margin:0 0 8px">Placeholders: <code>{club}</code> <code>{link}</code> <code>{passcode}</code></p>' +
        '<textarea id="tplBody" rows="10"></textarea>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">' +
          '<button class="btn btn--ghost btn--sm" id="tplSave">Save standard message</button>' +
          '<button class="btn btn--navy btn--sm" id="tplBuild">Build email text for all clubs</button>' +
          '<span id="tplStatus" class="form-hint"></span>' +
        '</div>' +
        '<textarea id="emailsOut" rows="12" readonly placeholder="Generated email text appears here…" style="display:none;margin-top:10px"></textarea>' +
      '</div>' +
      '<div class="acc-tools">' +
        '<button class="btn btn--ghost" id="btnSeedSync">Sync roster' + (missing ? ' (' + missing + ' missing)' : '') + '</button>' +
        '<button class="btn btn--ghost" id="btnExport">Export access CSV</button>' +
        '<button class="btn btn--ghost" id="btnMerge">Export mail-merge CSV</button>' +
        '<span class="acc-tools__spacer"></span>' +
        '<span class="text-label">' + esc(String(seeded)) + ' clubs + National League</span>' +
      '</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>Club</th><th>Division</th><th>Passcode</th><th>Files</th><th>Storage</th><th></th>' +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    NL.clubs.wireCrestImgs(el('paneAccess'));   // thumb → full → rose, same tick as insertion

    el('btnSeedSync').onclick = seedRoster;
    el('btnExport').onclick = exportCsv;
    el('btnMerge').onclick = exportMergeCsv;

    var bfRun = el('bfRun');
    if (bfRun) bfRun.onclick = runBackfill;
    var bfStop = el('bfStop');
    if (bfStop) bfStop.onclick = function () { BACKFILL.cancel = true; };

    el('tplBody').value = TPL;
    el('tplSave').onclick = saveTpl;
    el('tplBuild').onclick = buildAllEmails;

    Array.prototype.forEach.call(el('paneAccess').querySelectorAll('[data-email]'), function (b) {
      b.onclick = function () { copyOne(b.getAttribute('data-email')); };
    });
    Array.prototype.forEach.call(el('paneAccess').querySelectorAll('[data-open]'), function (b) {
      b.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        openAs(b.getAttribute('data-open'));
        if (OPTS.openClub) OPTS.openClub(b.getAttribute('data-open'));
      });
    });

    Array.prototype.forEach.call(el('paneAccess').querySelectorAll('[data-copy]'), function (b) {
      b.onclick = function () {
        NL.copy(b.getAttribute('data-copy'));
        NL.toast('Link copied', 'success');
      };
    });
    Array.prototype.forEach.call(el('paneAccess').querySelectorAll('[data-regen]'), function (b) {
      b.onclick = function () { regen(b.getAttribute('data-regen')); };
    });
  }

  function accessRow(code, name, division, rec, isNL) {
    var n = fileCount(code);
    return '<tr class="' + (isNL ? 'is-nl' : '') + '">' +
      '<td><span class="club-cell">' +
        (isNL ? '<img src="' + PP.ROSE + '" alt="">'
              : NL.clubs.crestImgHtml(name, 'thumb')) +
        '<span class="club-cell__name">' + esc(name) + '</span></span></td>' +
      '<td>' + esc(division || (isNL ? 'League' : '')) + '</td>' +
      '<td><span class="code-mono">' + esc(rec.passcode || '—') + '</span></td>' +
      '<td>' + (n ? esc(String(n)) : '<span class="text-label">Empty</span>') + '</td>' +
      '<td>' + (n ? esc(PP.humanSize(liveBytes(code))) : '<span class="text-label">—</span>') +
        (trashBytes(code) ? ' <span class="text-label">+' + esc(PP.humanSize(trashBytes(code))) + ' removed</span>' : '') +
      '</td>' +
      '<td><span class="row-acts">' +
        '<a class="btn btn--navy btn--sm" data-open="' + esc(code) + '"' +
          ' href="' + esc('/programme/#/' + encodeURIComponent(code)) + '">Open</a>' +
        '<button class="btn btn--ghost btn--sm" data-email="' + esc(code) + '">Copy email</button>' +
        '<button class="btn btn--ghost btn--sm" data-copy="' + esc(PP.clubLink(code)) + '">Copy link</button>' +
        '<button class="btn btn--ghost btn--sm" data-regen="' + esc(code) + '">Regenerate</button>' +
      '</span></td></tr>';
  }

  /* Two clubs drawing the same six characters is roughly a 1-in-340,000 event
     across 73 codes, and it used to be handled after the fact: the ?c= link
     token narrowed the server's passcode search to one club. That token is gone
     — it went stale on every regenerate, see PP.clubLink — so uniqueness is
     enforced where it belongs, at the point of minting. That is a guarantee
     rather than a tiebreak, and a collision here costs a retry instead of a
     phone call. */
  function takenCodes() {
    var out = {};
    Object.keys(CONFIG.clubs || {}).forEach(function (k) {
      var p = (CONFIG.clubs[k] || {}).passcode;
      if (p) out[PP.normCode(p)] = true;
    });
    if (CONFIG.nl && CONFIG.nl.passcode) out[PP.normCode(CONFIG.nl.passcode)] = true;
    return out;
  }

  /* Mutates `taken`, so one seed run cannot hand the same code to two clubs —
     the config it was built from holds neither of them yet. */
  function freshPasscode(taken) {
    for (var i = 0; i < 50; i++) {
      var code = PP.newPasscode(), norm = PP.normCode(code);
      if (!taken[norm]) { taken[norm] = true; return code; }
    }
    return PP.newPasscode();   // fifty consecutive collisions is not this world
  }

  /* Seed is additive and idempotent: it only creates entries for clubs that
     don't have one. Re-running after promotion/relegation picks up the new
     clubs without touching any existing passcode. */
  function seedRoster() {
    /* Belt to the render guard's braces. Seeding is additive against what we
       have READ, so seeding against a config we never read writes a fresh
       passcode over every club — the one destructive thing this console can
       do, and the only one with no undo. */
    if (!configSeen) {
      NL.toast('Club access has not loaded — nothing seeded', 'error');
      return;
    }
    var clubUpdates = {}, nlRec = null, added = 0, taken = takenCodes();
    ROSTER.forEach(function (c) {
      if (CONFIG.clubs[c.code]) return;
      clubUpdates[c.code] = {
        name: c.name, division: c.division || '',
        passcode: freshPasscode(taken), addedAt: PP.TS()
      };
      added++;
    });
    if (!CONFIG.nl) {
      nlRec = {
        name: 'National League', division: '',
        passcode: freshPasscode(taken), addedAt: PP.TS()
      };
      added++;
    }
    if (!added) { NL.toast('Every club already has access', 'info'); return; }

    /* Written per key, not as one update on the parent: the parent also holds
       authRequests/authGrants, and the rules are on each key by name. */
    var writes = [];
    if (Object.keys(clubUpdates).length) writes.push(PP.codesRef('clubs').update(clubUpdates));
    if (nlRec) writes.push(PP.codesRef('nl').set(nlRec));
    Promise.all(writes).then(function () {
      PP.audit('seed', { count: added, detail: 'Seeded from clubs-meta roster' });
      NL.toast(added + ' added', 'success');
    }).catch(function (e) { NL.toast('Seed failed: ' + e.message, 'error'); });
  }

  function regen(code) {
    var isNL = code === 'NL';
    var rec = isNL ? CONFIG.nl : CONFIG.clubs[code];
    if (!rec) return;
    NL.confirm('Regenerate the passcode for <strong>' + esc(rec.name) + '</strong>? ' +
      'The current one stops working immediately, including on any device that remembered it — ' +
      'you’ll need to send the new one out. Their link is unaffected.',
      { title: 'Regenerate access', html: true, confirmText: 'Regenerate', variant: 'danger' })
      .then(function (ok) {
        if (!ok) return;
        var path = isNL ? 'nl' : 'clubs/' + code;
        return PP.codesRef(path).update({ passcode: freshPasscode(takenCodes()) })
          .then(function () {
            PP.audit('regen-access', { club: code, clubName: rec.name });
            NL.toast('New passcode issued', 'success');
          });
      }).catch(function (e) { NL.toast('Could not regenerate: ' + e.message, 'error'); });
  }

  /* ── Club emails ──────────────────────────────────────────────────────
     An editable standard message
     held in RTDB with placeholders, and one button that renders it for every
     club into a block you copy in a single go. Nothing is sent from here —
     there is no mail infrastructure in this project and no club addresses in
     RTDB, and a page that cannot send is a page that cannot mis-send to 72
     clubs. */

  var DEFAULT_TPL =
    'Subject: {club} — your Programme Packs access\n\n' +
    'Dear {club},\n\n' +
    'Programme Packs is the National League\u2019s shared library for match-day programme assets — crests, squad photos, club information and league adverts. It replaces emailing files back and forth ahead of each fixture.\n\n' +
    '{club}\u2019s private link (please don\u2019t share it outside your club):\n{link}\n\n' +
    'Passcode: {passcode}\n\n' +
    'How to use it:\n' +
    '1. Open the link and bookmark it — it is yours and does not change.\n' +
    '2. Enter the passcode. Your device will remember it for 30 days.\n' +
    '3. Your own folder is at the top. Upload your crest, squad and manager photos, and club information there.\n' +
    '4. Every other club is listed below yours — open any of them to download what you need for a fixture.\n' +
    '5. The National League folder is pinned to the top of every page. League adverts appear there, marked with the dates they should run.\n\n' +
    'Please note: anything you upload can be seen and downloaded by all 72 clubs and by the National League. Please don\u2019t upload contracts, personal details or anything confidential. You can only add or remove files in your own folder.\n\n' +
    'If the passcode gets out, tell us and we will issue a new one straight away.\n\n' +
    'Kind regards,\nThe National League';

  var TPL = DEFAULT_TPL;

  function recFor(code) { return code === 'NL' ? CONFIG.nl : CONFIG.clubs[code]; }
  function nameFor(code) {
    return code === 'NL' ? 'National League' : ((BY_CODE[code] || {}).name || code);
  }

  /* Render the template for one club. Split/join rather than replace() so a
     passcode or club name containing $& can't be read as a replacement
     pattern. */
  function renderTpl(code, body) {
    var rec = recFor(code);
    if (!rec) return '';
    return (body || TPL)
      .split('{club}').join(nameFor(code))
      .split('{link}').join(PP.clubLink(code))
      .split('{passcode}').join(rec.passcode || '');
  }

  function emailCodes() {
    var out = [];
    if (CONFIG.nl) out.push('NL');
    ROSTER.forEach(function (c) { if (CONFIG.clubs[c.code]) out.push(c.code); });
    return out;
  }

  function buildAllEmails() {
    var body = el('tplBody').value || TPL;
    var codes = emailCodes();
    var out = codes.map(function (code) {
      return '=== ' + nameFor(code) + ' ===\n' + renderTpl(code, body) + '\n';
    }).join('\n');
    var ta = el('emailsOut');
    ta.style.display = '';
    ta.value = out;
    ta.select();
    NL.copy(out, { ok: 'Email text for ' + codes.length + ' clubs copied.' });
    PP.audit('build-emails', { count: codes.length });
  }

  function saveTpl() {
    TPL = el('tplBody').value;
    PP.codesRef('config/emailTemplate').set({ body: TPL, updatedAt: PP.TS() }).then(function () {
      el('tplStatus').textContent = 'Saved ✓';
      setTimeout(function () { el('tplStatus').textContent = ''; }, 2000);
      PP.audit('email-template', { detail: 'Updated the standard message' });
    }).catch(function (e) {
      el('tplStatus').textContent = 'Save failed: ' + (e.message || e);
    });
  }

  /* Open a club's library in a new tab, to answer "what are they actually
     seeing?". Logged from the admin session, so the trail shows who looked. */
  /* A real anchor rather than window.open(). Passing a features string to
     window.open makes Chrome treat it as a popup and blockers stop it, which
     is why the first version silently did nothing. An <a target="_blank">
     also gets middle-click and cmd-click for free.

     The handler runs before the browser follows the link and never calls
     preventDefault, so a failed audit write cannot stop the tab opening. */
  /* v1.10: Open shows the club's library in the master view, rather than
     signing this browser in as the club. A club code now goes through the
     shared door on the default app, so taking one here would have signed the
     admin out of NL Tools. The master view shows the same folders, and its
     changes are recorded as the League's, which is what they are. */
  function openAs(code) {
    if (!recFor(code)) return;
    PP.audit('open-as', { club: code, clubName: nameFor(code) });
  }

  function copyOne(code) {
    NL.copy(renderTpl(code, el('tplBody').value), { ok: nameFor(code) + ' email copied.' });
    PP.audit('email-copy', { club: code, clubName: nameFor(code) });
  }

  /* One row per club with the message pre-rendered — for a mail merge, so the
     73 emails go out individually rather than as one copied block. */
  function exportMergeCsv() {
    var body = el('tplBody').value || TPL;
    var rows = [['Club', 'Division', 'Passcode', 'Link', 'Message']];
    emailCodes().forEach(function (code) {
      var rec = recFor(code);
      rows.push([
        nameFor(code),
        code === 'NL' ? 'League' : ((BY_CODE[code] || {}).division || ''),
        rec.passcode, PP.clubLink(code), renderTpl(code, body)
      ]);
    });
    NL.download('programme-packs-emails.csv', NL.csv(rows), 'text/csv');
    PP.audit('export-emails', { count: rows.length - 1 });
    NL.toast('Mail-merge CSV downloaded', 'success');
  }

  function exportCsv() {
    var rows = [['Club', 'Division', 'Passcode', 'Link']];
    if (CONFIG.nl) rows.push(['National League', 'League', CONFIG.nl.passcode, PP.clubLink(CONFIG.nl.token, 'NL')]);
    ROSTER.forEach(function (c) {
      var rec = CONFIG.clubs[c.code];
      if (rec) rows.push([c.name, c.division || '', rec.passcode, PP.clubLink(c.code)]);
    });
    NL.download('programme-packs-access.csv', NL.csv(rows), 'text/csv');
    PP.audit('export-access', { count: rows.length - 1 });
  }

  /* ── Removed files ────────────────────────────────────────────────────
     Clubs can't delete bytes (Storage rules deny delete to anything but a '*'
     session), so a club "removing" a file only moves its record here. This is
     the only place a file is destroyed, and the only place one comes back. */

  function trashRows() {
    var out = [];
    Object.keys(TRASH).forEach(function (code) {
      Object.keys(TRASH[code] || {}).forEach(function (id) {
        var r = Object.assign({}, TRASH[code][id]);
        r.id = id; r.club = code;
        r.clubName = code === 'NL' ? 'National League' : ((BY_CODE[code] || {}).name || code);
        out.push(r);
      });
    });
    return out.sort(function (a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); });
  }

  function renderTrash() {
    var rows = trashRows();
    if (!rows.length) {
      el('paneTrash').innerHTML = '<div class="empty-state"><div class="empty-state__title">Nothing removed</div>' +
        '<div class="empty-state__text">Files a club removes land here so they can be put back.</div></div>';
      return;
    }
    el('paneTrash').innerHTML =
      '<div class="acc-tools"><span class="text-label">' + esc(String(rows.length)) + ' removed file' +
        (rows.length === 1 ? '' : 's') + ' · ' + esc(PP.humanSize(totalBytes(TRASH))) +
        ' still in storage until deleted for good</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>File</th><th>Club</th><th>Removed</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' +
          '<td>' + esc(r.name) + ' <span class="text-label">' + esc(PP.humanSize(r.size)) + '</span></td>' +
          '<td>' + esc(r.clubName) + '</td>' +
          '<td>' + esc(PP.fmt(r.deletedAt)) + '</td>' +
          '<td><span class="row-acts">' +
            '<button class="btn btn--restore btn--sm" data-restore="' + esc(r.club + '|' + r.id) + '">Restore</button>' +
            '<button class="btn btn--danger btn--sm" data-purge="' + esc(r.club + '|' + r.id) + '">Delete for good</button>' +
          '</span></td></tr>';
      }).join('') + '</tbody></table></div>';

    Array.prototype.forEach.call(el('paneTrash').querySelectorAll('[data-restore]'), function (b) {
      b.onclick = function () { restore(b.getAttribute('data-restore').split('|')); };
    });
    Array.prototype.forEach.call(el('paneTrash').querySelectorAll('[data-purge]'), function (b) {
      b.onclick = function () { purge(b.getAttribute('data-purge').split('|')); };
    });
  }

  function restore(pair) {
    var code = pair[0], id = pair[1];
    var rec = (TRASH[code] || {})[id];
    if (!rec) return;
    var copy = Object.assign({}, rec);
    delete copy.deletedAt;
    PP.ref('files/' + code + '/' + id).set(copy)
      .then(function () { return PP.ref('trash/' + code + '/' + id).remove(); })
      .then(function () {
        PP.audit('restore', { club: code, detail: rec.name });
        NL.toast('File restored', 'success');
      }).catch(function (e) { NL.toast('Could not restore: ' + e.message, 'error'); });
  }

  function purge(pair) {
    var code = pair[0], id = pair[1];
    var rec = (TRASH[code] || {})[id];
    if (!rec) return;
    NL.confirm('Permanently delete “' + esc(rec.name) + '”? The file itself is deleted and cannot be recovered.',
      { title: 'Delete for good', html: true, confirmText: 'Delete', variant: 'danger' })
      .then(function (ok) {
        if (!ok) return;
        /* Delete the bytes first. If that fails we keep the trash record, so a
           failure leaves a recoverable file rather than an orphaned object
           nobody can see or reach. */
        var gone = function (e) {
          // Already gone in Storage is fine — carry on and clear the record.
          if (e && e.code === 'storage/object-not-found') return;
          throw e;
        };
        return PP.storageRef(rec.storagePath).delete()
          .catch(gone)
          .then(function () {
            /* Its preview tiers go with it — they are copies of the same
               image, and the record about to be cleared is the only thing
               that knows their paths. Best-effort: a stray preview object is
               a few hundred KB, not a recoverable file. */
            var tiers = [rec.thumbPath, rec.mediumPath].filter(Boolean);
            return Promise.all(tiers.map(function (p) {
              return PP.storageRef(p).delete().catch(function () {});
            }));
          })
          .then(function () { return PP.ref('trash/' + code + '/' + id).remove(); })
          .then(function () {
            PP.audit('purge', { club: code, detail: rec.name });
            NL.toast('Deleted', 'success');
          });
      }).catch(function (e) { NL.toast('Could not delete: ' + e.message, 'error'); });
  }

  /* ── Audit ────────────────────────────────────────────────────────────── */

  /* The audit is fetched lazily: the query itself grows, rather than pulling
     everything and paging in the browser. An append-only trail that records
     every sign-in and every download gets long, and there is no reason for a
     page that shows fifty rows to have downloaded ten thousand. */
  var AUDIT_PAGE = 50;
  var auditWant = AUDIT_PAGE;
  var auditQuery = null;

  function subscribeAudit() {
    if (auditQuery) auditQuery.off();
    /* One extra row tells us whether there is more without a second query. */
    auditQuery = PP.ref('audit').limitToLast(auditWant + 1);
    auditQuery.on('value', function (snap) {
      AUDIT = snap.val() || {};
      if (tab === 'audit') render();
    }, function (err) { fail('reading audit', err, 'paneAudit'); });
  }

  function loadMoreAudit() {
    auditWant += AUDIT_PAGE;
    subscribeAudit();
  }

  /* The audit answers one question above the others: who is taking other
     clubs' material. So cross-club rows are marked, and a filter isolates
     them, rather than leaving you to eyeball 500 lines. */
  var auditFilter = 'all';
  var auditActor = 'all';   // filters on WHO ACTED, not on whose files were touched

  function renderAudit() {
    var rows = Object.keys(AUDIT).map(function (k) {
      var r = Object.assign({}, AUDIT[k]); r.id = k; return r;
    }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });

    if (!rows.length) {
      el('paneAudit').innerHTML = '<div class="empty-state"><div class="empty-state__title">Nothing logged yet</div>' +
        '<div class="empty-state__text">Sign-ins, uploads, downloads and removals appear here.</div></div>';
      return;
    }

    var shown = rows.filter(function (r) {
      if (auditActor !== 'all' && r.actor !== auditActor) return false;
      if (auditFilter === 'cross') return r.crossClub;
      if (auditFilter === 'downloads') return r.action === 'download' || r.action === 'download-zip';
      if (auditFilter === 'signins') return r.action === 'sign-in';
      return true;
    });

    /* Actors present in what has been fetched. Listing all 73 clubs would
       offer 60 filters that return nothing — this is about who is using the
       tool, so only those who have. */
    var actors = {};
    rows.forEach(function (r) { if (r.actor) actors[r.actor] = r.actorLabel || r.actor; });
    var actorOpts = Object.keys(actors).sort(function (a, b) {
      return String(actors[a]).localeCompare(String(actors[b]));
    });

    var more = rows.length > auditWant;

    function tab(id, label) {
      return '<button class="btn ' + (auditFilter === id ? 'btn--navy' : 'btn--ghost') + ' btn--sm"' +
        ' aria-pressed="' + (auditFilter === id ? 'true' : 'false') + '" data-af="' + id + '">' + label + '</button>';
    }

    el('paneAudit').innerHTML =
      '<div class="acc-tools">' + tab('all', 'Everything') + tab('signins', 'Sign-ins') +
        tab('downloads', 'Downloads') + tab('cross', 'Other clubs\u2019 files') +
        '<select id="auditActor" class="audit-actor" aria-label="Filter by who acted">' +
          '<option value="all">Anyone</option>' +
          actorOpts.map(function (a) {
            return '<option value="' + esc(a) + '"' + (auditActor === a ? ' selected' : '') + '>' +
              esc(actors[a]) + '</option>';
          }).join('') +
        '</select>' +
        '<span class="acc-tools__spacer"></span>' +
        '<button class="btn btn--ghost btn--sm" id="auditCsv">Export CSV</button></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>When</th><th>Who</th><th>Did what</th><th>To</th><th>Detail</th>' +
      '</tr></thead><tbody>' +
      shown.map(function (r) {
        var target = r.club
          ? (r.club === 'NL' ? 'National League' : ((BY_CODE[r.club] || {}).name || r.club))
          : '';
        return '<tr>' +
          '<td>' + esc(PP.fmt(r.ts)) + '</td>' +
          '<td>' + esc(r.actorLabel || r.actor || '—') + '</td>' +
          '<td>' + esc(ACTION_LABEL[r.action] || r.action || '') + '</td>' +
          '<td>' + esc(target) +
            (r.crossClub ? ' <span class="pill pill--soon">another club</span>' : '') + '</td>' +
          '<td>' + esc(r.detail || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (more ? '<div style="text-align:center;margin-top:14px">' +
        '<button class="btn btn--ghost" id="auditMore">Load 50 more</button></div>'
        : '<div class="form-hint" style="text-align:center;margin-top:14px">' +
          'That\u2019s everything recorded.</div>');

    Array.prototype.forEach.call(el('paneAudit').querySelectorAll('[data-af]'), function (b) {
      b.onclick = function () { auditFilter = b.getAttribute('data-af'); render(); };
    });
    el('auditActor').onchange = function () { auditActor = this.value; render(); };
    var moreBtn = el('auditMore');
    if (moreBtn) moreBtn.onclick = function () {
      moreBtn.disabled = true; moreBtn.textContent = 'Loading\u2026';
      loadMoreAudit();
    };
    el('auditCsv').onclick = function () {
      var out = [['When', 'Who', 'Action', 'Club', 'Cross-club', 'Detail']];
      shown.forEach(function (r) {
        out.push([PP.fmt(r.ts), r.actorLabel || r.actor || '', r.action || '',
                  r.club || '', r.crossClub ? 'yes' : '', r.detail || '']);
      });
      NL.download('programme-packs-audit.csv', NL.csv(out), 'text/csv');
    };
  }

  var ACTION_LABEL = {
    'sign-in': 'Signed in',
    /* No longer written — the library stopped auditing folder opens on
       04/08/2026. Kept so entries logged before then still read as words. */
    'view-club': 'Opened a folder',
    'download': 'Downloaded a file',
    'download-zip': 'Downloaded a zip',
    'upload': 'Uploaded',
    'upload-folder': 'Uploaded a folder',
    'remove': 'Removed',
    'restore': 'Restored',
    'purge': 'Deleted for good',
    'move': 'Moved files',
    'folder-create': 'Created a folder',
    'folder-rename': 'Renamed a folder',
    'folder-delete': 'Deleted a folder',
    'regen-access': 'Reissued access',
    'previews-backfill': 'Generated previews',
    'seed': 'Seeded the roster',
    'email-template': 'Edited the standard message',
    'build-emails': 'Built club emails',
    'export-access': 'Exported access CSV',
    'export-emails': 'Exported mail-merge CSV',
    'open-as': 'Opened the library as a club'
  };

  var OPTS = {};
  window.PPConsole = {
    /* opts.openClub(code): show that club's folder in the Library tab. */
    start: function (opts) { OPTS = opts || {}; start(); },
    show: function (t) { tab = t; render(); }
  };

})();
