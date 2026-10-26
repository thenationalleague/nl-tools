/**
 * nls-players.test.mjs — one row per player per match (functions/nls/players.js).
 *
 * Raw details go through the real transform.shapeDetail first, so these tests
 * exercise the same shaped input the ingester hands to buildPlayerRows. The
 * raw fixture shape is the one tests/nls-ingester.test.mjs already uses for
 * goals; the substitution and booking shapes (substitutionEvents.subOnID /
 * subOffID, bookingEvents.card / cardType) are the field names transform.js
 * reads, which were written against live NLS detail responses.
 *
 * Every player here is synthetic. This repository is public.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../functions/nls/transform.js');
const P = require('../functions/nls/players.js');
const { ymdMinusDays } = P;

const NOW = Date.parse('2026-10-24T18:00:00Z');

function player(id, n, pos = 'Defender') {
  return { playerID: id, shirtNumber: n, playerPosition: pos, formationPlace: n,
    playerName: { playerID: id, knownName: 'Player ' + id } };
}
const xi = (prefix, count = 11) =>
  Array.from({ length: count }, (_, i) => player(prefix + (i + 1), i + 1));

function sub(onID, offID, minute, period = 'SecondHalf') {
  return { eventMinute: minute, eventPeriod: period, formattedEventTime: minute + "'",
    substitutionEvents: { subOnID: onID, subOffID: offID,
      subOnPlayer: { playerName: { knownName: 'Player ' + onID } },
      subOffPlayer: { playerName: { knownName: 'Player ' + offID } } } };
}
function goal(playerID, minute, type = 'Goal') {
  return { eventMinute: minute, eventPeriod: 'SecondHalf', formattedEventTime: minute + "'",
    goalEvents: { playerID, goalType: type,
      player: { playerID, playerName: { knownName: 'Player ' + playerID } } } };
}
function booking(playerID, minute, card, cardType = null) {
  return { eventMinute: minute, eventPeriod: 'FirstHalf', formattedEventTime: minute + "'",
    bookingEvents: { playerID, card, cardType,
      player: { playerID, playerName: { knownName: 'Player ' + playerID } } } };
}

function raw({ home = {}, away = {}, details = {}, homeScore = 2, awayScore = 1 } = {}) {
  return { id: 'g9000001', attributes: {
    matchID: 'g9000001', competitionID: 373, seasonID: 2026,
    kickOffUTC: '2026-10-24 14:00:00', period: 'FullTime', homeTeamID: 't1',
    matchDetails: Object.assign({ resultType: 'NormalResult' }, details),
    homeTeam: { teamID: 't1', teamName: 'Home Town' },
    awayTeam: { teamID: 't2', teamName: 'Away United' },
    matchTeams: [
      { teamID: 't1', score: homeScore, halfScore: 1, formation: '442',
        players: { Start: home.start || xi('h'), Sub: home.subs || [player('hs1', 12), player('hs2', 14)] },
        events: Object.assign({ goals: [], bookings: [], subs: [], shootout: [] }, home.events) },
      { teamID: 't2', score: awayScore, halfScore: 0, formation: '433',
        players: { Start: away.start || xi('a'), Sub: away.subs || [player('as1', 12)] },
        events: Object.assign({ goals: [], bookings: [], subs: [], shootout: [] }, away.events) },
    ],
  } };
}
const build = (r) => P.buildPlayerRows(T.shapeDetail(r, NOW), NOW);

test('starters play 90, an unused substitute plays 0 and is marked unused', () => {
  const { rows, complete } = build(raw());
  assert.equal(complete, true);
  assert.equal(rows.h1.role, 'start');
  assert.equal(rows.h1.minutes, 90);
  assert.equal(rows.hs2.role, 'unused');
  assert.equal(rows.hs2.minutes, 0);
  assert.equal(rows.hs2.on, null);
});

test('a substitution splits the minutes between the two players', () => {
  const { rows } = build(raw({ home: { events: { subs: [sub('hs1', 'h9', 60)] } } }));
  assert.equal(rows.hs1.role, 'sub');
  assert.equal(rows.hs1.on, 60);
  assert.equal(rows.hs1.minutes, 30);
  assert.equal(rows.h9.off, 60);
  assert.equal(rows.h9.minutes, 60);
});

test('a stoppage-time minute is held to the regulation clock, never past it', () => {
  const { rows } = build(raw({ home: { events: { subs: [sub('hs1', 'h9', 93)] } } }));
  assert.equal(rows.hs1.on, 90);
  assert.equal(rows.hs1.minutes, 0, 'a 90+3 cameo is not three minutes billed beyond the clock');
  assert.equal(rows.h9.minutes, 90);
});

test('goals and penalties go to the scorer, from his own side\'s point of view', () => {
  const { rows } = build(raw({
    home: { events: { goals: [goal('h10', 20), goal('h10', 70, 'Penalty')] } },
    away: { events: { goals: [goal('a9', 80)] } },
  }));
  assert.equal(rows.h10.goals, 2);
  assert.equal(rows.h10.penalties, 1);
  assert.equal(rows.h10.result, 'W');
  assert.equal(rows.h10.scoreFor, 2);
  assert.equal(rows.h10.home, true);
  assert.equal(rows.a9.goals, 1);
  assert.equal(rows.a9.result, 'L');
  assert.equal(rows.a9.oppName, 'Home Town');
});

test('an own goal is the scorer\'s own goal, not a goal, and he stays on his own team', () => {
  // Filed under the side that benefited — home — but scored by an away defender.
  const { rows } = build(raw({ home: { events: { goals: [goal('a4', 33, 'Own Goal')] } } }));
  assert.equal(rows.a4.goals, 0);
  assert.equal(rows.a4.ownGoals, 1);
  assert.equal(rows.a4.teamID, 't2');
});

test('a player named only in an event is unlisted, with unknowable minutes', () => {
  const r = raw({ home: { start: [], subs: [], events: { goals: [goal('hx', 50)] } } });
  const { rows, complete } = build(r);
  assert.equal(complete, false, 'no home team sheet means the ledger will look again');
  assert.equal(rows.hx.role, 'unlisted');
  assert.equal(rows.hx.minutes, null);
  assert.equal(rows.hx.teamID, 't1');
  assert.equal(rows.hx.goals, 1);
});

test('an unlisted own-goal scorer is placed on the side that conceded', () => {
  const r = raw({ away: { start: [], subs: [] }, home: { events: { goals: [goal('ax', 12, 'Own Goal')] } } });
  const { rows } = build(r);
  assert.equal(rows.ax.teamID, 't2');
  assert.equal(rows.ax.ownGoals, 1);
});

test('a red card stops the clock; a second yellow counts as a red', () => {
  const { rows } = build(raw({
    home: { events: { bookings: [booking('h5', 30, 'Red', 'StraightRed')] } },
    away: { events: { bookings: [booking('a6', 20, 'Yellow'), booking('a6', 70, 'Red', 'SecondYellow')] } },
  }));
  assert.equal(rows.h5.red, 1);
  assert.equal(rows.h5.minutes, 30);
  assert.equal(rows.a6.yellow, 1);
  assert.equal(rows.a6.red, 1);
  assert.equal(rows.a6.minutes, 70);
});

test('extra time lengthens the clock to 120', () => {
  const { rows, length } = build(raw({ details: { resultType: 'AfterExtraTime' } }));
  assert.equal(length, 120);
  assert.equal(rows.h1.minutes, 120);
});

test('the ledger records who has a row, so a corrected sheet can remove one', () => {
  const d = T.shapeDetail(raw(), NOW);
  const built = P.buildPlayerRows(d, NOW);
  const l = P.ledgerEntry(d, built, NOW, 2);
  assert.equal(l.attempts, 2);
  assert.equal(l.complete, true);
  assert.equal(l.pids.h1, true);
  assert.equal(l.playerCount, 11 + 2 + 11 + 1);
  assert.equal(l.home.name, 'Home Town');
});

test('rows carry the match context a preview needs without a second read', () => {
  const { rows } = build(raw());
  const r = rows.a1;
  assert.equal(r.compKey, 'north');
  assert.equal(r.ko, '2026-10-24T14:00:00.000Z');
  assert.equal(r.matchID, 'g9000001');
  assert.equal(r.season, 2026);
  assert.equal(r.teamName, 'Away United');
  assert.equal(r.home, false);
});

test('a failed fetch is recorded, and is not due again inside the retry window', () => {
  const six = 6 * 3600 * 1000;
  const f = P.failureLedger(null, 'g1', 'north', NOW, 'upstream HTTP 503');
  assert.equal(f.complete, false);
  assert.equal(f.attempts, 1);
  assert.equal(f.lastError, 'upstream HTTP 503');
  assert.equal(P.isDue(f, NOW + six - 1, six), false, 'no hourly refetch of a broken match');
  assert.equal(P.isDue(f, NOW + six, six), true);
  assert.equal(P.isDue(null, NOW, six), true);
  assert.equal(P.isDue({ complete: true }, NOW, six), false);
  // A second failure keeps the rows already written for this match.
  const g = P.failureLedger({ pids: { p1: true }, attempts: 1 }, 'g1', 'north', NOW, 'x');
  assert.equal(g.attempts, 2);
  assert.deepEqual(g.pids, { p1: true });
});

test('an old day closes on a missing sheet at once, on a failing fetch only after three tries', () => {
  const old = '2026-09-01', cut = '2026-10-17', recent = '2026-10-20';
  const done = { complete: true };
  const noSheet = { complete: false, attempts: 1 };
  const failed1 = { complete: false, attempts: 1, lastError: 'x' };
  const failed3 = { complete: false, attempts: 3, lastError: 'x' };
  assert.equal(P.dayClosed({ a: done, b: done }, ['a', 'b'], recent, cut), true, 'all complete closes any day');
  assert.equal(P.dayClosed({ a: done, b: noSheet }, ['a', 'b'], recent, cut), false, 'a recent day waits for its sheets');
  assert.equal(P.dayClosed({ a: done, b: noSheet }, ['a', 'b'], old, cut), true, 'an old day stops waiting');
  assert.equal(P.dayClosed({ a: done, b: failed1 }, ['a', 'b'], old, cut), false, 'one transient failure must not close a backfill day');
  assert.equal(P.dayClosed({ a: done, b: failed3 }, ['a', 'b'], old, cut), true);
  assert.equal(P.dayClosed({ a: done }, ['a', 'b'], old, cut), false, 'a match never attempted keeps the day open');
});

test('ymdMinusDays crosses a month boundary', () => {
  assert.equal(typeof ymdMinusDays, 'function');
  assert.equal(ymdMinusDays('2026-11-03', 7), '2026-10-27');
});
