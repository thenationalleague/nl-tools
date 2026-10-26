/**
 * efl-players.test.mjs — EFL player rows (functions/efl/backfill.js,
 * functions/efl/feed.js, and the optional competitions map in
 * functions/nls/transform.js).
 *
 * WHERE THE SHAPES COME FROM. The EFL feed is another deployment of the NLS
 * codebase. Every field these raw fixtures carry was read off live EFL
 * responses by a GitHub Actions probe on 26/10/2026 (thenationalleague/
 * efl-mcp, branch claude/probe-player-ids, results read back as check-run
 * annotations): list rows carry competitionID, kickOffDateUTC "YYYY-MM-DD
 * HH:MM:SS", matchPeriod and homeTeam/awayTeam {teamID,name,score}; detail
 * carries matchID, competitionID, seasonID, kickOffUTC, period, homeTeamID,
 * matchDetails.resultType and matchTeams[] with players.Start/Sub and
 * events.goals/subs/bookings using goalEvents / substitutionEvents
 * (subOnID, subOffID) / bookingEvents (card, cardType). Penalty-decided cup
 * ties were seen with resultType "PenaltyShootout", an empty extraScore and
 * no extra-time event period.
 *
 * Every player and club here is synthetic. This repository is public.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const require = createRequire(import.meta.url);
const T = require('../functions/nls/transform.js');
const EF = require('../functions/efl/feed.js');
const B = require('../functions/efl/backfill.js');

const NOW = Date.parse('2026-10-26T12:00:00Z');
const TODAY = '2026-10-26';

function player(id, n) {
  return { playerID: id, shirtNumber: n, playerPosition: 'Defender', formationPlace: n,
    playerName: { playerID: id, firstName: 'Synthetic', lastName: id, knownName: null } };
}
const xi = (p) => Array.from({ length: 11 }, (_, i) => player(p + (i + 1), i + 1));

function detail(id, { comp = 12, ko = '2026-10-24 14:00:00', resultType = 'NormalResult',
  extraScore = null, homeStart = xi('h' + id + '_'), subs = [] } = {}) {
  return { id, attributes: {
    matchID: id, competitionID: comp, seasonID: 2026, kickOffUTC: ko, period: 'FullTime',
    homeTeamID: 't1', matchDetails: { resultType },
    homeTeam: { teamID: 't1', teamName: 'Synthetic Town' },
    awayTeam: { teamID: 't2', teamName: 'Example Rovers' },
    matchTeams: [
      { teamID: 't1', score: 1, halfScore: 0, extraScore, penaltyScore: resultType === 'PenaltyShootout' ? 4 : null,
        players: { Start: homeStart, Sub: [player('hs' + id, 12)] },
        events: { goals: [], bookings: [], subs, shootout: [] } },
      { teamID: 't2', score: 1, halfScore: 1, extraScore, penaltyScore: resultType === 'PenaltyShootout' ? 3 : null,
        players: { Start: xi('a' + id + '_'), Sub: [player('as' + id, 12)] },
        events: { goals: [], bookings: [], subs: [], shootout: [] } },
    ],
  } };
}

function listRow(id, comp, ko, period = 'FullTime') {
  return { id, attributes: { competitionID: comp, kickOffDateUTC: ko, matchPeriod: period,
    homeTeam: { teamID: 't1', name: 'Synthetic Town', score: 1 },
    awayTeam: { teamID: 't2', name: 'Example Rovers', score: 1 } } };
}

/* In-memory stand-in for the efl/ subtree: read(path) and update({path:v})
   with RTDB's multi-path semantics (null deletes). */
