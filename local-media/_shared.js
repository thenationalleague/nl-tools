/* Local Media – pure logic shared by both pages and tests/local-media.test.mjs.
   Version: v1.0 (29/10/2026)
   File: /local-media/_shared.js

   v1.0 (29/10/2026): first build.

   No DOM, no Firebase, no NL.* – every function here is a pure function of
   its arguments, so the parts that put the wrong address on a press list
   (validation, which rows a filter keeps, which emails a copy hands over)
   are testable in node. The type and status keys below are also spelled out
   in system/rtdb/rules.snapshot.json; the test holds the two together. */
(function (root) {
  'use strict';

  var LM = {};

  /* Stored as the key; shown as the label. */
  LM.TYPES = [
    { key: 'newspaper', label: 'Newspaper' },
    { key: 'online',    label: 'Online news' },
    { key: 'radio',     label: 'Radio' },
    { key: 'tv',        label: 'TV' },
    { key: 'podcast',   label: 'Podcast' },
    { key: 'fanzine',   label: 'Fanzine' },
    { key: 'fansite',   label: 'Fan site / blog' },
    { key: 'creator',   label: 'Influencer / content creator' },
    { key: 'other',     label: 'Other' }
  ];

  /* The order is the order a contact moves through. */
  LM.STATUSES = [
    { key: 'new',       label: 'New' },
    { key: 'sent',      label: 'Confirmation sent' },
    { key: 'happy',     label: 'Happy to be contacted' },
    { key: 'opted-out', label: 'Opted out' }
  ];

  /* Club divisions as clubs-meta spells them, and the step each sits at. */
  LM.DIVISIONS = [
    { key: 'National', label: 'National League',       step: 1 },
    { key: 'North',    label: 'National League North', step: 2 },
    { key: 'South',    label: 'National League South', step: 2 }
  ];

  /* The rules' caps. Inputs carry them as maxlength, so a form cannot send
     what the database will refuse. */
  LM.MAX = { name: 120, organisation: 120, club: 120, email: 254, phone: 40 };

  /* A staff-added contact with no club: national journalists. */
  LM.LEAGUE = { key: '', name: 'League-wide' };

  function label(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
    return key || '';
  }
  LM.typeLabel = function (k) { return label(LM.TYPES, k); };
  LM.statusLabel = function (k) { return label(LM.STATUSES, k || 'new'); };
  LM.divisionLabel = function (k) { return label(LM.DIVISIONS, k); };
  LM.stepOf = function (division) {
    for (var i = 0; i < LM.DIVISIONS.length; i++) if (LM.DIVISIONS[i].key === division) return LM.DIVISIONS[i].step;
    return null;
  };

  function isKey(list, k) {
    for (var i = 0; i < list.length; i++) if (list[i].key === k) return true;
    return false;
  }
  LM.isType = function (k) { return isKey(LM.TYPES, k); };
  LM.isStatus = function (k) { return isKey(LM.STATUSES, k); };

  /* Deliberately loose: something@something.something, no spaces. The rules
     test the same shape; anything stricter refuses real addresses. */
  LM.isEmail = function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); };

  function trim(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  /* A contact as it is stored: trimmed, email lower-cased, and no empty
     name or phone. Name is optional: a contact may be a desk or newsroom
     inbox rather than a person. */
  LM.cleanContact = function (c) {
    c = c || {};
    var out = {
      organisation: trim(c.organisation),
      type: trim(c.type),
      email: trim(c.email).replace(/\s/g, '').toLowerCase()
    };
    var name = trim(c.name), phone = trim(c.phone);
    if (name) out.name = name;
    if (phone) out.phone = phone;
    return out;
  };

  /* { field: message } for whatever is wrong; {} when the contact is fine. */
  LM.contactErrors = function (c) {
    var e = {};
    c = LM.cleanContact(c);
    if (c.name && c.name.length > LM.MAX.name) e.name = 'Keep it under ' + LM.MAX.name + ' characters';
    if (!c.organisation) e.organisation = 'Enter the organisation';
    else if (c.organisation.length > LM.MAX.organisation) e.organisation = 'Keep it under ' + LM.MAX.organisation + ' characters';
    if (!LM.isType(c.type)) e.type = 'Choose a type';
    if (!c.email) e.email = 'Enter an email address';
    else if (!LM.isEmail(c.email) || c.email.length > LM.MAX.email) e.email = 'Check the email address';
    if (c.phone && c.phone.length > LM.MAX.phone) e.phone = 'Keep it under ' + LM.MAX.phone + ' characters';
    return e;
  };

  /* The whole node → one row per contact, club submissions and staff
     additions alike. divisionOf(clubKey) answers from clubs-meta; it is
     passed in so this file never has to know where clubs come from. */
  LM.rows = function (data, divisionOf) {
    data = data || {};
    var out = [], status = data.status || {};
    var div = typeof divisionOf === 'function' ? divisionOf : function () { return null; };
    var subs = data.submissions || {};
    Object.keys(subs).forEach(function (sid) {
      var s = subs[sid] || {}, cs = s.contacts || {};
      var by = (s.submitter && s.submitter.name) || '';
      var byEmail = (s.submitter && s.submitter.email) || '';
      Object.keys(cs).forEach(function (cid) {
        var c = cs[cid] || {};
        out.push({
          id: 's/' + sid + '/' + cid, source: 'club', sid: sid, cid: cid,
          club: s.club || '', clubKey: s.clubKey || '', division: div(s.clubKey || '') || null,
          name: c.name || '', organisation: c.organisation || '', type: c.type || '',
          email: c.email || '', phone: c.phone || '',
          by: by, byEmail: byEmail, at: s.at || 0,
          status: (status[sid] && status[sid][cid]) || 'new'
        });
      });
    });
    var man = data.manual || {};
    Object.keys(man).forEach(function (mid) {
      var m = man[mid] || {};
      out.push({
        id: 'm/' + mid, source: 'staff', mid: mid,
        club: m.club || LM.LEAGUE.name, clubKey: m.clubKey || '', division: m.clubKey ? (div(m.clubKey) || null) : null,
        name: m.name || '', organisation: m.organisation || '', type: m.type || '',
        email: m.email || '', phone: m.phone || '',
        by: (m.addedBy && m.addedBy.name) || '', byEmail: '', at: m.at || 0,
        status: m.status || 'new'
      });
    });
    /* A press list reads by club: club, then organisation, then name.
       League-wide sorts first, as it has no club. */
    out.sort(function (a, b) {
      var ak = a.clubKey ? a.club : '', bk = b.clubKey ? b.club : '';
      return ak.localeCompare(bk) || a.organisation.localeCompare(b.organisation) || a.name.localeCompare(b.name);
    });
    return out;
  };

  /* Every filter combines. f = { clubs: [clubKey…] ('' = League-wide),
     division, step, type, status, q }; an empty value means "any".
     A division or step filter keeps club contacts only: a League-wide
     contact has no division to match. Pick League-wide in the club filter
     to bring them in. */
  LM.filter = function (rows, f) {
    f = f || {};
    var clubs = f.clubs && f.clubs.length ? f.clubs : null;
    var step = f.step ? +f.step : null;
    var q = trim(f.q).toLowerCase();
    return (rows || []).filter(function (r) {
      if (clubs && clubs.indexOf(r.clubKey) < 0) return false;
      if (f.division && r.division !== f.division) return false;
      if (step && LM.stepOf(r.division) !== step) return false;
      if (f.type && r.type !== f.type) return false;
      if (f.status && r.status !== f.status) return false;
      if (q) {
        var hay = [r.club, r.name, r.organisation, r.email, r.phone, r.by, LM.typeLabel(r.type)].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  };

  /* Addresses to paste into BCC: once each, and never an opted-out one –
     copying those is how somebody gets emailed after saying no. */
  LM.emails = function (rows) {
    var seen = {}, list = [], skipped = 0;
    (rows || []).forEach(function (r) {
      var e = String(r.email || '').toLowerCase();
      if (!e) return;
      if (r.status === 'opted-out') { skipped++; return; }
      if (seen[e]) return;
      seen[e] = true;
      list.push(e);
    });
    return { list: list, skipped: skipped };
  };

  /* Rows for NL.csv. fmtDate is the caller's (NL.formatDateShort). */
  LM.csvRows = function (rows, fmtDate) {
    var d = typeof fmtDate === 'function' ? fmtDate : function (x) { return x ? String(x) : ''; };
    var out = [['Club', 'Division', 'Name', 'Organisation', 'Type', 'Email', 'Phone', 'Status', 'Submitted by', 'Submitter email', 'Date', 'Source']];
    (rows || []).forEach(function (r) {
      out.push([r.club, r.division ? LM.divisionLabel(r.division) : '', r.name, r.organisation, LM.typeLabel(r.type),
        r.email, r.phone, LM.statusLabel(r.status), r.by, r.byEmail, r.at ? d(r.at) : '',
        r.source === 'staff' ? 'Added by staff' : 'Club']);
    });
    return out;
  };

  root.LM = LM;
})(typeof window !== 'undefined' ? window : this);
