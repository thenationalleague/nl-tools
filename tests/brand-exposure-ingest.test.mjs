/* Brand Exposure ingest — unit tests for the pure logic in
   functions/brand-exposure.js.

   The Firebase-dependent half (the trigger, token minting, rules enforcement)
   needs the emulator or a live run and is not covered here. What IS covered is
   the part that decides who gets in and what they may touch, which is worth
   pinning because this is the first door in the estate whose client is a script
   on a laptop rather than a person at a browser — there is nobody to notice
   that something looks wrong.

     · hashKey       — keys are stored as a digest, never as themselves. If this
                       ever returned the input, every key in the database would
                       be readable by anyone who could read the database.
     · safeEqualHex  — length-first equality that does not early-exit on
                       content, and refuses the empty-vs-empty case that would
                       otherwise let a record with no hash match a caller with
                       no key.
     · pickKey       — the actual door. Revoked records must not open it, and an
                       absent or empty key must not match a malformed record.
     · validMatchId  — the matchId goes into a Storage path and into a token
                       claim, so this is the boundary that stops a traversal or
                       a claim that names something structural.

   Deliberately asserts the FAIL-CLOSED cases rather than only the happy path:
   a gate is judged by what it refuses. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* Same trick as tests/club-code.test.mjs: the function file requires
   firebase-functions at module load, which is not installed at the repo root,
   so lift the pure helpers out of the source text and evaluate them alone.
   Reading the SHIPPED source is the point — a change to the real function that
   these tests do not expect shows up as a failure rather than passing against a
   copy that has drifted.

   Two differences from club-code's copy: these helpers close over `crypto`, so
   it is passed into the scope, and validMatchId reads a const regex, so consts
   are liftable too. */
function lift(relPath, fnNames, constNames = []) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');

  const block = (startIdx, label) => {
    assert.ok(startIdx >= 0, relPath + ' no longer defines ' + label);
    let depth = 0, j = src.indexOf('{', startIdx);
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) { j++; break; }
    }
    return src.slice(startIdx, j);
  };

  const consts = constNames.map((name) => {
    const i = src.indexOf('const ' + name + ' =');
    assert.ok(i >= 0, relPath + ' no longer defines ' + name);
    const end = src.indexOf('\n', i);
    return src.slice(i, end);
  });
  const bodies = fnNames.map((name) =>
    block(src.indexOf('function ' + name + '('), name));

  /* All of them in ONE scope: pickKey calls hashKey and safeEqualHex, so
     lifting them separately leaves it referencing names that do not exist and
     every pickKey test fails on a ReferenceError rather than on anything real. */
  return eval('(function(crypto){' + consts.join('\n') + '\n' + bodies.join('\n') +
    '\nreturn {' + fnNames.join(',') + '};})')(crypto);
}

const be = lift(
  'functions/brand-exposure.js',
  ['newKey', 'hashKey', 'safeEqualHex', 'pickKey', 'validMatchId'],
  ['KEY_BYTES', 'MATCH_ID']
);

const H = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// --- hashKey ----------------------------------------------------------------

test('hashKey returns a sha256 hex digest, never the key itself', () => {
  const k = 'a-perfectly-ordinary-key';
  const h = be.hashKey(k);
  assert.equal(h, H(k));
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, k);
  assert.ok(!h.includes(k));
});

test('hashKey is stable and distinguishes keys that differ by one character', () => {
  assert.equal(be.hashKey('abc'), be.hashKey('abc'));
  assert.notEqual(be.hashKey('abc'), be.hashKey('abd'));
});

test('hashKey does not throw on null or undefined', () => {
  assert.equal(be.hashKey(null), H(''));
  assert.equal(be.hashKey(undefined), H(''));
});

// --- newKey -----------------------------------------------------------------

test('newKey is 192 bits of base64url, with no padding or path characters', () => {
  const k = be.newKey();
  assert.match(k, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(!k.includes('='), 'padding would break a URL or a config line');
  assert.ok(!k.includes('/'), 'a slash in a key ends up splitting a path somewhere');
  assert.ok(!k.includes('+'));
});

test('newKey does not repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(be.newKey());
  assert.equal(seen.size, 500);
});

// --- safeEqualHex -----------------------------------------------------------

test('safeEqualHex matches identical digests', () => {
  assert.equal(be.safeEqualHex(H('x'), H('x')), true);
});

test('safeEqualHex refuses digests that differ anywhere', () => {
  assert.equal(be.safeEqualHex(H('x'), H('y')), false);
  const h = H('x');
  assert.equal(be.safeEqualHex(h, h.slice(0, 63) + (h[63] === 'a' ? 'b' : 'a')), false);
});

test('safeEqualHex refuses mismatched lengths without throwing', () => {
  // timingSafeEqual throws on unequal lengths — the guard must catch that
  // before it does, or a truncated stored hash becomes a 500 rather than a no.
  assert.equal(be.safeEqualHex('abc', 'abcd'), false);
  assert.equal(be.safeEqualHex(H('x'), 'short'), false);
});