function memoryStore() {
  const tree = {};
  const parts = (p) => p.split('/').filter(Boolean);
  return {
    tree,
    async read(path) {
      let n = tree;
      for (const k of parts(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
      return n === undefined ? null : JSON.parse(JSON.stringify(n));
    },
    async update(updates) {
      for (const [path, v] of Object.entries(updates)) {
        assert.notEqual(v, undefined, 'RTDB rejects undefined at ' + path);
        const ks = parts(path);
        let n = tree;
        ks.slice(0, -1).forEach((k) => { if (typeof n[k] !== 'object' || n[k] == null) n[k] = {}; n = n[k]; });
        if (v === null) delete n[ks[ks.length - 1]];
        else n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
      }
    },
  };
}

function fakeFeed(lists, details) {
  const calls = { list: 0, detail: 0 };
  return {
    calls,
    async fetchSeasonList(compId) { calls.list += 1; return lists[compId] || []; },
    async fetchDetail(id) {
      calls.detail += 1;
      if (!details[id]) throw new Error('no detail ' + id);
      return details[id].data || details[id];
    },
  };
}

/* ── transform: the optional competitions map ─────────────────────────── */

test('NLS shaping is unchanged when no competitions map is passed', () => {
  const nlsList = { id: 'g1', attributes: { competitionID: 89, kickOffDateUTC: '2026-10-24 14:00:00',
    matchPeriod: 'FullTime', homeTeam: { teamID: 't1', name: 'A' }, awayTeam: { teamID: 't2', name: 'B' } } };
  const row = T.shapeIndexRow(nlsList, NOW);
  assert.equal(row.compKey, 'nl');
  assert.equal(row.source, 'nls');
  assert.equal(T.shapeIndexRow(listRow('g2', 12, '2026-10-24 14:00:00'), NOW), null,
    'an EFL competition ID is unknown to the NLS map');
});

test('the EFL map shapes EFL rows and tags them efl', () => {
  const row = T.shapeIndexRow(listRow('g2', 12, '2026-10-24 14:00:00'), NOW, EF.COMPETITIONS);
  assert.equal(row.compKey, 'league_two');
  assert.equal(row.source, 'efl');
  const d = T.shapeDetail(detail('g3'), NOW, EF.COMPETITIONS);
  assert.equal(d.compKey, 'league_two');
  assert.equal(d.source, 'efl');
  assert.equal(d.season, 2026);
  assert.equal(T.shapeIndexRow(listRow('g4', 89, '2026-10-24 14:00:00'), NOW, EF.COMPETITIONS), null,
    'an NLS competition ID is unknown to the EFL map');
});

test('the EFL competition map covers the five competitions with MCP keys', () => {
  assert.deepEqual(EF.COMP_IDS.sort((a, b) => a - b), [2, 7, 10, 11, 12]);
  assert.deepEqual(Object.values(EF.COMPETITIONS).map((c) => c.key).sort(),
    ['carabao', 'championship', 'league_one', 'league_two', 'trophy']);
});

/* ── rows ──────────────────────────────────────────────────────────────── */

test('rows have the NLS shape with source efl', () => {
  const built = B.buildRows(T.shapeDetail(detail('g10'), NOW, EF.COMPETITIONS), NOW);
  const r = built.rows.hg10_1;
  assert.equal(r.source, 'efl');
  assert.equal(r.role, 'start');
  assert.equal(r.minutes, 90);
  assert.equal(r.compKey, 'league_two');
  assert.equal(r.result, 'D');
  assert.equal(built.rows.hsg10.role, 'unused');
  assert.equal(built.complete, true);
});

test('a cup tie straight to penalties is a 90-minute match', () => {
  const d = T.shapeDetail(detail('g11', { comp: 7, resultType: 'PenaltyShootout' }), NOW, EF.COMPETITIONS);
  assert.equal(B.straightToPenalties(d), true);
  assert.equal(B.buildRows(d, NOW).rows.hg11_1.minutes, 90);
});

test('a tie that went to extra time keeps 120 minutes', () => {
  const d = T.shapeDetail(detail('g12', { comp: 2, resultType: 'PenaltyShootout', extraScore: 1 }), NOW, EF.COMPETITIONS);
  assert.equal(B.straightToPenalties(d), false);
  assert.equal(B.buildRows(d, NOW).rows.hg12_1.minutes, 120);
});

/* ── planning ──────────────────────────────────────────────────────────── */

test('season boundary: June belongs to the next season', () => {
  assert.equal(B.seasonOf(Date.parse('2026-10-26T00:00:00Z')), 2026);
  assert.equal(B.seasonOf(Date.parse('2027-05-25T00:00:00Z')), 2026);
  assert.equal(B.seasonOf(Date.parse('2027-06-01T00:00:00Z')), 2027);
});

test('days are grouped by UTC date, unsettled past matches counted', () => {
  const days = B.groupByDay([
    listRow('a', 12, '2026-10-24 14:00:00'),
    listRow('b', 12, '2026-10-24 19:45:00', 'PreMatch'),
    listRow('c', 12, '2026-10-24 15:00:00', 'Postponed'),
    listRow('d', 12, '2026-10-25 12:30:00'),
  ], NOW);
  assert.deepEqual(Object.keys(days).sort(), ['2026-10-24', '2026-10-25']);
  assert.equal(days['2026-10-24'].finished.length, 1);
  assert.equal(days['2026-10-24'].unsettled, 1, 'postponed does not hold a day open');
});

test('plan is oldest first across competitions and skips today and done days', () => {
  const plan = B.planDays({
    league_two: { '2026-10-24': {}, '2026-10-26': {}, '2026-08-15': {} },
    championship: { '2026-08-14': {}, '2026-10-21': {} },
  }, { league_two: { '2026-08-15': true } }, TODAY);
  assert.deepEqual(plan.map((p) => p.key + '/' + p.ymd),
    ['championship/2026-08-14', 'championship/2026-10-21', 'league_two/2026-10-24']);
});

/* ── the run ───────────────────────────────────────────────────────────── */

test('a run builds rows, closes complete days and records pending', async () => {
  const store = memoryStore();
  const feed = fakeFeed(
    { 12: [listRow('g20', 12, '2026-10-24 14:00:00'), listRow('g21', 12, '2026-10-25 14:00:00'),
           listRow('g22', 12, '2026-10-26 14:00:00')] },
    { g20: detail('g20'), g21: detail('g21', { ko: '2026-10-25 14:00:00' }) });
  const s = await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(s.matchesWritten, 2);
  assert.equal(s.errorCount, 0);
  assert.equal(s.caughtUp, true);
  assert.equal(feed.calls.list, 5, 'one season list per competition');
  assert.equal(feed.calls.detail, 2, "today's match is never fetched");
  const t = store.tree.players[2026];
  assert.equal(t.apps.hg20_1.g20.source, 'efl');
  assert.equal(t.squads.t1.hg20_1, 'Synthetic hg20_1');
  assert.equal(t.matches.g20.complete, true);
  assert.equal(store.tree.meta['player-backfill'].league_two.days['2026-10-24'], true);
  assert.equal(store.tree.meta['player-backfill'].league_two.pending, 0);
  assert.equal(store.tree.meta.players.lastSuccess, NOW);

  /* A second run has nothing to do and fetches no detail. */
  await B.runBackfill({ store, feed, now: NOW + 3600e3, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(feed.calls.detail, 2);
});

test('an incomplete team sheet keeps its day open, then retries after six hours', async () => {
  const store = memoryStore();
  const short = detail('g30', { homeStart: xi('h30_').slice(0, 9) });
  const feed = fakeFeed({ 12: [listRow('g30', 12, '2026-10-24 14:00:00')] }, { g30: short });
  await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(store.tree.meta['player-backfill'].league_two.days, undefined);
  assert.equal(store.tree.meta['player-backfill'].league_two.pending, 1);

  await B.runBackfill({ store, feed, now: NOW + 3600e3, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(feed.calls.detail, 1, 'not retried within six hours');

  await B.runBackfill({ store, feed, now: NOW + B.RETRY_MS, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(feed.calls.detail, 2, 'retried after six hours');
  assert.equal(store.tree.players[2026].matches.g30.attempts, 2);
});

test('a corrected team sheet removes the dropped player', async () => {
  const store = memoryStore();
  const ten = xi('h40_').slice(0, 10);
  const feed = fakeFeed({ 12: [listRow('g40', 12, '2026-10-24 14:00:00')] },
    { g40: detail('g40', { homeStart: [...ten, player('wrong', 11)] }) });
  await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026 });
  assert.ok(store.tree.players[2026].apps.wrong.g40);
  /* Mark incomplete so it is due again, then serve the corrected sheet. */
  store.tree.players[2026].matches.g40.complete = false;
  delete store.tree.meta['player-backfill'].league_two.days;
  feed.fetchDetail = async () => detail('g40', { homeStart: [...ten, player('h40_11', 11)] });
  await B.runBackfill({ store, feed, now: NOW + B.RETRY_MS, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(await store.read('players/2026/apps/wrong/g40'), null);
  assert.ok(store.tree.players[2026].apps.h40_11.g40);
});

test('a failing fetch never closes its day, and the error is counted', async () => {
  const store = memoryStore();
  const feed = fakeFeed({ 12: [listRow('g50', 12, '2026-10-24 14:00:00')] }, {});
  const s = await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(s.errorCount, 1);
  assert.equal(store.tree.meta['player-backfill'].league_two.days, undefined);
  assert.equal(store.tree.meta.players.lastSuccess, undefined, 'no success recorded');
});

test('a failing fetch on a week-old day still does not close it', async () => {
  const store = memoryStore();
  const feed = fakeFeed({ 12: [listRow('g55', 12, '2026-09-01 14:00:00')] }, {});
  await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(await store.read('meta/player-backfill/league_two/days/2026-09-01'), null);
});

test('a failed run leaves the previous lastSuccess in place', async () => {
  const store = memoryStore();
  await store.update({ 'meta/players/lastSuccess': 123 });
  const feed = fakeFeed({}, {});
  feed.fetchSeasonList = async () => { throw new Error('upstream HTTP 503'); };
  const s = await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(s.listErrors.length, 5);
  assert.equal(store.tree.meta.players.lastSuccess, 123);
  assert.equal(store.tree.meta.players.caughtUp, false);
});

test('an old day is closed even with an incomplete sheet', async () => {
  const store = memoryStore();
  const feed = fakeFeed({ 12: [listRow('g60', 12, '2026-09-01 14:00:00')] },
    { g60: detail('g60', { ko: '2026-09-01 14:00:00', homeStart: xi('h60_').slice(0, 9) }) });
  await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026 });
  assert.equal(store.tree.meta['player-backfill'].league_two.days['2026-09-01'], true);
});

test('the run stops at the per-run match budget and resumes oldest first', async () => {
  const store = memoryStore();
  const list = [];
  const details = {};
  for (let i = 0; i < 40; i++) {
    const day = String(1 + Math.floor(i / 10)).padStart(2, '0');
    const ko = '2026-09-' + day + ' 14:00:00';
    list.push(listRow('m' + i, 12, ko));
    details['m' + i] = detail('m' + i, { ko });
  }
  const feed = fakeFeed({ 12: list }, details);
  const realMax = B.MATCHES_PER_RUN;
  assert.ok(realMax >= 100, 'budget sized for ~1,900 matches inside a day');
  const s = await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026,
    clock: (() => { let t = 0; return () => (t += 1); })() });
  assert.equal(s.matchesWritten, 40);
  assert.equal(s.caughtUp, true);
});

test('the time budget stops a run before the function timeout', async () => {
  const store = memoryStore();
  const list = ['2026-09-01', '2026-09-02', '2026-09-03'].map((d, i) => listRow('t' + i, 12, d + ' 14:00:00'));
  const details = Object.fromEntries(list.map((r, i) => ['t' + i, detail('t' + i, { ko: r.attributes.kickOffDateUTC })]));
  const feed = fakeFeed({ 12: list }, details);
  let t = 0;
  /* Every clock read advances 120 s, so the second day starts out of time. */
  const s = await B.runBackfill({ store, feed, now: NOW, todayYmd: TODAY, seasonID: 2026,
    clock: () => (t += 120e3) });
  assert.ok(s.matchesWritten < 3);
  assert.equal(s.caughtUp, false);
  assert.ok(B.TIME_BUDGET_MS < 300e3, 'inside the 300 s function timeout');
});

/* ── wiring ────────────────────────────────────────────────────────────── */

test('the scheduled function is hourly, europe-west2, the shared service account, exported', async () => {
  const Module = require('node:module');
  const realResolve = Module._resolveFilename;
  let opts = null;
  const FAKES = {
    'firebase-functions/v2/scheduler': { onSchedule: (o, fn) => { opts = o; return fn; } },
    'firebase-functions/v2': { logger: { info() {}, warn() {}, error() {} } },
    'firebase-admin': { database: () => { throw new Error('not used in tests'); } },
  };
  Module._resolveFilename = function (request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(FAKES, request)) return request;
    return realResolve.call(this, request, ...rest);
  };
  for (const [id, exp] of Object.entries(FAKES)) require.cache[id] = { id, filename: id, loaded: true, exports: exp };
  try {
    const mod = require(join(REPO, 'functions/efl-players.js'));
    assert.equal(typeof mod.eflPlayersHourly, 'function');
    assert.equal(opts.schedule, 'every 1 hours');
    assert.equal(opts.region, 'europe-west2');
    assert.equal(opts.timeoutSeconds, 300);
    assert.equal(opts.serviceAccount, 'firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com');
  } finally {
    Module._resolveFilename = realResolve;
  }
  const { readFileSync } = await import('node:fs');
  const index = readFileSync(join(REPO, 'functions/index.js'), 'utf8');
  assert.match(index, /require\("\.\/efl-players"\)/);
});

test('EFL rows are never written to the fan-facing database', async () => {
  const { readFileSync } = await import('node:fs');
  const src = ['functions/efl-players.js', 'functions/efl/backfill.js', 'functions/efl/feed.js']
    .map((f) => readFileSync(join(REPO, f), 'utf8')).join('\n');
  assert.doesNotMatch(src, /nl-widgets-default-rtdb/);
  assert.doesNotMatch(src, /initializeApp\(/, 'uses the default nl-tools app only');
});
