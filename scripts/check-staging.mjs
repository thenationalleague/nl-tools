#!/usr/bin/env node
/* check-staging.mjs — the checks that block a PR (system/staging.md, point 4)

   A staging copy is a live tool's folder copied to staging/<path>/, with one
   extra line in its head: window.NL_STAGING = { from: '<commit sha>' };

   1. No file outside staging/ carries NL_STAGING (canon, tests, scripts and
      docs aside: they define and describe it).
   2. No page outside staging/ links to /staging/.
   3. Every staging copy names a commit (from) that this repo has, and its
      live folder has not changed since that commit: promoting would erase a
      fix made to live in the meantime. Bring staging up to date first.
   4. No staging copy has gone MAX_DAYS without real work on it: staging is
      promoted or deleted, never left. The days count from the last commit
      that changed the copy, so they roll on while the work is active. A
      lockstep canon bump (?v=N) is not work and does not restart them.
   5. A staging page loads no file from its live folder by absolute path
      (src="/club-directory/_directory.js"): it would run live's code, not
      the copy's. A tool loads its own files by relative path.

   Needs the full git history (actions/checkout fetch-depth: 0); with a
   shallow clone the commit checks fail loudly rather than pass quietly.

   Usage: node scripts/check-staging.mjs [--strict]   (lint-tools.sh runs it)
   Exit 1 under --strict when anything is found. */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MAX_DAYS = 28;
const BUMP = '/system/[a-z-]+\\.(js|css)\\?v=[0-9]+';

/* When a staging copy was last really worked on, in ms: the newest commit
   that changed its folder by more than a canon ?v= number. 0 when the copy
   is not committed yet. */
function lastWork(root, dir) {
  let log = '';
  try { log = git(root, ['log', '--format=%H %ct', '--', dir]); } catch { return 0; }
  for (const line of log.split('\n').filter(Boolean)) {
    const [sha, at] = line.split(' ');
    try { git(root, ['diff', '--quiet', '-I', BUMP, sha + '^', sha, '--', dir]); }
    catch { return Number(at) * 1000; }   /* a real change, or the first commit of all */
  }
  return 0;
}
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude']);
/* Places allowed to name NL_STAGING or /staging/: where it is defined,
   tested and written about. */
const DEFINES = [/^system\//, /^tests\//, /^scripts\//, /\.md$/];

export function markerOf(html) {
  const m = String(html).match(/window\.NL_STAGING\s*=\s*\{\s*from:\s*'([0-9a-f]{7,40})'\s*\}/);
  return m ? m[1] : null;
}

function walk(root, dir = '', out = []) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) walk(root, rel, out);
    else if (/\.(html|js|mjs|css|json)$/.test(e.name)) out.push(rel);
  }
  return out;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function check(root, now = Date.now()) {
  const problems = [];
  const files = walk(root);
  for (const f of files) {
    if (f.startsWith('staging/') || DEFINES.some((r) => r.test(f))) continue;
    const text = readFileSync(join(root, f), 'utf8');
    if (/NL_STAGING/.test(text)) problems.push(`${f}: carries NL_STAGING outside staging/ (going live means removing the marker)`);
    if (/\.html$/.test(f) && /["'(]\/staging\//.test(text)) problems.push(`${f}: links to /staging/ (a staging copy is never linked from live)`);
  }
  const copies = files.filter((f) => f.startsWith('staging/') && f.endsWith('/index.html'));
  for (const f of copies) {
    const from = markerOf(readFileSync(join(root, f), 'utf8'));
    const live = f.replace(/^staging\//, '').replace(/\/index\.html$/, '');
    if (!from) { problems.push(`${f}: no window.NL_STAGING = { from: '<sha>' } line`); continue; }
    if (!existsSync(join(root, live))) { problems.push(`${f}: no live folder ${live}/ to stage against`); continue; }
    const top = live.split('/')[0];
    const own = new RegExp(`(?:src|href)=["']/${top}/[^"']*\\.(?:js|css)`, 'g');
    for (const m of readFileSync(join(root, f), 'utf8').match(own) || []) {
      problems.push(`${f}: loads ${m.replace(/^(?:src|href)=["']/, '')} from live; load the tool's own files by relative path`);
    }
    try { git(root, ['cat-file', '-e', from + '^{commit}']); }
    catch { problems.push(`${f}: from ${from} is not a commit here (a shallow clone? the check needs fetch-depth: 0)`); continue; }
    /* A lockstep canon bump (/system/…?v=N) touches every page, live ones
       included, and changes nothing about the tool, so it does not count. */
    try { git(root, ['diff', '--quiet', '-I', BUMP, from, 'HEAD', '--', live + '/']); }
    catch { problems.push(`${f}: ${live}/ has changed since ${from}; bring staging up to date before promoting`); }
    const worked = lastWork(root, f.replace(/index\.html$/, ''));
    const days = Math.floor((now - (worked || now)) / 864e5);
    if (days > MAX_DAYS) problems.push(`${f}: last worked on ${days} days ago; promote it or delete it (limit ${MAX_DAYS})`);
  }
  return { problems, copies: copies.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const strict = process.argv.includes('--strict');
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const { problems, copies } = check(root);
  console.log(`Staging: ${copies} cop${copies === 1 ? 'y' : 'ies'}${problems.length ? ', ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') : ', clean'}.`);
  for (const p of problems) console.log('  ' + p);
  if (strict && problems.length) process.exit(1);
}
