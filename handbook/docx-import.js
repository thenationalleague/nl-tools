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
   2026-07-28 v1.1 — legacy Word 97-2003 .doc support (OLE/CFB + piece
                     table), container chosen by magic bytes, and
                     multi-document merge for areas made of several files.
   2026-07-28 v1.2 — Word automatic list numbering (w:numPr + numbering.xml).
                     Documents numbered by Word carry no markers in their
                     text at all, so reading only the text flattened them —
                     the Board Directives lost every a)..e) sub-item.
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

  /* ------------------------------------------------- legacy .doc (OLE/CFB) */

  // Word 97-2003 files are not zips at all — they are OLE compound files.
  // The text sits in the WordDocument stream but is fragmented: the piece
  // table (CLX) in the 0Table/1Table stream says where each run lives and
  // whether it is CP1252 or UTF-16. Enough of that format is implemented
  // here to recover paragraph text, which is all the tree builder needs —
  // the markers in these documents are literal characters, not Word list
  // formatting. Inline bold/italic and table structure are NOT recovered.
  function readCFB(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var ssz = 1 << dv.getUint16(30, true), mssz = 1 << dv.getUint16(32, true);
    var nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true);
    var miniCutoff = dv.getUint32(56, true);
    var miniStart = dv.getUint32(60, true), nMini = dv.getUint32(64, true);
    var difatStart = dv.getUint32(68, true), nDifat = dv.getUint32(72, true);

    function sector(n) { var o = 512 + n * ssz; return bytes.subarray(o, o + ssz); }
    function u32of(buf, i) {
      return (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) >>> 0;
    }

    var difat = [], i;
    for (i = 0; i < 109; i++) difat.push(dv.getUint32(76 + i * 4, true));
    var sec = difatStart;
    for (i = 0; i < nDifat && sec < 0xFFFFFFFA; i++) {
      var blk = sector(sec);
      for (var j = 0; j < ssz / 4 - 1; j++) difat.push(u32of(blk, j * 4));
      sec = u32of(blk, ssz - 4);
    }

    var fat = [];
    for (i = 0; i < nFat; i++) {
      if (difat[i] >= 0xFFFFFFFA) continue;
      var fb = sector(difat[i]);
      for (var k = 0; k < ssz / 4; k++) fat.push(u32of(fb, k * 4));
    }

    var minifat = [];
    sec = miniStart;
    for (i = 0; i < nMini && sec < 0xFFFFFFFA; i++) {
      var mb = sector(sec);
      for (var q = 0; q < ssz / 4; q++) minifat.push(u32of(mb, q * 4));
      sec = fat[sec];
    }

    function chain(start, size, mini, miniStream) {
      var parts = [], total = 0, s = start, guard = 0;
      while (s < 0xFFFFFFFA && guard++ < 1000000) {
        if (mini) parts.push(miniStream.subarray(s * mssz, s * mssz + mssz));
        else parts.push(sector(s));
        total += mini ? mssz : ssz;
        s = (mini ? minifat : fat)[s];
        if (s === undefined) break;
      }
      var out = new Uint8Array(total), p = 0;
      parts.forEach(function (b) { out.set(b, p); p += b.length; });
      return out.subarray(0, size);
    }

    var dirRaw = chain(dirStart, 1 << 28, false, null), entries = [];
    for (i = 0; i + 128 <= dirRaw.length; i += 128) {
      var nlen = dirRaw[i + 64] | (dirRaw[i + 65] << 8);
      var nm = '';
      for (var c = 0; c < Math.max(0, nlen - 2); c += 2) nm += String.fromCharCode(dirRaw[i + c] | (dirRaw[i + c + 1] << 8));
      entries.push({ name: nm, type: dirRaw[i + 66], start: u32of(dirRaw, i + 116), size: u32of(dirRaw, i + 120) });
    }
    var root = entries[0];
    var miniStream = root ? chain(root.start, root.size, false, null) : new Uint8Array(0);

    return function stream(name) {
      for (var n = 0; n < entries.length; n++) {
        var e = entries[n];
        if (e.name === name && e.type === 2) return chain(e.start, e.size, e.size < miniCutoff, miniStream);
      }
      return null;
    };
  }

  var CP1252 = { 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 };

  function docParagraphs(bytes) {
    var stream = readCFB(bytes);
    var wd = stream('WordDocument');
    if (!wd) throw new Error('That .doc has no WordDocument stream.');
    var flags = wd[0x0A] | (wd[0x0B] << 8);
    var tbl = stream((flags & 0x0200) ? '1Table' : '0Table');
    if (!tbl) throw new Error('That .doc is missing its table stream.');

    function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
    var fcClx = u32(wd, 0x01A2), lcbClx = u32(wd, 0x01A6);
    var clx = tbl.subarray(fcClx, fcClx + lcbClx), i = 0, plc = null;
    while (i < clx.length) {
      if (clx[i] === 0x01) { i += 3 + (clx[i + 1] | (clx[i + 2] << 8)); }
      else if (clx[i] === 0x02) { plc = clx.subarray(i + 5, i + 5 + u32(clx, i + 1)); break; }
      else break;
    }
    if (!plc) throw new Error('That .doc has no piece table.');

    var n = Math.floor((plc.length - 4) / 12), text = '';
    for (var k = 0; k < n; k++) {
      var cpStart = u32(plc, k * 4), cpEnd = u32(plc, (k + 1) * 4), len = cpEnd - cpStart;
      var pcdAt = 4 * (n + 1) + k * 8, fc = u32(plc, pcdAt + 2);
      var compressed = !!(fc & 0x40000000);
      fc &= 0x3FFFFFFF;
      if (compressed) {
        var at = fc >> 1;
        for (var a = 0; a < len; a++) { var b = wd[at + a]; text += String.fromCharCode(CP1252[b] || b); }
      } else {
        for (var u = 0; u < len; u++) text += String.fromCharCode(wd[fc + u * 2] | (wd[fc + u * 2 + 1] << 8));
      }
    }
    return splitDocText(text);
  }

  // \r ends a paragraph and \x07 ends a table cell/row. \x0B is a manual
  // line break and \x0C a page break — some of these documents (Appendix P,
  // and Appendices F/I/J) separate every numbered clause with a line break
  // rather than a paragraph mark, so treating those as ordinary text
  // collapses the whole document into a single node. Table geometry is not
  // recoverable this way, only the cell text.
  function splitDocText(text) {
    return text.replace(/[\x07\x0B\x0C]/g, '\r').split('\r')
      .map(function (s) { return s.replace(/[\x00-\x08\x0E-\x1F]/g, '').replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
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
  var BR = '\u0001';

  function paraHtml(p) {
    var runs = p.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [], out = '', openB = false, openI = false;
    runs.forEach(function (r) {
      // Walk the run's children in document order. A run can interleave
      // text with manual line breaks — <w:t>1. ...</w:t><w:br/><w:t>2. ...
      // is how a converted .doc carries a numbered list — so collecting all
      // the text first and appending the breaks afterwards would run every
      // clause together into one paragraph.
      var t = '', cm, cRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*>|<w:tab\s*\/>/g;
      while ((cm = cRe.exec(r))) {
        if (cm[1] !== undefined) t += unesc(cm[1]);
        else if (cm[0].indexOf('<w:br') === 0) t += BR;
        else t += ' ';
      }
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

  /* --------------------------------------------------- Word auto-numbering */

  // Some documents carry no markers in their text at all and number
  // themselves with Word's list engine instead — the Board Directives are
  // numbered 1..n with a)..e) beneath, none of which appears in the run
  // text. numbering.xml maps a numId and level to a format; the level gives
  // the nesting and the format gives the style. The numbers themselves are
  // left to the editor, which computes them.
  var NUMFMT = {
    decimal: 'decimal', lowerLetter: 'lower-alpha', upperLetter: 'upper-alpha',
    lowerRoman: 'lower-roman', upperRoman: 'upper-alpha', bullet: 'bullet',
    none: 'none', ordinal: 'decimal', decimalZero: 'decimal'
  };

  function parseNumbering(xml) {
    if (!xml) return {};
    var abstracts = {}, m;
    var absRe = /<w:abstractNum [^>]*w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g;
    while ((m = absRe.exec(xml))) {
      var lvls = {}, lm, lvlRe = /<w:lvl [^>]*w:ilvl="(\d+)"[\s\S]*?<\/w:lvl>/g;
      while ((lm = lvlRe.exec(m[0]))) {
        var f = lm[0].match(/<w:numFmt w:val="([^"]+)"/);
        lvls[lm[1]] = f ? f[1] : 'decimal';
      }
      abstracts[m[1]] = lvls;
    }
    var map = {}, nm, numRe = /<w:num [^>]*w:numId="(\d+)"[\s\S]*?<\/w:num>/g;
    while ((nm = numRe.exec(xml))) {
      var a = nm[0].match(/<w:abstractNumId w:val="(\d+)"/);
      map[nm[1]] = (a && abstracts[a[1]]) || {};
    }
    return map;
  }

  // The numPr of one paragraph, or null. numId 0 means "no numbering".
  function paraList(chunk, numbering) {
    var np = chunk.match(/<w:numPr>[\s\S]*?<\/w:numPr>/);
    if (!np) return null;
    var ni = np[0].match(/<w:numId w:val="(\d+)"/);
    if (!ni || ni[1] === '0') return null;
    var il = np[0].match(/<w:ilvl w:val="(\d+)"/);
    var lvl = il ? il[1] : '0';
    return { ilvl: +lvl, numId: ni[1], fmt: (numbering[ni[1]] || {})[lvl] || 'decimal' };
  }

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
    // A bare integer with no dot ("1 Introduction") is how the appendices
    // number their top level, but it is also how prose and table cells
    // start ("2 permitted to or from any one Club"). Offer it as a weak
    // candidate and let the caller's running sequence decide.
    if ((m = text.match(/^(\d+)\s+(?=[A-Za-z“"(])/))) {
      return { style: 'decimal', num: m[1], rest: text.slice(m[0].length).trim(), weak: true };
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

  // Reads like a title rather than prose: short, and with no lower-case
  // letters once digits and punctuation are set aside.
  function isTitleish(t) {
    if (!t || t.length > 90) return false;
    return !/[a-z]/.test(t.replace(/\d|\W/g, ''));
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
      var b = new Uint8Array(arrayBuffer);
      // Dispatch on the container's magic bytes rather than the extension:
      // the appendices arrive as a mix of .docx (zip) and Word 97-2003
      // .doc (OLE), and a wrong extension should not decide the parser.
      if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
        return buildFromParagraphs(docParagraphs(b).map(function (t) { return { text: t, html: esc(t) }; }));
      }
      if (!(b[0] === 0x50 && b[1] === 0x4B)) {
        throw new Error('Not a .docx or .doc file (unrecognised format).');
      }
      return unzip(arrayBuffer, function (n) {
        return n === 'word/document.xml' || n === 'word/numbering.xml';
      }).then(function (files) {
        var xml = files['word/document.xml'];
        if (!xml) throw new Error('No word/document.xml inside that file — is it really a .docx?');
        return build(xml, files['word/numbering.xml']);
      });
    });
  }

  function build(xml, numberingXml) {
    var numbering = parseNumbering(numberingXml);
    var body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];

    // Walk paragraphs and tables in document order.
    var blocks = [], re = /<w:p[ >][\s\S]*?<\/w:p>|<w:tbl[ >][\s\S]*?<\/w:tbl>/g, m;
    while ((m = re.exec(body))) {
      var chunk = m[0];
      if (chunk.indexOf('<w:tbl') === 0) { blocks.push({ table: parseTable(chunk) }); continue; }
      var htmlStr = paraHtml(chunk);
      var txt = plain(htmlStr);
      // One Word paragraph can hold several logical ones, separated by
      // manual line breaks. Each piece becomes its own block, all sharing
      // the paragraph's list properties.
      var listInfo = paraList(chunk, numbering);
      htmlStr.split(BR).forEach(function (piece) {
        var pt = plain(piece);
        if (pt) blocks.push({ html: piece, text: pt, list: listInfo });
      });
    }
    return buildFromParagraphs(blocks);
  }

  // Tree building, shared by both containers. `blocks` are {text, html} or
  // {table} in document order.
  function buildFromParagraphs(blocks) {
    var nodes = [], seq = 0, byNum = {};
    function add(n) { n.id = 'r' + (++seq); nodes.push(n); return n; }
    // How many numbered children a node already has — i.e. the next number
    // a dotless sub-item under it would legitimately carry.
    function nextUnder(p) {
      return nodes.filter(function (x) { return x.parentId === p.id && x.numStyle === 'decimal'; }).length + 1;
    }
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
    var listStack = [];      // Word-numbered ancestors, indexed by list level
    var listBase = null;     // node enclosing the current Word-numbered list
    var prevList = false;

    // The cover block is the document's own title lines. It feeds doc meta
    // and must not become clauses. It is at most the first two paragraphs —
    // capping it matters because an appendix can run several paragraphs of
    // real content before its first number, and a document may carry no
    // numbering at all (Appendix E is headings and defined terms).
    var firstMarker = -1;
    for (var bi = 0; bi < blocks.length; bi++) {
      if (blocks[bi].text && splitMarker(blocks[bi].text).style === 'decimal') { firstMarker = bi; break; }
    }
    var coverCount = Math.min(firstMarker < 0 ? 2 : firstMarker, 2);
    // The second line only belongs to the cover if it reads like a title.
    // Several documents run straight from their title into prose (the Board
    // Directives open with directive #1, Appendix Q with a sentence), and
    // swallowing that line loses real content.
    if (coverCount > 1 && (!blocks[1] || !isTitleish(blocks[1].text))) coverCount = 1;
    doc.coverTitle = (blocks[0] && blocks[0].text) || '';
    doc.coverSubtitle = coverCount > 1 && blocks[1] ? blocks[1].text : '';

    blocks.forEach(function (b, idx) {
      if (idx < coverCount) return;
      if (b.table) { mk(current && current.id, 'table', 'none', null, null, null, b.table); return; }
      // A Word-numbered paragraph carries its structure in the list level
      // rather than in the text. Nest by that level and take the style from
      // numbering.xml; the editor computes the numbers themselves.
      if (b.list) {
        if (!prevList) listBase = current;
        var lvl = b.list.ilvl;
        var lparent = lvl > 0 ? (listStack[lvl - 1] || listBase) : listBase;
        var lstyle = NUMFMT[b.list.fmt] || 'decimal';
        var ln = mk(lparent ? lparent.id : null, lstyle === 'bullet' ? 'bullet' : 'clause',
          lstyle, null, null, b.text ? '<p>' + b.html + '</p>' : null);
        listStack[lvl] = ln;
        listStack.length = lvl + 1;
        prevList = true;
        // `current` deliberately does NOT move to the list item. Letting it
        // follow means the next list bases itself inside the previous list's
        // last item, and depth compounds without limit (Appendix G reached
        // 35 levels from a document that only uses three).
        lastBody = ln;
        return;
      }
      prevList = false;

      var mk2 = splitMarker(b.text);

      // A dotless bare integer only counts if it is the next number due at
      // some level — otherwise it is prose that happens to open with a
      // figure. This is what lets the appendices number as "1 Introduction"
      // while the Rules still reject "2 permitted to or from any one Club".
      if (mk2.weak) {
        var wants = +mk2.num;
        if (wants !== expectedTop && !(current && wants === nextUnder(current))) {
          mk2 = { style: 'none', num: null, rest: b.text };
        }
      }

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
      if (isHeading(b.text)) {
        lastBody = null;
        var h = mk(current && current.id, 'heading', 'none', null, titleCase(b.text), null);
        // In a document with no numbering at all (Appendix E is headings and
        // defined terms), headings are the only structure there is — so let
        // them own what follows instead of leaving one flat list.
        if (firstMarker < 0) current = h;
        return;
      }

      // A defined term ("X" means ...) is always its own clause. Any other
      // loose paragraph continues whatever body it follows, so a clause
      // spanning three paragraphs stays one node instead of three.
      var para = '<p>' + b.html + '</p>';
      if (/^[“"']/.test(b.text)) { mk(current && current.id, 'clause', 'none', null, null, para); lastBody = null; return; }
      // Continue the clause just read — but only once. Appending every loose
      // paragraph to the same node turns a document with no numbering (most
      // of the shorter appendices) into one enormous unusable clause.
      if (lastBody) { lastBody.body = (lastBody.body || '') + para; lastBody = null; return; }
      if (current && !current.title && !current.body) { current.body = para; lastBody = null; return; }
      mk(current && current.id, 'clause', 'none', null, null, para);
      lastBody = null;
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

  // Combine several parsed documents into one area. The appendices are 15
  // separate files that all live under a single "appendices" area, and the
  // importer replaces an area wholesale — so they have to be imported
  // together or each would wipe the last. Every document becomes one
  // top-level node with its own tree beneath, and ids are reissued so two
  // documents cannot collide on "r1".
  // Name the wrapper node for one document. Preference order: the document's
  // own "APPENDIX X" cover line, else the letter recovered from the filename
  // (not every source states its own letter — Appendix G opens with
  // "NATIONAL LEAGUE SYSTEM REGULATIONS"), else the filename itself.
  function docLabel(doc, fileName, index) {
    var cover = doc.coverTitle || '';
    var m = cover.match(/^APPENDIX\s+([A-Z0-9]+)\b/i);
    var fromFile = (fileName || '').match(/Appendix[_\s-]*([A-Z0-9]+)/i);
    var label = m ? 'Appendix ' + m[1].toUpperCase()
      : fromFile ? 'Appendix ' + fromFile[1].toUpperCase()
        : cover ? titleCase(cover) : (fileName || 'Document ' + (index + 1));

    // Use the second line as a subtitle only when it reads like a title.
    // Several documents run straight into prose, which makes a useless and
    // enormous node name.
    var sub = doc.coverSubtitle || '';
    // When the letter came from the filename, the cover line is the
    // document's real title rather than an "APPENDIX X" banner — use it.
    if (!m && fromFile && cover) sub = cover;
    if (sub && sub.length < 80 && !/[a-z]/.test(sub.replace(/\d|\W/g, ''))) {
      label += ' — ' + titleCase(sub);
    } else if (!m && !fromFile && cover) {
      label = titleCase(cover);
    }
    return label;
  }

  // Does a document announce itself as the area itself, rather than as one
  // named section of it? The Board Directives file is titled "THE NATIONAL
  // LEAGUE BOARD DIRECTIVES 2026/27" and its directives belong at the top
  // level, whereas Home-Grown Player Development is a named directive that
  // sits inside the same area — and every appendix is a named section too
  // ("APPENDIX A" does not name the "Appendices" area).
  function isWholeArea(coverTitle, areaTitle) {
    if (!coverTitle || !areaTitle) return false;
    var cover = coverTitle.toLowerCase();
    var words = areaTitle.toLowerCase().match(/[a-z]{3,}/g) || [];
    if (!words.length) return false;
    return words.every(function (w) { return cover.indexOf(w) >= 0; });
  }

  function merge(parsed, areaTitle) {
    var nodes = [], seq = 0, doc = null, order = 0;
    parsed.forEach(function (item, docIndex) {
      var seed = item && item.seed;
      if (!seed || !seed.nodes) return;
      if (!doc) doc = { id: seed.doc.id, title: seed.doc.title, subtitle: seed.doc.subtitle || '', season: seed.doc.season || '' };
      if (!doc.season && seed.doc.season) doc.season = seed.doc.season;

      var whole = isWholeArea(seed.doc.coverTitle, areaTitle);
      var wrapper = null;
      if (!whole) {
        wrapper = {
          id: 'd' + (docIndex + 1), parentId: null, order: order++, kind: 'clause',
          numStyle: 'none', numberOverride: null,
          title: docLabel(seed.doc, item.name, docIndex), body: null, table: null
        };
        nodes.push(wrapper);
      }

      var remap = {};
      seed.nodes.forEach(function (n) { remap[n.id] = 'd' + (docIndex + 1) + 'n' + (++seq); });
      seed.nodes.forEach(function (n) {
        var top = !n.parentId;
        nodes.push({
          id: remap[n.id],
          parentId: n.parentId ? remap[n.parentId] : (wrapper ? wrapper.id : null),
          order: (top && !wrapper) ? order++ : (n.order || 0),
          kind: n.kind, numStyle: n.numStyle,
          numberOverride: n.numberOverride || null, title: n.title || null,
          body: n.body || null, table: n.table || null
        });
      });
    });
    return { doc: doc || { title: '', subtitle: '', season: '' }, nodes: nodes };
  }

  global.HB_DOCX = {
    merge: merge, parse: parse, build: build, unzip: unzip, _splitMarker: splitMarker, _titleCase: titleCase, _stripLeading: stripLeading,
    _splitDocText: splitDocText, _docParagraphs: docParagraphs };
})(typeof globalThis !== 'undefined' ? globalThis : this);
