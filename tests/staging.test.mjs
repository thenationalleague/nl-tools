/* Staging (system/staging.md): a staging copy reads live data and never
   writes, and opens only to the Skeleton key and to Tester-key holders at
   their own live level. NL.staging (nl-utils v1.75), auth-guard v16.6,
   NL.codeGate.door, nl-topbar v1.13 and scripts/check-staging.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { REPO, freshCanon } from './load-canon.mjs';
import { check, markerOf } from '../scripts/check-staging.mjs';

/* A Firebase stub that records which writes reach the database. The shapes
   follow the compat SDK the pages load (10.12.0): Reference.set/update/
   push/remove/transaction return promises, push() with no value returns a
   ThenableReference with .key, storage Reference.put returns an UploadTask
   with on('state_changed', next, error, complete)
   (https://firebase.google.com/docs/reference/js/v8/firebase.database.Reference,
    https://firebase.google.com/docs/reference/js/v8/firebase.storage.Reference). */
function fakeFirebase() {
  const reached = [];
  function Reference(path) { this.path = path; }
  Reference.prototype.toString = function () { return 'https://nl-tools-default-rtdb.example/' + this.path; };
  for (const m of ['set', 'setWithPriority', 'setPriority', 'remove', 'transaction']) {
    Reference.prototype[m] = function () { reached.push(m + ' ' + this.path); return Promise.resolve(); };
  }
  Reference.prototype.update = function (v) { reached.push('update ' + this.path + ' ' + Object.keys(v).join(',')); return Promise.resolve(); };
  Reference.prototype.push = function (v) {
    const child = new Reference(this.path + '/-K1');
    child.key = '-K1';
    if (v !== undefined) reached.push('push ' + this.path);
    return child;
  };
  function OnDisconnect() {}
  OnDisconnect.prototype.set = function () { reached.push('onDisconnect'); return Promise.resolve(); };
  function SRef(p) { this.fullPath = p; }
  SRef.prototype.put = function () { reached.push('put ' + this.fullPath); return { on() {}, then: (f) => Promise.resolve().then(f) }; };
  SRef.prototype.delete = function () { reached.push('delete ' + this.fullPath); return Promise.resolve(); };
  const database = Object.assign(() => ({}), { Reference, OnDisconnect });
  const storage = Object.assign(() => ({}), { Reference: SRef });
  return { reached, firebase: { database, storage, app() { return {}; } }, Reference, SRef };
}

function staged(marker = { from: 'abc1234' }) {
  const fb = fakeFirebase();
  const NL = freshCanon({ firebase: fb.firebase, NL_STAGING: marker });
  const toasts = [];
  NL.toast = (msg, kind) => toasts.push(msg + '|' + kind);
  return { NL, fb, toasts };
}

test('on a staging copy, every database write is refused and none reaches the database', async () => {
  const { fb, toasts } = staged();
  const r = new fb.Reference('app-data/ops-club-directory/clubs/ALD');
  for (const p of [r.set({ a: 1 }), r.update({ a: 1 }), r.remove(), r.transaction(() => 1), r.setWithPriority(1, 1)]) {
    await assert.rejects(p, /Staging: not saved/);
  }
  const child = r.push({ a: 1 });
  assert.equal(child.key, '-K1', 'push with a value still hands back a key');
  await assert.rejects(child, /Staging: not saved/);
  await assert.rejects(new fb.firebase.database.OnDisconnect().set(1), /Staging/);
  assert.deepEqual(fb.reached, [], 'nothing reached the database');
  assert.equal(toasts.length, 1, 'one toast, not one per write');
  assert.equal(toasts[0], 'Staging: not saved|error');
});

test('push() with no value only makes a key, and is allowed', () => {
  const { fb } = staged();
  const child = new fb.Reference('app-data/x').push();
  assert.equal(child.key, '-K1');
  assert.deepEqual(fb.reached, []);
});

