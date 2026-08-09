/**
 * Pins the fixture cache's shape — the contract, not the plumbing.
 *
 * This node is meant to become the League's own home for its match data, with
 * NLS as an upstream it syncs from rather than a dependency it cannot survive.
 * The upstream is expected to change: Stats Perform have agreed in principle
 * to a direct outlet key, and Opta SDAPI uses different field names throughout.
 *
 * So the thing worth testing is the BOUNDARY. toFeedFixture takes an
 * upstream-shaped record and returns a consumer-shaped one; everything to the
 * left of it is disposable and everything to the right is a contract. If an
 * upstream field name ever appears in the output, the swap stops being a
 * rewrite of one function and becomes a rewrite of every consumer — which is
 * the whole thing this design is trying to avoid.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const fc = createRequire(import.meta.url)('../scripts/build-feed-cache.js');

const NOW = new Date('2026-08-09T12:00:00Z');

const nls = (over = {}) => ({
  id: 'g2660046',
  attributes: Object.assign({
    kickOffDateUTC: '2026-08-08T14:00:00Z',
    competitionID: 89,
    matchPeriod: 'FullTime',
    homeTeam: { teamID: 101, name: 'Aldershot Town', score: 3 },
    awayTeam: { teamID: 102, name: 'Woking', score: 2 },
  }, over),
});

test('the record is consumer-shaped, carrying no upstream field names', () => {
  const f = fc.toFeedFixture(nls(), NOW);
  assert.deepEqual(Object.keys(f).sort(),
    ['away', 'comp', 'home', 'id', 'ko', 'lastUpdated', 'period', 'source'].sort());
  // The names the upstream uses must not survive the boundary. Each of these
  // is a field Opta SDAPI spells differently or not at all.
  const json = JSON.stringify(f);
  for (const upstream of ['kickOffDateUTC', 'competitionID', 'teamID',
                          'homeTeam', 'awayTeam', 'attributes']) {
    assert.ok(!json.includes(upstream), `${upstream} leaked through the boundary`);
  }
});

test('every record carries lastUpdated, so a consumer can judge staleness', () => {
  // Stale-and-rendering is the dangerous state. A consumer reads this and
  // decides for itself whether to fall back rather than show old data.
  const f = fc.toFeedFixture(nls(), NOW);
  assert.equal(f.lastUpdated, NOW.getTime());
  assert.equal(f.source, fc.SOURCE);
});

test('a fixture that cannot be filed is dropped, not half-written', () => {
  // A consumer reading a record is entitled to assume it is complete.
  assert.equal(fc.toFeedFixture(nls({ kickOffDateUTC: '' }), NOW), null);
  assert.equal(fc.toFeedFixture(nls({ homeTeam: null }), NOW), null);
  assert.equal(fc.toFeedFixture({ attributes: {} }, NOW), null);
  assert.equal(fc.toFeedFixture(null, NOW), null);
});

test('scores survive as numbers, and an unplayed match keeps null not zero', () => {
  // 0-0 and not-yet-played must stay distinguishable — every consumer in this
  // repo decides "has this settled" partly on that.
  const played = fc.toFeedFixture(nls(), NOW);
  assert.deepEqual([played.home.score, played.away.score], [3, 2]);

  const unplayed = fc.toFeedFixture(nls({
    matchPeriod: 'PreMatch',
    homeTeam: { teamID: 101, name: 'Aldershot Town', score: null },
    awayTeam: { teamID: 102, name: 'Woking', score: null },
  }), NOW);
  assert.deepEqual([unplayed.home.score, unplayed.away.score], [null, null]);

  const goalless = fc.toFeedFixture(nls({
    homeTeam: { teamID: 101, name: 'Aldershot Town', score: 0 },
    awayTeam: { teamID: 102, name: 'Woking', score: 0 },
  }), NOW);
  assert.deepEqual([goalless.home.score, goalless.away.score], [0, 0]);
});

test('team ids are strings, so RTDB keys and JSON agree', () => {
  // RTDB coerces numeric-looking keys and JS object keys are strings anyway;
  // pinning it here stops a consumer comparing 101 to '101' and losing.
  const f = fc.toFeedFixture(nls(), NOW);
  assert.equal(f.home.id, '101');
  assert.equal(typeof f.home.id, 'string');
});

test('fixtures are sliced per matchday, in Europe/London', () => {
  // Slices rather than one fat node: a client reads the twenty records it
  // needs, not the season's sixteen hundred. Right for bandwidth, and right
  // for a league-use-only licence.
  const { byDay, kept, skipped } = fc.toFeedShape([
    nls(),
    nls({ kickOffDateUTC: '2026-08-08T16:20:00Z' }),
    nls({ kickOffDateUTC: '2026-08-11T18:45:00Z' }),
  ].map((m, i) => Object.assign({}, m, { id: 'g' + i })), NOW);

  assert.deepEqual(Object.keys(byDay).sort(), ['2026-08-08', '2026-08-11']);
  assert.deepEqual(Object.keys(byDay['2026-08-08']).sort(), ['g0', 'g1']);
  assert.equal(kept, 3);
  assert.equal(skipped, 0);
});

test('the matchday is the London date, not the UTC one', () => {
  // 22:30Z in June is 23:30 that same evening in London, so it belongs to that
  // matchday. Read as UTC it would be filed a day late.
  const { byDay } = fc.toFeedShape([
    Object.assign(nls({ kickOffDateUTC: '2026-06-30T22:30:00Z' }), { id: 'late' }),
  ], NOW);
  assert.deepEqual(Object.keys(byDay), ['2026-06-30']);
});

test('unusable fixtures are counted, not silently dropped', () => {
  // A count that quietly shrinks is how a feed problem hides. The job logs
  // this, so a change in it is visible in the run output.
  const { kept, skipped } = fc.toFeedShape([
    nls(),
    Object.assign(nls({ kickOffDateUTC: '' }), { id: 'broken' }),
  ], NOW);
  assert.equal(kept, 1);
  assert.equal(skipped, 1);
});

test('season derives from the July boundary, matching every other consumer', () => {
  const on = (iso) => fc.deriveSeasonId(new Date(iso + 'T12:00:00Z'));
  assert.equal(on('2026-06-30'), 2025);
  assert.equal(on('2026-07-01'), 2026);
  assert.equal(on('2027-07-01'), 2027);
});

test('the kick-off fallback chain matches the production parser', () => {
  // build-leaderboard.js has been parsing this feed in production; its dateOf()
  // accepts five spellings. Accepting fewer here means the cache silently drops
  // fixtures the leaderboard still sees, which is the worst kind of divergence
  // — one where both jobs succeed. (I had dropped `kickoffDate`.)
  for (const field of ['kickOffDateUTC', 'kickoffDateUTC', 'kickOffDate', 'kickoffDate', 'date']) {
    const m = { id: 'x', attributes: {
      competitionID: 89, matchPeriod: 'FullTime',
      homeTeam: { teamID: 1, name: 'H', score: 1 },
      awayTeam: { teamID: 2, name: 'A', score: 0 },
      [field]: '2026-08-08T14:00:00Z',
    } };
    assert.ok(fc.toFeedFixture(m, NOW), `${field} was not accepted`);
  }
});
