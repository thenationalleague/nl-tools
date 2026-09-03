/* UW Promo Codes — unit tests for the pool/redemption logic in
   uw-promo/_shared.js (loaded in a VM sandbox with a Firebase stub, same
   pattern as load-canon.mjs). Covers the pure pieces: code normalisation,
   generation (uniqueness, alphabet, collision avoidance) and the redeemTxn
   state machine that locks a code to the club that redeems it. DOM/Firebase
   behaviour (listeners, gates, transactions against RTDB) stays with the
   manual sandbox run (?env=test) documented in uw-promo/README.md. */

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
  // Minimal localStorage so rateLimit exercises its real storage path (and a
  // test can seed junk into it) rather than the in-memory fallback.
  localStorage: (() => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
    };
  })(),
  document: { addEventListener() {}, createElement() { return {}; }, body: { appendChild() {} } },
  location: { search: '', origin: 'https://nl.tools' },
  firebase: {
    initializeApp: () => ({
      auth: () => ({ currentUser: null, signInAnonymously: () => Promise.resolve({ user: {} }) }),
      database: () => ({ ref: () => ({ push: () => ({ key: 'stub' }) }) }),
    }),
    database: { ServerValue: { TIMESTAMP: SERVER_TS } },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(readFileSync(join(REPO, 'uw-promo/_shared.js'), 'utf8'), sandbox, {
  filename: 'uw-promo/_shared.js',
});

const UWP = sandbox.window.UWP;
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L

test('UWP loads with a Firebase stub', () => {
  assert.ok(UWP, 'window.UWP defined');
  assert.equal(UWP.isTest, false);
  assert.equal(UWP.ROOT, 'app-data/uw-promo');
});

test('normCode strips everything but alphanumerics and uppercases', () => {
  assert.equal(UWP.normCode('7f3 k9c'), '7F3K9C');
  assert.equal(UWP.normCode(' uw-7F3-K9C '), 'UW7F3K9C');
  assert.equal(UWP.normCode(null), '');
  assert.equal(UWP.normCode('••••••'), '');
});

test('genCodes: count, format, alphabet, uniqueness', () => {
  const codes = UWP.genCodes(200, '', {});
  assert.equal(codes.length, 200);
  assert.equal(new Set(codes).size, 200, 'no duplicates within a batch');
  for (const c of codes) {
    assert.equal(c.length, 6, 'plain 6 characters, no hyphen');
    assert.ok(!c.includes('-'), `hyphen in ${c}`);
    assert.equal(UWP.normCode(c).length, 6);
    for (const ch of c) assert.ok(ALPHA.includes(ch), `ambiguous character ${ch} in ${c}`);
  }
});

test('genCodes: optional prefix', () => {
  const [c] = UWP.genCodes(1, 'UW', {});
  assert.match(c, /^UW-[A-Z2-9]{6}$/);
});

test('genCodes: never reissues a code already in the pool', () => {
  const existing = {};
  const first = UWP.genCodes(300, '', existing); // fills `existing` as it goes
  const second = UWP.genCodes(300, '', existing);
  const overlap = second.filter((c) => first.includes(c));
  // length check, not deepEqual: arrays built inside the VM realm have a
  // different Array.prototype, which deepStrictEqual rejects.
  assert.equal(overlap.length, 0);
});

test('passcodes and tokens have the expected shape', () => {
  const p = UWP.newPasscode();
  assert.equal(p.length, 6);
  for (const ch of p) assert.ok(ALPHA.includes(ch));
  const t = UWP.newToken();
  assert.equal(t.length, 14);
  assert.match(t, /^[a-z2-9]{14}$/);
});

test('newPin: four digits, never leading zero', () => {
  for (let i = 0; i < 300; i++) assert.match(UWP.newPin(), /^[1-9][0-9]{3}$/);
});

test('newPin: never reissues a PIN already taken, and records the ones it issues', () => {
  // The whole 1000-block is spoken for, so every free PIN starts with 1.
  const taken = {};
  for (let n = 2000; n < 10000; n++) taken[String(n)] = true;
  for (let i = 0; i < 50; i++) assert.match(UWP.newPin(taken), /^1[0-9]{3}$/);

  const issued = {};
  const pins = [];
  for (let i = 0; i < 72; i++) pins.push(UWP.newPin(issued)); // a full roster
  assert.equal(new Set(pins).size, 72, 'no two clubs share a PIN');
});

const CLUB = { code: 'ALT', name: 'Aldershot Town' };

test('redeemTxn: an active code locks to the redeeming club', () => {
  const out = UWP.redeemTxn({ code: '7F3K9C', norm: '7F3K9C', status: 'active' }, CLUB, null, 1234);
  assert.equal(out.status, 'redeemed');
  assert.equal(out.club, 'ALT');
  assert.equal(out.clubName, 'Aldershot Town');
  assert.equal(out.redeemedAt, 1234);
  assert.equal(out.redeemedBy, 'club:ALT');
});

test('redeemTxn: defaults to the server timestamp placeholder and supports an explicit actor', () => {
  const out = UWP.redeemTxn({ status: 'active' }, CLUB, 'master');
  assert.equal(out.redeemedBy, 'master');
  assert.equal(out.redeemedAt, SERVER_TS);
});

test('redeemTxn: aborts on already-redeemed and revoked codes', () => {
  assert.equal(UWP.redeemTxn({ status: 'redeemed', club: 'BRB' }, CLUB), undefined);
  assert.equal(UWP.redeemTxn({ status: 'revoked' }, CLUB), undefined);
});

test('redeemTxn: a code registered to another club is refused', () => {
  // The headline rule: 12345523324 at Hartlepool cannot be redeemed at Sutton.
  assert.equal(UWP.redeemTxn({ status: 'active', club: 'HAR', clubName: 'Hartlepool United' }, CLUB), undefined);
});

test('redeemTxn: a code registered to THIS club redeems normally', () => {
  const out = UWP.redeemTxn({ status: 'active', club: 'ALT', clubName: 'Aldershot Town' }, CLUB, null, 99);
  assert.equal(out.status, 'redeemed');
  assert.equal(out.club, 'ALT');
});

test('redeemTxn: a pre-v3.0 code with no club still locks to whoever redeems it', () => {
  const out = UWP.redeemTxn({ status: 'active' }, CLUB, null, 7);
  assert.equal(out.status, 'redeemed');
  assert.equal(out.club, 'ALT');
});

const YEAR = 365 * 24 * 60 * 60 * 1000;

test('expiry: a central code dies 12 months after generation, an uploaded one never does', () => {
  const born = 1_000_000;
  const central = { status: 'active', createdBy: 'uw', createdAt: born };
  const uploaded = { status: 'active', createdBy: 'club:ALT', createdAt: born };
  assert.equal(UWP.isExpired(central, born + YEAR - 1), false, 'day 364: alive');
  assert.equal(UWP.isExpired(central, born + YEAR + 1), true, 'day 366: dead');
  assert.equal(UWP.isExpired(uploaded, born + YEAR * 10), false, 'club POS is the authority');
  assert.equal(UWP.expiresAt(central), born + YEAR);
  assert.equal(UWP.expiresAt(uploaded), null);
  // Codes with no createdAt (malformed) never expire — refusing them for a
  // date we don't know would be adjudicating on missing evidence.
  assert.equal(UWP.isExpired({ status: 'active', createdBy: 'master' }, 9e15), false);
});

test('statusOf: expired is a derived face of active, never of redeemed or revoked', () => {
  const born = 1_000_000, later = born + YEAR + 1;
  assert.equal(UWP.statusOf({ status: 'active', createdBy: 'uw', createdAt: born }, later), 'expired');
  assert.equal(UWP.statusOf({ status: 'redeemed', createdBy: 'uw', createdAt: born }, later), 'redeemed');
  assert.equal(UWP.statusOf({ status: 'revoked', createdBy: 'uw', createdAt: born }, later), 'revoked');
  assert.equal(UWP.statusOf({ status: 'active', createdBy: 'club:ALT', createdAt: born }, later), 'active');
});

test('redeemTxn: refuses an expired central code, redeems an old uploaded one', () => {
  const born = 1_000_000, later = born + YEAR + 1;
  assert.equal(
    UWP.redeemTxn({ status: 'active', club: 'ALT', createdBy: 'uw', createdAt: born }, CLUB, null, 5, later),
    undefined, 'expired central code aborts');
  const out = UWP.redeemTxn(
    { status: 'active', club: 'ALT', createdBy: 'club:ALT', createdAt: born }, CLUB, null, 5, later);
  assert.equal(out.status, 'redeemed', 'uploaded code redeems at any age');
});

test('redeemTxn: passes a local-cache null through so the SDK retries', () => {
  assert.equal(UWP.redeemTxn(null, CLUB), null);
});

test('rateLimit: allows exactly `limit` calls, then refuses with a retry time', () => {
  const KEY = 'test:checks:a';
  const HOUR = 3600000;
  for (let i = 0; i < 10; i++) {
    const g = UWP.rateLimit(KEY, 10, HOUR, 1_000_000 + i);
    assert.equal(g.ok, true, `call ${i + 1} should be allowed`);
    assert.equal(g.remaining, 9 - i);
  }
  const blocked = UWP.rateLimit(KEY, 10, HOUR, 1_000_010);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAt, 1_000_000 + HOUR, 'unblocks an hour after the oldest hit');
});

