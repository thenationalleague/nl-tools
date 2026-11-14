/* =========================================================================
   Document Library — the League's tabs (Bin and Activity)
   Version: v1.0 (14/11/2026)
   File: /document-library/_console.js

   Loaded by /document-library/ only for a League account at Access or
   Manage, after the NL Tools sign-in is confirmed. Clubs never download it.
     Bin       Manage only: removed documents, restore or delete for good
     Activity  Access and Manage: who uploaded, renamed, moved and removed
               what, and which clubs downloaded what
   Moved here from /document-library/admin/ (v1.4) when the two pages
   became one; /document-library/admin/ now forwards to the library.

     DocLibConsole.start({ manage, me, bin, activity })  → { libChanged }
     DocLibConsole.attach(lib)   the library, once DocLib.create returns
   ========================================================================= */
(function () {
  'use strict';

  var ROOT = DocLib.ROOT;
  var esc = function (s) { return NL.escHtml(s); };
  var icon = function (n) { return NL.icon(n, 'sm').outerHTML; };
  function ref(path) { return firebase.database().ref(ROOT + (path ? '/' + path : '')); }
  function TS() { return firebase.database.ServerValue.TIMESTAMP; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  var lib = null, me = null, manage = false, binPane = null, actPane = null;
  var TRASH = {}, AUDIT = [];

  function audit(action, detail) {
    ref('audit').push({ ts: TS(), actor: 'staff:' + me.uid, who: me.name || me.email || '',
      action: action, detail: String(detail || '').slice(0, 300) })
      ['catch'](function (e) { console.warn('[doclib] audit', e); });
  }

  /* ── Bin ────────────────────────────────────────────────────────────── */

  function binRows() {
    return Object.keys(TRASH).map(function (id) { return Object.assign({ id: id }, TRASH[id]); })
      .sort(function (a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); });
  }

  function renderBin() {
    if (!manage || !lib) return;
    var rows = binRows();
    if (!rows.length) {
      binPane.innerHTML = '<div class="empty-state"><div class="empty-state__title">The Bin is empty</div></div>';
      return;
    }
    var bytes = rows.reduce(function (t, r) { return t + (Number(r.size) || 0); }, 0);
    binPane.innerHTML =
      '<div class="dla-tail"><span class="dla-muted dla-count">' +
        plural(rows.length, 'document') + ', ' + esc(NL.files.humanSize(bytes)) + '</span>' +
        '<button class="btn btn--danger btn--sm" type="button" id="binEmpty">' + icon('delete') + 'Empty the Bin</button></div>' +
      '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
        '<th>Name</th><th>Was in</th><th>Removed</th><th class="dla-acts" aria-label="Actions"></th>' +
      '</tr></thead><tbody>' + rows.map(function (r) {
        var from = r.folderId && r.folderId !== DocLib.ROOT_FOLDER && lib.folderExists(r.folderId)
          ? lib.pathLabel(r.folderId) : (r.folderId && r.folderId !== DocLib.ROOT_FOLDER ? 'A folder since deleted' : 'Document Library');
        return '<tr><td>' + NL.files.kindIcon(NL.files.kind(r.contentType, r.name)) + ' ' + esc(r.name) +
          ' <span class="dla-muted">' + esc(NL.files.humanSize(r.size)) + '</span></td>' +
          '<td>' + esc(from) + '</td>' +
          '<td title="' + esc(r.deletedAt ? NL.formatDateTime(r.deletedAt) : '') + '">' +
            esc(r.deletedAt ? NL.timeAgo(r.deletedAt) : '') +
            (r.deletedBy ? ' <span class="dla-muted">by ' + esc(r.deletedBy) + '</span>' : '') + '</td>' +
          '<td class="dla-acts"><span class="dla-btns">' +
            '<button class="btn btn--ghost btn--sm" type="button" data-restore="' + esc(r.id) + '">' + icon('refresh') + 'Restore</button>' +
            '<button class="btn btn--ghost btn--sm" type="button" data-purge="' + esc(r.id) + '">' + icon('delete') + 'Delete for good</button>' +
          '</span></td></tr>';
      }).join('') + '</tbody></table></div>';

    Array.prototype.forEach.call(binPane.querySelectorAll('[data-restore]'), function (b) {
      b.onclick = function () { restore(b.getAttribute('data-restore')); };
    });
    Array.prototype.forEach.call(binPane.querySelectorAll('[data-purge]'), function (b) {
      b.onclick = function () {
        var r = TRASH[b.getAttribute('data-purge')];
        NL.confirm('Delete “' + r.name + '” for good? It cannot be brought back.',
          { title: 'Delete for good', confirmText: 'Delete', variant: 'danger' }).then(function (ok) {
          if (ok) purge([b.getAttribute('data-purge')]);
        });
      };
    });
    document.getElementById('binEmpty').onclick = function () {
      NL.confirm('Delete all ' + plural(rows.length, 'document') + ' in the Bin for good? They cannot be brought back.',
        { title: 'Empty the Bin', confirmText: 'Delete them all', variant: 'danger' }).then(function (ok) {
        if (ok) purge(rows.map(function (r) { return r.id; }));
      });
    };
  }

  /* Back where it was if that folder still exists, otherwise the top. A name
     taken there in the meantime is suffixed ("Report (2).pdf") — and the
     stored file's download name follows, so the promise holds. */
  function restore(id) {
    var r = TRASH[id];
    if (!r) return;
    var folder = r.folderId && r.folderId !== DocLib.ROOT_FOLDER && lib.folderExists(r.folderId) ? r.folderId : null;
    var name = NL.files.uniqueIn(r.name, lib.namesIn(folder));
    var rec = Object.assign({}, r);
    delete rec.id; delete rec.deletedAt; delete rec.deletedBy;
    rec.folderId = folder || DocLib.ROOT_FOLDER;
    rec.name = name;
    var meta = name === r.name ? Promise.resolve()
      : firebase.storage().ref(r.storagePath).updateMetadata({ contentDisposition: NL.files.contentDisposition(name) });
    meta.then(function () {
      var u = {};
      u['files/' + id] = rec;
      u['trash/' + id] = null;
      return ref().update(u);
    }).then(function () {
      audit('restore', name + ' → ' + (folder ? lib.pathLabel(folder) : 'Document Library'));
      NL.toast(name === r.name ? 'Restored' : 'Restored as “' + name + '”', 'success');
    })['catch'](function (e) { NL.toast('Could not restore: ' + e.message, 'error'); });
  }

  /* Bytes first, then the record: a record whose bytes are gone is worse
     than bytes whose record is gone, because the record is what shows. A
     missing object counts as deleted — it may have gone in an earlier,
     interrupted run. */
  function purge(ids) {
    var st = firebase.storage();
    function del(path) {
      if (!path) return Promise.resolve();
      return st.ref(path).delete()['catch'](function (e) {
        if (e && e.code === 'storage/object-not-found') return;
        throw e;
      });
    }
    var done = 0, failed = 0;
    ids.reduce(function (chain, id) {
      return chain.then(function () {
        var r = TRASH[id];
        if (!r) return;
        return Promise.all([del(r.storagePath), del(r.thumbPath), del(r.mediumPath)])
          .then(function () { return ref('trash/' + id).remove(); })
          .then(function () { done++; audit('purge', r.name); })
          ['catch'](function (e) { failed++; console.error('[doclib] purge', id, e); });
      });
    }, Promise.resolve()).then(function () {
      if (done) NL.toast(plural(done, 'document') + ' deleted for good', 'success');
      if (failed) NL.toast(plural(failed, 'document') + ' could not be deleted — try again', 'error');
    });
  }

  /* ── Activity ───────────────────────────────────────────────────────── */

  var ACTION = {
    upload: 'Uploaded', 'upload-folder': 'Uploaded a folder', rename: 'Renamed', move: 'Moved',
    remove: 'Removed', restore: 'Restored', purge: 'Deleted for good',
    'folder-create': 'New folder', 'folder-rename': 'Renamed folder', 'folder-delete': 'Deleted folder',
    download: 'Downloaded'
  };

  function renderActivity() {
    if (!AUDIT.length) {
      actPane.innerHTML = '<div class="empty-state"><div class="empty-state__title">Nothing has happened yet</div></div>';
      return;
    }
    actPane.innerHTML = '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
      '<th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead><tbody>' +
      AUDIT.map(function (a) {
        var club = String(a.actor || '').indexOf('club:') === 0;
        return '<tr><td title="' + esc(a.ts ? NL.formatDateTime(a.ts) : '') + '">' + esc(a.ts ? NL.timeAgo(a.ts) : '') + '</td>' +
          '<td>' + esc(a.who || (club ? a.actor.slice(5) : 'Staff')) + (club ? ' <span class="pill pill--info">Club</span>' : '') + '</td>' +
          '<td>' + esc(ACTION[a.action] || a.action || '') + '</td>' +
          '<td>' + esc(a.detail || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ── Start ──────────────────────────────────────────────────────────── */

  window.DocLibConsole = {
    start: function (opts) {
      me = opts.me || {};
      manage = !!opts.manage;
      binPane = opts.bin;
      actPane = opts.activity;
      if (manage) ref('trash').on('value', function (s) { TRASH = s.val() || {}; renderBin(); },
        function (e) { binPane.innerHTML = '<p class="dla-muted">Could not read the Bin: ' + esc(e.message) + '</p>'; });
      ref('audit').orderByChild('ts').limitToLast(200).on('value', function (s) {
        var v = s.val() || {};
        AUDIT = Object.keys(v).map(function (k) { return v[k]; })
          .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        renderActivity();
      }, function (e) { actPane.innerHTML = '<p class="dla-muted">Could not read the activity: ' + esc(e.message) + '</p>'; });
      return { libChanged: renderBin };
    },
    attach: function (l) { lib = l; renderBin(); }
  };
})();
