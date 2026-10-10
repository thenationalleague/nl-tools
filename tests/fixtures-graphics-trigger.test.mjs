/* functions/fixtures-graphics-trigger.js — asks GitHub to make the results
   graphics five minutes after the last game ends.

   The deciding logic lives in functions/fixtures-graphics-core.js and is
   tested directly. The dispatch itself is checked the way
   handbook-pdf-dispatch.test.mjs checks its own: the failure modes are all
   silent (a 404 from a misspelt workflow, a dry run that delivers nothing),
   so the strings are pinned here.

   Match shape: the NLS list endpoint as scripts/build-fixtures-graphics.js
   reads it — attributes.matchPeriod (FullTime / PostMatch / Postponed /
   Abandoned are the end states, nls-data-structure skill) and
   homeTeam/awayTeam.score / .penaltyScore. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { REPO } from './load-canon.mjs';

const require = createRequire(import.meta.url);
const core = require(join(REPO, 'functions/fixtures-graphics-core.js'));
const SRC = readFileSync(join(REPO, 'functions/fixtures-graphics-trigger.js'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const g = (id, period, hs = null, as = null) => ({ id, attributes: { matchPeriod: period,
  homeTeam: { score: hs, penaltyScore: null }, awayTeam: { score: as, penaltyScore: null } } });

test('only ended games count: a goal mid-game changes nothing', () => {
  assert.equal(core.fingerprint([g('1', 'PreMatch'), g('2', 'SecondHalf', 1, 0)]), '');
  const a = core.fingerprint([g('1', 'FullTime', 1, 0), g('2', 'SecondHalf', 1, 0)]);
  const b = core.fingerprint([g('1', 'FullTime', 1, 0), g('2', 'SecondHalf', 2, 0)]);
  assert.ok(a);
  assert.equal(a, b);
  assert.notEqual(a, core.fingerprint([g('1', 'FullTime', 1, 1), g('2', 'SecondHalf', 2, 0)]), 'a corrected score is a change');
  assert.equal(a, core.fingerprint([g('1', 'PostMatch', 1, 0)]), 'PostMatch is still full time');
  assert.notEqual(core.fingerprint([g('1', 'Abandoned')]), '', 'an abandoned game counts');
});

test('waits five quiet minutes, then asks once, then twice more for the table', () => {
  const t0 = Date.UTC(2026, 9, 10, 15, 55);
  const min = 60000;
  let state = null;
  const step = (fp, at) => { const r = core.decide(fp, state, at); if (r.write) state = r.write; return r.dispatch; };

  assert.equal(step('A', t0), false, 'first sight of a change: wait');
  assert.equal(step('A', t0 + 3 * min), false, 'still inside the quiet window');
  assert.equal(step('B', t0 + 4 * min), false, 'another game ends: the wait restarts');
  assert.equal(step('B', t0 + 8 * min), false);
  assert.equal(step('B', t0 + 9 * min), true, 'five minutes after the last change: ask');
  assert.equal(step('B', t0 + 11 * min), false, 'not again straight away');
  assert.equal(step('B', t0 + 24 * min), true, 'follow-up for a table that trailed the scores');
  assert.equal(step('B', t0 + 39 * min), true, 'second follow-up');
  assert.equal(step('B', t0 + 60 * min), false, 'and then it stops');
  assert.equal(step('C', t0 + 61 * min), false, 'a correction: wait again');
  assert.equal(step('C', t0 + 66 * min), true, '…then ask, so the corrected card goes');
});

test('nothing ended, nothing asked', () => {
  assert.deepEqual(core.decide('', null, Date.now()), { write: null, dispatch: false });
});

test('the day is the UK day', () => {
  assert.equal(core.ukDate(Date.UTC(2026, 9, 10, 23, 30)), '2026-10-11', 'half eleven UTC is half twelve BST');
  assert.equal(core.seasonOf('2026-10-10'), 2026);
  assert.equal(core.seasonOf('2027-04-24'), 2026);
});

test('it dispatches a workflow that exists, on main, as a real run', () => {
  const wf = /const WORKFLOW = "([^"]+)"/.exec(SRC)[1];
  const file = join(REPO, '.github/workflows', wf);
  assert.ok(existsSync(file), `${wf} is not in .github/workflows — GitHub would answer 404`);
  const yml = readFileSync(file, 'utf8');
  assert.match(yml, /^\s*workflow_dispatch:/m);
  for (const input of ['mode', 'division', 'dry_run']) {
    assert.match(yml, new RegExp('^\\s{6}' + input + ':', 'm'), `the workflow has no ${input} input`);
  }
  assert.equal(/const BRANCH = "([^"]+)"/.exec(SRC)[1], 'main');
  assert.match(CODE, /dry_run: "false"/, 'the workflow defaults to a dry run; this must turn it off');
  assert.match(CODE, /dispatch\("results"\)/, 'the full-time trigger asks for results');
  assert.match(CODE, /dispatch\("fixtures"\)/, 'the 10am trigger asks for fixtures');
  assert.match(CODE, /dispatch\("matchday"\)/, 'the 4am trigger asks for the matchday cards');
  assert.match(CODE, /schedule: "0 4 \* \* \*",\s*timeZone: "Europe\/London"/, '4am UK, not UTC');
  assert.match(yml, /options: \[results, fixtures, matchday[\],]/, 'the workflow accepts every mode the function sends');
  assert.match(CODE, /schedule: "0 10 \* \* \*",\s*timeZone: "Europe\/London"/, '10am UK, not UTC');
});

test('a refused dispatch is not recorded as asked, and nothing throws', () => {
  assert.match(CODE, /if \(!\(await dispatch\("results"\)\)\) return;/);
  assert.doesNotMatch(CODE, /\bthrow\b(?! new Error\("NLS)/, 'only the NLS read may throw, and the tick catches it');
});
