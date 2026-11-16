/* functions/externals-core.js: pass.ext kept in step, and the invite
   request checked, with the real canon and registry. Made-up people and
   organisation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { NL, REPO } from './load-canon.mjs';

const require = createRequire(import.meta.url);
const { extUpdate, checkInvite, externalUser, stable } = require('../functions/externals-core.js');
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const NOW = Date.UTC(2026, 10, 16, 12);
const FB = 'ops-financial-benchmarking';
const ORG = { name: 'Made-up Regulator', zones: { fin: { name: 'Finance', code: 'FIN',
  tools: { [FB]: { level: 'access', view: 'all', reason: 'Already receives these figures', by: 'u0', at: 1 } } } } };

test('extUpdate writes ext for an External card, and nothing once it is in step', () => {
  const pass = { base: 'external', org: 'made-up', issued: 1, keys: { fin: { given: 1 } } };
  const u = extUpdate(NL, 'u1', pass, ORG, REG, NOW);
  assert.deepEqual(Object.keys(u), ['users/u1/pass/ext']);
  assert.equal(u['users/u1/pass/ext'][FB].view, 'all');
  assert.deepEqual(extUpdate(NL, 'u1', Object.assign({}, pass, { ext: u['users/u1/pass/ext'] }), ORG, REG, NOW), {});
});

test('extUpdate clears ext when nothing is open any more, or the card is not External', () => {
  const ended = { base: 'external', org: 'made-up', issued: 1, keys: { fin: { given: 1, until: NOW - 1 } }, ext: { [FB]: { level: 'access' } } };
  assert.deepEqual(extUpdate(NL, 'u1', ended, ORG, REG, NOW), { 'users/u1/pass/ext': null });
  const league = { base: 'league', issued: 1, ext: { [FB]: { level: 'access' } } };
  assert.deepEqual(extUpdate(NL, 'u2', league, null, REG, NOW), { 'users/u2/pass/ext': null });
  assert.deepEqual(extUpdate(NL, 'u3', { base: 'club', club: 'X', issued: 1 }, null, REG, NOW), {});
});

test('checkInvite: the request must name a person, a real email, and the organisation\'s own zones', () => {
  const good = { email: ' Someone@Example.org ', name: 'A Person', zones: { fin: true }, until: NOW + 1000 };
  assert.deepEqual(checkInvite(good, ORG, NOW).ok, { email: 'someone@example.org', name: 'A Person', jobTitle: '', zones: ['fin'], until: NOW + 1000 });
  assert.ok(checkInvite(Object.assign({}, good, { email: 'nope' }), ORG, NOW).error);
  assert.ok(checkInvite(Object.assign({}, good, { name: ' ' }), ORG, NOW).error);
  assert.ok(checkInvite(Object.assign({}, good, { zones: { other: true } }), ORG, NOW).error);
  assert.ok(checkInvite(Object.assign({}, good, { zones: {} }), ORG, NOW).error);
  assert.ok(checkInvite(Object.assign({}, good, { until: NOW - 1 }), ORG, NOW).error);
  assert.equal(checkInvite(Object.assign({}, good, { until: null }), ORG, NOW).ok.until, null);
  assert.ok(checkInvite(good, null, NOW).error);
});

test('externalUser: role external, an External pass, never a League one', () => {
  const ok = checkInvite({ email: 'a@b.org', name: 'A', zones: { fin: true } }, ORG, NOW).ok;
  const u = externalUser(ok, 'made-up', ORG, 'u0', NOW);
  assert.equal(u.role, 'external');
  assert.equal(u.pass.base, 'external');
  assert.equal(u.pass.org, 'made-up');
  assert.deepEqual(u.pass.keys, { fin: { given: NOW, by: 'u0' } });
  assert.equal(u.pass.skeleton, undefined);
  assert.equal(NL.accountLevel.isLeague(u), false);
});

test('stable compares meaning, not key order', () => {
  assert.equal(stable({ a: 1, b: [1, { c: 2, d: 3 }] }), stable({ b: [1, { d: 3, c: 2 }], a: 1 }));
});
