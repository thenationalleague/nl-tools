/**
 * Pins the Team of the Week voting deadline.
 *
 * Nominations close at 23:59:59 UK time on the day AFTER the match's own
 * matchday: Saturday's games, whatever the kick-off, run until Sunday night.
 * It was previously KO+24h, which made the deadline a function of kick-off
 * time — two games on the same matchday closed hours apart.
 *
 * The arithmetic is the awkward part. Deriving a London wall-clock instant
 * means correcting a UTC guess by the offset London actually had, and the
 * correction can itself cross a DST boundary. Both transitions are asserted
 * here because neither is exercised until the clocks change, by which point
 * the widget is in front of fans.
 *
 * The functions are read out of embeds/motm.html rather than duplicated: the
 * widget is a single self-contained file (the CMS strips <script src>), so
 * there is nothing to import. A copy here would drift from the shipped one
 * and pin nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'embeds/motm.html'), 'utf8');

function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, `embeds/motm.html no longer defines ${name}()`);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && !--depth) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces reading ${name}()`);
}

/* koOf() digs the kick-off out of an NLS match; the cases below hand over a
   Date directly, so it is stubbed. Everything the deadline actually depends
   on is the real shipped code. */
const voteCloseAt = new Function([
  grab('bstDateOf'),
  grab('londonOffsetMs'),
  grab('londonMidnight'),
  'function koOf(m) { return m.ko; }',
  grab('voteCloseAt'),
  'return voteCloseAt;',
].join('\n'))();

const closeFor = (koIso) => voteCloseAt({ ko: new Date(koIso) }).toISOString();

// BST is UTC+1, so 23:59:59.999 London is 22:59:59.999Z. Under GMT they match.
test('every kick-off on a matchday shares one deadline', () => {
  const sunday = '2026-08-09T22:59:59.999Z';
  assert.equal(closeFor('2026-08-08T11:30:00Z'), sunday);  // 12:30 BST
  assert.equal(closeFor('2026-08-08T14:00:00Z'), sunday);  // 15:00 BST
  assert.equal(closeFor('2026-08-08T16:20:00Z'), sunday);  // 17:20 BST
});

test('midweek games close the following night, not the following weekend', () => {
  assert.equal(closeFor('2026-08-11T18:45:00Z'), '2026-08-12T22:59:59.999Z');
});

test('the matchday is the London date, not the UTC one', () => {
  // 22:30Z in June is 23:30 on the 30th in London — still that matchday, so
  // the deadline is the end of the 1st. Read as UTC it would be a day out.
  assert.equal(closeFor('2026-06-30T22:30:00Z'), '2026-07-01T22:59:59.999Z');
});

test('the deadline is 23:59 local across both clock changes', () => {
  // Clocks go back 25/10/2026: the window opens in BST and closes in GMT.
  assert.equal(closeFor('2026-10-24T14:00:00Z'), '2026-10-25T23:59:59.999Z');
  assert.equal(closeFor('2026-10-25T15:00:00Z'), '2026-10-26T23:59:59.999Z');
  // Clocks go forward 28/03/2027: opens in GMT, closes in BST.
  assert.equal(closeFor('2027-03-27T15:00:00Z'), '2027-03-28T22:59:59.999Z');
  // A date well clear of either, to prove GMT is not special-cased wrong.
  assert.equal(closeFor('2026-12-26T15:00:00Z'), '2026-12-27T23:59:59.999Z');
});

test('the deadline rolls over month and year ends', () => {
  assert.equal(closeFor('2026-08-31T14:00:00Z'), '2026-09-01T22:59:59.999Z');
  assert.equal(closeFor('2026-12-31T15:00:00Z'), '2027-01-01T23:59:59.999Z');
});

test('a fixture with no kick-off time has no deadline, so it never opens', () => {
  assert.equal(voteCloseAt({ ko: null }), null);
});

/* ---------------------------------------------------------------------------
   Server-side enforcement.

   The deadline above is the browser's. The rule that actually holds it is
   ".write": "... motm-windows/<matchId> exists && now < its value", and that
   node is written by scripts/build-leaderboard.js. Existence encodes the OPEN
   end — an entry only appears once the match has finished — and the value
   encodes the close.

   Two implementations of one deadline is the risk this introduces. If they
   drift, the rule rejects a nomination the widget is still cheerfully
   offering, and a fan sees a failure with no explanation. So the last test
   here holds them to the same millisecond.
   --------------------------------------------------------------------------- */

import { createRequire } from 'node:module';
const lb = createRequire(import.meta.url)('../scripts/build-leaderboard.js');

const nlsMatch = (id, koIso, period) => ({
  id,
  attributes: {
    kickOffDateUTC: koIso,
    matchPeriod: period,
    homeTeam: { teamID: 'H', score: 1 },
    awayTeam: { teamID: 'A', score: 0 },
  },
});

test('the window opens only once a match has actually finished', () => {
  const now = new Date('2026-08-08T16:00:00Z');
  const w = lb.buildMotmWindows([
    nlsMatch('done',   '2026-08-08T14:00:00Z', 'FullTime'),
    nlsMatch('live',   '2026-08-08T15:00:00Z', 'SecondHalf'),
    nlsMatch('later',  '2026-08-08T18:00:00Z', 'PreMatch'),
    nlsMatch('called', '2026-08-08T14:00:00Z', 'Postponed'),
  ], now);
  // Existence IS the open gate — a rule demanding the entry exists has
  // enforced "opens at full time" without a second timestamp.
  assert.deepEqual(Object.keys(w), ['done']);
});

test('an abandoned match never opens, so it can never be nominated in', () => {
  const now = new Date('2026-08-09T12:00:00Z');
  const w = lb.buildMotmWindows([nlsMatch('gone', '2026-08-08T14:00:00Z', 'Abandoned')], now);
  assert.deepEqual(w, {});
});

test('THE INVARIANT: widget and rule agree on the deadline to the millisecond', () => {
  // Two implementations of one deadline. Drift here means the rule rejects a
  // nomination the widget is still offering, with nothing on screen to explain
  // it — so every case the widget is pinned on is checked against the builder.
  for (const koIso of ['2026-08-08T11:30:00Z', '2026-08-08T14:00:00Z',
                       '2026-08-08T16:20:00Z', '2026-08-11T18:45:00Z',
                       '2026-06-30T22:30:00Z', '2026-10-24T14:00:00Z',
                       '2026-10-25T15:00:00Z', '2027-03-27T15:00:00Z',
                       '2026-12-26T15:00:00Z', '2026-08-31T14:00:00Z',
                       '2026-12-31T15:00:00Z']) {
    assert.equal(
      lb.motmCloseAt(nlsMatch('m', koIso, 'FullTime')),
      voteCloseAt({ ko: new Date(koIso) }).getTime(),
      `builder and widget disagree for a ${koIso} kick-off`,
    );
  }
});
