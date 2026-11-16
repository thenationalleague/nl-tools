/* The pass an invite carries (16/11/2026): functions/invite-pass-core.js,
   and consumeInvite putting it on the new account. The callable and Admin
   SDK shapes are the documented ones (see tests/access-sweep.test.mjs for
   the links); Reference.transaction is
   https://firebase.google.com/docs/reference/admin/node/firebase-admin.database.reference#referencetransaction
   (the update function is handed the current value, returns the new one or
   undefined to abort; resolves { committed, snapshot }). Made-up people. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { NL, REPO } from './load-canon.mjs';

const require = createRequire(import.meta.url);
const { invitePass } = require('../functions/invite-pass-core.js');
const NOW = Date.UTC(2026, 10, 16, 12);
const skel = { role: 'staff', pass: { base: 'league', issued: 1, skeleton: { given: 1 } } };
const ops = { role: 'admin', pass: { base: 'league', issued: 1, keys: { 'league-operations': { given: 1 } } } };
const plainStaff = { role: 'staff', pass: { base: 'league', issued: 1 } };
const club = (keys) => ({ base: 'club', club: 'Testham Town', jobTitle: 'Secretary', issued: 1, keys });
const rec = (pass, by) => ({ pass, by: by || 'u-skel', at: 1 });

test('invitePass: a Club card from League Operations, for a club invite to the same club', () => {
  const got = invitePass(NL, rec(club({ 'club-media': { given: 1, until: NOW + 5000 }, 'nonsense': { given: 1 } }), 'u-ops'), ops,
    { role: 'club-staff', club: 'Testham Town' }, NOW);
  assert.equal(got.pass.base, 'club');
  assert.equal(got.pass.club, 'Testham Town');
  assert.deepEqual(Object.keys(got.pass.keys), ['club-media'], 'only real Club zones survive the rebuild');
  assert.equal(got.pass.keys['club-media'].until, NOW + 5000);
  assert.equal(got.pass.issuedBy, 'u-ops');
});

test('invitePass refuses what the issuer may not give, or what does not match the invite', () => {
  assert.ok(invitePass(NL, rec({ base: 'league', issued: 1 }, 'u-ops'), ops, { role: 'staff' }, NOW).reason, 'League card: the Skeleton key only');
  assert.ok(invitePass(NL, rec(club({}), 'u-x'), plainStaff, { role: 'club-staff', club: 'Testham Town' }, NOW).reason, 'no rights, no card');
  assert.ok(invitePass(NL, rec(club({}), 'u-ops'), ops, { role: 'club-staff', club: 'Elsewhere United' }, NOW).reason, 'another club');
  assert.ok(invitePass(NL, rec(club({}), 'u-ops'), ops, { role: 'staff' }, NOW).reason, 'a Club card for a League role');
  assert.ok(invitePass(NL, rec({ base: 'league', issued: 1 }), skel, { role: 'club-staff', club: 'Testham Town' }, NOW).reason, 'a League card for a club role');
  assert.ok(invitePass(NL, rec({ base: 'external', org: 'o' }), skel, { role: 'staff' }, NOW).reason, 'never an External card by invite');
  assert.ok(invitePass(NL, rec(club({})), null, { role: 'club-staff', club: 'Testham Town' }, NOW).reason, 'an issuer with no account');
  const sk = invitePass(NL, rec({ base: 'league', issued: 1, skeleton: { given: 1 } }, 'u-ops'), ops, { role: 'staff' }, NOW);
  assert.ok(sk.reason, 'and nobody hands on the Skeleton key without holding it');
  const ok = invitePass(NL, rec({ base: 'league', issued: 1, skeleton: { given: 1 } }), skel, { role: 'staff' }, NOW);
  assert.ok(ok.pass && ok.pass.skeleton, 'the Skeleton key may');
});

function loadAccount(db) {
  const stubs = {
    'firebase-functions/v2/https': { onCall: (opts, fn) => fn, HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } },
    'firebase-functions/logger': { info() {}, warn() {}, error() {} },
    'firebase-admin': { database: () => db, auth: () => ({ deleteUser: async () => {} }) }
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) { return stubs[req] || orig.call(this, req, ...rest); };
  try { const p = join(REPO, 'functions/account.js'); delete require.cache[p]; return require(p); }
  finally { Module._load = orig; }
}
function fakeDb(tree) {
  const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), tree);
  const put = (p, v) => { const ks = p.split('/').filter(Boolean); let o = tree; ks.slice(0, -1).forEach((k) => { o = (o[k] ||= {}); }); if (v === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v; };
  const snap = (v) => ({ val: () => (v === undefined ? null : v), exists: () => v !== undefined && v !== null,
    forEach: (cb) => Object.entries(v || {}).forEach(([k, x]) => cb({ key: k, val: () => x })) });
  const ref = (p) => ({
    once: async () => snap(get(p)),
    set: async (v) => put(p, JSON.parse(JSON.stringify(v))),
    remove: async () => put(p, null),
    update: async (u) => Object.entries(u).forEach(([k, v]) => put(p + '/' + k, v)),
    transaction: async (fn) => { const cur = get(p); const next = fn(cur === undefined ? null : JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return { committed: false, snapshot: snap(get(p)) }; put(p, next); return { committed: true, snapshot: snap(get(p)) }; }
  });
  return { ref };
}
const call = (uid, email, token) => ({ auth: { uid, token: { email } }, data: { token } });

test('consumeInvite puts the checked pass on the new account, and clears it from the invite', async () => {
  const tree = { users: { 'u-ops': ops }, admin: {
    invites: { t1: { email: 'new@example.invalid', name: 'New Person', role: 'club-staff', club: 'Testham Town' } },
    'invite-passes': { t1: rec(club({ 'club-finance': { given: 1 } }), 'u-ops') } } };
  const { consumeInvite } = loadAccount(fakeDb(tree));
  await consumeInvite(call('u-new', 'new@example.invalid', 't1'));
  const u = tree.users['u-new'];
  assert.equal(u.role, 'club-staff');
  assert.equal(u.pass.base, 'club');
  assert.deepEqual(Object.keys(u.pass.keys), ['club-finance']);
  assert.equal(tree.admin['invite-passes'].t1, undefined, 'used once');
});

test('consumeInvite: a pass that fails the check is left off; a superadmin invite is refused', async () => {
  const tree = { users: { 'u-ops': ops }, admin: {
    invites: { t2: { email: 'a@example.invalid', name: 'A', role: 'staff' }, t3: { email: 'b@example.invalid', name: 'B', role: 'superadmin' } },
    'invite-passes': { t2: rec({ base: 'league', issued: 1, skeleton: { given: 1 } }, 'u-ops') } } };
  const { consumeInvite } = loadAccount(fakeDb(tree));
  await consumeInvite(call('u-a', 'a@example.invalid', 't2'));
  assert.equal(tree.users['u-a'].pass, undefined, 'League Operations cannot hand out a League card, let alone the Skeleton key');
  assert.equal(tree.users['u-a'].role, 'staff');
  await assert.rejects(consumeInvite(call('u-b', 'b@example.invalid', 't3')), /cannot be used/);
  assert.equal(tree.users['u-b'], undefined);
});
