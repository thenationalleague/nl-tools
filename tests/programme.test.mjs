/* Programme Packs — unit tests for the pure logic in programme/_shared.js
   (loaded in a VM sandbox with a Firebase stub, same pattern as
   tests/uw-promo.test.mjs and load-canon.mjs). Covers the pieces that are
   easy to get quietly wrong and expensive to get wrong in production:

     · normCode      — must agree with the server copy in functions/programme.js,
                       or a club's typed passcode stops matching the stored one.
     · safeName      — a filename becomes part of a Storage object path.
     · storagePath   — the <CODE> segment is what Storage rules match on for
                       write-own, and is the key the portal migration depends on.
     · humanSize / fileKind — display only, but cheap to pin down.

   Firebase-dependent behaviour (the passcode → custom token exchange, rules
   enforcement, uploads) is not covered here: it needs the emulator or a live
   run. See programme/README.md for the manual smoke test. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const SERVER_TS = { '.sv': 'timestamp' };

const sandbox = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  Error, Promise, parseInt, parseFloat, isNaN, isFinite, URLSearchParams,
  encodeURIComponent, decodeURIComponent, Uint32Array,
  crypto: webcrypto,
  localStorage: {
    _v: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
    setItem(k, v) { this._v[k] = String(v); },
    removeItem(k) { delete this._v[k]; },
  },
  document: { addEventListener() {}, createElement() { return {}; }, body: { appendChild() {} } },
  location: { search: '', origin: 'https://nl.tools', pathname: '/programme/' },
  firebase: {
    initializeApp: () => ({
      auth: () => ({ currentUser: null, signInWithCustomToken: () => Promise.resolve({ user: {} }) }),
      database: () => ({ ref: () => ({ push: () => ({ key: 'stub' }) }) }),
      storage: () => ({ ref: () => ({}) }),
      functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: {} }) }),
    }),
    app: () => ({ functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: {} }) }) }),
    database: { ServerValue: { TIMESTAMP: SERVER_TS } },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(readFileSync(join(REPO, 'programme/_shared.js'), 'utf8'), sandbox,
  { filename: 'programme/_shared.js' });

const PP = sandbox.PP;

/* ── normCode ─────────────────────────────────────────────────────────────
   The server has its own copy in functions/programme.js. These cases are the
   contract between them: if you change one implementation, this list is what
   should fail. */
const NORM_CASES = [
  ['4K2M9P', '4K2M9P'],
  ['4k2m9p', '4K2M9P'],
  [' 4k2m 9p ', '4K2M9P'],
  ['4K2M-9P', '4K2M9P'],
  ['4K2M_9P', '4K2M9P'],
  ['', ''],
  [null, ''],
  [undefined, ''],
];

test('normCode: uppercases and strips everything non-alphanumeric', () => {
  for (const [input, expected] of NORM_CASES) {
    assert.equal(PP.normCode(input), expected, `normCode(${JSON.stringify(input)})`);
  }
});

