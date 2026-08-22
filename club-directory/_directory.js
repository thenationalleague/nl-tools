/* =========================================================================
   NL Tools — Club Directory presentation
   File: /club-directory/_directory.js
   Version: v1.8 (22/08/2026)

   v1.8 — viewSwitch(), and names set as their owners write them.
   · The List/Cards switcher is built here, above the people it acts on,
     instead of by each page above everything. Built by the page it also
     appeared on the club INDEX, offering to show 72 crests as "list" or
     "cards" when it does neither; drawIndex() does not call renderClub, so
     building it here removes it from the index by construction. Exported,
     because the editor's search results build their own list.
   · displayName no longer capitalises the surname. The cue was real — it
     says which word the list is sorted on — but the clubs fill this in
     themselves and a screen full of SMITH teaches them to type SMITH, which
     _tidy.js already has a rule to catch from the other end.

   v1.7 — the banner crest carries canon .nl-crest, so it is drawn in a square
   box rather than sized by the shape of the badge. decoding="async" with it.

   v1.6 — opts.showQuiet. "Not published" and "None held" are loud for the
   club whose entry it is and silent for everyone else. Same reasoning as
   showGaps: to a club reading its OWN record those lines are a to-do list —
   what the League is holding back, what it has never been given — and worth
   acting on. To a club reading another club's record they are a column of
   noise about a gap that is none of their business. Default is loud, so the
   editor and every other caller are unchanged; the reader opts out for the
   71 clubs that are not yours, which it can only do now that the club code
   tells it which one is.

   v1.5 — an address names WHICH of the person's jobs it is for, as a set
   rather than one-or-all. Barrow's safeguarding champion is also a director
   and the club is happy for his address against one post and not the other.
   sectionsOf() reads the set (legacy single `section` = a set of one), a
   department listing an address is not for says nothing rather than "None
   held", and a card annotates it — a card is the whole person, so an address
   for one of their jobs has to say which.

   v1.4 — publication is per address and per number. contactsOf() returns both
   channels normalised with their own hide state, channel() decides what a
   given view shows and whether anything is being kept back, and every
   renderer goes through the pair. The person-level hideContact still means
   all of it, so nothing already stored changes meaning.

   v1.3 — the mailing-list taxonomy (LIST_LABEL / LIST_ORDER / listMembers)
   moves here from the editor. Second use: the staff overview builds exports
   from the same eleven lists, and two copies of a taxonomy is one copy too
   many the day a list is added.

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
  /* Contact details belong to the person, not the role — but a handful of
     people genuinely hold one address per job. Truro City's safeguarding lead
     has cblack@, commercial@ AND safeguarding@, and holds exactly those two
     roles; nine people across the 72 are in that position.

     So an address may optionally name the role it is for. Nine cases do not
     justify moving contact details onto the role and restructuring 1,070
     records — and 130 people hold a functional address like media@ as their
     ONLY one, where there is nothing to choose between anyway.

     An entry is a plain string (everything today) or {address, section}. No
     section means "wherever this person appears", which is exactly the
     current behaviour, so nothing already stored changes meaning. */
  function addrOf(e) { return (typeof e === 'string') ? e : ((e && e.address) || ''); }

  /* WHICH of their jobs an address is for. Barrow asked for exactly this and
     it is the ordinary case, not the exotic one: their safeguarding champion
     is also a director, and the club is happy for his address to be listed
     against the safeguarding post and not the board one.

     v1.5 makes it a SET. The single `section` string could say "everywhere"
     or "exactly one place" and nothing in between, which happened to fit
     Barrow — one target role — and would not fit somebody wanted under Media
     and Commercial but not Directors. 275 of 1,070 people hold more than one
     post, so that was a matter of time.

     Nothing stored says anything yet: an empty set means "wherever this
     person appears", which is the behaviour of all 914 addresses today. The
     legacy single `section` is read as a set of one, so no migration. */
  function sectionsOf(e) {
    if (!e || typeof e === 'string') { return []; }
    if (e.sections) { return arr(e.sections).filter(Boolean); }
    return e.section ? [e.section] : [];
  }
  function forHere(e, section) {
    var s = sectionsOf(e);
    return !s.length || !section || s.indexOf(section) > -1;
  }
  function emailsOf(p, section) {
    return arr(p && p.emails).filter(function (e) {
      return addrOf(e).trim() && forHere(e, section);
    }).map(addrOf);
  }
  function phonesOf(p, section) {
    return arr(p && p.phones).filter(function (x) {
      return x && (x.number || '').trim() && forHere(x, section);
    });
  }
  /* A person's roles, always as an array. Exported because both pages need it
     and the reader does not load _tidy.js — a page should not have to pull in
     the whole tidier to read a field safely. */
  function rolesOf(p) { return arr(p && p.roles); }
  function reachable(p) { return emailsOf(p).length > 0 || phonesOf(p).length > 0; }

  /* ------------------------------------------------ what gets published
     Publication is decided per ADDRESS and per NUMBER, not per person. The
     case that forced it is ordinary: a club officer happy for the club
     address to be in the directory and not their mobile, or happy for the
     mobile and not their personal email. One flag per person could not say
     that, so it said no to all of it.

     Two levels, and both are honoured:
       p.hideContact        the person — nothing of theirs is published.
                            The 290 people already carrying it keep working
                            with nothing re-entered.
       entry.hide           this address, or this number, on its own.

     Reading is the only place the rule lives. The editor shows everything
     and marks what is held back; the reader is handed a record the withheld
     entries were physically removed from at publish. Both go through here,
     because a second renderer deciding for itself who to show would be a
     second chance to get it wrong. */
  function entryHidden(entry, p) {
    return !!(p && p.hideContact) ||
           !!(entry && typeof entry === 'object' && entry.hide);
  }
  /* Entry-level only — used where the person-level flag is already its own
     signal and folding it in would report the same fact twice. */
  function ownHide(entry) {
    return !!(entry && typeof entry === 'object' && entry.hide);
  }

  /* Both channels, normalised, carrying their own publication state. */
  function contactsOf(p, section) {
    return {
      emails: arr(p && p.emails).filter(function (e) {
        return addrOf(e).trim() && forHere(e, section);
      }).map(function (e) {
        return { value: addrOf(e).trim(), ext: '', hide: entryHidden(e, p),
                 sections: sectionsOf(e) };
      }),
      phones: arr(p && p.phones).filter(function (x) {
        return x && (x.number || '').trim() && forHere(x, section);
      }).map(function (x) {
        return { value: (x.number || '').trim(), ext: (x.ext || '').trim(),
                 hide: entryHidden(x, p), sections: sectionsOf(x) };
      })
    };
  }

  /* What THIS view shows, and whether anything is being kept back.

     `marker` is how a published record says "there was something here" after
     the something was removed — publishablePerson sets hideEmail/hidePhone
     only when a channel is emptied entirely, so the reader can tell "held
     back" from "we do not have one" without being handed the thing itself.
     p.hideContact is read too, because a copy published before this existed
     says it that way and must keep reading correctly. */
  function channel(p, entries, marker, showHidden) {
    return {
      show: showHidden ? entries : entries.filter(function (e) { return !e.hide; }),
      withheld: !!(p && (p.hideContact || p[marker])) ||
                entries.some(function (e) { return e.hide; })
    };
  }

  /* Do they hold one at all, anywhere? The difference between "we have no
     email for this person" and "we have one, but it is for their other job".
     A department listing that says "None held" against the second is a small
     untruth, and the honest answer is to say nothing: naming it would only
     tell a reader there is an address to go and ask for, which is the thing
     the club asked us not to do. */
  function holdsAny(p, key) {
    return arr(p && p[key]).some(function (x) {
      return (key === 'emails' ? addrOf(x) : (x && x.number) || '').trim();
    });
  }
  /* lastName where the club gave one, otherwise the last word of the name.
     A directory is looked up by surname and nothing else. */
  function surnameOf(p) {
    var last = ((p && p.lastName) || '').trim();
    if (last) { return last; }
    var whole = fullName(p).trim();
    var bits = whole.split(/\s+/);
    return bits.length > 1 ? bits[bits.length - 1] : whole;
  }

  /* A name, as its owner writes it. The surname used to be set in capitals
     here — the handbook does it, and it says which word the list is sorted
     on — but a directory that DISPLAYS names in caps teaches the people
     filling it in to TYPE them in caps, and _tidy.js already carries a rule
     to catch names that arrive shouted. A display convention that has to be
     defended against downstream is not worth the cue. Richard, 21/08/2026:
     "think it'll confuse people who'll enter as caps." */
  function displayName(p) {
    return esc(fullName(p) || 'Name not given');
  }

  function bySurname(a, b) {
    var d = surnameOf(a).toLowerCase().localeCompare(surnameOf(b).toLowerCase());
    return d || fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase());
  }

  function sectionPeople(rec, section) {
    return arr(rec.people).filter(function (p) {
      return arr(p.roles).some(function (r) { return r.section === section; });
    }).sort(bySurname);
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
    /* Two different things, and conflating them cost the editor its most
       useful signal. `unlisted` is the club's decision — keep this person's
       details out of the published directory. `hidden` is whether THIS view
       acts on it. The reader acts on it; the editor and the staff view do
       not, because their job is to see everything the League holds.

       But "does not act on it" was being rendered as "does not mention it",
       so an editor looked at an email address with no way of knowing it will
       never appear in the reader — across 290 of 1,070 people, in 65 of the
       72 clubs. The state is now stated wherever the details are shown. */
    var showHidden = !!(opts && opts.showHidden);
    var loud = !opts || opts.showQuiet !== false;
    var unlisted = !!p.hideContact;
    var here = arr(p.roles).filter(function (r) { return r.section === section; });
    var titles = here.map(function (r) { return (r.title || '').trim(); }).filter(Boolean);
    var all = contactsOf(p, section);
    var em = channel(p, all.emails, 'hideEmail', showHidden);
    var tl = channel(p, all.phones, 'hidePhone', showHidden);

    var mail = em.show.map(function (e) {
      return '<a href="mailto:' + esc(e.value) + '">' + esc(e.value) + '</a>' +
        held(e, showHidden && !unlisted);
    }).join('<br>');
    var ph = tl.show.map(function (x) {
      return '<a href="tel:' + esc(tel(x.value)) + '">' + esc(x.value) + '</a>' +
        (x.ext ? ' <span class="cd-row__ext">ext ' + esc(x.ext) + '</span>' : '') +
        held(x, showHidden && !unlisted);
    }).join('<br>');

    /* Per channel now: an email cell can read "Not published" while the phone
       beside it shows a number, which is the whole point of the change. */
    /* Loud for the club it belongs to, silent for everyone else.

       Same reasoning as showGaps below. To a club reading its OWN entry,
       "Not published" and "None held" are a to-do list: they say what the
       League is holding back or has never been given, and invite the club to
       fix it. To a club reading someone else's entry they are a column of
       noise about a gap that is none of their business and that they could
       not act on if it were. Same markup, decided by who is looking.

       Default is loud, so the editor and every other caller are unchanged;
       the reader opts out for the 71 clubs that are not yours. */
    var quietEm = !loud ? ''
      : (em.withheld && !showHidden ? 'Not published'
      : (holdsAny(p, 'emails') ? '' : 'None held'));
    /* The person-level tag survives for the person-level decision only. When
       it is set, everything is held back, and tagging each of six lines
       individually says the same thing six times. Where the decision is
       per address, the address itself carries the mark instead. */
    var tag = (unlisted && showHidden)
      ? '<span class="cd-row__unlisted" title="The club asked us to keep this ' +
        'person’s details out of the published directory. The reader shows ' +
        '&quot;Not published&quot; here.">Not published</span>'
      : '';
    /* The row says who it is. The editor used to work this out by counting —
       "the third row under Leadership is the third person in Leadership" —
       which held only while the render order matched the array order. Adding
       a surname sort to sectionPeople broke that silently, and every marker,
       every pen and every flag landed on the wrong person. Carrying the id is
       the fix and the whole class of fault goes with it. */
    var ridx = arr(p.roles).map(function (r, i) {
      return r.section === section ? i : -1;
    }).filter(function (i) { return i > -1; })[0];
    return '<li class="cd-row' + (unlisted ? ' cd-row--unlisted' : '') + '"' +
      (p.id ? ' data-pid="' + esc(p.id) + '"' : '') +
      (ridx != null ? ' data-ridx="' + ridx + '"' : '') + '>' +
      '<div class="cd-row__name">' + displayName(p) + '</div>' +
      '<div class="cd-row__role">' +
        /* Escape each title, then join with the entity. Escaping the joined
           string turns the separator's own ampersand into &amp;middot; and
           prints it as text. */
        /* Silent where it is read, loud where it is worked on. To a club
           looking themselves up, "No job title" is the League announcing a
           gap in its own records against a named member of their staff — it
           reads as a slight, and it is 21% of every role we hold. To an
           editor it is the job. So the reader shows nothing and the editor
           says it, on the same markup, decided by who is looking. */
        (titles.length ? titles.map(esc).join(' &middot; ')
          : (opts && opts.showGaps ? '<em>No job title</em>' : '')) +
      '</div>' +
      '<div>' + tag + (mail || (quietEm
        ? '<span class="cd-row__quiet">' + quietEm + '</span>' : '')) + '</div>' +
      /* The phone cell has always stayed blank when there is simply no
         number — "None held" against 400 people is noise. It speaks up only
         to say a number exists and is being kept back. */
      '<div>' + (ph || (loud && tl.withheld && !showHidden
        ? '<span class="cd-row__quiet">Not published</span>' : '')) + '</div>' +
      '</li>';
  }

  /* The mark against a single address or number, for the views that show
     what they are not publishing. Off in the reader, which is handed a
     record these entries were removed from, and off when the whole person
     is held back and the row already carries one tag for the lot. */
  /* On a CARD only. A card is the whole person with every job listed, so an
     address that belongs to one of those jobs needs to say which — otherwise
     Barrow's safeguarding address reads as their director's address too, and
     the club agreed to one of those and not the other. In a department LIST
     it is redundant: you are already inside the department.

     Shown to readers as well as editors. "Listed for that purpose" is exactly
     what the club agreed to, so saying which purpose is keeping the promise,
     not leaking anything. */
  function scopeNote(entry, p) {
    var s = entry.sections || [];
    if (!s.length) { return ''; }
    var all = arr(p && p.roles).map(function (r) { return r && r.section; })
      .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    if (all.length < 2 || s.length >= all.length) { return ''; }
    return ' <span class="cd-scope">' + esc(s.join(' \u00b7 ')) + ' only</span>';
  }

  function held(entry, on) {
    return (on && entry.hide)
      ? ' <span class="cd-held" title="This one is kept out of the published ' +
        'directory. Others on the same person may still be published.">not published</span>'
      : '';
  }

  function facts(pairs) {
    return pairs.filter(function (p) { return p[1]; }).map(function (p) {
      return '<div' + (p[2] ? ' class="cd-f--wide"' : '') + '>' +
        '<div class="cd-f__k">' + esc(p[0]) + '</div>' +
        '<div class="cd-f__v">' + p[1] + '</div></div>';
    }).join('');
  }

  /* One person, one card — a business card, not a row in a different shape.
     The list is organised by department, so somebody who does two jobs
     appears in two places; that is right for a list, because you are reading
     down a department. A card is the person, so they appear once and their
     jobs are listed ON it. Spennymoor's four people are four cards.

     Which means the card view is not grouped at all. There is no department
     heading, because the unit is no longer the department.

     Suppression is not re-decided: hidden is computed from the same flag
     personRow uses, and the contact block is never built when it is set. A
     second renderer deciding for itself who to show would be a second chance
     to get it wrong, and the reader is where getting it wrong is published. */
  function personCard(p, opts) {
    var showHidden = !!(opts && opts.showHidden);
    var loud = !opts || opts.showQuiet !== false;
    var unlisted = !!p.hideContact;
    var roles = arr(p.roles);

    var jobs = roles.map(function (r) {
      var t = (r.title || '').trim();
      return '<li class="cd-pc__job">' +
        '<span class="cd-pc__title">' + (t ? esc(t)
          : (opts && opts.showGaps ? '<em>No job title</em>' : '&mdash;')) + '</span>' +
        '<span class="cd-pc__dept">' + esc(r.section || '') + '</span></li>';
    }).join('');

    /* Every address and every number, not a department's share of them. The
       card is the whole person. */
    var all = contactsOf(p, '');
    var em = channel(p, all.emails, 'hideEmail', showHidden);
    var tl = channel(p, all.phones, 'hidePhone', showHidden);
    var mark = showHidden && !unlisted;
    var lines = em.show.map(function (e) {
      return '<a class="cd-pc__line" href="mailto:' + esc(e.value) + '">' +
        '<span class="cd-pc__ic">' + glyph('email') + '</span>' + esc(e.value) +
        scopeNote(e, p) + held(e, mark) + '</a>';
    }).concat(tl.show.map(function (x) {
      return '<a class="cd-pc__line" href="tel:' + esc(tel(x.value)) + '">' +
        '<span class="cd-pc__ic">' + glyph('phone') + '</span>' + esc(x.value) +
        (x.ext ? ' <span class="cd-row__ext">ext ' + esc(x.ext) + '</span>' : '') +
        scopeNote(x, p) + held(x, mark) + '</a>';
    })).join('');

    return '<li class="cd-pc' + (unlisted ? ' cd-pc--unlisted' : '') + '"' +
      (p.id ? ' data-pid="' + esc(p.id) + '"' : '') + '>' +
      '<div class="cd-pc__top"><div class="cd-pc__id">' +
        '<div class="cd-pc__name">' + displayName(p) + '</div>' +
      '</div></div>' +
      (jobs ? '<ul class="cd-pc__jobs">' + jobs + '</ul>' : '') +
      '<div class="cd-pc__lines">' + (lines || (!loud ? '' :
        '<span class="cd-row__quiet">' +
        ((em.withheld || tl.withheld) && !showHidden ? 'Not published' : 'None held') +
        '</span>')) + '</div>' +
    '</li>';
  }

  /* Everyone at the club, once each, by surname. sectionPeople answers "who
     is in this department"; this answers "who is here", which is the question
     a card view is arranged around. */
  function allPeople(rec) {
    return arr(rec.people).filter(function (p) {
      return arr(p.roles).length;
    }).slice().sort(bySurname);
  }

  /* ---------------------------------------------------------------- render */
  /* One definition, two callers: renderClub puts it above a club's people,
     and the editor's search results build their own list without going
     through renderClub. Two copies of a control is how the two drift. */
  function viewSwitch(cards) {
    return '<div class="cd-vw" data-view-switch role="group" aria-label="How to show people">' +
      ['list', 'cards'].map(function (v) {
        var on = (v === 'cards') === !!cards;
        return '<button type="button" data-v="' + v + '"' +
          (on ? ' class="is-on"' : '') +
          ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
          (v === 'list' ? 'List' : 'Cards') + '</button>';
      }).join('') + '</div>';
  }

  function renderClub(rec, opts) {
    opts = opts || {};
    var info = rec.info || {};
    var addr = [info.addr1, info.addr2, info.town, info.county, info.postcode]
      .filter(function (x) { return (x || '').trim(); }).map(esc).join(', ');

    /* A row of seven identical-sized glyphs told you the club had seven
       accounts and nothing else — not which handle, not whether the URL we
       hold is the right one, which is the whole question when a club sends
       "@hebburntownfc" and we have a different account on file. Stacked, with
       the address next to the mark, and the whole line is the link. */
    var social = SOCIALS.map(function (s) {
      var u = (info[s[0]] || '').trim();
      if (!u) { return ''; }
      return '<a class="cd-social__row" href="' + esc(url(u)) + '" target="_blank" ' +
        'rel="noopener" aria-label="' + esc(s[1]) + '">' +
        '<span class="cd-social__mark" title="' + esc(s[1]) + '">' + glyph(s[0]) + '</span>' +
        '<span class="cd-social__url">' + esc(u.replace(/^https?:\/\//i, '')) + '</span></a>';
    }).filter(Boolean).join('');

    /* THE SWITCHER BELONGS TO THE PEOPLE, so it is built here rather than by
       the page. It sat at the top of the reader and the editor alike, above
       everything, which put it on the club INDEX too — a control offering to
       show 72 crests as "list" or "cards" when it does neither. Richard:
       "should be above people, not the whole thing. and not on the directory
       page."

       Built by renderClub, it appears exactly where it applies and nowhere
       else: drawIndex() does not call this function, so the index loses it
       without anyone having to remember to hide it. */
    var switcher = (opts && opts.viewSwitch) ? viewSwitch(!!(opts && opts.cards)) : '';

    /* Cards are ungrouped by design — see personCard. One flat set of people,
       by surname, each carrying their own departments. */
    var depts = (opts && opts.cards)
      ? '<ul class="cd-cards">' + allPeople(rec).map(function (p) {
          return personCard(p, opts);
        }).join('') + '</ul>'
      : ORDER.map(function (s) {
          var who = sectionPeople(rec, s);
          if (!who.length) { return ''; }
          return '<div class="cd-dept"><h3 class="cd-dept__h">' + esc(s) + '</h3>' +
            '<ul class="cd-rows">' +
            who.map(function (p) { return personRow(p, s, opts); }).join('') +
            '</ul></div>';
        }).filter(Boolean).join('');
    if (depts) { depts = switcher + depts; }

    var pal = bannerColours(rec.club);

    return '' +
      '<div class="cd-banner"' + (pal ? ' style="--cd-bg:' + esc(pal.bg) +
        ';--cd-fg:' + esc(pal.fg) + '"' : '') + '>' +
        '<img class="nl-crest cd-banner__crest" id="cdCrest" alt="" hidden ' +
          'decoding="async">' +
        '<h1 class="cd-banner__name">' + esc(rec.club || '') + '</h1>' +
      '</div>' +

      '<div class="cd-card" id="cdCard">' +
      '<div class="cd-facts">' +
        facts([
          /* Two fields, not one with a parenthesis. Half the clubs play at a
             ground with a sponsor's name on it and the other half do not, and
             a blank told you nothing about which — "no sponsor" and "we never
             asked" looked identical. Stating None is an answer.

             The presence of a name is what decides it. There is a noSponsor
             flag in the submissions too, but it disagrees with the name on
             five clubs (Billericay, Forest Green, Maidstone, Scarborough,
             Sutton — the last reading "available"), so one source of truth
             wins and it is the one someone typed. */
          ['Stadium (official)', esc(info.stadium || '')],
          ['Stadium (sponsored)', (info.stadiumSponsor || '').trim()
            ? esc(info.stadiumSponsor)
            : '<span class="cd-f__sub">None</span>'],
          ['Address', addr],
          /* Bracketed. "3,500 669 seated" read as two numbers run together —
             the muted colour was carrying the whole distinction, and at a
             glance it did not. Same for the station distance below. */
          ['Capacity', info.capacity ? num(info.capacity) +
            (info.seated ? ' <span class="cd-f__sub">(' + num(info.seated) + ' seated)</span>' : '') : ''],
          ['Pitch', [info.pitchDims, info.pitchType].filter(Boolean).map(esc).join(' &middot; ')],
          ['Nearest station', esc(info.station || '') +
            (info.stationDistance ? ' <span class="cd-f__sub">(' + esc(info.stationDistance) +
              ' miles)</span>' : '')],
          /* Main email sits beside the switchboard rather than County FA
             sitting between them. Two ways of phoning or writing to the club
             are one thought; which county FA it belongs to is another, and it
             was splitting the pair across a row break in the grid. */
          ['Main email', info.mainEmail
            ? '<a href="mailto:' + esc(info.mainEmail) + '">' + esc(info.mainEmail) + '</a>' : ''],
          ['Switchboard', info.phone
            ? '<a href="tel:' + esc(tel(info.phone)) + '">' + esc(info.phone) + '</a>' : ''],
          ['County FA', esc(info.countyFA || '')],
          ['Club sponsor', esc(info.spClub || '')],
          ['Shirt front', esc(info.spFront || '')],
          ['Sleeve', esc(info.spSleeve || '')],
          ['Website & social', social ? '<div class="cd-social">' + social + '</div>' : '', true]
        ]) +
      '</div>' +
      '</div>' +

      '<section class="cd-sec">' +
        (depts || '<p class="cd-empty">No people held for this club yet.</p>') +
      '</section>';
  }

  /* ------------------------------------------------------- mailing lists
     The League's own eleven questions — who is your secretary, your media
     contact, your safety officer — answered by all 72 clubs by naming actual
     people. Stored per club as leads/<key> = [personId].

     This is deliberately NOT the department taxonomy above. A club has one
     Media & marketing department and several people in it; it has exactly one
     answer to "who do we write to about media". SLO, DLO and PLO exist here
     and nowhere else. Conflating the two would lose that.

     Promoted here at the second use: the editor renders and edits these, and
     the staff overview builds mailing-list exports from them. */
  var LIST_LABEL = {
    secretary: 'Club secretary', media: 'Media', programme: 'Programme',
    commercial: 'Commercial', finance: 'Finance', ticketing: 'Ticketing',
    medical: 'Medical', slo: 'Supporter liaison (SLO)', safety: 'Safety officer',
    dlo: 'Disability liaison (DLO)', plo: 'Police liaison (PLO)'
  };
  var LIST_ORDER = ['secretary', 'media', 'programme', 'commercial', 'finance',
                    'ticketing', 'medical', 'safety', 'slo', 'dlo', 'plo'];

  /* Members of one club's list, resolved from ids to people. An id with no
     person behind it is dropped rather than rendered as a blank row — that
     happens when someone is deleted and the list still names them. */
  function listMembers(rec, key) {
    var ids = arr((rec && rec.leads || {})[key]);
    var by = {};
    arr(rec && rec.people).forEach(function (p) { if (p.id) { by[p.id] = p; } });
    return ids.map(function (id) {
      return typeof id === 'string' ? by[id] : (id && by[id.id]);
    }).filter(Boolean);
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
    viewSwitch: viewSwitch,
    personRow: personRow,
    personCard: personCard,
    allPeople: allPeople,
    surnameOf: surnameOf,
    bySurname: bySurname,
    search: search,
    fullName: fullName,
    reachable: reachable,
    emailsOf: emailsOf,
    phonesOf: phonesOf,
    contactsOf: contactsOf,
    sectionsOf: sectionsOf,
    entryHidden: entryHidden,
    ownHide: ownHide,
    addrOf: addrOf,
    glyph: glyph,
    strokeGlyph: strokeGlyph,
    listMembers: listMembers,
    LIST_LABEL: LIST_LABEL,
    LIST_ORDER: LIST_ORDER,
    ORDER: ORDER
  };
}());