test('rateLimit: hits older than the window drop out of the count', () => {
  const KEY = 'test:checks:b';
  const HOUR = 3600000;
  for (let i = 0; i < 10; i++) UWP.rateLimit(KEY, 10, HOUR, 2_000_000 + i);
  assert.equal(UWP.rateLimit(KEY, 10, HOUR, 2_000_000 + HOUR + 1).ok, true, 'window has slid');
});

test('rateLimit: separate keys do not share a budget', () => {
  const HOUR = 3600000;
  for (let i = 0; i < 10; i++) UWP.rateLimit('test:checks:ALT', 10, HOUR, 3_000_000 + i);
  assert.equal(UWP.rateLimit('test:checks:ALT', 10, HOUR, 3_000_010).ok, false);
  assert.equal(UWP.rateLimit('test:checks:SUT', 10, HOUR, 3_000_010).ok, true);
});

test('rateLimit: corrupt stored state fails open rather than locking the till out', () => {
  const HOUR = 3600000;
  for (const junk of ['not json', '{"a":1}', 'null', '["x","y"]']) {
    sandbox.localStorage.setItem('test:checks:corrupt', junk);
    const g = UWP.rateLimit('test:checks:corrupt', 10, HOUR, 4_000_000);
    assert.equal(g.ok, true, `should allow after storing ${junk}`);
    assert.equal(g.remaining, 9, 'junk contributes nothing to the count');
  }
});

