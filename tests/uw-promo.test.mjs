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
    assert.equal(c.length, 9, 'XXXX-XXXX');
    assert.equal(c[4], '-');
    assert.equal(UWP.normCode(c).length, 8);
    for (const ch of UWP.normCode(c)) assert.ok(ALPHA.includes(ch), `ambiguous character ${ch} in ${c}`);
  }
});

test('genCodes: optional prefix', () => {
  const [c] = UWP.genCodes(1, 'UW', {});
  assert.match(c, /^UW-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
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

test('redeemTxn: passes a local-cache null through so the SDK retries', () => {
  assert.equal(UWP.redeemTxn(null, CLUB), null);
});

test('links: club/UW direct links point at the family pages', () => {
  assert.equal(UWP.clubLink('abc123'), 'https://nl.tools/uw-promo/club/?c=abc123');
  assert.equal(UWP.uwLink('xyz789'), 'https://nl.tools/uw-promo/?u=xyz789');
});

test('status metadata covers the full lifecycle', () => {
  assert.deepEqual(Object.keys(UWP.STATUS).sort(), ['active', 'redeemed', 'revoked']);
  assert.equal(UWP.STATUS.active.label, 'Unredeemed');
});
