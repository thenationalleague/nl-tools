#!/usr/bin/env node
/* =========================================================================
   NL Tools — database backups: check, monthly copy, restore
   File: scripts/rtdb-backup.mjs
   Version: v1.0 (11/11/2026)

   Run by three workflows, never by hand:
     Timer · Check last night's backup   (rtdb-backup-check.yml)   → check
     Timer · Monthly database copy       (rtdb-backup-monthly.yml) → monthly
     Recovery · Restore from backup      (rtdb-restore.yml)        → restore

   WHERE THE BACKUPS ARE
   Firebase's own daily backup of the nl-tools database writes one file a day
   to the bucket nl-tools-default-rtdb-backups, and that bucket deletes
   anything older than 30 days. The monthly copy keeps the backup from the
   start of each month for a year, in a bucket of its own,
   nl-tools-monthly-backups, which nothing on the website can read.

   File names, from https://firebase.google.com/docs/database/backups
   (checked 11/11/2026):
     YYYY-MM-DDTHH:MM:SSZ_<DATABASE_NAME>_data.json   (+ .gz when gzipped,
     YYYY-MM-DDTHH:MM:SSZ_<DATABASE_NAME>_rules.json   which is the default)
   The page does not say whether they sit in a folder, so everything here
   finds files by the end of their name, never by a guessed path.

   Storage is reached through its JSON API with the workflow's access token:
   https://cloud.google.com/storage/docs/json_api/v1/objects/list (items[]
   with name, size as a string, timeCreated), .../objects/get with alt=media,
   .../objects/rewrite (copy between buckets, repeated until done), and
   .../objects/insert with uploadType=media.

   THE LOGS ARE PUBLIC. This repo is public, so anyone can read a workflow
   run's log. Nothing here prints a value from the database: reports are
   counts and sizes only, never keys (some keys are user ids) and never
   values (names, emails, phone numbers).
   ========================================================================= */

import { gunzipSync, gzipSync } from 'node:zlib';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DATA_RE = /_data\.json(\.gz)?$/;
const STAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)_/;

/* The ISO time a backup file was taken, from its name, or null. */
export function stampOf(name) {
  const base = String(name || '').split('/').pop();
  const m = base.match(STAMP_RE);
  return m ? m[1] : null;
}

/* Storage list items → the data files only, newest first. */
export function dataFiles(items) {
  return (items || [])
    .filter((o) => o && DATA_RE.test(o.name) && stampOf(o.name))
    .map((o) => ({ name: o.name, size: Number(o.size) || 0, stamp: stampOf(o.name) }))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
}

/* The backup to use. `when` is the start of a date: "2026-11-10" for that
   day, "2026-11" for that month, blank for the newest. Newest match wins. */
export function pick(items, when) {
  const w = String(when || '').trim();
  if (w && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(w)) {
    throw new Error('The date must look like 2026-11-10 (a day) or 2026-11 (a month).');
  }
  return dataFiles(items).find((f) => !w || f.stamp.startsWith(w)) || null;
}

/* Did last night's backup land, and does it look whole? Fails if the newest
   is older than maxHours, or under half the size of the one before it (a
   database does not lose half of itself overnight; a broken backup does). */
export function checkFresh(items, now, maxHours) {
  const files = dataFiles(items);
  const lines = [];
  if (!files.length) {
    return { ok: false, lines: ['No backup files found in the bucket at all.'] };
  }
  const [newest, before] = files;
  const ageH = (now - Date.parse(newest.stamp)) / 36e5;
  lines.push(`Newest backup: ${newest.stamp}, ${ageH.toFixed(1)} hours ago, ${humanBytes(newest.size)}.`);
  if (before) lines.push(`The one before: ${before.stamp}, ${humanBytes(before.size)}.`);
  lines.push(`Backups held: ${files.length}, oldest ${files[files.length - 1].stamp}.`);
  let ok = true;
  if (ageH > maxHours) {
    ok = false;
    lines.push(`PROBLEM: nothing new in ${maxHours} hours. The daily backup has stopped.`);
  }
  if (before && newest.size < before.size / 2) {
    ok = false;
    lines.push('PROBLEM: the newest backup is less than half the size of the one before. It may be broken.');
  }
  return { ok, lines };
}