test('normCode matches the server implementation in functions/programme.js', () => {
  /* Pull the server's normCode out of its module text and run the same cases
     through it. This is the check that catches the two copies drifting. */
  const src = readFileSync(join(REPO, 'functions/programme.js'), 'utf8');
  const m = src.match(/function normCode\(s\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'could not find normCode in functions/programme.js');
  // eslint-disable-next-line no-new-func
  const serverNorm = new Function(`${m[0]}; return normCode;`)();
  for (const [input, expected] of NORM_CASES) {
    assert.equal(serverNorm(input), expected, `server normCode(${JSON.stringify(input)})`);
  }
});

/* ── safeName ─────────────────────────────────────────────────────────── */

test('safeName strips path separators and traversal', () => {
  assert.equal(PP.safeName('../../etc/passwd'), 'etc-passwd');
  assert.equal(PP.safeName('a/b\\c.png'), 'a-b-c.png');
  assert.equal(PP.safeName('....png'), 'png');
});

test('safeName keeps a readable name and extension', () => {
  assert.equal(PP.safeName('Squad Photo 2026-27.jpg'), 'Squad Photo 2026-27.jpg');
  assert.equal(PP.safeName('crest_primary.PNG'), 'crest_primary.PNG');
});

test('safeName never returns empty', () => {
  for (const input of ['', '   ', '///', '???', null, undefined]) {
    const out = PP.safeName(input);
    assert.ok(out.length > 0, `safeName(${JSON.stringify(input)}) → ${JSON.stringify(out)}`);
    assert.ok(!out.includes('/'), 'no path separator');
  }
});

test('safeName caps length so a long name cannot bloat the object path', () => {
  assert.ok(PP.safeName('x'.repeat(500)).length <= 120);
});

/* ── storagePath ──────────────────────────────────────────────────────────
   The second segment is the club code, and Storage rules match write-own on
   exactly that position. A change here is a security change. */

test('storagePath puts the club code in the segment the rules match', () => {
  const p = PP.storagePath('FYL', 'fold1', 'file1', 'crest.png');
  assert.equal(p, 'programme/FYL/fold1/file1-crest.png');
  assert.equal(p.split('/')[0], 'programme');
  assert.equal(p.split('/')[1], 'FYL', 'club code must be the second segment');
});

test('storagePath sanitises the filename it embeds', () => {
  const p = PP.storagePath('NL', 'f', 'i', '../../evil.png');
  assert.equal(p, 'programme/NL/f/i-evil.png');
  assert.equal(p.split('/').length, 4, 'a crafted name cannot add path segments');
});

/* ── humanSize ────────────────────────────────────────────────────────── */

test('humanSize formats bytes through to GB', () => {
  assert.equal(PP.humanSize(0), '0 B');
  assert.equal(PP.humanSize(512), '512 B');
  assert.equal(PP.humanSize(1024), '1 KB');
  assert.equal(PP.humanSize(1536), '1.5 KB');
  assert.equal(PP.humanSize(1024 * 1024), '1 MB');
  assert.equal(PP.humanSize(100 * 1024 * 1024), '100 MB');
  assert.equal(PP.humanSize(1024 * 1024 * 1024), '1 GB');
});

test('humanSize copes with junk input', () => {
  assert.equal(PP.humanSize(undefined), '0 B');
  assert.equal(PP.humanSize(null), '0 B');
});

/* ── fileKind ─────────────────────────────────────────────────────────── */

test('fileKind classifies on content type first, extension second', () => {
  assert.equal(PP.fileKind('image/png', 'crest.png'), 'image');
  assert.equal(PP.fileKind('application/pdf', 'spec.pdf'), 'pdf');
  assert.equal(PP.fileKind('', 'spec.pdf'), 'pdf');
  assert.equal(PP.fileKind('', 'notes.docx'), 'doc');
  assert.equal(PP.fileKind('', 'data.csv'), 'sheet');
  assert.equal(PP.fileKind('', 'thing.zip'), 'file');
  assert.equal(PP.fileKind('', ''), 'file');
});

/* ── ZIP writer ────────────────────────────────────────────────────────
   The archive is assembled by hand in programme/_zip.js, so the parts that
   would silently produce a corrupt file are pinned here. Structural validity
   is also checked against real `unzip` during development — see the PR. */

const zipSandbox = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  Error, Promise, Uint8Array, Uint32Array, TextEncoder,
  unescape: globalThis.unescape, encodeURIComponent,
  /* Enough of Blob to inspect what was written. */
  Blob: class { constructor(parts) { this.parts = parts; } },
};
zipSandbox.window = zipSandbox;
zipSandbox.globalThis = zipSandbox;
vm.createContext(zipSandbox);
vm.runInContext(readFileSync(join(REPO, 'programme/_zip.js'), 'utf8'), zipSandbox,
  { filename: 'programme/_zip.js' });
const Zip = zipSandbox.PPZip;

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

test('uniqueName never returns a duplicate — a zip with two identical entries unpacks unpredictably', () => {
  const taken = {}, seen = new Set();
  for (let i = 0; i < 200; i++) {
    const n = Zip.uniqueName('same.jpg', taken);
    assert.ok(!seen.has(n), `duplicate entry name: ${n}`);
    seen.add(n);
  }
});

