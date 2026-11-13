/* The 1 July season job refuses to move the season until every division has
   its clubs for the new year (scripts/bump-season.py, 13/11/2026). Moving it
   early would leave every club list empty, because tools ask "which clubs
   play this season?" from each club's own seasons map. Run against copies of
   the real clubs-meta, never the file itself. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = new URL('..', import.meta.url).pathname;
const META = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
const CUR = Number(META.seasons.current);
const NEXT = String(CUR + 1);

function run(meta, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'season-'));
  const file = join(dir, 'clubs-meta.json');
  writeFileSync(file, JSON.stringify(meta, null, 2) + '\n');
  const r = spawnSync('python3', [join(REPO, 'scripts/bump-season.py'), '--file', file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr, after: JSON.parse(readFileSync(file, 'utf8')) };
}
/* Every current club carried into next season in the same division. */
function filled(meta, drop = 0) {
  const m = structuredClone(meta);
  let dropped = 0;
  for (const c of m.clubs) {
    const s = c.seasons;
    if (!s || typeof s !== 'object' || !s[String(CUR)]) continue;
    if (dropped < drop && s[String(CUR)] === 'North') { dropped++; continue; }
    s[NEXT] = s[String(CUR)];
  }
  return m;
}

test('the current season is ready, so a check passes', () => {
  const r = run(META, '--check', '--year', String(CUR));
  assert.equal(r.code, 0, r.out);
});

test('no clubs in for next season: the move is refused and nothing is written', () => {
  const r = run(META, '--year', NEXT);
  assert.equal(r.code, 1);
  assert.match(r.out, /Season not moved/);
  assert.equal(r.after.seasons.current, String(CUR));
});

test('one division a club short: still refused', () => {
  const r = run(filled(META, 1), '--year', NEXT);
  assert.equal(r.code, 1);
  assert.match(r.out, /North 23/);
});

test('every club in: the season moves and gains its label', () => {
  const r = run(filled(META), '--year', NEXT);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.after.seasons.current, NEXT);
  assert.ok(r.after.seasons.list[NEXT].label);
});

test('allow short moves it anyway, for a season that really starts a club short', () => {
  const r = run(filled(META, 1), '--year', NEXT, '--allow-short');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.after.seasons.current, NEXT);
});

test('the check never writes', () => {
  const r = run(filled(META), '--check', '--year', NEXT);
  assert.equal(r.code, 0);
  assert.equal(r.after.seasons.current, String(CUR));
});

test('the workflow checks on Mondays in June and only moves on 1 July', () => {
  const wf = readFileSync(join(REPO, '.github/workflows/season-rollover.yml'), 'utf8');
  assert.match(wf, /cron: "0 2 1 7 \*"/);
  assert.match(wf, /cron: "17 7 \* 6 1"/);
  assert.match(wf, /bump-season\.py --check/);
  assert.match(wf, /if: github\.event\.schedule != '17 7 \* 6 1' && !inputs\.check_only/);
});
