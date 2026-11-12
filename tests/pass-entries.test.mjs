/* passEntries / grantEntries / keyEndings — the database follows the pass
   (functions/pass-entries.js, permissions plan step 5).

   The pure half (functions/pass-entries-core.js) runs here against the real
   canon and the real registry snapshot. The triggers themselves are
   Firebase's (onValueWritten, onSchedule); what they read and write is the
   project's own data shape, documented in system/permissions-plan.md. Also
   checks that functions/canon.js loads system/nl-utils.js in plain Node, as
   it must on the server, and that deploy copies it there. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { NL, REPO } from './load-canon.mjs';

const require = createRequire(import.meta.url);
const { entryUpdates, keysEnded } = require('../functions/pass-entries-core.js');
const { loadCanon } = require('../functions/canon.js');
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const NOW = Date.UTC(2026, 10, 12, 12);
const plain = (v) => JSON.parse(JSON.stringify(v));

const ops = { base: 'league', issued: 1, keys: { 'league-operations': { given: 1 } } };

test('no issued pass: nothing is written', () => {
  assert.deepEqual(entryUpdates(NL, 'u1', { role: 'staff', tools: {} }, REG, NOW), {});
  assert.deepEqual(entryUpdates(NL, 'u1', null, REG, NOW), {});
});

test('a pass holder: the entries are what the resolver gives, and only the differences are written', () => {
  const u = { role: 'staff', pass: ops, tools: {} };
  const want = plain(NL.pass.toOld(ops, REG, 'staff', NOW));
  const got = plain(entryUpdates(NL, 'u1', u, REG, NOW));
  const expected = {};
  Object.keys(want).forEach((k) => { if (want[k] !== null) expected['users/u1/tools/' + k] = want[k]; });
  assert.deepEqual(got, expected);
  assert.ok(Object.keys(got).length > 0, 'an Operations key should differ from League Staff defaults somewhere');
  /* Already in step: nothing to write. */
  const tools = {};
  Object.keys(want).forEach((k) => { if (want[k] !== null) tools[k] = want[k]; });
  assert.deepEqual(entryUpdates(NL, 'u1', { role: 'staff', pass: ops, tools }, REG, NOW), {});
});

test('a stale entry the pass no longer gives is cleared, not left behind', () => {
  const u = { role: 'staff', pass: { base: 'league', issued: 1 }, tools: { 'ops-people': 'admin' } };
  assert.equal(entryUpdates(NL, 'u1', u, REG, NOW)['users/u1/tools/ops-people'], null);
});

test('one tool only, for a grant change', () => {
  const u = { role: 'staff', pass: ops, tools: {} };
  const got = entryUpdates(NL, 'u1', u, REG, NOW, 'ops-people');
  assert.deepEqual(Object.keys(got), ['users/u1/tools/ops-people']);
  assert.equal(got['users/u1/tools/ops-people'], 'access');
});

test('a key past its end date stops counting, so its entries are cleared', () => {
  const ended = { base: 'league', issued: 1, keys: { 'league-operations': { given: 1, until: NOW - 1000 } } };
  const got = entryUpdates(NL, 'u1', { role: 'staff', pass: ended, tools: { 'ops-people': 'access' } }, REG, NOW);
  assert.equal(got['users/u1/tools/ops-people'], null);
});

test('keysEnded: only keys whose end date fell in the window', () => {
  const pass = { keys: {
    a: { until: NOW - 1000 },          /* ended in the window */
    b: { until: NOW - 48 * 3600e3 },   /* ended before it */
    c: { until: NOW + 1000 },          /* not yet */
    d: {}                              /* no end date */
  } };
  assert.deepEqual(keysEnded(pass, NOW - 26 * 3600e3, NOW), ['a']);
  assert.deepEqual(keysEnded(null, 0, NOW), []);
});

test('functions/canon.js loads the shared canon in plain Node', () => {
  const SN = loadCanon();
  assert.equal(SN.pass.KEYS.length, NL.pass.KEYS.length);
  assert.deepEqual(plain(SN.pass.toOld(ops, REG, 'staff', NOW)), plain(NL.pass.toOld(ops, REG, 'staff', NOW)));
});

test('deploy copies the canon into functions/, and redeploys when it changes', () => {
  const wf = readFileSync(join(REPO, '.github/workflows/deploy-functions.yml'), 'utf8');
  assert.match(wf, /cp system\/nl-utils\.js functions\/canon\/nl-utils\.js/);
  assert.match(wf, /- 'system\/nl-utils\.js'/);
  assert.match(readFileSync(join(REPO, '.gitignore'), 'utf8'), /^functions\/canon\/$/m);
  assert.match(readFileSync(join(REPO, 'functions/index.js'), 'utf8'), /require\("\.\/pass-entries"\)/);
});
