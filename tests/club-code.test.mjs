/* One club code — unit tests for the pure logic in functions/club-code.js.

   The Firebase-dependent half (the trigger, token minting, rules enforcement)
   needs the emulator or a live run and is not covered here. What IS covered is
   the part that decides who gets in, which is worth pinning because every
   failure mode is silent:

     · normCode  — must agree CHARACTER FOR CHARACTER with programme.js's copy.
                   A club will hold one code for both tools; if the two
                   normalise differently, the same typed string opens one and
                   is "not recognised" by the other, and the club is told their
                   code is wrong when it is not.
     · safeEqual — length-first equality that does not early-exit on content.
     · pickClub  — the actual door. Revoked records must not open it, an empty
                   or absent code must not match an empty stored field, and NL
                   resolves to the '*' wildcard the rules already speak.

   Deliberately asserts the FAIL-CLOSED cases rather than only the happy path:
   a gate is judged by what it refuses. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* The function file requires firebase-functions at module load, which is not
   installed at the repo root. Rather than stub the whole SDK, lift the three
   pure helpers out of the source text and evaluate them alone — the same
   trick tests/programme.test.mjs uses on the client half. It also means the
   test reads the SHIPPED source, so a change to the real function that this
   file does not expect shows up as a failure rather than passing against a
   copy that has drifted. */
function liftFns(relPath, names) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const bodies = names.map((name) => {
    const i = src.indexOf('function ' + name + '(');
    assert.ok(i >= 0, relPath + ' no longer defines ' + name);
    // Walk braces from the first { after the signature to find the body end.
    let depth = 0, j = src.indexOf('{', i);
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) { j++; break; }
    }
    return src.slice(i, j);
  });
  /* All of them in ONE scope, not one eval each: pickClub calls normCode and
     safeEqual, so lifting them separately leaves it referencing names that do
     not exist and every pickClub test fails on a ReferenceError rather than on
     anything real. */
  return eval('(function(){' + bodies.join('\n') +
    '\nreturn {' + names.join(',') + '};})()');
}

const cc = liftFns('functions/club-code.js', ['normCode', 'safeEqual', 'pickClub']);
const pp = liftFns('functions/programme.js', ['normCode']);

// --- normCode ---------------------------------------------------------------

test('normCode uppercases and strips everything that is not alphanumeric', () => {
  assert.equal(cc.normCode(' ab-12 cd '), 'AB12CD');
  assert.equal(cc.normCode('a1b2c3'), 'A1B2C3');
  assert.equal(cc.normCode('A1-B2-C3'), 'A1B2C3');
});

test('normCode answers empty string for null, undefined and empty input', () => {
  assert.equal(cc.normCode(null), '');
  assert.equal(cc.normCode(undefined), '');
  assert.equal(cc.normCode(''), '');
});

test('normCode agrees with the Programme Packs copy on every shape a person types', () => {
  /* A club holds ONE code for both tools. If these two ever disagree, the same
     typed string opens one tool and is refused by the other — and the club is
     told their code is wrong when it is not. */
  const typed = [
    'abc123', 'ABC123', ' abc 123 ', 'abc-123', 'a b c 1 2 3',
    'AbC123', '  ', '', 'abc123\n', 'åbc123', '123456', 'O0l1',
  ];
  for (const s of typed) {
    assert.equal(cc.normCode(s), pp.normCode(s), 'disagreement on ' + JSON.stringify(s));
  }
});

// --- safeEqual --------------------------------------------------------------

test('safeEqual matches identical strings and rejects differing ones', () => {
  assert.equal(cc.safeEqual('ABC123', 'ABC123'), true);
  assert.equal(cc.safeEqual('ABC123', 'ABC124'), false);
  assert.equal(cc.safeEqual('ABC123', 'ABC12'), false);
});

test('safeEqual treats null and undefined as the empty string, not as equal to anything', () => {
  assert.equal(cc.safeEqual(null, ''), true);        // both normalise to ''
  assert.equal(cc.safeEqual(null, 'ABC123'), false);
  assert.equal(cc.safeEqual(undefined, 'ABC123'), false);
});

// --- pickClub ---------------------------------------------------------------

const cfg = {
  clubs: {
    'boreham-wood':  { name: 'Boreham Wood',  code: 'BW1234' },
    'forest-green':  { name: 'Forest Green',  code: 'FG5678' },
    'old-town':      { name: 'Old Town',      code: 'OT9999', revoked: true },
    'blank-code':    { name: 'Blank Code',    code: '' },
  },
  nl: { name: 'National League', code: 'NL0000' },
};

test('pickClub returns the club whose code matches', () => {
  const hit = cc.pickClub(cfg, 'BW1234');
  assert.equal(hit.key, 'boreham-wood');
  assert.equal(hit.rec.name, 'Boreham Wood');
});

test('pickClub does not match a code belonging to another club', () => {
  assert.equal(cc.pickClub(cfg, 'FG5678').key, 'forest-green');
  assert.notEqual(cc.pickClub(cfg, 'FG5678').key, 'boreham-wood');
});

test('pickClub refuses a revoked record', () => {
  /* Revoked rather than deleted, so an audit line still resolves the key to a
     name. It must not still open the door. */
  assert.equal(cc.pickClub(cfg, 'OT9999'), null);
});

test('pickClub refuses an unknown code', () => {
  assert.equal(cc.pickClub(cfg, 'ZZ0000'), null);
});

test('an empty typed code does not match a record with an empty stored code', () => {
  /* The trigger rejects anything under four characters before it reaches here,
     but that is one guard in one caller. A config record with a missing code
     must not be a skeleton key on its own account. */
  assert.equal(cc.pickClub(cfg, ''), null);
});

test('pickClub resolves the NL record to the key the rules already speak', () => {
  const hit = cc.pickClub(cfg, 'NL0000');
  assert.equal(hit.key, 'NL');
});

test('pickClub survives an absent or empty config rather than throwing', () => {
  /* First deploy: config does not exist yet. The trigger reads `|| {}` and the
     gate must simply refuse everyone, not 500 on every attempt. */
  assert.equal(cc.pickClub(null, 'BW1234'), null);
  assert.equal(cc.pickClub({}, 'BW1234'), null);
  assert.equal(cc.pickClub({ clubs: {} }, 'BW1234'), null);
});

// --- the claim vocabulary ---------------------------------------------------

test('the club claim uses the same wildcard as pClub, so rules need one branch', () => {
  /* Rules written as `auth.token.club === $club || auth.token.club === '*'`
     mirror the pClub ones exactly. If this ever became 'ALL' or true, every
     rule in the snapshot would need a second shape. */
  const src = readFileSync(join(ROOT, 'functions/club-code.js'), 'utf8');
  assert.match(src, /\{ club: "\*" \}/, 'the staff path must mint club: "*"');
  assert.match(src, /\{ club: hit\.key \}/, 'the club path must mint the club key');
});

test('the code is never written to a log line', () => {
  /* A near-miss in a log is a near-miss written down, and Cloud Logging is
     readable by anyone with project access. */
  const src = readFileSync(join(ROOT, 'functions/club-code.js'), 'utf8');
  const logCalls = src.match(/logger\.(info|warn|error)\([^)]*\)/g) || [];
  for (const call of logCalls) {
    assert.ok(!/\bcode\b/.test(call.replace(/clubCodeAuth: [^"']*/g, '')),
      'log call may include the code: ' + call);
  }
});
