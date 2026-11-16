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
  assert.match(boot.slice(0, 600), /var where = draftReader\(session\);\s*if \(where\) \{ location\.replace\(where \+ location\.hash\); return; \}/, 'before anything reads the draft');
});

test('Handbook: only the League stays on the draft page; a Club card goes to the reader, anyone else to the open page', () => {
  const hb = page('handbook/index.html');
  const src = hb.slice(hb.indexOf('function draftReader(session) {'), hb.indexOf('window.HB_DRAFT_READER'));
  const draftReader = new Function('NL', 'location', src + '; return draftReader;')(NL, {});
  const p = (base, extra) => Object.assign({ base, issued: 1 }, extra || {});
  assert.equal(draftReader({ role: 'staff', pass: p('league') }), null);
  assert.equal(draftReader({ role: 'admin' }), null, 'no pass, League role');
  assert.equal(draftReader({ role: 'superadmin' }), null);
  assert.equal(draftReader({ role: 'club-staff', pass: p('club', { club: 'Testham Town' }) }), '/handbook/reader/');
  assert.equal(draftReader({ role: 'staff', pass: p('club', { club: 'Testham Town' }) }), '/handbook/reader/', 'the card decides, not an old role');
  assert.equal(draftReader({ role: 'external', pass: p('external', { org: 'o', keys: { z: { given: 1 } } }) }), '/handbook/public/');
  assert.equal(draftReader({ role: 'club-admin' }), '/handbook/public/', 'no pass, old club role');
  assert.equal(draftReader({}), '/handbook/public/');
});
