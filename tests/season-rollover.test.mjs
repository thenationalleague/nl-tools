/* The 1 July season job refuses to move the season until it is ready
   (scripts/bump-season.py, 13/11/2026): each division's shape for the new
   year written in competitions-meta (clubs, promoted, play-offs, relegated),
   and exactly that many clubs entered for it in clubs-meta. Moving it early
   would leave every club list empty, because tools ask "which clubs play this
   season?" from each club's own seasons map. Run against copies of the real
   files, never the files themselves. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = new URL('..', import.meta.url).pathname;
const META = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
const COMPS = JSON.parse(readFileSync(join(REPO, 'assets/data/competitions-meta.json'), 'utf8'));
const LEAGUES = ['National', 'North', 'South'];
const CUR = Number(META.seasons.current);
const NEXT = String(CUR + 1);

/* The current season's shape copied to next season, as someone would in June. */
function shaped(comps) {
  const c = structuredClone(comps);
  for (const x of c.competitions) if (x.structure) x.structure[NEXT] = x.structure[String(CUR)];
  return c;
}
function run(meta, ...args) {
  return runWith(meta, shaped(COMPS), ...args);
}
function runWith(meta, comps, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'season-'));
  const file = join(dir, 'clubs-meta.json');
  const cfile = join(dir, 'competitions-meta.json');
  writeFileSync(file, JSON.stringify(meta, null, 2) + '\n');
  writeFileSync(cfile, JSON.stringify(comps, null, 2) + '\n');
  const r = spawnSync('python3', [join(REPO, 'scripts/bump-season.py'), '--file', file, '--comps', cfile, ...args], { encoding: 'utf8' });
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
  assert.match(r.out, /North 23 of 24/);
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

test('no shape for next season: refused, and allow short does not get round it', () => {
  const r = runWith(filled(META), COMPS, '--year', NEXT, '--allow-short');
  assert.equal(r.code, 1);
  assert.match(r.out, /No \d{4}-\d{2} shape in competitions-meta/);
  assert.equal(r.after.seasons.current, String(CUR));
});

/* Every shape written adds up: positions inside the table, play-off places
   between the promoted and the relegated, games a full home and away. */
test('each league has a shape for the current season, and every shape adds up', () => {
  for (const name of LEAGUES) {
    const comp = COMPS.competitions.find((c) => c.competition === name);
    assert.ok(comp && comp.structure && comp.structure[String(CUR)], `${name} has a ${CUR} shape`);
    for (const [year, s] of Object.entries(comp.structure)) {
      const at = `${name} ${year}`;
      assert.ok(Number.isInteger(s.clubs) && s.clubs > 1, `${at}: clubs`);
      assert.equal(s.games, 2 * (s.clubs - 1), `${at}: games is a full home and away`);
      assert.ok(s.promoted >= 0 && s.relegated >= 0 && s.promoted + s.relegated < s.clubs, `${at}: promoted and relegated fit`);
      const [sf1, sf2] = s.playoffs.semiFinal, [qf1, qf2] = s.playoffs.quarterFinal;
      assert.ok(sf1 === s.promoted + 1 && sf1 <= sf2 && qf1 === sf2 + 1 && qf1 <= qf2, `${at}: play-off places follow the promoted`);
      assert.ok(qf2 <= s.clubs - s.relegated, `${at}: play-offs stay clear of relegation`);
      assert.ok(s.playoffWinnersPromoted >= 0, `${at}: play-off winners`);
    }
  }
});
