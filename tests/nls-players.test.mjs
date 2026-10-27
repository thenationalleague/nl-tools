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

test('a scorer entry is the sum of his rows in that competition only', () => {
  const r = (matchID, compKey, teamID, goals, extra = {}) => Object.assign({
    playerID: 'p1', name: 'Player p1', matchID, compKey, teamID, teamName: 'Club ' + teamID,
    role: 'start', minutes: 90, goals, penalties: 0, ownGoals: 0 }, extra);
  const rows = [
    r('m1', 'north', 't1', 1),
    r('m2', 'north', 't1', 3, { penalties: 1 }),
    r('m3', 'north', 't2', 1, { role: 'sub', minutes: 20 }),
    r('m4', 'cup', 't2', 2),
    r('m5', 'north', 't2', 0, { role: 'unused', minutes: 0 }),
  ];
  const e = P.scorerEntry(rows, 'north', NOW);
  assert.equal(e.goals, 5, 'the cup brace is another competition');
  assert.equal(e.penalties, 1);
  assert.equal(e.apps, 3, 'an unused sub is not an appearance');
  assert.equal(e.minutes, 200);
  assert.deepEqual(Object.keys(e.teams).sort(), ['t1', 't2']);
  assert.equal(e.teams.t1.goals, 4);
  assert.equal(P.scorerEntry(rows, 'cup', NOW).goals, 2);
  assert.equal(P.scorerEntry(rows, 'south', NOW), null, 'no rows in a competition → no entry');
  const og = P.scorerEntry([r('m6', 'nl', 't1', 0, { ownGoals: 1 })], 'nl', NOW);
  assert.equal(og.goals, 0);
  assert.equal(og.ownGoals, 1, 'an own-goal scorer keeps an entry so the gap can be explained');
  const unlisted = P.scorerEntry([r('m7', 'nl', 't1', 1, { role: 'unlisted', minutes: null })], 'nl', NOW);
  assert.equal(unlisted.minutes, null, 'an unknown minute makes the total unknown, not short');
});

// --- Hand corrections (P.applyCorrections) --------------------------------
// The goals-without-a-scorer case: the score says 2-1, the feed names fewer.
const fixedBuild = (r, corrections) => {
  const d = T.shapeDetail(r, NOW);
  const fixed = P.applyCorrections(d, corrections);
  return Object.assign(P.buildPlayerRows(fixed.detail, NOW), { applied: fixed.applied, skipped: fixed.skipped });
};

test('a correction names a goal the feed has no scorer for, and marks the row', () => {
  const r = fixedBuild(raw({ home: { events: { goals: [goal('h10', 20)] } }, away: { events: { goals: [goal('a9', 80)] } } }),
    { '55-h7': { playerID: 'h7', teamID: 't1', minute: 55, type: 'goal' } });
  assert.equal(r.applied, 1);
  assert.equal(r.rows.h7.goals, 1);
  assert.equal(r.rows.h7.source, 'nls+correction');
  assert.equal(r.rows.h10.source, 'nls', 'an untouched row keeps its source');
});

test('an own-goal correction credits the other side and stays on the scorer\'s team', () => {
  // 2-1 with no home goals named: one home goal is an away defender's own goal.
  const r = fixedBuild(raw({ away: { events: { goals: [goal('a9', 80)] } } }),
    { '26-a4': { playerID: 'a4', teamID: 't2', minute: 26, type: 'own goal' },
      '34-h8': { playerID: 'h8', teamID: 't1', minute: 34, type: 'penalty' } });
  assert.equal(r.applied, 2);
  assert.equal(r.rows.a4.ownGoals, 1);
  assert.equal(r.rows.a4.goals, 0);
  assert.equal(r.rows.a4.teamID, 't2');
  assert.equal(r.rows.h8.penalties, 1);
});

