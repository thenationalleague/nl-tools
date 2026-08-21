/* The club-code usage log — who used a code, when, and which tool it opened.

   There was no record at all before this. Both doors minted a token and
   returned; the comments in club-code.js talk about the audit trail naming a
   person and the trail was never written. So every property below is a
   decision made once, invisible at runtime, and expensive to discover later:

     · a log that can be WRITTEN BY A CLIENT is worse than no log. Anyone
       holding any club code can reach this database, so `.write` must stay
       absent — the Admin SDK bypasses rules and needs no permission.
     · the CODE must never appear in it. A log of credential use that contains
       the credential is a second place to steal it from.
     · the person's NAME must not either, but for a different reason: it lives
       one node away in the code record, and a copy here goes stale the moment
       someone is renamed. The id is stored and the name resolved at display.
     · FLAT, not nested under the club. limitToLast on usage/<club>/<push>
       returns the last CLUBS, not the last uses, so a nested shape quietly
       turns "the last 200 sign-ins" into "read everything ever written".
     · a failed write must not fail the SIGN-IN. A club with the right code is
       getting in whatever the log does.

   Both doors are covered, because there are two and they are separate files:
   a log written by one and not the other is a log that is silently missing
   every club that came in through Programme Packs. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const CLUB = readFileSync(join(REPO, 'functions/club-code.js'), 'utf8');
const PROG = readFileSync(join(REPO, 'functions/programme.js'), 'utf8');
const RULES = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'));
const PAGE = readFileSync(join(REPO, 'club-codes/index.html'), 'utf8');

/* Both files explain in prose why the code and the name are not stored, so a
   grep for "code" over the raw source matches the sentence saying it must not
   and fails a correct file. Twice now. Code only. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const usageRules = RULES.rules['app-data']['club-codes'].usage;

test('no client can write to the log', () => {
  /* The whole value of an audit trail is that the people it audits cannot
     edit it. The functions use the Admin SDK, which bypasses rules entirely,
     so there is nothing to grant — and RTDB denies by default, so the correct
     rule is the absence of one. */
  assert.ok(usageRules, 'app-data/club-codes/usage has rules');
  assert.equal(usageRules['.write'], undefined,
    'a forgeable audit log is worse than none — writes come from the Admin ' +
    'SDK, which needs no rule');
});

test('only an admin can read it', () => {
  const read = usageRules['.read'];
  assert.ok(read, 'usage must declare a read rule, or nobody can see it');
  assert.match(read, /'superadmin'/);
  assert.match(read, /'admin'/);
  assert.ok(!/auth != null"?$/.test(read.trim()),
    'signed-in is not the bar — every club holds a code and every code is a ' +
    'sign-in');
});

test('it is indexed on `at`, or the query is a full read', () => {
  /* The page asks orderByChild('at').limitToLast(200). Without the index
     RTDB still answers — by downloading the entire node and sorting on the
     client, warning in a console nobody has open. It gets slower every week
     and never breaks, which is the worst shape of performance bug. */
  assert.deepEqual(usageRules['.indexOn'], ['at']);
});

for (const [name, src, root] of [
  ['club-code.js', CLUB, 'ROOT'],
  ['programme.js', PROG, 'CODES_ROOT'],
]) {
  test(`${name} writes the log, flat, beside the codes`, () => {
    const re = new RegExp(root + ' \\+ "/usage"\\)\\.push\\(');
    assert.match(src, re,
      'flat under usage, not usage/<club> — nesting turns a bounded query ' +
      'into reading every entry ever written');
    assert.match(src, /club: key,/, 'the club is a field, since the path no longer says it');
    assert.match(src, /at: admin\.database\.ServerValue\.TIMESTAMP/,
      'the server stamps the time — a client clock is not evidence');
  });

  test(`${name} logs the userId, never the name or the code`, () => {
    const fn = stripComments(src.slice(src.indexOf('function noteUse')));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.match(body, /userId/);
    assert.ok(!/\bwho\b/.test(body),
      'the name lives in the code record and would go stale here on a rename');
    assert.ok(!/code|passcode/.test(body),
      'a log of credential use must never contain the credential');
  });

  test(`${name} does not fail a sign-in over a failed log write`, () => {
    const fn = src.slice(src.indexOf('function noteUse'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.match(body, /\.catch\(/,
      'fire and forget — a club with the right code is signing in whatever ' +
      'the log does');
    assert.ok(!/throw /.test(body));
  });
}

test('the tool name is cleaned before it is stored', () => {
  /* It comes off the client — NL.codeGate.viaFunction passes it through from
     the page — so it is untrusted text on its way to a node an admin reads. */
  assert.match(CLUB, /function cleanTool/);
  const fn = CLUB.slice(CLUB.indexOf('function cleanTool'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /replace\(\/\[\^a-z-\]\/g, ""\)/, 'letters and dashes only');
  assert.match(body, /slice\(0, 24\)/, 'and short');
});

test('both club-facing doors say which tool they are', () => {
  /* Without this the log records that someone signed in and not what they
     opened, which is half the question that was asked. */
  const hb = readFileSync(join(REPO, 'handbook/reader.html'), 'utf8');
  const dir = readFileSync(join(REPO, 'club-directory/reader/index.html'), 'utf8');
  assert.match(hb, /viaFunction\('app-data\/club-codes', \{ tool: 'handbook' \}\)/);
  assert.match(dir, /viaFunction\('app-data\/club-codes', \{ tool: 'directory' \}\)/);
  assert.match(PROG, /noteUse\(db, hit\.key, "programme", hit\.userId\)/,
    'programme.js serves one tool, so it names itself rather than being told');
});

test('the page resolves the name rather than trusting a stored one', () => {
  assert.match(PAGE, /function whoOf/);
  assert.match(PAGE, /rec\.users\[u\.userId\]/,
    'the name is looked up from the live code record at display time');
  assert.match(PAGE, /Removed person/,
    'a userId nobody recognises any more must say so, not show a bare id');
});

test('the page reads a bounded slice, and survives the rule not being live', () => {
  assert.match(PAGE, /orderByChild\('at'\)\.limitToLast\(USE_LIMIT\)/);
  /* The rules ship by a manual workflow, so there is a window where the code
     is deployed and the rule is not. The codes are this page's actual job —
     a missing usage rule must not black out the tool that manages them. */
  const block = PAGE.slice(PAGE.indexOf("ref('usage')"));
  assert.match(block.slice(0, 1400), /Could not read recent/,
    'a failed usage read reports itself and leaves the rest of the page up');
});
