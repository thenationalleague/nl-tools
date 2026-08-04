/* =========================================================================
   NL Tools — Club Directory presentation
   File: /club-directory/_directory.js
   Version: v1.0 (04/08/2026)

   Renders one club. Shared by the staff directory, the editor and the reader,
   so the presentation is written once and the three doors differ only in what
   they let you do to it.

   The page answers one question, and the layout follows from it: somebody
   needs to reach a named person at a club, often on a phone, often standing
   at a ground. So:

     · the six posts the League actually chases are pinned at the top, and a
       missing one is stated in amber rather than silently absent — an empty
       row there is the most useful thing on the page
     · every email and number is a live mailto:/tel:, because the alternative
       is copying a phone number off a screen by hand
     · people are grouped by department and carry the title that fits that
       department, which is what the whole contacts exercise was for. Someone
       covering several also gets a quiet "also in ..." line, so a person is
       findable under Commercial without pretending they only do commercial
     · ground, travel and sponsors sit below the people. They matter on a
       matchday, not on a Tuesday.

   Nothing here knows about Firebase. Callers hand it a record.
   ========================================================================= */
(function () {
  'use strict';

  var esc = (window.NL && NL.escHtml) || function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* Department order. Leadership and the board first because that is how a
     club introduces itself; Other last because it is a shrug. */
  var ORDER = ['Leadership', 'Directors', 'Executive', 'Club secretary',
    'Matchday & safety', 'Safeguarding & welfare', 'Medical', 'Media & marketing',
    'Programme', 'Commercial', 'Ticketing', 'Finance', 'Community',
    'Team operations', 'Other'];

  /* The six the League chases. Five are mailing lists a club must fill;
     safeguarding has no list of its own, so it resolves from the section —
     which is the whole reason it is listed here rather than left to chance. */
  var KEY_POSTS = [
    { k: 'secretary', label: 'Club secretary' },
    { k: 'safety',    label: 'Safety officer' },
    { k: null,        label: 'Safeguarding',   section: 'Safeguarding & welfare' },
    { k: 'slo',       label: 'Supporter liaison' },
    { k: 'dlo',       label: 'Disability liaison' },
    { k: 'plo',       label: 'Police liaison' }
  ];

  var SOCIALS = [['x', 'X'], ['facebook', 'Facebook'], ['instagram', 'Instagram'],
    ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn']];

  function fullName(p) {
    return (p && (p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || '')).trim();
  }
  function emailsOf(p) {
    return ((p && p.emails) || []).filter(function (e) { return e && e.trim(); });
  }
  function phonesOf(p) {
    return ((p && p.phones) || []).filter(function (x) { return x && (x.number || '').trim(); });
  }
  function reachable(p) { return emailsOf(p).length > 0 || phonesOf(p).length > 0; }

  /* Live RTDB stores leads as bare person ids. Older exports expand them to
     objects. Accept both rather than making the caller normalise. */
  function leadPeople(rec, key) {
    var raw = (rec.leads || {})[key] || [];
    var byId = {};
    (rec.people || []).forEach(function (p) { if (p.id) { byId[p.id] = p; } });
    return raw.map(function (n) {
      if (typeof n === 'string') { return byId[n] || null; }
      return (n && (byId[n.id] || (n.name ? { name: n.name } : null))) || null;
    }).filter(Boolean);
  }
  function sectionPeople(rec, section) {
    return (rec.people || []).filter(function (p) {
      return (p.roles || []).some(function (r) { return r.section === section; });
    });
  }

  /* ---------------------------------------------------------------- bits */
  function contactLinks(p, opts) {
    if (p.hideContact && !(opts && opts.showHidden)) {
      return '<div class="cd-person__none">Not published</div>';
    }
    var out = emailsOf(p).map(function (e) {
      return '<a href="mailto:' + esc(e) + '">' + esc(e) + '</a>';
    });
    phonesOf(p).forEach(function (x) {
      var n = (x.number || '').trim(), ext = (x.ext || '').trim();
      out.push('<a href="tel:' + esc(n.replace(/\s+/g, '')) + '">' + esc(n) +
        (ext ? ' <span class="cd-person__ext">ext ' + esc(ext) + '</span>' : '') + '</a>');
    });
    if (!out.length) { return '<div class="cd-person__none">No contact details held</div>'; }
    return '<div class="cd-person__contact">' + out.join('') + '</div>';
  }

  function personCard(p, section, opts) {
    var here = (p.roles || []).filter(function (r) { return r.section === section; });
    var titles = here.map(function (r) { return (r.title || '').trim(); }).filter(Boolean);
    var elsewhere = [];
    (p.roles || []).forEach(function (r) {
      if (r.section !== section && elsewhere.indexOf(r.section) < 0) { elsewhere.push(r.section); }
    });
    return '<li class="cd-person">' +
      '<div class="cd-person__name">' + esc(fullName(p) || 'Name not given') + '</div>' +
      (titles.length
        ? '<div class="cd-person__roles">' + esc(titles.join(' &middot; ')) + '</div>'
        : '<div class="cd-person__roles"><em>No job title given</em></div>') +
      (elsewhere.length
        ? '<div class="cd-person__roles">Also in ' + esc(elsewhere.join(', ')) + '</div>' : '') +
      contactLinks(p, opts) +
      '</li>';
  }

  function keyPosts(rec, opts) {
    var rows = KEY_POSTS.map(function (K) {
      var who = K.k ? leadPeople(rec, K.k) : sectionPeople(rec, K.section);
      if (!who.length) {
        return '<div class="cd-key__row cd-key__row--gap">' +
          '<div class="cd-key__lab">' + esc(K.label) + '</div>' +
          '<div class="cd-key__who"><span class="cd-key__gap">Nobody named</span></div></div>';
      }
      return '<div class="cd-key__row">' +
        '<div class="cd-key__lab">' + esc(K.label) + '</div>' +
        '<div class="cd-key__who">' + who.map(function (p) {
          return '<div class="cd-key__name">' + esc(fullName(p)) + '</div>' +
            contactLinks(p, opts);
        }).join('') + '</div></div>';
    });
    return '<div class="cd-key">' + rows.join('') + '</div>';
  }

  function fact(k, v) {
    if (!v) { return ''; }
    return '<div class="cd-fact"><div class="cd-fact__k">' + esc(k) + '</div>' +
      '<div class="cd-fact__v">' + v + '</div></div>';
  }

  function num(v) {
    var n = String(v || '').replace(/[^0-9]/g, '');
    return n ? Number(n).toLocaleString('en-GB') : esc(v || '');
  }

  /* ---------------------------------------------------------------- render */
  function renderClub(rec, opts) {
    opts = opts || {};
    var info = rec.info || {};
    var addr = [info.addr1, info.addr2, info.town, info.county, info.postcode]
      .filter(function (x) { return (x || '').trim(); }).map(esc).join(', ');

    var socials = SOCIALS.map(function (s) {
      var u = (info[s[0]] || '').trim();
      if (!u) { return ''; }
      var href = /^https?:\/\//i.test(u) ? u : 'https://' + u;
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(s[1]) + '</a>';
    }).filter(Boolean).join('');

    var depts = ORDER.map(function (s) {
      var who = sectionPeople(rec, s);
      if (!who.length) { return ''; }
      return '<div class="cd-dept"><h3 class="cd-dept__h">' + esc(s) + '</h3>' +
        '<ul class="cd-people">' +
        who.map(function (p) { return personCard(p, s, opts); }).join('') +
        '</ul></div>';
    }).filter(Boolean).join('');
    depts = depts ? '<div class="cd-depts">' + depts + '</div>' : '';

    var total = (rec.people || []).length;
    var reach = (rec.people || []).filter(reachable).length;

    return '' +
      '<div class="cd-hero">' +
        '<img class="cd-hero__crest" id="cdCrest" alt="" hidden>' +
        '<div class="cd-hero__t">' +
          '<h1 class="cd-hero__name">' + esc(rec.club || '') + '</h1>' +
          '<div class="cd-hero__meta">' +
            (info.stadium ? '<span><b>' + esc(info.stadium) + '</b></span>' : '') +
            (info.town ? '<span>' + esc(info.town) + '</span>' : '') +
            (rec.division ? '<span>' + esc(rec.division) + '</span>' : '') +
            '<span>' + total + ' people, ' + reach + ' contactable</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<section class="cd-sec">' +
        '<h2 class="cd-sec__h">Key contacts</h2>' +
        '<p class="cd-sec__note">The posts the League writes to directly. A blank ' +
        'row is a gap we need the club to fill, not an oversight in this page.</p>' +
        keyPosts(rec, opts) +
      '</section>' +

      '<section class="cd-sec">' +
        '<h2 class="cd-sec__h">People</h2>' +
        '<p class="cd-sec__note">Grouped by department, each with the job title that ' +
        'fits that department. Anyone covering more than one says so.</p>' +
        (depts || '<p class="cd-empty">No people held for this club yet.</p>') +
      '</section>' +

      '<section class="cd-sec">' +
        '<h2 class="cd-sec__h">Ground and club details</h2>' +
        '<div class="cd-facts">' +
          fact('Stadium', esc(info.stadium || '') +
            (info.stadiumSponsor ? ' <span class="cd-person__ext">(' +
              esc(info.stadiumSponsor) + ')</span>' : '')) +
          fact('Address', addr) +
          fact('Capacity', info.capacity ? num(info.capacity) +
            (info.seated ? ' <span class="cd-person__ext">' + num(info.seated) +
              ' seated</span>' : '') : '') +
          fact('Pitch', [info.pitchDims, info.pitchType].filter(Boolean).map(esc).join(' &middot; ')) +
          fact('Nearest station', esc(info.station || '') +
            (info.stationDistance ? ' <span class="cd-person__ext">' +
              esc(info.stationDistance) + ' miles</span>' : '')) +
          fact('County FA', esc(info.countyFA || '')) +
          fact('Switchboard', info.phone
            ? '<a href="tel:' + esc(info.phone.replace(/\s+/g, '')) + '">' + esc(info.phone) + '</a>' : '') +
          fact('Main email', info.mainEmail
            ? '<a href="mailto:' + esc(info.mainEmail) + '">' + esc(info.mainEmail) + '</a>' : '') +
          fact('Website', info.website
            ? '<a href="' + esc(/^https?:/i.test(info.website) ? info.website : 'https://' + info.website) +
              '" target="_blank" rel="noopener">' + esc(info.website) + '</a>' : '') +
          fact('Club sponsor', esc(info.spClub || '')) +
          fact('Shirt front', esc(info.spFront || '')) +
          fact('Sleeve', esc(info.spSleeve || '')) +
          fact('Social', socials ? '<div class="cd-socials">' + socials + '</div>' : '') +
        '</div>' +
      '</section>';
  }

  /* Search across every club and every person at once, because "who is the
     safety officer at Chester" and "which club is Jack Lappin at" are the same
     question asked from two ends. Matches on club, person and job title. */
  function search(all, q) {
    q = (q || '').trim().toLowerCase();
    if (q.length < 2) { return null; }
    var terms = q.split(/\s+/), out = [];
    Object.keys(all).forEach(function (club) {
      var rec = all[club] || {};
      (rec.people || []).forEach(function (p) {
        var hay = (club + ' ' + fullName(p) + ' ' +
          (p.roles || []).map(function (r) {
            return (r.title || '') + ' ' + (r.section || '');
          }).join(' ')).toLowerCase();
        if (terms.every(function (t) { return hay.indexOf(t) > -1; })) {
          out.push({ club: club, person: p });
        }
      });
      if (terms.every(function (t) { return club.toLowerCase().indexOf(t) > -1; })) {
        out.push({ club: club, person: null });
      }
    });
    return out;
  }

  window.NLDirectory = {
    renderClub: renderClub,
    search: search,
    fullName: fullName,
    reachable: reachable,
    ORDER: ORDER,
    KEY_POSTS: KEY_POSTS
  };
}());