export function humanBytes(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' bytes';
}

/* The three places one Club Directory club lives: the working copy, the
   published copy, and its private details. They are restored together or
   not at all, or the published page and the editor disagree. */
export function clubPaths(club) {
  const c = String(club || '').trim();
  const root = 'app-data/ops-club-directory';
  return [root + '/clubs/' + c, root + '/published/clubs/' + c, root + '/private/' + c];
}

/* A path this tool will write to. Never the whole database, never the audit
   log, and nothing Firebase would refuse as a key. */
export function checkPath(p) {
  const s = String(p || '').trim();
  if (!s || s === '/') throw new Error('Name a part of the database. Restoring the whole of it is not offered here.');
  if (s.startsWith('/') || s.endsWith('/') || s.includes('//')) throw new Error(`"${s}" has a stray slash.`);
  if (/[.#$\[\]]/.test(s)) throw new Error(`"${s}" contains a character a database path cannot have.`);
  if (/^admin\/audit/.test(s)) throw new Error('The audit log is not restored: it is the record of what happened.');
  return s;
}

/* The value at a path in a parsed backup, or undefined. */
export function at(tree, path) {
  return path.split('/').reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), tree);
}

/* The database stores {0:a,1:b} and [a,b] as the same thing and drops nulls,
   so compare the forms it would hand back, not the forms that went in. */
export function normalise(v) {
  if (Array.isArray(v)) {
    const o = {};
    v.forEach((x, i) => { if (x != null) o[i] = normalise(x); });
    return Object.keys(o).length ? o : null;
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      const n = normalise(v[k]);
      if (n != null) o[k] = n;
    }
    return Object.keys(o).length ? o : null;
  }
  return v === undefined ? null : v;
}

function leaves(v, p = '', out = new Map()) {
  if (v && typeof v === 'object') for (const k of Object.keys(v)) leaves(v[k], p + '/' + k, out);
  else if (v != null) out.set(p, JSON.stringify(v));
  return out;
}

/* How far the live copy is from the backup, in counts only. */
export function compare(backup, live) {
  const a = leaves(normalise(backup)), b = leaves(normalise(live));
  let onlyBackup = 0, onlyLive = 0, differ = 0;
  for (const [k, v] of a) { if (!b.has(k)) onlyBackup++; else if (b.get(k) !== v) differ++; }
  for (const k of b.keys()) if (!a.has(k)) onlyLive++;
  return { backupValues: a.size, liveValues: b.size, onlyBackup, onlyLive, differ,
    same: !onlyBackup && !onlyLive && !differ };
}

export function describe(path, c) {
  if (c.same) return `${path}: live already matches the backup (${c.backupValues} values). Nothing to restore.`;
  return `${path}: the backup holds ${c.backupValues} values, live holds ${c.liveValues}. ` +
    `Restoring would bring back ${c.onlyBackup}, change ${c.differ} and remove ${c.onlyLive}.`;
}

/* Backups come gzipped, but Storage may undo the gzip on the way down if the
   file is marked that way, so look at the bytes rather than the name. */
export function unpack(buf) {
  const b = Buffer.from(buf);
  return (b[0] === 0x1f && b[1] === 0x8b) ? gunzipSync(b) : b;
}

/* ------------------------------------------------------------- network */

