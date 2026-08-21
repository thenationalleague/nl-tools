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

test('both queries the page makes are indexed', () => {
  /* Two reads, two indexes:
       at   — the global "last 200 sign-ins" list
       club — one club's own history, opened from its row

     Without an index RTDB still ANSWERS: it downloads the entire node and
     sorts on the client, warning into a console nobody has open. It gets
     slower every week and never breaks, which is the worst shape of
     performance bug — and the `club` one is the worse of the two, because
     it fires on a click rather than once on load. */
  assert.deepEqual(usageRules['.indexOn'], ['at', 'club']);

  assert.match(PAGE, /orderByChild\('at'\)\.limitToLast\(USE_LIMIT\)/);
  assert.match(PAGE, /orderByChild\('club'\)\.equalTo\(club\)\.limitToLast\(ACT_LIMIT\)/);
});

test('a club\'s history is read once and a person is filtered out of it', () => {
  /* Expanding three people at one club must not be three reads, and 72
     clubs on load must not be 72. The cache is what makes the per-row
     control affordable at all. */
  assert.match(PAGE, /if \(ACT\[club\]\) return;/,
    'a club already loaded is not fetched again');
  assert.match(PAGE, /kind === 'user'\) \? all\.filter/,
    "a person's history comes out of their club's, not its own query");
  assert.match(PAGE, /OPEN\[k\]/,
    'which rows are open is page state, or render() closes them all on any ' +
    'change anywhere');
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

test('the panel does not borrow the row hover colour', () => {
  /* .cc-row:hover is --navy-50. An expanded panel tinted the same reads as a
     hovered row rather than as something that opened — and the first version
     of it, untinted, was indistinguishable from the club's list of PEOPLE
     directly below: same indent, same type, same names. */
  const rule = /\.cc-log \{([^}]*)\}/.exec(PAGE);
  assert.ok(rule, '.cc-log still exists');
  assert.match(rule[1], /background:\s*var\(--white\)/);
  assert.ok(!/var\(--navy-50\)/.test(rule[1]),
    'that is the row hover colour');
  assert.match(PAGE, /cc-log__cap/,
    'the panel says what it is listing — the rows alone read as more people');
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

test('the page says when a code was last changed', () => {
  /* rotatedAt has been written on every reset since launch and displayed
     nowhere, so "when did we last change this?" — the question asked
     immediately before every reset — was unanswerable from the page that
     does the resetting. */
  assert.match(PAGE, /function rotatedLine/);
  assert.match(PAGE, /Code last changed/);
  assert.match(PAGE, /target\.rotatedAt/);
});

test('a code that has never been reset says nothing rather than guessing', () => {
  /* Absent rotatedAt means never reset, which is a different thing from
     never used — and "changed 56 years ago" is what a missing timestamp
     renders as if it is passed through anyway. */
  const fn = PAGE.slice(PAGE.indexOf('function rotatedLine'));
  assert.match(fn.slice(0, 600), /if \(!target \|\| !target\.rotatedAt\) return '';/);
});

test('the reset writes the timestamp it now displays', () => {
  /* Both resets — a whole club, and one person. A display with only one
     writer behind it is a field that looks broken for half the rows. */
  const writes = PAGE.match(/patch\.rotatedAt = firebase\.database\.ServerValue\.TIMESTAMP/g) || [];
  assert.equal(writes.length, 2, 'the club reset and the person reset both stamp it');
});
