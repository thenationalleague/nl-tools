/* functions/usage-rollup.js — the nightly count of tool opens that /data/ reads.

   What is worth testing here is the counting, not the plumbing. Two things
   can go wrong quietly and both would make the dashboard confidently wrong:

   1. A tool's opens get attributed to the wrong key, or to none, and the tool
      reads as dead when it is not. That decides whether a tool gets retired,
      so a parsing miss has real consequences.
   2. A uid leaks into the output. The whole justification for reading
      admin/audit into a staff-visible page is that only COUNTS come out.

   The database half is deliberately not stubbed. A stub written from memory
   tests only that I was consistent with myself (see CLAUDE.md), and the
   RTDB half here is two calls and a loop — the risk lives in the pure
   functions, which take plain objects.

   Run with `npm test`. Zero dependencies. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const require_ = createRequire(import.meta.url);

/* firebase-functions and firebase-admin are not installed at the repo root —
   they live in functions/node_modules on the deploy runner, not here. Load the
   module with those two stubbed so the pure half is reachable. The stubs are
   inert: onSchedule records its options and returns, which is all this file
   needs from them. */
let scheduleOpts = null;

const Module = require_('node:module');
const realResolve = Module._resolveFilename;
const FAKES = {
  'firebase-functions/v2/scheduler': {
    onSchedule: (opts, fn) => { scheduleOpts = opts; return fn; },
  },
  'firebase-functions/v2': { logger: { info() {}, warn() {}, error() {} } },
  'firebase-admin': { database: () => { throw new Error('not used in tests'); } },
};
Module._resolveFilename = function (request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return request;
  return realResolve.call(this, request, ...rest);
};
for (const [id, exports_] of Object.entries(FAKES)) {
  require_.cache[id] = { id, filename: id, loaded: true, exports: exports_ };
}

const mod = require_(join(REPO, 'functions/usage-rollup.js'));
const { toolKeyFrom, summarise, missingDays, utcDay, dayBounds } = mod._test;

Module._resolveFilename = realResolve;

const open = (detail, uid) => ({ action: 'page_opened', detail, uid });

/* ── Attribution ─────────────────────────────────────────────────────────── */

test('the bracketed toolKey wins, because it is the only stable part', () => {
  assert.equal(toolKeyFrom(open('Vacancies [ops-vacancies] /vacancies/')), 'ops-vacancies');
  assert.equal(toolKeyFrom(open('Programme Packs [ops-programme] /programme/')), 'ops-programme');
});

test('a path that disagrees with the key does not win', () => {
  /* Real cases: /graphics/totw/ is media-totw, /data/ is ops-data. Trusting
     the path would file their opens under a key no registry row matches. */
  assert.equal(toolKeyFrom(open('Team of the Week [media-totw] /graphics/totw/')), 'media-totw');
});

test('no bracket falls back to the path rather than dropping the open', () => {
  /* auth-guard omits the bracket when the title and key are identical. A tool
     silently contributing nothing is the failure that makes the dashboard a
     lie, so it is counted under a marked key instead. */
  assert.equal(toolKeyFrom(open('Fixtures /fixtures/')), 'path:fixtures');
  assert.equal(toolKeyFrom(open('/graphics/totw/')), 'path:graphics/totw');
});

test('an entry with nothing usable is skipped, not counted as a tool', () => {
  assert.equal(toolKeyFrom(open('')), null);
  assert.equal(toolKeyFrom({}), null);
  assert.equal(toolKeyFrom(null), null);
});

test('keys are lowercased so one tool cannot become two rows', () => {
  assert.equal(toolKeyFrom(open('X [OPS-Vacancies] /x/')), 'ops-vacancies');
});

/* ── Counting ────────────────────────────────────────────────────────────── */

test('opens and distinct people are counted per tool', () => {
  const out = summarise([
    open('V [ops-vacancies] /vacancies/', 'u1'),
    open('V [ops-vacancies] /vacancies/', 'u1'),   // same person twice
    open('V [ops-vacancies] /vacancies/', 'u2'),
    open('P [ops-programme] /programme/', 'u3'),
  ]);
  assert.deepEqual(out['ops-vacancies'], { opens: 3, users: 2 });
  assert.deepEqual(out['ops-programme'], { opens: 1, users: 1 });
});

test('_all counts each person once across every tool', () => {
  const out = summarise([
    open('V [ops-vacancies] /v/', 'u1'),
    open('P [ops-programme] /p/', 'u1'),   // one person, two tools
    open('P [ops-programme] /p/', 'u2'),
  ]);
  assert.deepEqual(out._all, { opens: 3, users: 2 });
});

