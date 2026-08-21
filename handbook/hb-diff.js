/* Handbook — draft vs published edition diff (browser-side, no dependencies)
   ------------------------------------------------------------------
   Answers one question for a non-technical reader: what has changed in the
   handbook since the last edition was published, and is it safe to publish?

   Richard asked for "the plus minus green and red, same as you would for a
   git diff — less for coders, and more for people like our admin team". So
   this is deliberately NOT a text diff of the stored document. A git-style
   diff of the draft would be thousands of lines of HTML, and almost all of
   it noise from one deletion.

   THE HARD PART IS RENUMBERING, and it is the reason this file exists at
   all. Numbers here are never stored — the editor computes them from the
   tree on every render (see computeNumbers in index.html). Delete clause 6.2
   and every later clause in the article renumbers: 6.3 becomes 6.2, 6.4
   becomes 6.3, and so on down. A diff that compares documents by their
   numbers reports that as forty changes when a person made one, and buries
   the deletion that caused it somewhere in the middle.

   So everything here is keyed on NODE IDENTITY — the id the editor assigns
   when a clause is created and never reuses. A clause whose text and parent
   and position are unchanged, but whose printed number moved, did not
   change: it was renumbered BY something else, and it is counted in one
   summary line rather than listed forty times.

   The same logic covers reordering. If three clauses swap places, only the
   ones that actually moved are reported — found with a longest-increasing-
   subsequence over the sibling order, which is the smallest honest answer to
   "what moved". A naive scan says everything after the first swap moved.

   FIVE KINDS OF CHANGE, and every clause gets exactly one:
     added      a clause that is not in the published edition
     removed    a clause that was, and is not in the draft
     edited     same clause, different words (or table, or numbering style)
     moved      same clause, different parent, or a different place among
                its siblings
     renumbered the consequence, summarised and never listed

   Runs in the browser and under `node --test` — no DOM, no fetch, no
   Firebase. index.html hands it two plain objects and renders what it
   returns.

   2026-08-21 v1.0 — first cut.
*/
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- text */

  var ENTITIES = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘',
    '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–',
    '&mdash;': '—', '&hellip;': '…'
  };

  /* Stored bodies are sanitised HTML (p, br, b, i, u, ul, ol, li, a, span).
     The reader of this diff is reading WORDS, so the markup goes — but the
     line structure does not, or two paragraphs merge into one run-on
     sentence and the diff invents a change on the join. */
  function htmlToText(html) {
    if (html == null) return '';
    var s = String(html);
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|li|div|h[1-6])\s*>/gi, '\n');
    s = s.replace(/<[^>]*>/g, '');
    s = s.replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
    s = s.replace(/&[a-z]+;/gi, function (e) {
      var k = e.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : e;
    });
    /* Collapse runs of spaces but keep the line breaks that survived. */
    s = s.replace(/[ \t ]+/g, ' ');
    s = s.replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n');
    return s.replace(/^\s+|\s+$/g, '');
  }

  function words(text) {
    var t = String(text == null ? '' : text).replace(/^\s+|\s+$/g, '');
    return t ? t.split(/\s+/) : [];
  }

  /* Above this many differing words on either side, the O(n·m) table stops
     being worth building — and a clause that changed by 400 words is not
     something anyone reads word by word anyway. It becomes one struck
     paragraph and one new one, which is the truth at a coarser grain. */
  var LCS_LIMIT = 600;

  function lcsOps(a, b) {
    var n = a.length, m = b.length, i, j;
    var d = new Array(n + 1);
    for (i = 0; i <= n; i++) { d[i] = new Array(m + 1); d[i][m] = 0; }
    for (j = 0; j <= m; j++) d[n][j] = 0;
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        d[i][j] = (a[i] === b[j]) ? d[i + 1][j + 1] + 1
                                  : Math.max(d[i + 1][j], d[i][j + 1]);
      }
    }
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ t: '=', s: a[i] }); i++; j++; }
      else if (d[i + 1][j] >= d[i][j + 1]) { ops.push({ t: '-', s: a[i] }); i++; }
      else { ops.push({ t: '+', s: b[j] }); j++; }
    }
    while (i < n) { ops.push({ t: '-', s: a[i] }); i++; }
    while (j < m) { ops.push({ t: '+', s: b[j] }); j++; }
    return ops;
  }

  function coalesce(ops) {
    var out = [];
    ops.forEach(function (op) {
      if (!op.s && op.s !== '0') return;
      var last = out[out.length - 1];
      if (last && last.t === op.t) last.s += ' ' + op.s;
      else out.push({ t: op.t, s: op.s });
    });
    return out;
  }

  /* Word-level diff of two plain strings.
       [{t:'=',s}, {t:'-',s}, {t:'+',s}, ...]  — '-' is red, '+' is green.

     Trims the common head and tail first. Real edits are local — a date, a
     fee, one clause of a sentence — so this usually reduces a 300-word
     clause to the dozen words that actually moved, and the expensive table
     is built over those. */
  function diffWords(before, after) {
    var a = words(before), b = words(after);
    var p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    var s = 0;
    while (s < a.length - p && s < b.length - p &&
           a[a.length - 1 - s] === b[b.length - 1 - s]) s++;

    var midA = a.slice(p, a.length - s);
    var midB = b.slice(p, b.length - s);
    var ops = [];
    if (p) ops.push({ t: '=', s: a.slice(0, p).join(' ') });
    if (midA.length > LCS_LIMIT || midB.length > LCS_LIMIT) {
      if (midA.length) ops.push({ t: '-', s: midA.join(' ') });
      if (midB.length) ops.push({ t: '+', s: midB.join(' ') });
    } else if (midA.length || midB.length) {
      ops = ops.concat(lcsOps(midA, midB));
    }
    if (s) ops.push({ t: '=', s: a.slice(a.length - s).join(' ') });
    return coalesce(ops);
  }

  /* ------------------------------------------------------------- content */

  /* Firebase drops nulls, so a field that was never set and a field that was
     cleared come back differently — undefined here, '' there. Every
     comparison in this file goes through here or nothing agrees. */
  function norm(v) { return (v == null) ? '' : String(v); }

  /* Firebase returns a sparse array as an object keyed by index, so a table
     read straight off the wire — which is what an edition snapshot is — has
     objects where the editor has arrays. Comparing those raw reports every
     table in the handbook as changed. The editor's own normNode() fixes the
     draft side; this fixes both. */
  function toArray(v) {
    if (!v) return [];
    if (Object.prototype.toString.call(v) === '[object Array]') return [].slice.call(v);
    return Object.keys(v)
      .sort(function (a, b) { return (+a) - (+b); })
      .map(function (k) { return v[k]; });
  }

  function normTable(t) {
    if (!t) return null;
    return {
      header: toArray(t.header).map(norm),
      rows: toArray(t.rows).map(function (r) { return toArray(r).map(norm); })
    };
  }

  var STYLE_FIELDS = ['kind', 'numStyle', 'numberOverride'];

  /* What "the same clause" means. Deliberately excludes order and parentId
     (that is a move, reported separately) and updatedAt/updatedBy (which
     change on every save and would make every clause look edited). */
  function contentOf(n) {
    return {
      title: norm(n.title),
      body: norm(n.body),
      table: JSON.stringify(normTable(n.table)),
      style: STYLE_FIELDS.map(function (f) { return norm(n[f]); }).join('')
    };
  }

  /* ----------------------------------------------------------- structure */

  function orderedSiblings(nodes) {
    var by = {};
    Object.keys(nodes).forEach(function (id) {
      var p = nodes[id].parentId;
      if (p === undefined) p = null;
      var k = (p === null) ? ' root' : String(p);
      (by[k] || (by[k] = [])).push(id);
    });
    Object.keys(by).forEach(function (k) {
      by[k].sort(function (x, y) {
        var dx = (nodes[x].order || 0) - (nodes[y].order || 0);
        return dx || (x < y ? -1 : x > y ? 1 : 0);
      });
    });
    return by;
  }

  /* Indices of a longest strictly-increasing subsequence. Patience sorting
     with parent pointers — O(n log n), and n here is a sibling list. */
  function lisIndices(seq) {
    if (!seq.length) return [];
    var tails = [], prev = new Array(seq.length), i;
    for (i = 0; i < seq.length; i++) {
      var lo = 0, hi = tails.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (seq[tails[mid]] < seq[i]) lo = mid + 1; else hi = mid;
      }
      prev[i] = lo > 0 ? tails[lo - 1] : -1;
      tails[lo] = i;
    }
    var out = [], k = tails[tails.length - 1];
    while (k >= 0) { out.push(k); k = prev[k]; }
    return out.reverse();
  }

  /* Which clauses actually changed place among their siblings.
     Everything NOT in the longest increasing subsequence is what had to
     move to get from one order to the other — the smallest honest answer.
     Scanning for "first index that differs" instead reports every clause
     after a single swap. */
  function movedWithinParent(pubNodes, drfNodes, bothIds) {
    var inBoth = {};
    bothIds.forEach(function (id) { inBoth[id] = true; });
    var pubBy = orderedSiblings(pubNodes), drfBy = orderedSiblings(drfNodes);
    var moved = {};
    Object.keys(drfBy).forEach(function (k) {
      var pubList = (pubBy[k] || []).filter(function (id) { return inBoth[id]; });
      var drfList = drfBy[k].filter(function (id) { return inBoth[id]; });
      if (drfList.length < 2) return;
      var pos = {};
      pubList.forEach(function (id, i) { pos[id] = i; });
      /* Only ids the published edition had under THIS parent can be judged
         for order here; one that arrived from another parent is a move
         already and is reported as one. */
      var seq = [], ids = [];
      drfList.forEach(function (id) {
        if (pos[id] === undefined) return;
        seq.push(pos[id]); ids.push(id);
      });
      var keep = {};
      lisIndices(seq).forEach(function (i) { keep[ids[i]] = true; });
      ids.forEach(function (id) { if (!keep[id]) moved[id] = true; });
    });
    return moved;
  }

  /* ------------------------------------------------------------ the diff */

  function label(node) {
    var t = htmlToText(node.title);
    if (t) return t;
    var b = htmlToText(node.body).replace(/\n/g, ' ');
    if (b.length > 80) b = b.slice(0, 79) + '…';
    if (b) return b;
    if (node.table) return 'Table';
    return 'Untitled clause';
  }

  /* pub/drf: { id: node }.  pubNum/drfNum: { id: '6.2' }.
     Returns one entry per changed clause, plus a renumbered count. */
  function diffArea(pub, pubNum, drf, drfNum) {
    pub = pub || {}; drf = drf || {}; pubNum = pubNum || {}; drfNum = drfNum || {};
    var out = { added: [], removed: [], edited: [], moved: [], renumbered: 0 };

    var both = Object.keys(drf).filter(function (id) { return pub[id]; });
    var reordered = movedWithinParent(pub, drf, both);

    Object.keys(pub).forEach(function (id) {
      if (drf[id]) return;
      out.removed.push({ id: id, number: norm(pubNum[id]), label: label(pub[id]), before: pub[id] });
    });

    Object.keys(drf).forEach(function (id) {
      var d = drf[id], p = pub[id];
      if (!p) {
        out.added.push({ id: id, number: norm(drfNum[id]), label: label(d), after: d });
        return;
      }
      var cp = contentOf(p), cd = contentOf(d);
      var textChanged = cp.title !== cd.title || cp.body !== cd.body;
      var tableChanged = cp.table !== cd.table;
      var styleChanged = cp.style !== cd.style;
      var pp = p.parentId === undefined ? null : p.parentId;
      var dp = d.parentId === undefined ? null : d.parentId;
      var parentChanged = norm(pp) !== norm(dp);
      var placeChanged = parentChanged || !!reordered[id];

      if (textChanged || tableChanged || styleChanged) {
        out.edited.push({
          id: id,
          number: norm(drfNum[id]),
          wasNumber: norm(pubNum[id]),
          label: label(d),
          before: p, after: d,
          textChanged: textChanged,
          tableChanged: tableChanged,
          /* Bold added, a list turned from (a) to (i): the words are
             identical. Saying "edited" without saying this sends someone
             hunting for a wording change that is not there. */
          styleOnly: !textChanged && !tableChanged && styleChanged,
          alsoMoved: placeChanged
        });
        return;
      }
      if (placeChanged) {
        out.moved.push({
          id: id, number: norm(drfNum[id]), wasNumber: norm(pubNum[id]),
          label: label(d), toParent: parentChanged, before: p, after: d
        });
        return;
      }
      /* Same clause, same words, same place — and a different printed
         number. Somebody else's edit did that. */
      if (norm(pubNum[id]) !== norm(drfNum[id])) out.renumbered++;
    });

    return out;
  }

  function areaTotal(a) {
    /* Renumbering is deliberately NOT counted. It is a consequence of the
       changes above it, and counting it turns "one clause deleted" into
       "forty-one changes" on the badge. */
    return a.added.length + a.removed.length + a.edited.length + a.moved.length;
  }

  function total(areas) {
    return Object.keys(areas).reduce(function (n, k) { return n + areaTotal(areas[k]); }, 0);
  }

  global.HB_DIFF = {
    diffArea: diffArea,
    diffWords: diffWords,
    htmlToText: htmlToText,
    areaTotal: areaTotal,
    total: total,
    label: label,
    _lisIndices: lisIndices,
    _movedWithinParent: movedWithinParent,
    _contentOf: contentOf,
    _normTable: normTable
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
