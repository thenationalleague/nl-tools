/* NL Tools — Access: the Externals tab (v2.12, 16/11/2026: people's passes on the one issue form)

   Organisations outside the League and its clubs, set up here and nowhere
   else (permissions plan, "External passes" and "Club views"). Skeleton key
   only: the tab is hidden from everyone else and the database refuses them.

     Organisations  each one's name and colours (externals/<org>)
     Zones          a name, a three-letter code, and the tools the zone
                    opens: at Access (or Manage, where the tool offers it to
                    outsiders), with a club view where the tool holds club
                    data, and the reason it was given. A tool appears only
                    if its record offers externals (`externals`).
     People         who holds which zones, with an optional end date, and
                    Add person: the account is made by the cloud job
                    (admin/external-invites, functions/externals.js), then
                    Firebase's own set-a-password email goes to them.

   What a zone opens reaches each person as pass.ext, worked out on the
   server (NL.pass.extFor). Loaded by access/index.html, which hands over
   its helpers. */
(function () {
  'use strict';

  var C;                         /* the page's helpers: S, P, db, esc, icon … */
  var X = { orgs: {}, org: null, loaded: false };
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) { return C.esc(s == null ? '' : String(s)); }
  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'org';
  }
  function uniqueId(base, taken) {
    var id = base, n = 2;
    while (taken[id]) id = base + '-' + (n++);
    return id;
  }
  function hex(v) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : ''; }
  function dateMs(v) {
    if (!v) return null;
    var d = new Date(v + 'T23:59:00');
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  function dateInput(ms) {
    if (typeof ms !== 'number') return '';
    var d = new Date(ms);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* Tools that offer themselves to externals, A–Z. */
  function offering() {
    var reg = C.S.registry || {};
    return Object.keys(reg).filter(function (k) { return reg[k] && C.P.offersExternals(reg[k]); })
      .map(function (k) { return { key: k, rec: reg[k], label: reg[k].label || k }; })
      .sort(function (a, b) { return a.label.localeCompare(b.label); });
  }
  function hasClubData(rec) {
    var cd = rec && rec.permissions && rec.permissions.clubData;
    return !!cd && cd !== 'none';
  }

  /* Every zone code in use: the League's and clubs' own, and every
     organisation's. A new one must be none of them. */
  /* Codes in use in this organisation. A code is unique within its
     organisation only (16/11/2026): an External card only ever shows its own
     organisation's zones, so FIN can be the League's and an external's too. */
  function codesTaken(orgId, exceptZone) {
    var taken = {}, z = (X.orgs[orgId] && X.orgs[orgId].zones) || {};
    Object.keys(z).forEach(function (id) {
      if (id !== exceptZone && z[id] && z[id].code) taken[z[id].code] = true;
    });
    return taken;
  }
  function suggestCode(name, taken) {
    var letters = String(name || '').toUpperCase().replace(/[^A-Z]/g, '');
    var tries = [letters.slice(0, 3)];
    for (var i = 3; i < letters.length; i++) tries.push(letters.slice(0, 2) + letters[i]);
    for (var j = 0; j < tries.length; j++) if (tries[j].length === 3 && !taken[tries[j]]) return tries[j];
    return '';
  }

  function people(orgId) {
    return (C.S.users || []).filter(function (u) {
      return u.pass && u.pass.base === 'external' && (!orgId || u.pass.org === orgId);
    });
  }

  function load() {
    return C.db.ref('externals').once('value').then(function (snap) {
      X.orgs = snap.val() || {};
      X.loaded = true;
    });
  }

  /* ── The list of organisations ──────────────────────────────────────── */
  function drawList() {
    var box = $('exBody');
    var ids = Object.keys(X.orgs).sort(function (a, b) {
      return String(X.orgs[a].name || a).localeCompare(String(X.orgs[b].name || b));
    });
    var html = '<div class="toolbar"><div class="toolbar__left"></div><div class="toolbar__right">' +
      '<button class="btn btn--primary btn--sm" type="button" id="exAddOrg">' + C.icon('add') + 'Add organisation</button></div></div>';
    if (!ids.length) {
      html += '<div class="empty-state"><div class="empty-state__title">No organisations yet</div></div>';
    } else {
      html += '<div class="table-wrap"><table class="table"><thead><tr><th>Organisation</th><th>Zones</th><th>People</th></tr></thead><tbody>' +
        ids.map(function (id) {
          var o = X.orgs[id] || {}, zones = Object.keys(o.zones || {});
          return '<tr class="ex-row" data-org="' + esc(id) + '" tabindex="0"><td><span class="ex-org">' + orgMark(o) + esc(o.name || id) + '</span></td>' +
            '<td>' + zones.map(function (z) { return '<span class="pill pill--info">' + esc(o.zones[z].code) + '</span>'; }).join(' ') + '</td>' +
            '<td>' + people(id).length + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    box.innerHTML = html;
    $('exAddOrg').onclick = addOrg;
    rowsOpen(box, '[data-org]', function (el) { openOrg(el.getAttribute('data-org')); });
  }
  /* A date as Sat 14 Nov 2026 (style principles 5.5). The canon has the
     weekday only on formatDateTime for now (brand audit, Part 1), so the
     time is cut off it. */
  function day(ms) { return NL.formatDateTime(ms, { weekday: true }).split(',')[0]; }
  /* Rows open on a click, or Enter (style principles 9.5). A link inside a
     row still goes where it says. */
  function rowsOpen(box, sel, fn) {
    box.querySelectorAll('tr' + sel).forEach(function (tr) {
      tr.addEventListener('click', function (e) { if (!e.target.closest('a')) fn(tr); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') fn(tr); });
    });
  }
  /* An organisation's mark: its logo where one is uploaded, else its
     initials on its main colour. `size` is the canon --crest-size. */
  var LOGO_URL = /^https:\/\/firebasestorage\.googleapis\.com\//;
  /* The same two letters My pass prints on the card: first and last word. */
  function initialsOf(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].charAt(0).toUpperCase();
  }

  function orgMark(o, cls) {
    if (o && LOGO_URL.test(String(o.logo || ''))) {
      return '<img class="nl-crest ex-logo ' + (cls || '') + '" src="' + esc(o.logo) + '" alt="">';
    }
    var bg = hex(o && o.colours && o.colours.primary) || NL.projColours[7];
    var ink = C.P.contrast(bg, '#ffffff') >= C.P.contrast(bg, '#000000') ? 'var(--white)' : 'var(--text)';
    return '<span class="nl-crest ex-mark ' + (cls || '') + '" style="background:' + bg + ';color:' + ink + '" aria-hidden="true">' + esc(initialsOf(o && o.name)) + '</span>';
  }


  function addOrg() {
    NL.prompt('', { title: 'Add organisation', placeholder: 'Its name, as it should appear on passes', confirmText: 'Add' }).then(function (name) {
      name = String(name || '').trim();
      if (!name) return;
      var id = uniqueId(slug(name), X.orgs);
      var rec = { name: name.slice(0, 120), created: Date.now(), by: C.S.session.uid };
      return C.db.ref('externals/' + id).set(rec).then(function () {
        NL.writeAudit('external_org_added', 'Added ' + rec.name);
        X.orgs[id] = rec;
        openOrg(id);
      });
    })['catch'](function (e) { NL.toast('Could not add it: ' + (e && e.message || e), 'error'); });
  }

  /* ── One organisation ───────────────────────────────────────────────── */
  function openOrg(id) {
    if (!X.orgs[id]) { NL.toast('That organisation was not found', 'error'); X.org = null; drawList(); return; }
    X.org = id;
    try { history.replaceState(null, '', '?tab=externals&org=' + encodeURIComponent(id)); } catch (e) {}
    drawOrg();
  }

  function drawOrg() {
    var id = X.org, o = X.orgs[id] || {};
    var zones = o.zones || {};
    var html = '<div class="pc-back"><button class="btn btn--ghost btn--sm" type="button" id="exBack">' + C.icon('back') + 'Organisations</button></div>';

    /* The organisation is the subject of this view, so it takes the canon
       subject header (.nl-club-header): its mark, its name, its colours as
       the trim. Written out rather than by NL.clubs.headerHtml, which draws a
       club crest; a mark slot on headerHtml is a canon candidate. */
    var nP = people(id).length, nZ = Object.keys(zones).length;
    html += '<div class="nl-club-header">' + orgMark(o, 'nl-club-header__crest ex-mark--lg') +
      '<div class="nl-club-header__id"><h2 class="nl-club-header__name">' + esc(o.name || id) + '</h2>' +
      '<p class="nl-club-header__sub">' + nZ + (nZ === 1 ? ' zone' : ' zones') + ' · ' + nP + (nP === 1 ? ' person' : ' people') + '</p></div>' +
      '<div class="nl-club-header__actions"><button class="btn btn--ghost btn--sm" type="button" id="exEditOrg">' + C.icon('edit') + 'Edit</button></div>' +
      NL.clubs.bandsHtml({ colors: { primary: hex(o.colours && o.colours.primary) || NL.projColours[7], secondary: hex(o.colours && o.colours.secondary) || hex(o.colours && o.colours.primary) || NL.projColours[7] } }, { lg: true }) +
      '</div>';

    html += '<div class="section-head"><h2>Zones</h2><span class="pc-actions"><button class="btn btn--ghost btn--sm" type="button" id="exAddZone">' + C.icon('add') + 'Add zone</button></span></div>';
    var zids = Object.keys(zones).sort(function (a, b) { return String(zones[a].name).localeCompare(String(zones[b].name)); });
    html += zids.length ? zids.map(function (z) { return zoneHtml(z, zones[z]); }).join('') :
      '<div class="ex-none ex-gap">No zones yet. A person needs at least one.</div>';

    var ppl = people(id);
    html += '<div class="section-head"><h2>People</h2></div>';
    html += ppl.length ? '<div class="table-wrap ex-gap"><table class="table"><thead><tr><th>Person</th><th>Zones</th><th>Ends</th></tr></thead><tbody>' +
      ppl.map(function (u) {
        var keys = (u.pass && u.pass.keys) || {}, until = null;
        Object.keys(keys).forEach(function (z) { if (keys[z] && typeof keys[z].until === 'number') until = keys[z].until; });
        return '<tr class="ex-row" data-zones="' + esc(u.uid) + '" tabindex="0"><td><span class="pc-who"><a class="pc-who__name pc-link" href="?person=' + encodeURIComponent(u.uid) + '">' + esc(u.name || '(no name)') + '</a>' +
          '<span class="pc-who__sub">' + esc(u.email) + '</span></span></td>' +
          '<td>' + Object.keys(keys).map(function (z) {
            return '<span class="pill pill--info">' + esc(zones[z] ? zones[z].code : z) + '</span>';
          }).join(' ') + '</td>' +
          '<td>' + (until ? esc(day(until)) : 'When removed') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="ex-none ex-gap">Nobody yet.</div>';

    html += '<section class="form-panel ex-gap"><div class="form-panel__head">Add person</div><div class="form-panel__body"><div class="form-grid">' +
      '<div class="form-group"><label for="exPEmail">Email</label><input type="email" id="exPEmail" autocomplete="off"></div>' +
      '<div class="form-group"><label for="exPName">Full name</label><input type="text" id="exPName" autocomplete="off"></div>' +
      '<div class="form-group"><label for="exPJob">Job title</label><input type="text" id="exPJob" autocomplete="off" maxlength="80"></div>' +
      '<div class="form-group"><label for="exPUntil">Access ends</label><input type="date" id="exPUntil"><p class="form-hint">Leave empty to keep it until removed.</p></div>' +
      '<div class="form-group span2"><label>Zones</label><div class="pc-roles ex-ticks" id="exPZones">' +
        (zids.length ? zids.map(function (z) { return zoneTick(z, zones[z], false); }).join('') : '<span class="ex-empty">Add a zone first.</span>') + '</div></div>' +
      '</div><p class="form-hint">They get an email from NL Tools to set their password.</p></div>' +
      (zids.length ? '<div class="form-panel__foot pc-foot"><button class="btn btn--primary" type="button" id="exPAdd">Set up and email' + C.icon('send') + '</button></div>' : '') + '</section>';

    $('exBody').innerHTML = html;
    $('exBack').onclick = function () { X.org = null; try { history.replaceState(null, '', '?tab=externals'); } catch (e) {} drawList(); };
    $('exEditOrg').onclick = editOrg;
    $('exAddZone').onclick = function () { editZone(null); };
    if ($('exPAdd')) $('exPAdd').onclick = addPerson;
    $('exBody').querySelectorAll('[data-zone]').forEach(function (b) { b.onclick = function () { editZone(b.getAttribute('data-zone')); }; });
    /* A person's pass, name and zones are changed on the one issue form,
       as everyone's are (v2.12). */
    rowsOpen($('exBody'), '[data-zones]', function (el) { location.href = '/pass/?view=issue&uid=' + encodeURIComponent(el.getAttribute('data-zones')); });
  }
  /* A zone as a tick box: its name, and beneath it the code and what
     ticking it opens, so the box says what it gives (style principles 5.4). */
  function zoneTick(id, z, checked) {
    return '<label class="pc-role"><input type="checkbox" value="' + esc(id) + '"' + (checked ? ' checked' : '') + '>' +
      '<span><span class="pc-role__name">' + esc(z.name) + ' · ' + esc(z.code) + '</span>' +
      '<span class="pc-role__grant">' + esc(opensText(z)) + '</span></span></label>';
  }
  function opensText(z) {
    var reg = C.S.registry || {};
    var names = Object.keys((z && z.tools) || {}).map(function (k) { return (reg[k] && reg[k].label) || k; }).sort();
    return names.length ? 'Opens ' + names.join(', ') : 'Opens nothing yet';
  }

  function zoneHtml(id, z) {
    var tools = z.tools || {}, reg = C.S.registry || {};
    var anyWhy = Object.keys(tools).some(function (k) { return tools[k] && tools[k].reason; });
    var rows = Object.keys(tools).map(function (k) {
      var t = tools[k], rec = reg[k], label = (rec && rec.label) || k;
      var gives = rec ? C.P.zoneGives(t, rec) : null;
      var view = t.view ? ' · ' + esc(C.P.VIEWS[t.view] || t.view) + (t.club ? ' (' + esc(t.club) + ')' : '') : '';
      return '<tr><td>' + esc(label) + '</td><td>' + (t.level === 'manage' ? 'Manage' : 'View') + view +
        (gives ? '' : ' <span class="pill pill--rejected" title="The tool does not offer this to externals now">Not open</span>') + '</td>' +
        (anyWhy ? '<td class="pc-muted">' + esc(t.reason || '') + '</td>' : '') + '</tr>';
    }).join('');
    return '<section class="form-panel ex-gap"><div class="form-panel__head">' + esc(z.code) + ' · ' + esc(z.name) + '</div>' +
      '<div class="form-panel__body">' + (rows ? '<table class="table table--compact"><thead><tr><th>Tool</th><th>Gives</th>' + (anyWhy ? '<th>Why</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table>' :
        '<p class="ex-empty">Opens nothing yet.</p>') + '</div>' +
      '<div class="form-panel__foot pc-foot"><button class="btn btn--ghost btn--sm" type="button" data-zone="' + esc(id) + '">' + C.icon('edit') + 'Edit zone</button></div></section>';
  }

  /* The organisation's name and colours, in a dialog titled with its name
     (style principles 7.2). The colours are its identity: the pass and its
     zones wear them. */
  function editOrg() {
    var o = X.orgs[X.org], file = null, drop = false;
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="form-grid">' +
      '<div class="form-group span2"><label for="exName">Name</label><input type="text" id="exName" maxlength="120" value="' + esc(o.name || '') + '"></div>' +
      '<div class="form-group"><label for="exC1">Main colour</label><input type="color" class="ex-colour" id="exC1" value="' + (hex(o.colours && o.colours.primary) || NL.projColours[7]) + '"></div>' +
      '<div class="form-group"><label for="exC2">Second colour</label><input type="color" class="ex-colour" id="exC2" value="' + (hex(o.colours && o.colours.secondary) || '#ffffff') + '"></div>' +
      '<div class="form-group span2"><label for="exLogo">Logo</label><div class="ex-logo-row"><span id="exLogoMark"></span>' +
        '<input type="file" id="exLogo" accept="image/png,image/jpeg,image/webp">' +
        '<button class="btn btn--ghost btn--sm" type="button" id="exLogoOff"' + (o.logo ? '' : ' hidden') + '>' + C.icon('delete') + 'Remove logo</button></div>' +
        '<p class="form-hint">PNG, JPEG or WebP, square, under 500 KB. It shows on their pass and here.</p></div>' +
      '</div>';
    var mark = wrap.querySelector('#exLogoMark'), input = wrap.querySelector('#exLogo'), off = wrap.querySelector('#exLogoOff');
    function preview() {
      var look = { name: wrap.querySelector('#exName').value || o.name, colours: { primary: wrap.querySelector('#exC1').value }, logo: drop ? '' : o.logo };
      mark.innerHTML = orgMark(look, 'ex-logo-row__mark');
      if (file) { var img = document.createElement('img'); img.className = 'nl-crest ex-logo ex-logo-row__mark'; img.alt = ''; img.src = URL.createObjectURL(file); mark.innerHTML = ''; mark.appendChild(img); }
    }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f && (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size >= 512 * 1024)) { NL.toast('A PNG, JPEG or WebP under 500 KB', 'error'); input.value = ''; return; }
      file = f || null; drop = false; off.hidden = !file && !o.logo; preview();
    });
    off.addEventListener('click', function () { file = null; drop = true; input.value = ''; off.hidden = true; preview(); });
    wrap.querySelector('#exC1').addEventListener('input', preview);
    preview();
    NL.modal({ title: o.name || X.org, body: wrap, buttons: [{ label: 'Save', className: 'btn--primary', onClick: function (c) {
      var name = wrap.querySelector('#exName').value.trim();
      if (!name) return NL.toast('A name is needed', 'error');
      var patch = { name: name.slice(0, 120), colours: { primary: wrap.querySelector('#exC1').value, secondary: wrap.querySelector('#exC2').value } };
      /* A logo is a new file every time (the storage rules allow adding, never
         replacing), and the organisation record points at it. */
      var up = file ? uploadLogo(X.org, file) : Promise.resolve(drop ? null : undefined);
      up.then(function (url) {
        if (url !== undefined) patch.logo = url;
        return C.db.ref('externals/' + X.org).update(patch);
      }).then(function () {
        Object.keys(patch).forEach(function (k) { if (patch[k] === null) delete o[k]; else o[k] = patch[k]; });
        NL.writeAudit('external_org_changed', 'Changed ' + patch.name + (file ? ' (new logo)' : drop ? ' (logo removed)' : ''));
        c.close();
        NL.toast('Saved', 'success');
        drawOrg();
      })['catch'](function (e) { NL.toast('Could not save: ' + (e && e.message || e), 'error'); });
    } }] });
  }
  function uploadLogo(orgId, f) {
    var ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[f.type];
    var ref = firebase.storage().ref('externals/' + orgId + '/logo-' + Date.now() + '.' + ext);
    return ref.put(f, { contentType: f.type }).then(function () { return ref.getDownloadURL(); });
  }


  /* ── A zone: its name, code, and what it opens ──────────────────────── */
  /* What ticking a tool gives, in words: View or Manage, and for a tool
     with club data, which clubs. */
  function givesText(t, cur) {
    var x = t.rec.externals || {}, views = x.views || [];
    var level = cur && cur.level === 'manage' && x.manage ? 'Manage' : 'View only';
    if (!hasClubData(t.rec)) return level;
    var v = cur && cur.view && views.indexOf(cur.view) >= 0 ? cur.view : views[0];
    return level + ' · ' + (C.P.VIEWS[v] || v);
  }
  function toolPick(t, cur) {
    var x = t.rec.externals || {}, views = x.views || [], on = !!cur;
    cur = cur || {};
    var choices = '';
    if (x.manage) {
      choices += '<div class="form-group"><label>Level</label><select class="nl-select" data-level="' + esc(t.key) + '">' +
        '<option value="access">View only</option><option value="manage"' + (cur.level === 'manage' ? ' selected' : '') + '>Manage</option></select></div>';
    }
    if (hasClubData(t.rec) && views.length > 1) {
      choices += '<div class="form-group"><label>Clubs</label><select class="nl-select" data-view="' + esc(t.key) + '">' + views.map(function (v) {
        return '<option value="' + esc(v) + '"' + (cur.view === v ? ' selected' : '') + '>' + esc(C.P.VIEWS[v] || v) + '</option>';
      }).join('') + '</select></div>';
    }
    if (hasClubData(t.rec) && views.indexOf('one') >= 0) {
      choices += '<div class="form-group"><label>Club code</label><input type="text" data-club="' + esc(t.key) + '" maxlength="12" value="' + esc(cur.club || '') + '"></div>';
    }
    return '<div class="ex-pick">' +
      '<label class="pc-role"><input type="checkbox" data-on="' + esc(t.key) + '"' + (on ? ' checked' : '') + '>' +
        '<span><span class="pc-role__name">' + esc(t.label) + '</span>' +
        '<span class="pc-role__grant">' + esc(t.rec.description || '') + '</span>' +
        '<span class="pc-role__grant ex-gives">' + esc(givesText(t, on ? cur : null)) + '</span></span></label>' +
      '<div class="ex-pick__more" data-more="' + esc(t.key) + '"' + (on ? '' : ' hidden') + '>' +
        (choices ? '<div class="form-grid">' + choices + '</div>' : '') +
        '<div class="form-group"><label>Note (optional)</label><input type="text" data-reason="' + esc(t.key) + '" maxlength="300" value="' + esc(cur.reason || '') + '" placeholder="For the record"></div>' +
      '</div></div>';
  }

  function editZone(zid) {
    var o = X.orgs[X.org], zones = o.zones || {}, z = zid ? zones[zid] : { name: '', code: '', tools: {} };
    var tools = offering();
    var wrap = document.createElement('div');
    /* One tick per tool: ticking it is what opens it. Beneath the name, what
       the tool is and what ticking gives; the choices a tool offers (Manage,
       which clubs) and the optional note appear only once it is ticked, and
       only where there is a choice to make. */
    wrap.innerHTML =
      '<div class="form-grid">' +
        '<div class="form-group"><label for="exZName">Zone name</label><input type="text" id="exZName" maxlength="60" value="' + esc(z.name) + '"></div>' +
        '<div class="form-group"><label for="exZCode">Code</label><input type="text" id="exZCode" maxlength="3" value="' + esc(z.code) + '" class="ex-code"></div>' +
      '</div>' +
      '<div class="form-group"><label>Opens</label>' +
      (tools.length ? '<div class="pc-roles ex-picks">' + tools.map(function (t) { return toolPick(t, (z.tools || {})[t.key]); }).join('') + '</div>'
        : '<p class="ex-empty">No tool is open to externals yet.</p>') + '</div>';
    wrap.querySelectorAll('[data-on]').forEach(function (box) {
      var more = wrap.querySelector('[data-more="' + box.getAttribute('data-on') + '"]');
      box.addEventListener('change', function () { more.hidden = !box.checked; });
    });
    var nameIn = wrap.querySelector('#exZName'), codeIn = wrap.querySelector('#exZCode');
    nameIn.addEventListener('input', function () {
      if (!zid && !codeIn.dataset.touched) codeIn.value = suggestCode(nameIn.value, codesTaken(X.org, zid));
    });
    codeIn.addEventListener('input', function () { codeIn.dataset.touched = '1'; });

    var buttons = [];
    if (zid) buttons.push({ label: 'Delete zone', className: 'btn--danger', onClick: function (c) { c.close(); deleteZone(zid); } });
    buttons.push({ label: 'Save', className: 'btn--primary', onClick: function (c) {
      var next = readZone(wrap, z, zid);
      if (next.error) return NL.toast(next.error, 'error');
      var id = zid || uniqueId(slug(next.zone.name), zones);
      C.db.ref('externals/' + X.org + '/zones/' + id).set(next.zone).then(function () {
        o.zones = o.zones || {};
        o.zones[id] = next.zone;
        NL.writeAudit('external_zone_saved', (o.name || X.org) + ': ' + next.zone.code + ' ' + next.zone.name + ' opens ' +
          Object.keys(next.zone.tools || {}).length + ' tool(s)');
        c.close();
        NL.toast('Zone saved', 'success');
        drawOrg();
      })['catch'](function (e) { NL.toast('Could not save: ' + (e && e.message || e), 'error'); });
    } });
    var ctrl = NL.modal({ title: zid ? z.code + ' · ' + z.name : 'Add zone', width: 'wide', body: wrap, buttons: buttons, footerSplit: !!zid });
    dangerIcon(ctrl);
  }

  /* The zone as the form says, checked: a name, a three-letter code not
     already used in this organisation, and for every tool ticked its level
     (View only unless Manage is offered and chosen), a club-data tool a
     view, One club a club. The note is optional. An unchanged tool keeps
     who gave it and when. */
  function readZone(wrap, old, zid) {
    var name = wrap.querySelector('#exZName').value.trim();
    var code = wrap.querySelector('#exZCode').value.trim().toUpperCase();
    if (!name) return { error: 'The zone needs a name' };
    if (!/^[A-Z]{3}$/.test(code)) return { error: 'The code is three letters' };
    if (codesTaken(X.org, zid)[code]) return { error: code + ' is already a zone here' };
    var tools = {}, err = null;
    offering().forEach(function (t) {
      if (err) return;
      var box = wrap.querySelector('[data-on="' + t.key + '"]');
      if (!box || !box.checked) return;
      var x = t.rec.externals || {}, views = x.views || [];
      var lv = wrap.querySelector('[data-level="' + t.key + '"]');
      var entry = { level: lv && lv.value === 'manage' && x.manage ? 'manage' : 'access' };
      var reason = wrap.querySelector('[data-reason="' + t.key + '"]').value.trim();
      if (reason) entry.reason = reason.slice(0, 300);
      if (hasClubData(t.rec)) {
        var v = wrap.querySelector('[data-view="' + t.key + '"]');
        entry.view = v ? v.value : views[0];
        if (!entry.view) { err = t.label + ' does not offer externals any clubs'; return; }
        if (entry.view === 'one') {
          var club = wrap.querySelector('[data-club="' + t.key + '"]');
          entry.club = club ? club.value.trim().toUpperCase() : '';
          if (!entry.club) { err = 'Name the club for ' + t.label; return; }
        }
      }
      var prev = (old.tools || {})[t.key];
      var same = prev && prev.level === entry.level && (prev.reason || null) === (entry.reason || null) && (prev.view || null) === (entry.view || null) && (prev.club || null) === (entry.club || null);
      entry.by = same && prev.by ? prev.by : C.S.session.uid;
      entry.at = same && prev.at ? prev.at : Date.now();
      tools[t.key] = entry;
    });
    if (err) return { error: err };
    var zone = { name: name.slice(0, 60), code: code };
    if (Object.keys(tools).length) zone.tools = tools;
    return { zone: zone };
  }

  function deleteZone(zid) {
    var o = X.orgs[X.org], z = o.zones[zid];
    var holders = people(X.org).filter(function (u) { return u.pass.keys && u.pass.keys[zid]; }).length;
    /* Can't be undone, so the zone's code is typed before the button wakes
       (style principles 11.1). NL.prompt has no danger button and no way to
       hold OK back, hence a modal here: a canon candidate (NL.confirm with a
       typed word) if a second tool wants it. Flagged 16/11/2026. */
    var wrap = document.createElement('div');
    wrap.innerHTML = '<p class="confirm-text">' + (holders ? esc(holders + (holders === 1 ? ' person holds' : ' people hold') + ' it and will lose what it opens. ') : '') +
      'Type <b>' + esc(z.code) + '</b> to delete it.</p><input type="text" class="modal__input" maxlength="3" autocomplete="off" aria-label="Zone code">';
    var input = wrap.querySelector('input');
    var ctrl = NL.modal({ title: 'Delete ' + z.code + ' · ' + z.name, size: 'sm', body: wrap, buttons: [{ label: 'Delete zone', className: 'btn--danger', onClick: function (c) {
      if (input.value.trim().toUpperCase() !== z.code) return;
      C.db.ref('externals/' + X.org + '/zones/' + zid).remove().then(function () {
        delete o.zones[zid];
        NL.writeAudit('external_zone_deleted', (o.name || X.org) + ': ' + z.code + ' ' + z.name);
        c.close();
        NL.toast('Zone deleted', 'success');
        drawOrg();
      })['catch'](function (e) { NL.toast('Could not delete: ' + (e && e.message || e), 'error'); });
    } }] });
    var go = dangerIcon(ctrl);
    function sync() { if (go) go.disabled = input.value.trim().toUpperCase() !== z.code; }
    input.addEventListener('input', sync);
    sync();
    try { input.focus(); } catch (e) {}
  }
  /* NL.modal sets button text, not markup, so the delete icon goes in after
     (the icon sits before the words, as on every destructive button). */
  function dangerIcon(ctrl) {
    var b = ctrl && ctrl.el && ctrl.el.querySelector('.modal__footer .btn--danger');
    if (b && !b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', C.icon('delete'));
    return b;
  }


  /* ── People ─────────────────────────────────────────────────────────── */
  function addPerson() {
    var email = $('exPEmail').value.trim(), name = $('exPName').value.trim();
    var zones = {};
    $('exPZones').querySelectorAll('input:checked').forEach(function (i) { zones[i.value] = true; });
    if (!email || !name) return NL.toast('Email and name are needed', 'error');
    if (!Object.keys(zones).length) return NL.toast('Choose at least one zone', 'error');
    var until = dateMs($('exPUntil').value);
    if ($('exPUntil').value && (!until || until <= Date.now())) return NL.toast('The end date must be in the future', 'error');
    var req = { org: X.org, email: email.slice(0, 200), name: name.slice(0, 120), jobTitle: $('exPJob').value.trim().slice(0, 80),
      zones: zones, by: C.S.session.uid, at: Date.now() };
    if (until) req.until = until;
    var btn = $('exPAdd');
    btn.disabled = true;
    var ref = C.db.ref('admin/external-invites').push();
    /* The cloud job answers on the request itself (result). */
    var timer = null, listener = null;
    var answered = new Promise(function (resolve, reject) {
      timer = setTimeout(function () { reject(new Error('No answer from the cloud job in a minute. Check People before trying again.')); }, 60000);
      listener = ref.child('result').on('value', function (s) { if (s.exists()) resolve(s.val()); }, reject);
    });
    ref.set(req).then(function () { return answered; }).then(function (result) {
      if (!result.ok) throw new Error(result.error || 'unknown');
      return firebase.auth().sendPasswordResetEmail(result.email || email).then(function () {
        NL.writeAudit('password_reset_sent', 'Set-a-password email for a new External account', { uid: result.uid, name: name, email: email });
      }, function () {
        NL.toast('The account is set up, but the set-a-password email did not go. Use Send reset link on their page.', 'error');
      }).then(function () { return result; });
    }).then(function (result) {
      NL.toast(name + ' is set up. A set-a-password email is on its way.', 'success');
      ['exPEmail', 'exPName', 'exPJob', 'exPUntil'].forEach(function (id) { $(id).value = ''; });
      return C.refreshPeople().then(drawOrg);
    })['catch'](function (e) {
      NL.toast('Not set up: ' + (e && e.message || e), 'error');
    }).then(function () {
      clearTimeout(timer);
      if (listener) ref.child('result').off('value', listener);
      if ($('exPAdd')) $('exPAdd').disabled = false;
    });
  }

  /* Change which zones a person holds, and when their access ends. Keeps
     when each zone they keep was given, and by whom. */
  window.ACCESS_EXTERNALS = {
    init: function (ctx, orgId) {
      C = ctx;
      var go = function () { if (orgId && X.orgs[orgId]) openOrg(orgId); else if (X.org) drawOrg(); else drawList(); };
      if (X.loaded) { go(); return; }
      $('exBody').innerHTML = '<p class="pc-muted">Loading…</p>';
      load().then(go)['catch'](function (e) {
        $('exBody').innerHTML = '<p class="pc-muted">Organisations could not be loaded: ' + esc(e && e.message || e) + '</p>';
      });
    },
    orgName: function (id) { return X.orgs[id] && X.orgs[id].name; },
    open: function (ctx, id) { this.init(ctx, id); }
  };
})();
