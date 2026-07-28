/* Handbook — .docx import (browser-side)
   ------------------------------------------------------------------
   Parses a Word .docx straight in the browser and returns a seed object
   in the same shape the handbook editor already imports:

     { doc: {title, subtitle, season}, nodes: [ {id,parentId,order,kind,
       numStyle,numberOverride,title,body,table}, ... ] }

   Why this exists: the source documents (League Rules, Articles, etc.)
   are league material and this repo is public. Fetching a committed
   seed-*.json means the payload has to be world-readable to work. Reading
   the .docx from the user's machine keeps it out of the repo entirely —
   it goes straight into RTDB behind auth-guard.

   No dependencies and no build step. The zip is inflated with the
   platform's DecompressionStream and the XML is read with regexes rather
   than DOMParser, so the exact same file runs in the browser and under
   node --test.

   2026-07-28 v1.0 — first cut. Zip reader, run/paragraph extraction with
                     inline bold/italic, marker detection (dotted decimal,
                     (a), (i), (A), a), bullets), tree building from the
                     dotted numbers, tables, and doc meta inferred from
                     the document's own title block.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- zip */

  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0); }

  // Scan back for the End Of Central Directory record. The comment field is
  // variable length, so there is no fixed offset to jump to.
  function findEOCD(d) {
    for (var i = d.length - 22; i >= 0 && i > d.length - 22 - 65536; i--) {
      if (u32(d, i) === 0x06054b50) return i;
    }
    return -1;
  }

  function inflateRaw(bytes) {
    if (typeof global.DecompressionStream !== 'function') {
      return Promise.reject(new Error('This browser cannot unzip .docx files (no DecompressionStream).'));
    }
    var ds = new global.DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // Pull named entries out of a zip. `wanted` is a predicate on the path;
  // we only inflate what we actually need, which for a big Rules document
  // is one file out of a few dozen.
  function unzip(arrayBuffer, wanted) {
    var d = new Uint8Array(arrayBuffer);
    var eocd = findEOCD(d);
    if (eocd < 0) throw new Error('Not a .docx file (no zip directory found).');
    var count = u16(d, eocd + 10), cdOff = u32(d, eocd + 16), p = cdOff, jobs = [], out = {};

    for (var i = 0; i < count; i++) {
      if (u32(d, p) !== 0x02014b50) break;
      var method = u16(d, p + 10);
      var compSize = u32(d, p + 20);
      var nameLen = u16(d, p + 28), extraLen = u16(d, p + 30), commentLen = u16(d, p + 32);
      var localOff = u32(d, p + 42);
      var name = new TextDecoder().decode(d.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!wanted(name)) continue;

      // The central directory's sizes are authoritative; the local header's
      // may be zeroed when a data descriptor was used. Read the local header
      // only for its own name/extra lengths so we can find the data start.
      if (u32(d, localOff) !== 0x04034b50) throw new Error('Damaged .docx (bad entry for ' + name + ').');
      var dataAt = localOff + 30 + u16(d, localOff + 26) + u16(d, localOff + 28);
      var raw = d.subarray(dataAt, dataAt + compSize);

      jobs.push(
        method === 0 ? Promise.resolve([name, raw])
          : method === 8 ? inflateRaw(raw).then(function (n) { return function (b) { return [n, b]; }; }(name))
            : Promise.reject(new Error('Unsupported compression in .docx (' + name + ').'))
      );
    }
    return Promise.all(jobs).then(function (pairs) {
      pairs.forEach(function (kv) { out[kv[0]] = new TextDecoder().decode(kv[1]); });
      return out;
    });
  }

  /* ---------------------------------------------------------------- xml */

  function unesc(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&');
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Text of one <w:p>, with bold/italic runs preserved as <strong>/<em>.
  // Word splits a styled phrase across many runs, so adjacent runs of the
  // same style are merged rather than emitted as a string of tiny tags.
  function paraHtml(p) {
    var runs = p.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [], out = '', openB = false, openI = false;
    runs.forEach(function (r) {
      var t = (r.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
        .map(function (m) { return unesc(m.replace(/<[^>]+>/g, '')); }).join('');
      if (r.indexOf('<w:tab/>') >= 0 && !t) t = ' ';
      if (!t) return;
      var pr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
      var b = /<w:b\/>|<w:b\s+w:val="(?:1|true|on)"/.test(pr);
      var i = /<w:i\/>|<w:i\s+w:val="(?:1|true|on)"/.test(pr);
      if (b !== openB) { out += b ? '<strong>' : '</strong>'; openB = b; }
      if (i !== openI) { out += i ? '<em>' : '</em>'; openI = i; }
      out += esc(t);
    });
    if (openI) out += '</em>';
    if (openB) out += '</strong>';
    return out;
  }

  function plain(htmlStr) { return unesc(htmlStr.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); }

  /* ------------------------------------------------------------- markers */

  var ROMAN = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)$/;

  // Split a leading list/clause marker off a paragraph. Word documents in
  // this family carry the marker as literal text ("2.11Transfer of...",
  // "(a)entering into...", "•The Football Association"), so this is where
  // the structure actually comes from.
  function splitMarker(text) {
    var m;
    // 13.A / 13.B insolvency tiers must be tested before the general decimal
    // rule, which would otherwise read "13.A.SPORTING SANCTIONS" as a second
    // rule 13 and orphan everything below it.
    if ((m = text.match(/^(\d+\.[A-Z](?![A-Za-z])(?:\.\d+)*)\.?\s*/))) {
      return { style: 'decimal', num: m[1], rest: text.slice(m[0].length).trim(), literal: true };
    }
    // A dotted sub-number is a marker whether or not a separator follows
    // ("2.11Transfer of Membership" is how Word emits it). A bare integer
    // only counts with its trailing dot — otherwise table cells and
    // fragments like "1 & 2" or "2 permitted to or from any one Club"
    // would each be read as a new rule.
    if ((m = text.match(/^(\d+\.\d+(?:\.\d+)*)\.?\s*/)) || (m = text.match(/^(\d+)\.\s*/))) {
      return { style: 'decimal', num: m[1], rest: text.slice(m[0].length).trim() };
    }
    if ((m = text.match(/^[•●▪]\s*/))) {
      return { style: 'bullet', num: null, rest: text.slice(m[0].length).trim() };
    }
    if ((m = text.match(/^\(([A-Za-z]{1,4})\)\s*/)) || (m = text.match(/^([a-z])\)\s*/))) {
      var tok = m[1];
      var style = ROMAN.test(tok.toLowerCase()) && tok.toLowerCase() !== 'i' ? 'lower-roman'
        : tok === tok.toUpperCase() ? 'upper-alpha' : 'lower-alpha';
      // A lone "(i)" is ambiguous — roman one or letter i. Treat it as roman
      // only when the previous sibling was already roman; the caller passes
      // that in via resolveAmbiguous below.
      return { style: style, num: tok, rest: text.slice(m[0].length).trim(), ambiguous: tok.toLowerCase() === 'i' };
    }
    return { style: 'none', num: null, rest: text.trim() };
  }

  // Headings arrive ALL CAPS, so an acronym is indistinguishable from any
  // other word by shape alone — the ones this family of documents uses are
  // listed explicitly and kept upper.
  var ACRONYMS = /^(FA|AGM|EGM|SGM|NL|EFL|VAT|UK|PLC|CVA|ID|TV|VAR|PA|CEO|COO|HR|VIP)$/;

  function titleCase(s) {
    var small = /^(a|an|and|as|at|but|by|for|from|in|of|on|or|the|to|with)$/;
    // Source headings sometimes carry a stray full stop ("PLAYING OF
    // MATCHES.") — titles in the editor never end in one.
    return s.replace(/\s+/g, ' ').replace(/\s*\.\s*$/, '').replace(/\/\s+/g, '/ ').trim()
      .replace(/[^\s\/&-]+/g, function (w, off) {
        var bare = w.replace(/[^A-Za-z]/g, '');
        if (ACRONYMS.test(bare.toUpperCase()) && w === w.toUpperCase()) return w;
        var lower = w.toLowerCase();
        if (off > 0 && small.test(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      });
  }

  function isHeading(t) {
    if (!t || t.length < 3 || t.length > 90) return false;
    var letters = t.replace(/[^A-Za-z]/g, '');
    return letters.length > 2 && letters === letters.toUpperCase();
  }

  /* --------------------------------------------------------------- tables */

  function parseTable(tbl) {
    var rows = (tbl.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || []).map(function (tr) {
      return (tr.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).map(function (tc) {
        return (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(plain).filter(Boolean).join(' ');
      });
    }).filter(function (r) { return r.some(function (c) { return c; }); });
    if (!rows.length) return null;
    return { header: rows[0], rows: rows.slice(1) };
  }

  /* ----------------------------------------------------------------- main */

  function parse(arrayBuffer) {
    // Always hand back a promise — a malformed file must surface as a
    // rejection callers can catch, not a synchronous throw.
    return Promise.resolve().then(function () {
      return unzip(arrayBuffer, function (n) { return n === 'word/document.xml'; });
    }).then(function (files) {
      var xml = files['word/document.xml'];
      if (!xml) throw new Error('No word/document.xml inside that file — is it really a .docx?');
      return build(xml);
    });
  }

  function build(xml) {
    var body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];

    // Walk paragraphs and tables in document order.
    var blocks = [], re = /<w:p[ >][\s\S]*?<\/w:p>|<w:tbl[ >][\s\S]*?<\/w:tbl>/g, m;
    while ((m = re.exec(body))) {
      var chunk = m[0];
      if (chunk.indexOf('<w:tbl') === 0) { blocks.push({ table: parseTable(chunk) }); continue; }
      var htmlStr = paraHtml(chunk);
      var txt = plain(htmlStr);
      if (txt) blocks.push({ html: htmlStr, text: txt });
    }

    var nodes = [], seq = 0, byNum = {}, stack = [];
    function add(n) { n.id = 'r' + (++seq); nodes.push(n); return n; }
    function mk(parentId, kind, numStyle, over, title, bodyHtml, table) {
      var siblings = nodes.filter(function (x) { return x.parentId === parentId; });
      return add({
        parentId: parentId || null, order: siblings.length, kind: kind, numStyle: numStyle,
        numberOverride: over || null, title: title || null, body: bodyHtml || null, table: table || null
      });
    }

    // Document meta comes from the title block at the top of the file.
    var doc = { id: 'league-rules', title: 'League Rules', subtitle: '', season: '' };
    for (var i = 0; i < Math.min(blocks.length, 12); i++) {
      var t = blocks[i].text || '';
      var sm = t.match(/(\d{4})\s*\/\s*(\d{2,4})/);
      if (/STANDARDISED MEMBERSHIP RULES/i.test(t)) {
        doc.subtitle = titleCase(t.replace(/\s*\d{4}\s*\/\s*\d{2,4}\s*SEASON\s*$/i, '')) +
          (sm ? ' ' + sm[1] + '/' + sm[2] + ' Season' : '');
      }
      if (sm && !doc.season) doc.season = sm[1] + '/' + sm[2];
    }

    var current = null;      // deepest numbered node
    var lastListStyle = null;
    var lastBody = null;     // node that loose prose should continue into
    var started = false;     // seen the first numbered rule yet?
    var expectedTop = 1;     // next top-level rule number due

    blocks.forEach(function (b) {
      // Everything above rule 1 is the cover block; it feeds doc meta above
      // and must not become clauses.
      if (!started) {
        var probe = splitMarker(b.text);
        if (!(probe.style === 'decimal' && probe.num)) return;
        started = true;
      }
      if (b.table) { mk(current && current.id, 'table', 'none', null, null, null, b.table); return; }
      var mk2 = splitMarker(b.text);

      if (mk2.ambiguous && lastListStyle !== 'lower-roman') mk2.style = 'lower-alpha';
      if (mk2.style === 'lower-roman' || mk2.style === 'lower-alpha' || mk2.style === 'upper-alpha') lastListStyle = mk2.style;
      else if (mk2.style === 'decimal') lastListStyle = null;

      if (mk2.style === 'decimal' && mk2.num) {
        var segs = mk2.num.split('.');
        var parent = null, restarted = false;

        if (segs.length === 1 && !mk2.literal) {
          // Top-level rules run 1..42 in order. A bare integer that is not
          // the next one due is a list that restarted inside the current
          // rule ("1. Details of the works, 2. Details of the costs"), not
          // a new rule — and must not claim byNum["1"] from rule 1.
          if (+mk2.num === expectedTop) { expectedTop++; }
          else { parent = current; restarted = true; }
        } else {
          var parentNum = segs.slice(0, -1).join('.');
          parent = byNum[parentNum] || null;
          // A sub-number whose parent never appeared (rare, but the source
          // is hand-maintained) hangs off the nearest ancestor we do have.
          while (parentNum && !parent && parentNum.indexOf('.') > 0) {
            parentNum = parentNum.split('.').slice(0, -1).join('.');
            parent = byNum[parentNum];
          }
          if (!parent) parent = current;
        }

        // Does the natural sequence already produce this number? If not,
        // pin it so the renderer shows what the document actually says.
        var sibs = nodes.filter(function (x) { return x.parentId === (parent ? parent.id : null) && x.numStyle === 'decimal'; });
        var expected = String(sibs.length + 1);
        var last = segs[segs.length - 1];
        var over = (last === expected && !mk2.literal) ? null : mk2.num;

        // The marker is stripped from the body so the number is not repeated
        // in prose the renderer numbers itself.
        var headingText = isHeading(mk2.rest) ? mk2.rest : null;
        var n = mk(parent ? parent.id : null, 'clause', 'decimal', over,
          headingText ? titleCase(headingText) : null,
          headingText || !mk2.rest ? null : '<p>' + stripLeading(b.html, b.text, mk2.rest) + '</p>');

        // A restarted list stays a leaf: the next "2." is its sibling under
        // the same rule, not its child, so `current` does not move.
        if (!restarted) { byNum[mk2.num] = n; current = n; }
        lastBody = n.body ? n : null;
        return;
      }

      if (mk2.style === 'bullet' || mk2.style === 'lower-alpha' || mk2.style === 'lower-roman' || mk2.style === 'upper-alpha') {
        lastBody = mk(current && current.id, mk2.style === 'bullet' ? 'bullet' : 'clause', mk2.style, null, null,
          '<p>' + stripLeading(b.html, b.text, mk2.rest) + '</p>');
        return;
      }

      // Unmarked line. An ALL-CAPS one that lands right after a numbered
      // rule is that rule's heading; anything else is body prose.
      if (isHeading(b.text) && current && !current.title && !current.body) {
        current.title = titleCase(b.text);
        return;
      }
      if (isHeading(b.text)) { lastBody = null; mk(current && current.id, 'heading', 'none', null, titleCase(b.text), null); return; }

      // A defined term ("X" means ...) is always its own clause. Any other
      // loose paragraph continues whatever body it follows, so a clause
      // spanning three paragraphs stays one node instead of three.
      var para = '<p>' + b.html + '</p>';
      if (/^[“"']/.test(b.text)) { lastBody = mk(current && current.id, 'clause', 'none', null, null, para); return; }
      if (lastBody) { lastBody.body = (lastBody.body || '') + para; return; }
      if (current && !current.title && !current.body) { current.body = para; lastBody = current; return; }
      lastBody = mk(current && current.id, 'clause', 'none', null, null, para);
    });

    return { doc: doc, nodes: nodes };
  }

  // Drop the marker from the HTML without losing inline tags. The marker is
  // always plain text at the very start, so we walk the HTML skipping tags
  // until we have consumed as many visible characters as the marker took.
  function stripLeading(htmlStr, fullText, rest) {
    var drop = fullText.length - rest.length;
    if (drop <= 0) return htmlStr;
    var out = '', seen = 0, i = 0;
    while (i < htmlStr.length) {
      if (htmlStr[i] === '<') {
        var j = htmlStr.indexOf('>', i);
        if (j < 0) break;
        out += htmlStr.slice(i, j + 1); i = j + 1; continue;
      }
      if (htmlStr[i] === '&') {
        var k = htmlStr.indexOf(';', i);
        if (k > 0 && k - i < 8) { if (seen >= drop) out += htmlStr.slice(i, k + 1); seen++; i = k + 1; continue; }
      }
      if (seen >= drop) out += htmlStr[i];
      seen++; i++;
    }
    return out.replace(/^\s+/, '');
  }

  global.HB_DOCX = { parse: parse, build: build, unzip: unzip, _splitMarker: splitMarker, _titleCase: titleCase, _stripLeading: stripLeading };
})(typeof globalThis !== 'undefined' ? globalThis : this);
