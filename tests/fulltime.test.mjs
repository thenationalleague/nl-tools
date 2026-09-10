/* FA Full-Time ingester — the parsers, pinned against pages saved from the
   live site on 10/09/2026 (tests/fixtures/fulltime/, source URL in each file's
   first line). No stub here was written from memory: every expected value
   below is read off those pages. When the FA restyle Full-Time this is the
   file that goes red, ahead of any graphic. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const require = createRequire(import.meta.url);
const P = require('../functions/fulltime/parse.js');
const FX = (n) => readFileSync(join(REPO, 'tests/fixtures/fulltime', n), 'utf8');

test('table: 13 rows, overall columns, adjustment flag', () => {
  const rows = P.parseTable(FX('table.html'));
  assert.equal(rows.length, 13);
  assert.deepEqual(rows[0], { pos: '1', team: 'FC Halifax Town U19', p: '2', w: '2', d: '0', l: '0', f: '8', a: '1', gd: '7', pts: '6', adj: false });
  const hpool = rows[5];
  assert.equal(hpool.team, 'Hartlepool United FC U19 Hartlepool Unit');
  assert.equal(hpool.pts, '3');
  assert.equal(hpool.adj, true, '"3 *" marks a points adjustment');
  assert.equal(rows[12].gd, '-12');
  assert.equal(rows.filter((r) => r.adj).length, 1);
});

test('results: one row per fixture block, most recent first, scores split', () => {
  const rows = P.parseResults(FX('results.html'));
  assert.equal(rows.length, 10, '11 blocks on the page; the postponed one prints "P - P" and is not a result');
  assert.ok(!rows.some((r) => r.id === '30137217'), 'postponed Chester v Gateshead is left out');
  assert.deepEqual(rows[0], { id: '30137225', date: '2026-09-09', time: '14:00',
    home: 'Morecambe FC U19 Morecambe FC U19', hs: '2', as: '9',
    away: 'AFC Fylde U19 National League North', comp: 'NLFA North Division' });
  for (const r of rows) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.hs + '-' + r.as, /^\d+-\d+$/);
  }
});

test('fixtures: 25 rows, venue and status carried, postponed flagged', () => {
  const rows = P.parseFixtures(FX('fixtures.html'));
  assert.equal(rows.length, 25);
  assert.deepEqual(rows[0], { id: '30137217', date: '2026-09-02', time: '13:00',
    home: 'Chester FC U19 Scholars', away: 'Gateshead FC U19 Academy North',
    venue: 'KING GEORGE V SPORTS HUB', comp: 'NLFA North Division', status: 'Postponed' });
  assert.equal(rows.filter((r) => r.status === 'Postponed').length, 1);
  assert.ok(rows.every((r) => r.home && r.away && r.date));
});

test('a page without the block parses to nothing, not a throw', () => {
  assert.deepEqual(P.parseTable('<html><body>Sorry</body></html>'), []);
  assert.deepEqual(P.parseResults(''), []);
  assert.deepEqual(P.parseFixtures('<table><tr><td>x</td></tr></table>'), []);
});

test('isoDate: Full-Time prints two-digit years', () => {
  assert.equal(P.isoDate('09/09/26'), '2026-09-09');
  assert.equal(P.isoDate('25/12/2026'), '2026-12-25');
  assert.equal(P.isoDate('bad'), '');
});

test('urls: 100-row paged form first, plain page second, table unpaged', () => {
  const u = P.urlsFor('results', '355815748');
  assert.equal(u.length, 2);
  assert.match(u[0], /^https:\/\/fulltime\.thefa\.com\/results\/1\/100\.html\?selectedSeason=395289686&/);
  assert.match(u[1], /^https:\/\/fulltime\.thefa\.com\/results\.html\?/);
  assert.ok(u.every((x) => x.includes('selectedDivision=355815748')));
  assert.equal(P.urlsFor('table', '1').length, 1);
});

test('fetchKind falls back to the plain page when the paged path is refused', async () => {
  const hits = [];
  const get = async (url) => { hits.push(url); return url.includes('/1/100.html') ? null : FX('results.html'); };
  const rows = await P.fetchKind('results', '355815748', get);
  assert.equal(rows.length, 10);
  assert.equal(hits.length, 2);
  const none = await P.fetchKind('results', '355815748', async () => null);
  assert.equal(none, null, 'nothing fetched reports null so the stored copy is kept');
});

test('division IDs agree with the tool', () => {
  const app = readFileSync(join(REPO, 'graphics/academy-alliance/app.js'), 'utf8');
  const inTool = [...app.matchAll(/\{ key: "([a-z-]+)", ft: "(\d+)"/g)].map((m) => [m[1], m[2]]);
  assert.equal(inTool.length, 11);
  assert.deepEqual(P.DIVISIONS.map((d) => [d.key, d.ft]), inTool);
  assert.match(app, new RegExp('FULLTIME_SEASON = "' + P.SEASON + '"'));
});
