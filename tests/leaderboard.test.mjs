/**
 * Pins the leaderboard aggregate to the Score Predictor's own arithmetic.
 *
 * The aggregate replaces a calculation that currently happens in the browser.
 * If the two disagree, fans see a table that silently changed overnight — so
 * these tests exist to make the port's rules explicit rather than to prove the
 * code runs. Ordering, tie handling and what counts as settled are all copied
 * from embeds/score-predictor.html; each is asserted here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lb = require('../scripts/build-leaderboard.js');

const HOUR = 3600e3;
const NOW = new Date('2026-08-02T18:00:00Z');

// A match at a fixed kick-off, with whatever period/score the case needs.
function match(id, koIso, period, homeScore, awayScore) {
  return {
    id,
    attributes: {
      kickOffDateUTC: koIso,
      matchPeriod: period,
      homeTeam: { teamID: 'H', score: homeScore },
      awayTeam: { teamID: 'A', score: awayScore },
    },
  };
}

test('verdict: exact implies a correct result too', () => {
  assert.equal(lb.verdictOf(2, 1, 2, 1), 'exact');
  assert.equal(lb.verdictOf(3, 1, 2, 1), 'result');
  assert.equal(lb.verdictOf(0, 0, 1, 1), 'result');   // draw predicted, draw played
  assert.equal(lb.verdictOf(2, 1, 1, 2), 'wrong');
  assert.equal(lb.verdictOf(null, 1, 1, 2), null);
  assert.equal(lb.verdictOf(2, 1, null, null), null); // no score yet
});

test('settled: only finished matches count', () => {
  const ko = '2026-08-02T14:00:00Z';
  assert.equal(lb.isSettled(match('m', ko, 'FullTime', 1, 0), NOW), true);
  assert.equal(lb.isSettled(match('m', ko, 'PostMatch', 1, 0), NOW), true);
  assert.equal(lb.isSettled(match('m', ko, 'Postponed', null, null), NOW), false);
  assert.equal(lb.isSettled(match('m', ko, 'Abandoned', 1, 0), NOW), false);
});

test('settled: an in-play period never counts, however old', () => {
  // A feed stuck at SecondHalf must not settle on the clock — the widget shows
  // it as unresolved and excludes it, and so must the aggregate.
  const stale = new Date(NOW.getTime() - 10 * HOUR).toISOString();
  assert.equal(lb.isSettled(match('m', stale, 'SecondHalf', 1, 0), NOW), false);
  assert.equal(lb.isSettled(match('m', stale, 'HalfTime', 1, 0), NOW), false);
});

test('settled: an unmarked match settles on the clock at 105 minutes', () => {
  // This is the case the first draft of the port got wrong: with no usable
  // matchPeriod the widget falls back to the clock and counts the match, so a
  // fixture the feed never marked FullTime would otherwise score in the
  // browser and not in the aggregate.
  const justBefore = new Date(NOW.getTime() - 104 * 60e3).toISOString();
  const justAfter = new Date(NOW.getTime() - 106 * 60e3).toISOString();
  assert.equal(lb.isSettled(match('m', justBefore, 'PreMatch', 1, 0), NOW), false);
  assert.equal(lb.isSettled(match('m', justAfter, 'PreMatch', 1, 0), NOW), true);
  assert.equal(lb.isSettled(match('m', justAfter, '', 1, 0), NOW), true);
});

test('matchday keys use Europe/London, not UTC', () => {
  // 23:30 UTC on 1 Aug is 00:30 BST on 2 Aug — the widget keys predictions by
  // the London date, so an off-by-one here would look up the wrong matchday
  // and silently score nothing.
  assert.equal(lb.matchdayKeyOf(match('m', '2026-08-01T23:30:00Z', 'FullTime', 1, 0)), '2026-08-02');
  assert.equal(lb.matchdayKeyOf(match('m', '2026-08-02T14:00:00Z', 'FullTime', 1, 0)), '2026-08-02');
  assert.equal(lb.monthOfMatchday('2026-08-02'), '2026-08');
});

// ---------------------------------------------------------------------------

const MATCHES = [
  match('m1', '2026-08-01T14:00:00Z', 'FullTime', 2, 1),
  match('m2', '2026-08-01T14:00:00Z', 'FullTime', 0, 0),
  match('m3', '2026-09-05T14:00:00Z', 'FullTime', 1, 3),
  match('m4', '2026-09-05T14:00:00Z', 'PreMatch', null, null),   // not played
];

const USERS = {
  jwt_a: { forename: 'Anna', surnameInitial: 'B', teamId: '10', teamName: 'Aldershot', crestUrl: 'a.png' },
  jwt_b: { forename: 'Ben', surnameInitial: 'C', teamId: '20', teamName: 'Boreham Wood', crestUrl: 'b.png' },
  jwt_c: { forename: 'Cara', surnameInitial: 'D', teamId: '10', teamName: 'Aldershot', crestUrl: 'a.png' },
  jwt_d: { forename: 'Dan', surnameInitial: 'E', teamId: '30', teamName: 'Dagenham', crestUrl: 'd.png' },
};

const PREDS = {
  // 2 exact, so 2 results, 2 settled
  jwt_a: { '2026-08-01': { m1: { home: 2, away: 1 }, m2: { home: 0, away: 0 } } },
  // 1 exact + 1 wrong
  jwt_b: { '2026-08-01': { m1: { home: 2, away: 1 }, m2: { home: 3, away: 0 } } },
  // 2 correct results, no exacts
  jwt_c: { '2026-08-01': { m1: { home: 4, away: 1 }, m2: { home: 1, away: 1 } } },
  // predicted only the match that has not been played
  jwt_d: { '2026-09-05': { m4: { home: 1, away: 0 } } },
};

test('rows: ordered by results, then exacts, then forename', () => {
  const rows = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'season' }, NOW);
  // Dan is last: the season table lists everyone registered, so he is present
  // on nought rather than absent. See the who-appears block below.
  assert.deepEqual(rows.map((r) => r.n), ['Anna B', 'Cara D', 'Ben C', 'Dan E']);
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.r, r.e, r.s]),
                   [[2, 2, 2], [2, 0, 2], [1, 1, 2]]);
});

test('rows: a fan with nothing settled is left out of a NARROW scope', () => {
  // This used to hold for the season table too. It no longer does, on purpose:
  // everyone who has entered belongs in the season standings. The narrower
  // scopes keep the rule — see the who-appears block below for why.
  const rows = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'month', key: '2026-08' }, NOW);
  assert.equal(rows.find((r) => r.n === 'Dan E'), undefined);
});

test('rows: a full tie breaks to the most recent activity, not the alphabet', () => {
  // Zoe registered later, so she is above Adam despite the Z. Alphabetical
  // order buried whoever had just signed up at the bottom of a table where
  // everybody was on nought — which is every table before the season starts.
  const users = {
    x: { forename: 'Zoe', surnameInitial: 'Z', teamId: '1', teamName: 'T', crestUrl: '', registeredAt: 2000 },
    y: { forename: 'Adam', surnameInitial: 'A', teamId: '1', teamName: 'T', crestUrl: '', registeredAt: 1000 },
  };
  const preds = {
    x: { '2026-08-01': { m1: { home: 2, away: 1 } } },
    y: { '2026-08-01': { m1: { home: 2, away: 1 } } },
  };
  const rows = lb.buildRows(users, preds, MATCHES, { kind: 'season' }, NOW);
  assert.deepEqual(rows.map((r) => r.n), ['Zoe Z', 'Adam A']);
});

test('activity: the latest prediction beats the registration date', () => {
  // "Most recent thing they did", not "when they joined" — a fan who signed up
  // in July and predicted this morning is more recently active than one who
  // registered last night and has done nothing since.
  const reg = { registeredAt: 1000 };
  assert.equal(lb.lastActivity(reg, {}), 1000);
  assert.equal(lb.lastActivity(reg, { '2026-08-01': { m1: { submittedAt: 5000 } } }), 5000);
  // An older submission does not drag them backwards.
  assert.equal(lb.lastActivity({ registeredAt: 9000 }, { '2026-08-01': { m1: { submittedAt: 5000 } } }), 9000);
  assert.equal(lb.lastActivity(null, null), 0);
});

test('rows: a fan who has just predicted outranks one who only registered', () => {
  const users = {
    old: { forename: 'Old', surnameInitial: 'O', teamId: '1', teamName: 'T', crestUrl: '', registeredAt: 8000 },
    act: { forename: 'Act', surnameInitial: 'A', teamId: '1', teamName: 'T', crestUrl: '', registeredAt: 1000 },
  };
  const preds = { act: { '2026-09-05': { m4: { home: 1, away: 0, submittedAt: 9999 } } } };
  const rows = lb.buildRows(users, preds, MATCHES, { kind: 'season' }, NOW);
  assert.deepEqual(rows.map((r) => r.n), ['Act A', 'Old O']);
});

test('scopes: month and day filter the same tallies', () => {
  const aug = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'month', key: '2026-08' }, NOW);
  const sep = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'month', key: '2026-09' }, NOW);
  const day = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'day', key: '2026-08-01' }, NOW);
  assert.equal(aug.length, 3);
  assert.equal(sep.length, 0);          // only m4, which was never played
  assert.deepEqual(day.map((r) => r.n), aug.map((r) => r.n));
});

test('scopes: one per month and per matchday present in the fixtures', () => {
  const s = lb.scopesFor(MATCHES);
  assert.deepEqual(s.month.map((x) => x.key), ['2026-08', '2026-09']);
  assert.deepEqual(s.day.map((x) => x.key), ['2026-08-01', '2026-09-05']);
});

// ---------------------------------------------------------------------------

test('THE INVARIANT: no jwtId appears anywhere in the payload', () => {
  // The entire point of the aggregate. A row is a rendered result, not a
  // pointer — putting an id back, even "just for the you-highlight", would
  // republish the id list in a readable node.
  const payload = lb.buildPayload(USERS, PREDS, MATCHES, NOW);
  const json = JSON.stringify(payload);
  for (const jwtId of Object.keys(USERS)) {
    assert.equal(json.includes(jwtId), false, jwtId + ' leaked into the aggregate');
  }
});

test('row hash: stable, truncated, and matches only its own id', () => {
  const h = lb.rowHash('jwt_a');
  assert.equal(h, lb.rowHash('jwt_a'));
  assert.equal(h.length, 12);
  assert.notEqual(h, lb.rowHash('jwt_b'));
  assert.equal(h.includes('jwt_a'), false);
});

test('payload: carries the salt so a stale widget can spot a mismatch', () => {
  const payload = lb.buildPayload(USERS, PREDS, MATCHES, NOW);
  assert.equal(payload.salt, lb.ROW_SALT);
  assert.equal(typeof payload.updatedAt, 'number');
});

test('payload: rows carry a club id for the my-club filter, never a person', () => {
  const payload = lb.buildPayload(USERS, PREDS, MATCHES, NOW);
  const row = payload.season.rows[0];
  assert.deepEqual(Object.keys(row).sort(), ['c', 'e', 'h', 'j', 'n', 'r', 's', 't', 'tn']);
  assert.equal(row.t, '10');
  // `j` is a timestamp used only to break ties. It says when, never who.
  assert.equal(typeof row.j, 'number');
});

// ---------------------------------------------------------------------------
// The kick-off lock
//
// The cutoff used to live only in the browser, which meant it was a courtesy
// rather than a rule: ".write" was "auth != null", so devtools could post a
// prediction after a match had kicked off, or after it had finished. These
// cover the table the security rule now compares server time against.

test('locks: one cutoff per fixture, an hour before kick-off', () => {
  const locks = lb.buildLocks(MATCHES);
  const ko = new Date('2026-08-01T14:00:00Z').getTime();
  assert.equal(locks['2026-08-01'].m1, ko - 60 * 60e3);
  assert.equal(locks['2026-08-01'].m2, ko - 60 * 60e3);
  assert.equal(lb.CUTOFF_MIN, 60);
});

test('locks: keyed by the same matchday string predictions are', () => {
  // The rule looks up locks/$matchday/$matchId using the path the client
  // writes to. A different key derivation here would deny every write.
  const locks = lb.buildLocks(MATCHES);
  assert.deepEqual(Object.keys(locks).sort(), ['2026-08-01', '2026-09-05']);
  assert.ok(locks['2026-09-05'].m4, 'an unplayed fixture still gets a lock');
});

test('locks: a fixture with no kick-off time is omitted, so it stays shut', () => {
  // Fail closed. The rule denies when the value is missing, so omitting a
  // fixture we cannot time is safer than guessing one.
  const broken = [{ id: 'x', attributes: { matchPeriod: 'PreMatch', homeTeam: {}, awayTeam: {} } }];
  assert.deepEqual(lb.buildLocks(broken), {});
});

test('locks: a rescheduled fixture moves its cutoff with it', () => {
  const first = lb.buildLocks([match('m9', '2026-08-01T14:00:00Z', 'PreMatch', null, null)]);
  const moved = lb.buildLocks([match('m9', '2026-08-03T19:45:00Z', 'PreMatch', null, null)]);
  assert.ok(moved['2026-08-03'].m9 > first['2026-08-01'].m9);
  assert.equal(first['2026-08-03'], undefined);
});

// ---------------------------------------------------------------------------
// Who appears in a table
//
// The season table is the thing everyone has entered, so everyone is in it
// from the moment they register. A month or a matchday is not: a fan who
// joined in November did not score nothing in October, they were absent, and
// a row of zeroes reads as a failure rather than an absence.

test('season: a registered fan with nothing settled still appears', () => {
  const rows = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'season' }, NOW);
  const dan = rows.find((r) => r.n === 'Dan E');
  assert.ok(dan, 'Dan predicted only an unplayed match and should still be listed');
  assert.deepEqual([dan.r, dan.e, dan.s], [0, 0, 0]);
});

test('season: everyone registered is listed, once each', () => {
  const rows = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'season' }, NOW);
  assert.equal(rows.length, Object.keys(USERS).length);
  assert.equal(new Set(rows.map((r) => r.h)).size, rows.length);
});

test('season: those with something settled still rank above those without', () => {
  const rows = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'season' }, NOW);
  assert.deepEqual(rows.map((r) => r.n), ['Anna B', 'Cara D', 'Ben C', 'Dan E']);
});

test('month and matchday still drop a fan with nothing settled there', () => {
  const aug = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'month', key: '2026-08' }, NOW);
  const day = lb.buildRows(USERS, PREDS, MATCHES, { kind: 'day', key: '2026-08-01' }, NOW);
  assert.equal(aug.find((r) => r.n === 'Dan E'), undefined);
  assert.equal(day.find((r) => r.n === 'Dan E'), undefined);
  assert.equal(aug.length, 3);
});
