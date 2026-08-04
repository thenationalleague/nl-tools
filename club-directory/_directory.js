/* =========================================================================
   NL Tools — Club Directory presentation
   File: /club-directory/_directory.js
   Version: v1.2 (04/08/2026)

   Renders one club. Shared by the staff directory, the editor and the reader,
   so the presentation is written once and the three doors differ only in what
   they let you do to it.

   v1.1 rebuild, against review of v1.0:
     · the club leads the page. v1.0 opened with a key-contacts block, which
       said the club secretary outranks the club itself. That is a judgement
       the League should not be making in a layout, so it is gone: the posts
       it listed are all findable in their own departments, which is where a
       reader will look for them anyway.
     · a person is ONE ROW. v1.0 gave each person four stacked lines and a
       department could not be read down a column.
     · departments are headed with a filled bar rather than a small tracked
       label, which did not register as a section boundary.
     · socials render as the brand glyphs now in the canon sprite.

   Department order is the League's own and is not alphabetical: leadership,
   board, executive and the secretary sit at the top because that is the order
   a club introduces itself in. Other is last because it is a shrug.

   Nothing here knows about Firebase. Callers hand it a record.
   ========================================================================= */
(function () {
  'use strict';

  var esc = (window.NL && NL.escHtml) || function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var ORDER = ['Leadership', 'Directors', 'Executive', 'Club secretary',
    'Matchday & safety', 'Safeguarding & welfare', 'Medical', 'Media & marketing',
    'Programme', 'Commercial', 'Ticketing', 'Finance', 'Community',
    'Team operations', 'Other'];

  var SOCIALS = [['website', 'Website'], ['x', 'X'], ['facebook', 'Facebook'],
    ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'],
    ['linkedin', 'LinkedIn']];

  /* Absolute by default, which is right on the deployed site. A caller that
     has inlined the sprite (a standalone preview, an offline export) sets
     window.NL_SPRITE = '' so the reference stays in-document — an absolute
     path resolves to the filesystem root under file:// and silently draws
     nothing but the background chip. */
  var SPRITE = (typeof window.NL_SPRITE === 'string') ? window.NL_SPRITE : '/assets/icons/sprites.svg';

  /* fill on the outer svg too: an <svg> with no fill defaults to black, and
     while each symbol declares fill="currentColor" it is one edit away from a
     glyph that ignores the colour around it. */
  function glyph(name) {
    return '<svg aria-hidden="true" focusable="false" fill="currentColor" stroke="none"><use href="' +
      SPRITE + '#icon-' + name + '"></use></svg>';
  }
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
  function sectionPeople(rec, section) {
    return (rec.people || []).filter(function (p) {
      return (p.roles || []).some(function (r) { return r.section === section; });
    });
  }
  /* Banner colours. A club's own palette is the fastest "right page" signal
     and the one thing a shared canon cannot provide, but the data is raw: AFC
     Fylde's primary is #FFFFFF, and printing white on white is worse than
     using none of it. So take the first colour dark enough to carry white
     text, and fall back to the brand navy when none is.

     Duplicated logic warning: club-kits/admin.html carries its own luminance
     test. Second use, so this belongs in NL.clubs as a colours(name) helper
     returning a ready pair — flagged rather than done here to keep a design
     iteration out of a canon bump. */
  function lum(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    if (!/^[0-9a-f]{6}$/i.test(h)) { return null; }
    var c = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function bannerColour(clubName) {
    var meta = (window.NL && NL.clubs && NL.clubs.byName) ? NL.clubs.byName(clubName) : null;
    var cols = (meta && meta.colors) || {};
    var order = [cols.primary, cols.secondary, cols.tertiary];
    for (var i = 0; i < order.length; i++) {
      var L = lum(order[i]);
      /* 0.4 keeps white text at roughly 4.5:1 or better, which is the AA
         threshold for the body sizes this banner uses. */
      if (L !== null && L < 0.4) { return order[i]; }
    }
    return null;   /* caller leaves --cd-bg unset and the brand navy applies */
  }

  function tel(n) { return String(n || '').replace(/\s+/g, ''); }
  function url(u) { return /^https?:\/\//i.test(u) ? u : 'https://' + u; }
  function num(v) {
    var n = String(v || '').replace(/[^0-9]/g, '');
    return n ? Number(n).toLocaleString('en-GB') : esc(v || '');
  }

  /* ---------------------------------------------------------------- row */
  function personRow(p, section, opts) {
    var hidden = p.hideContact && !(opts && opts.showHidden);
    var here = (p.roles || []).filter(function (r) { return r.section === section; });
    var titles = here.map(function (r) { return (r.title || '').trim(); }).filter(Boolean);
    var mail = hidden ? '' : emailsOf(p).map(function (e) {
      return '<a href="mailto:' + esc(e) + '">' + esc(e) + '</a>';
    }).join('<br>');
    var ph = hidden ? '' : phonesOf(p).map(function (x) {
      var n = (x.number || '').trim(), ext = (x.ext || '').trim();
      return '<a href="tel:' + esc(tel(n)) + '">' + esc(n) + '</a>' +
        (ext ? ' <span class="cd-row__ext">ext ' + esc(ext) + '</span>' : '');
    }).join('<br>');

    var quiet = hidden ? 'Not published' : 'None held';
    return '<li class="cd-row">' +
      '<div class="cd-row__name">' + esc(fullName(p) || 'Name not given') + '</div>' +
      '<div class="cd-row__role">' +
        (titles.length ? esc(titles.join(' &middot; ')) : '<em>No job title</em>') +
      '</div>' +
      '<div>' + (mail || '<span class="cd-row__quiet">' + quiet + '</span>') + '</div>' +
      '<div>' + (ph || (mail ? '' : '')) + '</div>' +
      '</li>';
  }

  function facts(pairs) {
    return pairs.filter(function (p) { return p[1]; }).map(function (p) {
      return '<div' + (p[2] ? ' class="cd-f--wide"' : '') + '>' +
        '<div class="cd-f__k">' + esc(p[0]) + '</div>' +
        '<div class="cd-f__v">' + p[1] + '</div></div>';
    }).join('');
  }

  /* ---------------------------------------------------------------- render */
  function renderClub(rec, opts) {
    opts = opts || {};
    var info = rec.info || {};
    var addr = [info.addr1, info.addr2, info.town, info.county, info.postcode]
      .filter(function (x) { return (x || '').trim(); }).map(esc).join(', ');

    var social = SOCIALS.map(function (s) {
      var u = (info[s[0]] || '').trim();
      if (!u) { return ''; }
      return '<a href="' + esc(url(u)) + '" target="_blank" rel="noopener" title="' +
        esc(s[1]) + '" aria-label="' + esc(s[1]) + '">' + glyph(s[0]) + '</a>';
    }).filter(Boolean).join('');

    var depts = ORDER.map(function (s) {
      var who = sectionPeople(rec, s);
      if (!who.length) { return ''; }
      return '<div class="cd-dept"><h3 class="cd-dept__h">' + esc(s) + '</h3>' +
        '<ul class="cd-rows">' +
        who.map(function (p) { return personRow(p, s, opts); }).join('') +
        '</ul></div>';
    }).filter(Boolean).join('');

    var bg = bannerColour(rec.club);

    return '' +
      '<div class="cd-banner"' + (bg ? ' style="--cd-bg:' + esc(bg) + '"' : '') + '>' +
        '<img class="cd-banner__crest" id="cdCrest" alt="" hidden>' +
        '<h1 class="cd-banner__name">' + esc(rec.club || '') + '</h1>' +
      '</div>' +

      '<div class="cd-facts">' +
        facts([
          ['Stadium', esc(info.stadium || '') +
            (info.stadiumSponsor ? ' <span class="cd-f__sub">(' + esc(info.stadiumSponsor) + ')</span>' : '')],
          ['Address', addr],
          ['Capacity', info.capacity ? num(info.capacity) +
            (info.seated ? ' <span class="cd-f__sub">' + num(info.seated) + ' seated</span>' : '') : ''],
          ['Pitch', [info.pitchDims, info.pitchType].filter(Boolean).map(esc).join(' &middot; ')],
          ['Nearest station', esc(info.station || '') +
            (info.stationDistance ? ' <span class="cd-f__sub">' + esc(info.stationDistance) +
              ' miles</span>' : '')],
          ['County FA', esc(info.countyFA || '')],
          ['Switchboard', info.phone
            ? '<a href="tel:' + esc(tel(info.phone)) + '">' + esc(info.phone) + '</a>' : ''],
          ['Main email', info.mainEmail
            ? '<a href="mailto:' + esc(info.mainEmail) + '">' + esc(info.mainEmail) + '</a>' : ''],
          ['Club sponsor', esc(info.spClub || '')],
          ['Shirt front', esc(info.spFront || '')],
          ['Sleeve', esc(info.spSleeve || '')],
          ['Website & social', social ? '<div class="cd-social">' + social + '</div>' : '', true]
        ]) +
      '</div>' +

      '<section class="cd-sec">' +
        (depts || '<p class="cd-empty">No people held for this club yet.</p>') +
      '</section>';
  }

  /* Search across every club and every person at once, because "who is the
     safety officer at Chester" and "which club is Jack Lappin at" are the same
     question asked from two ends. Matches club, person and job title. */
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
    });
    return out;
  }

  window.NLDirectory = {
    renderClub: renderClub,
    personRow: personRow,
    search: search,
    fullName: fullName,
    reachable: reachable,
    glyph: glyph,
    ORDER: ORDER
  };
}());
