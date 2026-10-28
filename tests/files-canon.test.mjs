/* NL.files + NL.zip — the file-library canon (nl-utils v1.46).

   Promoted from Programme Packs when the Document Library became the second
   caller. The ZIP tests moved here from tests/programme.test.mjs unchanged in
   what they assert; the naming tests are new, because a library that claims
   to behave like a desktop folder has to refuse what a desktop refuses. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NL } from './load-canon.mjs';

const F = NL.files;
const Zip = NL.zip;

/* Objects made inside the VM context carry that context's Object prototype,
   which deepStrictEqual counts as a difference. Compare their data. */
const plain = (o) => JSON.parse(JSON.stringify(o));

async function bytesOf(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/* ── ZIP writer ─────────────────────────────────────────────────────────── */

test('crc32 matches the standard IEEE test vector', () => {
  const bytes = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
  assert.equal(Zip.crc32(bytes), 0x414FA339);
});

test('crc32 of empty input is 0', () => {
  assert.equal(Zip.crc32(new Uint8Array(0)), 0);
});

test('uniqueName suffixes collisions the way a desktop would', () => {
  const taken = {};
  assert.equal(Zip.uniqueName('crest.png', taken), 'crest.png');
  assert.equal(Zip.uniqueName('crest.png', taken), 'crest (2).png');
  assert.equal(Zip.uniqueName('crest.png', taken), 'crest (3).png');
  assert.equal(Zip.uniqueName('README', taken), 'README');
  assert.equal(Zip.uniqueName('README', taken), 'README (2)');
});

test('uniqueName never returns a duplicate', () => {
  const taken = {}, seen = new Set();
  for (let i = 0; i < 200; i++) {
    const n = Zip.uniqueName('same.jpg', taken);
    assert.ok(!seen.has(n), `duplicate entry name: ${n}`);
    seen.add(n);
  }
});

test('build emits the ZIP magic numbers and one central entry per file', async () => {
  const enc = new TextEncoder();
  const bytes = await bytesOf(Zip.build([
    { name: 'a/one.txt', data: enc.encode('one') },
    { name: 'b/two.txt', data: enc.encode('two') },
  ]));
  function count(sig) {
    let n = 0;
    for (let i = 0; i + 3 < bytes.length; i++) {
      if (bytes[i] === sig[0] && bytes[i + 1] === sig[1] && bytes[i + 2] === sig[2] && bytes[i + 3] === sig[3]) n++;
    }
    return n;
  }
  assert.equal(count([0x50, 0x4b, 0x03, 0x04]), 2, 'one local header per entry');
  assert.equal(count([0x50, 0x4b, 0x01, 0x02]), 2, 'one central directory entry per file');
  assert.equal(count([0x50, 0x4b, 0x05, 0x06]), 1, 'exactly one end-of-central-directory');
});

test('dosStamp packs a real date — zero renders as 30 Nov 1979 and looks corrupt', () => {
  const stamp = Zip.dosStamp(Date.UTC(2026, 7, 3, 14, 30, 20));
  const d = new Date(Date.UTC(2026, 7, 3, 14, 30, 20));
  assert.equal(stamp.date >> 9, d.getFullYear() - 1980);
  assert.equal((stamp.date >> 5) & 0x0F, d.getMonth() + 1);
  assert.equal(stamp.date & 0x1F, d.getDate());
  assert.equal(stamp.time >> 11, d.getHours());
  assert.equal((stamp.time >> 5) & 0x3F, d.getMinutes());
});

test('dosStamp clamps anything before the DOS epoch rather than wrapping', () => {
  const early = Zip.dosStamp(Date.UTC(1970, 0, 1));
  assert.equal(early.date >> 9, 0, 'year 1980');
  assert.equal((early.date >> 5) & 0x0F, 1);
  assert.equal(early.date & 0x1F, 1);
  assert.ok(Zip.dosStamp(NaN).date > 0, 'a junk date still yields a valid field');
});

test('build marks names UTF-8 so accented names survive', async () => {
  const flat = await bytesOf(Zip.build([{ name: 'Àccented.txt', data: new Uint8Array([1]) }]));
  /* General-purpose flag is bytes 6-7 of the local header; bit 11 = 0x0800. */
  assert.equal(flat[6] | (flat[7] << 8), 0x0800);
});

/* ── Names people see ───────────────────────────────────────────────────── */

test('cleanName refuses every character Windows refuses', () => {
  for (const ch of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
    const r = F.cleanName('Report' + ch + '2026.pdf');
    assert.equal(r.ok, false, `accepted ${JSON.stringify(ch)}`);
    assert.match(r.error, /can’t contain/);
  }
});

test('cleanName trims, collapses spaces and drops the trailing dot Windows would strip', () => {
  assert.deepEqual(plain(F.cleanName('  Club   Licensing  Criteria.pdf  ')),
    { ok: true, name: 'Club Licensing Criteria.pdf' });
  assert.deepEqual(plain(F.cleanName('Minutes.')), { ok: true, name: 'Minutes' });
});

test('cleanName keeps punctuation a desktop allows', () => {
  const name = 'Ground Grading — Category C (2026-27) & Appendix #1, v2.docx';
  assert.deepEqual(plain(F.cleanName(name)), { ok: true, name });
});

test('cleanName refuses empty, dot-only and Windows reserved names', () => {
  assert.equal(F.cleanName('').ok, false);
  assert.equal(F.cleanName('   ').ok, false);
  assert.equal(F.cleanName('...').ok, false);
  assert.equal(F.cleanName('CON').ok, false);
  assert.equal(F.cleanName('nul.txt').ok, false);
  assert.equal(F.cleanName('Console notes.txt').ok, true, 'only the exact reserved stem');
});

test('cleanName caps length', () => {
  assert.equal(F.cleanName('x'.repeat(161)).ok, false);
  assert.equal(F.cleanName('x'.repeat(160)).ok, true);
});

test('keepExt puts back a dropped extension and refuses to change type', () => {
  assert.equal(F.keepExt('Final', 'Report.docx'), 'Final.docx');
  assert.equal(F.keepExt('Final.docx', 'Report.docx'), 'Final.docx');
  assert.equal(F.keepExt('Final.DOCX', 'Report.docx'), 'Final.DOCX', 'case is not a change of type');
  assert.equal(F.keepExt('Final.pdf', 'Report.docx'), 'Final.pdf.docx');
  assert.equal(F.keepExt('Final', 'README'), 'Final', 'no extension to keep');
});

test('uniqueIn ignores case, because Windows and macOS do', () => {
  assert.equal(F.uniqueIn('Budget.pdf', ['budget.PDF']), 'Budget (2).pdf');
  assert.equal(F.uniqueIn('Budget.pdf', ['Budget.pdf', 'Budget (2).pdf']), 'Budget (3).pdf');
  assert.equal(F.uniqueIn('Budget.pdf', ['Other.pdf']), 'Budget.pdf');
  assert.equal(F.uniqueIn('Minutes', ['minutes']), 'Minutes (2)');
  assert.equal(F.uniqueIn('x.pdf', []), 'x.pdf');
  assert.equal(F.uniqueIn('x.pdf', undefined), 'x.pdf');
});

test('contentDisposition carries the exact name, inline so the PDF preview still previews', () => {
  const h = F.contentDisposition('Club Licensing — 2026/27 (final).pdf');
  assert.match(h, /^inline; /);
  assert.match(h, /filename="Club Licensing _ 2026\/27 _final_.pdf"|filename="Club Licensing _ 2026\/27 \(final\).pdf"/);
  const star = h.split("filename*=UTF-8''")[1];
  assert.equal(decodeURIComponent(star), 'Club Licensing — 2026/27 (final).pdf');
});

test('contentDisposition cannot be broken out of by a quote or backslash', () => {
  const h = F.contentDisposition('a"b\\c.pdf');
  const quoted = h.match(/filename="([^"]*)"/)[1];
  assert.equal(quoted, 'a_b_c.pdf');
  assert.equal(decodeURIComponent(h.split("filename*=UTF-8''")[1]), 'a"b\\c.pdf');
});