test('a scorer missing from the team sheet still gets his goal, as unlisted', () => {
  const r = fixedBuild(raw({ home: { events: { goals: [goal('h10', 20)] } }, away: { events: { goals: [goal('a9', 80)] } } }),
    { '65-x1': { playerID: 'x1', teamID: 't1', minute: 65, type: 'goal' } });
  assert.equal(r.rows.x1.role, 'unlisted');
  assert.equal(r.rows.x1.teamID, 't1');
  assert.equal(r.rows.x1.minutes, null);
});

test('a correction stops applying once the feed is fixed at source — never counted twice', () => {
  const r = fixedBuild(raw({ home: { events: { goals: [goal('h10', 20), goal('h7', 55)] } }, away: { events: { goals: [goal('a9', 80)] } } }),
    { '55-h7': { playerID: 'h7', teamID: 't1', minute: 55, type: 'goal' },
      '60-h6': { playerID: 'h6', teamID: 't1', minute: 60, type: 'goal' } });
  assert.equal(r.applied, 0);
  assert.equal(r.skipped, 2);
  assert.equal(r.rows.h7.goals, 1);
  assert.equal(r.rows.h6.goals, 0);
});

test('corrections fill the gap and no more, and a club not in the match is ignored', () => {
  const r = fixedBuild(raw({ away: { events: { goals: [goal('a9', 80)] } } }),
    { '10-h2': { playerID: 'h2', teamID: 't1', minute: 10, type: 'goal' },
      '20-h3': { playerID: 'h3', teamID: 't1', minute: 20, type: 'goal' },
      '30-h4': { playerID: 'h4', teamID: 't1', minute: 30, type: 'goal' },
      '40-z1': { playerID: 'z1', teamID: 't99', minute: 40, type: 'goal' } });
  assert.equal(r.applied, 2, 'home scored 2, so a third home correction is surplus');
  assert.equal(r.rows.h4.goals, 0);
  assert.equal(r.rows.z1, undefined);
});

test('no corrections leaves the detail untouched', () => {
  const d = T.shapeDetail(raw(), NOW);
  const fixed = P.applyCorrections(d, null);
  assert.equal(fixed.detail, d);
  assert.equal(fixed.applied, 0);
});

test('a team-sheet correction adds a missing starter, who then plays the full match', () => {
  const r = fixedBuild(raw({ away: { start: xi('a', 10) } }),
    { 'start-a11': { playerID: 'a11', teamID: 't2', type: 'start' } });
  assert.equal(r.applied, 1);
  assert.equal(r.rows.a11.role, 'start');
  assert.equal(r.rows.a11.minutes, 90);
  assert.equal(r.rows.a11.source, 'nls+correction');
  assert.equal(r.complete, true, 'eleven starters a side now');
});

test('a corrected starter and substitution give both players their minutes', () => {
  const r = fixedBuild(raw({ home: { start: xi('h', 9), subs: [player('hs1', 12)] } }),
    { 'start-h10': { playerID: 'h10', teamID: 't1', type: 'start' },
      'sub-85-hs1': { playerID: 'hs1', offID: 'h10', teamID: 't1', minute: 85, type: 'sub' } });
  assert.equal(r.applied, 2);
  assert.equal(r.rows.h10.minutes, 85);
  assert.equal(r.rows.h10.off, 85);
  assert.equal(r.rows.hs1.role, 'sub');
  assert.equal(r.rows.hs1.minutes, 5);
});

test('team-sheet corrections stop once the sheet is right at source', () => {
  const r = fixedBuild(raw({ home: { events: { subs: [sub('hs1', 'h10', 85)] } } }),
    { 'start-h12': { playerID: 'h12', teamID: 't1', type: 'start' },
      'start-h3': { playerID: 'h3', teamID: 't1', type: 'bench' },
      'sub-85-hs1': { playerID: 'hs1', offID: 'h10', teamID: 't1', minute: 85, type: 'sub' } });
  assert.equal(r.applied, 0, 'XI full, player already listed, substitution already there');
  assert.equal(r.skipped, 3);
  assert.equal(r.rows.h12, undefined);
});
