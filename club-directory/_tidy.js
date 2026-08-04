/* =========================================================================
   NL Tools — club directory tidier
   File: /club-directory/_tidy.js
   Version: v1.0 (04/08/2026)

   The single implementation of every change the League makes to a club's
   submission on its way into the directory. Two callers, and they must not
   drift:

     · club-signoff/index.html  states to the club what we intend to do
     · club-directory/editor    actually does it, once, at bake time

   If those ever came apart we would be promising 72 clubs one thing and
   writing another, so the rules live here and nowhere else.

   Every pass takes an optional `log` collector and reports what it touched:

       log(path, from, to, kind)

   `path` addresses the field inside the club record ('people/<id>/firstName',
   'people/<id>/roles/2/title'), and `kind` is one of case | typo | split |
   merge. The editor renders one margin marker per logged change, so an editor
   can always see what the club actually sent and put it back.

   Order is fixed and matters: typos first so a misspelling does not defeat the
   split rule, then splits, then casing over the result, then the merge, which
   collapses records and would otherwise hide changes behind a deleted person.
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------------------------------------ house style
     Clubs type into a plain form, so a third of them arrive shouting, or in
     lower case, or with the address in caps. This is the same rule set the
     data pass uses, applied at render: deterministic, safe, and it needs no
     per-club seeding. The submission itself is untouched — this is a view of
     it, and the club sees what we changed in the green list.

     The governing principle throughout: only recase a value that is uniformly
     cased. Anything already carrying internal capitals is somebody's
     deliberate choice (McGrath, Co-ordinator, CEO/Director) and is left. */
  var PARTICLES = ['de','van','von','der','den','du','da','di','la','le','ter'];
  var PLACEHOLDER = ['tbc','tba','tbd','n/a','na','none','vacant','unknown','-'];
  var ACRONYM = ['CEO','CFO','COO','CTO','MD','GM','PA','EA','DLO','PLO','SLO','CSLO',
    'DSL','DSO','CWO','FA','EFL','HR','IT','PR','FC','AFC','F&B','NVQ','FSOA','SIA',
    'DBS','EFAA','GK','U18','U21','U23','TBC','TBA','TBD','N/A'];
  var MINOR = ['a','an','the','and','or','nor','but','of','for','in','on','at','to',
    'by','with','from','into','over','per','via','including','inc','incl','plus','as','is'];

  function isPlaceholder(v) {
    return PLACEHOLDER.indexOf(String(v == null ? '' : v).trim().toLowerCase()) > -1;
  }
  /* Uniformly cased means safe to recase. Mixed case is deliberate. */
  function uniform(v) {
    var letters = v.replace(/[^A-Za-z]/g, '');
    return !letters || letters === letters.toUpperCase() || letters === letters.toLowerCase();
  }
  function cap(core) {
    if (!core || !uniform(core)) { return core; }
    return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
  }

  function caseWord(w) {
    if (!w) { return w; }
    if (w.indexOf('-') > -1) { return w.split('-').map(caseWord).join('-'); }
    var low = w.toLowerCase();
    if (PARTICLES.indexOf(low) > -1) { return low; }
    var apo = low.match(/^([a-z])'([a-z].*)$/);          /* O'Connor, D'Arcy */
    if (apo) { return apo[1].toUpperCase() + "'" + cap(apo[2]); }
    /* Mc only. Mac is unsafe — Macey and Mackay are not MacKay. */
    if (low.indexOf('mc') === 0 && low.length > 3) { return 'Mc' + cap(low.slice(2)); }
    if (/^([a-z]\.)+$/.test(low)) { return low.toUpperCase(); }   /* J.R. */
    return cap(low);
  }
  function recase(v) {
    return v.split(' ').filter(function (w) { return w !== ''; }).map(caseWord).join(' ');
  }

  /* A record typed in caps, as opposed to a genuine acronym. Both name fields
     in caps, or any single token too long to be an initialism. A lone all-caps
     token with no surname (SMSA, a supporters' association entered as the SLO)
     is not shouting and is left alone. */
  function shouting(p) {
    var f = (p.firstName || '').trim(), l = (p.lastName || '').trim();
    if (f && l && f === f.toUpperCase() && l === l.toUpperCase() &&
        /[A-Z]/.test(f) && /[A-Z]/.test(l)) { return true; }
    return [f, l].some(function (v) {
      return v.replace(/-/g, ' ').split(' ').some(function (w) {
        return w.length > 5 && w === w.toUpperCase() && /[A-Z]/.test(w) && !isPlaceholder(w);
      });
    });
  }

  function needsRecase(v, loud) {
    v = (v || '').trim();
    if (!v || isPlaceholder(v)) { return false; }
    if (!/[a-z]/.test(v) && /[A-Z]/.test(v)) { return v.length > 5 || loud; }
    if (!/[A-Z]/.test(v) && /[a-z]/.test(v)) { return true; }   /* nothing capitalised */
    var words = v.split(' ').filter(Boolean);                   /* sentence case */
    return words.length > 1 && /[A-Z]/.test(words[0]) &&
      words.slice(1).every(function (w) { return !/[A-Z]/.test(w); }) &&
      words.slice(1).some(function (w) { return /[a-z]/.test(w); });
  }

  function atom(a, first, last, loud) {
    var lead = (a.match(/^[^0-9A-Za-z&]*/) || [''])[0];
    var trail = (a.match(/[^0-9A-Za-z&]*$/) || [''])[0];
    var core = a.slice(lead.length, trail ? a.length - trail.length : undefined);
    if (!core) { return a; }
    if (ACRONYM.indexOf(core.toUpperCase()) > -1) { return lead + core.toUpperCase() + trail; }
    /* A short all-caps token in a title that is not otherwise shouting is a
       deliberate initialism (KHFC, DSO). Keeping it avoids enumerating every
       club's initials. */
    if (!loud && core === core.toUpperCase() && /[A-Z]/.test(core) &&
        core.length >= 2 && core.length <= 5) { return lead + core + trail; }
    if (MINOR.indexOf(core.toLowerCase()) > -1 && !first && !last) {
      return lead + core.toLowerCase() + trail;
    }
    return lead + cap(core) + trail;
  }

  function titleCase(t) {
    /* Clubs sometimes paste an address into the job-title box. Casing it would
       disguise the mistake and break the address. */
    if (t.indexOf('@') > -1 || /https?:\/\/|www\./i.test(t)) { return t; }
    var words = t.split(' ').filter(function (w) { return w !== ''; });
    var loud = t === t.toUpperCase() && /[A-Z]/.test(t);
    return words.map(function (w, i) {
      var first = i === 0, last = i === words.length - 1;
      var bare = w.replace(/^[.,()\/&-]+|[.,()\/&-]+$/g, '');
      if (ACRONYM.indexOf(bare.toUpperCase()) > -1) {
        return w.replace(bare, bare.toUpperCase());
      }
      if (MINOR.indexOf(bare.toLowerCase()) > -1 && !first && !last) { return w.toLowerCase(); }
      if (!uniform(w)) { return w; }
      return w.split(/([\/\-])/).map(function (part) {
        return (part === '/' || part === '-') ? part : atom(part, first, last, loud);
      }).join('');
    }).join(' ');
  }

  /* ---------------------------------------------------------------- typos
     Misspellings we have actually seen come through the form, plus the
     obvious near-misses of the same words. Deliberately a closed list rather
     than a spell checker: a dictionary would happily "correct" club names,
     initialisms and surnames, and a job-title box is full of all three.

     Whole words only, matched case-insensitively; the replacement takes the
     shape of the word it replaces, so a shouted title stays shouted until
     titleCase gets to it. Scope is job titles — a surname is never a typo. */
  var TYPOS = {
    wellfare: 'welfare', wefare: 'welfare', welfar: 'welfare', wellfar: 'welfare',
    safegaurding: 'safeguarding', safegarding: 'safeguarding',
    secetary: 'secretary', secretay: 'secretary', secretery: 'secretary',
    secratary: 'secretary', secertary: 'secretary',
    exectutive: 'executive', exective: 'executive', excutive: 'executive',
    mangerss: 'managers', manger: 'manager', mangaer: 'manager', mananger: 'manager',
    liason: 'liaison', liasion: 'liaison',
    comercial: 'commercial', commerical: 'commercial',
    managment: 'management', developement: 'development',
    edical: 'medical', physo: 'physio', pyhsio: 'physio',
    operatons: 'operations', opertions: 'operations',
    cheif: 'chief', diector: 'director', drector: 'director',
    markting: 'marketing', marketting: 'marketing',
    comunity: 'community', comunications: 'communications',
  };
  /* One word the form regularly arrives split in two. */
  var TYPO_SPLIT = [[/\bsafe\s+guarding\b/ig, 'safeguarding']];

  /* Case comes from the title around the word, not the word itself: a
     misspelling is not evidence of anything, and "Head of Sports Science and
     edical" wants Medical, not medical. */
  function titleShape(t) {
    var words = t.match(/[A-Za-z]+/g) || [];
    if (!words.length) { return 'lower'; }
    if (words.every(function (w) { return w === w.toUpperCase(); })) { return 'upper'; }
    var caps = words.filter(function (w) { return /^[A-Z]/.test(w); }).length;
    return caps * 2 >= words.length ? 'title' : 'lower';
  }
  function likeCase(word, to, shape) {
    if (shape === 'upper') { return to.toUpperCase(); }
    if (shape === 'title' && MINOR.indexOf(to.split(' ')[0]) === -1) {
      return to.charAt(0).toUpperCase() + to.slice(1);
    }
    return /^[A-Z]/.test(word) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  }
  /* A person's address inside the record. Provenance is written against the
     id rather than the array index, because the merge pass reorders people and
     an index-keyed marker would end up pointing at somebody else. */
  function pathFor(p, i, tail) {
    return 'people/' + (p.id || ('i' + i)) + (tail ? '/' + tail : '');
  }
  function noop() {}

  function fixTypos(rec, log) {
    var n = 0; log = log || noop;
    (rec.people || []).forEach(function (p, pi) {
      (p.roles || []).forEach(function (r, ri) {
        var t = (r.title || '').trim();
        /* An address pasted into the title box, or a plain TBC, is a different
           problem and gets asked about rather than silently rewritten. */
        if (!t || isPlaceholder(t) || t.indexOf('@') > -1) { return; }
        var out = t, shape = titleShape(t);
        TYPO_SPLIT.forEach(function (s) {
          out = out.replace(s[0], function (m) { return likeCase(m, s[1], shape); });
        });
        out = out.replace(/[A-Za-z]+/g, function (w) {
          var fix = TYPOS[w.toLowerCase()];
          return fix ? likeCase(w, fix, shape) : w;
        });
        if (out !== t) {
          r.title = out; n++;
          log(pathFor(p, pi, 'roles/' + ri + '/title'), t, out, 'typo');
        }
      });
    });
    return n;
  }

  /* ------------------------------------------------------- compound titles
     A club with one person covering two jobs often types both into one box:
     "Director/Club Secretary", "Vice Chairman & Head of Media". Repeated
     across every department they touch, it reads as one enormous job rather
     than two ordinary ones, and the directory shows the wrong title in half
     the sections.

     The test is whether each half lands on a DIFFERENT section this person is
     already listed in. That is deliberately strict: it can only redistribute
     titles across departments the club filled in themselves, never invent a
     department, and never touch a title whose ampersand is simply part of the
     job's name ("Media & Marketing Officer", "Head of Retail and Ticketing"). */
  var SECTION_WORDS = {
    'Directors': ['director','chairman','chair','board','president','owner'],
    'Leadership': ['chairman','chair','board','president','owner'],
    'Executive': ['chief exec','ceo','managing director','strategy'],
    'Club secretary': ['secretary'],
    'Finance': ['treasurer','finance','accounts'],
    'Commercial': ['commercial','partnership','sponsor','retail','business development'],
    'Ticketing': ['ticket','box office'],
    'Media & marketing': ['media','marketing','press','comms','communication'],
    'Programme': ['programme'],
    'Medical': ['medical','physio','doctor','therapy'],
    'Matchday & safety': ['safety','matchday','match day','steward'],
    'Safeguarding & welfare': ['safeguard','welfare'],
    'Community': ['community','foundation'],
    'Team operations': ['kit','team operations','football secretary','logistics']
  };
  /* Words that already name a job. A half containing one stands on its own;
     a half without one is a bare subject ("Commercial", "Media") that was
     leaning on the other half's noun and needs it back. */
  var ROLE_NOUN = /\b(lead|manager|officer|director|executive|secretary|co-?ordinator|champion|chairman|chair|president|owner|member|treasurer|analyst|physio|doctor|editor|steward|operations|ops|ceo|cfo|coo|md)\b/i;

  /* "Commercial and Communication Lead" is not a Commercial and a
     Communication Lead, it is a Commercial Lead and a Communication Lead.
     Same in front: "Head of Commercial and Media" carries the Head of. */
  function carryNoun(parts) {
    var last = parts[parts.length - 1], first = parts[0];
    var tail = last.match(/\b([A-Za-z-]+)$/);
    if (tail && ROLE_NOUN.test(tail[1])) {
      parts = parts.map(function (x, i) {
        return (i === parts.length - 1 || ROLE_NOUN.test(x)) ? x : x + ' ' + tail[1];
      });
    }
    var lead = first.match(/^((?:head|director|officer)\s+of)\s+/i);
    if (lead) {
      parts = parts.map(function (x, i) {
        return (i === 0 || ROLE_NOUN.test(x) || /\bof\b/i.test(x)) ? x : lead[1] + ' ' + x;
      });
    }
    return parts;
  }

  function sectionsFor(half, held) {
    var h = half.toLowerCase(), out = [];
    held.forEach(function (s) {
      var words = SECTION_WORDS[s] || [];
      for (var i = 0; i < words.length; i++) {
        if (h.indexOf(words[i]) > -1) { out.push(s); return; }
      }
    });
    return out;
  }
  /* Returns one entry per person whose title was split, so the email and the
     green list can say precisely what we are doing rather than gesturing. */
  function splitCompound(rec, log) {
    var done = []; log = log || noop;
    (rec.people || []).forEach(function (p, pi) {
      var rs = p.roles || [];
      var held = [];
      rs.forEach(function (r) { if (held.indexOf(r.section) < 0) { held.push(r.section); } });
      rs.forEach(function (r) {
        var t = (r.title || '').trim();
        if (!t || t.indexOf('@') > -1) { return; }
        var parts = t.split(/\s*(?:&|\/|,|\band\b)\s*/)
          .map(function (x) { return x.trim(); }).filter(Boolean);
        if (parts.length < 2) { return; }
        /* Sections come from what the club wrote; the carried noun only shapes
           the text we show. Otherwise "Commercial" gaining a Director makes it
           look like a board role and the halves stop telling sections apart. */
        var maps = parts.map(function (x) { return sectionsFor(x, held); });
        parts = carryNoun(parts);
        var keys = {}, distinct = 0;
        maps.forEach(function (m) {
          if (!m.length) { return; }
          var k = m.slice().sort().join('|');
          if (!keys[k]) { keys[k] = 1; distinct++; }
        });
        if (distinct < 2) { return; }
        /* Each of this person's roles takes the half that names it. A section
           no half claims keeps what the club wrote. */
        var moves = [];
        held.forEach(function (s) {
          var claim = parts.filter(function (x, i) { return maps[i].indexOf(s) > -1; });
          if (claim.length !== 1) { return; }
          rs.forEach(function (r2, r2i) {
            if (r2.section === s && (r2.title || '').trim() !== claim[0]) {
              var was = r2.title;
              r2.title = claim[0];
              moves.push({ section: s, title: claim[0] });
              log(pathFor(p, pi, 'roles/' + r2i + '/title'), was, claim[0], 'split');
            }
          });
        });
        if (moves.length) { done.push({ who: fullName(p), from: t, moves: moves }); }
      });
    });
    return done;
  }

  /* Returns what was changed, so the green list describes the truth. */
  function tidyCase(rec, log) {
    var n = { names: 0, titles: 0, emails: 0 }; log = log || noop;
    (rec.people || []).forEach(function (p, pi) {
      var loud = shouting(p), touched = false;
      ['firstName', 'lastName'].forEach(function (f) {
        var v = (p[f] || '').trim();
        if (needsRecase(v, loud)) {
          var out = recase(v);
          if (out !== v) {
            p[f] = out; touched = true;
            log(pathFor(p, pi, f), v, out, 'case');
          }
        }
      });
      if (touched) {
        n.names++;
        p.name = [p.title, p.firstName, p.lastName, p.postNominals]
          .map(function (x) { return (x || '').trim(); })
          .filter(Boolean).join(' ');
      }
      (p.roles || []).forEach(function (r, ri) {
        var t = (r.title || '').trim();
        if (!t || !needsRecase(t, loud)) { return; }
        var out = titleCase(t);
        if (out !== t) {
          r.title = out; n.titles++;
          log(pathFor(p, pi, 'roles/' + ri + '/title'), t, out, 'case');
        }
      });
      p.emails = (p.emails || []).map(function (em, ei) {
        if (em && /[A-Z]/.test(em)) {
          n.emails++;
          log(pathFor(p, pi, 'emails/' + ei), em, em.toLowerCase(), 'case');
          return em.toLowerCase();
        }
        return em;
      });
    });
    return n;
  }

  /* One person, one record: union their roles, addresses and numbers, and keep
     the record hidden if any of its halves was. The form let a club add the
     same person twice, which is user error rather than anything they need to
     explain to us , so it is fixed quietly and never flagged.

     The absorbed record's id is kept on the survivor. It is the only thing
     that survives the collapse, and without it a club-signoff link or a later
     re-import pointing at the losing id resolves to nobody, silently. */
  function mergeByName(rec, log) {
    var seen = {}, out = [], merged = []; log = log || noop;
    (rec.people || []).forEach(function (p, pi) {
      var k = fullName(p).toLowerCase();
      if (!k) { out.push(p); return; }
      if (!seen[k]) { seen[k] = p; out.push(p); return; }
      var t = seen[k];
      var gained = (p.roles || []).map(function (r) { return r.section; });
      t.roles = (t.roles || []).concat(p.roles || []);
      (p.emails || []).forEach(function (em) {
        if (em && (t.emails || []).indexOf(em) < 0) { t.emails = (t.emails || []).concat(em); }
      });
      (p.phones || []).forEach(function (ph) {
        var have = (t.phones || []).some(function (x) { return x.number === ph.number; });
        if (!have) { t.phones = (t.phones || []).concat(ph); }
      });
      if (p.hideContact) { t.hideContact = true; }
      if (p.id) { t.mergedIds = (t.mergedIds || []).concat(p.id); }

      var entry = null;
      for (var i = 0; i < merged.length; i++) {
        if (merged[i].keptId === t.id) { entry = merged[i]; break; }
      }
      if (!entry) {
        entry = { kept: fullName(t), keptId: t.id || '', absorbed: [] };
        merged.push(entry);
      }
      entry.absorbed.push({ id: p.id || '', sections: gained });
      log(pathFor(t, pi, 'roles'), fullName(p) + ' (' + gained.join(', ') + ')',
        'combined into one entry', 'merge');
    });
    rec.people = out;
    return merged;
  }

  /* Live RTDB stores leads as {areaKey: [personId]} — bare id strings. The
     export tool expands them to {id, name}, which is what this page was written
     against, so against the real database every list rendered blank. Accept
     both shapes and resolve an id back to the person. */
  function leadNames(rec, key) {
    var raw = (rec.leads || {})[key] || [];
    var byId = {};
    (rec.people || []).forEach(function (p) { if (p.id) { byId[p.id] = p; } });
    return raw.map(function (n) {
      if (typeof n === 'string') {
        var p = byId[n];
        return p ? fullName(p) : '';
      }
      return (n && (n.name || (byId[n.id] ? fullName(byId[n.id]) : ''))) || '';
    }).filter(Boolean);
  }

  function fullName(p) {
    return (p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || '').trim();
  }

  /* ---------------------------------------------------------------- run
     The whole pipeline, in order, against a copy. Returns the tidied record
     and a full account of what was done to it — which is what the bake
     writes alongside the data, and what the sign-off page counts. */
  function run(rec) {
    var out = JSON.parse(JSON.stringify(rec));
    var changes = [];
    var log = function (path, from, to, kind) {
      changes.push({ path: path, from: from, to: to, kind: kind });
    };
    var typos  = fixTypos(out, log);
    var splits = splitCompound(out, log);
    var cased  = tidyCase(out, log);
    var merges = mergeByName(out, log);
    return {
      rec: out,
      changes: changes,
      counts: { typos: typos, cased: cased, splits: splits.length, merges: merges.length },
      splits: splits,
      merges: merges
    };
  }

  window.NLTidy = {
    run: run,
    fixTypos: fixTypos,
    splitCompound: splitCompound,
    tidyCase: tidyCase,
    mergeByName: mergeByName,
    leadNames: leadNames,
    fullName: fullName,
    isPlaceholder: isPlaceholder
  };
}());