/* ── Client/server agreement ───────────────────────────────────────────────
   The credential is now compared server-side in functions/uw-promo.js, which
   carries its own copies of normCode and newPin. If the two ever disagree a
   club types the right PIN and is refused, so pin them together here — same
   guard as tests/programme.test.mjs. */
const SERVER_SRC = readFileSync(join(REPO, 'functions/uw-promo.js'), 'utf8');

function serverFn(name) {
  const m = SERVER_SRC.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
  assert.ok(m, `could not find ${name} in functions/uw-promo.js`);
  return new Function(`${m[0]}; return ${name};`)();
}

test('normCode matches the server implementation', () => {
  const serverNorm = serverFn('normCode');
  for (const input of ['7f3 k9c', ' uw-7F3-K9C ', '', 'abc-123', '••••••', 'Summer 01']) {
    assert.equal(serverNorm(input), UWP.normCode(input), `normCode(${JSON.stringify(input)})`);
  }
});

test('the server mints PINs to the same rule as the client', () => {
  const serverNewPin = serverFn('newPin');
  for (let i = 0; i < 200; i++) {
    assert.match(serverNewPin({}), /^[1-9][0-9]{3}$/, 'four digits, no leading zero');
  }
  // And it honours a taken-set the same way, so a rotation can't collide.
  const taken = {};
  for (let n = 2000; n < 10000; n++) taken[String(n)] = true;
  for (let i = 0; i < 50; i++) assert.match(serverNewPin(taken), /^1[0-9]{3}$/);
});

test('the server refuses a credential of the wrong length before comparing', () => {
  const safeEqual = serverFn('safeEqual');
  assert.equal(safeEqual('1234', '1234'), true);
  assert.equal(safeEqual('1234', '12345'), false);
  assert.equal(safeEqual('', ''), true);
  assert.equal(safeEqual(null, undefined), true, 'both normalise to empty');
});

test('links: club/UW direct links point at the family pages', () => {
  assert.equal(UWP.clubLink('abc123'), 'https://nl.tools/uw-promo/club/?c=abc123');
  assert.equal(UWP.uwLink('xyz789'), 'https://nl.tools/uw-promo/?u=xyz789');
});

test('status metadata covers the full lifecycle', () => {
  assert.deepEqual(Object.keys(UWP.STATUS).sort(), ['active', 'expired', 'redeemed', 'revoked']);
  assert.equal(UWP.STATUS.active.label, 'Unredeemed');
});