test('audit entries that are not page opens are ignored', () => {
  /* admin/audit holds every write in the estate — the hook records
     set/update/push/remove too. Counting those would report write activity as
     readership, which is a different and much larger number. */
  const out = summarise([
    { action: 'tasks_changed', detail: 'Tasks [ops-tasks] /tasks/', uid: 'u1' },
    { action: 'holiday-lieu_changed', detail: 'HL [staff-holiday-lieu] /h/', uid: 'u1' },
    open('V [ops-vacancies] /v/', 'u1'),
  ]);
  assert.deepEqual(Object.keys(out).sort(), ['_all', 'ops-vacancies']);
  assert.equal(out._all.opens, 1);
});

test('a day with no opens produces an empty object, not an _all of zero', () => {
  assert.deepEqual(summarise([]), {});
  assert.deepEqual(summarise(null), {});
});

test('an open with no uid still counts as an open', () => {
  const out = summarise([open('V [ops-vacancies] /v/', undefined)]);
  assert.deepEqual(out['ops-vacancies'], { opens: 1, users: 0 });
});

/* ── The promise: counts out, identity never ─────────────────────────────── */

test('no uid, name or email survives into the output', () => {
  const out = summarise([
    { action: 'page_opened', detail: 'V [ops-vacancies] /v/',
      uid: 'uid-abc123', name: 'A Person', email: 'a.person@example.org' },
  ]);
  const json = JSON.stringify(out);
  for (const leak of ['uid-abc123', 'A Person', 'a.person@example.org']) {
    assert.ok(!json.includes(leak), `${leak} reached the counters`);
  }
  assert.deepEqual(out['ops-vacancies'], { opens: 1, users: 1 });
});

test('users is a number, never a list', () => {
  const out = summarise([open('V [ops-vacancies] /v/', 'u1'), open('V [ops-vacancies] /v/', 'u2')]);
  assert.equal(typeof out['ops-vacancies'].users, 'number');
});

test('the module never writes anywhere but its own subtree', () => {
  const src = readFileSync(join(REPO, 'functions/usage-rollup.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const writes = [...src.matchAll(/\.ref\(([^)]*)\)[\s\S]{0,80}?\.(set|update|push|remove)\(/g)];
  assert.ok(writes.length > 0, 'expected to find the writes');
  for (const w of writes) {
    assert.match(w[1], /OUT|app-data\/ops-data/,
      `writes outside app-data/ops-data: ${w[1]}. This function reads the ` +
      'audit log; it must never write to it.');
  }
});

/* ── Day arithmetic ──────────────────────────────────────────────────────── */

test('bounds of a UTC day are midnight to midnight', () => {
  const { start, end } = dayBounds('2026-10-09');
  assert.equal(new Date(start).toISOString(), '2026-10-09T00:00:00.000Z');
  assert.equal(new Date(end).toISOString(), '2026-10-10T00:00:00.000Z');
});

test('the key range is numeric despite being a string comparison', () => {
  /* The query compares auth-guard's `<epochMs>_<rand>` keys lexicographically.
     That equals numeric order only while every timestamp has the same number
     of digits — true for 13-digit ms values until the year 2286. If this ever
     fails, the range query is silently returning the wrong days. */
  const { start, end } = dayBounds('2026-10-09');
  assert.equal(String(start).length, 13);
  assert.equal(String(end).length, 13);
  assert.ok(String(start) < String(end));
  assert.ok(`${start}_zzzzzz` < String(end), 'a late entry must sort inside the day');
});

test('utcDay(1) is yesterday', () => {
  const now = Date.parse('2026-10-09T03:20:00Z');
  assert.equal(utcDay(0, now), '2026-10-09');
  assert.equal(utcDay(1, now), '2026-10-08');
});

test('missingDays skips days already written and is newest-first', () => {
  const now = Date.parse('2026-10-09T03:20:00Z');
  const missing = missingDays({ '2026-10-08': 1, '2026-10-06': 1 }, now);
  assert.equal(missing[0], '2026-10-07');
  assert.ok(!missing.includes('2026-10-08'));
  assert.ok(!missing.includes('2026-10-06'));
  assert.ok(missing.includes('2026-10-05'));
});

/* ── Deployment shape ────────────────────────────────────────────────────── */

test('it is scheduled, in the right region, with room to backfill', () => {
  assert.equal(scheduleOpts.region, 'europe-west2');
  assert.equal(scheduleOpts.timeZone, 'Europe/London');
  assert.ok(scheduleOpts.timeoutSeconds >= 540,
    'the first run backfills a year and needs the headroom');
});
