/* Media Accreditation – pure logic shared by the pages and
   tests/accreditation.test.mjs.
   Version: v1.0 (01/11/2026)
   File: /accreditation/_shared.js

   CHANGELOG
     v1.0 (01/11/2026) – Slice 1: licence types, organisation types, the
       application's shape and caps, which route and first status an
       application takes, the automatic checks staff see (spec §6.1), the
       season key, the reference shown to the applicant and the "received"
       email.

   No DOM, no Firebase, no NL.* – every function is a pure function of its
   arguments, so the parts that decide who is flagged and where an
   application goes can be tested in node. The caps, keys and statuses here
   are spelled out again in system/rtdb/rules.snapshot.json; the test holds
   the two together. Spec: system/media-accreditation-plan.md. */
(function (root) {
  'use strict';

  var AC = {};

  /* ── licence types ──────────────────────────────────────────────────────
     A type is a record, not a branch in the code: adding video later means
     adding entries here (and their agreement in config/agreements/<key>),
     not rebuilding the form. `offered: false` types are shown nowhere yet. */
  AC.TYPES = [
    { key: 'photography', label: 'Photography', offered: true, phase: 1 }
  ];
  AC.typeLabel = function (k) { return label(AC.TYPES, k); };

  /* Organisation types (spec §5). `route` is decided by this, nothing else:
     club photographers are covered by the League's central policy (club
     guide §6.14) and confirmed by their club; everyone else brings their own
     insurance and goes straight to staff. */
  AC.ORG_TYPES = [
    { key: 'freelance', label: 'Freelance',    route: 'standard' },
    { key: 'agency',    label: 'Agency',       route: 'standard', team: true },
    { key: 'outlet',    label: 'Media outlet', route: 'standard', team: true },
    { key: 'club',      label: 'Club',         route: 'club' },
    { key: 'other',     label: 'Other',        route: 'standard' }
  ];
  AC.orgLabel = function (k) { return label(AC.ORG_TYPES, k); };
  AC.routeFor = function (orgType) {
    var o = find(AC.ORG_TYPES, orgType);
    return o ? o.route : null;
  };
  AC.isTeam = function (orgType) {
    var o = find(AC.ORG_TYPES, orgType);
    return !!(o && o.team);
  };

  /* Where the photos will be published (spec §5, "Use"). */
  AC.USES = [
    { key: 'club',    label: 'Club channels' },
    { key: 'agency',  label: 'Agency sales' },
    { key: 'website', label: 'My own website' },
    { key: 'print',   label: 'Newspaper or magazine' },
    { key: 'other',   label: 'Other' }
  ];

  /* The order is the order an application moves through. Slice 1 creates the
     first three; the rest arrive with the staff and club actions. */
  AC.STATUSES = [
    { key: 'awaiting-guardian', label: 'Awaiting guardian' },
    { key: 'awaiting-club',     label: 'Awaiting club' },
    { key: 'awaiting-staff',    label: 'Awaiting staff' },
    { key: 'declined',          label: 'Declined' },
    { key: 'approved',          label: 'Approved' }
  ];
  AC.statusLabel = function (k) { return label(AC.STATUSES, k); };

  /* Where a new application starts. An under-18 cannot reach anyone until a
     guardian has signed (spec §7); a club-route application goes to its
     club before staff (§4.1). The rules enforce the same three answers. */
  AC.initialStatus = function (app) {
    if (app && app.under18) return 'awaiting-guardian';
    if (app && app.route === 'club') return 'awaiting-club';
    return 'awaiting-staff';
  };

  /* Caps. Each one is also a .validate in the rules. */
  AC.MAX = {
    name: 120, email: 254, phone: 40, address: 300, relationship: 60,
    previousLicence: 20, orgName: 120, photographers: 20,
    insurer: 120, policyNumber: 60, namedInsured: 160, explanation: 500,
    useOther: 200, clubsCovered: 300, refusedDetail: 500,
    agreementText: 50000
  };
  AC.MIN_COVER = 2000000;          /* £2m public liability (spec §6.1) */
  AC.EXPIRY_WARN_DAYS = 30;
  AC.PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  AC.DOC_MAX_BYTES = 10 * 1024 * 1024;
  AC.PHOTO_TYPES = ['image/jpeg', 'image/png'];
  AC.DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

  var EMAIL_RE = /^[^ @]+@[^ @]+[.][^ @]+$/;
  var YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* ── season ─────────────────────────────────────────────────────────────
     '2627' for the season starting 2026. The start year comes from
     NL.season.fromDate in the page, so the 1 July boundary is decided in one
     place; this only spells it the way licence numbers do (NL2627-###). */
  AC.seasonKey = function (startYear) {
    var y = Number(startYear);
    return pad2(y % 100) + pad2((y + 1) % 100);
  };
  AC.seasonLabel = function (key) {
    var k = String(key || '');
    return k.length === 4 ? '20' + k.slice(0, 2) + '–' + k.slice(2) : k;
  };

  /* The reference an applicant is shown and quotes back. Not a licence
     number – those are issued on approval. */
  AC.reference = function (season, id) {
    return 'A' + season + '-' + String(id || '').slice(-6).toUpperCase();
  };

  /* ── tidying what was typed ───────────────────────────────────────────── */
  AC.clean = function (s, max) {
    var v = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return max ? v.slice(0, max) : v;
  };
  AC.cleanEmail = function (s) { return AC.clean(s, AC.MAX.email).toLowerCase(); };

  /* "£2,000,000", "2m", "2 million", "5000000" → pounds as a number. */
  AC.parseMoney = function (s) {
    var t = String(s == null ? '' : s).toLowerCase().replace(/[£,\s]/g, '');
    if (!t) return null;
    var mult = 1;
    if (/(m|million|mil)$/.test(t)) { mult = 1e6; t = t.replace(/(million|mil|m)$/, ''); }
    else if (/k$/.test(t)) { mult = 1e3; t = t.replace(/k$/, ''); }
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    return Math.round(parseFloat(t) * mult);
  };

  AC.ageOn = function (dobYmd, todayYmd) {
    if (!YMD_RE.test(dobYmd || '') || !YMD_RE.test(todayYmd || '')) return null;
    var b = dobYmd.split('-').map(Number), t = todayYmd.split('-').map(Number);
    var age = t[0] - b[0];
    if (t[1] < b[1] || (t[1] === b[1] && t[2] < b[2])) age--;
    return age;
  };

  /* ── validation ─────────────────────────────────────────────────────────
     Returns { <field>: message } for what is wrong; empty means send it.
     `today` is 'YYYY-MM-DD'. The page shows the messages beside each field;
     the rules refuse the same shapes whatever the page does. */
  AC.validate = function (app, today) {
    var e = {};
    app = app || {};
    var p = app.person || {};
    if (!p.name) e.name = 'Enter your full name.';
    if (!p.email || !EMAIL_RE.test(p.email)) e.email = 'Enter an email address we can reach you on.';
    if (!p.phone) e.phone = 'Enter a phone number.';
    if (!p.address) e.address = 'Enter your address.';
    if (!app.photo) e.photo = 'Add a passport-style photo.';
    if (app.under18 !== true && app.under18 !== false) e.under18 = 'Tell us whether you are under 18.';

    if (app.under18) {
      var age = AC.ageOn(app.dob, today);
      if (age === null) e.dob = 'Enter your date of birth.';
      else if (age >= 18) e.dob = 'This date of birth makes you 18 or over. Change it, or answer No above.';
      else if (age < 10) e.dob = 'Check the year of your date of birth.';
      var g = app.guardian || {};
      if (!g.name) e.guardianName = 'Enter your parent or guardian’s name.';
      if (!g.email || !EMAIL_RE.test(g.email)) e.guardianEmail = 'Enter your parent or guardian’s email.';
      else if (p.email && g.email === p.email) e.guardianEmail = 'Use your parent or guardian’s own email, not yours.';
      if (!g.relationship) e.guardianRelationship = 'Say how they are related to you.';
    }

    var route = AC.routeFor(app.orgType);
    if (!route) e.orgType = 'Choose who you take photos for.';
    if (app.under18 && route && route !== 'club') {
      e.orgType = 'Under-18s can only apply through their club.';
    }

    if (route === 'club') {
      if (!app.club || !app.clubCode) e.club = 'Choose your club.';
      if (app.paidOrVolunteer !== 'paid' && app.paidOrVolunteer !== 'volunteer') e.paidOrVolunteer = 'Choose paid or volunteer.';
    }
    if (AC.isTeam(app.orgType)) {
      var o = app.org || {};
      if (!o.name) e.orgName = 'Enter the company name.';
      if (!o.holder) e.orgHolder = 'Enter who holds the licence.';
      var ph = app.photographers || [];
      if (!ph.length) e.photographers = 'Add at least one photographer.';
      if (ph.length > AC.MAX.photographers) e.photographers = 'Up to ' + AC.MAX.photographers + ' photographers on one application.';
      ph.forEach(function (x, i) {
        if (!x.name) e['photographer' + i + 'Name'] = 'Enter this photographer’s name.';
        if (!x.photo) e['photographer' + i + 'Photo'] = 'Add this photographer’s photo.';
      });
    }

    if (route === 'standard') {
      var ins = app.insurance || {};
      if (!ins.insurer) e.insurer = 'Enter the insurer.';
      if (!ins.policyNumber) e.policyNumber = 'Enter the policy number.';
      if (!(typeof ins.limit === 'number' && ins.limit > 0)) e.limit = 'Enter the public liability limit, e.g. £5,000,000.';
      if (!YMD_RE.test(ins.start || '')) e.insStart = 'Enter the start date.';
      if (!YMD_RE.test(ins.expiry || '')) e.insExpiry = 'Enter the expiry date.';
      else if (YMD_RE.test(ins.start || '') && ins.expiry <= ins.start) e.insExpiry = 'The expiry must be after the start.';
      if (!ins.namedInsured) e.namedInsured = 'Enter the name on the policy, exactly as on the schedule.';
      if (ins.inMyName !== true && !ins.explanation) e.explanation = 'Explain whose name the policy is in.';
      if (!ins.schedule) e.schedule = 'Upload the insurance schedule.';
    }

    var u = app.use || {};
    var anyUse = AC.USES.some(function (x) { return u.channels && u.channels[x.key]; });
    if (!anyUse) e.use = 'Choose at least one.';
    if (u.channels && u.channels.other && !u.otherText) e.useOther = 'Say where else.';

    var d = app.declarations || {};
    if (d.refusedBefore !== true && d.refusedBefore !== false) e.refusedBefore = 'Answer this question.';
    if (d.refusedBefore === true && !d.refusedDetail) e.refusedDetail = 'Tell us what happened.';
    if (!app.signatureName) e.signatureName = 'Type your full name to sign.';
    else if (p.name && norm(app.signatureName) !== norm(p.name)) e.signatureName = 'Type your name exactly as above.';
    if (d.agree !== true) e.agree = 'You need to agree to the terms.';
    if (d.accurate !== true) e.accurate = 'Confirm the information is accurate.';
    if (d.dataConsent !== true) e.dataConsent = 'We need your consent to process this information.';
    return e;
  };

  /* ── the record the page writes ─────────────────────────────────────────
     Turns the form's answers into exactly the shape the rules accept, so an
     answer to a question the route never asked (insurance on a club route,
     a guardian when over 18) is never stored. Server timestamps are the
     caller's: `now` is passed in as firebase.database.ServerValue.TIMESTAMP. */
  AC.record = function (app, ctx) {
    var route = AC.routeFor(app.orgType);
    var r = {
      uid: ctx.uid,
      type: 'photography',
      route: route,
      orgType: app.orgType,
      person: {
        name: AC.clean(app.person.name, AC.MAX.name),
        email: AC.cleanEmail(app.person.email),
        phone: AC.clean(app.person.phone, AC.MAX.phone),
        address: AC.clean(app.person.address, AC.MAX.address)
      },
      photo: app.photo,
      under18: !!app.under18,
      use: { channels: {} },
      declarations: {
        refusedBefore: !!app.declarations.refusedBefore,
        accurate: true,
        dataConsent: true
      },
      signature: {
        name: AC.clean(app.signatureName, AC.MAX.name),
        agreementVersion: ctx.agreementVersion,
        at: ctx.now
      },
      status: null,
      source: 'form',
      createdAt: ctx.now
    };
    var prev = String(app.previousLicence || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, AC.MAX.previousLicence);
    if (prev) r.previousLicence = prev;
    if (r.under18) {
      r.dob = app.dob;
      r.guardian = {
        name: AC.clean(app.guardian.name, AC.MAX.name),
        email: AC.cleanEmail(app.guardian.email),
        relationship: AC.clean(app.guardian.relationship, AC.MAX.relationship)
      };
    }
    if (route === 'club') {
      r.club = app.club;
      r.clubCode = app.clubCode;
      r.paidOrVolunteer = app.paidOrVolunteer;
    }
    if (AC.isTeam(app.orgType)) {
      r.org = { name: AC.clean(app.org.name, AC.MAX.orgName), holder: AC.clean(app.org.holder, AC.MAX.name) };
      r.photographers = {};
      (app.photographers || []).forEach(function (x) {
        r.photographers[x.id] = { name: AC.clean(x.name, AC.MAX.name), photo: x.photo };
      });
    }
    if (route === 'standard') {
      var ins = app.insurance;
      r.insurance = {
        insurer: AC.clean(ins.insurer, AC.MAX.insurer),
        policyNumber: AC.clean(ins.policyNumber, AC.MAX.policyNumber),
        limit: ins.limit,
        start: ins.start,
        expiry: ins.expiry,
        namedInsured: AC.clean(ins.namedInsured, AC.MAX.namedInsured),
        inMyName: ins.inMyName === true,
        schedule: ins.schedule
      };
      if (ins.inMyName !== true) r.insurance.explanation = AC.clean(ins.explanation, AC.MAX.explanation);
    }
    AC.USES.forEach(function (x) { if (app.use.channels[x.key]) r.use.channels[x.key] = true; });
    if (r.use.channels.other) r.use.otherText = AC.clean(app.use.otherText, AC.MAX.useOther);
    var covered = AC.clean(app.use.clubsCovered, AC.MAX.clubsCovered);
    if (covered) r.use.clubsCovered = covered;
    if (r.declarations.refusedBefore) r.declarations.refusedDetail = AC.clean(app.declarations.refusedDetail, AC.MAX.refusedDetail);
    r.status = AC.initialStatus(r);
    return r;
  };

  /* Storage paths. Under the anonymous uid, so the Storage rules can confine
     each session to its own folder (they cannot read RTDB). */
  AC.storageBase = function (season, uid, id) {
    return 'accreditation/' + season + '/' + uid + '/' + id + '/';
  };
  AC.extFor = function (type) {
    return type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg';
  };

  /* ── automatic checks (spec §6.1) ───────────────────────────────────────
     Shown to staff, never decisive. Each is { key, label, flag, detail }.
     `others` is every other application this season, for the duplicate
     check. Computed when shown rather than stored, so a duplicate that
     arrives later still flags the earlier record. */
  AC.checks = function (app, today, others) {
    var out = [];
    var route = app.route;
    if (route === 'standard') {
      var ins = app.insurance || {};
      var who = [app.person && app.person.name, app.org && app.org.name, app.org && app.org.holder];
      var named = nameMatches(ins.namedInsured, who);
      out.push({
        key: 'policyName', label: 'Name on policy',
        flag: !named || ins.inMyName !== true,
        detail: ins.inMyName !== true ? 'Applicant says the policy is not in their name: ' + (ins.explanation || '')
          : named ? 'Matches' : '“' + (ins.namedInsured || '') + '” does not match the applicant or organisation'
      });
      out.push({
        key: 'cover', label: 'Cover limit',
        flag: !(ins.limit >= AC.MIN_COVER),
        detail: ins.limit >= AC.MIN_COVER ? money(ins.limit) : money(ins.limit) + ' is under ' + money(AC.MIN_COVER)
      });
      var days = YMD_RE.test(ins.expiry || '') ? daysBetween(today, ins.expiry) : null;
      var future = YMD_RE.test(ins.start || '') && ins.start > today;
      out.push({
        key: 'insDates', label: 'Insurance dates',
        flag: future || days === null || days < AC.EXPIRY_WARN_DAYS,
        detail: future ? 'Starts in the future (' + ins.start + ')'
          : days === null ? 'No expiry date'
          : days < 0 ? 'Expired ' + (-days) + ' days ago'
          : days < AC.EXPIRY_WARN_DAYS ? 'Ends in ' + days + ' days'
          : 'Ends ' + ins.expiry
      });
    }
    if (app.under18) {
      var guardianSigned = !!(app.guardianSignature && app.guardianSignature.at);
      out.push({
        key: 'under18', label: 'Under 18',
        flag: route !== 'club' || !guardianSigned,
        detail: route !== 'club' ? 'Not on the club route' : guardianSigned ? 'Guardian has signed' : 'Guardian has not signed yet'
      });
    }
    var dup = AC.duplicates(app, others);
    out.push({
      key: 'duplicate', label: 'Duplicate',
      flag: dup.length > 0,
      detail: dup.length ? dup.length + ' other application' + (dup.length === 1 ? '' : 's') + ' this season with the same ' +
        (dup.some(function (d) { return d.why === 'email'; }) ? 'email' : 'name and date of birth') : 'None found'
    });
    var refused = !!(app.declarations && app.declarations.refusedBefore);
    out.push({
      key: 'refusal', label: 'Previous refusal',
      flag: refused,
      detail: refused ? 'Says yes: ' + (app.declarations.refusedDetail || '') : 'Says no'
    });
    return out;
  };

  AC.duplicates = function (app, others) {
    var out = [];
    var email = app.person && app.person.email;
    var key = app.dob ? norm(app.person && app.person.name) + '|' + app.dob : null;
    (others || []).forEach(function (o) {
      if (!o || o.id === app.id) return;
      if (email && o.person && o.person.email === email) { out.push({ id: o.id, why: 'email' }); return; }
      if (key && o.dob && norm(o.person && o.person.name) + '|' + o.dob === key) out.push({ id: o.id, why: 'name+dob' });
    });
    return out;
  };

  AC.flagCount = function (checks) {
    return (checks || []).filter(function (c) { return c.flag; }).length;
  };

  /* ── emails (spec §13) ──────────────────────────────────────────────────
     Slice 1 has no email shim: these are written to the Outbox for staff to
     copy. Plain text, so a copy into any mail client keeps its shape. */
  /* What happens next, in one sentence – shown on the form's done screen and
     used in the "received" email, so the two never disagree. */
  AC.nextStep = function (status, club) {
    if (status === 'awaiting-guardian') return 'Your parent or guardian also needs to sign. We will email them separately.';
    if (status === 'awaiting-club') return 'We will ask ' + (club || 'your club') + ' to confirm you take photos for them, then review your application.';
    return 'We will review it and email you with the outcome.';
  };

  AC.email = function (template, d) {
    d = d || {};
    if (template === 'received') {
      return {
        subject: 'Photography licence application received – ' + d.ref,
        body: 'Dear ' + (d.name || 'applicant') + ',\n\n' +
          'Thank you for applying for a National League photography licence for the ' + AC.seasonLabel(d.season) + ' season. ' +
          'Your reference is ' + d.ref + '.\n\n' + AC.nextStep(d.status, d.club) + '\n\n' +
          'The National League'
      };
    }
    return null;
  };

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function find(list, k) {
    for (var i = 0; i < list.length; i++) if (list[i].key === k) return list[i];
    return null;
  }
  function label(list, k) { var x = find(list, k); return x ? x.label : String(k || ''); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/\b(ltd|limited|llp|plc|t\/a|trading as|mr|mrs|ms|miss|dr)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  /* A policy name matches if every word of one of the candidate names is in
     it ("J Smith Photography Ltd" matches "J Smith"), or it is wholly inside
     one ("Smith" alone does not match "John Smith" – that is a flag, and a
     flag is cheap). */
  function nameMatches(policy, candidates) {
    var pw = norm(policy).split(' ').filter(Boolean);
    if (!pw.length) return false;
    return candidates.some(function (c) {
      var cw = norm(c).split(' ').filter(Boolean);
      if (!cw.length) return false;
      return cw.every(function (w) { return pw.indexOf(w) !== -1; });
    });
  }
  AC._nameMatches = nameMatches;
  function daysBetween(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }
  function money(n) {
    if (typeof n !== 'number') return '—';
    return '£' + n.toLocaleString('en-GB');
  }

  root.AC = AC;
})(typeof window !== 'undefined' ? window : this);
