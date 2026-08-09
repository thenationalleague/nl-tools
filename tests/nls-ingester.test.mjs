/**
 * nls-ingester.test.mjs — the pure layers of the NLS → RTDB ingester.
 *
 * Everything under test here is a pure function by design: transform, the
 * cadence state machine, the event diff and the table/scorer derivation take
 * their clock as an argument and touch neither the network nor RTDB. That is
 * the only reason a Saturday-afternoon pre-match window, a points deduction
 * and a retracted goal can all be exercised on a Tuesday morning.
 *
 * The orchestrator (nls-ingester.js) is deliberately not tested here — it is
 * RTDB writes and Cloud Scheduler wiring, and a mock of both would prove
 * nothing that inspecting a live matchday does not prove better. Step 1 of the
 * build order is exactly that: the ingester writes, nothing reads, and someone
 * looks at the nodes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../functions/nls/transform.js');
const S = require('../functions/nls/schedule.js');
const E = require('../functions/nls/events.js');
const D = require('../functions/nls/derive.js');

const NOW = Date.parse('2026-08-08T14:00:00Z');
const MIN = 60 * 1000;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function listMatch(over = {}) {
  return {
    id: 'g2578817',
    attributes: Object.assign({
      competitionID: 89,
      kickOffDateUTC: '2026-08-08 15:00:00',
      matchPeriod: 'PreMatch',
      matchMinutes: null,
      formattedMatchTime: null,
      homeTeam: { teamID: 't434', name: 'Aldershot Town', shortName: 'Aldershot', crest: 'https://x/1.png', score: null, halfScore: null, penaltyScore: null },
      awayTeam: { teamID: 't2479', name: 'Boreham Wood', shortName: 'Boreham Wd', crest: 'https://x/2.png', score: null, halfScore: null, penaltyScore: null },
    }, over),
  };
}

function player(id, n, pos = 'Defender') {
  return { playerID: id, shirtNumber: n, playerPosition: pos, formationPlace: n,
    playerName: { playerID: id, firstName: 'A', lastName: 'Player' + n, knownName: 'Player ' + n } };
}

function xi(prefix, count = 11) {
  return Array.from({ length: count }, (_, i) => player(prefix + (i + 1), i + 1));
}

function detailMatch(over = {}) {
  const a = Object.assign({
    matchID: 'g2578817',
    competitionID: 89,
    seasonID: 2026,
    kickOffUTC: '2026-08-08 15:00:00',
    period: 'SecondHalf',
    matchMinutes: 67,
    formattedMatchTime: "67'",
    homeTeamID: 't434',
    venue: 'The EBB Stadium',
    venueCity: 'Aldershot',
    matchDetails: { attendance: 2431, refereeName: 'A Referee', resultType: 'NormalResult' },
    homeTeam: { teamID: 't434', teamName: 'Aldershot Town', crestURL: 'https://x/1.png' },
    awayTeam: { teamID: 't2479', teamName: 'Boreham Wood', crestURL: 'https://x/2.png' },
    matchTeams: [
      { teamID: 't434', score: 1, halfScore: 0, formation: '4231',
        players: { Start: xi('h'), Sub: [player('hs1', 12), player('hs2', 14)] },
        events: { goals: [], bookings: [], subs: [], shootout: [] } },
      { teamID: 't2479', score: 0, halfScore: 0, formation: '442',
        players: { Start: xi('a'), Sub: [player('as1', 12)] },
        events: { goals: [], bookings: [], subs: [], shootout: [] } },
    ],
  }, over);
  return { id: a.matchID, attributes: a };
}

function goalEvent(playerID, minute, formatted, type = 'Goal') {
  return {
    eventID: '291' + minute,
    eventMinute: minute,
    formattedEventTime: formatted,
    eventPeriod: 'SecondHalf',
    goalEvents: { playerID, goalType: type,
      player: { playerID, playerName: { knownName: 'Scorer ' + playerID } } },
  };
}

// ---------------------------------------------------------------------------
// transform — the quirks the spec says must be handled exactly once
// ---------------------------------------------------------------------------

test('matchPeriod is the master switch — a finished match publishes no minute', () => {
  const finished = T.shapeIndexRow(listMatch({
    matchPeriod: 'FullTime', matchMinutes: 95, formattedMatchTime: "90'+5",
    homeTeam: Object.assign(listMatch().attributes.homeTeam, { score: 2 }),
    awayTeam: Object.assign(listMatch().attributes.awayTeam, { score: 1 }),
  }), NOW);
  assert.equal(finished.finished, true);
  assert.equal(finished.live, false);
  assert.equal(finished.minute, null, 'a stuck 95 is what makes widgets show finished games as live');
  assert.equal(finished.formattedMinute, null);
});

test('a live match does publish its minute', () => {
  const live = T.shapeIndexRow(listMatch({
    matchPeriod: 'SecondHalf', matchMinutes: 67, formattedMatchTime: "67'",
  }), NOW);
  assert.equal(live.live, true);
  assert.equal(live.minute, 67);
  assert.equal(live.formattedMinute, "67'");
});

test('postponed and abandoned are dead periods, not live ones', () => {
  ['Postponed', 'Abandoned'].forEach((p) => {
    const row = T.shapeIndexRow(listMatch({ matchPeriod: p, matchMinutes: 12 }), NOW);
    assert.equal(row.live, false, p + ' must not read as live');
    assert.equal(row.minute, null);
  });
});

test('period casing never leaks — comparisons are lowercased', () => {
  assert.equal(T.isLive('SECONDHALF'), true);
  assert.equal(T.isFinished('FullTime'), true);
  assert.equal(T.isFinished('fulltime'), true);
});

test('dates without the T separator normalise to a real instant', () => {
  const d = T.normaliseUtc('2026-03-24 19:45:00');
  assert.equal(d.toISOString(), '2026-03-24T19:45:00.000Z');
  assert.equal(T.normaliseUtc(''), null);
  assert.equal(T.normaliseUtc('nonsense'), null);
});

test('list and detail disagree on field names; the shaped output does not', () => {
  const fromList = T.shapeIndexRow(listMatch(), NOW);
  const fromDetail = T.shapeDetail(detailMatch(), NOW);
  // list: matchPeriod / crest / kickOffDateUTC — detail: period / crestURL / kickOffUTC
  assert.equal(fromList.home.crest, 'https://x/1.png');
  assert.equal(fromDetail.home.crest, 'https://x/1.png');
  assert.equal(fromList.ko, '2026-08-08T15:00:00.000Z');
  assert.equal(fromDetail.ko, '2026-08-08T15:00:00.000Z');
  assert.equal(fromList.compKey, 'nl');
  assert.equal(fromDetail.compKey, 'nl');
});

test('formations are normalised, positions are not invented', () => {
  const d = T.shapeDetail(detailMatch(), NOW);
  assert.equal(d.home.formation, '4-2-3-1');
  assert.equal(d.away.formation, '4-4-2');
  // Coarse buckets are stored as they arrive — no left-back is fabricated.
  assert.equal(d.home.lineup.start[0].position, 'Defender');
});

test('detailAvailability is set per competition, not per match', () => {
  assert.equal(T.competitionOf(89).detailAvailability, 'full');
  assert.equal(T.competitionOf(373).detailAvailability, 'scores');
  assert.equal(T.competitionOf(372).detailAvailability, 'scores');
  // An unknown competition is dropped rather than guessed at.
  assert.equal(T.shapeIndexRow(listMatch({ competitionID: 999 }), NOW), null);
});

test('the signature moves on the four things that matter and nothing else', () => {
  const base = T.shapeIndexRow(listMatch({ matchPeriod: 'SecondHalf', matchMinutes: 60 }), NOW);
  const sameGame = T.shapeIndexRow(listMatch({ matchPeriod: 'SecondHalf', matchMinutes: 60 }), NOW + 60000);
  assert.equal(T.signatureOf(base), T.signatureOf(sameGame), 'a later poll of an unchanged match must not fire a detail fetch');

  const scored = T.shapeIndexRow(listMatch({
    matchPeriod: 'SecondHalf', matchMinutes: 61,
    homeTeam: Object.assign(listMatch().attributes.homeTeam, { score: 1 }),
  }), NOW);
  assert.notEqual(T.signatureOf(base), T.signatureOf(scored));
});

test('the pre-match signature does NOT move while team news arrives', () => {
  // This is the whole reason for the unconditional pre-match poll (spec §3).
  const before = T.shapeIndexRow(listMatch(), NOW);
  const after = T.shapeIndexRow(listMatch(), NOW + 30 * MIN);
  assert.equal(T.signatureOf(before), T.signatureOf(after));
});

test('lineupComplete needs an XI and a bench for both teams', () => {
  assert.equal(T.shapeDetail(detailMatch(), NOW).lineupComplete, true);

  const noBench = detailMatch();
  noBench.attributes.matchTeams[1].players.Sub = [];
  assert.equal(T.shapeDetail(noBench, NOW).lineupComplete, false);

  const shortXi = detailMatch();
  shortXi.attributes.matchTeams[0].players.Start = xi('h', 10);
  assert.equal(T.shapeDetail(shortXi, NOW).lineupComplete, false);
});

test('content hash ignores updatedAt, so an unchanged node is not rewritten', () => {
  const a = T.shapeIndexRow(listMatch(), NOW);
  const b = T.shapeIndexRow(listMatch(), NOW + 999999);
  assert.equal(T.contentHash(a), T.contentHash(b));
});

// ---------------------------------------------------------------------------
// events — the part that cannot be backfilled
// ---------------------------------------------------------------------------

const FIREBASE_ILLEGAL = /[.#$/\[\]'\s]/;

test('event keys never contain an illegal Firebase character', () => {
  const withGoals = detailMatch();
  // "45'+3" is the recurring trap: an apostrophe is an illegal key character.
  withGoals.attributes.matchTeams[0].events.goals = [
    goalEvent('p181294', 45, "45'+3"),
    goalEvent('p181295', 67, "67'", 'Penalty'),
  ];
  const curr = T.shapeDetail(withGoals, NOW);
  const all = E.diffDetail(null, curr, new Set()).created;
  all.forEach((e) => assert.ok(!FIREBASE_ILLEGAL.test(e.eventKey), 'illegal key: ' + e.eventKey));

  const created = all.filter((e) => e.type === 'goal');
  assert.equal(created.length, 2);
  created.forEach((e) => {
    assert.ok(!FIREBASE_ILLEGAL.test(e.eventKey), 'illegal key: ' + e.eventKey);
    assert.match(e.eventKey, /^g2578817_t434_goal_\d+$/);
  });
  // the formatted minute survives as a display string, just never as a key
  assert.equal(created[0].formattedMinute, "45'+3");
  assert.equal(created[1].isPenalty, true);
});

test('the seen guard stops a goal being processed twice across polls', () => {
  const withGoal = detailMatch();
  withGoal.attributes.matchTeams[0].events.goals = [goalEvent('p181294', 45, "45'")];
  const curr = T.shapeDetail(withGoal, NOW);

  const first = E.diffDetail(null, curr, new Set());
  assert.equal(first.created.filter((e) => e.type === 'goal').length, 1);

  // Same match, next poll — and this time with no `prev`, as after a restart.
  // Everything the first pass minted is in the guard, lineup events included.
  const seen = new Set(first.created.map((e) => e.eventKey));
  const second = E.diffDetail(null, curr, seen);
  assert.equal(second.created.length, 0, 'a restarted ingester must not replay the first half');
});

test('an entry that disappears is retracted, not deleted', () => {
  const withGoal = detailMatch();
  withGoal.attributes.matchTeams[0].events.goals = [goalEvent('p181294', 45, "45'")];
  const prev = T.shapeDetail(withGoal, NOW);
  const curr = T.shapeDetail(detailMatch(), NOW + MIN);   // official deleted it

  const { created, retracted } = E.diffDetail(prev, curr, new Set(['g2578817_t434_goal_0']));
  assert.equal(created.length, 0);
  assert.deepEqual(retracted, ['g2578817_t434_goal_0']);
});

test('a lineup completing is an event; a settled lineup does not re-fire', () => {
  const partial = detailMatch();
  partial.attributes.matchTeams[0].players.Sub = [];
  partial.attributes.matchTeams[1].players.Sub = [];
  const before = T.shapeDetail(partial, NOW);
  const after = T.shapeDetail(detailMatch(), NOW + MIN);

  const first = E.diffDetail(before, after, new Set());
  const lineups = first.created.filter((e) => e.type === 'lineup');
  assert.equal(lineups.length, 2, 'one per team');
  assert.equal(lineups[0].formation, '4-2-3-1');

  const again = E.diffDetail(after, after, new Set());
  assert.equal(again.created.filter((e) => e.type === 'lineup').length, 0);
});

test('a lineup that shrinks is a withdrawal, not an error to suppress', () => {
  const before = T.shapeDetail(detailMatch(), NOW);
  const pulled = detailMatch();
  pulled.attributes.matchTeams[0].players.Start = xi('h').filter((p) => p.playerID !== 'h7');
  const after = T.shapeDetail(pulled, NOW + MIN);

  const { created } = E.diffDetail(before, after, new Set());
  const w = created.filter((e) => e.type === 'withdrawal');
  assert.equal(w.length, 1);
  assert.equal(w[0].playerID, 'h7');
  assert.equal(w[0].eventKey, 'g2578817_t434_withdrawal_h7');
  assert.ok(!FIREBASE_ILLEGAL.test(w[0].eventKey));
});

test('every event carries the context a live blog needs without a join', () => {
  const withGoal = detailMatch();
  withGoal.attributes.matchTeams[0].events.goals = [goalEvent('p181294', 45, "45'")];
  const { created } = E.diffDetail(null, T.shapeDetail(withGoal, NOW), new Set());
  const e = created[0];
  assert.equal(e.homeTeam, 'Aldershot Town');
  assert.equal(e.awayTeam, 'Boreham Wood');
  assert.equal(e.homeScore, 1);
  assert.equal(e.compKey, 'nl');
  assert.equal(e.matchID, 'g2578817');
});

// ---------------------------------------------------------------------------
// schedule — cadence derived from fixtures, never hardcoded
// ---------------------------------------------------------------------------

function row(over = {}) {
  return Object.assign({
    id: 'g1', ko: '2026-08-08T15:00:00Z', period: 'prematch',
    detailAvailability: 'full', lineupComplete: false,
    home: { score: null }, away: { score: null }, minute: null,
  }, over);
}

test('no fixtures today means hourly and nothing to fetch', () => {
  const plan = S.derivePlan([], NOW);
  assert.equal(plan.mode, 'idle');
  assert.equal(plan.intervalSec, 3600);
  assert.deepEqual(plan.targets, []);
});

test('more than 75 minutes before kick-off is still hourly', () => {
  const t = Date.parse('2026-08-08T13:30:00Z');   // 90 min out
  const plan = S.derivePlan([row()], t);
  assert.equal(plan.mode, 'idle');
  assert.equal(plan.intervalSec, 3600);
});

test('inside 75 minutes with an incomplete lineup polls detail unconditionally', () => {
  const t = Date.parse('2026-08-08T14:00:00Z');   // 60 min out
  const plan = S.derivePlan([row()], t);
  assert.equal(plan.mode, 'prematch');
  assert.equal(plan.intervalSec, 120);
  assert.equal(plan.targets[0].mode, 'unconditional', 'the signature cannot move here');
});

test('a complete lineup drops back to the 5-minute confirmation poll', () => {
  const t = Date.parse('2026-08-08T14:00:00Z');
  const plan = S.derivePlan([row({ lineupComplete: true })], t);
  assert.equal(plan.intervalSec, 300);
  assert.equal(plan.targets[0].mode, 'unconditional', 'late changes still need catching');
});

test('North and South are capped on detailAvailability, not left polling forever', () => {
  const t = Date.parse('2026-08-08T14:00:00Z');
  // Tier 7: no pre-match lineups exist, so completeness would never satisfy.
  const plan = S.derivePlan([row({ detailAvailability: 'scores' })], t);
  assert.equal(plan.intervalSec, 300, 'must not sit at 2 minutes for the whole window');
});

test('a match in play runs at 60s on signature change', () => {
  const t = Date.parse('2026-08-08T15:30:00Z');
  const plan = S.derivePlan([row({ period: 'secondhalf' })], t);
  assert.equal(plan.mode, 'live');
  assert.equal(plan.intervalSec, 60);
  assert.equal(plan.liveCount, 1);
  assert.equal(plan.targets[0].mode, 'onChange');
});

test('the trailing 20 minutes after the whistle still runs, then stops', () => {
  const ft = row({ period: 'fulltime' });
  const inCooldown = S.derivePlan([ft], Date.parse('2026-08-08T16:55:00Z'));
  assert.equal(inCooldown.intervalSec, 60, 'officials add cards after the whistle');
  assert.equal(inCooldown.mode, 'cooldown');

  const after = S.derivePlan([ft], Date.parse('2026-08-08T18:30:00Z'));
  assert.equal(after.intervalSec, 3600);
  assert.deepEqual(after.targets, []);
});

test('the minute tick is a no-op outside the window and never on a stale day', () => {
  const ymd = '2026-08-08';
  const kickoffs = [Date.parse('2026-08-08T15:00:00Z')];

  const quiet = S.shouldRun(
    { ymd, kickoffs, lastRun: NOW - 5 * MIN, intervalSec: 3600, mode: 'idle' },
    Date.parse('2026-08-08T09:00:00Z'), ymd);
  assert.equal(quiet.run, false);
  assert.equal(quiet.reason, 'outside-match-window');

  // Yesterday's cache must never be able to keep the ingester asleep.
  const rolled = S.shouldRun({ ymd: '2026-08-07', kickoffs, lastRun: NOW }, NOW, ymd);
  assert.equal(rolled.run, true);
  assert.equal(rolled.reason, 'new-day');

  // No snapshot at all is also a run.
  assert.equal(S.shouldRun(null, NOW, ymd).run, true);
});

test('inside the window the previous run sets the pace', () => {
  const ymd = '2026-08-08';
  const snap = { ymd, kickoffs: [Date.parse('2026-08-08T15:00:00Z')], mode: 'live', intervalSec: 60 };
  const t = Date.parse('2026-08-08T15:30:00Z');
  assert.equal(S.shouldRun(Object.assign({ lastRun: t - 30 * 1000 }, snap), t, ymd).run, false);
  assert.equal(S.shouldRun(Object.assign({ lastRun: t - 61 * 1000 }, snap), t, ymd).run, true);
});

test('the hourly baseline still fires on a day with no fixtures', () => {
  const ymd = '2026-08-08';
  const snap = { ymd, kickoffs: [], lastRun: NOW - 61 * MIN };
  assert.equal(S.shouldRun(snap, NOW, ymd).reason, 'hourly-baseline');
});

// ---------------------------------------------------------------------------
// derive — tables and scorers
// ---------------------------------------------------------------------------

function tableRow(teamID, team, pts, over = {}) {
  return Object.assign({
    teamID, team, pos: 1, startDayPos: 1, played: 10, won: 3, drawn: 1, lost: 6,
    goalsFor: 10, goalsAgainst: 15, goalDifference: -5, points: pts, form: null,
  }, over);
}

test('the official table is the base, so a points deduction survives the overlay', () => {
  // A club on 12 points with a 10-point deduction shows 2. Arithmetic over
  // results cannot reproduce that, which is why the base is fetched.
  const base = [
    tableRow('t434', 'Aldershot Town', 20, { pos: 1, goalDifference: 5, goalsFor: 15, goalsAgainst: 10 }),
    tableRow('t2479', 'Boreham Wood', 2, { pos: 2, goalDifference: -5 }),
  ];
  const live = [{ live: true, home: { id: 't434', score: 0 }, away: { id: 't2479', score: 1 } }];
  const { rows, applied } = D.applyLiveToTable(base, live);
  assert.equal(applied, 1);
  const wood = rows.find((r) => r.teamID === 't2479');
  assert.equal(wood.points, 5, '2 (deducted) + 3 for the win — the deduction is not recomputed away');
  assert.equal(wood.played, 11);
  assert.equal(rows.find((r) => r.teamID === 't434').points, 20);
});

test('a table with nothing in play is returned untouched', () => {
  const base = [tableRow('t434', 'Aldershot Town', 20)];
  const { rows, applied } = D.applyLiveToTable(base, [{ live: false, home: { id: 't434', score: 3 }, away: { id: 't2479', score: 0 } }]);
  assert.equal(applied, 0);
  assert.equal(rows[0].points, 20);
});

test('a cup tie across divisions cannot corrupt a league table', () => {
  const base = [tableRow('t434', 'Aldershot Town', 20)];
  const { applied } = D.applyLiveToTable(base, [{ live: true, home: { id: 't434', score: 1 }, away: { id: 't9999', score: 0 } }]);
  assert.equal(applied, 0, 'a team not in this table means the fixture is not this competition');
});

test('an uninitialised table reads as no table, not as an empty one', () => {
  assert.deepEqual(D.shapeTable([{ id: null, attributes: { teamName: null, position: null } }]), []);
  assert.deepEqual(D.shapeTable(null), []);
});

test('scorers are keyed on playerID and own goals are credited to nobody', () => {
  const events = [
    { type: 'goal', playerID: 'p1', playerName: 'A Striker', teamID: 't434', isPenalty: false, isOwnGoal: false },
    { type: 'goal', playerID: 'p1', playerName: 'A Striker', teamID: 't434', isPenalty: true, isOwnGoal: false },
    { type: 'goal', playerID: 'p2', playerName: 'A Defender', teamID: 't2479', isPenalty: false, isOwnGoal: true },
    { type: 'booking', playerID: 'p3' },
  ];
  const { scorers, added } = D.mergeScorers({}, events, NOW);
  assert.equal(added, 2);
  assert.equal(scorers.p1.goals, 2);
  assert.equal(scorers.p1.penalties, 1);
  assert.equal(scorers.p2, undefined, 'an own goal is not the scorer\'s');
});

test('a mid-season transfer shows as two teams, not a rewritten history', () => {
  const first = D.mergeScorers({}, [
    { type: 'goal', playerID: 'p1', playerName: 'A Striker', teamID: 't434' },
  ], NOW).scorers;
  const second = D.mergeScorers(first, [
    { type: 'goal', playerID: 'p1', playerName: 'A Striker', teamID: 't2479' },
  ], NOW).scorers;
  assert.equal(second.p1.goals, 2);
  assert.deepEqual(Object.keys(second.p1.teams).sort(), ['t2479', 't434']);
  assert.equal(second.p1.teams.t434.goals, 1);
});

test('the coverage gap is published rather than hidden', () => {
  const rows = [
    { finished: true, home: { score: 3 }, away: { score: 1 } },
    { finished: true, home: { score: 2 }, away: { score: 0 } },
    { finished: false, home: { score: 1 }, away: { score: 1 } },   // in play, not counted
  ];
  const cov = D.goalsUnaccounted(rows, 4);
  assert.equal(cov.goalsScored, 6);
  assert.equal(cov.goalsAccounted, 4);
  assert.equal(cov.goalsUnaccounted, 2, 'a table that silently under-reports is worse than one that admits the gap');

  // Never negative, even if own goals push the tally above the scoreline sum.
  assert.equal(D.goalsUnaccounted(rows, 99).goalsUnaccounted, 0);
});
