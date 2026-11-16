/* NL Tools — Access: the Externals tab (v2.7, 16/11/2026)

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
  function codesTaken(exceptOrg, exceptZone) {
    var taken = {};
    (C.P.KEYS || []).forEach(function (k) { taken[k.code] = true; });
    Object.keys(X.orgs).forEach(function (o) {
      var z = (X.orgs[o] && X.orgs[o].zones) || {};
      Object.keys(z).forEach(function (id) {
        if (o === exceptOrg && id === exceptZone) return;
        if (z[id] && z[id].code) taken[z[id].code] = true;
      });
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
      html += '<div class="table-wrap"><table class="table"><thead><tr><th>Organisation</th><th>Zones</th><th>People</th><th aria-label="Actions"></th></tr></thead><tbody>' +
        ids.map(function (id) {
          var o = X.orgs[id] || {}, zones = Object.keys(o.zones || {});
          return '<tr><td><span class="ex-org">' + swatch(o) + '<a class="pc-link" href="?tab=externals&org=' + encodeURIComponent(id) + '" data-org="' + esc(id) + '">' + esc(o.name || id) + '</a></span></td>' +
            '<td>' + zones.map(function (z) { return '<span class="pill pill--info">' + esc(o.zones[z].code) + '</span>'; }).join(' ') + '</td>' +
            '<td>' + people(id).length + '</td>' +
            '<td><span class="pc-actions"><a class="btn btn--ghost btn--sm" href="?tab=externals&org=' + encodeURIComponent(id) + '" data-org="' + esc(id) + '">' + C.icon('edit') + 'Open</a></span></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    box.innerHTML = html;
    $('exAddOrg').onclick = addOrg;
  }
  function swatch(o) {
    var a = hex(o.colours && o.colours.primary), b = hex(o.colours && o.colours.secondary);
    if (!a) return '';
    return '<span class="ex-swatch" aria-hidden="true"><i style="background:' + a + '"></i>' + (b ? '<i style="background:' + b + '"></i>' : '') + '</span>';
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

    html += '<section class="form-panel"><div class="form-panel__head">' + esc(o.name || id) + '</div><div class="form-panel__body"><div class="form-grid">' +
      '<div class="form-group"><label for="exName">Name</label><input type="text" id="exName" maxlength="120" value="' + esc(o.name || '') + '"></div>' +
      '<div class="form-group"><label for="exC1">Main colour</label><input type="color" id="exC1" value="' + (hex(o.colours && o.colours.primary) || '#333333') + '"></div>' +
      '<div class="form-group"><label for="exC2">Second colour</label><input type="color" id="exC2" value="' + (hex(o.colours && o.colours.secondary) || '#ffffff') + '"></div>' +
      '</div></div><div class="form-panel__foot pc-foot"><button class="btn btn--primary" type="button" id="exSaveOrg">Save</button></div></section>';

    html += '<div class="section-head"><h2>Zones</h2><span class="pc-actions"><button class="btn btn--ghost btn--sm" type="button" id="exAddZone">' + C.icon('add') + 'Add zone</button></span></div>';
    var zids = Object.keys(zones).sort(function (a, b) { return String(zones[a].name).localeCompare(String(zones[b].name)); });
    html += zids.length ? zids.map(function (z) { return zoneHtml(z, zones[z]); }).join('') :
      '<p class="pc-muted">No zones yet. A person needs at least one.</p>';

    var ppl = people(id);
    html += '<div class="section-head"><h2>People</h2></div>';
    html += ppl.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Person</th><th>Zones</th><th aria-label="Actions"></th></tr></thead><tbody>' +
      ppl.map(function (u) {
        var keys = (u.pass && u.pass.keys) || {};
        return '<tr><td><span class="pc-who"><a class="pc-who__name pc-link" href="?person=' + encodeURIComponent(u.uid) + '">' + esc(u.name || '(no name)') + '</a>' +
          '<span class="pc-who__sub">' + esc(u.email) + '</span></span></td>' +
          '<td>' + Object.keys(keys).map(function (z) {
            var zone = zones[z], until = keys[z] && keys[z].until;
            return '<span class="pill pill--info">' + esc(zone ? zone.code : z) + (until ? ' · to ' + esc(NL.formatDateShort(until)) : '') + '</span>';
          }).join(' ') + '</td>' +
          '<td><span class="pc-actions"><button class="btn btn--ghost btn--sm" type="button" data-zones="' + esc(u.uid) + '">' + C.icon('edit') + 'Zones</button></span></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="pc-muted">Nobody yet.</p>';

    html += '<section class="form-panel"><div class="form-panel__head">Add person</div><div class="form-panel__body"><div class="form-grid">' +
      '<div class="form-group"><label for="exPEmail">Email</label><input type="email" id="exPEmail" autocomplete="off"></div>' +
      '<div class="form-group"><label for="exPName">Full name</label><input type="text" id="exPName" autocomplete="off"></div>' +
      '<div class="form-group"><label for="exPJob">Job title</label><input type="text" id="exPJob" autocomplete="off" maxlength="80"></div>' +
      '<div class="form-group"><label for="exPUntil">Access ends</label><input type="date" id="exPUntil"><p class="form-hint">Leave empty to keep it until removed.</p></div>' +
      '<div class="form-group span2"><label>Zones</label><div class="pc-roles" id="exPZones">' +
        (zids.length ? zids.map(function (z) {
          return '<label class="pc-role"><input type="checkbox" value="' + esc(z) + '"><span><b>' + esc(zones[z].code) + '</b> ' + esc(zones[z].name) + '</span></label>';
        }).join('') : '<span class="pc-muted">Add a zone first.</span>') + '</div></div>' +
      '</div><p class="form-hint">They get an email from NL Tools to set their password.</p></div>' +
      '<div class="form-panel__foot pc-foot"><button class="btn btn--primary" type="button" id="exPAdd"' + (zids.length ? '' : ' disabled') + '>' + C.icon('send') + 'Set up and email</button></div></section>';

    $('exBody').innerHTML = html;
    $('exBack').onclick = function () { X.org = null; try { history.replaceState(null, '', '?tab=externals'); } catch (e) {} drawList(); };
    $('exSaveOrg').onclick = saveOrg;
    $('exAddZone').onclick = function () { editZone(null); };
    $('exPAdd').onclick = addPerson;
    $('exBody').querySelectorAll('[data-zone]').forEach(function (b) { b.onclick = function () { editZone(b.getAttribute('data-zone')); }; });
    $('exBody').querySelectorAll('[data-zones]').forEach(function (b) { b.onclick = function () { editPersonZones(b.getAttribute('data-zones')); }; });
  }

  function zoneHtml(id, z) {
    var tools = z.tools || {}, reg = C.S.registry || {};
    var rows = Object.keys(tools).map(function (k) {
      var t = tools[k], rec = reg[k], label = (rec && rec.label) || k;
      var gives = rec ? C.P.zoneGives(t, rec) : null;
      var view = t.view ? ' · ' + esc(C.P.VIEWS[t.view] || t.view) + (t.club ? ' (' + esc(t.club) + ')' : '') : '';
      return '<tr><td>' + esc(label) + '</td><td>' + (t.level === 'manage' ? 'Manage' : 'Access') + view +
        (gives ? '' : ' <span class="pill pill--rejected" title="The tool does not offer this to externals now">Not open</span>') + '</td>' +
        '<td class="pc-muted">' + esc(t.reason || '') + '</td></tr>';
    }).join('');
    return '<section class="form-panel"><div class="form-panel__head">' + esc(z.code) + ' · ' + esc(z.name) + '</div>' +
      '<div class="form-panel__body">' + (rows ? '<table class="table table--compact"><thead><tr><th>Tool</th><th>Gives</th><th>Why</th></tr></thead><tbody>' + rows + '</tbody></table>' :
        '<p class="pc-muted">Opens nothing yet.</p>') + '</div>' +
      '<div class="form-panel__foot pc-foot"><button class="btn btn--ghost btn--sm" type="button" data-zone="' + esc(id) + '">' + C.icon('edit') + 'Edit zone</button></div></section>';
  }

  function saveOrg() {
    var name = $('exName').value.trim();
    if (!name) return NL.toast('A name is needed', 'error');
    var o = X.orgs[X.org];
    var patch = { name: name.slice(0, 120), colours: { primary: $('exC1').value, secondary: $('exC2').value } };
    C.db.ref('externals/' + X.org).update(patch).then(function () {
      Object.assign(o, patch);
      NL.writeAudit('external_org_changed', 'Changed ' + patch.name);
      NL.toast('Saved', 'success');
      drawOrg();
    })['catch'](function (e) { NL.toast('Could not save: ' + (e && e.message || e), 'error'); });
  }

  /* ── A zone: its name, code, and what it opens ──────────────────────── */
  function editZone(zid) {
    var o = X.orgs[X.org], zones = o.zones || {}, z = zid ? zones[zid] : { name: '', code: '', tools: {} };
    var tools = offering();
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="form-grid">' +
        '<div class="form-group"><label for="exZName">Zone name</label><input type="text" id="exZName" maxlength="60" value="' + esc(z.name) + '"></div>' +
        '<div class="form-group"><label for="exZCode">Code</label><input type="text" id="exZCode" maxlength="3" value="' + esc(z.code) + '" style="text-transform:uppercase"></div>' +
      '</div>' +
      (tools.length ? '<table class="table table--compact ex-tools"><thead><tr><th>Tool</th><th>Gives</th><th>View</th><th>Why (kept with the grant)</th></tr></thead><tbody>' +
        tools.map(function (t) {
          var cur = (z.tools || {})[t.key] || {}, x = t.rec.externals || {}, views = (x.views || []);
          var levels = '<option value="off">Off</option><option value="access"' + (cur.level === 'access' ? ' selected' : '') + '>Access</option>' +
            (x.manage ? '<option value="manage"' + (cur.level === 'manage' ? ' selected' : '') + '>Manage</option>' : '');
          var view = hasClubData(t.rec) ? '<select class="nl-select" data-view="' + esc(t.key) + '">' + views.map(function (v) {
              return '<option value="' + esc(v) + '"' + (cur.view === v ? ' selected' : '') + '>' + esc(C.P.VIEWS[v] || v) + '</option>';
            }).join('') + '</select>' + (views.indexOf('one') >= 0 ? '<input type="text" class="ex-club" data-club="' + esc(t.key) + '" placeholder="Club code" maxlength="12" value="' + esc(cur.club || '') + '">' : '') :
            '<span class="pc-muted">No club data</span>';
          return '<tr><td>' + esc(t.label) + '</td>' +
            '<td><select class="nl-select" data-level="' + esc(t.key) + '">' + levels + '</select></td>' +
            '<td>' + view + '</td>' +
            '<td><input type="text" data-reason="' + esc(t.key) + '" maxlength="300" value="' + esc(cur.reason || '') + '"></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="pc-muted">No tool offers itself to externals yet. A tool is opened to them in its registry record, by pull request.</p>');
    var nameIn = wrap.querySelector('#exZName'), codeIn = wrap.querySelector('#exZCode');
    nameIn.addEventListener('input', function () {
      if (!zid && !codeIn.dataset.touched) codeIn.value = suggestCode(nameIn.value, codesTaken(X.org, zid));
    });
    codeIn.addEventListener('input', function () { codeIn.dataset.touched = '1'; });

    var buttons = [{ label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } }];
    if (zid) buttons.unshift({ label: 'Delete zone', className: 'btn--danger', onClick: function (c) { c.close(); deleteZone(zid); } });
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
    NL.modal({ title: zid ? 'Edit zone' : 'Add zone', size: 'lg', body: wrap, buttons: buttons });
  }

  /* The zone as the form says, checked: a name, a free three-letter code,
     and for every tool given, a reason; a club-data tool a view; One club
     a club. An unchanged tool keeps who gave it and when. */
  function readZone(wrap, old, zid) {
    var name = wrap.querySelector('#exZName').value.trim();
    var code = wrap.querySelector('#exZCode').value.trim().toUpperCase();
    if (!name) return { error: 'The zone needs a name' };
    if (!/^[A-Z]{3}$/.test(code)) return { error: 'The code is three letters' };
    if (codesTaken(X.org, zid)[code]) return { error: code + ' is already in use' };
    var tools = {}, err = null;
    offering().forEach(function (t) {
      if (err) return;
      var level = wrap.querySelector('[data-level="' + t.key + '"]').value;
      if (level === 'off') return;
      var reason = wrap.querySelector('[data-reason="' + t.key + '"]').value.trim();
      if (!reason) { err = 'Say why for ' + t.label; return; }
      var entry = { level: level, reason: reason.slice(0, 300) };
      if (hasClubData(t.rec)) {
        var v = wrap.querySelector('[data-view="' + t.key + '"]');
        entry.view = v && v.value;
        if (!entry.view) { err = t.label + ' needs a club view'; return; }
        if (entry.view === 'one') {
          var club = wrap.querySelector('[data-club="' + t.key + '"]');
          entry.club = club ? club.value.trim().toUpperCase() : '';
          if (!entry.club) { err = 'Name the club for ' + t.label; return; }
        }
      }
      var prev = (old.tools || {})[t.key];
      var same = prev && prev.level === entry.level && prev.reason === entry.reason && (prev.view || null) === (entry.view || null) && (prev.club || null) === (entry.club || null);
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
    NL.confirm('Delete ' + z.code + ' ' + z.name + '?' + (holders ? ' ' + holders + (holders === 1 ? ' person holds' : ' people hold') + ' it; they lose what it opens.' : ''),
      { title: 'Delete zone', confirmText: 'Delete', variant: 'danger' }).then(function (ok) {
      if (!ok) return;
      return C.db.ref('externals/' + X.org + '/zones/' + zid).remove().then(function () {
        delete o.zones[zid];
        NL.writeAudit('external_zone_deleted', (o.name || X.org) + ': ' + z.code + ' ' + z.name);
        NL.toast('Zone deleted', 'success');
        drawOrg();
      });
    })['catch'](function (e) { NL.toast('Could not delete: ' + (e && e.message || e), 'error'); });
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
  function editPersonZones(uid) {
    var u = (C.S.users || []).filter(function (x) { return x.uid === uid; })[0];
    if (!u) return;
    var o = X.orgs[X.org], zones = o.zones || {}, keys = (u.pass && u.pass.keys) || {};
    var firstUntil = null;
    Object.keys(keys).forEach(function (k) { if (keys[k] && typeof keys[k].until === 'number') firstUntil = keys[k].until; });
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="pc-roles">' + Object.keys(zones).map(function (z) {
        return '<label class="pc-role"><input type="checkbox" value="' + esc(z) + '"' + (keys[z] ? ' checked' : '') + '><span><b>' + esc(zones[z].code) + '</b> ' + esc(zones[z].name) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="form-group"><label for="exEUntil">Access ends</label><input type="date" id="exEUntil" value="' + dateInput(firstUntil) + '"><p class="form-hint">Leave empty to keep it until removed. Clear every zone to remove their access.</p></div>';
    NL.modal({ title: u.name || u.email, size: 'sm', body: wrap, buttons: [
      { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
      { label: 'Save', className: 'btn--primary', onClick: function (c) {
        var until = dateMs(wrap.querySelector('#exEUntil').value);
        var next = {};
        wrap.querySelectorAll('input[type=checkbox]:checked').forEach(function (i) {
          var z = i.value, old = keys[z];
          next[z] = old ? { given: old.given, by: old.by } : { given: Date.now(), by: C.S.session.uid };
          if (until) next[z].until = until;
        });
        var updates = {};
        updates['users/' + uid + '/pass/keys'] = Object.keys(next).length ? next : null;
        updates['users/' + uid + '/pass/updated'] = Date.now();
        updates['users/' + uid + '/pass/updatedBy'] = C.S.session.uid;
        C.db.ref().update(updates).then(function () {
          NL.writeAudit('external_zones_changed', (o.name || X.org) + ': ' +
            (Object.keys(next).map(function (z) { return zones[z].code; }).join(', ') || 'no zones') +
            (until ? ', to ' + NL.formatDateShort(until) : ''), { uid: uid, name: u.name, email: u.email });
          c.close();
          NL.toast('Saved', 'success');
          return C.refreshPeople().then(drawOrg);
        })['catch'](function (e) { NL.toast('Could not save: ' + (e && e.message || e), 'error'); });
      } }
    ] });
  }

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
