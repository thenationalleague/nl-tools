/* The nightly official-table snapshot is one small file per day
   (14/11/2026), written once, instead of one growing file recommitted every
   night (2.8 MB a copy in git). Readers fetch the one date they need. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const u = (p) => new URL('../' + p, import.meta.url);
const read = (p) => readFileSync(u(p), 'utf8');
const DIR = 'assets/data/table-baselines/';
const KEEP = ['teamID', 'team', 'pos', 'P', 'W', 'D', 'L', 'GF', 'GA', 'Pts'];

test('the old single file is gone, and nothing reads it', () => {
  assert.ok(!existsSync(u('assets/data/table-baselines.json')));
  for (const f of ['scripts/build-match-hub-round.js', 'embeds/match-hub.html', '.github/workflows/table-baseline.yml', 'scripts/fetch-table-baseline.js']) {
    /* code, not history: a string naming the old file (changelogs may) */
    assert.doesNotMatch(read(f), /["'`][^"'`\n]*table-baselines\.json/, f);
  }
});

test('one file per day, small, rows holding only what the Match Hub reads', () => {
  const files = readdirSync(u(DIR)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.match(f, /^\d{4}-\d{2}-\d{2}\.json$/);
    assert.ok(statSync(u(DIR + f)).size < 40 * 1024, `${f} is small`);
    const d = JSON.parse(read(DIR + f));
    assert.ok(d.capturedAt && d.season && d.competitions, f);
    const rows = [];
    for (const c of Object.values(d.competitions)) {
      if (c.rows) rows.push(...c.rows);
      if (c.groups) for (const g of Object.values(c.groups)) rows.push(...g.rows);
    }
    for (const r of rows) assert.deepEqual(Object.keys(r), KEEP, f);
  }
});

test('the workflow commits the folder; the hub fetches one date', () => {
  assert.match(read('.github/workflows/table-baseline.yml'), /git add assets\/data\/table-baselines\//);
  assert.match(read('embeds/match-hub.html'), /fetchJSONr\(BASELINE_URL\+o\.date\+"\.json",2\)/);
});
