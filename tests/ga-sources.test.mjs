/* GA daily traffic sources - the pure parts of scripts/fetch-ga-sources.js.
   The GA4 call itself is not exercised; these cover how rows are kept,
   shaped, chunked and merged into the archive, which is where data could
   be lost. Row shape (dimensionValues[].value, metricValues[].value, all
   strings, date as YYYYMMDD) follows the GA4 Data API runReport response:
   https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/RunReportResponse
   and matches what scripts/fetch-ga-hourly.js already reads in production. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { monthChunks, rowsToDaily, mergeDaily, publishDay, keepRow } = require('../scripts/fetch-ga-sources.js');

const row = (p, d, ch, v) => ({ dimensionValues: [{ value: p }, { value: d }, { value: ch }], metricValues: [{ value: String(v) }] });
const A = '/news/2026/september/2/mascot-mayhem';

test('monthChunks splits on calendar months and stops at the end date', () => {
  assert.deepEqual(monthChunks('2026-02-01', '2026-04-10'), [
    ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-31'], ['2026-04-01', '2026-04-10']
  ]);
  assert.deepEqual(monthChunks('2026-10-01', '2026-10-15'), [['2026-10-01', '2026-10-15']]);
  assert.deepEqual(monthChunks('2026-09-20', '2026-10-03'), [['2026-09-20', '2026-09-30'], ['2026-10-01', '2026-10-03']]);
});

test('publishDay reads the date from a news URL', () => {
  assert.equal(publishDay('/news/2026/september/2/mascot-mayhem'), 20260902);
  assert.equal(publishDay('/news/2022/july/1/more-big-deals-71249'), 20220701);
  assert.equal(publishDay('/news/some-undated-slug'), null);
  assert.equal(publishDay('/fixtures'), null);
});

test('keepRow keeps news paths from the day before publish to 31 days after', () => {
  assert.equal(keepRow(A, 20260901), true);
  assert.equal(keepRow(A, 20260831), false);
  assert.equal(keepRow(A, 20261003), true);
  assert.equal(keepRow(A, 20261004), false);
  assert.equal(keepRow('/news/undated', 20240101), true);
  assert.equal(keepRow('/', 20260902), false);
  assert.equal(keepRow('/fixtures', 20260902), false);
});

test('keepRow keeps pre-migration /slug-12345 article paths whole', () => {
  assert.equal(keepRow('/national-league-statement-morecambe-fc-83850', 20250101), true);
  assert.equal(keepRow('/club/some-page-2', 20250101), false);
});

test('rowsToDaily normalises paths, sums collisions, drops non-news and grows the channel list', () => {
  const channels = ['Direct'];
  const { daily, other } = rowsToDaily([
    row(A + '/', '20260902', 'Organic Search', 10),
    row(A + '?utm=x', '20260902', 'Organic Search', 5),
    row(A, '20260902', 'Direct', 3),
    row(A, '20260903', 'Direct', 0),
    row(A, '20261201', 'Direct', 8),
    row('/tables', '20260902', 'Direct', 50),
    row('(other)', '20260902', 'Direct', 99)
  ], channels);
  assert.deepEqual(channels, ['Direct', 'Organic Search']);
  assert.deepEqual(daily, { [A]: [[20260902, 0, 3], [20260902, 1, 15]] });
  assert.equal(other, 99);
});

test('mergeDaily replaces the refreshed days for every path and keeps the rest', () => {
  const existing = {
    '/news/a': [[20260901, 0, 4], [20260910, 0, 7]],
    '/news/b': [[20260910, 1, 2]]
  };
  const fresh = { '/news/a': [[20260910, 0, 9]] };
  assert.deepEqual(mergeDaily(existing, fresh, 20260905, 20260915), {
    '/news/a': [[20260901, 0, 4], [20260910, 0, 9]]
  });
});

test('mergeDaily into an empty archive is the fresh data', () => {
  const fresh = { '/news/a': [[20260910, 0, 9]] };
  assert.deepEqual(mergeDaily({}, fresh, 20260901, 20260930), fresh);
});
