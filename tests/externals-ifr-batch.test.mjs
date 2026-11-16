/* The first batch opened to External cards after Financial Benchmarking
   (16/11/2026): Judgements, Club Directory, Handbook and Commercial
   Benchmarking. What each offers, how each page treats an External card,
   and that the one rules change is a read, on one node, behind both locks.
   tests/emulator/externals-rules.mjs proves the rules against the emulator. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NL, REPO } from './load-canon.mjs';
import { leagueRule, externalAllRule } from '../scripts/rtdb-level-rule.mjs';

const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const RAW = readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8');
const RULES = JSON.parse(RAW).rules['app-data'];
const page = (p) => readFileSync(join(REPO, p), 'utf8');
const BATCH = ['ops-judgements', 'ops-club-directory', 'ops-handbook', 'ops-commercial-benchmarking'];
const CB = 'ops-commercial-benchmarking';

test('the batch offers externals All clubs, named, and never Manage', () => {
  for (const k of BATCH) {
    assert.deepEqual(REG[k].externals, { views: ['all'] }, k);
    assert.ok(NL.pass.offersExternals(REG[k]), k);
  }
});

test('an External card given each tool opens it at Access, even when Manage was asked for', () => {
  const ext = {};
  BATCH.forEach((k) => { ext[k] = { level: 'manage', view: 'all', zones: ['z'] }; });
  const pass = { base: 'external', org: 'o', issued: 1, keys: { z: { given: 1 } }, ext };
  for (const k of BATCH) assert.equal(NL.pass.explain(pass, REG[k], undefined, k).level, 'access', k);
});

test('Commercial Benchmarking: the External clause is on the read of clubs/ only', () => {
  const clause = externalAllRule(CB);
  assert.ok(RULES[CB].clubs['.read'].startsWith('auth != null && (' + leagueRule() + ' || ' + clause + ') && '));
  assert.ok(!RULES[CB].clubs['.write'].includes("=== 'external'"), 'never on a write');
  const uses = RAW.split("child('pass').child('ext')").length - 1;
  assert.equal(uses, 1, 'the only place the rules read pass.ext');
  assert.match(clause, /child\('ext'\)\.child\('ops-commercial-benchmarking'\)\.child\('view'\)\.val\(\) === 'all'/);
});

test('Commercial Benchmarking lets an External card through to the every-club view', () => {
  const s = page('commercial-benchmarking/index.html');
  assert.match(s, /var external = NL\.pass && NL\.pass\.isExternal\(who\.user && who\.user\.pass\);\s*if \(!who\.league && !external\) \{ codeDoor\(\); return; \}/);
});

test('Club Directory and Handbook send an External card to the published copy', () => {
  assert.match(page('club-directory/index.html'), /isExternal\(session\.pass\)\) \{ location\.replace\('\/club-directory\/public\/'\); return; \}/);
  const hb = page('handbook/index.html');
  const boot = hb.slice(hb.indexOf('window.TOOL.boot = function (session) {'));
  assert.match(boot.slice(0, 400), /isExternal\(session && session\.pass\)\) \{ location\.replace\('\/handbook\/public\/'\); return; \}/, 'before anything reads the draft');
});
