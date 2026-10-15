/* Website Archive performance feed - scripts/build-performance.js.
   Covers the publish-day rule (UK time), the join from article to GA paths,
   the 7-day window, and the settled/provisional split. The inputs are the
   two feeds this repo's own scripts write (articles-index.json from
   rebuild-index.js, ga-sources-archive.json from fetch-ga-sources.js), so
   the shapes here are ours, not a third party's. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ukDay, addDays, pathsFor, indexPaths, firstDays, build } = require('../scripts/build-performance.js');

test('ukDay uses UK time, across both clock settings', () => {
  assert.equal(ukDay('2026-09-02T23:30:00Z'), 20260903);       // BST: 00:30 next day
  assert.equal(ukDay('2026-01-15T23:30:00Z'), 20260115);       // GMT: still the 15th
  assert.equal(ukDay('2026-10-10T18:44:42+01:00'), 20261010);
  assert.equal(ukDay(''), null);
  assert.equal(ukDay('not a date'), null);
});

test('addDays crosses month and year ends', () => {
  assert.equal(addDays(20260928, 6), 20261004);
  assert.equal(addDays(20251229, 6), 20260104);
  assert.equal(addDays(20261013, -8), 20261005);
});

test('pathsFor sums legacy and modern paths sharing an article ID', () => {
  const daily = {
    '/statement-club-fc-83850': [],
    '/news/2025/july/25/statement-club-fc-83850': [],
    '/news/2026/october/10/awards-2026': [],
    '/news/2026/october/9/other-awards-2026': []
  };
  const byId = indexPaths(daily);
  assert.deepEqual(pathsFor('/news/2025/july/25/statement-club-fc-83850/', daily, byId).sort(),
    ['/news/2025/july/25/statement-club-fc-83850', '/statement-club-fc-83850']);
  // A year on the end is not an article ID: only the article's own path joins.
  assert.deepEqual(pathsFor('/news/2026/october/10/awards-2026/', daily, byId), ['/news/2026/october/10/awards-2026']);
  assert.deepEqual(pathsFor('/news/2026/october/1/nothing-here/', daily, byId), []);
});

test('firstDays counts the publish day onwards, by day and by channel', () => {
  const daily = { '/a': [[20260901, 0, 99], [20260902, 0, 10], [20260902, 1, 5], [20260908, 0, 3], [20260929, 0, 4], [20260930, 0, 50]] };
  const fw = firstDays(['/a'], daily, 20260902, 28);
  assert.equal(fw.v, 22);
  assert.equal(fw.d.length, 28);
  assert.deepEqual([fw.d[0], fw.d[6], fw.d[27]], [15, 3, 4]);
  assert.deepEqual(fw.s, { 0: 17, 1: 5 });
  assert.equal(firstDays(['/a'], daily, 20260902, 2).v, 15);
});

test('build counts complete days only, carries the age of young articles and skips pre-data ones', () => {
  const index = { articles: [
    { postID: 'old', postSlug: '/news/2024/october/1/old', publishedDateTime: '2024-10-01T10:00:00Z' },
    { postID: 'done', postSlug: '/news/2026/september/1/done', publishedDateTime: '2026-09-01T10:00:00Z' },
    { postID: 'young', postSlug: '/news/2026/october/9/young', publishedDateTime: '2026-10-09T10:00:00Z' },
    { postID: 'lost', postSlug: '/news/2026/august/1/lost', publishedDateTime: '2026-08-01T10:00:00Z' }
  ] };
  const sources = {
    firstSeenDate: '2024-11-08', endDate: '2026-10-13', channels: ['Direct'],
    daily: {
      '/news/2026/september/1/done': [[20260901, 0, 40], [20260928, 0, 2], [20260929, 0, 9]],
      '/news/2026/october/9/young': [[20261009, 0, 12], [20261012, 0, 3], [20261013, 0, 7]]
    }
  };
  const { feed, counts } = build(index, sources, new Date('2026-10-13T03:00:00Z'));
  assert.equal(feed.lastDay, '2026-10-12');
  assert.equal(feed.settledTo, '2026-09-29');
  assert.equal(feed.items.old, undefined);
  assert.equal(feed.items.done.v, 40);        // 28 and 29 September fall outside the 14 days
  assert.equal(feed.items.done.a, undefined);
  assert.equal(feed.items.done.d.length, 14);
  assert.equal(feed.items.young.a, 4);
  assert.equal(feed.items.young.v, 15);       // the run day's partial 7 views are not counted
  assert.equal(feed.items.lost.x, 1);
  assert.deepEqual(counts, { full: 1, young: 1, noData: 1, skipped: 1 });
});
