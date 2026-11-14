/* NL.accountLevel (nl-utils v1.67): an NL Tools account's level on a tool,
   for a page without auth-guard. It must give auth-guard's answer, in
   auth-guard's order (checkAccess, v16.3): an issued pass decides first and
   alone; then, with no pass, the superadmin role; then a League-only tool
   is Off for a club role; then the old entry or the role default. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshCanon } from './load-canon.mjs';

const REG = JSON.parse(readFileSync(new URL('../system/rtdb/tools-registry.snapshot.json', import.meta.url), 'utf8'));
const KEY = 'ops-document-library';
const tool = REG[KEY];
const K = (...k) => Object.fromEntries(k.map((x) => [x, { given: 1, by: 'x' }]));
const league = (role, ...k) => ({ role, pass: { base: 'league', issued: 1, keys: K(...k) } });

test('a pass decides, before the superadmin role', () => {
  const NL = freshCanon();
  const from = NL.accountLevel.from;
  assert.equal(from(league('staff', 'league-operations'), tool, KEY), 'manage');
  assert.equal(from(league('staff'), tool, KEY), 'access', 'the League card alone: Access');
  assert.equal(from(league('superadmin'), tool, KEY), 'access', 'a superadmin with a pass is held to the pass, as auth-guard v16.3');
});

test('with no pass: superadmin is Manage, then the old entry or role default', () => {
  const NL = freshCanon();
  const from = NL.accountLevel.from;
  assert.equal(from({ role: 'superadmin' }, tool, KEY), 'manage');
  assert.equal(from({ role: 'admin' }, tool, KEY), 'manage', 'role default admin');
  assert.equal(from({ role: 'staff' }, tool, KEY), 'off', 'role default off');
  assert.equal(from({ role: 'staff', tools: { [KEY]: 'access' } }, tool, KEY), 'access', 'the person\'s own entry');
  assert.equal(from({ role: 'club-admin', tools: { [KEY]: 'admin' } }, tool, KEY), 'off', 'a League-only tool is Off for a club role, whatever the entry');
  assert.equal(from({ role: 'staff' }, null, KEY), 'off', 'no registry record: Off');
});

test('a Club card is the club side, and Off on a League-only tool', () => {
  const NL = freshCanon();
  const card = { role: 'staff', pass: { base: 'club', club: 'Testham Town', issued: 1, keys: {} } };
  assert.equal(NL.accountLevel.isLeague(card), false);
  assert.equal(NL.accountLevel.isLeague(league('staff')), true);
  assert.equal(NL.accountLevel.isLeague({ role: 'club-admin' }), false);
  assert.equal(NL.accountLevel.from(card, tool, KEY), 'off');
});

test('load reads the person, the record and the live grants, and applies them', async () => {
  const NL = freshCanon();
  const data = {
    'users/u1': league('staff'),
    ['tools/' + KEY]: tool,
    ['access-grants/' + KEY]: null
  };
  const db = { ref: (p) => ({ once: () => Promise.resolve({ val: () => data[p] || null, exists: () => data[p] != null }) }) };
  const who = await NL.accountLevel.load('u1', KEY, db);
  assert.equal(who.league, true);
  assert.equal(who.level, 'access');
});