test('the audit hook and presence are refused quietly', async () => {
  const { fb, toasts } = staged();
  await assert.rejects(new fb.Reference('admin/audit/-K9').set({}), /Staging/);
  await assert.rejects(new fb.Reference('presence/u1').set(true), /Staging/);
  assert.equal(toasts.length, 0);
});

test('the declared sign-in path is allowed: Programme Packs can ask for its session', async () => {
  const { fb, NL } = staged();
  await new fb.Reference('app-data/media-programme/authRequests/u1').set({ at: 1 });
  assert.deepEqual(fb.reached, ['set app-data/media-programme/authRequests/u1']);
  assert.equal(NL.staging.allowed('/app-data/media-programme/authRequests/u1'), true);
  assert.equal(NL.staging.allowed('app-data/media-programme/files/ALD/x'), false);
  /* An update that touches the allowed path and another is refused whole. */
  await assert.rejects(new fb.Reference('app-data/media-programme').update({ 'authRequests/u1': 1, 'files/ALD/x': 1 }), /Staging/);
});

test('Storage uploads and deletes are refused: the upload task reports the error', async () => {
  const { fb } = staged();
  const task = new fb.SRef('programme/ALD/pack.pdf').put(new Blob(['x']));
  const err = await new Promise((res) => task.on('state_changed', () => {}, res));
  assert.match(err.message, /Staging: not saved/);
  await assert.rejects(task, /Staging/);
  await assert.rejects(new fb.SRef('programme/ALD/pack.pdf').delete(), /Staging/);
  assert.deepEqual(fb.reached, []);
});

test('off a staging copy nothing changes', async () => {
  const fb = fakeFirebase();
  const NL = freshCanon({ firebase: fb.firebase });
  await new fb.Reference('app-data/x').set(1);
  assert.deepEqual(fb.reached, ['set app-data/x']);
  assert.equal(NL.staging.on(), false);
  assert.equal(NL.staging.gate(null, null, 'admin'), 'admin', 'the gate passes the live level through');
});

test('who opens a staging copy: the Skeleton key, and Testers at their own live level', () => {
  const { NL } = staged();
  const tool = { permissions: { grants: {} } };
  const league = (keys, extra) => Object.assign({ base: 'league', keys }, extra || {});
  const tester = league({ 'league-tester': { given: 1 } });
  assert.equal(NL.staging.gate(league({}, { skeleton: true }), tool, 'off'), 'manage', 'Skeleton key: Manage');
  assert.equal(NL.staging.gate(league({}, { skeleton: true }), tool, 'access'), 'manage');
  assert.equal(NL.staging.gate(league({}, { skeleton: true }), tool, 'admin'), 'admin', 'in auth-guard\'s words, admin');
  assert.equal(NL.staging.gate(tester, tool, 'access'), 'access', 'Tester at Access stays Access');
  assert.equal(NL.staging.gate(tester, tool, 'admin'), 'admin', 'Tester at Manage stays Manage');
  assert.equal(NL.staging.gate(tester, tool, 'off'), 'off', 'Tester alone does not open a tool their pass does not');
  assert.equal(NL.staging.gate(tester, { permissions: { testers: false } }, 'access'), 'off', 'a tool closed to testers is Skeleton key only');
  assert.equal(NL.staging.gate(league({ 'league-media': { given: 1 } }), tool, 'admin'), 'off', 'no Tester key: off, whatever the live level');
  assert.equal(NL.staging.gate({ base: 'club', club: 'ALD', keys: {} }, tool, 'access'), 'off', 'a Club card: off');
  assert.equal(NL.staging.gate(null, tool, 'access'), 'off', 'no pass: off');
});

