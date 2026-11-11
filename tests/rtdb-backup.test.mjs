/* Database backups — the check, the monthly copy and the restore
   (scripts/rtdb-backup.mjs).

   The Storage and database stubs below follow the documented shapes, not
   memory:
     objects.list → { items: [{ name, size (a string), timeCreated }],
                      nextPageToken }   https://cloud.google.com/storage/docs/json_api/v1/objects/list
     objects.rewrite → { done, rewriteToken }  https://cloud.google.com/storage/docs/json_api/v1/objects/rewrite
     backup names → YYYY-MM-DDTHH:MM:SSZ_<DATABASE_NAME>_data.json[.gz]
                                        https://firebase.google.com/docs/database/backups
     RTDB REST GET <path>.json → the value, or null when absent
                                        https://firebase.google.com/docs/reference/rest/database */

import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';
import * as B from '../scripts/rtdb-backup.mjs';

const item = (name, size = 1000) => ({ name, size: String(size), timeCreated: '2026-11-10T03:00:00Z' });
const DB = 'nl-tools-default-rtdb';

test('finds backups by the end of their name, folder or not', () => {
  const items = [
    item(`2026-11-09T03:12:00Z_${DB}_data.json.gz`),
    item(`2026-11-09T03:12:00Z_${DB}_rules.json`),
    item(`somefolder/2026-11-10T03:12:00Z_${DB}_data.json.gz`),
    item('notes.txt')
  ];
  const files = B.dataFiles(items);
  assert.equal(files.length, 2);
  assert.equal(files[0].stamp, '2026-11-10T03:12:00Z', 'newest first');
});

test('picks the newest backup on a day, in a month, or overall', () => {
  const items = [
    item(`2026-10-31T03:00:00Z_${DB}_data.json.gz`),
    item(`2026-11-01T03:00:00Z_${DB}_data.json.gz`),
    item(`2026-11-09T03:00:00Z_${DB}_data.json.gz`)
  ];
  assert.equal(B.pick(items, '').stamp, '2026-11-09T03:00:00Z');
  assert.equal(B.pick(items, '2026-11').stamp, '2026-11-09T03:00:00Z');
  assert.equal(B.pick(items, '2026-10').stamp, '2026-10-31T03:00:00Z');
  assert.equal(B.pick(items, '2026-11-01').stamp, '2026-11-01T03:00:00Z');
  assert.equal(B.pick(items, '2026-09'), null);
  assert.throws(() => B.pick(items, '10/11/2026'), /2026-11-10/);
});

test('the check fails when the backup stops, or comes out half the size', () => {
  const now = Date.parse('2026-11-11T10:00:00Z');
  const ok = B.checkFresh([
    item(`2026-11-10T03:00:00Z_${DB}_data.json.gz`, 900),
    item(`2026-11-11T03:00:00Z_${DB}_data.json.gz`, 1000)
  ], now, 26);
  assert.equal(ok.ok, true, ok.lines.join('\n'));

  const stale = B.checkFresh([item(`2026-11-09T03:00:00Z_${DB}_data.json.gz`)], now, 26);
  assert.equal(stale.ok, false);
  assert.match(stale.lines.join('\n'), /stopped/);

  const shrunk = B.checkFresh([
    item(`2026-11-10T03:00:00Z_${DB}_data.json.gz`, 1000),
    item(`2026-11-11T03:00:00Z_${DB}_data.json.gz`, 400)
  ], now, 26);
  assert.equal(shrunk.ok, false);
  assert.match(shrunk.lines.join('\n'), /half the size/);

  assert.equal(B.checkFresh([], now, 26).ok, false);
});

test('a Club Directory club is restored in all three places at once', () => {
  assert.deepEqual(B.clubPaths('Barnet'), [
    'app-data/ops-club-directory/clubs/Barnet',
    'app-data/ops-club-directory/published/clubs/Barnet',
    'app-data/ops-club-directory/private/Barnet'
  ]);
});

test('never the whole database, never the audit log, never a broken path', () => {
  for (const bad of ['', '/', '/users', 'users/', 'a//b', 'a.b', 'admin/audit', 'admin/audit-by-user/x']) {
    assert.throws(() => B.checkPath(bad), undefined, bad);
  }
  assert.equal(B.checkPath('users'), 'users');
  assert.equal(B.checkPath("app-data/ops-club-directory/clubs/King's Lynn Town"),
    "app-data/ops-club-directory/clubs/King's Lynn Town");
});

test('compares the way the database stores things', () => {
  /* An array and its index-keyed object are the same value to RTDB, and a
     null is no value at all. */
  assert.equal(B.compare(['a', 'b'], { 0: 'a', 1: 'b' }).same, true);
  assert.equal(B.compare({ a: 1, b: null }, { a: 1 }).same, true);
  const c = B.compare({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 });
  assert.deepEqual([c.onlyBackup, c.differ, c.onlyLive], [1, 1, 1]);
});

test('a gzipped backup opens whether or not Storage already unzipped it', () => {
  const json = '{"a":1}';
  assert.equal(B.unpack(gzipSync(json)).toString(), json);
  assert.equal(B.unpack(Buffer.from(json)).toString(), json);
});

/* ----------------------------------------------- the whole restore, run */

/* A fake Storage and database on one port-0 server (a fixed port is how a
   leftover process once made a dead suite look like a pass). */
