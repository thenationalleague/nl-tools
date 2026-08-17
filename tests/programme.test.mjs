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

/* ── pickClub (server) ────────────────────────────────────────────────────
   Which club a passcode opens. Same extraction trick as the parity test
   above: pull the functions out of the module text so the real
   implementation is under test, not a copy. */
function serverPickClub() {
  const src = readFileSync(join(REPO, 'functions/programme.js'), 'utf8');
  const parts = ['normCode', 'safeEqual', 'pickClub'].map((name) => {
    const m = src.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
    assert.ok(m, `could not find ${name} in functions/programme.js`);
    return m[0];
  });
  // eslint-disable-next-line no-new-func
  return new Function(`${parts.join('\n')}; return pickClub;`)();
}

const CFG = {
  clubs: {
    SUT: { name: 'Sutton United', passcode: '4K2M9P' },
    FGR: { name: 'Forest Green Rovers', passcode: 'H7RQ3D' }
  },
  nl: { name: 'National League', passcode: 'X9WT4B' }
};

test('pickClub: the passcode alone identifies the club', () => {
  const pick = serverPickClub();
  assert.equal(pick(CFG, '4K2M9P')?.key, 'SUT');
  assert.equal(pick(CFG, 'H7RQ3D')?.key, 'FGR');
  assert.equal(pick(CFG, 'X9WT4B')?.key, 'NL');
  assert.equal(pick(CFG, 'NOPE00'), null);
});

test('pickClub: ignores anything else on the record', () => {
  /* A `token` field sits on config records seeded before 04/08/2026, when
     the per-club ?c= link token was dropped. It must not affect the match —
     that staleness is exactly what broke Sutton. */
  const legacy = {
    clubs: { SUT: { name: 'Sutton United', passcode: '4K2M9P', token: 'dead-token' } }
  };
  assert.equal(serverPickClub()(legacy, '4K2M9P')?.key, 'SUT');
});

test('pickClub: survives an empty or half-built config', () => {
  const pick = serverPickClub();
  assert.equal(pick({}, '4K2M9P'), null);
  assert.equal(pick({ clubs: { SUT: null } }, '4K2M9P'), null);
  assert.equal(pick({ nl: CFG.nl }, 'X9WT4B')?.key, 'NL');
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

test('passcodes use the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const pass = PP.newPasscode();
    assert.equal(pass.length, 6);
    assert.match(pass, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/,
      'no 0/O/1/I/L — these get retyped off a printed card');
  }
});

test('clubLink carries the club code and nothing else', () => {
  /* Branding only. The ?c= token that used to sit alongside it went on
     04/08/2026: it granted nothing, and rotating it on every regenerate made
     every bookmark in the club reject a correct new passcode. A link with no
     credential in it cannot go stale. */
  assert.equal(PP.clubLink('YEO'), 'https://nl.tools/programme/?club=YEO');
  assert.equal(PP.clubLink('NL'), 'https://nl.tools/programme/?club=NL');
});

test('clubLink encodes the club code', () => {
  /* Cosmetic and never trusted, but it still lands in a URL and then in an
     href — so it gets encoded like anything else. */
  assert.equal(PP.clubLink('X&Y'), 'https://nl.tools/programme/?club=X%26Y');
});

test('newToken is gone with the link token it minted', () => {
  assert.equal(typeof PP.newToken, 'undefined',
    'a leftover minter is how a dead field creeps back onto new records');
});

/* ── uploadType ───────────────────────────────────────────────────────────
   The Storage rule reads the content type, so what this returns decides
   whether an upload is accepted. */

test('uploadType canonicalises the Windows zip type', () => {
  /* File.type for a .zip on Windows is application/x-zip-compressed, which the
     Storage rule refused outright — a 51MB zip failed with a permission
     error. Extension wins over the browser for exactly this reason. */
  assert.equal(PP.uploadType({ name: 'pack.zip', type: 'application/x-zip-compressed' }),
    'application/zip');
  assert.equal(PP.uploadType({ name: 'PACK.ZIP', type: '' }), 'application/zip');
});

test('uploadType never returns empty, so a download cannot be left to a guess', () => {
  assert.equal(PP.uploadType({ name: 'mystery.qqq', type: '' }), 'application/octet-stream');
  assert.equal(PP.uploadType({ name: 'noextension', type: '' }), 'application/octet-stream');
  assert.equal(PP.uploadType({}), 'application/octet-stream');
});

test('uploadType keeps a type the browser got right', () => {
  assert.equal(PP.uploadType({ name: 'crest.png', type: 'image/png' }), 'image/png');
  assert.equal(PP.uploadType({ name: 'odd.qqq', type: 'application/vnd.custom' }),
    'application/vnd.custom');
});

