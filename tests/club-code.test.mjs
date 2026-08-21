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

const cc = liftFns('functions/club-code.js', ['normCode', 'safeEqual', 'storedCode', 'pickClub']);
const pp = liftFns('functions/programme.js', ['normCode', 'safeEqual', 'storedCode', 'pickClub']);

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

test('both claims are minted, from either door', () => {
  /* The codes are ONE credential now, shared with Programme Packs, so each
     gate must mint `club` AND `pClub`. Minting one would make the two gates
     fight: signInWithCustomToken replaces the session, so whichever tool was
     opened last would be the only one that worked — a club would bounce
     between the Handbook and Programme Packs re-entering the same code. */
  const src = readFileSync(join(ROOT, 'functions/club-code.js'), 'utf8');
  assert.match(src, /\{ club: hit\.key, pClub: hit\.key \}/);
  assert.match(src, /\{ club: "\*", pClub: "\*" \}/);

  const pp = readFileSync(join(ROOT, 'functions/programme.js'), 'utf8');
  assert.match(pp, /pClub: hit\.key, club: hit\.key/);
  assert.match(pp, /pClub: "\*", club: "\*"/);
});

test('a relocated Programme record opens under its historical field name', () => {
  /* The 72 live records store the credential as `passcode`. They are being
     MOVED, not rewritten — renaming 72 secrets in flight is a second thing to
     go wrong — so both names must open the door. A record that works under one
     and not the other is the worst outcome of tidying. */
  const relocated = { clubs: { FYL: { name: 'AFC Fylde', passcode: 'AB12CD' } } };
  assert.equal(cc.pickClub(relocated, 'AB12CD').key, 'FYL');
  assert.equal(cc.storedCode({ passcode: 'ab-12cd' }), 'AB12CD');
  assert.equal(cc.storedCode({ code: 'ab-12cd' }), 'AB12CD');
  assert.equal(cc.storedCode({}), '');
});

test('both functions look for the codes in the same places, in the same order', () => {
  /* The canonical home is app-data/club-codes/{clubs,nl}. A `config` wrapper
     under it is read second, and the per-tool node these came from third; both
     are on their way out, and both log which one answered so production says
     when the tidying is finished.

     The order is the point, and so is the agreement. On 21/08/2026 both
     functions read ONLY the wrapper, the 73 live records were at the shorter
     path, and every club in the estate was refused — a total outage caused by
     one level of nesting that no test could see, because each file was only
     ever checked against itself.

     Matching path literals across both files is what an earlier version of
     this test tried and got wrong: each builds its paths from its own root
     constant, so the literal never appears. Read the resolver instead. */
  for (const f of ['functions/club-code.js', 'functions/programme.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const fn = src.slice(src.indexOf('async function readCodes('));
    const body = fn.slice(0, fn.indexOf('\n}'));

    assert.match(body, /\/clubs"/, f + ' must read the canonical clubs node');
    assert.match(body, /\/nl"/, f + ' must read the canonical nl node');
    assert.match(body, /codes read from the wrapped config node/,
      f + ' must fall back to the config wrapper, and say so');
    assert.match(body, /codes read from the OLD location/,
      f + ' must keep the per-tool fallback, and say so, until that node is gone');

    /* Canonical first. A fallback that wins is not a fallback. */
    assert.ok(body.indexOf('/clubs"') < body.indexOf('wrapped config node'),
      f + ' must try the canonical path before either fallback');
    assert.ok(body.indexOf('wrapped config node') < body.indexOf('OLD location'),
      f + ' must try the wrapper before the per-tool node');
    assert.match(body, /return \{\};/,
      f + ' must refuse everyone when nothing is found, not throw');
  }
});

test('the NL door hands staff the club wildcard, and admins the Programme one too', () => {
  /* `club: "*"` and `pClub: "*"` are the same SHAPE and very different grants.
     `club` is what an NL staff account already means everywhere else: see
     every club, edit nothing. `pClub` is Programme Packs ADMINISTRATION —
     write into all 73 folders, and read the config holding every club's code.
     programmeAuth has always held that to admin/superadmin; minting both here
     for anyone who passed the staff check would have handed a staff account,
     through a different tool's sign-in, the exact thing the other door
     refuses them. Nothing calls this path yet, which is the only reason this
     is a guard rather than an incident. */
  const src = readFileSync(join(ROOT, 'functions/club-code.js'), 'utf8');
  const staffDoor = src.slice(src.indexOf('req.staff === true'),
                              src.indexOf('Club path'));
  assert.match(staffDoor, /role === "admin" \|\| role === "superadmin"/,
    'the claim set must depend on the role, not just on passing the door');
  assert.match(staffDoor, /\{ club: "\*" \}/,
    'staff get the club wildcard on its own');
  assert.ok(!/createCustomToken\([^)]*\{ club: "\*", pClub: "\*" \}\s*\)/.test(staffDoor),
    'pClub must not be minted unconditionally on the staff path');
});

test('both doors open the same record — one config cannot mean two things', () => {
  /* The two functions read ONE config now. Every record must therefore give
     both of them the same answer. It did not on 21/08/2026: club-code.js read
     `passcode` OR `code`, programme.js read `passcode` alone, so a record
     written in the club-codes vocabulary let a club into the Handbook and told
     the same club, holding the same six characters, that Programme Packs did
     not recognise them.

     Asserted against BOTH implementations rather than against one and a
     comment, because the failure is silent on the side that still works. */
  const cases = [
    { clubs: { SUT: { name: 'Sutton United', code: 'AB12CD' } } },
    { clubs: { SUT: { name: 'Sutton United', passcode: 'AB12CD' } } },
    { clubs: { SUT: { name: 'Sutton United', passcode: 'ab-12 cd' } } },
    { clubs: { OLD: { name: 'Gone', code: 'AB12CD', revoked: true } } },
    { clubs: { NEW: { name: 'Half Built', code: '' } } },
    { nl: { name: 'National League', code: 'AB12CD' } },
  ];
  for (const cfg of cases) {
    for (const typed of ['AB12CD', 'ab12cd', '', 'ZZ0000']) {
      const a = cc.pickClub(cfg, typed), b = pp.pickClub(cfg, typed);
      assert.equal(a ? a.key : null, b ? b.key : null,
        'disagreement on ' + JSON.stringify(cfg) + ' for ' + JSON.stringify(typed));
    }
  }
  assert.equal(cc.storedCode({ passcode: 'ab-12cd' }), pp.storedCode({ passcode: 'ab-12cd' }));
  assert.equal(cc.storedCode({ code: 'ab-12cd' }), pp.storedCode({ code: 'ab-12cd' }));
  assert.equal(cc.storedCode({}), pp.storedCode({}));
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