test('build emits the ZIP magic numbers and one central entry per file', () => {
  const enc = new TextEncoder();
  const blob = Zip.build([
    { name: 'a/one.txt', data: enc.encode('one') },
    { name: 'b/two.txt', data: enc.encode('two') },
  ]);
  const flat = [];
  for (const part of blob.parts) for (const b of part) flat.push(b);
  const bytes = Uint8Array.from(flat);

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
  /* Read the packed fields back out. Local time, because that is what the
     format stores and what an unzip tool will show. */
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

test('build marks names UTF-8 so accented club names survive', () => {
  const blob = Zip.build([{ name: 'Àccented.txt', data: new Uint8Array([1]) }]);
  const flat = [];
  for (const part of blob.parts) for (const b of part) flat.push(b);
  /* General-purpose flag is bytes 6-7 of the local header; bit 11 = 0x0800. */
  assert.equal(flat[6] | (flat[7] << 8), 0x0800);
});

/* ── Credentials ──────────────────────────────────────────────────────── */

test('passcodes and tokens use the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const pass = PP.newPasscode();
    assert.equal(pass.length, 6);
    assert.match(pass, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/,
      'no 0/O/1/I/L — these get retyped off a printed card');
    const tok = PP.newToken();
    assert.equal(tok.length, 14);
    assert.match(tok, /^[abcdefghjkmnpqrstuvwxyz23456789]{14}$/);
  }
});

test('clubLink points at the library with the club token', () => {
  assert.equal(PP.clubLink('abc123'), 'https://nl.tools/programme/?c=abc123');
});

test('clubLink carries the club code so the gate can show a crest', () => {
  assert.equal(PP.clubLink('abc123', 'YEO'), 'https://nl.tools/programme/?c=abc123&club=YEO');
  assert.equal(PP.clubLink('abc123', 'NL'), 'https://nl.tools/programme/?c=abc123&club=NL');
});

test('clubLink encodes both parameters', () => {
  /* The code is cosmetic and never trusted, but it still lands in a URL and
     then in an href — so it gets encoded like anything else. */
  assert.equal(PP.clubLink('a b&c', 'X&Y'), 'https://nl.tools/programme/?c=a%20b%26c&club=X%26Y');
});

/* ── Defaults ─────────────────────────────────────────────────────────── */

test('seeded folders carry no sortOrder — ordering is alphabetical and locked', () => {
  [...PP.DEFAULT_FOLDERS, ...PP.NL_FOLDERS].forEach((f) => {
    assert.ok(!('sortOrder' in f),
      `${f.name} still carries sortOrder; manual ordering was removed on purpose`);
    assert.ok(f.name && f.name.length, 'a seeded folder needs a name');
  });
});

test('seeded club folders are defaults, and exclude Miscellaneous', () => {
  const names = [...PP.DEFAULT_FOLDERS].map((f) => f.name);
  assert.deepEqual(names, ['Crest & Logos', 'Photos', 'Club Info']);
  assert.ok(!names.some((n) => /misc/i.test(n)),
    'a read-all library must not seed a folder that invites confidential files');
});

test('root files carry a real folder id, not a null one', () => {
  /* A null folderId needed a special case at every read, and produced exactly
     one bug: a "match everything when no folder given" filter meant whole-pack
     zips counted and packed every file twice. */
  assert.equal(PP.ROOT_FOLDER, '_root');
  assert.ok(PP.ROOT_FOLDER && typeof PP.ROOT_FOLDER === 'string');
});

test('a root file gets an ordinary four-segment storage path', () => {
  const p = PP.storagePath('FYL', PP.ROOT_FOLDER, 'file1', 'crest.png');
  assert.equal(p, 'programme/FYL/_root/file1-crest.png');
  assert.equal(p.split('/').length, 4, 'same shape as a foldered file');
  assert.equal(p.split('/')[1], 'FYL', 'club code stays in the segment the rules match');
});

test('the NL folder has its own defaults, led by Adverts', () => {
  assert.equal(PP.NL_FOLDERS[0].name, 'Adverts');
  assert.equal(PP.NL_KEY, 'NL');
});

test('the client upload cap matches the Storage rules', () => {
  const rules = readFileSync(join(REPO, 'system/rtdb/storage.rules.snapshot'), 'utf8');
  const block = rules.slice(rules.indexOf('match /programme/'));
  const m = block.match(/request\.resource\.size\s*<\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(m, 'could not find the programme size limit in the Storage rules');
  assert.equal(PP.MAX_BYTES, Number(m[1]) * 1024 * 1024,
    'PP.MAX_BYTES and the Storage rule must agree, or uploads fail at the last byte');
});
