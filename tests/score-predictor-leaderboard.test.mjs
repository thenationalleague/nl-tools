/**
 * The widget's half of the leaderboard switch.
 *
 * scripts/build-leaderboard.js writes the standings; these functions read
 * them. tests/leaderboard.test.mjs covers the writer, this covers the reader —
 * in particular that a fan is matched to their own row by hash rather than by
 * id, which is the property that lets the raw trees stay locked.
 *
 * Functions are pulled out of the BUILT bundle, so a change to the HTML that
 * does not make it into embeds/score-predictor.js is caught here too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'embeds/score-predictor.js'), 'utf8');

function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

function build(state, tally) {
  const ctx = {
    state,
    simNow: () => new Date('2026-08-02T18:00:00Z'),
    myTally: () => tally || { results: 0, exacts: 0, settled: 0 },
  };
  return new Function('ctx', 'with (ctx) {' +
    extract('visibleRows') + '\n' + extract('isMyRow') +
    '\n return {visibleRows, isMyRow}; }')(ctx);
}

const ME = { forename: 'Rich', surnameInitial: 'H', teamId: '10', teamName: 'Yeovil', crestUrl: 'y.png' };
const ROWS = [
  { n: 'Anna B', c: 'a.png', t: '20', tn: 'Aldershot', r: 9, e: 3, s: 12, h: 'aaaaaaaaaaaa' },
  { n: 'Rich H', c: 'y.png', t: '10', tn: 'Yeovil', r: 7, e: 2, s: 12, h: 'myhash123456' },
  { n: 'Cara D', c: 'y.png', t: '10', tn: 'Yeovil', r: 7, e: 1, s: 12, h: 'cccccccccccc' },
];

test('rows keep the widget order: results, then exacts, then name', () => {
  const t = build({ lbRows: ROWS, registration: ME, myHash: 'myhash123456', lbMine: false });
  assert.deepEqual(t.visibleRows().map((r) => r.n), ['Anna B', 'Rich H', 'Cara D']);
});

test('our own row is found by hash, never by an id', () => {
  const t = build({ lbRows: ROWS, registration: ME, myHash: 'myhash123456', lbMine: false });
  assert.deepEqual(t.visibleRows().filter((r) => t.isMyRow(r)).map((r) => r.n), ['Rich H']);
});

test('my-club filter shows my club and never browses another', () => {
  const m = build({ lbRows: ROWS, registration: ME, myHash: 'myhash123456', lbMine: true });
  assert.deepEqual(m.visibleRows().map((r) => r.n), ['Rich H', 'Cara D']);
  assert.equal(m.visibleRows().every((r) => r.t === '10'), true);
});

test('a fan the aggregate has not caught up with still sees their own row', () => {
  const n = build({ lbRows: ROWS, registration: ME, myHash: 'notinthere00', lbMine: false },
                   { results: 1, exacts: 0, settled: 2 });
  assert.equal(n.visibleRows().length, 4);
  assert.equal(n.visibleRows().filter((r) => n.isMyRow(r)).length, 1);
  assert.equal(n.visibleRows().find((r) => n.isMyRow(r)).s, 2);
});

test('no duplicate when the club filter hides us from our own view', () => {
  // The trap: testing the FILTERED rows for our own hash rather than the full
  // aggregate would decide we are missing and add a second copy.
  const other = Object.assign({}, ME, { teamId: '99', teamName: 'Woking' });
  const d = build({ lbRows: ROWS, registration: other, myHash: 'myhash123456', lbMine: true });
  assert.equal(d.visibleRows().length, 0);
});

test('an empty aggregate still shows the signed-in fan', () => {
  const e = build({ lbRows: [], registration: ME, myHash: 'myhash123456', lbMine: false });
  assert.deepEqual(e.visibleRows().map((r) => r.n), ['Rich H']);
});

test('nothing is synthesised for someone who has not registered', () => {
  const u = build({ lbRows: ROWS, registration: null, myHash: 'myhash123456', lbMine: false });
  assert.equal(u.visibleRows().length, 3);
});

test('still loading renders nothing rather than throwing', () => {
  const l = build({ lbRows: null, registration: null, myHash: null, lbMine: false });
  assert.equal(l.visibleRows().length, 0);
});

test('THE INVARIANT: no row field could carry a person\'s id', () => {
  const t = build({ lbRows: ROWS, registration: ME, myHash: 'myhash123456', lbMine: false });
  const keys = new Set();
  t.visibleRows().forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  assert.deepEqual([...keys].sort(), ['c', 'e', 'h', 'n', 'r', 's', 't', 'tn']);
});
