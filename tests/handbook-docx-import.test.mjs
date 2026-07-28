/* Handbook .docx import — unit tests for handbook/docx-import.js.

   The fixtures here are synthetic documents built in-memory: the real
   sources are league material and must not be committed to this public
   repo, which is the whole reason the importer reads from the user's
   machine rather than a seed file. The shapes below mirror how Word
   actually emits these documents — markers fused into the run text
   ("2.11Transfer of Membership"), headings in caps, bullets as literal
   characters. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  Promise, parseInt, isNaN, Uint8Array, TextDecoder, TextEncoder,
  DecompressionStream, Response,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(REPO, 'handbook/docx-import.js'), 'utf8'), sandbox);
const HB = sandbox.HB_DOCX;

/* --------------------------------------------------------------- fixtures */

// Minimal stored (uncompressed) zip. The importer ignores CRCs, so the
// checksum fields stay zero — this only has to be structurally valid.
function makeZip(entries) {
  const enc = new TextEncoder();
  const locals = [], central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameB = enc.encode(name), data = enc.encode(text);
    const lh = new Uint8Array(30 + nameB.length + data.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(8, 0, true);                 // method 0 = stored
    dv.setUint32(18, data.length, true);      // compressed size
    dv.setUint32(22, data.length, true);      // uncompressed size
    dv.setUint16(26, nameB.length, true);
    lh.set(nameB, 30); lh.set(data, 30 + nameB.length);
    locals.push(lh);

    const ch = new Uint8Array(46 + nameB.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameB, 46);
    central.push(ch);
    offset += lh.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const l of locals) { out.set(l, p); p += l.length; }
  for (const c of central) { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return out.buffer;
}

const p = (runs) => '<w:p>' + runs + '</w:p>';
const r = (t, pr = '') => `<w:r>${pr ? '<w:rPr>' + pr + '</w:rPr>' : ''}<w:t>${t}</w:t></w:r>`;
const docx = (bodyXml) => makeZip([['word/document.xml',
  `<?xml version="1.0"?><w:document><w:body>${bodyXml}</w:body></w:document>`]]);

/* ----------------------------------------------------------------- markers */

test('splitMarker: a dotted number is strong, a bare one is weak', () => {
  assert.equal(HB._splitMarker('1.DEFINITIONS').num, '1');
  assert.equal(HB._splitMarker('1.DEFINITIONS').weak, undefined);
  assert.equal(HB._splitMarker('6.    REGISTRATION OF PLAYERS').rest, 'REGISTRATION OF PLAYERS');

  // The appendices number their top level without a dot, so a bare integer
  // has to be offered — but only as a weak candidate the tree builder can
  // reject against its running sequence.
  assert.equal(HB._splitMarker('1 Introduction').num, '1');
  assert.equal(HB._splitMarker('1 Introduction').weak, true);

  // Never markers in any document.
  assert.equal(HB._splitMarker('1 &amp; 2').style, 'none');
  assert.equal(HB._splitMarker('12').style, 'none');
});

test('parse: prose opening with a figure is not promoted to a rule', async () => {
  const seed = await HB.parse(docx(
    p(r('1.FIRST RULE')) +
    p(r('2.SECOND RULE')) +
    // Out of sequence, so it is prose that happens to start with a number.
    p(r('2 permitted to or from any one Club at any one time')) +
    p(r('3.THIRD RULE'))
  ));
  const top = seed.nodes.filter((n) => !n.parentId);
  assert.equal(top.map((n) => n.title).join(' | '), 'First Rule | Second Rule | Third Rule');
  const stray = seed.nodes.find((n) => /permitted to or from/.test(n.body || ''));
  assert.ok(stray, 'the sentence should survive as prose');
  assert.equal(stray.numStyle, 'none');
});

test('parse: appendix-style dotless numbering is accepted in sequence', async () => {
  const seed = await HB.parse(docx(
    p(r('APPENDIX D')) +
    p(r('THE NATIONAL LEAGUE FINANCIAL REPORTING INITIATIVE')) +
    p(r('1 Introduction')) +
    p(r('1.1 This document forms the basis of the Initiative.')) +
    p(r('2 Procedure'))
  ));
  const top = seed.nodes.filter((n) => !n.parentId);
  assert.equal(top.length, 2);
  assert.equal(seed.doc.coverTitle, 'APPENDIX D');
  assert.equal(seed.doc.coverSubtitle, 'THE NATIONAL LEAGUE FINANCIAL REPORTING INITIATIVE');
  // 1.1 nests under 1, and the cover lines are not clauses.
  const kids = seed.nodes.filter((n) => n.parentId === top[0].id);
  assert.equal(kids.length, 1);
  assert.match(kids[0].body, /forms the basis/);
});

test('splitMarker: dotted sub-numbers need no separator', () => {
  assert.equal(HB._splitMarker('2.11Transfer of Membership').num, '2.11');
  assert.equal(HB._splitMarker('2.11Transfer of Membership').rest, 'Transfer of Membership');
  assert.equal(HB._splitMarker('12.4.1 Something').num, '12.4.1');
});

test('splitMarker: the 13.A insolvency tier does not eat rule 15', () => {
  assert.equal(HB._splitMarker('13.A.SPORTING SANCTIONS').num, '13.A');
  assert.equal(HB._splitMarker('13.B. GENERAL INSOLVENCY').num, '13.B');
  assert.equal(HB._splitMarker('13.A.1 First tier').num, '13.A.1');
  // "15.WITHDRAWAL" must not read as rule 15, tier W.
  assert.equal(HB._splitMarker('15.WITHDRAWAL OF CLUBS').num, '15');
  assert.equal(HB._splitMarker('15.WITHDRAWAL OF CLUBS').rest, 'WITHDRAWAL OF CLUBS');
});

test('splitMarker: list markers', () => {
  assert.equal(HB._splitMarker('(a)entering into a CVA').style, 'lower-alpha');
  assert.equal(HB._splitMarker('(ii) A bank guarantee').style, 'lower-roman');
  assert.equal(HB._splitMarker('•The Football Association').style, 'bullet');
  assert.equal(HB._splitMarker('•The Football Association').rest, 'The Football Association');
});

test('titleCase: keeps acronyms, drops the stray full stop', () => {
  assert.equal(HB._titleCase('PLAYING OF MATCHES.'), 'Playing of Matches');
  assert.equal(HB._titleCase('FA STANDARDISED MEMBERSHIP RULES'), 'FA Standardised Membership Rules');
  assert.equal(HB._titleCase('POWER OF THE BOARD'), 'Power of the Board');
});

test('stripLeading: removes the marker but keeps inline tags', () => {
  const html = '<strong>2.11</strong>Transfer of <em>Membership</em>';
  const out = HB._stripLeading(html, '2.11Transfer of Membership', 'Transfer of Membership');
  assert.equal(out.includes('<em>Membership</em>'), true);
  assert.equal(out.includes('2.11'), false);
});

/* -------------------------------------------------------------- end to end */

test('parse: builds the rule tree from a document', async () => {
  const seed = await HB.parse(docx(
    p(r('FA STANDARDISED MEMBERSHIP RULES 2026/27 SEASON')) +
    p(r('1.DEFINITIONS')) +
    p(r('In these Rules:')) +
    p(r('&#8220;Agent&#8221; shall be as defined in the Rules of The FA.')) +
    p(r('2.MEMBERSHIP REQUIREMENTS')) +
    p(r('2.1Each Club shall comply.')) +
    p(r('(a)first condition')) +
    p(r('(b)second condition')) +
    p(r('3.CLUB COLOURS'))
  ));

  assert.equal(seed.doc.season, '2026/27');
  assert.equal(seed.doc.subtitle, 'FA Standardised Membership Rules 2026/27 Season');

  const top = seed.nodes.filter((n) => !n.parentId);
  // Joined rather than deepEqual: sandbox values come from another realm,
  // so strict deepEqual rejects structurally identical arrays.
  assert.equal(top.map((n) => n.title).join(' | '), 'Definitions | Membership Requirements | Club Colours');

  // The cover line must not become a clause.
  assert.equal(seed.nodes.some((n) => /STANDARDISED/i.test(n.title || '')), false);

  // A defined term is its own clause; "In these Rules:" is not merged into it.
  const defs = seed.nodes.filter((n) => n.parentId === top[0].id);
  assert.equal(defs.length, 2);
  assert.match(defs[1].body, /Agent/);

  // The (a)/(b) conditions hang off 2.1, not off rule 2.
  const r21 = seed.nodes.find((n) => (n.body || '').includes('Each Club shall comply'));
  const conds = seed.nodes.filter((n) => n.parentId === r21.id);
  assert.equal(conds.length, 2);
  assert.equal(conds[0].numStyle, 'lower-alpha');
  assert.match(conds[0].body, /first condition/);
});

test('parse: a restarted list stays inside its rule', async () => {
  const seed = await HB.parse(docx(
    p(r('1.FIRST RULE')) +
    p(r('2.SECOND RULE')) +
    p(r('2.1Some requirement:')) +
    p(r('1. Details of the works')) +
    p(r('2. Details of the costs')) +
    p(r('3.THIRD RULE'))
  ));
  const top = seed.nodes.filter((n) => !n.parentId);
  // Three rules — the "1./2." list inside rule 2 must not become rules.
  assert.equal(top.map((n) => n.title).join(' | '), 'First Rule | Second Rule | Third Rule');
  const listed = seed.nodes.filter((n) => /Details of the/.test(n.body || ''));
  assert.equal(listed.length, 2);
  assert.equal(listed[0].parentId, listed[1].parentId);
  assert.notEqual(listed[0].parentId, null);
});

test('parse: tables become table nodes', async () => {
  const seed = await HB.parse(docx(
    p(r('1.PLAYING SEASON')) +
    '<w:tbl>' +
    `<w:tr><w:tc>${p(r('STEP'))}</w:tc><w:tc>${p(r('COMMENCES'))}</w:tc></w:tr>` +
    `<w:tr><w:tc>${p(r('1 &amp; 2'))}</w:tc><w:tc>${p(r('Fourth Thursday'))}</w:tc></w:tr>` +
    '</w:tbl>'
  ));
  const tbl = seed.nodes.find((n) => n.kind === 'table');
  assert.ok(tbl, 'expected a table node');
  assert.equal(tbl.table.header.join('|'), 'STEP|COMMENCES');
  assert.equal(tbl.table.rows.length, 1);
  assert.equal(tbl.table.rows[0].join('|'), '1 & 2|Fourth Thursday');
});

test('parse: bold and italic runs survive as inline tags', async () => {
  const seed = await HB.parse(docx(
    p(r('1.A RULE')) +
    p(r('Plain ') + r('bold', '<w:b/>') + r(' and ') + r('italic', '<w:i/>') + r(' text.'))
  ));
  const n = seed.nodes.find((x) => /Plain/.test(x.body || ''));
  assert.match(n.body, /<strong>bold<\/strong>/);
  assert.match(n.body, /<em>italic<\/em>/);
});

test('parse: rejects a file that is not a docx', async () => {
  await assert.rejects(
    () => HB.parse(new TextEncoder().encode('not a zip at all').buffer),
    /Not a \.docx/
  );
});

/* ------------------------------------------------------- legacy .doc text */

test('splitDocText: line and page breaks end a paragraph', () => {
  // Several appendices separate every numbered clause with a manual line
  // break (\x0B) rather than a paragraph mark. Treating those as text
  // collapsed entire documents into one node.
  const out = HB._splitDocText('1. First clause\x0B2. Second clause\x0B3. Third clause');
  assert.equal(out.length, 3);
  assert.equal(out[0], '1. First clause');
  assert.equal(out[2], '3. Third clause');
});

test('splitDocText: paragraph marks, cell marks and blank runs', () => {
  const out = HB._splitDocText('Intro\rCell A\x07Cell B\r\r  \rTail\x0CAfter page break');
  assert.equal(out.join(' | '), 'Intro | Cell A | Cell B | Tail | After page break');
});

test('splitDocText: strips stray control characters but keeps the text', () => {
  const out = HB._splitDocText('Clause \x01with\x02 embedded\x1F marks');
  assert.equal(out.length, 1);
  assert.equal(out[0], 'Clause with embedded marks');
});

/* ------------------------------------------------------------ multi-import */

test('merge: several documents become one area, ids never collide', async () => {
  const a = await HB.parse(docx(p(r('APPENDIX A')) + p(r('DISCIPLINARY PROCEDURES')) + p(r('1. First')) + p(r('2. Second'))));
  const b = await HB.parse(docx(p(r('APPENDIX B')) + p(r('THE PLAY-OFFS')) + p(r('1. Only clause'))));
  const merged = HB.merge([{ name: 'Appendix_A.docx', seed: a }, { name: 'Appendix_B.docx', seed: b }]);

  const top = merged.nodes.filter((n) => !n.parentId);
  assert.equal(top.length, 2);
  assert.equal(top[0].title, 'Appendix A — Disciplinary Procedures');
  assert.equal(top[1].title, 'Appendix B — The Play-Offs');

  // Both source documents contained an "r1"; ids must be reissued.
  const ids = merged.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique across documents');

  // Every non-wrapper node hangs off its own document.
  const under = (w) => merged.nodes.filter((n) => n.parentId === w.id);
  assert.equal(under(top[0]).length, 2);
  assert.equal(under(top[1]).length, 1);
});

test('docLabel: falls back to the filename when a document omits its letter', async () => {
  // Appendix G opens "NATIONAL LEAGUE SYSTEM REGULATIONS" — it never states
  // its own letter, so the filename has to supply it.
  const g = await HB.parse(docx(p(r('NATIONAL LEAGUE SYSTEM REGULATIONS')) + p(r('DEFINITIONS')) + p(r('1. A clause'))));
  const merged = HB.merge([{ name: 'Appendix_G_26_27.doc', seed: g }]);
  assert.equal(merged.nodes.filter((n) => !n.parentId)[0].title, 'Appendix G — National League System Regulations');
});

test('docLabel: a prose second line is not used as a subtitle', async () => {
  const q = await HB.parse(docx(
    p(r('APPENDIX Q')) +
    p(r('This Licensing System has been compiled by the National League and is subject to review.')) +
    p(r('1. A clause'))
  ));
  const merged = HB.merge([{ name: 'Appendix_Q_26_27.doc', seed: q }]);
  // Just the letter — not the whole sentence.
  assert.equal(merged.nodes.filter((n) => !n.parentId)[0].title, 'Appendix Q');
});