const GCS = 'https://storage.googleapis.com/storage/v1';
const enc = encodeURIComponent;

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + process.env.TOKEN, ...(opts.headers || {}) }
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    const err = new Error(`${opts.method || 'GET'} ${url.split('?')[0]} → HTTP ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

export async function listBucket(bucket, prefix = '') {
  const items = [];
  let token = '';
  do {
    const q = new URLSearchParams({ fields: 'items(name,size,timeCreated),nextPageToken' });
    if (prefix) q.set('prefix', prefix);
    if (token) q.set('pageToken', token);
    const page = await (await api(`${GCS}/b/${bucket}/o?${q}`)).json();
    items.push(...(page.items || []));
    token = page.nextPageToken || '';
  } while (token);
  return items;
}

async function download(bucket, name) {
  const res = await api(`${GCS}/b/${bucket}/o/${enc(name)}?alt=media`);
  return unpack(await res.arrayBuffer());
}

async function upload(bucket, name, body, type = 'application/json') {
  await api(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${enc(name)}`,
    { method: 'POST', headers: { 'Content-Type': type }, body });
}

async function copy(srcBucket, src, dstBucket, dst) {
  let token = '';
  for (;;) {
    const q = token ? '?rewriteToken=' + enc(token) : '';
    const r = await (await api(`${GCS}/b/${srcBucket}/o/${enc(src)}/rewriteTo/b/${dstBucket}/o/${enc(dst)}${q}`,
      { method: 'POST' })).json();
    if (r.done) return;
    token = r.rewriteToken;
  }
}

const dbUrl = (path) => `${process.env.DB}/${path.split('/').map(enc).join('/')}.json`;

async function dbGet(path) {
  return (await api(dbUrl(path))).json();
}

async function dbPut(path, value) {
  await api(dbUrl(path) + '?print=silent', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value)
  });
}