/* ── Types and kinds ────────────────────────────────────────────────────── */

test('typeFor canonicalises by extension before trusting the browser', () => {
  assert.equal(F.typeFor({ name: 'pack.zip', type: 'application/x-zip-compressed' }), 'application/zip');
  assert.equal(F.typeFor({ name: 'Deck.PPTX', type: '' }),
    'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  assert.equal(F.typeFor({ name: 'thing.xyz', type: 'chemical/x-xyz' }), 'chemical/x-xyz');
  assert.equal(F.typeFor({ name: 'thing', type: '' }), 'application/octet-stream');
});

test('kind recognises slides as their own kind', () => {
  assert.equal(F.kind('', 'deck.pptx'), 'slides');
  assert.equal(F.kind('application/vnd.ms-powerpoint', 'x'), 'slides');
  assert.equal(F.kind('', 'notes.docx'), 'doc');
  assert.equal(F.kind('', 'figures.xlsx'), 'sheet');
  assert.equal(F.kind('', 'thing.zip'), 'file');
  assert.equal(F.kindIcon('nonsense'), F.kindIcon('file'));
});

test('isDocx: .docx by type or name, never the 2003 .doc', () => {
  assert.equal(F.isDocx({ name: 'a.docx' }), true);
  assert.equal(F.isDocx({ name: 'a', contentType: F.EXT_TYPE.docx }), true);
  assert.equal(F.isDocx({ name: 'a.doc', contentType: 'application/msword' }), false);
});

test('previews.fitWithin scales the long edge and never upscales', () => {
  assert.deepEqual(plain(F.previews.fitWithin(4000, 3000, 360)), { w: 360, h: 270 });
  assert.deepEqual(plain(F.previews.fitWithin(200, 100, 360)), { w: 200, h: 100 });
  assert.deepEqual(plain(F.previews.fitWithin(10000, 1, 360)), { w: 360, h: 1 });
});

/* ── Queue ──────────────────────────────────────────────────────────────── */

test('queue runs at most `limit` at once and survives a failure', async () => {
  const q = F.queue(2);
  let active = 0, peak = 0, done = 0;
  const finished = new Promise((resolve) => {
    for (let i = 0; i < 7; i++) {
      q.push(() => {
        active++; peak = Math.max(peak, active);
        return new Promise((res, rej) => setTimeout(() => {
          active--; done++;
          if (done === 7) setTimeout(resolve, 0);
          (i === 2 ? rej : res)(new Error('boom'));
        }, 5));
      });
    }
  });
  await finished;
  assert.equal(peak, 2);
  assert.equal(done, 7, 'a rejected job did not stall the rest');
});
