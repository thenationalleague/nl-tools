/* The access sweep of 14/11/2026: anyone on the internet can create an
   account (email sign-up is open, and the sign-up page uses it), so nothing
   a person can do before being approved may give them anything.

   submitAccessRequest is run for real with Firebase stood in. The callable
   request shape is the documented one, https://firebase.google.com/docs/functions/callable?gen=2nd
   (request.auth.uid, request.auth.token, request.data); the Admin SDK
   calls are the four account.js makes (ref().once('value') → snapshot.val()
   and .forEach, ref().set, ref().push), as in
   https://firebase.google.com/docs/reference/admin/node/firebase-admin.database.reference. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { REPO } from './load-canon.mjs';
import { plan } from '../scripts/tidy-waiting-accounts.mjs';

const require = createRequire(import.meta.url);

function loadAccount(db) {
  const stubs = {
    'firebase-functions/v2/https': { onCall: (opts, fn) => fn, HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } },
    'firebase-functions/logger': { info() {}, warn() {}, error() {} },
    'firebase-admin': { database: () => db, auth: () => ({ deleteUser: async () => {} }) }
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) { return stubs[req] || orig.call(this, req, ...rest); };
  try {
    const p = join(REPO, 'functions/account.js');
    delete require.cache[p];
    return require(p);
  } finally { Module._load = orig; }
}

function fakeDb(tree) {
  const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), tree);
  const put = (p, v) => {
    const ks = p.split('/').filter(Boolean); let o = tree;
    ks.slice(0, -1).forEach((k) => { o = (o[k] ||= {}); });
    o[ks[ks.length - 1]] = v;
  };
  let n = 0;
  const ref = (p) => ({
    once: async () => {
      const v = get(p);
      return { val: () => (v === undefined ? null : v),
        forEach: (cb) => Object.entries(v || {}).forEach(([k, x]) => cb({ key: k, val: () => x })) };
    },
    set: async (v) => put(p, v),
    push: async (v) => put(p + '/k' + (++n), v),
    update: async (u) => Object.entries(u).forEach(([k, v]) => put(p + '/' + k, v))
  });
  return { ref };
}

test('a sign-up request leaves the person holding nothing the rules read', async () => {
  const tree = { users: {}, admin: { requests: {} } };
  const { submitAccessRequest } = loadAccount(fakeDb(tree));
  await submitAccessRequest({
    auth: { uid: 'u-new', token: { email: 'someone@example.invalid' } },
    data: { name: 'Pat Example', club: 'Testham Town', jobTitle: 'Secretary',
      tools: { 'ops-financial-benchmarking': 'admin', 'ops-people': 'access' } }
  });
  const u = tree.users['u-new'];
  assert.equal(u.role, 'pending', 'no club role');
  assert.equal(u.club, undefined, 'no club');
  assert.deepEqual(u.tools, {}, 'no tools');
  assert.equal(u.pending, true);
  const req = Object.values(tree.admin.requests)[0];
  assert.equal(req.club, 'Testham Town', 'the club asked for lives on the request');
  assert.deepEqual(req.tools, { 'ops-financial-benchmarking': 'access', 'ops-people': 'access' });
});

test('approving writes the club from the request and the tools whole; declining clears all three', () => {
  const src = readFileSync(join(REPO, 'access/index.html'), 'utf8');
  const approve = src.slice(src.indexOf('function doApprove('), src.indexOf('function rejectRequest('));
  assert.match(approve, /updates\[base \+ 'club'\] = r\.club \|\| '';/);
  assert.match(approve, /updates\[base \+ 'tools'\] = keep;/);
  assert.ok(!/updates\[base \+ 'tools\/' \+ k\]/.test(approve), 'tools are written whole, not merged');
  const reject = src.slice(src.indexOf('function rejectRequest('), src.indexOf('function rejectRequest(') + 1400);
  for (const k of ["'/role'] = 'rejected'", "'/club'] = null", "'/tools'] = null"]) assert.ok(reject.includes(k), k);
});

test('the one-off tidy clears waiting and declined accounts, and nobody else', () => {
  const { updates, n } = plan({
    a: { pending: true, role: 'club', club: 'Testham Town', tools: { x: 'access' } },
    b: { pending: true, role: 'pending', tools: {} },
    c: { rejected: true, role: 'club', club: 'Testham Town' },
    d: { role: 'staff', club: '', tools: { y: 'admin' } },
    e: { pending: false, rejected: false, role: 'club-admin', club: 'Testham Town' }
  });
  assert.deepEqual(n, { waiting: 2, declined: 1, waitingFixed: 1, declinedFixed: 1, withPass: 0 });
  assert.deepEqual(updates, {
    'users/a/role': 'pending', 'users/a/club': null, 'users/a/tools': null,
    'users/c/role': 'rejected', 'users/c/club': null, 'users/c/tools': null
  });
});

test('the request emails need the requester\'s own sign-in and take nothing from the request', () => {
  const src = readFileSync(join(REPO, 'gas/Notifications.js'), 'utf8');
  for (const fn of ['notifyAdmin', 'confirmRequest']) {
    const body = src.slice(src.indexOf('function ' + fn + '('), src.indexOf('\n}\n', src.indexOf('function ' + fn + '(')));
    assert.match(body, /var r = requester_\(body\);/, fn);
    assert.ok(!/body\.(name|email|club|clubRole|portalUrl|tools)/.test(body), fn + ' still reads the request');
  }
  assert.match(src, /verifyIdentity_\(body && body\.idToken\)/);
  assert.match(src, /u\.data\.pending !== true/, 'only for a request that is waiting');
  const page = readFileSync(join(REPO, 'index.html'), 'utf8');
  assert.match(page, /action: 'notifyAdmin', idToken: idToken/);
  assert.match(page, /action: 'confirmRequest', idToken: idToken/);
});

test('audit entries are signed by whoever writes them; the unused request nodes are gone', () => {
  const r = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8')).rules.admin;
  assert.match(r.audit.$entry['.write'], /newData\.child\('uid'\)\.val\(\) === auth\.uid/);
  assert.match(r['audit-by-user'].$uid.$entry['.write'], /\$uid === auth\.uid \|\| newData\.child\('targetUid'\)\.val\(\) === \$uid/);
  assert.equal(r['tool-requests'], undefined);
  assert.equal(r.notifications, undefined);
});