test('safeEqualHex refuses empty against empty', () => {
  // The fail-closed case that matters: a stored record with no hash field must
  // not be opened by a caller who presented no key.
  assert.equal(be.safeEqualHex('', ''), false);
  assert.equal(be.safeEqualHex(null, null), false);
  assert.equal(be.safeEqualHex(undefined, ''), false);
});

// --- pickKey ----------------------------------------------------------------

const KEYS = {
  k1: { label: 'Match laptop', hash: H('KEY-ONE') },
  k2: { label: 'Edit suite', hash: H('KEY-TWO') },
  k3: { label: 'Old laptop', hash: H('KEY-THREE'), revoked: true },
};

test('pickKey finds the holder of a live key', () => {
  assert.deepEqual(be.pickKey(KEYS, 'KEY-ONE'), { keyId: 'k1', label: 'Match laptop' });
  assert.deepEqual(be.pickKey(KEYS, 'KEY-TWO'), { keyId: 'k2', label: 'Edit suite' });
});

test('pickKey refuses a revoked key', () => {
  // Revoked rather than deleted, so the audit trail still resolves the id —
  // which is only safe if revoked genuinely closes the door.
  assert.equal(be.pickKey(KEYS, 'KEY-THREE'), null);
});

test('pickKey refuses an unknown, empty or absent key', () => {
  assert.equal(be.pickKey(KEYS, 'NOPE'), null);
  assert.equal(be.pickKey(KEYS, ''), null);
  assert.equal(be.pickKey(KEYS, null), null);
  assert.equal(be.pickKey(KEYS, undefined), null);
});

test('pickKey refuses everything when there are no keys at all', () => {
  assert.equal(be.pickKey({}, 'KEY-ONE'), null);
  assert.equal(be.pickKey(null, 'KEY-ONE'), null);
  assert.equal(be.pickKey(undefined, ''), null);
});

test('pickKey is not fooled by a record missing its hash', () => {
  assert.equal(be.pickKey({ bad: { label: 'no hash' } }, ''), null);
  assert.equal(be.pickKey({ bad: { label: 'no hash', hash: '' } }, ''), null);
  assert.equal(be.pickKey({ bad: null }, 'anything'), null);
});

test('pickKey falls back to the id when a record has no label', () => {
  assert.deepEqual(be.pickKey({ k9: { hash: H('K') } }, 'K'), { keyId: 'k9', label: 'k9' });
});

test('a minted key opens the door it was minted for', () => {
  // End to end on the pure half: mint, store the digest, present the plaintext.
  const key = be.newKey();
  const store = { fresh: { label: 'Fresh', hash: be.hashKey(key) } };
  assert.deepEqual(be.pickKey(store, key), { keyId: 'fresh', label: 'Fresh' });
  assert.equal(be.pickKey(store, key + 'x'), null);
});

// --- validMatchId -----------------------------------------------------------

test('validMatchId accepts the ids the script actually generates', () => {
  assert.equal(be.validMatchId('2026-08-23-sutton-united-v-hartlepool-united'), true);
  assert.equal(be.validMatchId('abc'), true);
  assert.equal(be.validMatchId('a1b'), true);
});

test('validMatchId refuses anything that could climb out of its path', () => {
  // This value becomes a Storage path segment and an RTDB child key.
  assert.equal(be.validMatchId('../../etc/passwd'), false);
  assert.equal(be.validMatchId('a/b'), false);
  assert.equal(be.validMatchId('a..b'), false);
  assert.equal(be.validMatchId('.'), false);
  assert.equal(be.validMatchId('a.b'), false);
});

test('validMatchId refuses RTDB-illegal and structural characters', () => {
  for (const bad of ['a#b', 'a$b', 'a[b', 'a]b', 'a.b', 'a b', 'a\tb', 'a\nb']) {
    assert.equal(be.validMatchId(bad), false, JSON.stringify(bad) + ' must be refused');
  }
});

test('validMatchId refuses uppercase, so one match cannot become two records', () => {
  // Storage paths are case-sensitive and RTDB keys are too, so accepting both
  // cases would let the same fixture land twice under near-identical ids.
  assert.equal(be.validMatchId('2026-08-23-Sutton'), false);
});

test('validMatchId refuses the too-short, the too-long and the non-string', () => {
  assert.equal(be.validMatchId('ab'), false);
  assert.equal(be.validMatchId('a'.repeat(122)), false);
  assert.equal(be.validMatchId('a'.repeat(121)), true);
  assert.equal(be.validMatchId(''), false);
  assert.equal(be.validMatchId(null), false);
  assert.equal(be.validMatchId(undefined), false);
  assert.equal(be.validMatchId(42), false);
  assert.equal(be.validMatchId({}), false);
  assert.equal(be.validMatchId(['ok-id-here']), false);
});

test('validMatchId refuses an id that does not start with a letter or digit', () => {
  assert.equal(be.validMatchId('-leading-dash'), false);
  assert.equal(be.validMatchId('_underscore'), false);
});

test('validMatchId refuses a doubled dash', () => {
  // Not a security boundary — a readability one. Two dashes in a row means the
  // script built the id from an empty field, and the resulting record would be
  // one nobody can identify later.
  assert.equal(be.validMatchId('sutton--united'), false);
});