function summary(lines) {
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

/* ----------------------------------------------------------- commands */

async function cmdCheck() {
  const { DAILY, MAX_HOURS = '26' } = process.env;
  const r = checkFresh(await listBucket(DAILY), Date.now(), Number(MAX_HOURS));
  summary(['## Last night\'s backup', '', ...r.lines.map((l) => '- ' + l)]);
  if (!r.ok) {
    console.log('::error::The daily database backup needs looking at. See the summary above.');
    process.exitCode = 1;
  }
}

/* The newest daily backup, copied into this month's folder of the monthly
   bucket with its rules file. If the daily backups have stopped, the copy
   is taken straight from the database instead, so a month is never missed
   because the other thing broke. */
async function cmdMonthly() {
  const { DAILY, MONTHLY } = process.env;
  const month = new Date().toISOString().slice(0, 7);
  const have = await listBucket(MONTHLY, month + '/');
  const lines = [`## Monthly copy for ${month}`, ''];

  const newest = pick(await listBucket(DAILY), '');
  const fresh = newest && (Date.now() - Date.parse(newest.stamp)) / 36e5 < 48;
  if (fresh) {
    const rules = newest.name.replace(DATA_RE, '_rules.json');
    for (const [src, label] of [[newest.name, 'data'], [rules, 'rules'], [rules + '.gz', 'rules']]) {
      const dst = month + '/' + src.split('/').pop();
      if (have.some((o) => o.name === dst)) { lines.push(`- Already copied: ${dst}`); continue; }
      try {
        await copy(DAILY, src, MONTHLY, dst);
        lines.push(`- Copied the ${label} file: ${dst}`);
      } catch (e) {
        if (label === 'rules' && e.status === 404) continue;   // only one of .json / .json.gz exists
        throw e;
      }
    }
    lines.push('', `Taken from Firebase's daily backup of ${newest.stamp}.`);
  } else {
    lines.push('- The daily backups have not run in two days, so this copy is taken straight from the database.');
    const raw = Buffer.from(await (await api(`${process.env.DB}/.json?format=export`)).arrayBuffer());
    JSON.parse(raw.toString('utf8'));   // refuse to store something that is not whole
    const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const dst = `${month}/${stamp}_nl-tools-default-rtdb_data.json.gz`;
    await upload(MONTHLY, dst, gzipSync(raw), 'application/gzip');
    lines.push(`- Saved: ${dst} (${humanBytes(raw.length)} before compression)`);
  }

  const all = dataFiles(await listBucket(MONTHLY));
  lines.push('', `Monthly copies held: ${all.length}. Each is kept for a year.`);
  all.forEach((f) => lines.push(`- ${f.stamp.slice(0, 10)}: ${humanBytes(f.size)}`));
  summary(lines);
}

async function cmdRestore() {
  const { SOURCE_BUCKET, SAVE_BUCKET, WHEN = '', CLUB = '', PATHS = '', MODE = 'report' } = process.env;
  if (!!CLUB.trim() === !!PATHS.trim()) {
    throw new Error('Fill in either the club or the path, not both and not neither.');
  }
  const paths = (CLUB.trim() ? clubPaths(CLUB) : PATHS.split(',')).map((p) => checkPath(p));

  const file = pick(await listBucket(SOURCE_BUCKET), WHEN);
  if (!file) {
    const held = dataFiles(await listBucket(SOURCE_BUCKET)).map((f) => f.stamp.slice(0, 10));
    throw new Error(`No backup${WHEN ? ' from ' + WHEN : ''} in ${SOURCE_BUCKET}. ` +
      `Dates held: ${held.length ? [...new Set(held)].join(', ') : 'none'}.`);
  }
  const tree = JSON.parse((await download(SOURCE_BUCKET, file.name)).toString('utf8'));

  const lines = [`## ${MODE === 'restore' ? 'Restore' : 'Report'} from the backup of ${file.stamp}`, ''];
  const plan = [];
  for (const p of paths) {
    const backup = at(tree, p);
    const live = await dbGet(p);
    const c = compare(backup, live);
    if (normalise(backup) == null) {
      lines.push(`- ${p}: not in that backup, so there is nothing to bring back. Left alone.`);
      continue;
    }
    lines.push('- ' + describe(p, c));
    if (!c.same) plan.push({ p, backup, live });
  }

  if (MODE !== 'restore') {
    lines.push('', plan.length
      ? 'Nothing was changed. To put these back, run this again with mode **restore** and type restore in the confirm box.'
      : 'Nothing was changed, and nothing needs to be.');
    summary(lines);
    return;
  }

  if (!plan.length) { lines.push('', 'Nothing needed restoring.'); summary(lines); return; }

  /* What is there now is saved first, in the private bucket, so a restore can
     itself be undone. */
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const x of plan) {
    const name = `restore-saves/${runStamp}/${x.p.replace(/\//g, '__')}.json`;
    await upload(SAVE_BUCKET, name, JSON.stringify(x.live));
    lines.push(`- Saved what was live at ${x.p} to ${SAVE_BUCKET}/${name}`);
  }
  for (const x of plan) {
    await dbPut(x.p, x.backup);
    const after = compare(x.backup, await dbGet(x.p));
    if (!after.same) throw new Error(`${x.p} was written but does not read back as the backup. Look at it now.`);
    lines.push(`- Restored ${x.p}, and it reads back exactly as the backup.`);
  }

  /* One line in the portal's audit, so the restore shows up where every
     other change does. */
  const now = Date.now();
  const key = now + '_' + Math.random().toString(36).slice(2, 8);
  await dbPut('admin/audit/' + key, {
    action: 'backup_restore',
    detail: `${plan.map((x) => x.p).join(', ')} restored from the backup of ${file.stamp}`,
    uid: 'github-actions', name: 'Recovery · Restore from backup', email: '',
    ts: now, at: new Date(now).toISOString()
  });
  summary(lines);
}

const COMMANDS = { check: cmdCheck, monthly: cmdMonthly, restore: cmdRestore };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = COMMANDS[process.argv[2]];
  if (!run) { console.error('usage: node scripts/rtdb-backup.mjs check|monthly|restore'); process.exit(2); }
  run().catch((e) => {
    console.log('::error::' + String((e && e.message) || e).replace(/\n/g, ' '));
    process.exit(1);
  });
}
