/*
  Document Library — the library browser, shared by both pages
  Version: v1.0 (28/10/2026) — initial build.
  File: /document-library/_library.js

  One browser, two doors:
    /document-library/        clubs, by club code — browse, preview, download
    /document-library/admin/  NL admins, by portal login — all of that, plus
                              upload, new folder, rename, move and remove

  The page decides which by passing `writable`. That flag only draws the
  controls: the boundary is the RTDB and Storage rules, which refuse every
  write that does not come from an admin portal account (see
  system/rtdb/rules.snapshot.json → app-data/ops-document-library and the
  document-library block in system/storage/rules.snapshot.rules).

  Loaded AFTER nl-utils.js — the file machinery is canon NL.files / NL.zip.

  THE NAME ON SCREEN IS THE NAME ON DISK
  --------------------------------------
  The library behaves like a folder on a computer, and the promise that makes
  that true is that a document is called the same thing everywhere: in the
  list, in the preview title, in the file a club saves, and inside a zip. So:
    · a name follows desktop rules (NL.files.cleanName) — nothing Windows
      would refuse, so the saved file keeps the name exactly;
    · no two names alike in one folder, ignoring case, files and folders
      together (NL.files.uniqueIn) — a zip of the folder would otherwise
      lose one on unpacking;
    · a rename keeps the extension (NL.files.keepExt) — it is what tells the
      computer how to open the file;
    · a rename rewrites the stored object's Content-Disposition as well as the
      record, so the raw download URL saves under the new name too.
  Bytes are stored at document-library/files/<fileId>.<ext>, keyed on the id
  and never on the name or folder, so renaming and moving never re-upload.

  Storage (RTDB app-data/ops-document-library/):
    folders/<id>  { name, parentId?, createdAt }
    files/<id>    { name, folderId, size, contentType, storagePath, url,
                    uploadedAt, thumbUrl?, thumbPath?, mediumUrl?, mediumPath?,
                    previewsAt? }      folderId '_root' = loose at the top
    trash/<id>    { ...file, deletedAt, deletedBy }   admin only
    audit/<id>    { ts, actor, who, action, detail }  admins write anything;
                                                      a club writes only its
                                                      own 'download' lines
*/
(function () {
  'use strict';

  var ROOT = 'app-data/ops-document-library';
  var STORE = 'document-library';
  var ROOT_FOLDER = '_root';
  var MAX_DEPTH = 6;
  var MAX_BYTES = 100 * 1024 * 1024;      // must match the Storage rule
  var ZIP_WARN_BYTES = 300 * 1024 * 1024;
  var VIEW_KEY = 'nl-doclib-view';

  var esc = function (s) { return NL.escHtml(s); };

  function iconHtml(name) {
    return '<svg class="icon icon--sm" aria-hidden="true">' +
      '<use href="/assets/icons/sprites.svg#icon-' + name + '"></use></svg>';
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function readView() {
    try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'; }
    catch (e) { return 'list'; }
  }
  function saveView(v) { try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* private window */ } }

  /* ===================================================================
     create(opts) → a mounted library
       mount     element to render into
       db        firebase.database() for the signed-in session
       storage   firebase.storage() — needed only when writable
       writable  draw the management controls
       actor     'staff:<uid>' | 'club:<KEY>' — the audit trail's key
       who       the name to show in the activity log
       logDownloads  write a 'download' line for each download (clubs)
       onChange  called after every render — the console's Bin uses it to
                 name folders once they have loaded
     =================================================================== */
  function create(opts) {
    var mount = opts.mount;
    var db = opts.db;
    var storage = opts.storage || null;
    var writable = !!opts.writable;

    var FOLDERS = {}, FILES = {};
    var seen = { folders: false, files: false };
    var view = { folderId: null, mode: readView(), sort: 'name', dir: 1, q: '' };
    var sel = {}, selDir = {};
    var ctxMenu = null;
    var uploadsEl = null;
    var queue = NL.files.queue(4);
    /* Names claimed by uploads still in flight, per folder. FILES only learns
       about a file when its record lands, so two files of the same name in
       one drop would otherwise both claim it. */
    var pending = {};

    function ref(path) { return db.ref(ROOT + (path ? '/' + path : '')); }
    function TS() { return firebase.database.ServerValue.TIMESTAMP; }

    function audit(action, detail) {
      if (!opts.actor) return;
      ref('audit').push({ ts: TS(), actor: opts.actor, who: opts.who || '',
        action: action, detail: String(detail || '').slice(0, 300) })
        ['catch'](function (e) { console.warn('[doclib] audit', e); });
    }

    /* ── The tree ─────────────────────────────────────────────────────── */

    function folderList() {
      return Object.keys(FOLDERS).map(function (id) {
        return Object.assign({ id: id }, FOLDERS[id]);
      });
    }
    function folderById(id) {
      return id && FOLDERS[id] ? Object.assign({ id: id }, FOLDERS[id]) : null;
    }
    function byName(a, b) {
      return String(a.name).localeCompare(String(b.name), 'en', { numeric: true, sensitivity: 'base' });
    }
    function childrenOf(id) {
      return folderList().filter(function (f) { return (f.parentId || null) === (id || null); })
        .sort(byName);
    }
    function filesIn(id) {
      var key = id || ROOT_FOLDER;
      return Object.keys(FILES).map(function (fid) { return Object.assign({ id: fid }, FILES[fid]); })
        .filter(function (f) {
          /* A record whose folder has gone (deleted under it in another tab)
             shows at the top rather than vanishing. */
          var fo = f.folderId || ROOT_FOLDER;
          if (fo !== ROOT_FOLDER && !FOLDERS[fo]) fo = ROOT_FOLDER;
          return fo === key;
        });
    }
    /* Ancestors, root first, excluding the root itself. */
    function trail(id) {
      var out = [], guard = 0, f = folderById(id);
      while (f && guard++ < 20) { out.unshift(f); f = folderById(f.parentId); }
      return out;
    }
    function pathLabel(id) {
      var t = trail(id);
      return t.length ? t.map(function (f) { return f.name; }).join(' › ') : 'Document Library';
    }
    function subtree(id) {
      var out = [id];
      childrenOf(id).forEach(function (c) { out = out.concat(subtree(c.id)); });
      return out;
    }
    function height(id) {
      var kids = childrenOf(id);
      return kids.length ? 1 + Math.max.apply(null, kids.map(function (c) { return height(c.id); })) : 1;
    }
    /* Everything at or below a folder, as [{ file, path }] where path is the
       folder prefix inside a zip — the folder names exactly as shown. */
    function collect(id, prefix) {
      var out = filesIn(id).map(function (f) { return { file: f, path: prefix }; });
      childrenOf(id).forEach(function (c) { out = out.concat(collect(c.id, prefix + c.name + '/')); });
      return out;
    }
    function bytesOf(list) {
      return list.reduce(function (t, e) { return t + (Number(e.file.size) || 0); }, 0);
    }
    /* Every name already used in a folder, files and folders together — on a
       desktop a file and a folder cannot share a name either. */
    function namesIn(id, exceptId) {
      var names = childrenOf(id).filter(function (f) { return f.id !== exceptId; })
        .map(function (f) { return f.name; });
      filesIn(id).forEach(function (f) { if (f.id !== exceptId) names.push(f.name); });
      return names.concat(pending[id || ROOT_FOLDER] || []);
    }
    function clash(name, id, exceptId) {
      var lower = String(name).toLowerCase();
      return namesIn(id, exceptId).some(function (n) { return String(n).toLowerCase() === lower; });
    }

    /* ── Navigation ───────────────────────────────────────────────────── */

    function readHash() {
      var m = /^#\/?([^&]*)/.exec(location.hash || '');
      var id = m ? decodeURIComponent(m[1]) : '';
      return id || null;
    }
    /* navigate() owns the view. Nothing else assigns view.folderId — the
       Programme Packs page learned that a folder-create that did so quietly
       left the hash and the breadcrumb disagreeing with where you were. */
    function navigate(id) {
      sel = {}; selDir = {};
      view.q = '';
      var hash = id ? '#/' + encodeURIComponent(id) : '#/';
      if (location.hash !== hash) location.hash = hash;
      else { view.folderId = id; render(); }
    }
    function onHash() {
      var id = readHash();
      if (id && seen.folders && !FOLDERS[id]) id = null;   // a folder that has gone
      view.folderId = id;
      sel = {}; selDir = {};
      render();
    }
    window.addEventListener('hashchange', onHash);

    /* ── Data ─────────────────────────────────────────────────────────── */

    function readFail(what, e) {
      console.error('[doclib] read ' + what, e);
      mount.innerHTML = '<div class="empty-state"><div class="empty-state__title">' +
        'The library couldn’t be opened</div><div class="empty-state__text">' +
        esc((e && e.message) || what) + '</div></div>';
    }
    ref('folders').on('value', function (s) {
      FOLDERS = s.val() || {}; seen.folders = true;
      if (view.folderId && !FOLDERS[view.folderId]) view.folderId = null;
      render();
    }, function (e) { readFail('folders', e); });
    ref('files').on('value', function (s) {
      FILES = s.val() || {}; seen.files = true;
      Object.keys(sel).forEach(function (id) { if (!FILES[id]) delete sel[id]; });
      render();
    }, function (e) { readFail('files', e); });
    view.folderId = readHash();

    /* ── Render ───────────────────────────────────────────────────────── */

    function render() {
      if (!seen.folders || !seen.files) {
        mount.innerHTML = '<div class="dl-loading"><span class="spinner"></span></div>';
        return;
      }
      closeMenu();
      var here = view.folderId;
      var searching = !!view.q.trim();
      var html = bar(here, searching);

      html += '<div class="fold">' + head(here, searching) + '<div class="fold__body">';
      if (writable && !searching) {
        html += '<div class="drop" data-drop>Drop files or folders here, or ' +
          '<button class="dl-link" type="button" data-act="upload">choose files</button>' +
          '<div class="drop__hint">Up to ' + NL.files.humanSize(MAX_BYTES) + ' each</div></div>';
      }
      html += '<div data-uploads></div>';

      var folders = searching ? searchFolders() : childrenOf(here);
      var files = searching ? searchFiles() : filesIn(here);
      folders = sortList(folders, true);
      files = sortList(files, false);

      html += selBar(folders, files);
      if (!folders.length && !files.length) {
        html += '<div class="empty-state"><div class="empty-state__icon">' +
          (searching ? '🔎' : '📂') + '</div><div class="empty-state__title">' +
          (searching ? 'Nothing matches “' + esc(view.q.trim()) + '”'
                     : 'This folder is empty') + '</div></div>';
      } else if (view.mode === 'grid') {
        html += gridHtml(folders, files, searching);
      } else {
        html += listHtml(folders, files, searching);
      }
      html += '</div></div>';

      /* Keep the in-flight progress rows across a re-render: an upload landing
         re-renders the page, and its siblings' bars must not vanish. */
      var keep = uploadsEl ? Array.prototype.slice.call(uploadsEl.childNodes) : [];
      mount.innerHTML = html;
      uploadsEl = mount.querySelector('[data-uploads]');
      keep.forEach(function (n) { uploadsEl.appendChild(n); });
      wire();
      if (opts.onChange) opts.onChange();
      var q = mount.querySelector('[data-q]');
      if (q && searching && document.activeElement !== q) {
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      }
    }

    function bar(here, searching) {
      var crumbs = '<nav class="crumb" aria-label="Folder path">';
      var path = trail(here);
      if (searching) {
        crumbs += '<span class="crumb__here">Search results</span>';
      } else if (!path.length) {
        crumbs += '<span class="crumb__here">Document Library</span>';
      } else {
        crumbs += '<button class="crumb__link" type="button" data-crumb="">Document Library</button>';
        path.forEach(function (f, i) {
          crumbs += '<span class="crumb__sep">›</span>';
          crumbs += i === path.length - 1
            ? '<span class="crumb__here">' + esc(f.name) + '</span>'
            : '<button class="crumb__link" type="button" data-crumb="' + esc(f.id) + '">' + esc(f.name) + '</button>';
        });
      }
      crumbs += '</nav>';
      return '<div class="dl-bar">' + crumbs +
        '<div class="dl-bar__tools">' +
          '<input class="toolbar__search dl-search" type="search" data-q placeholder="Search all documents" ' +
            'aria-label="Search all documents" value="' + esc(view.q) + '">' +
          '<div class="chip-group" role="group" aria-label="View">' +
            '<button type="button" class="chip' + (view.mode === 'list' ? ' active' : '') + '" data-mode="list" aria-pressed="' + (view.mode === 'list') + '">List</button>' +
            '<button type="button" class="chip' + (view.mode === 'grid' ? ' active' : '') + '" data-mode="grid" aria-pressed="' + (view.mode === 'grid') + '">Thumbnails</button>' +
          '</div>' +
        '</div></div>';
    }

    function head(here, searching) {
      var f = folderById(here);
      var name = searching ? 'Search results' : (f ? f.name : 'Document Library');
      var acts = '';
      if (writable && !searching) {
        acts += '<button class="btn btn--ghost btn--sm" type="button" data-act="newFolder">' + iconHtml('add') + ' New folder</button>';
        acts += '<button class="btn btn--ghost btn--sm" type="button" data-act="upload">' + iconHtml('upload') + ' Upload files</button>';
        acts += '<button class="btn btn--ghost btn--sm" type="button" data-act="uploadDir">Upload a folder</button>';
        if (f) {
          acts += '<button class="btn btn--ghost btn--sm" type="button" data-act="renameHere">Rename</button>';
          acts += '<button class="btn btn--ghost btn--sm" type="button" data-act="deleteHere">Delete</button>';
        }
      }
      var tail = '';
      if (!searching) {
        var n = collect(here, '').length;
        tail = '<div class="fold__tail"><span class="fold__note">' + plural(n, 'document') + '</span>' +
          (n ? '<button class="btn btn--primary btn--sm" type="button" data-act="zipHere">' +
            iconHtml('download') + ' Download ' + (f ? 'folder' : 'everything') + '</button>' : '') +
          '</div>';
      }
      return '<div class="fold__head"><span class="fold__icon" aria-hidden="true">' +
        (searching ? '🔎' : (f ? '📁' : '📚')) + '</span>' +
        '<h2 class="fold__name">' + esc(name) + '</h2>' +
        (acts ? '<div class="fold__acts">' + acts + '</div>' : '') + tail + '</div>';
    }

    function selBar(folders, files) {
      var nf = files.filter(function (f) { return sel[f.id]; }).length;
      var nd = folders.filter(function (f) { return selDir[f.id]; }).length;
      if (!nf && !nd) return '';
      var all = nf + nd === files.length + folders.length;
      var parts = [];
      if (nd) parts.push(plural(nd, 'folder'));
      if (nf) parts.push(plural(nf, 'file'));
      return '<div class="sel-bar">' +
        '<label class="sel-bar__all"><input type="checkbox" data-selall' + (all ? ' checked' : '') + '> All</label>' +
        '<span class="sel-bar__count">' + esc(parts.join(', ')) + '</span>' +
        '<button class="btn btn--primary btn--sm" type="button" data-act="zipSel">' + iconHtml('download') + ' Download</button>' +
        (writable ? '<button class="btn btn--ghost btn--sm" type="button" data-act="moveSel">Move</button>' : '') +
        (writable && nf && !nd ? '<button class="btn btn--ghost btn--sm" type="button" data-act="removeSel">Remove</button>' : '') +
        '<span class="sel-bar__spacer"></span>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-act="clearSel">Clear</button>' +
      '</div>';
    }

    /* ── Search ───────────────────────────────────────────────────────── */
    /* Across the whole library, not the folder you are in: a club looking for
       "ground grading" does not know which folder the League filed it in. */
    function matches(name) {
      var words = view.q.trim().toLowerCase().split(/\s+/);
      var n = String(name).toLowerCase();
      return words.every(function (w) { return n.indexOf(w) !== -1; });
    }
    function searchFolders() { return folderList().filter(function (f) { return matches(f.name); }); }
    function searchFiles() {
      return Object.keys(FILES).map(function (id) { return Object.assign({ id: id }, FILES[id]); })
        .filter(function (f) { return matches(f.name); });
    }

    /* ── Sorting ──────────────────────────────────────────────────────── */
    /* Folders first, the way every desktop lists them. Folders have no size,
       so they always sort by name whichever column is chosen. */
    function sortList(list, isFolder) {
      var key = view.sort, dir = view.dir;
      return list.slice().sort(function (a, b) {
        if (!isFolder && key === 'size') return dir * ((Number(a.size) || 0) - (Number(b.size) || 0)) || byName(a, b);
        if (!isFolder && key === 'added') return dir * ((a.uploadedAt || 0) - (b.uploadedAt || 0)) || byName(a, b);
        return (key === 'name' ? dir : 1) * byName(a, b);
      });
    }

    /* ── Grid ─────────────────────────────────────────────────────────── */

    function folderMeta(id) {
      var n = collect(id, '').length;
      return n ? plural(n, 'document') : 'Empty';
    }

    function gridHtml(folders, files, searching) {
      var html = '';
      if (folders.length) {
        html += '<div class="folders">' + folders.map(function (f) {
          var empty = !collect(f.id, '').length;
          return '<div class="folder' + (empty ? ' is-empty' : '') + (selDir[f.id] ? ' is-picked' : '') +
            '" role="button" tabindex="0" data-open="' + esc(f.id) + '">' +
            '<input type="checkbox" class="folder__check" data-pickdir="' + esc(f.id) + '"' +
              (selDir[f.id] ? ' checked' : '') + ' aria-label="Select ' + esc(f.name) + '">' +
            '<span class="folder__icon" aria-hidden="true">📁</span>' +
            '<span class="folder__id"><span class="folder__name">' + esc(f.name) + '</span>' +
            '<span class="folder__meta">' + esc(searching ? pathLabel(f.parentId) : folderMeta(f.id)) + '</span></span>' +
            '<button class="folder__more" type="button" data-menudir="' + esc(f.id) + '" aria-label="More for ' + esc(f.name) + '">⋯</button>' +
          '</div>';
        }).join('') + '</div>';
      }
      if (files.length) {
        html += '<div class="tiles">' + files.map(function (f) { return tileHtml(f, searching); }).join('') + '</div>';
      }
      return html;
    }

    function artHtml(f) {
      var kind = NL.files.kind(f.contentType, f.name);
      var src = f.thumbUrl || (kind === 'image' && NL.files.previews.renderable(f.contentType) ? f.url : '');
      return src
        ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">'
        : '<span class="tile__icon" aria-hidden="true">' + NL.files.kindIcon(kind) + '</span>';
    }

    function tileHtml(f, searching) {
      return '<div class="tile' + (sel[f.id] ? ' is-picked' : '') + '" tabindex="0" data-file="' + esc(f.id) + '"' +
        ' title="' + esc(f.name) + '">' +
        '<input type="checkbox" class="tile__check" data-pick="' + esc(f.id) + '"' +
          (sel[f.id] ? ' checked' : '') + ' aria-label="Select ' + esc(f.name) + '">' +
        '<div class="tile__art">' + artHtml(f) + '</div>' +
        '<div class="tile__body"><div class="tile__name">' + esc(f.name) + '</div>' +
        (searching ? '<div class="dl-where">' + esc(pathLabel(f.folderId)) + '</div>' : '') +
        '<div class="tile__acts"><span class="tile__size">' + esc(NL.files.humanSize(f.size)) + '</span>' +
          (canPreview(f) ? '<button class="tile__act" type="button" data-prev="' + esc(f.id) + '" aria-label="Preview ' + esc(f.name) + '">' + iconHtml('eye') + '</button>' : '') +
          '<button class="tile__act" type="button" data-dl="' + esc(f.id) + '" aria-label="Download ' + esc(f.name) + '">' + iconHtml('download') + '</button>' +
          '<button class="tile__act" type="button" data-menu="' + esc(f.id) + '" aria-label="More for ' + esc(f.name) + '">⋯</button>' +
        '</div></div></div>';
    }

    /* ── List ─────────────────────────────────────────────────────────── */

    function sortHead(key, label, cls) {
      var on = view.sort === key;
      var arrow = on ? (view.dir > 0 ? ' ▲' : ' ▼') : '';
      return '<th class="' + (cls || '') + '" aria-sort="' + (on ? (view.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" class="dl-sort" data-sort="' + key + '">' + label + arrow + '</button></th>';
    }

    function listHtml(folders, files, searching) {
      var rows = folders.map(function (f) {
        return '<tr class="dl-row dl-row--dir' + (selDir[f.id] ? ' is-picked' : '') + '" data-open="' + esc(f.id) + '" tabindex="0">' +
          '<td class="dl-col-check"><input type="checkbox" data-pickdir="' + esc(f.id) + '"' + (selDir[f.id] ? ' checked' : '') +
            ' aria-label="Select ' + esc(f.name) + '"></td>' +
          '<td><span class="dl-name"><span class="dl-name__icon" aria-hidden="true">📁</span>' +
            '<span class="dl-name__text">' + esc(f.name) + '</span></span>' +
            '<div class="dl-sub">' + esc(folderMeta(f.id)) + '</div>' +
            (searching ? '<div class="dl-where">' + esc(pathLabel(f.parentId)) + '</div>' : '') + '</td>' +
          '<td class="dl-col-size">' + esc(folderMeta(f.id)) + '</td>' +
          '<td class="dl-col-date">' + esc(f.createdAt ? NL.formatDateShort(f.createdAt) : '') + '</td>' +
          '<td class="dl-col-acts"><button class="tile__act" type="button" data-menudir="' + esc(f.id) + '" aria-label="More for ' + esc(f.name) + '">⋯</button></td>' +
        '</tr>';
      }).concat(files.map(function (f) {
        var kind = NL.files.kind(f.contentType, f.name);
        return '<tr class="dl-row' + (sel[f.id] ? ' is-picked' : '') + '" data-file="' + esc(f.id) + '" tabindex="0">' +
          '<td class="dl-col-check"><input type="checkbox" data-pick="' + esc(f.id) + '"' + (sel[f.id] ? ' checked' : '') +
            ' aria-label="Select ' + esc(f.name) + '"></td>' +
          '<td><span class="dl-name"><span class="dl-name__icon" aria-hidden="true">' + NL.files.kindIcon(kind) + '</span>' +
            '<span class="dl-name__text">' + esc(f.name) + '</span></span>' +
            '<div class="dl-sub">' + esc(NL.files.humanSize(f.size) +
              (f.uploadedAt ? ' \u00b7 ' + NL.formatDateShort(f.uploadedAt) : '')) + '</div>' +
            (searching ? '<div class="dl-where">' + esc(pathLabel(f.folderId)) + '</div>' : '') + '</td>' +
          '<td class="dl-col-size">' + esc(NL.files.humanSize(f.size)) + '</td>' +
          '<td class="dl-col-date">' + esc(f.uploadedAt ? NL.formatDateShort(f.uploadedAt) : '') + '</td>' +
          '<td class="dl-col-acts">' +
            (canPreview(f) ? '<button class="tile__act" type="button" data-prev="' + esc(f.id) + '" aria-label="Preview ' + esc(f.name) + '">' + iconHtml('eye') + '</button>' : '') +
            '<button class="tile__act" type="button" data-dl="' + esc(f.id) + '" aria-label="Download ' + esc(f.name) + '">' + iconHtml('download') + '</button>' +
            '<button class="tile__act" type="button" data-menu="' + esc(f.id) + '" aria-label="More for ' + esc(f.name) + '">⋯</button>' +
          '</td></tr>';
      }));
      return '<div class="table-wrap"><table class="table table--compact dl-table"><thead><tr>' +
        '<th class="dl-col-check" aria-label="Select"></th>' +
        sortHead('name', 'Name') + sortHead('size', 'Size', 'dl-col-size') +
        sortHead('added', 'Added', 'dl-col-date') +
        '<th class="dl-col-acts" aria-label="Actions"></th>' +
        '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }

    /* ── Wiring ───────────────────────────────────────────────────────── */

    function each(selector, fn) {
      Array.prototype.forEach.call(mount.querySelectorAll(selector), fn);
    }

    function wire() {
      each('[data-crumb]', function (b) {
        b.onclick = function () { navigate(b.getAttribute('data-crumb') || null); };
      });
      each('[data-mode]', function (b) {
        b.onclick = function () { view.mode = b.getAttribute('data-mode'); saveView(view.mode); render(); };
      });
      each('[data-sort]', function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-sort');
          if (view.sort === k) view.dir = -view.dir;
          else { view.sort = k; view.dir = k === 'name' ? 1 : -1; }   // newest/biggest first
          render();
        };
      });
      var q = mount.querySelector('[data-q]');
      if (q) {
        q.oninput = function () { view.q = q.value; sel = {}; selDir = {}; render(); };
        q.onkeydown = function (e) { if (e.key === 'Escape') { view.q = ''; render(); } };
      }
      /* Opening: a click on a folder opens it; a click on a file previews it
         if it can be previewed and downloads it if not — what a double-click
         does on a desktop, in one click, because a web page has no
         double-click convention anybody relies on. Selection is the tick. */
      each('[data-open]', function (row) {
        row.onclick = function (e) {
          if (e.target.closest('input,button')) return;
          navigate(row.getAttribute('data-open'));
        };
        row.onkeydown = function (e) {
          if (e.target !== row) return;
          if (e.key === 'Enter') navigate(row.getAttribute('data-open'));
        };
        row.oncontextmenu = function (e) { e.preventDefault(); folderMenu(row.getAttribute('data-open'), e); };
      });
      each('[data-file]', function (row) {
        var id = row.getAttribute('data-file');
        row.onclick = function (e) {
          if (e.target.closest('input,button')) return;
          openFile(id);
        };
        row.onkeydown = function (e) {
          if (e.target !== row) return;
          if (e.key === 'Enter') openFile(id);
        };
        row.oncontextmenu = function (e) { e.preventDefault(); fileMenu(id, e); };
      });
      each('[data-prev]', function (b) { b.onclick = function () { preview(b.getAttribute('data-prev')); }; });
      each('[data-dl]', function (b) { b.onclick = function () { downloadFile(b.getAttribute('data-dl')); }; });
      each('[data-menu]', function (b) {
        b.onclick = function (e) { e.stopPropagation(); fileMenu(b.getAttribute('data-menu'), b); };
      });
      each('[data-menudir]', function (b) {
        b.onclick = function (e) { e.stopPropagation(); folderMenu(b.getAttribute('data-menudir'), b); };
      });
      each('[data-pick]', function (c) {
        c.onclick = function (e) { e.stopPropagation(); };
        c.onchange = function () {
          var id = c.getAttribute('data-pick');
          if (c.checked) sel[id] = true; else delete sel[id];
          render();
        };
      });
      each('[data-pickdir]', function (c) {
        c.onclick = function (e) { e.stopPropagation(); };
        c.onchange = function () {
          var id = c.getAttribute('data-pickdir');
          if (c.checked) selDir[id] = true; else delete selDir[id];
          render();
        };
      });
      var all = mount.querySelector('[data-selall]');
      if (all) all.onchange = function () {
        sel = {}; selDir = {};
        if (all.checked) {
          var searching = !!view.q.trim();
          (searching ? searchFiles() : filesIn(view.folderId)).forEach(function (f) { sel[f.id] = true; });
          (searching ? searchFolders() : childrenOf(view.folderId)).forEach(function (f) { selDir[f.id] = true; });
        }
        render();
      };
      each('[data-act]', function (b) {
        b.onclick = function () { act(b.getAttribute('data-act')); };
      });
      if (writable) wireDrop();
    }

    function act(name) {
      var here = view.folderId;
      switch (name) {
        case 'upload': pickFiles(here, false); break;
        case 'uploadDir': pickFiles(here, true); break;
        case 'newFolder': newFolder(here); break;
        case 'renameHere': renameFolder(here); break;
        case 'deleteHere': deleteFolder(here); break;
        case 'zipHere': zipFolder(here); break;
        case 'zipSel': zipSelection(); break;
        case 'moveSel': moveItems(pickedFiles(), pickedDirs()); break;
        case 'removeSel': removeFiles(pickedFiles()); break;
        case 'clearSel': sel = {}; selDir = {}; render(); break;
      }
    }

    function pickedFiles() {
      return Object.keys(sel).filter(function (id) { return FILES[id]; })
        .map(function (id) { return Object.assign({ id: id }, FILES[id]); });
    }
    function pickedDirs() {
      return Object.keys(selDir).filter(function (id) { return FOLDERS[id]; })
        .map(function (id) { return folderById(id); });
    }

    /* ── Menus ────────────────────────────────────────────────────────── */
    /* Opened by the ⋯ button as well as right-click: right-click alone is
       undiscoverable and does not exist on a touchscreen. */
    function closeMenu() {
      if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }
    function openMenu(items, at) {
      closeMenu();
      var m = document.createElement('div');
      m.className = 'ctx';
      m.setAttribute('role', 'menu');
      m.innerHTML = items.map(function (it, i) {
        return '<button class="ctx__item' + (it.danger ? ' ctx__item--danger' : '') + '" type="button" role="menuitem" data-i="' + i + '"' +
          (it.disabled ? ' disabled title="' + esc(it.disabled) + '"' : '') + '>' + esc(it.label) + '</button>';
      }).join('');
      document.body.appendChild(m);
      var x, y;
      if (at && at.getBoundingClientRect) {
        var r = at.getBoundingClientRect();
        x = r.right - m.offsetWidth; y = r.bottom + 4;
      } else { x = at.clientX; y = at.clientY; }
      x = Math.max(8, Math.min(x, window.innerWidth - m.offsetWidth - 8));
      y = Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 8));
      m.style.left = x + 'px';
      m.style.top = y + 'px';
      Array.prototype.forEach.call(m.querySelectorAll('[data-i]'), function (b) {
        b.onclick = function () { closeMenu(); items[+b.getAttribute('data-i')].run(); };
      });
      var first = m.querySelector('button:not([disabled])');
      if (first) first.focus();
      m.onkeydown = function (e) { if (e.key === 'Escape') closeMenu(); };
      ctxMenu = m;
    }
    document.addEventListener('click', function (e) {
      if (ctxMenu && !ctxMenu.contains(e.target)) closeMenu();
    });
    window.addEventListener('scroll', closeMenu, true);

    function fileMenu(id, at) {
      var f = FILES[id] && Object.assign({ id: id }, FILES[id]);
      if (!f) return;
      var items = [];
      if (canPreview(f)) items.push({ label: 'Preview', run: function () { preview(id); } });
      items.push({ label: 'Download', run: function () { downloadFile(id); } });
      if (view.q.trim()) {
        items.push({ label: 'Show in folder', run: function () {
          view.q = ''; navigate(f.folderId === ROOT_FOLDER ? null : f.folderId);
        } });
      }
      if (writable) {
        items.push({ label: 'Rename', run: function () { renameFile(id); } });
        items.push({ label: 'Move', run: function () { moveItems([f], []); } });
        items.push({ label: 'Remove', danger: true, run: function () { removeFiles([f]); } });
      }
      openMenu(items, at);
    }

    function folderMenu(id, at) {
      var f = folderById(id);
      if (!f) return;
      var n = collect(id, '').length;
      var items = [
        { label: 'Open', run: function () { navigate(id); } },
        { label: 'Download as zip', disabled: n ? '' : 'Nothing in it yet', run: function () { zipFolder(id); } }
      ];
      if (writable) {
        items.push({ label: 'Rename', run: function () { renameFolder(id); } });
        items.push({ label: 'Move', run: function () { moveItems([], [f]); } });
        items.push({ label: 'Delete', danger: true,
          disabled: n ? 'Still holds ' + plural(n, 'document') : '',
          run: function () { deleteFolder(id); } });
      }
      openMenu(items, at);
    }

    /* ── Preview ──────────────────────────────────────────────────────── */
    /* What can be shown without anyone else involved: images, PDFs, video and
       audio are the browser's own; Word renders in this tab through canon
       NL.files.renderDocx. Excel and PowerPoint download — previewing them
       would mean handing the file's URL to Microsoft or Google (a decision,
       28/10/2026: nothing leaves our storage). */
    function canPreview(f) {
      var kind = NL.files.kind(f.contentType, f.name);
      if (!f.url) return false;
      if (kind === 'pdf' || kind === 'video' || kind === 'audio') return true;
      if (kind === 'doc') return NL.files.isDocx(f);
      return kind === 'image' && !!(f.mediumUrl || NL.files.previews.renderable(f.contentType));
    }

    function openFile(id) {
      var f = FILES[id] && Object.assign({ id: id }, FILES[id]);
      if (!f) return;
      if (canPreview(f)) preview(id); else downloadFile(id);
    }

    function preview(id) {
      var f = FILES[id] && Object.assign({ id: id }, FILES[id]);
      if (!f || !canPreview(f)) return;
      var kind = NL.files.kind(f.contentType, f.name);
      var body, surface = ' prev--doc';
      if (kind === 'image') {
        body = '<img src="' + esc(f.mediumUrl || f.url) + '" alt="' + esc(f.name) + '" class="prev__img">';
        surface = '';
      } else if (kind === 'video') {
        body = '<video class="prev__video" controls preload="metadata" src="' + esc(f.url) + '"></video>';
        surface = '';
      } else if (kind === 'audio') {
        body = '<audio class="prev__audio" controls preload="metadata" src="' + esc(f.url) + '"></audio>';
      } else if (kind === 'doc') {
        body = '<div class="prev__docx" data-docx>Preparing the document…</div>';
      } else {
        /* The fragment strips Chrome's and Edge's reader furniture, which
           otherwise reads as a print dialog. A fragment, not a param: the
           download URL already carries a query string. */
        body = '<iframe src="' + esc(f.url) + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH"' +
          ' class="prev__frame" title="' + esc(f.name) + '"></iframe>';
      }
      var m = NL.modal({
        title: f.name,
        width: 'wide',
        body: '<div class="prev' + surface + '">' + body + '</div>',
        buttons: [
          { label: 'Close', className: 'btn--ghost', onClick: function (c) { c.close(); } },
          { label: 'Download', className: 'btn--primary', autofocus: true, onClick: function () { downloadFile(id); } }
        ]
      });
      if (kind === 'doc') {
        var host = (m && m.el && m.el.querySelector('[data-docx]')) || document.querySelector('[data-docx]');
        NL.files.renderDocx(f.url, host)['catch'](function () {
          if (host && document.body.contains(host)) {
            host.textContent = 'This document couldn’t be previewed here — Download opens it in Word.';
          }
        });
      }
    }

    /* ── Download ─────────────────────────────────────────────────────── */

    function downloadFile(id) {
      var f = FILES[id];
      if (!f || !f.url) return;
      if (opts.logDownloads) audit('download', f.name);
      NL.files.save(f.url, f.name, f.contentType);
    }

    function zipFolder(id) {
      var f = folderById(id);
      zipFrom(collect(id, ''), f ? f.name : 'Document Library');
    }

    /* A ticked folder brings everything under it, filed under its own name,
       the way dragging a folder off a desktop does. One ticked file and
       nothing else is that file, not a zip holding it. */
    function zipSelection() {
      var files = pickedFiles(), dirs = pickedDirs();
      if (files.length === 1 && !dirs.length) { downloadFile(files[0].id); return; }
      var list = files.map(function (f) { return { file: f, path: '' }; });
      dirs.forEach(function (d) { list = list.concat(collect(d.id, d.name + '/')); });
      var here = folderById(view.folderId);
      zipFrom(list, (here ? here.name : 'Document Library') + ' (selection)');
    }

    function zipFrom(list, label) {
      if (!list.length) { NL.toast('Nothing to download', 'info'); return; }
      var bytes = bytesOf(list);
      var go = bytes < ZIP_WARN_BYTES ? Promise.resolve(true) : NL.confirm(
        'That’s ' + NL.files.humanSize(bytes) + ' across ' + plural(list.length, 'file') +
        '. It downloads to this tab before the zip is built, which takes a while. Carry on?',
        { title: 'Large download', confirmText: 'Download' });

      go.then(function (ok) {
        if (!ok) return;
        NL.toast('Preparing ' + plural(list.length, 'file') + '…', 'info');
        var taken = {}, entries = [];
        /* One at a time: sixty concurrent Storage reads invites throttling,
           and the wait is bytes, not round trips. */
        return list.reduce(function (p, item) {
          return p.then(function () {
            return fetch(item.file.url).then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching ' + item.file.name);
              return r.arrayBuffer();
            }).then(function (buf) {
              /* The names exactly as shown — that is the promise. uniqueName is
                 a backstop for records written before the uniqueness rule. */
              entries.push({ name: NL.zip.uniqueName(item.path + item.file.name, taken),
                data: new Uint8Array(buf), date: item.file.uploadedAt });
            });
          });
        }, Promise.resolve()).then(function () {
          NL.download(label + '.zip', NL.zip.build(entries), 'application/zip');
          NL.toast('Downloaded ' + plural(entries.length, 'file'), 'success');
          if (opts.logDownloads) audit('download', label + ' (' + plural(entries.length, 'file') + ')');
        });
      })['catch'](function (e) {
        console.error('[doclib] zip', e);
        NL.alert(e instanceof TypeError
          ? 'Downloading several files at once is blocked by a storage setting. Single files still ' +
            'download. Please tell the National League.'
          : 'Could not build the download: ' + (e.message || e), { title: 'Download failed' });
      });
    }

    /* =================================================================
       Management — drawn only when writable. The rules are what refuse a
       club; these functions are never reached from the club page.
       ================================================================= */

    function askName(title, current, label) {
      return NL.prompt(label || 'Name', { title: title, default: current || '' });
    }

    function newFolder(parentId) {
      if (trail(parentId).length >= MAX_DEPTH) {
        NL.alert('Folders go ' + MAX_DEPTH + ' levels deep at most.', { title: 'Too deep' });
        return;
      }
      var inside = folderById(parentId);
      askName(inside ? 'New folder in ' + inside.name : 'New folder', '', 'Folder name').then(function (raw) {
        if (raw == null) return;
        var c = NL.files.cleanName(raw);
        if (!c.ok) { NL.toast(c.error, 'error'); return; }
        if (clash(c.name, parentId)) { NL.toast('There’s already something called “' + c.name + '” here', 'error'); return; }
        var rec = { name: c.name, createdAt: TS() };
        if (parentId) rec.parentId = parentId;
        /* Does not open the new folder: making a folder is not opening it,
           here or on a desktop. */
        return ref('folders').push(rec).then(function () {
          audit('folder-create', (inside ? pathLabel(parentId) + ' › ' : '') + c.name);
          NL.toast('Folder added', 'success');
        });
      })['catch'](function (e) { NL.toast('Could not add the folder: ' + e.message, 'error'); });
    }

    function renameFolder(id) {
      var f = folderById(id);
      if (!f) return;
      askName('Rename folder', f.name, 'Folder name').then(function (raw) {
        if (raw == null) return;
        var c = NL.files.cleanName(raw);
        if (!c.ok) { NL.toast(c.error, 'error'); return; }
        if (c.name === f.name) return;
        if (clash(c.name, f.parentId || null, id)) {
          NL.toast('There’s already something called “' + c.name + '” here', 'error'); return;
        }
        return ref('folders/' + id + '/name').set(c.name).then(function () {
          audit('folder-rename', f.name + ' → ' + c.name);
          NL.toast('Folder renamed', 'success');
        });
      })['catch'](function (e) { NL.toast('Could not rename: ' + e.message, 'error'); });
    }

    /* Rename rewrites the stored object's Content-Disposition FIRST, then the
       record. That order means a failure leaves the old name everywhere
       rather than the new name on screen and the old one on the saved file. */
    function renameFile(id) {
      var f = FILES[id] && Object.assign({ id: id }, FILES[id]);
      if (!f) return;
      askName('Rename', f.name, 'File name').then(function (raw) {
        if (raw == null) return;
        var c = NL.files.cleanName(raw);
        if (!c.ok) { NL.toast(c.error, 'error'); return; }
        var name = NL.files.keepExt(c.name, f.name);
        if (name === f.name) return;
        var folder = f.folderId === ROOT_FOLDER ? null : f.folderId;
        if (clash(name, folder, id)) {
          NL.toast('There’s already something called “' + name + '” here', 'error'); return;
        }
        if (name !== c.name) NL.toast('Kept the .' + NL.files.ext(f.name) + ' ending so it still opens', 'info');
        return storage.ref(f.storagePath)
          .updateMetadata({ contentDisposition: NL.files.contentDisposition(name) })
          .then(function () { return ref('files/' + id + '/name').set(name); })
          .then(function () {
            audit('rename', f.name + ' → ' + name);
            NL.toast('Renamed', 'success');
          });
      })['catch'](function (e) { NL.toast('Could not rename: ' + e.message, 'error'); });
    }

    function deleteFolder(id) {
      var f = folderById(id);
      if (!f) return;
      /* Only files block a delete — only files are something to lose. Empty
         subfolders go with it. */
      var n = collect(id, '').length;
      if (n) { NL.toast('“' + f.name + '” still holds ' + plural(n, 'document'), 'error'); return; }
      var tree = subtree(id);
      var extra = tree.length - 1;
      NL.confirm('Delete the folder “' + f.name + '”' +
        (extra ? ' and the ' + plural(extra, 'empty folder') + ' inside it' : '') + '?',
        { title: 'Delete folder', confirmText: 'Delete', variant: 'danger' }).then(function (ok) {
        if (!ok) return;
        var updates = {};
        tree.forEach(function (fid) { updates[fid] = null; });
        return ref('folders').update(updates).then(function () {
          if (tree.indexOf(view.folderId) !== -1) navigate(f.parentId || null);
          audit('folder-delete', pathLabel(f.parentId) + ' › ' + f.name);
          NL.toast('Folder deleted', 'success');
        });
      })['catch'](function (e) { NL.toast('Could not delete: ' + e.message, 'error'); });
    }

    /* Remove is soft: the record moves to trash/, the bytes stay, and the
       console's Bin restores it. Deleting bytes is a separate, later act. */
    function removeFiles(list) {
      if (!list.length) return;
      var msg = list.length === 1
        ? 'Remove “' + list[0].name + '”? Clubs will stop seeing it straight away. It goes to the Bin, where it can be restored.'
        : 'Remove ' + plural(list.length, 'file') + '? Clubs will stop seeing them straight away. They go to the Bin, where they can be restored.';
      NL.confirm(msg, { title: 'Remove', confirmText: 'Remove', variant: 'danger' }).then(function (ok) {
        if (!ok) return;
        var updates = {};
        list.forEach(function (f) {
          var rec = Object.assign({}, FILES[f.id], { deletedAt: TS(), deletedBy: opts.who || '' });
          updates['trash/' + f.id] = rec;
          updates['files/' + f.id] = null;
          delete sel[f.id];
        });
        return ref().update(updates).then(function () {
          list.forEach(function (f) { audit('remove', f.name); });
          NL.toast(list.length === 1 ? 'Moved to the Bin' : plural(list.length, 'file') + ' moved to the Bin', 'success');
        });
      })['catch'](function (e) { NL.toast('Could not remove: ' + e.message, 'error'); });
    }

    /* ── Move ─────────────────────────────────────────────────────────── */
    /* A picker of the folder tree. It will not offer a folder its own
       subtree, or a place that would push a branch past the depth ceiling.
       A name already taken at the destination is refused rather than
       silently suffixed: the name is the promise, and changing it as a side
       effect of a move would break it. */
    function moveItems(files, dirs) {
      if (!files.length && !dirs.length) return;
      var banned = {};
      dirs.forEach(function (d) { subtree(d.id).forEach(function (x) { banned[x] = true; }); });
      var tallest = dirs.reduce(function (m, d) { return Math.max(m, height(d.id)); }, 0);

      var opts2 = [{ id: '', label: 'Document Library', depth: 0 }];
      (function walk(parent, depth) {
        childrenOf(parent).forEach(function (f) {
          if (banned[f.id]) return;
          opts2.push({ id: f.id, label: f.name, depth: depth + 1 });
          walk(f.id, depth + 1);
        });
      })(null, 0);
      opts2 = opts2.filter(function (o) { return o.depth + tallest <= MAX_DEPTH; });

      var current = view.folderId || '';
      var body = '<div class="dl-move" role="radiogroup" aria-label="Destination">' + opts2.map(function (o) {
        return '<label class="dl-move__opt" style="padding-left:' + (10 + o.depth * 18) + 'px">' +
          '<input type="radio" name="dlMove" value="' + esc(o.id) + '"' + (o.id === current ? ' checked' : '') + '> ' +
          '<span>' + (o.depth ? '📁 ' : '📚 ') + esc(o.label) + '</span></label>';
      }).join('') + '</div>';

      var what = [];
      if (dirs.length) what.push(plural(dirs.length, 'folder'));
      if (files.length) what.push(plural(files.length, 'file'));

      NL.modal({
        title: 'Move ' + what.join(' and '),
        body: body,
        buttons: [
          { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
          { label: 'Move here', className: 'btn--primary', onClick: function (c) {
              var picked = document.querySelector('input[name="dlMove"]:checked');
              if (!picked) { NL.toast('Choose where to move to', 'error'); return; }
              var to = picked.value || null;
              var moving = {};
              files.forEach(function (f) { moving[f.id] = true; });
              dirs.forEach(function (d) { moving[d.id] = true; });
              var clashes = [];
              var items = files.map(function (f) { return { name: f.name, at: f.folderId === ROOT_FOLDER ? null : f.folderId }; })
                .concat(dirs.map(function (d) { return { name: d.name, at: d.parentId || null }; }));
              var arriving = {};
              items.forEach(function (x) {
                var lower = x.name.toLowerCase();
                /* Two picked from different folders (a search) may share a name. */
                if (arriving[lower]) { clashes.push(x.name); return; }
                arriving[lower] = true;
                if (x.at === to) return;                   // already there
                var hit = childrenOf(to).some(function (f) { return !moving[f.id] && f.name.toLowerCase() === lower; }) ||
                  filesIn(to).some(function (f) { return !moving[f.id] && f.name.toLowerCase() === lower; });
                if (hit) clashes.push(x.name);
              });
              if (clashes.length) {
                NL.alert('There’s already something called “' + clashes.join('”, “') +
                  '” in ' + pathLabel(to) + '. Rename one of them first.', { title: 'Name already used' });
                return;
              }
              var updates = {};
              files.forEach(function (f) { updates['files/' + f.id + '/folderId'] = to || ROOT_FOLDER; });
              dirs.forEach(function (d) {
                updates['folders/' + d.id + '/parentId'] = to || null;
              });
              ref().update(updates).then(function () {
                c.close();
                sel = {}; selDir = {};
                audit('move', what.join(' and ') + ' → ' + pathLabel(to));
                NL.toast('Moved to ' + pathLabel(to), 'success');
              })['catch'](function (e) { NL.toast('Could not move: ' + e.message, 'error'); });
            } }
        ]
      });
    }

    /* ── Upload ───────────────────────────────────────────────────────── */

    function pickFiles(into, dir) {
      var input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      if (dir) { input.webkitdirectory = true; input.setAttribute('webkitdirectory', ''); }
      input.onchange = function () {
        var list = Array.prototype.slice.call(input.files || []);
        if (!list.length) return;
        if (dir) uploadRelative(into, list);
        else list.forEach(function (file) { enqueue(into, file); });
      };
      input.click();
    }

    /* A folder chosen through the picker arrives as a flat list of files,
       each carrying webkitRelativePath ("Rules/2026/Section A.pdf"). Recreate
       the tree from those paths, merging into folders that already exist —
       the way copying into a folder on a desktop merges. */
    function uploadRelative(into, list) {
      var made = {};
      var base = trail(into).length;
      var flattened = false;
      function folderPath(parts) {
        return parts.reduce(function (chain, name, i) {
          return chain.then(function (parentId) {
            if (base + i >= MAX_DEPTH) { flattened = true; return parentId; }
            return folderFor(parentId, name, made);
          });
        }, Promise.resolve(into));
      }
      var chain = Promise.resolve();
      list.forEach(function (file) {
        var parts = String(file.webkitRelativePath || file.name).split('/');
        parts.pop();
        chain = chain.then(function () {
          return folderPath(parts).then(function (folderId) { enqueue(folderId, file); });
        });
      });
      chain.then(function () {
        NL.toast('Uploading ' + plural(list.length, 'file'), 'info');
        if (flattened) NL.toast('Some folders were deeper than ' + MAX_DEPTH + ' levels — their files came in flat', 'error');
        audit('upload-folder', plural(list.length, 'file') + ' into ' + pathLabel(into));
      })['catch'](function (e) { NL.toast('Could not read that folder: ' + e.message, 'error'); });
    }

    /* A folder of that name at that level is reused, not duplicated. Folders
       made earlier in the same drop are not in FOLDERS yet (the listener has
       not fired), so the run keeps its own index in `made`. */
    function folderFor(parentId, rawName, made) {
      var c = NL.files.cleanName(rawName);
      var name = c.ok ? c.name : NL.files.safeName(rawName);
      var key = (parentId || ROOT_FOLDER) + '/' + name.toLowerCase();
      if (made[key]) return Promise.resolve(made[key]);
      var existing = childrenOf(parentId).filter(function (f) { return f.name.toLowerCase() === name.toLowerCase(); })[0];
      if (existing) { made[key] = existing.id; return Promise.resolve(existing.id); }
      var rec = { name: name, createdAt: TS() };
      if (parentId) rec.parentId = parentId;
      var r = ref('folders').push();
      made[key] = r.key;
      return r.set(rec).then(function () { return r.key; });
    }

    function wireDrop() {
      var body = mount.querySelector('.fold__body');
      if (!body) return;
      var over = null;
      function hasFiles(e) {
        var t = (e.dataTransfer || {}).types || [];
        return Array.prototype.indexOf.call(t, 'Files') !== -1;
      }
      function targetOf(e) {
        return e.target && e.target.closest ? e.target.closest('[data-open]') : null;
      }
      function mark(e) {
        var t = targetOf(e);
        if (t === over) return;
        if (over) over.classList.remove('is-over');
        over = t;
        if (over) over.classList.add('is-over');
        body.classList.toggle('is-over', !over);
      }
      function clear() {
        if (over) over.classList.remove('is-over');
        over = null;
        body.classList.remove('is-over');
      }
      body.addEventListener('dragover', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        mark(e);
      });
      body.addEventListener('dragleave', function (e) { if (!body.contains(e.relatedTarget)) clear(); });
      body.addEventListener('drop', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        var t = targetOf(e);
        clear();
        if (view.q.trim()) { NL.toast('Clear the search to choose where the files go', 'error'); return; }
        var into = t ? t.getAttribute('data-open') : view.folderId;
        /* Must be read now — dataTransfer.items empties when this returns. */
        var entries = NL.files.dropEntries(e.dataTransfer);
        if (!entries.length) {
          Array.prototype.forEach.call(e.dataTransfer.files, function (file) { enqueue(into, file); });
          if (t) NL.toast('Uploading to ' + (folderById(into) || {}).name, 'info');
          return;
        }
        ingestDrop(entries, into);
      });
    }

    function ingestDrop(entries, into) {
      var made = {}, counts = { files: 0, folders: 0, flattened: 0 };
      function walk(list, parentId, level) {
        return list.reduce(function (chain, entry) {
          return chain.then(function () {
            if (entry.isFile) {
              return NL.files.fileOf(entry).then(function (file) {
                counts.files++;
                enqueue(parentId, file);
              })['catch'](function () { /* an unreadable entry skips itself, not the batch */ });
            }
            if (!entry.isDirectory) return null;
            if (level >= MAX_DEPTH) {
              counts.flattened++;
              return NL.files.readAll(entry.createReader()).then(function (kids) { return walk(kids, parentId, level); });
            }
            return folderFor(parentId, entry.name, made).then(function (id) {
              return NL.files.readAll(entry.createReader()).then(function (kids) { return walk(kids, id, level + 1); });
            });
          });
        }, Promise.resolve());
      }
      NL.toast('Reading the folder…', 'info');
      walk(entries, into, trail(into).length).then(function () {
        counts.folders = Object.keys(made).length;
        if (!counts.files && !counts.folders) { NL.toast('Nothing to upload in there', 'info'); return; }
        NL.toast('Uploading ' + plural(counts.files, 'file'), 'success');
        if (counts.flattened) {
          NL.toast(plural(counts.flattened, 'folder') + ' deeper than ' + MAX_DEPTH +
            ' levels — their files came in flat', 'error');
        }
        audit('upload-folder', plural(counts.files, 'file') + ' into ' + pathLabel(into));
      })['catch'](function (e) { NL.toast('Could not read that folder: ' + e.message, 'error'); });
    }

    function enqueue(folderId, file) {
      var key = folderId || ROOT_FOLDER;
      /* Claim the name now, synchronously, so the next file in the same drop
         sees it taken. */
      var c = NL.files.cleanName(file.name);
      var wanted = c.ok ? c.name : NL.files.safeName(file.name);
      var name = NL.files.uniqueIn(wanted, namesIn(folderId));
      (pending[key] = pending[key] || []).push(name);
      queue.push(function () {
        return uploadOne(folderId, file, name).then(release, release);
      });
      function release() {
        var list = pending[key] || [];
        var i = list.indexOf(name);
        if (i !== -1) list.splice(i, 1);
      }
    }

    function previewPath(fileId, tier, ext) {
      return STORE + '/_previews/' + fileId + '-' + tier + '.' + ext;
    }

    function storePreviews(fileId, made) {
      var fields = { previewsAt: TS() };
      return Object.keys(made || {}).reduce(function (chain, tier) {
        return chain.then(function () {
          var v = made[tier];
          var p = previewPath(fileId, tier, v.ext);
          return storage.ref(p).put(v.blob, { contentType: v.contentType, cacheControl: 'private,max-age=3600' })
            .then(function (snap) { return snap.ref.getDownloadURL(); })
            .then(function (url) { fields[tier + 'Url'] = url; fields[tier + 'Path'] = p; })
            ['catch'](function () { /* the tile falls back to the original */ });
        });
      }, Promise.resolve()).then(function () { return fields; });
    }

    function uploadOne(folderId, file, name) {
      if (file.size > MAX_BYTES) {
        NL.toast(file.name + ' is over ' + NL.files.humanSize(MAX_BYTES), 'error');
        return Promise.resolve();
      }
      var type = NL.files.typeFor(file);
      var fileId = ref('files').push().key;
      var ext = NL.files.ext(name);
      var path = STORE + '/files/' + fileId + (ext ? '.' + NL.files.safeName(ext) : '');

      var row = document.createElement('div');
      row.className = 'up-row';
      row.innerHTML = '<span class="up-row__name">' + esc(name) + '</span>' +
        '<span class="up-row__bar"><span class="up-row__fill"></span></span>';
      if (uploadsEl) uploadsEl.appendChild(row);
      var fill = row.querySelector('.up-row__fill');

      var madePreviews = Promise.race([
        NL.files.previews.make(file, type),
        new Promise(function (r) { setTimeout(function () { r(null); }, 20000); })
      ])['catch'](function () { return null; });

      return new Promise(function (settle) {
        var task = storage.ref(path).put(file, {
          contentType: type,
          contentDisposition: NL.files.contentDisposition(name),
          cacheControl: 'private,max-age=3600'
        });
        task.on('state_changed', function (snap) {
          var pct = snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0;
          fill.style.transform = 'scaleX(' + pct + ')';
        }, function (err) {
          row.remove();
          NL.toast(err && err.code === 'storage/unauthorized'
            ? name + ' was refused (' + type + ', ' + NL.files.humanSize(file.size) + ')'
            : 'Upload failed: ' + err.message, 'error');
          settle();
        }, function () {
          var extra = madePreviews.then(function (made) {
            return made ? storePreviews(fileId, made)['catch'](function () { return {}; }) : {};
          });
          Promise.all([task.snapshot.ref.getDownloadURL(), extra]).then(function (got) {
            return ref('files/' + fileId).set(Object.assign({
              name: name,
              folderId: folderId || ROOT_FOLDER,
              size: file.size,
              contentType: type,
              storagePath: path,
              url: got[0],
              uploadedAt: TS()
            }, got[1]));
          }).then(function () {
            row.remove();
            audit('upload', (folderId ? pathLabel(folderId) + ' › ' : '') + name);
            settle();
          })['catch'](function (e) {
            row.remove();
            NL.toast('Could not save ' + name + ': ' + e.message, 'error');
            settle();
          });
        });
      });
    }

    render();

    return {
      render: render,
      navigate: navigate,
      pathLabel: pathLabel,
      folderExists: function (id) { return !!FOLDERS[id]; },
      namesIn: namesIn
    };
  }

  window.DocLib = {
    ROOT: ROOT,
    STORE: STORE,
    ROOT_FOLDER: ROOT_FOLDER,
    create: create
  };
})();
