/* Access (/access/) — the static half of what the tool rests on.

   The rules for access-grants are proved against the emulator in
   tests/emulator/access-grants-rules.mjs (run by hand). These checks run on
   every PR and pin the shape: who may write live grants, that every audit
   action Access writes has words in the log, and that the old addresses
   forward. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NL, REPO } from './load-canon.mjs';

const read = (p) => readFileSync(join(REPO, p), 'utf8');
const RULES = JSON.parse(read('system/rtdb/rules.snapshot.json')).rules;
const REG = JSON.parse(read('system/rtdb/tools-registry.snapshot.json'));
const PAGE = read('access/index.html');

test('access-grants: read by anyone signed in, written by the Skeleton key or superadmin only', () => {
  const g = RULES['access-grants'];
  assert.ok(g, 'rules.snapshot.json has no access-grants node');
  assert.equal(g['.read'], 'auth != null');
  assert.match(g['.write'], /child\('pass'\)\.child\('skeleton'\)\.exists\(\)/);
  assert.match(g['.write'], /=== 'superadmin'/);
  assert.doesNotMatch(g['.write'], /=== 'admin'/, 'a League Admin role must not write grants');
  assert.equal(g.$toolKey.$other['.validate'], 'false');
});

test('every audit action Access writes reads as words in the log', () => {
  /* Literal NL.writeAudit('x', …) calls, and the two grants actions that
     writeGrants passes through. */
  const actions = [...PAGE.matchAll(/NL\.writeAudit\('([a-z_]+)'/g), ...PAGE.matchAll(/'(grants_[a-z]+)'/g)].map((m) => m[1]);
  assert.ok(actions.includes('grants_changed') && actions.includes('grants_reset'));
  const save = PAGE.indexOf('function writeGrants');
  assert.ok(save > 0 && PAGE.indexOf("NL.writeAudit(action", save) > 0, 'writeGrants no longer audits');
  for (const a of new Set(actions)) assert.ok(NL.audit.LABELS[a], `NL.audit.LABELS has no words for ${a}`);
});

test('Access opens to the Skeleton key and the League Operations key', () => {
  const rec = REG['ops-people'];
  assert.equal(rec.label, 'Access');
  assert.equal(rec.url, '/access/');
  assert.deepEqual(rec.permissions.grants.key, { 'league-operations': 'access' });
  assert.equal(rec.permissions.grants.base.league, 'off');
  const ops = { base: 'league', keys: { 'league-operations': { given: 1 } } };
  assert.equal(NL.pass.level(ops, rec), 'access');
  assert.equal(NL.pass.level({ base: 'league' }, rec), 'off');
  assert.equal(NL.pass.level({ base: 'club', club: 'X', keys: { 'club-operations': { given: 1 } } }, rec), 'off');
});

test('the Skeleton-only tabs are held back for everyone else', () => {
  assert.match(PAGE, /var SK_TABS = \['tools', 'audit', 'manage'\]/);
  assert.match(PAGE, /if \(SK_TABS\.indexOf\(name\) >= 0 && !sk\(\)\) name = 'people'/);
  assert.match(PAGE, /function inviteRoles\(\) \{ return sk\(\) \? ROLES : CLUB_ROLES; \}/);
});

test('/people/ and /audit/ forward to Access, keeping the query', () => {
  assert.match(read('people/index.html'), /var base = '\/access\/';/);
  assert.match(read('audit/index.html'), /var base = '\/access\/\?tab=audit';/);
});