function fakeCloud(state) {
  return createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const send = (code, v, raw) => { res.writeHead(code); res.end(raw || JSON.stringify(v)); };
      if (req.headers.authorization !== 'Bearer t') return send(401, { error: 'no token' });
      const list = u.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/o$/);
      if (list) {
        const items = Object.keys(state.buckets[list[1]] || {})
          .filter((n) => n.startsWith(u.searchParams.get('prefix') || ''))
          .map((n) => ({ name: n, size: String(state.buckets[list[1]][n].length), timeCreated: 'x' }));
        return send(200, { items });
      }
      const get = u.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
      if (get && u.searchParams.get('alt') === 'media') {
        const v = (state.buckets[get[1]] || {})[decodeURIComponent(get[2])];
        return v ? send(200, null, v) : send(404, { error: 'none' });
      }
      const up = u.pathname.match(/^\/upload\/storage\/v1\/b\/([^/]+)\/o$/);
      if (up) { (state.buckets[up[1]] ||= {})[u.searchParams.get('name')] = Buffer.from(body); return send(200, {}); }
      if (u.pathname.startsWith('/db/')) {
        const path = u.pathname.slice(4).replace(/\.json$/, '').split('/').map(decodeURIComponent);
        if (req.method === 'PUT') {
          state.writes.push(path.join('/'));
          let o = state.db;
          path.slice(0, -1).forEach((k) => { o = (o[k] ||= {}); });
          o[path[path.length - 1]] = JSON.parse(body);
          return send(200, {});
        }
        return send(200, path.reduce((o, k) => (o == null ? null : (o[k] ?? null)), state.db));
      }
      send(404, { error: 'unknown ' + u.pathname });
    });
  });
}

async function runRestore(env, state) {
  const srv = fakeCloud(state);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), 'rtdb-restore-'));
  const sumFile = join(dir, 'summary.md');
  writeFileSync(sumFile, '');
  /* The script talks to googleapis.com; point it here by loading it with
     fetch rewritten, in a child so the real module is what runs. */
  const shim = join(dir, 'shim.mjs');
  writeFileSync(shim, `const f = globalThis.fetch;
globalThis.fetch = (url, o) => f(String(url).replace('https://storage.googleapis.com', '${base}'), o);
await import(${JSON.stringify(join(REPO, 'scripts/rtdb-backup.mjs'))});`);
  /* spawn, not spawnSync: a blocked event loop could not answer the
     child's requests to the server above. */
  const r = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', `process.argv[1]=${JSON.stringify(join(REPO, 'scripts/rtdb-backup.mjs'))};process.argv[2]='restore';import(${JSON.stringify(shim)})`], {
      env: { ...process.env, TOKEN: 't', DB: base + '/db', SOURCE_BUCKET: 'daily', SAVE_BUCKET: 'monthly', GITHUB_STEP_SUMMARY: sumFile, ...env }
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  srv.close();
  return { ...r, summary: readFileSync(sumFile, 'utf8') };
}

const PRIVATE_EMAIL = 'someone.private@example.invalid';
function cloudWith() {
  const backupDb = { 'app-data': { 'ops-club-directory': {
    clubs: { Barnet: { people: [{ name: 'Pat Example', emails: [{ address: 'pat@example.invalid' }] }] } },
    published: { clubs: { Barnet: { people: [{ name: 'Pat Example' }] } } },
    private: { Barnet: { code: 'BAR', people: { p1: { emails: [{ address: PRIVATE_EMAIL }] } } } }
  } } };
  return {
    buckets: { daily: { [`2026-11-10T03:00:00Z_${DB}_data.json.gz`]: gzipSync(JSON.stringify(backupDb)) }, monthly: {} },
    db: { 'app-data': { 'ops-club-directory': { clubs: { Barnet: { people: [] } }, published: { clubs: {} }, private: {} } } },
    writes: []
  };
}

test('report mode changes nothing and prints no names or addresses', async () => {
  const state = cloudWith();
  const r = await runRestore({ CLUB: 'Barnet', MODE: 'report' }, state);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(state.writes, []);
  assert.match(r.summary, /Restoring would bring back/);
  for (const secret of [PRIVATE_EMAIL, 'pat@example.invalid', 'Pat Example', 'BAR']) {
    assert.ok(!(r.stdout + r.summary).includes(secret), `the public log shows ${secret}`);
  }
});

test('restore saves what was live first, writes all three, and logs it', async () => {
  const state = cloudWith();
  const r = await runRestore({ CLUB: 'Barnet', MODE: 'restore' }, state);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(Object.keys(state.buckets.monthly).filter((n) => n.startsWith('restore-saves/')).length, 3);
  assert.deepEqual(state.writes.slice(0, 3), [
    'app-data/ops-club-directory/clubs/Barnet',
    'app-data/ops-club-directory/published/clubs/Barnet',
    'app-data/ops-club-directory/private/Barnet'
  ]);
  assert.equal(state.db['app-data']['ops-club-directory'].private.Barnet.people.p1.emails[0].address, PRIVATE_EMAIL);
  assert.match(state.writes[3], /^admin\/audit\//);
  assert.ok(!(r.stdout + r.summary).includes(PRIVATE_EMAIL));
});

test('asks for a club or a path, not both', async () => {
  const r = await runRestore({ CLUB: 'Barnet', PATHS: 'users', MODE: 'report' }, cloudWith());
  assert.equal(r.status, 1);
  assert.match(r.stdout, /either the club or the path/);
});
