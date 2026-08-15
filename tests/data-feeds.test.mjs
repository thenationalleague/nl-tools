/* The nightly pipeline's four feeds, which moved from git to Firebase Storage
   on 15/08/2026. Nothing here exercises the pipeline — it needs GA4 credentials
   and a bucket — so these tests pin the wiring around it instead, which is
   where the expensive mistakes are:

     · a feed drifting back into git (36MB a commit, and it took 125 commits
       before anyone noticed the first time);
     · the workflow regaining `contents: write` and starting to commit again;
     · the archive-missing guard being softened, which would silently replace
       an all-time record with 90 days;
     · website-archive being pointed back at the public raw.githubusercontent
       URL, which anyone could read without an account;
     · the Storage rules splitting into rival copies again — there were three
       by August, a month apart, each headed "source of truth".

   All of it is textual. That is the point: these are the facts a reviewer would
   otherwise have to hold in their head across five files. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

const FEEDS = [
  'assets/data/articles-index.json',
  'assets/data/ga-metrics.json',
  'assets/data/ga-hourly.json',
  'assets/data/ga-hourly-archive.json',
];

test('every feed is gitignored', () => {
  const ignore = read('.gitignore');
  for (const f of FEEDS) {
    assert.ok(ignore.includes(f), `${f} is missing from .gitignore`);
  }
});

test('no feed is tracked by git', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'assets/data'], { cwd: REPO })
    .toString().split('\n');
  for (const f of FEEDS) {
    assert.ok(!tracked.includes(f), `${f} is tracked again — it belongs in the bucket`);
  }
});

test('the rebuild workflow cannot write to the repository', () => {
  const wf = read('.github/workflows/rebuild-index.yml');
  assert.match(wf, /permissions:\s*\n\s*contents: read/,
    'rebuild-index.yml should have contents: read — it publishes to Storage, not to git');
  assert.ok(!/git commit/.test(wf), 'rebuild-index.yml is committing again');
  assert.ok(!/git push/.test(wf), 'rebuild-index.yml is pushing again');
});

test('the rebuild workflow round-trips through the bucket', () => {
  const wf = read('.github/workflows/rebuild-index.yml');
  const bucket = 'gs://nl-tools.firebasestorage.app/data';
  assert.ok(wf.includes(bucket), 'the data bucket is not referenced');
  // Pull before the scripts run, publish after: an incremental index build and
  // the archive merge both read what the last run left behind.
  assert.ok(wf.indexOf('Pull the previous feeds') < wf.indexOf('node scripts/rebuild-index.js'),
    'the pull step must come before the scripts that read the files');
  assert.ok(wf.indexOf('node scripts/rebuild-index.js') < wf.indexOf('Publish the feeds'),
    'the publish step must come after the scripts that write the files');
});

test('a missing hourly archive stops the run rather than replacing it', () => {
  const wf = read('.github/workflows/rebuild-index.yml');
  assert.match(wf, /MISSING_ARCHIVE/, 'the archive-missing guard is gone');
  assert.match(wf, /ALLOW_EMPTY_ARCHIVE/,
    'the guard needs an explicit override rather than being removable in a hurry');
});

test('articles-index is uploaded with a download token', () => {
  // getDownloadURL() returns a usable URL only when the object carries this
  // metadata key, and gcloud does not add it.
  const wf = read('.github/workflows/rebuild-index.yml');
  assert.match(wf, /firebaseStorageDownloadTokens=/,
    'without a download token the archive page gets a URL it cannot fetch');
});

test('there is exactly one Storage rules file', () => {
  assert.ok(existsSync(join(REPO, 'system/storage/rules.snapshot.rules')));
  for (const stale of ['storage.rules', 'system/rtdb/storage.rules.snapshot']) {
    assert.ok(!existsSync(join(REPO, stale)),
      `${stale} is back — Storage rules had three rival copies until 15/08/2026`);
  }
});

test('the data/ prefix is readable only by real accounts and writable by none', () => {
  const rules = read('system/storage/rules.snapshot.rules');
  // Slice from the block's opening brace, not from `match` — the path pattern
  // `/data/{file}` contains a closing brace of its own.
  const open = rules.indexOf('{', rules.indexOf('match /data/{file}') + 18);
  const body = rules.slice(open, rules.indexOf('}', open));
  assert.match(body, /allow read:\s*if request\.auth != null && request\.auth\.token\.email != null/,
    'read must require an email claim — anonymous capability sessions must not reach data/');
  assert.match(body, /allow write:\s*if false/,
    'write must be false — uploads come from a service account, which bypasses rules');
});

test('website-archive reads the index from Storage, not from the public repo', () => {
  const page = read('website-archive/index.html');
  assert.ok(!/raw\.githubusercontent\.com[^\n]*articles-index/.test(page),
    'the index is being fetched from the public repository again');
  assert.match(page, /firebase-storage-compat\.js/,
    'getDownloadURL needs the storage compat SDK loaded');
  assert.match(page, /firebase\.storage\(\)\.ref\(INDEX_PATH\)\.getDownloadURL\(\)/);
});

test('the seed workflow exists, because the first run needs a non-empty bucket', () => {
  const wf = read('.github/workflows/seed-data-bucket.yml');
  assert.match(wf, /fetch-depth: 0/, 'it restores from history, so it needs all of it');
  assert.match(wf, /ga-hourly-archive\.json/);
});
