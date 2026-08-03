/* Programme Packs — unit tests for the pure logic in programme/_shared.js
   (loaded in a VM sandbox with a Firebase stub, same pattern as
   tests/uw-promo.test.mjs and load-canon.mjs). Covers the pieces that are
   easy to get quietly wrong and expensive to get wrong in production:

     · normCode      — must agree with the server copy in functions/programme.js,
                       or a club's typed passcode stops matching the stored one.
     · safeName      — a filename becomes part of a Storage object path.
     · storagePath   — the <CODE> segment is what Storage rules match on for
                       write-own, and is the key the portal migration depends on.
     · adState       — decides what a club sees as "this weekend's advert".
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

/* ── adState ──────────────────────────────────────────────────────────── */

const DAY = 864e5;
const NOW = Date.UTC(2026, 7, 3, 12, 0, 0);   // fixed clock — no Date.now() in assertions

test('adState returns null for an undated file', () => {
  assert.equal(PP.adState({ name: 'crest.png' }, NOW), null);
  assert.equal(PP.adState({ usedFrom: null, usedUntil: null }, NOW), null);
});

test('adState is null for a missing file rather than throwing', () => {
  assert.equal(PP.adState(null, NOW), null);
  assert.equal(PP.adState(undefined, NOW), null);
});

test('adState: live inside the window', () => {
  assert.equal(PP.adState({ usedFrom: NOW - DAY, usedUntil: NOW + DAY }, NOW), 'live');
});

test('adState: upcoming before the window, expired after it', () => {
  assert.equal(PP.adState({ usedFrom: NOW + DAY }, NOW), 'upcoming');
  assert.equal(PP.adState({ usedUntil: NOW - DAY }, NOW), 'expired');
});

test('adState boundaries are inclusive — an advert "until Saturday" is live on Saturday', () => {
  assert.equal(PP.adState({ usedFrom: NOW, usedUntil: NOW + DAY }, NOW), 'live');
  assert.equal(PP.adState({ usedFrom: NOW - DAY, usedUntil: NOW }, NOW), 'live');
});

test('adState: an open-ended window is live once it has started', () => {
  assert.equal(PP.adState({ usedFrom: NOW - DAY }, NOW), 'live');
  assert.equal(PP.adState({ usedUntil: NOW + DAY }, NOW), 'live');
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

/* ── Defaults ─────────────────────────────────────────────────────────── */

test('seeded club folders are defaults, and exclude Miscellaneous', () => {
  const names = [...PP.DEFAULT_FOLDERS].map((f) => f.name);
  assert.deepEqual(names, ['Crest & Logos', 'Photos', 'Club Info']);
  assert.ok(!names.some((n) => /misc/i.test(n)),
    'a read-all library must not seed a folder that invites confidential files');
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
