/* The old access report (scripts/old-access-report.mjs): counts what still
   leans on the old model, from made-up accounts and the real registry
   snapshot. The users below are invented; the report is checked to print
   no uid, so the Actions log stays free of anything personal. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { NL, REPO } from './load-canon.mjs';
import { oldAccessReport, reportLines } from '../scripts/old-access-report.mjs';

const require = createRequire(import.meta.url);
const { entryUpdates } = require('../functions/pass-entries-core.js');
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const NOW = Date.UTC(2026, 10, 16, 12);

const league = { base: 'league', issued: 1 };
function inStep(pass, role) {
  const want = NL.pass.toOld(pass, REG, role, NOW);
  const t = {};
  Object.keys(want).forEach((k) => { if (want[k] !== null) t[k] = want[k]; });
  return t;
}

const USERS = {
  uidPassInStep: { role: 'staff', pass: league, tools: inStep(league, 'staff') },
  uidPassDrift: { role: 'staff', pass: league, tools: Object.assign(inStep(league, 'staff'), { 'ops-people': 'admin' }) },
  uidLeagueNoPass: { role: 'admin', tools: { 'ops-vacancies': { access: true, admin: false } } },
  uidClubNoPass: { role: 'club', tools: { 'ops-attendance': true, 'gone-tool': 'access' } },
  uidClubStaff: { role: 'club-staff', tools: { 'media-dazn': 'hidden' } },
  uidWaiting: { role: 'pending', tools: {} },
  uidNoRole: {},
};

const R = oldAccessReport(NL, entryUpdates, USERS, REG, null, NOW);

test('accounts are counted by pass, and those without one by their old role', () => {
  assert.equal(R.accounts, 7);
  assert.equal(R.withPass, 2);
  assert.deepEqual(R.withoutPass, { league: 1, club: 2, waiting: 1, none: 1, other: 0 });
  assert.equal(R.oldClubRoles, 1);
  assert.equal(R.roles.staff, 2);
  assert.equal(R.roles.none, 1);
});

test('old entry shapes and entries for tools that no longer exist are counted', () => {
  assert.equal(R.entries.object, 1);
  assert.equal(R.entries.true, 1);
  assert.equal(R.entries.hidden, 1);
  assert.equal(R.entries.unknownTool, 1);
  assert.deepEqual(R.unknownTools, { 'gone-tool': 1 });
});

test('drift counts only pass holders whose entries differ from the pass', () => {
  assert.deepEqual(R.drift, { accounts: 1, entries: 1 });
});

test('the registry side: defaults and the League only label', () => {
  assert.equal(R.registry.tools, Object.keys(REG).length);
  assert.ok(R.registry.withDefaults > 0);
  assert.ok(R.registry.audience.league > 0);
});

test('the printed report carries no uid', () => {
  const text = reportLines(R).join('\n') + JSON.stringify(R);
  Object.keys(USERS).forEach((uid) => assert.ok(!text.includes(uid), 'printed ' + uid));
});

test('an empty database reports zeros, not an error', () => {
  const r = oldAccessReport(NL, entryUpdates, null, null, null, NOW);
  assert.equal(r.accounts, 0);
  assert.ok(reportLines(r).length > 5);
});
