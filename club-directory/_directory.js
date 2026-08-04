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
  /* The sprite holds two kinds of symbol. The brand marks are filled; the UI
     set is stroked with no fill. Handing a stroked icon to glyph() sets
     stroke="none" on the wrapper and draws nothing at all, which is what the
     edit pen did — a visible button with an invisible icon. */
  function strokeGlyph(name) {
    return '<svg aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="' +
      SPRITE + '#icon-' + name + '"></use></svg>';
  }
  /* RTDB returns a JSON array only when the keys are a contiguous 0..n. One
     gap — a person removed from the middle of a submission, a phone deleted —
     and the same field comes back as {"0":…,"2":…}. That object is truthy, so
     `x || []` does not catch it and .filter throws with "is not a function".
     This code was written against the JSON export, where they are real arrays;
     everything read out of the live database goes through here instead. */
  function arr(v) {
    if (Array.isArray(v)) { return v; }
    if (!v || typeof v !== 'object') { return []; }
    var keys = Object.keys(v);
    if (keys.every(function (k) { return /^\d+$/.test(k); })) {
      keys.sort(function (a, b) { return (+a) - (+b); });
    }
    return keys.map(function (k) { return v[k]; }).filter(function (x) { return x != null; });
  }

  function fullName(p) {
    return (p && (p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || '')).trim();
  }
  function emailsOf(p) {
    return arr(p && p.emails).filter(function (e) { return e && e.trim(); });
  }
  function phonesOf(p) {
    return arr(p && p.phones).filter(function (x) { return x && (x.number || '').trim(); });
  }
  /* A person's roles, always as an array. Exported because both pages need it
     and the reader does not load _tidy.js — a page should not have to pull in
     the whole tidier to read a field safely. */
  function rolesOf(p) { return arr(p && p.roles); }
  function reachable(p) { return emailsOf(p).length > 0 || phonesOf(p).length > 0; }
  function sectionPeople(rec, section) {
    return arr(rec.people).filter(function (p) {
      return arr(p.roles).some(function (r) { return r.section === section; });
    });
  }
  /* Banner colours: the club's primary as the background, their secondary as
     the type. That is the pairing the clubs use themselves, so Forest Green
     read as lime on black rather than the white-on-black a contrast-first
     rule picks.

     It needs a floor, though. Twenty of the eighty-two pairs fall below 4.5:1
     against each other — Carlisle's blue on red is 1.17:1, which is unreadable
     rather than merely bold. Where the club's own pair fails, the background
     is kept and the type falls to whichever of white or near-black actually
     reads on it, so the club identity survives and the name stays legible.

     Duplicated logic warning: club-kits/admin.html has its own luminance test.
     Second use, so this belongs in NL.clubs as colours(name). Flagged. */
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
  function contrast(a, b) {
    var la = lum(a), lb = lum(b);
    if (la === null || lb === null) { return 0; }
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function bannerColours(clubName) {
    var meta = (window.NL && NL.clubs && NL.clubs.byName) ? NL.clubs.byName(clubName) : null;
    var cols = (meta && meta.colors) || {};
    var bg = cols.primary, fg = cols.secondary;
    if (lum(bg) === null) { return null; }              /* no usable primary */
    if (lum(fg) === null || contrast(bg, fg) < 4.5) {
      fg = contrast(bg, '#FFFFFF') >= contrast(bg, '#0A1628') ? '#FFFFFF' : '#0A1628';
    }
    return { bg: bg, fg: fg };
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
    var here = arr(p.roles).filter(function (r) { return r.section === section; });
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
        /* Escape each title, then join with the entity. Escaping the joined
           string turns the separator's own ampersand into &amp;middot; and
           prints it as text. */
        (titles.length ? titles.map(esc).join(' &middot; ') : '<em>No job title</em>') +
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

    var pal = bannerColours(rec.club);

    return '' +
      '<div class="cd-banner"' + (pal ? ' style="--cd-bg:' + esc(pal.bg) +
        ';--cd-fg:' + esc(pal.fg) + '"' : '') + '>' +
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
      arr(rec.people).forEach(function (p) {
        var hay = (club + ' ' + fullName(p) + ' ' +
          arr(p.roles).map(function (r) {
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
    arr: arr,
    rolesOf: rolesOf,
    renderClub: renderClub,
    personRow: personRow,
    search: search,
    fullName: fullName,
    reachable: reachable,
    glyph: glyph,
    strokeGlyph: strokeGlyph,
    ORDER: ORDER
  };
}());