test('auth-guard, the code door and the topbar all read the marker through canon', () => {
  const guard = readFileSync(join(REPO, 'system/auth-guard.js'), 'utf8');
  assert.match(guard, /if \(window\.NL && NL\.staging && NL\.staging\.on\(\)\) \{\s*NL\.staging\.install\(\);/);
  assert.match(guard, /NL\.staging\.gate\(session\.pass, toolData,/);
  const utils = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');
  assert.match(utils, /if \(!user \|\| !user\.email\) \{ if \(staging\) stagingOff\(\); else codeDoor\(\); return; \}/, 'no code door on a staging copy');
  assert.match(utils, /if \(staging\) who\.level = window\.NL\.staging\.gate\(/);
  const bar = readFileSync(join(REPO, 'system/nl-topbar.js'), 'utf8');
  assert.match(bar, /if \(window\.NL_STAGING && !hasMeta\('robots'\)\)/, 'noindex');
  assert.match(bar, /pill pill--pending topbar__staging/, 'the Staging pill');
});

/* scripts/check-staging.mjs against a throwaway repo. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'staging-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q'); g('config', 'user.email', 't@example.invalid'); g('config', 'user.name', 't');
  const put = (p, s) => { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), s); };
  put('tool/index.html', '<html>v1</html>');
  g('add', '-A'); g('commit', '-qm', 'live');
  return { dir, g, put, sha: g('rev-parse', 'HEAD') };
}

test('the staging check: a fresh copy of an unchanged live tool is clean', () => {
  const r = repo();
  r.put('staging/tool/index.html', `<script>window.NL_STAGING = { from: '${r.sha}' };</script>`);
  r.g('add', '-A'); r.g('commit', '-qm', 'stage');
  const out = check(r.dir);
  assert.deepEqual(out.problems, []);
  assert.equal(out.copies, 1);
  assert.equal(markerOf(`window.NL_STAGING = { from: '${r.sha}' };`), r.sha);
});

test('the staging check: live changed since from, a marker or link outside staging/, and an old copy all fail', () => {
  const r = repo();
  r.put('staging/tool/index.html', `<script>window.NL_STAGING = { from: '${r.sha}' };</script>`);
  r.g('add', '-A'); r.g('commit', '-qm', 'stage');
  r.put('tool/index.html', '<html>v1 with a hot fix</html>');
  r.put('other/index.html', '<a href="/staging/tool/">try</a><script>window.NL_STAGING = {};</script>');
  r.g('add', '-A'); r.g('commit', '-qm', 'hot fix');
  const later = Date.now() + 40 * 864e5;
  const p = check(r.dir, later).problems.join('\n');
  assert.match(p, /tool\/ has changed since/);
  assert.match(p, /other\/index\.html: carries NL_STAGING outside staging/);
  assert.match(p, /other\/index\.html: links to \/staging\//);
  assert.match(p, /staged 4\d days ago/);
});

test('the staging check: a copy that loads its live folder\'s own files fails', () => {
  const r = repo();
  r.put('tool/_app.js', '1');
  r.g('add', '-A'); r.g('commit', '-qm', 'app');
  const sha = r.g('rev-parse', 'HEAD');
  r.put('staging/tool/index.html', `<script>window.NL_STAGING = { from: '${sha}' };</script><script src="/tool/_app.js?v=1"></script>`);
  assert.match(check(r.dir).problems.join('\n'), /loads \/tool\/_app\.js from live/);
  r.put('staging/tool/index.html', `<script>window.NL_STAGING = { from: '${sha}' };</script><script src="_app.js?v=1"></script><a href="/tool/">live</a>`);
  assert.deepEqual(check(r.dir).problems, [], 'relative is fine, and so is a link to the live page');
});

test('the staging check runs in lint, and CI has the history it needs', () => {
  assert.match(readFileSync(join(REPO, 'system/lint-tools.sh'), 'utf8'), /scripts\/check-staging\.mjs" --strict \|\| staging_rc=1/);
  assert.match(readFileSync(join(REPO, '.github/workflows/canon-checks.yml'), 'utf8'), /fetch-depth: 0/);
});