test('uploadType does not disguise something the rule must still refuse', () => {
  /* text/html executes from the bucket origin and stays blocked. Canonicalising
     must never be a way round that. */
  assert.equal(PP.uploadType({ name: 'evil.html', type: 'text/html' }), 'text/html');
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
  const rules = readFileSync(join(REPO, 'system/storage/rules.snapshot.rules'), 'utf8');
  const block = rules.slice(rules.indexOf('match /programme/'));
  const m = block.match(/request\.resource\.size\s*<\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(m, 'could not find the programme size limit in the Storage rules');
  assert.equal(PP.MAX_BYTES, Number(m[1]) * 1024 * 1024,
    'PP.MAX_BYTES and the Storage rule must agree, or uploads fail at the last byte');
});

/* ── Entry doors ──────────────────────────────────────────────────────────
   Three ways into the library — passcode, remembered device, master — plus
   the console's own exchange. Each is an entry path the README documents;
   losing one from the surface is a break, and a new one should be a
   decision, not drift. The doors themselves need live Firebase; this pins
   the surface. */

test('the shared surface carries all four entry paths', () => {
  assert.equal(typeof PP.enter, 'function');
  assert.equal(typeof PP.resume, 'function');
  assert.equal(typeof PP.enterMaster, 'function');
  assert.equal(typeof PP.enterAsAdmin, 'function');
});

/* ── Previews ─────────────────────────────────────────────────────────────
   The pure half of PP.previews: tier names, geometry, type routing and the
   variant path shape. make/store need a canvas and Firebase — the manual
   smoke test in programme/README.md covers those. */

test('preview tiers use the canon crest vocabulary, thumb inside medium', () => {
  assert.deepEqual(Object.keys(PP.previews.TIERS).sort(), ['medium', 'thumb']);
  assert.ok(PP.previews.TIERS.thumb < PP.previews.TIERS.medium,
    'a thumb larger than a medium means the tiers are wired backwards');
});

test('fitWithin scales the long edge and keeps aspect, either orientation', () => {
  assert.deepEqual({ ...PP.previews.fitWithin(4000, 3000, 360) }, { w: 360, h: 270 });
  assert.deepEqual({ ...PP.previews.fitWithin(3000, 4000, 360) }, { w: 270, h: 360 });
  assert.deepEqual({ ...PP.previews.fitWithin(5184, 3456, 1600) }, { w: 1600, h: 1067 });
});

test('fitWithin never upscales — a small image is its own preview', () => {
  assert.deepEqual({ ...PP.previews.fitWithin(200, 100, 360) }, { w: 200, h: 100 });
  assert.deepEqual({ ...PP.previews.fitWithin(360, 360, 360) }, { w: 360, h: 360 });
});

test('fitWithin survives junk dimensions without a zero-sized canvas', () => {
  /* A 0×0 or NaN canvas throws on toBlob in some engines — the floor is 1px. */
  assert.deepEqual({ ...PP.previews.fitWithin(0, 0, 360) }, { w: 1, h: 1 });
  assert.deepEqual({ ...PP.previews.fitWithin(NaN, 500, 360) }, { w: 1, h: 360 });
});

test('eligibility is the decodable raster set — resize what a canvas can read', () => {
  ['image/png', 'image/jpeg', 'image/webp'].forEach((t) =>
    assert.ok(PP.previews.eligible(t), `${t} should be eligible`));
  ['image/svg+xml', 'image/gif', 'image/tiff', 'image/vnd.adobe.photoshop',
    'application/pdf', 'application/postscript', '', undefined].forEach((t) =>
    assert.ok(!PP.previews.eligible(t), `${t} must not be eligible`));
  assert.ok(PP.previews.eligible('IMAGE/JPEG'), 'case must not decide eligibility');
});

test('renderable is broader than eligible — an <img> shows more than a canvas resizes', () => {
  /* GIF is the one to protect: a canvas keeps only the first frame, so a
     resized tile would freeze an animation that plays today. */
  ['image/svg+xml', 'image/avif', 'image/gif'].forEach((t) => {
    assert.ok(PP.previews.renderable(t), `${t} renders in an <img>`);
    assert.ok(!PP.previews.eligible(t), `${t} is still not resized`);
  });
  ['image/tiff', 'image/vnd.adobe.photoshop'].forEach((t) =>
    assert.ok(!PP.previews.renderable(t),
      `${t} does not render in a browser — the tile must show an icon, not a broken image`));
});

test('preview output keeps alpha formats PNG and flattens the rest to JPEG', () => {
  assert.deepEqual({ ...PP.previews.output('image/png') }, { type: 'image/png', ext: 'png' });
  assert.deepEqual({ ...PP.previews.output('image/gif') }, { type: 'image/png', ext: 'png' });
  assert.deepEqual({ ...PP.previews.output('image/jpeg') }, { type: 'image/jpeg', ext: 'jpg' });
  assert.deepEqual({ ...PP.previews.output('image/webp') }, { type: 'image/jpeg', ext: 'jpg' });
});

test('variant path sits inside the club prefix, keyed on fileId alone', () => {
  const p = PP.previews.path('FYL', '-Nabc123', 'thumb', 'jpg');
  assert.equal(p, 'programme/FYL/_previews/-Nabc123-thumb.jpg');
  assert.equal(p.split('/')[1], 'FYL',
    'club code stays in the segment the Storage rules match for write-own');
  /* No folder segment: moving a file only rewrites folderId in RTDB, so a
     folder-keyed variant path would go stale on the first move. And
     '_previews' cannot collide with a real folderId — those are push keys
     (always starting with "-") or the literal '_root'. */
  assert.ok(p.indexOf('/_previews/') !== -1);
  assert.notEqual('_previews', PP.ROOT_FOLDER);
});
